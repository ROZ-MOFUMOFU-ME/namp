/*
 * The Stratum V2 transport security layer: Noise_NX_Secp256k1+EllSwift_
 * ChaChaPoly_SHA256 (specification §4), as the reference implementation's
 * noise-sv2 crate performs it.
 *
 *   initiator -> responder : e                                   64 bytes
 *   responder -> initiator : e, ee, s, es, SIGNATURE_NOISE_MESSAGE 234 bytes
 *
 * The responder's static key is signed by the pool's long-lived authority
 * key (a BIP 340 Schnorr signature over the certificate fields and the
 * static x-only key); the miner knows the authority public key and so
 * authenticates the pool. After the handshake both directions carry SV2
 * frames encrypted with ChaCha20-Poly1305: the 6-byte header on its own
 * (22 bytes on the wire) and the payload in chunks of at most 65519 bytes,
 * each with its 16-byte tag.
 */
import crypto from 'node:crypto';

import * as secp from './secp256k1.ts';
import * as ellswift from './ellswift.ts';

export const PROTOCOL_NAME = 'Noise_NX_Secp256k1+EllSwift_ChaChaPoly_SHA256';
export const CERTIFICATE_VERSION = 0;
export const MAC_LEN = 16;
export const ELLSWIFT_LEN = 64;
export const SIGNATURE_MESSAGE_LEN = 74;
export const HANDSHAKE_MESSAGE_1_LEN = ELLSWIFT_LEN;
export const HANDSHAKE_MESSAGE_2_LEN =
    ELLSWIFT_LEN + (ELLSWIFT_LEN + MAC_LEN) + (SIGNATURE_MESSAGE_LEN + MAC_LEN);
export const FRAME_HEADER_LEN = 6;
export const ENCRYPTED_FRAME_HEADER_LEN = FRAME_HEADER_LEN + MAC_LEN;
export const MAX_CIPHERTEXT_CHUNK = 65535;
export const MAX_PLAINTEXT_CHUNK = MAX_CIPHERTEXT_CHUNK - MAC_LEN;
/** The reference implementation tolerates this much clock skew on certificates. */
export const CERTIFICATE_TIME_LEEWAY = 10;

const EMPTY = Buffer.alloc(0);

function sha256(...chunks: Uint8Array[]): Buffer {
    const h = crypto.createHash('sha256');
    for (const c of chunks) h.update(c);
    return h.digest();
}

function hmac(key: Uint8Array, data: Uint8Array): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
}

/** Noise HKDF with two outputs (RFC 5869 with empty info). */
export function hkdf2(ck: Uint8Array, ikm: Uint8Array): [Buffer, Buffer] {
    const temp = hmac(ck, ikm);
    const out1 = hmac(temp, Buffer.from([0x01]));
    const out2 = hmac(temp, Buffer.concat([out1, Buffer.from([0x02])]));
    return [out1, out2];
}

/** One direction of ChaCha20-Poly1305 with the Noise nonce counter. */
export class CipherState {
    private key: Buffer | null;
    private n = 0n;

    constructor(key: Buffer | null = null) {
        this.key = key;
    }

    hasKey(): boolean {
        return this.key !== null;
    }

    private nonce(): Buffer {
        if (this.n >= 0xffffffffffffffffn) throw new Error('nonce exhausted');
        const nonce = Buffer.alloc(12);
        nonce.writeBigUInt64LE(this.n, 4);
        return nonce;
    }

    encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Buffer {
        if (this.key === null) return Buffer.from(plaintext);
        const cipher = crypto.createCipheriv(
            'chacha20-poly1305',
            this.key,
            this.nonce(),
            {
                authTagLength: MAC_LEN
            }
        );
        cipher.setAAD(ad, { plaintextLength: plaintext.length });
        const out = Buffer.concat([
            cipher.update(plaintext),
            cipher.final(),
            cipher.getAuthTag()
        ]);
        this.n++;
        return out;
    }

    /** Throws on a bad tag; the nonce only advances on success. */
    decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Buffer {
        if (this.key === null) return Buffer.from(ciphertext);
        if (ciphertext.length < MAC_LEN)
            throw new Error('ciphertext shorter than its tag');
        const body = ciphertext.subarray(0, ciphertext.length - MAC_LEN);
        const tag = ciphertext.subarray(ciphertext.length - MAC_LEN);
        const decipher = crypto.createDecipheriv(
            'chacha20-poly1305',
            this.key,
            this.nonce(),
            {
                authTagLength: MAC_LEN
            }
        );
        decipher.setAAD(ad, { plaintextLength: body.length });
        decipher.setAuthTag(tag);
        const out = Buffer.concat([decipher.update(body), decipher.final()]);
        this.n++;
        return out;
    }
}

/** The Noise symmetric state shared by both handshake roles. */
class SymmetricState {
    h: Buffer;
    ck: Buffer;
    cipher = new CipherState();

    constructor() {
        this.ck = sha256(Buffer.from(PROTOCOL_NAME));
        this.h = sha256(this.ck);
    }

    mixHash(data: Uint8Array) {
        this.h = sha256(this.h, data);
    }

