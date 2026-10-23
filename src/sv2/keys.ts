/*
 * The Stratum V2 authority key: a secp256k1 key pair whose public half
 * miners configure (or paste into the stratum2+tcp URL) to authenticate the
 * pool. Both halves travel as Base58Check strings with the little-endian
 * u16 version prefix [1, 0] on the public key, as the specification and
 * the reference implementation write them
 * (9bXiEd8boQVhq7WddEcERUL5tyyJVFYdU8th3HfbNXK3Yw6GRXh is the spec's example).
 */
import crypto from 'node:crypto';
import {
    bytesToBigInt,
    isValidSecretKey,
    randomSecretKey,
    xOnlyPublicKey
} from './secp256k1.ts';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const KEY_VERSION = 1;

export function base58Encode(bytes: Uint8Array): string {
    let n = bytesToBigInt(bytes);
    let out = '';
    while (n > 0n) {
        out = ALPHABET[Number(n % 58n)] + out;
        n /= 58n;
    }
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out = '1' + out;
    return out;
}

export function base58Decode(text: string): Buffer {
    let n = 0n;
    for (const ch of text) {
        const digit = ALPHABET.indexOf(ch);
        if (digit < 0) throw new RangeError(`invalid base58 character '${ch}'`);
        n = n * 58n + BigInt(digit);
    }
    let hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
    let zeros = 0;
    for (const ch of text) {
        if (ch !== '1') break;
        zeros++;
    }
    return Buffer.concat([Buffer.alloc(zeros), body]);
}

function checksum(payload: Uint8Array): Buffer {
    const once = crypto.createHash('sha256').update(payload).digest();
    return crypto.createHash('sha256').update(once).digest().subarray(0, 4);
}

/**
 * Public keys carry the version prefix: Base58Check([1, 0] || key). Secret
 * keys are Base58Check of the bare 32 bytes, as the reference apps write
 * them into their configuration files.
 */
export function encodePublicKey(key: Uint8Array): string {
    if (key.length !== 32) throw new RangeError('key must be 32 bytes');
    const payload = Buffer.concat([Buffer.from([KEY_VERSION, 0]), key]);
    return base58Encode(Buffer.concat([payload, checksum(payload)]));
}

export function decodePublicKey(text: string): Buffer {
    const raw = base58Decode(text.trim());
    if (raw.length !== 38)
        throw new RangeError('public key must decode to 38 bytes');
    const payload = raw.subarray(0, 34);
    if (!checksum(payload).equals(raw.subarray(34)))
        throw new RangeError('bad key checksum');
    const version = payload.readUInt16LE(0);
    if (version !== KEY_VERSION)
        throw new RangeError(`unsupported key version ${version}`);
    return Buffer.from(payload.subarray(2));
}

export function encodeSecretKey(key: Uint8Array): string {
    if (key.length !== 32) throw new RangeError('key must be 32 bytes');
    return base58Encode(Buffer.concat([key, checksum(key)]));
}

export function decodeSecretKey(text: string): Buffer {
    const raw = base58Decode(text.trim());
    if (raw.length !== 36)
        throw new RangeError('secret key must decode to 36 bytes');
    const key = raw.subarray(0, 32);
    if (!checksum(key).equals(raw.subarray(32)))
        throw new RangeError('bad key checksum');
    return Buffer.from(key);
}

export type AuthorityKeyPair = { secretKey: Buffer; publicKey: Buffer };

/** The key pair behind a Base58Check secret key (its public half derived). */
export function authorityFromSecret(encodedSecret: string): AuthorityKeyPair {
    const secretKey = decodeSecretKey(encodedSecret);
    if (!isValidSecretKey(secretKey))
        throw new RangeError('secret key out of range');
    return { secretKey, publicKey: xOnlyPublicKey(secretKey) };
}

export function generateAuthorityKeyPair(): AuthorityKeyPair {
    const secretKey = randomSecretKey();
    return { secretKey, publicKey: xOnlyPublicKey(secretKey) };
}
