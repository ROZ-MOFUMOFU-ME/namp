/*
 * secp256k1 for the Stratum V2 handshake: field and group arithmetic over
 * BigInt, BIP 340 Schnorr signatures (the certificate the pool presents is a
 * Schnorr signature by the authority key) and the x-only ECDH that the
 * Noise NX pattern needs. Node's own ECDH (OpenSSL) does the secret-key
 * operations where it can — scalar multiplication by a private key runs in
 * constant time there — and BigInt arithmetic covers everything OpenSSL has
 * no API for: lifting x coordinates, point subtraction for verification,
 * and the modular field work ElligatorSwift is made of.
 *
 * References: BIP 340 (Schnorr), BIP 324 (ElligatorSwift, x-only ECDH),
 * SEC 2 (the curve).
 */
import crypto from 'node:crypto';

export const P = 2n ** 256n - 2n ** 32n - 977n;
export const N =
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

export type Point = { x: bigint; y: bigint };

/** a mod m, always in [0, m). */
export function mod(a: bigint, m: bigint = P): bigint {
    const r = a % m;
    return r < 0n ? r + m : r;
}

export function modPow(base: bigint, exp: bigint, m: bigint = P): bigint {
    let result = 1n;
    let b = mod(base, m);
    let e = exp;
    while (e > 0n) {
        if (e & 1n) result = (result * b) % m;
        b = (b * b) % m;
        e >>= 1n;
    }
    return result;
}

/** Modular inverse (Fermat; m is prime). */
export function modInv(a: bigint, m: bigint = P): bigint {
    const r = mod(a, m);
    if (r === 0n) throw new RangeError('no inverse of 0');
    return modPow(r, m - 2n, m);
}

/**
 * The square root of a mod p, or null when a is not a square. p = 3 mod 4,
 * so a^((p+1)/4) is a root whenever one exists; the result is itself a
 * square (BIP 324's "the" square root).
 */
export function modSqrt(a: bigint): bigint | null {
    const r = modPow(a, (P + 1n) / 4n);
    return (r * r) % P === mod(a) ? r : null;
}

export function bytesToBigInt(b: Uint8Array): bigint {
    return BigInt('0x' + (Buffer.from(b).toString('hex') || '0'));
}

export function bigIntToBytes(n: bigint, length = 32): Buffer {
    const hex = n.toString(16).padStart(length * 2, '0');
    if (hex.length > length * 2) throw new RangeError('integer too large');
    return Buffer.from(hex, 'hex');
}

// --- group law (Jacobian coordinates; the curve is y^2 = x^3 + 7) ---------

type Jac = { X: bigint; Y: bigint; Z: bigint };
const INF: Jac = { X: 0n, Y: 1n, Z: 0n };

function toJac(p: Point | null): Jac {
    return p === null ? INF : { X: p.x, Y: p.y, Z: 1n };
}

function fromJac(p: Jac): Point | null {
    if (p.Z === 0n) return null;
    const zi = modInv(p.Z);
    const zi2 = (zi * zi) % P;
    return { x: (p.X * zi2) % P, y: (((p.Y * zi2) % P) * zi) % P };
}

function jacDouble(p: Jac): Jac {
    if (p.Z === 0n || p.Y === 0n) return INF;
    const Y2 = (p.Y * p.Y) % P;
    const S = (4n * p.X * Y2) % P;
    const M = (3n * p.X * p.X) % P;
    const X3 = mod(M * M - 2n * S);
    const Y3 = mod(M * (S - X3) - 8n * Y2 * Y2);
    const Z3 = (2n * p.Y * p.Z) % P;
    return { X: X3, Y: Y3, Z: Z3 };
}

function jacAdd(a: Jac, b: Jac): Jac {
    if (a.Z === 0n) return b;
    if (b.Z === 0n) return a;
    const Z1Z1 = (a.Z * a.Z) % P;
    const Z2Z2 = (b.Z * b.Z) % P;
    const U1 = (a.X * Z2Z2) % P;
    const U2 = (b.X * Z1Z1) % P;
    const S1 = (((a.Y * Z2Z2) % P) * b.Z) % P;
    const S2 = (((b.Y * Z1Z1) % P) * a.Z) % P;
    const H = mod(U2 - U1);
    const R = mod(S2 - S1);
    if (H === 0n) return R === 0n ? jacDouble(a) : INF;
    const H2 = (H * H) % P;
    const H3 = (H2 * H) % P;
    const U1H2 = (U1 * H2) % P;
    const X3 = mod(R * R - H3 - 2n * U1H2);
    const Y3 = mod(R * (U1H2 - X3) - S1 * H3);
    const Z3 = (((a.Z * b.Z) % P) * H) % P;
    return { X: X3, Y: Y3, Z: Z3 };
}

export function pointAdd(a: Point | null, b: Point | null): Point | null {
    return fromJac(jacAdd(toJac(a), toJac(b)));
}

export function pointNeg(p: Point | null): Point | null {
    return p === null ? null : { x: p.x, y: mod(-p.y) };
}