    mixKey(ikm: Uint8Array) {
        const [ck, tempK] = hkdf2(this.ck, ikm);
        this.ck = ck;
        this.cipher = new CipherState(tempK);
    }

    encryptAndHash(plaintext: Uint8Array): Buffer {
        const ciphertext = this.cipher.encryptWithAd(this.h, plaintext);
        this.mixHash(ciphertext);
        return ciphertext;
    }

    decryptAndHash(ciphertext: Uint8Array): Buffer {
        const plaintext = this.cipher.decryptWithAd(this.h, ciphertext);
        this.mixHash(ciphertext);
        return plaintext;
    }

    split(): [CipherState, CipherState] {
        const [k1, k2] = hkdf2(this.ck, EMPTY);
        return [new CipherState(k1), new CipherState(k2)];
    }
}

export type Transport = { encryptor: CipherState; decryptor: CipherState };

export type Certificate = {
    version: number;
    validFrom: number;
    notValidAfter: number;
    signature: Buffer;
};

export function serializeCertificate(cert: Certificate): Buffer {
    const out = Buffer.alloc(SIGNATURE_MESSAGE_LEN);
    out.writeUInt16LE(cert.version, 0);
    out.writeUInt32LE(cert.validFrom, 2);
    out.writeUInt32LE(cert.notValidAfter, 6);
    cert.signature.copy(out, 10);
    return out;
}

export function parseCertificate(bytes: Uint8Array): Certificate {
    const b = Buffer.from(bytes);
    if (b.length !== SIGNATURE_MESSAGE_LEN)
        throw new Error('bad certificate length');
    return {
        version: b.readUInt16LE(0),
        validFrom: b.readUInt32LE(2),
        notValidAfter: b.readUInt32LE(6),
        signature: Buffer.from(b.subarray(10))
    };
}

/** SHA-256 of version || valid_from || not_valid_after || static x-only key: what the authority signs. */
function certificateDigest(
    fields: Uint8Array,
    staticXonly: Uint8Array
): Buffer {
    return sha256(fields.subarray(0, 10), staticXonly);
}

export function signCertificate(
    authoritySecretKey: Uint8Array,
    staticXonly: Uint8Array,
    validFrom: number,
    notValidAfter: number
): Buffer {
    const fields = serializeCertificate({
        version: CERTIFICATE_VERSION,
        validFrom,
        notValidAfter,
        signature: Buffer.alloc(64)
    });
    const signature = secp.schnorrSign(
        authoritySecretKey,
        certificateDigest(fields, staticXonly)
    );
    signature.copy(fields, 10);
    return fields;
}

export function verifyCertificate(
    cert: Certificate,
    staticXonly: Uint8Array,
    authorityPublicKey: Uint8Array,
    now: number
): boolean {
    if (cert.version !== CERTIFICATE_VERSION) return false;
    if (cert.validFrom - CERTIFICATE_TIME_LEEWAY > now) return false;
    if (cert.notValidAfter + CERTIFICATE_TIME_LEEWAY < now) return false;
    const fields = serializeCertificate(cert);
    return secp.schnorrVerify(
        authorityPublicKey,
        certificateDigest(fields, staticXonly),
        cert.signature
    );
}

export type Authority = { secretKey: Uint8Array; publicKey: Uint8Array };

/**
 * The pool side of the handshake. One instance per connection: it holds a
 * fresh ephemeral key and a fresh static key (the reference implementation
 * also generates the static key per responder) and answers the initiator's
 * 64 bytes with the 234-byte second message.
 */
export class Responder {
    private authority: Authority;
    private certificateValiditySeconds: number;

    constructor(authority: Authority, certificateValiditySeconds: number) {
        this.authority = authority;
        this.certificateValiditySeconds = certificateValiditySeconds;
    }

    respond(
        message1: Uint8Array,
        now = Math.floor(Date.now() / 1000)
    ): { message2: Buffer; transport: Transport } {
        if (message1.length !== HANDSHAKE_MESSAGE_1_LEN)
            throw new Error('bad handshake message length');
        const state = new SymmetricState();
        const re = Buffer.from(message1);
        state.mixHash(re);
        state.mixHash(EMPTY); // the initiator's empty payload

        const e = secp.randomSecretKey();
        const eEll = ellswift.encodePublicKey(e);
        state.mixHash(eEll);
        state.mixKey(ellswift.sharedSecret(e, eEll, re, false));

        const s = secp.randomSecretKey();
        const sEll = ellswift.encodePublicKey(s);
        const encryptedStatic = state.encryptAndHash(sEll);
        state.mixKey(ellswift.sharedSecret(s, sEll, re, false));

        const certificate = signCertificate(
            this.authority.secretKey,
            secp.xOnlyPublicKey(s),
            now,
            now + this.certificateValiditySeconds
        );
        const encryptedCertificate = state.encryptAndHash(certificate);

        const [c1, c2] = state.split();
        return {
            message2: Buffer.concat([
                eEll,
                encryptedStatic,
                encryptedCertificate
            ]),
            transport: { encryptor: c2, decryptor: c1 }
        };
    }
}

