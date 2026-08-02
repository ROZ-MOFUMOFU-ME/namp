import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from 'redis';

import ShareProcessor from '../src/shareProcessor.ts';

/*
 * Integration tests for shareProcessor against a real Redis.
 *
 * Everything a miner earns starts here: handleShare turns each accepted
 * submission into the Redis writes the payment processor later reads. Only
 * pure logic was covered before, so a wrong key name or a lost round could not
 * be caught by the suite.
 *
 * Needs a Redis on REDIS_TEST_PORT (default 6399); the tests skip when none is
 * reachable, so `npm test` still works on a machine without one. CI runs a
 * redis service, so the coverage is real there.
 */

const PORT = Number(process.env.REDIS_TEST_PORT || 6399);
const HOST = process.env.REDIS_TEST_HOST || '127.0.0.1';
const COIN = 'testcoin';

let redis: any;
let available = false;

const silentLogger: any = {
    debug: () => {},
    warning: () => {},
    error: () => {},
    special: () => {}
};

// Each processor opens its own Redis connection; they are closed in after()
// so the test process can exit on its own.
const processors: any[] = [];

function makeProcessor(paymentMode?: string, extra: any = {}) {
    const processor: any = new (ShareProcessor as any)(silentLogger, {
        coin: { name: COIN, symbol: 'TST' },
        redis: { host: HOST, port: PORT },
        paymentProcessing: paymentMode ? { paymentMode, ...extra } : undefined
    });
    processors.push(processor);
    return processor;
}

/** handleShare fires its Redis writes without awaiting; give them a turn. */
async function settled() {
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (await redis.exists(`${COIN}:hashrate`)) return;
    }
}

before(async () => {
    redis = createClient({
        socket: { host: HOST, port: PORT, connectTimeout: 500 }
    });
    redis.on('error', () => {});
    try {
        await redis.connect();
        available = true;
    } catch {
        available = false;
    }
});

after(async () => {
    for (const processor of processors) {
        await processor.connection.quit().catch(() => {});
    }
    if (available) {
        await redis.flushDb();
        await redis.quit();
    }
});

beforeEach(async () => {
    if (available) await redis.flushDb();
});

const shareOf = (overrides: any = {}) => ({
    worker: 'MinerAddress.rig1',
    difficulty: 16,
    height: 4321,
    blockHash: undefined,
    txHash: undefined,
    ...overrides
});

test('a valid share is credited to the current round and the hashrate log', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    makeProcessor().handleShare(true, false, shareOf());
    await settled();

    assert.equal(
        await redis.hGet(`${COIN}:shares:roundCurrent`, 'MinerAddress.rig1'),
        '16',
        'round shares must accumulate per worker'
    );
    assert.equal(await redis.hGet(`${COIN}:stats`, 'validShares'), '1');
    assert.equal(await redis.hGet(`${COIN}:stats`, 'invalidShares'), null);

    // The hashrate entry is scored by timestamp and carries diff:worker:ms.
    const entries = await redis.zRange(`${COIN}:hashrate`, 0, -1);
    assert.equal(entries.length, 1);
    const [diff, worker] = entries[0].split(':');
    assert.equal(diff, '16');
    assert.equal(worker, 'MinerAddress.rig1', 'the full worker name is logged');
});

test('an invalid share only counts against the stats, with a negative hashrate entry', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    makeProcessor().handleShare(false, false, shareOf());
    await settled();

    assert.equal(await redis.hGet(`${COIN}:stats`, 'invalidShares'), '1');
    assert.equal(
        await redis.exists(`${COIN}:shares:roundCurrent`),
        0,
        'no round credit'
    );

    // Negative difficulty is how stats tells invalid work apart when it
    // rebuilds hashrates from the same sorted set.
    const [entry] = await redis.zRange(`${COIN}:hashrate`, 0, -1);
    assert.equal(entry.split(':')[0], '-16');
});

