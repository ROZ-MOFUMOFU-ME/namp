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

/* ---- Published and third-party known answers ---------------------------- */

/** Keccak-p[800, rounds]: 25 lanes of 32 bits; the pool's odo export runs the last 12 of Keccak-f[800]'s 22 rounds. */
function keccakP800(state: Buffer, rounds = 12): Buffer {
    const RC = [
        0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001,
        0x80008081, 0x00008009, 0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
        0x8000808b, 0x0000008b, 0x00008089, 0x00008003, 0x00008002, 0x00000080,
        0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008
    ];
    // rotation offsets by lane x + 5y, reduced modulo the 32-bit lane
    const RHO = [
        0, 1, 30, 28, 27, 4, 12, 6, 23, 20, 3, 10, 11, 25, 7, 9, 13, 15, 21, 8,
        18, 2, 29, 24, 14
    ];
    const rot = (v: number, n: number) =>
        n === 0 ? v : ((v << n) | (v >>> (32 - n))) >>> 0;
    const A = new Uint32Array(25);
    for (let i = 0; i < 25; i++) A[i] = state.readUInt32LE(4 * i);
    for (let r = 22 - rounds; r < 22; r++) {
        const C = new Uint32Array(5);
        for (let x = 0; x < 5; x++)
            C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
        for (let x = 0; x < 5; x++) {
            const d = C[(x + 4) % 5] ^ rot(C[(x + 1) % 5], 1);
            for (let y = 0; y < 5; y++) A[x + 5 * y] ^= d;
        }
        const B = new Uint32Array(25);
        for (let x = 0; x < 5; x++)
            for (let y = 0; y < 5; y++)
                B[y + 5 * ((2 * x + 3 * y) % 5)] = rot(
                    A[x + 5 * y],
                    RHO[x + 5 * y]
                );
        for (let x = 0; x < 5; x++)
            for (let y = 0; y < 5; y++)
                A[x + 5 * y] =
                    (B[x + 5 * y] ^
                        (~B[((x + 1) % 5) + 5 * y] &
                            B[((x + 2) % 5) + 5 * y])) >>>
                    0;
        A[0] = (A[0] ^ RC[r]) >>> 0;
    }
    const out = Buffer.alloc(100);
    for (let i = 0; i < 25; i++) out.writeUInt32LE(A[i], 4 * i);
    return out;
}

test('cryptonight matches the Monero test vectors (variants 0, 1, 2 and 4)', () => {
    const { cases } = require('./vectors/cryptonight.json');
    for (const c of cases) {
        const input = Buffer.from(c.input, 'hex');
        const actual = mh
            .cryptonight(input, c.variant, c.height || 0)
            .toString('hex');
        assert.equal(
            actual,
            c.hash,
            `cryptonight v${c.variant} of ${c.input.slice(0, 16)}…`
        );
    }
});

test('kawpow matches the Ravencoin test vectors', () => {
    const { cases } = require('./vectors/kawpow.json');
    for (const c of cases) {
        const nonce = Buffer.alloc(8);
        nonce.writeBigUInt64LE(BigInt('0x' + c.nonce));
        const out = mh.kawpow(Buffer.from(c.header, 'hex'), nonce, c.block);
        assert.equal(
            out.subarray(0, 32).toString('hex'),
            c.final,
            `kawpow final at block ${c.block}`
        );
        assert.equal(
            out.subarray(32).toString('hex'),
            c.mix,
            `kawpow mix at block ${c.block}`
        );
    }
});

test('odo matches the DigiByte OdoCrypt test vectors', () => {
    // DigiByte's HashOdo: OdoCrypt(key).Encrypt over the 80-byte header in a
    // 100-byte Keccak-p[800] state, a 0x01 pad after it, twelve Keccak-p[800]
    // rounds, first 32 bytes out. DigiByte publishes the Encrypt output; the
    // permutation is reproduced here.
    const { cases } = require('./vectors/odo.json');
    for (const c of cases) {
        const state = Buffer.alloc(100);
        Buffer.from(c.encrypted, 'hex').copy(state);
        state[80] = 1;
        const expected = keccakP800(state).subarray(0, 32).toString('hex');
        assert.equal(
            mh.odo(Buffer.from(c.input, 'hex'), c.key).toString('hex'),
            expected,
            `odo key ${c.key}`
        );
    }
});

