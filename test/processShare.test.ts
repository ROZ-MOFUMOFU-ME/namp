import test from 'node:test';
import assert from 'node:assert';

import JobManager from '../src/stratum/jobManager.ts';
import * as util from '../src/stratum/util.ts';

/*
 * Share-validation tests for jobManager.processShare — the path every miner
 * submission takes and the one that decides what gets paid.
 *
 * The `sha256` algorithm hashes with util.sha256d (pure JS), so the whole
 * pipeline (coinbase -> merkle root -> header -> hash -> difficulty) runs
 * without the native addon and without a daemon. Shares are found by scanning
 * nonces, exactly as a miner would; sha256d is deterministic, so each test
 * settles on the same nonce every run.
 */

// Regtest-style bits: an almost-maximal target, so roughly every other nonce
// produces a block candidate. 1e0fffff is ~2^236 — out of reach for a short
// scan, which is what exercises the "share but not a block" path.
const EASY_BITS = '207fffff';
const HARD_BITS = '1e0fffff';

// Reported share difficulty is quantised to 1e-8 (the SCALE in processShare),
// so this is the smallest difficulty a found share can be credited against.
const MIN_DIFFICULTY = 1e-8;

function makeManager(bits: string) {
    const jm: any = new (JobManager as any)({
        instanceId: 1,
        coin: { algorithm: 'sha256' },
        poolAddressScript: Buffer.alloc(25, 0x11),
        recipients: [],
        network: undefined
    });

    // The pool emits share(shareData, blockHex) — the serialized block rides
    // along as a second argument, so both are recorded here.
    const shares: any[] = [];
    jm.on('share', (data: any, blockHex: any) =>
        shares.push({ ...data, blockHex })
    );

    jm.processTemplate({
        bits,
        previousblockhash: '00'.repeat(32),
        height: 1234,
        coinbasevalue: 5000000000,
        curtime: 1000,
        version: 4,
        transactions: []
    });

    return { jm, shares };
}

/** A submission that passes every structural check. */
function validSubmission(jm: any, overrides: Record<string, any> = {}) {
    return {
        jobId: jm.currentJob.jobId,
        previousDifficulty: null,
        difficulty: MIN_DIFFICULTY,
        extraNonce1: '00000000',
        extraNonce2: '00'.repeat(jm.extraNonce2Size),
        nTime: '000003e8', // 1000 == curtime
        nonce: '00000000',
        ipAddress: '127.0.0.1',
        port: 3333,
        workerName: 'worker.1',
        versionMask: undefined,
        isSoloMining: false,
        ...overrides
    };
}

function submit(jm: any, s: any) {
    return jm.processShare(
        s.jobId,
        s.previousDifficulty,
        s.difficulty,
        s.extraNonce1,
        s.extraNonce2,
        s.nTime,
        s.nonce,
        s.ipAddress,
        s.port,
        s.workerName,
        s.versionMask,
        s.isSoloMining
    );
}

/** Scan nonces until a submission is accepted (optionally: until it's a block). */
function mine(
    jm: any,
    shares: any[],
    base: Record<string, any>,
    opts: { block?: boolean; maxTries?: number } = {}
) {
    const maxTries = opts.maxTries ?? 5000;
    for (let n = 0; n < maxTries; n++) {
        const nonce = n.toString(16).padStart(8, '0');
        const result = submit(jm, { ...base, nonce });
        const share = shares[shares.length - 1];
        if (result.result === true && (!opts.block || share.blockHex)) {
            return { result, share, nonce, attempts: n + 1 };
        }
    }
    throw new Error(
        `no ${opts.block ? 'block' : 'share'} found in ${maxTries} nonces`
    );
}

test('accepts a valid share and reports it', () => {
    const { jm, shares } = makeManager(HARD_BITS);
    const { result, share } = mine(jm, shares, validSubmission(jm));

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.result, true);

    assert.strictEqual(share.height, 1234);
    assert.strictEqual(share.blockReward, 5000000000);
    assert.strictEqual(share.worker, 'worker.1');
    assert.strictEqual(share.port, 3333);
    assert.strictEqual(share.difficulty, MIN_DIFFICULTY);
    // shareDiff is emitted as a fixed(8) string.
    assert.ok(Number(share.shareDiff) > 0, 'share difficulty must be reported');
    // HARD_BITS is far out of reach for a short scan: a share, not a block.
    assert.strictEqual(share.blockHash, undefined);
    assert.strictEqual(share.blockHex, undefined);
});