test('finding a block closes the round and records it as pending', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    const processor = makeProcessor();
    processor.handleShare(true, false, shareOf({ difficulty: 8 }));
    await settled();

    processor.handleShare(
        true,
        true,
        shareOf({
            difficulty: 8,
            blockHash: 'bh'.repeat(16),
            txHash: 'tx'.repeat(16)
        })
    );
    for (
        let i = 0;
        i < 20 && !(await redis.exists(`${COIN}:shares:round4321`));
        i++
    ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // The round is renamed to the block height, so the next round starts clean
    // and the payment processor can pay exactly the shares that found it.
    assert.equal(await redis.exists(`${COIN}:shares:roundCurrent`), 0);
    assert.equal(
        await redis.hGet(`${COIN}:shares:round4321`, 'MinerAddress.rig1'),
        '16',
        'the closed round holds both shares'
    );

    const [pending] = await redis.sMembers(`${COIN}:blocksPending`);
    const [blockHash, txHash, height, worker] = pending.split(':');
    assert.equal(blockHash, 'bh'.repeat(16));
    assert.equal(txHash, 'tx'.repeat(16));
    assert.equal(height, '4321');
    assert.equal(worker, 'MinerAddress.rig1');
    assert.equal(await redis.hGet(`${COIN}:stats`, 'validBlocks'), '1');
});

test('a rejected block is counted without closing the round', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    makeProcessor().handleShare(
        true,
        false,
        shareOf({ blockHash: 'ab'.repeat(32) })
    );
    await settled();

    assert.equal(await redis.hGet(`${COIN}:stats`, 'invalidBlocks'), '1');
    assert.equal(await redis.exists(`${COIN}:blocksPending`), 0);
    assert.equal(
        await redis.exists(`${COIN}:shares:roundCurrent`),
        1,
        'the round must survive a rejected block'
    );
});

test('PPLNS keeps a capped, newest-first window and snapshots it per block', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    // The rolling log is capped by paymentProcessing.pplns.maxLogLength.
    const processor = makeProcessor('pplns', { pplns: { maxLogLength: 3 } });
    processor.handleShare(true, false, shareOf({ worker: 'A', difficulty: 1 }));
    await settled();
    processor.handleShare(true, false, shareOf({ worker: 'B', difficulty: 2 }));
    processor.handleShare(true, false, shareOf({ worker: 'C', difficulty: 3 }));
    for (
        let i = 0;
        i < 20 && (await redis.lLen(`${COIN}:shares:pplnsWindow`)) < 3;
        i++
    ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Newest at the head — pplnsLogic walks the window newest-first.
    assert.deepEqual(await redis.lRange(`${COIN}:shares:pplnsWindow`, 0, -1), [
        'C:3',
        'B:2',
        'A:1'
    ]);

    processor.handleShare(
        true,
        true,
        shareOf({ worker: 'D', difficulty: 4, blockHash: 'x' })
    );
    for (
        let i = 0;
        i < 20 && !(await redis.exists(`${COIN}:shares:pplnsRound4321`));
        i++
    ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // The window is capped at pplns entries...
    assert.equal(await redis.lLen(`${COIN}:shares:pplnsWindow`), 3);
    assert.deepEqual(await redis.lRange(`${COIN}:shares:pplnsWindow`, 0, -1), [
        'D:4',
        'C:3',
        'B:2'
    ]);
    // ...and the block snapshot copies it, including the winning share.
    assert.deepEqual(
        await redis.lRange(`${COIN}:shares:pplnsRound4321`, 0, -1),
        ['D:4', 'C:3', 'B:2']
    );
});

test('PPS buffers each share for the per-share payout', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    const processor = makeProcessor('pps');
    processor.handleShare(true, false, shareOf({ difficulty: 5 }));
    await settled();
    processor.handleShare(true, false, shareOf({ difficulty: 7 }));
    for (let i = 0; i < 20; i++) {
        if (
            (await redis.hGet(
                `${COIN}:pps:shareBuffer`,
                'MinerAddress.rig1'
            )) === '12'
        )
            break;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(
        await redis.hGet(`${COIN}:pps:shareBuffer`, 'MinerAddress.rig1'),
        '12'
    );
    // PROP bookkeeping continues regardless of the payment mode.
    assert.equal(
        await redis.hGet(`${COIN}:shares:roundCurrent`, 'MinerAddress.rig1'),
        '12'
    );
});
