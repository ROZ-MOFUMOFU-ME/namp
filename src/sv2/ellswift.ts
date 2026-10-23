/*
 * ElligatorSwift (BIP 324): the 64-byte encoding of secp256k1 x coordinates
 * that Stratum V2 sends its handshake keys in. Every encoding is
 * indistinguishable from random bytes. The decode direction (xswiftec) is
 * total — any 64 bytes decode to some valid x — and the encode direction
 * (xelligatorswift) draws random (u, case) pairs until the inverse map
 * succeeds, which takes a handful of tries.
 *
 * A direct port of Bitcoin Core's test_framework/crypto/ellswift.py, checked
 * against its test vectors in test/sv2.crypto.test.ts.
 */
import crypto from 'node:crypto';
import {
    P,
    mod,
    modInv,
    modSqrt,
    isValidX,
    bytesToBigInt,
    bigIntToBytes,
    ecdhXonly,
    publicPoint,
    taggedHash
} from './secp256k1.ts';

/** c = sqrt(-3) mod p, the square root that is itself a square. */
const C = 0x0a2d2ba93507f1df233770c2a797962cc61f6d15da14ecd47d8d27ae1cd5f852n;

const div = (a: bigint, b: bigint) => mod(a * modInv(b));

/** Field elements (u, t) to an x coordinate on the curve. */
export function xswiftec(uIn: bigint, tIn: bigint): bigint {
    let u = mod(uIn);
    let t = mod(tIn);
    if (u === 0n) u = 1n;
    if (t === 0n) t = 1n;
    if (mod(u * u * u + t * t + 7n) === 0n) t = mod(2n * t);
    const X = div(mod(u * u * u + 7n - t * t), mod(2n * t));
    const Y = div(mod(X + t), mod(C * u));
    const candidates = [
        mod(u + 4n * Y * Y),
        div(mod(-div(X, Y) - u), 2n),
        div(mod(div(X, Y) - u), 2n)
    ];
    for (const x of candidates) if (isValidX(x)) return x;
    throw new Error('xswiftec: no valid x (unreachable)');
}

/** t such that xswiftec(u, t) = x for the given case (0..7), or null. */
export function xswiftecInv(
    xIn: bigint,
    uIn: bigint,
    caseNo: number
): bigint | null {
    const x = mod(xIn);
    const u = mod(uIn);
    let s: bigint;
    let v: bigint;
    if ((caseNo & 2) === 0) {
        if (isValidX(mod(-x - u))) return null;
        v = x;
        s = mod(-div(mod(u * u * u + 7n), mod(u * u + u * v + v * v)));
    } else {
        s = mod(x - u);
        if (s === 0n) return null;
        const r = modSqrt(
            mod(-s * mod(4n * (u * u * u + 7n) + 3n * s * u * u))
        );
        if (r === null) return null;
        if (caseNo & 1 && r === 0n) return null;
        v = div(mod(-u + div(r, s)), 2n);
    }
    const w = modSqrt(s);
    if (w === null) return null;
    const half = modInv(2n);
    switch (caseNo & 5) {
        case 0:
            return mod(-w * mod(u * mod((1n - C) * half) + v));
        case 1:
            return mod(w * mod(u * mod((1n + C) * half) + v));
        case 4:
            return mod(w * mod(u * mod((1n - C) * half) + v));
        default:
            return mod(-w * mod(u * mod((1n + C) * half) + v));
    }
}

/** A random (u, t) encoding of a valid x coordinate. */
export function xelligatorswift(x: bigint): { u: bigint; t: bigint } {
    if (!isValidX(x)) throw new RangeError('x is not on the curve');
    for (;;) {
        const u = mod(bytesToBigInt(crypto.randomBytes(32)));
        if (u === 0n) continue;
        const caseNo = crypto.randomInt(0, 8);
        const t = xswiftecInv(x, u, caseNo);
        if (t !== null) return { u, t };
    }
}

/** 64 bytes (u || t, big-endian) to the x coordinate they encode. */
export function decode(encoding: Uint8Array): bigint {
    if (encoding.length !== 64)
        throw new RangeError('ellswift encoding must be 64 bytes');
    return xswiftec(
        bytesToBigInt(encoding.subarray(0, 32)),
        bytesToBigInt(encoding.subarray(32, 64))
    );
}

/** The 64-byte ElligatorSwift encoding of a secret key's public key. */
export function encodePublicKey(privateKey: Uint8Array): Buffer {
    const { u, t } = xelligatorswift(publicPoint(privateKey).x);
    return Buffer.concat([bigIntToBytes(u), bigIntToBytes(t)]);
}

/** x(priv · lift_x(decode(theirs))) — BIP 324's ellswift_ecdh_xonly. */
export function ecdhXonlyShared(
    theirs: Uint8Array,
    privateKey: Uint8Array
): Buffer {
    return ecdhXonly(privateKey, decode(theirs));
}

/**
 * The Stratum V2 / BIP 324 shared secret: the x-only ECDH output hashed
 * together with both 64-byte encodings, the initiator's first.
 */
export function sharedSecret(
    privateKey: Uint8Array,
    ours: Uint8Array,
    theirs: Uint8Array,
    initiating: boolean
): Buffer {
    const x = ecdhXonlyShared(theirs, privateKey);
    return initiating
        ? taggedHash('bip324_ellswift_xonly_ecdh', ours, theirs, x)
        : taggedHash('bip324_ellswift_xonly_ecdh', theirs, ours, x);
}
