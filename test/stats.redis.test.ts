import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from 'redis';

import Stats from '../src/stats.ts';

/*
 * Integration tests for stats.getGlobalStats against a real Redis.
 *
 * This is the aggregation every API consumer and the website read; it turns
 * the raw keys shareProcessor writes into pool/worker/global hashrates. The
 * arithmetic (share sums, the 2^32/multiplier scaling, window pruning, the
 * global rollup) had no coverage — notably global.hashrate, which sat at 0
 * for years because the rollup line was missing.
 *
 * Same contract as shareProcessor.redis.test.ts: needs a Redis on
 * REDIS_TEST_PORT (default 6399), skips itself when none is reachable, and CI
 * provides one. Loading stats pulls in stratum-pool's algorithm table (and
 * with it the native addon), which the workspace install builds anyway.
 */

const PORT = Number(process.env.REDIS_TEST_PORT || 6399);
const HOST = process.env.REDIS_TEST_HOST || '127.0.0.1';
const COIN = 'statscoin';
const WINDOW = 600; // portalConfig.website.stats.hashrateWindow

const silentLogger: any = {
    debug: () => {},
    warning: () => {},
    error: () => {},
    special: () => {}
};

let redis: any;
let available = false;
let stats: any;

/** Test files share one Redis and run in parallel; only clear our own keys.
 *  statHistory is written by this suite alone, so it is ours to reset. */
async function clearOwnKeys() {
    const keys = await redis.keys(`${COIN}:*`);
    keys.push('statHistory');
    await redis.del(keys);
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
        return;
    }
    await clearOwnKeys();

    const now = (Date.now() / 1000) | 0;
    // Hashrate entries as shareProcessor writes them: diff:worker:ms scored by
    // seconds. Alice has 16 valid + 8 invalid, Bob 4 valid. The stale entry
    // sits outside the window and must be pruned, not counted.
    await redis.zAdd(`${COIN}:hashrate`, [
        { score: now, value: '16:Alice.rig1:1111' },
        { score: now, value: '-8:Alice.rig1:2222' },
        { score: now, value: '4:Bob.rig1:3333' },
        { score: now - WINDOW - 60, value: '32:Stale.rig9:4444' }
    ]);
    await redis.hSet(`${COIN}:stats`, {
        validShares: '100',
        invalidShares: '5',
        validBlocks: '2',
        totalPaid: '12.5',
        networkHash: '86000000',
        networkDiff: '0.02',
        networkBlocks: '4321',
        networkConnections: '8'
    });
    // Block keys carry the height in the third field; pending must come back
    // sorted by height, newest first.
    await redis.sAdd(`${COIN}:blocksPending`, [
        'hashA:txA:10:Alice.rig1:1111',
        'hashB:txB:12:Bob.rig1:2222'
    ]);
    await redis.sAdd(`${COIN}:blocksConfirmed`, [
        'hashC:txC:5:Alice.rig1:3333'
    ]);
    await redis.hSet(`${COIN}:shares:roundCurrent`, {
        'Alice.rig1': '16',
        'Bob.rig1': '4'
    });
    await redis.hSet(`${COIN}:shares:timesCurrent`, { 'Alice.rig1': '120' });

    stats = new (Stats as any)(
        silentLogger,
        {
            redis: { host: HOST, port: PORT },
            website: {
                stats: { hashrateWindow: WINDOW, historicalRetention: 3600 }
            }
        },
        {
            [COIN]: {
                coin: {
                    name: COIN,
                    symbol: 'tst',
                    algorithm: 'sha256',
                    blockTime: 60
                },
                redis: { host: HOST, port: PORT }
            }
        }
    );
    await new Promise<void>((resolve) => stats.getGlobalStats(resolve));
});

after(async () => {
    if (stats) await stats.shutdown();
    if (available) {
        await clearOwnKeys();
        await redis.quit();
    }
});

// sha256 has multiplier 1, so one unit of share difficulty represents 2^32
// hashes; the window turns that into a rate.
const HASHRATE = (Math.pow(2, 32) * 20) / WINDOW;

test('aggregates pool hashrate from the valid shares in the window', (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const pool = stats.stats.pools[COIN];

    assert.equal(pool.hashrate, HASHRATE);
    assert.equal(
        pool.hashrateString,
        stats.getReadableHashRateString(HASHRATE)
    );
    // The stale entry is pruned inside the same MULTI before the window is
    // read, so its worker never materialises.
    assert.equal(pool.workerCount, 2);
    assert.equal(pool.minerCount, 2);
});

test('prunes hashrate entries older than the window from redis', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const remaining = await redis.zRange(`${COIN}:hashrate`, 0, -1);
    assert.equal(remaining.length, 3, 'the stale entry must be deleted');
    assert.ok(!remaining.some((entry: string) => entry.includes('Stale')));
});