test('gost matches the RFC 6986 Streebog-512 example', () => {
    // RFC 6986 writes M1 and the hash as big-endian integers, i.e. with the
    // bytes reversed relative to the message as fed to the function.
    const m1 = Buffer.from(
        '012345678901234567890123456789012345678901234567890123456789012'
    );
    const rfc = Buffer.from(
        '1b54d01a4af5b9d5cc3d86d68d285462b19abc2475222f35c085122be4ba1ffa00ad30f8767b3a82384c6574f024c311e2a481332b08ef7f41797891c1646f48',
        'hex'
    );
    const expected = Buffer.from(rfc).reverse().subarray(0, 32).toString('hex');
    assert.equal(mh.gost(Buffer.from(m1).reverse()).toString('hex'), expected);
});

test('keccak is Keccak-256 (pre-SHA-3 padding): published known answers', () => {
    assert.equal(
        mh.keccak(Buffer.alloc(0)).toString('hex'),
        'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
    assert.equal(
        mh.keccak(Buffer.from('abc')).toString('hex'),
        '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    );
});

test('sha1 is the Sha1coin construction, rebuilt here from Node crypto', () => {
    const sha1 = (b: Buffer) => crypto.createHash('sha1').update(b).digest();
    for (const input of [
        HEADER,
        Buffer.alloc(80, 0x07),
        crypto.randomBytes(80)
    ]) {
        // SHA-1, base64 without padding (26 chars + the leftover bits), then
        // the first 11 chars appended again; 26 overlapping 12-char windows
        // are each SHA-1'd and XORed; the digest sits in the last 20 bytes.
        const b64 = sha1(input).toString('base64').slice(0, 27);
        const str = Buffer.from(b64.slice(0, 26) + b64.slice(0, 11), 'latin1');
        const acc = Buffer.alloc(20);
        for (let i = 0; i < 26; i++) {
            const h = sha1(str.subarray(i, i + 12));
            for (let j = 0; j < 20; j++) acc[j] ^= h[j];
        }
        const expected = Buffer.concat([Buffer.alloc(12), acc]).toString('hex');
        assert.equal(mh.sha1(input).toString('hex'), expected);
    }
});

/* ---- Coverage ----------------------------------------------------------- */

test('every export has a known answer somewhere', () => {
    const covered = new Set<string>();
    const META = new Set(['info', 'strings', 'hex']);
    for (const set of ['set1', 'set2', 'set3'])
        for (const k of Object.keys(require(`./vectors/${set}.json`)))
            if (!META.has(k)) covered.add(k);
    for (const k of Object.keys(require('./vectors/reference.json').answers))
        covered.add(k);
    for (const k of Object.keys(require('./vectors/regression.json').answers))
        covered.add(k);
    // Checked against Node crypto, official or RFC vectors, or a coin's own test suite in this file.
    for (const k of [
        'sha256d',
        'sha512256d',
        'blake2s',
        'blake2b',
        'blake3',
        'scrypt',
        'scryptn',
        'vipstar',
        'gost',
        'keccak',
        'sha1',
        'cryptonight',
        'kawpow',
        'odo'
    ])
        covered.add(k);
    // test/ethash.test.ts (a block sealed by a real geth) and test/equihash.test.ts.
    for (const k of VERIFIERS) covered.add(k);
    const exported = Object.keys(mh).filter((k) => typeof mh[k] === 'function');
    assert.deepEqual(
        exported.filter((k) => !covered.has(k)),
        [],
        'exports without a known answer'
    );
});
