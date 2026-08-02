import test from 'node:test';
import assert from 'node:assert';

import algos, { getBlockHasher, getCoinbaseHasher } from '../src/algoProperties.ts';
import * as util from '../src/util.ts';

/*
 * Equivalence oracle for the hasher-selection refactor.
 *
 * The coinbase/block hashers used to be two switch statements inside
 * jobManager, listing algorithm names by hand next to the table in
 * algoProperties. They are now declared per algorithm in that table and
 * resolved by getCoinbaseHasher / getBlockHasher. These tests reimplement the
 * old switches verbatim and assert that the new resolution produces the same
 * hash for every algorithm the pool knows, under every relevant coin flag.
 *
 * One deliberate difference is asserted separately below: non-POS scrypt.
 */

const SCRYPT_POW_FAMILY = ['scrypt', 'scrypt-og', 'scrypt-jane'];

function oldCoinbaseHasher(coin: any) {
    switch (coin.algorithm) {
        case 'keccak':
        case 'blake':
        case 'fugue':
        case 'groestl':
            if (coin.normalHashing === true) return util.sha256d;
            else return util.sha256;
        default:
            return util.sha256d;
    }
}

function oldBlockHasher(coin: any, hashDigest: (...args: any[]) => Buffer) {
    switch (coin.algorithm) {
        case 'blake':
        case 'blake2s':
        case 'neoscrypt':
        case 'lyra2':
        case 'lyra2re2':
        case 'allium':
        case 'lyra2v2':
        case 'lyra2v3':
        case 'qubit':
        case 'skein':
        case 'x11':
        case 'x16r':
        case 'x16rv2':
        case 'x17':
        case 'odo':
        case 'minotaur':
        case 'groestl':
        case 'groestlmyriad':
            return function (this: any, ...args: any[]) {
                return util.reverseBuffer((util.sha256d as any).apply(this, args));
            };
        case 'lyra2rev2':
            return function (this: any, ...args: any[]) {
                return util.reverseBuffer(hashDigest.apply(this, args));
            };
        case 'scrypt':
        case 'scrypt-og':
        case 'scrypt-jane':
            if (coin.reward === 'POS') {
                return function (this: any, ...args: any[]) {
                    return util.reverseBuffer(hashDigest.apply(this, args));
                };
            }
            // Non-POS fell out of the switch and yielded `undefined`; see the
            // dedicated test below.
            return undefined;
        case 'scrypt-n':
        case 'sha1':
        case 'yespowerSUGAR':
        case 'yescryptR8G':
        case 'yespowerLTNCG':
        case 'yescryptR16':
        case 'yespowerR16':
        case 'vipstar':
            return function (_d: any) {
                return util.reverseBuffer(util.sha256d(_d));
            };
        default:
            return function (this: any, ...args: any[]) {
                return util.reverseBuffer(hashDigest.apply(this, args));
            };
    }
}

// A stand-in for the algorithm's PoW hasher: deterministic, and distinct from
// sha256d so a wrong branch cannot accidentally produce a matching hash.
const fakeDigest = (data: Buffer) => util.sha256(Buffer.concat([data, Buffer.from([0xab])]));

const header = Buffer.alloc(80, 7);
const nTime = 0x5f5e100;
const algoNames = Object.keys(algos);

test('every algorithm resolves the same coinbase hasher as the old switch', () => {
    assert.ok(algoNames.length > 40, 'algorithm table looks truncated');
    for (const algorithm of algoNames) {
        for (const normalHashing of [true, false, undefined]) {
            const coin = { algorithm, normalHashing };
            assert.deepStrictEqual(
                getCoinbaseHasher(coin)(header),
                oldCoinbaseHasher(coin)(header),
                `${algorithm} (normalHashing=${normalHashing})`
            );
        }
    }
});

test('every algorithm resolves the same block hasher as the old switch', () => {
    for (const algorithm of algoNames) {
        for (const reward of ['POS', 'POW']) {
            if (reward !== 'POS' && SCRYPT_POW_FAMILY.includes(algorithm)) continue;
            const coin = { algorithm, reward };
            const expected = oldBlockHasher(coin, fakeDigest);
            assert.ok(expected, `${algorithm} (${reward}) oracle produced no hasher`);
            assert.deepStrictEqual(
                getBlockHasher(coin, fakeDigest)(header, nTime),
                expected(header, nTime),
                `${algorithm} (${reward})`
            );
        }
    }
});

test('non-POS scrypt now hashes blocks instead of crashing', () => {
    // The old switch `break`ed here and returned undefined, so the first share
    // on a scrypt/scrypt-og/scrypt-jane PoW pool threw "blockHasher is not a
    // function". Upstream NOMP fell through to the sha256d group; that is what
    // the 'posDigest' policy now does.
    for (const algorithm of SCRYPT_POW_FAMILY) {
        assert.strictEqual(oldBlockHasher({ algorithm, reward: 'POW' }, fakeDigest), undefined);
        const hasher = getBlockHasher({ algorithm, reward: 'POW' }, fakeDigest);
        assert.deepStrictEqual(
            hasher(header, nTime),
            util.reverseBuffer(util.sha256d(header)),
            algorithm
        );
    }
});

test('the algorithm table keeps its multipliers and diffs', () => {
    assert.strictEqual(algos.sha256.multiplier, 1);
    assert.strictEqual(algos.scrypt.multiplier, Math.pow(2, 16));
    assert.strictEqual(algos.x16r.multiplier, Math.pow(2, 8));
    assert.strictEqual(algos.lyra2re.multiplier, Math.pow(2, 7));
    assert.strictEqual(algos.yespower.multiplier, 65536);
    assert.strictEqual(algos.neoscrypt.multiplier, Math.pow(2, 5));
    // Algorithms without an explicit multiplier default to 1.
    assert.strictEqual(algos.x11.multiplier, 1);
    assert.strictEqual(algos.vipstar.multiplier, 1);
    // The yescrypt family carries a hardcoded truncated diff.
    for (const algo of ['yescryptR8', 'yescryptR8G', 'yescryptR16', 'yescryptR24', 'yescryptR32']) {
        assert.strictEqual(algos[algo].diff, algos.yescryptR8.diff, `${algo} lost its diff`);
    }
});

test('pass-through algorithms still bind their multi-hashing export', () => {
    // Cheap structural check that survives without the native addon loaded:
    // every entry exposes hash(coinConfig) returning a function.
    for (const algorithm of algoNames) {
        const hasher = algos[algorithm].hash({});
        assert.strictEqual(
            typeof hasher,
            'function',
            `${algorithm}.hash() did not return a function`
        );
    }
});
