import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import * as secp from '../src/sv2/secp256k1.ts';
import * as ellswift from '../src/sv2/ellswift.ts';
import * as keys from '../src/sv2/keys.ts';

/*
 * The handshake cryptography against the official vectors: BIP 340
 * (Schnorr) from the BIPs repository, BIP 324 (ElligatorSwift) from
 * Bitcoin Core's test framework, and the Stratum V2 specification's
 * Base58Check example.
 */

function csv(file: string): Record<string, string>[] {
    const [head, ...rows] = fs
        .readFileSync(`test/vectors/${file}`, 'utf8')
        .trim()
        .split('\n');
    const cols = head.split(',');
    return rows.map((r) => {
        const cells = r.split(',');
        const row: Record<string, string> = {};
        cols.forEach((c, i) => (row[c] = cells[i] ?? ''));
        return row;
    });
}

test('BIP 340: every signing and verification vector', () => {
    for (const v of csv('bip340.csv')) {
        const pk = Buffer.from(v['public key'], 'hex');
        const msg = Buffer.from(v.message, 'hex');
        const sig = Buffer.from(v.signature, 'hex');
        if (v['secret key']) {
            const produced = secp.schnorrSign(
                Buffer.from(v['secret key'], 'hex'),
                msg,
                Buffer.from(v.aux_rand, 'hex')
            );
            assert.equal(
                produced.toString('hex'),
                sig.toString('hex'),
                `vector ${v.index}`
            );
        }
        assert.equal(
            secp.schnorrVerify(pk, msg, sig),
            v['verification result'] === 'TRUE',
            `vector ${v.index}: ${v.comment}`
        );
    }
});

test('BIP 324: ellswift decoding vectors', () => {
    for (const v of csv('ellswift_decode.csv')) {
        const x = ellswift.decode(Buffer.from(v.ellswift, 'hex'));
        assert.equal(x.toString(16).padStart(64, '0'), v.x, v.comment);
    }
});

test('BIP 324: xswiftec_inv vectors, all eight cases', () => {
    for (const v of csv('xswiftec_inv.csv')) {
        const u = BigInt('0x' + v.u);
        const x = BigInt('0x' + v.x);
        for (let c = 0; c < 8; c++) {
            const t = ellswift.xswiftecInv(x, u, c);
            const want = v[`case${c}_t`];
            if (t === null) assert.equal(want, '', `${v.comment} case ${c}`);
            else {
                assert.equal(
                    t.toString(16).padStart(64, '0'),
                    want,
                    `${v.comment} case ${c}`
                );
                assert.equal(ellswift.xswiftec(u, t), x);
            }
        }
    }
});

test('ellswift encodings decode to the key they encode, and ECDH agrees', () => {
    for (let i = 0; i < 8; i++) {
        const a = secp.randomSecretKey();
        const b = secp.randomSecretKey();
        const ea = ellswift.encodePublicKey(a);
        const eb = ellswift.encodePublicKey(b);
        assert.equal(ea.length, 64);
        assert.equal(ellswift.decode(ea), secp.publicPoint(a).x);
        assert.equal(ellswift.decode(eb), secp.publicPoint(b).x);
        // the x-only shared point, from OpenSSL on one side and BigInt on the other
        const native = ellswift.ecdhXonlyShared(eb, a);
        const lifted = secp.pointMul(
            secp.bytesToBigInt(b),
            secp.liftX(secp.publicPoint(a).x)
        );
        assert.equal(
            native.toString('hex'),
            secp.bigIntToBytes(lifted!.x).toString('hex')
        );
        assert.equal(
            ellswift.sharedSecret(a, ea, eb, true).toString('hex'),
            ellswift.sharedSecret(b, eb, ea, false).toString('hex')
        );
    }
});

test('Base58Check keys: the specification example and round trips', () => {
    const raw = Buffer.from([
        118, 99, 112, 0, 151, 156, 28, 17, 175, 12, 48, 11, 205, 140, 127, 228,
        134, 16, 252, 233, 185, 193, 30, 61, 174, 227, 90, 224, 176, 138, 116,
        85
    ]);
    const encoded = '9bXiEd8boQVhq7WddEcERUL5tyyJVFYdU8th3HfbNXK3Yw6GRXh';
    assert.equal(keys.encodePublicKey(raw), encoded);
    assert.deepEqual(keys.decodePublicKey(encoded), raw);
    assert.throws(
        () => keys.decodePublicKey(encoded.replace('X', 'Y')),
        /checksum/
    );

    const pair = keys.generateAuthorityKeyPair();
    const again = keys.authorityFromSecret(
        keys.encodeSecretKey(pair.secretKey)
    );
    assert.deepEqual(again.secretKey, pair.secretKey);
    assert.deepEqual(again.publicKey, pair.publicKey);
    assert.equal(keys.encodeSecretKey(pair.secretKey).length <= 50, true);
    // The public half is the x-only key of a Schnorr signature anyone can check.
    const sig = secp.schnorrSign(pair.secretKey, crypto.randomBytes(32));
    assert.equal(sig.length, 64);
});