test('builds per-worker and per-miner stats with invalid shares separated', (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const { workers, miners } = stats.stats.pools[COIN];

    assert.equal(workers['Alice.rig1'].shares, 16);
    assert.equal(workers['Alice.rig1'].invalidshares, 8);
    assert.equal(
        workers['Alice.rig1'].hashrate,
        (Math.pow(2, 32) * 16) / WINDOW
    );
    assert.equal(workers['Bob.rig1'].shares, 4);
    assert.equal(workers['Bob.rig1'].invalidshares, 0);
    // Miners are keyed by address (the part before the dot).
    assert.equal(miners.Alice.shares, 16);
    assert.equal(miners.Bob.shares, 4);
    assert.equal(
        workers['Stale.rig9'],
        undefined,
        'pruned entries leave no worker behind'
    );
});

test('rolls pools up into global and per-algorithm totals', (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const { global: globalStats, algos } = stats.stats;

    assert.equal(globalStats.workers, 2);
    // The regression that started this whole stack of work: global.hashrate
    // must be the sum of the pool hashrates, not the initial 0.
    assert.equal(globalStats.hashrate, HASHRATE);
    assert.equal(algos.sha256.hashrate, HASHRATE);
    assert.equal(algos.sha256.workers, 2);
    assert.equal(
        algos.sha256.hashrateString,
        stats.getReadableHashRateString(HASHRATE)
    );
});

test('carries the daemon stats and block sets through', (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const pool = stats.stats.pools[COIN];

    assert.equal(pool.poolStats.validShares, '100');
    assert.equal(pool.poolStats.networkHash, '86000000');
    assert.equal(pool.blocks.pending, 2);
    assert.equal(pool.blocks.confirmed, 1);
    assert.equal(pool.blocks.orphaned, 0);
    // Pending blocks come back sorted by height, newest first.
    assert.deepEqual(pool.pending.blocks, [
        'hashB:txB:12:Bob.rig1:2222',
        'hashA:txA:10:Alice.rig1:1111'
    ]);
});

test('summarises the current round and PPLNT times', (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    const pool = stats.stats.pools[COIN];

    assert.equal(pool.shareCount, 20);
    assert.equal(pool.maxRoundTime, 120);
    assert.equal(pool.workers['Alice.rig1'].currRoundShares, 16);
});

test('persists the snapshot to statHistory and serialises statsString', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);

    const history = await redis.zRange('statHistory', 0, -1);
    assert.equal(history.length, 1, 'one snapshot per getGlobalStats run');

    const snapshot = JSON.parse(stats.statsString);
    assert.equal(snapshot.pools[COIN].hashrate, HASHRATE);
    // The heavy per-block/per-miner detail is stripped from the history copy.
    assert.equal(snapshot.pools[COIN].pending, undefined);
    assert.equal(snapshot.pools[COIN].miners, undefined);
});

test('an ethash coin gets hash-counted hashrate instead of a crash', async (t) => {
    if (!available) return t.skip(`no Redis on ${HOST}:${PORT}`);
    // Ethash algorithms are deliberately absent from the Bitcoin-style algo
    // table, and stats used to crash the whole website process on them
    // (algos[algorithm].multiplier of undefined). Their share difficulty
    // already counts hashes, so no 2^32 scaling applies either.
    const ETH_COIN = 'ethstatstest';
    const ethKeys = await redis.keys(`${ETH_COIN}:*`);
    if (ethKeys.length) await redis.del(ethKeys);

    const now = (Date.now() / 1000) | 0;
    await redis.zAdd(`${ETH_COIN}:hashrate`, [
        { score: now, value: '100000000:0xwallet.rig1:1111' },
        { score: now, value: '100000000:0xwallet.rig1:2222' }
    ]);

    const ethStats: any = new (Stats as any)(
        silentLogger,
        {
            redis: { host: HOST, port: PORT },
            website: {
                stats: { hashrateWindow: WINDOW, historicalRetention: 3600 }
            }
        },
        {
            [ETH_COIN]: {
                coin: {
                    name: ETH_COIN,
                    symbol: 'vbc',
                    algorithm: 'ethash',
                    blockTime: 12
                },
                redis: { host: HOST, port: PORT }
            }
        }
    );
    try {
        await new Promise<void>((resolve) => ethStats.getGlobalStats(resolve));
        const pool = ethStats.stats.pools[ETH_COIN];
        assert.equal(
            pool.hashrate,
            (2 * 100000000) / WINDOW,
            'share difficulty counts hashes directly for ethash'
        );
    } finally {
        await ethStats.shutdown();
        const leftover = await redis.keys(`${ETH_COIN}:*`);
        if (leftover.length) await redis.del(leftover);
    }
});