export function pointMul(k: bigint, p: Point | null): Point | null {
    let result = INF;
    let addend = toJac(p);
    let scalar = mod(k, N);
    while (scalar > 0n) {
        if (scalar & 1n) result = jacAdd(result, addend);
        addend = jacDouble(addend);
        scalar >>= 1n;
    }
    return fromJac(result);
}

export const G: Point = { x: GX, y: GY };

/** The point with this x coordinate and even y, or null if x is not on the curve. */
export function liftX(x: bigint): Point | null {
    if (x < 0n || x >= P) return null;
    const y = modSqrt(mod(x * x * x + 7n));
    if (y === null) return null;
    return { x, y: y % 2n === 0n ? y : P - y };
}

export function isValidX(x: bigint): boolean {
    return liftX(mod(x)) !== null;
}

export function hasEvenY(p: Point): boolean {
    return p.y % 2n === 0n;
}

// --- native helpers ---------------------------------------------------------

function ecdhWithPrivate(privateKey: Uint8Array): crypto.ECDH {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(privateKey));
    return ecdh;
}

/** sk · G as an affine point (OpenSSL does the multiplication). */
export function publicPoint(privateKey: Uint8Array): Point {
    const uncompressed = ecdhWithPrivate(privateKey).getPublicKey();
    return {
        x: bytesToBigInt(uncompressed.subarray(1, 33)),
        y: bytesToBigInt(uncompressed.subarray(33, 65))
    };
}

/** The x coordinate of sk · lift_x(x) (OpenSSL ECDH on the even-y lift). */
export function ecdhXonly(privateKey: Uint8Array, x: bigint): Buffer {
    if (!isValidX(x)) throw new RangeError('x is not on the curve');
    const compressed = Buffer.concat([Buffer.from([0x02]), bigIntToBytes(x)]);
    return ecdhWithPrivate(privateKey).computeSecret(compressed);
}

/** A uniformly random secret key in [1, n-1]. */
export function randomSecretKey(): Buffer {
    for (;;) {
        const candidate = crypto.randomBytes(32);
        const d = bytesToBigInt(candidate);
        if (d > 0n && d < N) return candidate;
    }
}

export function isValidSecretKey(sk: Uint8Array): boolean {
    if (sk.length !== 32) return false;
    const d = bytesToBigInt(sk);
    return d > 0n && d < N;
}

/** x-only public key (32 bytes) of a secret key. */
export function xOnlyPublicKey(privateKey: Uint8Array): Buffer {
    return bigIntToBytes(publicPoint(privateKey).x);
}

// --- BIP 340 ----------------------------------------------------------------

export function taggedHash(tag: string, ...chunks: Uint8Array[]): Buffer {
    const tagHash = crypto.createHash('sha256').update(tag).digest();
    const h = crypto.createHash('sha256').update(tagHash).update(tagHash);
    for (const chunk of chunks) h.update(chunk);
    return h.digest();
}

/**
 * Schnorr-sign `message` (any length; the pool signs a 32-byte digest) with
 * the secret key, using 32 bytes of auxiliary randomness.
 */
export function schnorrSign(
    privateKey: Uint8Array,
    message: Uint8Array,
    auxRand: Uint8Array = crypto.randomBytes(32)
): Buffer {
    if (!isValidSecretKey(privateKey))
        throw new RangeError('invalid secret key');
    if (auxRand.length !== 32)
        throw new RangeError('aux_rand must be 32 bytes');
    const dPrime = bytesToBigInt(privateKey);
    const Pp = publicPoint(privateKey);
    const d = hasEvenY(Pp) ? dPrime : N - dPrime;
    const pkBytes = bigIntToBytes(Pp.x);
    const t = bigIntToBytes(
        d ^ bytesToBigInt(taggedHash('BIP0340/aux', auxRand))
    );
    const kPrime = mod(
        bytesToBigInt(taggedHash('BIP0340/nonce', t, pkBytes, message)),
        N
    );
    if (kPrime === 0n) throw new Error('nonce derivation failed');
    const R = publicPoint(bigIntToBytes(kPrime));
    const k = hasEvenY(R) ? kPrime : N - kPrime;
    const rBytes = bigIntToBytes(R.x);
    const e = mod(
        bytesToBigInt(
            taggedHash('BIP0340/challenge', rBytes, pkBytes, message)
        ),
        N
    );
    const sig = Buffer.concat([rBytes, bigIntToBytes(mod(k + e * d, N))]);
    if (!schnorrVerify(pkBytes, message, sig))
        throw new Error('signing failed');
    return sig;
}

export function schnorrVerify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): boolean {
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    const Pp = liftX(bytesToBigInt(publicKey));
    if (Pp === null) return false;
    const r = bytesToBigInt(signature.subarray(0, 32));
    const s = bytesToBigInt(signature.subarray(32, 64));
    if (r >= P || s >= N) return false;
    const e = mod(
        bytesToBigInt(
            taggedHash(
                'BIP0340/challenge',
                signature.subarray(0, 32),
                publicKey,
                message
            )
        ),
        N
    );
    const R = pointAdd(pointMul(s, G), pointNeg(pointMul(e, Pp)));
    return R !== null && hasEvenY(R) && R.x === r;
}
