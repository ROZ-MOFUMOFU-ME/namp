import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const multiHashing = require('../native/index.cjs');

/*
 * Known-answer vectors for the one-buffer hashers.
 *
 * Three sets inherited from node-multi-hashing (set1: short strings, set2:
 * 80-byte strings, set3: 120-byte strings; CC0, 2020) plus the files this
 * repository added in the 2026 audit:
 *
 *   reference.json  answers from an independent implementation
 *                   (cpuminer-multi / cpuminer-opt built standalone)
 *   regression.json the addon's own answers, recorded for the exports that
 *                   have no external reference
 *
 * Exports whose arguments are not a single buffer are called the way the
 * answers were produced (see `special` below and the notes in each file).
 * Every stored answer is checked; nothing is skipped. The oracle tests
 * (Node's crypto, Monero, Ravencoin, DigiByte, RFC and official vectors)
 * live in test/native.test.ts, and that file also asserts that every export
 * is covered by one of these sources.
 */

const META = new Set(['info', 'strings', 'exclude-algos', 'hex']);
const pad = Buffer.alloc(64);
pad.fill('deadbeef');

// How the inherited sets called the exports that take parameters.
const special: Record<string, (b: Buffer, i: number) => Buffer> = {
    argon2d: (b: Buffer) => multiHashing.argon2d(b, 1, 250, 4),
    argon2i: (b: Buffer) => multiHashing.argon2i(b, 1, 250, 4),
    argon2id: (b: Buffer) => multiHashing.argon2id(b, 1, 250, 4),
    boolberry: (b: Buffer, i: number) =>
        multiHashing.boolberry(b, pad, 1233320 + i),
    neoscrypt: (b: Buffer) => multiHashing.neoscrypt(b, 0),
    scrypt: (b: Buffer) => multiHashing.scrypt(b, 10, 20)
};

function hex(buffer: Buffer) {
    return buffer.toString('hex');
}

for (const set of ['set1', 'set2', 'set3']) {
    const vectors = require(`./vectors/${set}.json`);
    const inputs = vectors.hex.map((h: string) => Buffer.from(h, 'hex'));

    test(`${set}: ${vectors.info.description}`, () => {
        for (const algo of Object.keys(vectors)) {
            if (META.has(algo)) continue;
            const stored = vectors[algo];
            if (algo === 'cryptonight') {
                // Variants 0..4; variant 4 needs the block height.
                for (const variant of Object.keys(stored)) {
                    assert.deepStrictEqual(
                        inputs.map((b: Buffer, i: number) =>
                            hex(
                                multiHashing.cryptonight(
                                    b,
                                    Number(variant),
                                    1806260 + i
                                )
                            )
                        ),
                        stored[variant],
                        `${set} cryptonight variant ${variant}`
                    );
                }
                continue;
            }
            if (algo === 'cryptonightfast') {
                // "0" was recorded with the fast flag, "1" with variant 1.
                for (const variant of Object.keys(stored)) {
                    const arg = variant === '0' ? true : Number(variant);
                    assert.deepStrictEqual(
                        inputs.map((b: Buffer) =>
                            hex(multiHashing.cryptonightfast(b, arg))
                        ),
                        stored[variant],
                        `${set} cryptonightfast ${variant}`
                    );
                }
                continue;
            }
            const call =
                special[algo] || ((b: Buffer) => multiHashing[algo](b));
            assert.deepStrictEqual(
                inputs.map((b: Buffer, i: number) => hex(call(b, i))),
                stored,
                `${set} ${algo}`
            );
        }
    });
}

test('reference.json: answers from an independent implementation', () => {
    const ref = require('./vectors/reference.json');
    const in80 = ref.inputs80.map((h: string) => Buffer.from(h, 'hex'));
    const in112 = ref.inputs112.map((h: string) => Buffer.from(h, 'hex'));
    for (const [algo, answers] of Object.entries(ref.answers)) {
        let actual: string[];
        if (algo === 'lbry')
            actual = in112.map((b: Buffer) => hex(multiHashing.lbry(b)));
        else if (algo === 'neoscrypt')
            actual = in80.map((b: Buffer) =>
                hex(multiHashing.neoscrypt(b, 0x80000620))
            );
        else if (algo === 'zr5')
            actual = in80.map((b: Buffer) => {
                const header = Buffer.from(b);
                header[1] &= 0x7f;
                header[2] = 0;
                header[3] = 0;
                return hex(multiHashing.zr5(header));
            });
        else actual = in80.map((b: Buffer) => hex(multiHashing[algo](b)));
        assert.deepStrictEqual(actual, answers, `reference ${algo}`);
    }
});

test('regression.json: the addon agrees with its recorded self', () => {
    const ref = require('./vectors/reference.json');
    const reg = require('./vectors/regression.json');
    const in80 = ref.inputs80.map((h: string) => Buffer.from(h, 'hex'));
    const a = reg.answers;
    for (const [algo, answers] of Object.entries(a)) {
        if (Array.isArray(answers)) {
            assert.deepStrictEqual(
                in80.map((b: Buffer) => hex(multiHashing[algo](b))),
                answers,
                `regression ${algo}`
            );
        }
    }
    const scratchpad = Buffer.from(a.boolberry.scratchpad, 'hex');
    assert.deepStrictEqual(
        in80.map((b: Buffer, i: number) =>
            hex(multiHashing.boolberry(b, scratchpad, a.boolberry.height + i))
        ),
        a.boolberry.hashes,
        'regression boolberry'
    );
    const j = a.scryptjane;
    assert.deepStrictEqual(
        in80.map((b: Buffer) =>
            hex(
                multiHashing.scryptjane(
                    b,
                    j.timestamp,
                    j.nChainStartTime,
                    j.nMin,
                    j.nMax
                )
            )
        ),
        j.hashes,
        'regression scryptjane'
    );
    assert.deepStrictEqual(
        in80.map((b: Buffer) => hex(multiHashing.cryptonightfast(b, true))),
        a.cryptonightfast.fast,
        'regression cryptonightfast fast'
    );
    assert.deepStrictEqual(
        in80.map((b: Buffer) => hex(multiHashing.cryptonightfast(b, 0))),
        a.cryptonightfast.variant0,
        'regression cryptonightfast 0'
    );
    assert.deepStrictEqual(
        in80.map((b: Buffer) => hex(multiHashing.cryptonightfast(b, 1))),
        a.cryptonightfast.variant1,
        'regression cryptonightfast 1'
    );
    assert.deepStrictEqual(
        in80.map((b: Buffer) => hex(multiHashing.cryptonight(b, 3))),
        a.cryptonight.variant3,
        'regression cryptonight 3'
    );
    assert.deepStrictEqual(
        in80.map((b: Buffer) =>
            hex(multiHashing.scryptn(b, a.scryptn.nFactor))
        ),
        a.scryptn.hashes,
        'regression scryptn'
    );
});