test('rejects malformed submissions before hashing', () => {
    const cases: Array<[string, any, number, RegExp]> = [
        ['extranonce2 too short', { extraNonce2: '00' }, 20, /extranonce2/],
        ['unknown job', { jobId: 'deadbeef' }, 21, /job not found/],
        ['ntime wrong size', { nTime: '0003e8' }, 20, /ntime/],
        ['nonce wrong size', { nonce: '0000' }, 20, /nonce/],
        // curtime is 1000; anything earlier replays a stale template.
        [
            'ntime before curtime',
            { nTime: '000003e7' },
            20,
            /ntime out of range/
        ],
        // More than two hours ahead of now.
        ['ntime too far ahead', { nTime: 'ffffffff' }, 20, /ntime out of range/]
    ];

    for (const [name, overrides, code, message] of cases) {
        const { jm, shares } = makeManager(HARD_BITS);
        const result = submit(jm, validSubmission(jm, overrides));

        assert.strictEqual(result.result, null, name);
        assert.strictEqual(result.error[0], code, name);
        assert.match(result.error[1], message, name);
        // Rejections are still reported so the pool can ban abusive miners.
        assert.strictEqual(shares.length, 1, name);
        assert.strictEqual(shares[0].error, result.error[1], name);
    }
});

test('rejects a duplicate submission of the same share', () => {
    const { jm, shares } = makeManager(HARD_BITS);
    const { nonce } = mine(jm, shares, validSubmission(jm));

    const again = submit(jm, validSubmission(jm, { nonce }));
    assert.strictEqual(again.result, null);
    assert.strictEqual(again.error[0], 22);
    assert.match(again.error[1], /duplicate share/);
});

test('rejects a share below the miner difficulty', () => {
    const { jm, shares } = makeManager(HARD_BITS);
    // Difficulty far above anything a short scan can produce.
    const result = submit(jm, validSubmission(jm, { difficulty: 1e12 }));

    assert.strictEqual(result.result, null);
    assert.strictEqual(result.error[0], 23);
    assert.match(result.error[1], /low difficulty share/);
    assert.strictEqual(shares[0].error, result.error[1]);
});

test('accepts a share that only clears the pre-retarget difficulty', () => {
    // vardiff raised the miner's difficulty while the share was in flight; a
    // share meeting the previous difficulty must still count, credited at it.
    const { jm, shares } = makeManager(HARD_BITS);
    const { share } = mine(
        jm,
        shares,
        validSubmission(jm, {
            difficulty: 1e12,
            previousDifficulty: MIN_DIFFICULTY
        })
    );

    assert.strictEqual(
        share.difficulty,
        MIN_DIFFICULTY,
        'share is credited at the difficulty it actually met'
    );
});

test('reports a block candidate with its hash and serialized block', () => {
    const { jm, shares } = makeManager(EASY_BITS);
    const { share } = mine(jm, shares, validSubmission(jm), { block: true });

    assert.ok(share.blockHash, 'a block candidate must carry its block hash');
    assert.strictEqual(share.blockHash.length, 64);
    assert.match(share.blockHex, /^[0-9a-f]+$/);
    // sha256 declares no blockHasher policy, so the identifier is
    // reverse(hashDigest(header)) — for this algorithm, reverse(sha256d).
    assert.strictEqual(share.blockHash, share.blockHashInvalid);
    // The serialized block starts with the header the hash was taken over.
    const header = share.blockHex.slice(0, 160);
    assert.strictEqual(
        util
            .reverseBuffer(util.sha256d(Buffer.from(header, 'hex')))
            .toString('hex'),
        share.blockHash,
        'block hash must be the hash of the serialized block header'
    );
});

test('the coinbase commits the submitted extranonces', () => {
    // Two miners on the same job build different coinbases (and therefore
    // different merkle roots), which is what keeps their search spaces disjoint.
    const { jm } = makeManager(HARD_BITS);
    const job = jm.currentJob;

    const coinbaseA = job.serializeCoinbase(
        Buffer.from('00000000', 'hex'),
        Buffer.alloc(jm.extraNonce2Size, 0)
    );
    const coinbaseB = job.serializeCoinbase(
        Buffer.from('00000001', 'hex'),
        Buffer.alloc(jm.extraNonce2Size, 0)
    );

    assert.notDeepStrictEqual(coinbaseA, coinbaseB);
    assert.notStrictEqual(
        util.sha256d(coinbaseA).toString('hex'),
        util.sha256d(coinbaseB).toString('hex')
    );
});