/** The miner side; the tests and any future proxy use it. */
export class Initiator {
    private state = new SymmetricState();
    private e = secp.randomSecretKey();
    private eEll = ellswift.encodePublicKey(this.e);

    /** Message 1: the ephemeral key, in the clear. */
    start(): Buffer {
        this.state.mixHash(this.eEll);
        this.state.mixHash(EMPTY);
        return Buffer.from(this.eEll);
    }

    /**
     * Message 2 in, transport out. With an authority key the certificate is
     * verified (and the static key it covers); without one the pool is
     * trusted blindly, which only tests should do.
     */
    finish(
        message2: Uint8Array,
        authorityPublicKey: Uint8Array | null,
        now = Math.floor(Date.now() / 1000)
    ): Transport {
        if (message2.length !== HANDSHAKE_MESSAGE_2_LEN)
            throw new Error('bad handshake message length');
        const re = Buffer.from(message2.subarray(0, ELLSWIFT_LEN));
        this.state.mixHash(re);
        this.state.mixKey(ellswift.sharedSecret(this.e, this.eEll, re, true));
        const rsEll = this.state.decryptAndHash(
            message2.subarray(ELLSWIFT_LEN, ELLSWIFT_LEN * 2 + MAC_LEN)
        );
        this.state.mixKey(
            ellswift.sharedSecret(this.e, this.eEll, rsEll, true)
        );
        const certificate = parseCertificate(
            this.state.decryptAndHash(
                message2.subarray(ELLSWIFT_LEN * 2 + MAC_LEN)
            )
        );
        if (authorityPublicKey !== null) {
            const staticXonly = secp.bigIntToBytes(ellswift.decode(rsEll));
            if (
                !verifyCertificate(
                    certificate,
                    staticXonly,
                    authorityPublicKey,
                    now
                )
            )
                throw new Error('pool certificate rejected');
        }
        const [c1, c2] = this.state.split();
        return { encryptor: c1, decryptor: c2 };
    }
}

/** Ciphertext length of a payload of `plaintextLength` bytes. */
export function encryptedPayloadLength(plaintextLength: number): number {
    const full = Math.floor(plaintextLength / MAX_PLAINTEXT_CHUNK);
    const rest = plaintextLength % MAX_PLAINTEXT_CHUNK;
    return full * MAX_CIPHERTEXT_CHUNK + (rest > 0 ? rest + MAC_LEN : 0);
}

/** A plaintext frame (6-byte header + payload) to its encrypted form. */
export function encryptFrame(
    encryptor: CipherState,
    frame: Uint8Array
): Buffer {
    if (frame.length < FRAME_HEADER_LEN)
        throw new Error('frame shorter than its header');
    const parts = [
        encryptor.encryptWithAd(EMPTY, frame.subarray(0, FRAME_HEADER_LEN))
    ];
    for (
        let start = FRAME_HEADER_LEN;
        start < frame.length;
        start += MAX_PLAINTEXT_CHUNK
    ) {
        parts.push(
            encryptor.encryptWithAd(
                EMPTY,
                frame.subarray(
                    start,
                    Math.min(start + MAX_PLAINTEXT_CHUNK, frame.length)
                )
            )
        );
    }
    return Buffer.concat(parts);
}

/**
 * Reassembles and decrypts frames from a byte stream. push() returns every
 * complete plaintext frame the new bytes completed; a bad tag throws and
 * the connection must be dropped.
 */
export class FrameDecryptor {
    private buffer = Buffer.alloc(0);
    private header: Buffer | null = null;
    private payloadLength = 0;
    private decryptor: CipherState;

    constructor(decryptor: CipherState) {
        this.decryptor = decryptor;
    }

    push(data: Uint8Array): Buffer[] {
        this.buffer = this.buffer.length
            ? Buffer.concat([this.buffer, data])
            : Buffer.from(data);
        const frames: Buffer[] = [];
        for (;;) {
            if (this.header === null) {
                if (this.buffer.length < ENCRYPTED_FRAME_HEADER_LEN) break;
                this.header = this.decryptor.decryptWithAd(
                    EMPTY,
                    this.buffer.subarray(0, ENCRYPTED_FRAME_HEADER_LEN)
                );
                this.buffer = this.buffer.subarray(ENCRYPTED_FRAME_HEADER_LEN);
                this.payloadLength = this.header.readUIntLE(3, 3);
            }
            const need = encryptedPayloadLength(this.payloadLength);
            if (this.buffer.length < need) break;
            const chunks: Buffer[] = [this.header];
            for (let start = 0; start < need; start += MAX_CIPHERTEXT_CHUNK) {
                chunks.push(
                    this.decryptor.decryptWithAd(
                        EMPTY,
                        this.buffer.subarray(
                            start,
                            Math.min(start + MAX_CIPHERTEXT_CHUNK, need)
                        )
                    )
                );
            }
            this.buffer = this.buffer.subarray(need);
            this.header = null;
            frames.push(Buffer.concat(chunks));
        }
        return frames;
    }
}
