import test from 'node:test';
import assert from 'node:assert/strict';

import EthashJobManager, {
    boundaryForDifficulty,
    epochOf,
    DEFAULT_EPOCH_LENGTH,
    ETCHASH_EPOCH_LENGTH
} from '../src/ethashJobManager.ts';

/*
 * Ethash job handling: work tracking and share validation.
 *
 * Real work captured from a live VirBiCoin daemon (Gvbc 1.9.38, chain 329)
 * so the shapes are the ones a daemon actually sends.
 */

const WORK: any[] = [
    '0xded75f7eca9e5f37d930dedace3ca48f0de82d261dfa4cd7e549ecac4efb10d7',
    '0xcc55dae5d4738f1350d80a23aed0b0b0049085afc24eca54277a4ce9600ff670',
    '0x000000004809a7a88ee02c52d11948e7796e29be9718d0fb7c669ec638196b2a',
    '0x2624a9'
];

function makeManager(options: any = {}) {
    const jm: any = new (EthashJobManager as any)(options);
    const events: any = { newWork: [], shares: [], logs: [] };
    jm.on('newWork', (w: any) => events.newWork.push(w));
    jm.on('share', (s: any) => events.shares.push(s));
    jm.on('log', (severity: string, message: string) =>
        events.logs.push({ severity, message })
    );
    return { jm, events };
}

test('boundaryForDifficulty scales the 256-bit space', () => {
    // Difficulty 1 is the whole space; doubling it halves the boundary.
    const one = BigInt('0x' + boundaryForDifficulty(1).toString('hex'));
    const two = BigInt('0x' + boundaryForDifficulty(2).toString('hex'));
    assert.equal(boundaryForDifficulty(1).length, 32);
    assert.ok(one > two, 'a harder difficulty must give a lower boundary');
    assert.ok(
        one / two === 2n,
        'the boundary scales inversely with difficulty'
    );

    // Pools hand out fractional difficulties; they must not truncate to zero.
    // Below difficulty 1 the target would exceed the 256-bit space; it must
    // clamp to the maximum instead of wrapping into a tighter boundary.
    const fractional = BigInt(
        '0x' + boundaryForDifficulty(0.5).toString('hex')
    );
    assert.equal(
        fractional,
        one,
        'a sub-1 difficulty clamps to the whole space'
    );
    assert.equal(boundaryForDifficulty(0.5).length, 32);
    assert.throws(() => boundaryForDifficulty(0));
});

test('epoch length follows the chain: Ethash 30000, Etchash 60000', () => {
    assert.equal(epochOf(0), 0);
    assert.equal(epochOf(DEFAULT_EPOCH_LENGTH - 1), 0);
    assert.equal(epochOf(DEFAULT_EPOCH_LENGTH), 1);
    assert.equal(epochOf(2499753), 83);
    // ECIP-1099 halves DAG growth by doubling the epoch length.
    assert.equal(epochOf(2499753, ETCHASH_EPOCH_LENGTH), 41);
});

test('accepts fresh work and ignores a repeat of the same header', () => {
    const { jm, events } = makeManager();

    assert.equal(jm.processWork(WORK), true);
    assert.equal(events.newWork.length, 1);
    assert.equal(jm.currentWork.headerHash, WORK[0]);
    assert.equal(jm.currentWork.seedHash, WORK[1]);
    assert.equal(
        jm.currentWork.height,
        0x2624a9,
        'block number arrives as hex'
    );
    assert.equal(jm.epoch(), 83);

    // The daemon repeats the same work between blocks; that is not a new job.
    assert.equal(jm.processWork(WORK), false);
    assert.equal(events.newWork.length, 1);

    const next = [
        WORK[0].replace('0xde', '0xab'),
        WORK[1],
        WORK[2],
        '0x2624aa'
    ];
    assert.equal(jm.processWork(next), true);
    assert.equal(events.newWork.length, 2);
});

