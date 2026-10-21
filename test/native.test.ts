import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mh = require('../native/index.cjs');

/*
 * The hashing addon as a whole: every export is callable, returns the
 * documented shape and gives the same answer on every call. Where an
 * independent oracle exists — Node's own crypto, an official test vector, a
 * published known answer — the output is checked against it.
 *
 * History this guards against: ten exports once aborted the process on
 * their first call (their sources were never linked), and four returned a
 * different hash on every run (strict-aliasing miscompilation, a bcrypt key
 * schedule that walked past its buffer, a yespower profile that failed its
 * parameter check and returned stack garbage).
 */

const HEADER = Buffer.alloc(80, 0x42);

const HASHERS = [
    'allium',
    'bcrypt',
    'blake',
    'blake2b',
    'blake2s',
    'blake3',
    'c11',
    'fresh',
    'fugue',
    'gost',
    'groestl',
    'groestlmyriad',
    'hefty1',
    'hsr',
    'keccak',
    'lbry',
    'lyra2re',
    'lyra2re2',
    'lyra2rev2',
    'lyra2rev3',
    'lyra2z',
    'lyra2z16m330',
    'lyra2z330',
    'minotaur',
    'nist5',
    'phi1612',
    'quark',
    'qubit',
    'sha1',
    'sha256d',
    'sha512256d',
    'shavite3',
    'skein',
    'skunk',
    'skydoge',
    'tribus',
    'vipstar',
    'whirlpoolx',
    'x11',
    'x13',
    'x15',
    'x16r',
    'x16rt',
    'x16rv2',
    'x16s',
    'x17',
    'x21s',
    'x22i',
    'x25x',
    'xevan',
    'zr5',
    'yespower',
    'yespower_0_5_R8',
    'yespower_0_5_R8G',
    'yespower_0_5_R16',
    'yespower_0_5_R24',
    'yespower_0_5_R32',
    'yespower_arwn',
    'yespower_ic',
    'yespower_iots',
    'yespower_litb',
    'yespower_ltncg',
    'yespower_mgpc',
    'yespower_r16',
    'yespower_sugar',
    'yespower_tide',
    'yespower_urx'
];

const PARAMETERISED: Record<string, any[]> = {
    scrypt: [HEADER, 1024, 1],
    scryptn: [HEADER, 10],
    scryptjane: [HEADER, 1400000000, 1367991200, 4, 30],
    neoscrypt: [HEADER, 0],
    argon2d: [HEADER, 1, 4096, 1],
    argon2i: [HEADER, 1, 4096, 1],
    argon2id: [HEADER, 1, 4096, 1],
    cryptonight: [HEADER, 0],
    cryptonightfast: [HEADER, 0],
    boolberry: [HEADER, Buffer.alloc(256, 0x11), 1],
    odo: [HEADER, 1234],
    kawpow: [Buffer.alloc(32, 0x24), Buffer.alloc(8, 0x11), 0]
};

const VERIFIERS = [
    'ethash_verify_final',
    'ethash_verify',
    'ethash_hash',
    'ethash_final_hash',
    'equihash_verify'
];

test('exports exactly the documented set', () => {
    const exported = Object.keys(mh)
        .filter((k) => typeof mh[k] === 'function')
        .sort();
    const documented = [
        ...HASHERS,
        ...Object.keys(PARAMETERISED),
        ...VERIFIERS
    ].sort();
    assert.deepEqual(exported, documented);
});

test('every hasher returns 32 bytes and the same bytes twice', () => {
    for (const name of HASHERS) {
        // LBRY hashes its 112-byte header and refuses anything shorter.
        const size = name === 'lbry' ? 112 : 80;
        const input = Buffer.alloc(size, 0x42);
        const first = mh[name](input);
        assert.ok(Buffer.isBuffer(first), `${name} returns a Buffer`);
        assert.equal(first.length, 32, `${name} returns 32 bytes`);
        assert.ok(first.equals(mh[name](input)), `${name} is deterministic`);
        assert.ok(
            !first.equals(mh[name](Buffer.alloc(size, 0x43))),
            `${name} depends on its input`
        );
    }
    assert.ok(
        mh.lbry(HEADER).equals(Buffer.alloc(32, 0xff)),
        'lbry fails closed on a short input'
    );
});

test('every parameterised hasher runs with typical arguments', () => {
    for (const [name, args] of Object.entries(PARAMETERISED)) {
        const first = mh[name](...args);
        assert.ok(Buffer.isBuffer(first), `${name} returns a Buffer`);
        assert.equal(first.length, name === 'kawpow' ? 64 : 32, name);
        assert.ok(first.equals(mh[name](...args)), `${name} is deterministic`);
    }
});

test('arguments are checked instead of read past the end', () => {
    assert.throws(() => mh.x11(), /argument/i);
    assert.throws(() => mh.x11('not a buffer'), /buffer/i);
    assert.throws(() => mh.scrypt(HEADER), /N value/);
    assert.throws(() => mh.neoscrypt(Buffer.alloc(40), 0), /80 bytes/);
    assert.throws(
        () => mh.kawpow(Buffer.alloc(31), Buffer.alloc(8), 0),
        /32 bytes/
    );
    assert.throws(
        () =>
            mh.ethash_verify_final(
                Buffer.alloc(32),
                Buffer.alloc(32),
                Buffer.alloc(7),
                Buffer.alloc(32)
            ),
        /8-byte/
    );
});

test('agrees with Node crypto where it implements the same function', () => {
    const sha256 = (b: Buffer) =>
        crypto.createHash('sha256').update(b).digest();
    const sha512_256 = (b: Buffer) =>
        crypto.createHash('sha512-256').update(b).digest();

    assert.ok(mh.sha256d(HEADER).equals(sha256(sha256(HEADER))), 'sha256d');
    assert.ok(
        mh.sha512256d(HEADER).equals(sha512_256(sha512_256(HEADER))),
        'sha512256d'
    );
    assert.ok(
        mh
            .blake2s(HEADER)
            .equals(crypto.createHash('blake2s256').update(HEADER).digest()),
        'blake2s'
    );
    // VIPSTARCOIN hashes its full 181-byte qtum-style header with sha256d.
    const vipsHeader = crypto.randomBytes(181);
    assert.ok(
        mh.vipstar(vipsHeader).equals(sha256(sha256(vipsHeader))),
        'vipstar'
    );
    // scrypt: the input is both password and salt, p = 1, 32 bytes out.
    assert.ok(
        mh
            .scrypt(HEADER, 1024, 1)
            .equals(
                crypto.scryptSync(HEADER, HEADER, 32, { N: 1024, r: 1, p: 1 })
            ),
        'scrypt'
    );
    assert.ok(
        mh
            .scryptn(HEADER, 11)
            .equals(
                crypto.scryptSync(HEADER, HEADER, 32, { N: 2048, r: 1, p: 1 })
            ),
        'scryptn'
    );
});

test('blake3 matches the official test vectors', () => {
    const vectors = require('./vectors/blake3.json');
    for (const c of vectors.cases) {
        const input = Buffer.alloc(c.input_len);
        for (let i = 0; i < c.input_len; i++) input[i] = i % 251;
        assert.equal(
            mh.blake3(input).toString('hex'),
            c.hash.slice(0, 64),
            `blake3 of ${c.input_len} bytes`
        );
    }
});

test('blake2b-256 matches its published known answer', () => {
    assert.equal(
        mh.blake2b(Buffer.from('abc')).toString('hex'),
        'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319'
    );
});