test('reports an unusable eth_getWork response instead of throwing', () => {
    const { jm, events } = makeManager();
    assert.equal(jm.processWork(null), false);
    assert.equal(jm.processWork(['only-one-field']), false);
    assert.equal(events.logs.length, 2);
    assert.match(events.logs[0].message, /eth_getWork/);
});

test('rejects submissions that do not belong to the current work', () => {
    const { jm } = makeManager();
    assert.deepEqual(
        jm.processShare({
            headerHash: WORK[0],
            nonce: '0x1',
            mixHash: '0x' + '22'.repeat(32),
            difficulty: 1
        }).error,
        [21, 'no work available']
    );

    jm.processWork(WORK);
    const stale = jm.processShare({
        headerHash: '0x' + 'ff'.repeat(32),
        nonce: '0x1',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1
    });
    assert.deepEqual(stale.error, [21, 'job not found']);
});

test('rejects malformed nonces and hashes', () => {
    const { jm } = makeManager();
    jm.processWork(WORK);

    const bad = (share: any) =>
        jm.processShare({ headerHash: WORK[0], ...share }).error;
    assert.equal(
        bad({ nonce: 'zz', mixHash: '0x' + '22'.repeat(32), difficulty: 1 })[0],
        20
    );
    assert.equal(
        bad({
            nonce: '0x1',
            mixHash: '0x' + '22'.repeat(40),
            difficulty: 1
        })[0],
        20
    );
    assert.equal(
        bad({
            nonce: '0x' + '11'.repeat(9),
            mixHash: '0x' + '22'.repeat(32),
            difficulty: 1
        })[0],
        20
    );
});

test('rejects a share that misses the miner difficulty', () => {
    const { jm } = makeManager();
    jm.processWork(WORK);

    // An arbitrary mix at mainnet-scale difficulty: the keccak-only check
    // decides this, and it will not pass.
    const result = jm.processShare({
        headerHash: WORK[0],
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e9
    });
    assert.deepEqual(result.error, [23, 'low difficulty share']);
});

test('accepts a share that clears the miner difficulty and reports it', () => {
    const { jm, events } = makeManager();
    jm.processWork(WORK);

    // Difficulty low enough that any hash clears it: this exercises the
    // accept path and the emitted share, not proof-of-work luck.
    const result = jm.processShare({
        headerHash: WORK[0],
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e-9,
        worker: '0xminer.rig1'
    });

    assert.equal(result.error, undefined);
    assert.equal(result.valid, true);
    assert.equal(
        result.isBlockCandidate,
        false,
        'the network boundary is far away'
    );
    assert.equal(events.shares.length, 1);
    assert.equal(events.shares[0].worker, '0xminer.rig1');
    assert.equal(events.shares[0].height, 0x2624a9);
    assert.equal(events.shares[0].headerHash, WORK[0]);
});

test('rejects the same solution submitted twice', () => {
    const { jm } = makeManager();
    jm.processWork(WORK);
    const share = {
        headerHash: WORK[0],
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e-9
    };

    assert.equal(jm.processShare(share).valid, true);
    assert.deepEqual(jm.processShare(share).error, [22, 'duplicate share']);

    // New work clears the ledger: the same nonce is legitimate against it.
    jm.processWork([
        WORK[0].replace('0xde', '0xab'),
        WORK[1],
        WORK[2],
        '0x2624aa'
    ]);
    assert.equal(
        jm.processShare({
            ...share,
            headerHash: WORK[0].replace('0xde', '0xab')
        }).valid,
        true
    );
});

test('a block candidate must survive the cache-backed DAG check', () => {
    // A boundary of all-ff makes every share a "candidate", which forces the
    // full verification — and an invented mix cannot pass it.
    const { jm } = makeManager();
    jm.processWork([WORK[0], WORK[1], '0x' + 'ff'.repeat(32), '0x1']);

    const result = jm.processShare({
        headerHash: WORK[0],
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e-9
    });
    assert.deepEqual(result.error, [23, 'mix hash does not match the DAG']);
});
