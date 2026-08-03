import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createClient } from 'redis';

import setupEthashPayments, {
    coinsToWei,
    weiToCoins,
    splitReward,
    rewardWeiForHeight
} from '../src/ethashPaymentProcessor.ts';

/*
 * Ethash payment processing: the open-ethereum-pool model — resolve each
 * pending candidate against the chain (canonical / uncle / orphan), credit
 * balances in wei, pay out with eth_sendTransaction.
 *
 * Real Redis on REDIS_TEST_PORT (default 6399, skipped when absent, CI runs
 * one); the chain side is a mock geth answering the exact RPCs the processor
 * makes. Money math is exercised in wei: a float cannot hold these values,
 * which is the reason the module keeps BigInt end to end.
 */

const PORT = Number(process.env.REDIS_TEST_PORT || 6399);
const HOST = process.env.REDIS_TEST_HOST || '127.0.0.1';
const COIN = 'ethpaytest';
const POOL_ADDRESS = '0x' + 'aa'.repeat(20);
const WALLET_A = '0x' + 'bb'.repeat(20);
const WALLET_B = '0x' + 'cc'.repeat(20);
const NONCE = '0x0102030405060708';

let redis: any;
let available = false;

async function clearCoinKeys() {
    const keys = await redis.keys(`${COIN}:*`);
    if (keys.length) await redis.del(keys);
}

const silentLogger: any = {
    debug: () => {},
    warning: () => {},
    error: () => {},
    special: () => {}
};

interface ChainState {
    height: number;
    blocks: Record<number, any>;
    uncles: Record<string, any>;
    receipts: Record<string, any>;
    sent: any[];
    unlockCalls: any[];
    unlockAccepts: boolean;
}

function startMockGeth(state: ChainState): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            const call = JSON.parse(body);
            let result: any = null;
            let error: any = null;
            switch (call.method) {
                case 'eth_blockNumber':
                    result = '0x' + state.height.toString(16);
                    break;
                case 'eth_getBlockByNumber':
                    result = state.blocks[parseInt(call.params[0], 16)] ?? null;
                    break;
                case 'eth_getUncleByBlockNumberAndIndex':
                    result =
                        state.uncles[
                            `${parseInt(call.params[0], 16)}:${parseInt(call.params[1], 16)}`
                        ] ?? null;
                    break;
                case 'eth_getTransactionReceipt':
                    result = state.receipts[call.params[0]] ?? null;
                    break;
                case 'personal_unlockAccount':
                    state.unlockCalls.push(call.params);
                    if (state.unlockAccepts) result = true;
                    else error = { code: -32000, message: 'could not decrypt' };
                    break;
                case 'eth_sendTransaction':
                    state.sent.push(call.params[0]);
                    result = '0x' + 'dd'.repeat(32);
                    break;
                default:
                    error = { code: -32601, message: 'Method not found' };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({ jsonrpc: '2.0', id: call.id, result, error })
            );
        });
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve(server))
    );
}

const cleanup: Array<() => Promise<void> | void> = [];

async function makeProcessor(state: ChainState, config: any = {}) {
    const daemon = await startMockGeth(state);
    cleanup.push(() => {
        daemon.close();
    });
    const daemonPort = (daemon.address() as net.AddressInfo).port;

    // setupFinished fires synchronously, so capture the verdict in a flag.
    let setupOk: boolean | null = null;
    const processor: any = setupEthashPayments(
        silentLogger,
        {
            coin: { name: COIN, symbol: 'VBC', algorithm: 'ethash' },
            address: POOL_ADDRESS,
            redis: { host: HOST, port: PORT },
            daemons: [
                { host: '127.0.0.1', port: daemonPort, user: '', password: '' }
            ],
            paymentProcessing: {
                enabled: true,
                minConf: 10,
                blockReward: 2,
                minimumPayment: 0.5,
                paymentInterval: 3600,
                ...config
            }
        },
        (ok: boolean) => {
            setupOk = ok;
        }
    );
    cleanup.push(() => processor.stop());
    assert.equal(setupOk, true, 'setup must succeed');
    return processor;
}

/** A pending entry the shareProcessor would have written for a found block. */
async function seedPendingBlock(
    height: number,
    shares: Record<string, number>
) {
    await redis.sAdd(
        `${COIN}:blocksPending`,
        `0xheaderhash:${NONCE}:${height}:${WALLET_A}.rig1:1234567890`
    );
    for (const worker of Object.keys(shares)) {
        await redis.hSet(
            `${COIN}:shares:round${height}`,
            worker,
            shares[worker]
        );
    }
}

before(async () => {
    redis = createClient({ socket: { host: HOST, port: PORT } });
    redis.on('error', () => {});
    try {
        await redis.connect();
        available = true;
        await clearCoinKeys();
    } catch {
        available = false;
    }
});

after(async () => {
    for (const fn of cleanup) await fn();
    if (available) await redis.quit().catch(() => {});
});

beforeEach(async () => {
    if (available) await clearCoinKeys();
});

test('wei conversion and reward splitting hold BigInt precision', () => {
    assert.equal(coinsToWei(2), 2n * 10n ** 18n);
    assert.equal(coinsToWei(0.5), 5n * 10n ** 17n);
    assert.equal(weiToCoins(15n * 10n ** 17n), 1.5);

    // 2 coins over shares 3:1 — the split must be exact in wei, not float-ish.
    const split = splitReward(2n * 10n ** 18n, { a: '3', b: '1' });
    assert.equal(split.a, 15n * 10n ** 17n);
    assert.equal(split.b, 5n * 10n ** 17n);

    assert.deepEqual(splitReward(10n ** 18n, {}), {});
    assert.deepEqual(splitReward(10n ** 18n, { a: '0' }), {});
});

test('an immature candidate only updates its confirmation count', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 105, // 5 confirmations < minConf 10
        blocks: {},
        uncles: {},
        receipts: {},
        sent: [],
        unlockCalls: [],
        unlockAccepts: true
    };
    const processor = await makeProcessor(state);
    await seedPendingBlock(100, { [`${WALLET_A}.rig1`]: 3 });

    await processor.runOnce();

    assert.equal(
        await redis.sCard(`${COIN}:blocksPending`),
        1,
        'stays pending'
    );
    assert.equal(
        await redis.hGet(`${COIN}:blocksPendingConfirms`, '0xheaderhash'),
        '5'
    );
    assert.equal(await redis.exists(`${COIN}:balances`), 0, 'nothing credited');
});

test('a canonical block credits reward plus fees over the round', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 200,
        blocks: {
            100: {
                number: '0x64',
                nonce: NONCE,
                uncles: [],
                transactions: [
                    { hash: '0xt1', gasPrice: '0x3b9aca00' } // 1 gwei
                ]
            }
        },
        uncles: {},
        receipts: {
            '0xt1': { gasUsed: '0x5208', effectiveGasPrice: null } // 21000 gas
        },
        sent: [],
        unlockCalls: [],
        unlockAccepts: true
    };
    const processor = await makeProcessor(state, { minimumPayment: 1000 });
    // Shares 3:1 between two wallets' rigs.
    await seedPendingBlock(100, {
        [`${WALLET_A}.rig1`]: 3,
        [`${WALLET_B}.rig2`]: 1
    });

    await processor.runOnce();

    // 2 VBC + 21000 * 1 gwei fees, split 3:1, exactly.
    const fees = 21000n * 1000000000n;
    const total = 2n * 10n ** 18n + fees;
    const shareA = (total * 3n) / 4n;
    const shareB = total / 4n;
    assert.equal(
        await redis.hGet(`${COIN}:balances`, `${WALLET_A}.rig1`),
        shareA.toString()
    );
    assert.equal(
        await redis.hGet(`${COIN}:balances`, `${WALLET_B}.rig2`),
        shareB.toString()
    );
    assert.equal(await redis.sCard(`${COIN}:blocksPending`), 0);
    assert.equal(await redis.sCard(`${COIN}:blocksConfirmed`), 1);
    assert.equal(
        await redis.exists(`${COIN}:shares:round100`),
        0,
        'the round ledger is consumed'
    );
});

test('an uncle at depth 2 credits (8-2)/8 of the reward', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 200,
        blocks: {
            100: {
                number: '0x64',
                nonce: '0xffffffffffffffff',
                uncles: [],
                transactions: []
            },
            102: {
                number: '0x66',
                nonce: '0x1111111111111111',
                uncles: ['0xu1'],
                transactions: []
            }
        },
        uncles: {
            '102:0': { number: '0x64', nonce: NONCE }
        },
        receipts: {},
        sent: [],
        unlockCalls: [],
        unlockAccepts: true
    };
    const processor = await makeProcessor(state, { minimumPayment: 1000 });
    await seedPendingBlock(100, { [`${WALLET_A}.rig1`]: 1 });

    await processor.runOnce();

    const uncleReward = (2n * 10n ** 18n * 6n) / 8n; // 1.5 coins
    assert.equal(
        await redis.hGet(`${COIN}:balances`, `${WALLET_A}.rig1`),
        uncleReward.toString()
    );
    assert.equal(await redis.sCard(`${COIN}:blocksConfirmed`), 1);
});

test('an orphan returns its shares to the current round', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 200,
        blocks: {
            100: {
                number: '0x64',
                nonce: '0xffffffffffffffff',
                uncles: [],
                transactions: []
            }
        },
        uncles: {},
        receipts: {},
        sent: [],
        unlockCalls: [],
        unlockAccepts: true
    };
    const processor = await makeProcessor(state);
    await seedPendingBlock(100, { [`${WALLET_A}.rig1`]: 2.5 });
    // The live round already has newer work in it.
    await redis.hSet(`${COIN}:shares:roundCurrent`, `${WALLET_A}.rig1`, 1);

    await processor.runOnce();

    assert.equal(await redis.exists(`${COIN}:balances`), 0, 'nothing credited');
    assert.equal(await redis.sCard(`${COIN}:blocksKicked`), 1);
    assert.equal(
        Number(
            await redis.hGet(`${COIN}:shares:roundCurrent`, `${WALLET_A}.rig1`)
        ),
        3.5,
        'orphaned shares merge back into the live round'
    );
});

test('payouts aggregate rigs per wallet and zero the paid balances', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 200,
        blocks: {},
        uncles: {},
        receipts: {},
        sent: [],
        unlockCalls: [],
        unlockAccepts: true
    };
    const processor = await makeProcessor(state, {
        accountPassword: 'hunter2'
    });
    // Two rigs of wallet A clear the 0.5 threshold together; B stays below it.
    await redis.hSet(
        `${COIN}:balances`,
        `${WALLET_A}.rig1`,
        (4n * 10n ** 17n).toString()
    );
    await redis.hSet(
        `${COIN}:balances`,
        `${WALLET_A}.rig2`,
        (3n * 10n ** 17n).toString()
    );
    await redis.hSet(
        `${COIN}:balances`,
        `${WALLET_B}.rig1`,
        (2n * 10n ** 17n).toString()
    );

    await processor.runOnce();

    assert.equal(state.sent.length, 1, 'one transaction for wallet A only');
    assert.equal(state.sent[0].from, POOL_ADDRESS);
    assert.equal(state.sent[0].to, WALLET_A);
    assert.equal(BigInt(state.sent[0].value), 7n * 10n ** 17n);
    assert.deepEqual(state.unlockCalls[0], [POOL_ADDRESS, 'hunter2', 60]);

    assert.equal(await redis.hGet(`${COIN}:balances`, `${WALLET_A}.rig1`), '0');
    assert.equal(await redis.hGet(`${COIN}:balances`, `${WALLET_A}.rig2`), '0');
    assert.equal(
        await redis.hGet(`${COIN}:balances`, `${WALLET_B}.rig1`),
        (2n * 10n ** 17n).toString(),
        'below-threshold balances are untouched'
    );

    const payments = await redis.zRange(`${COIN}:payments`, 0, -1);
    assert.equal(payments.length, 1);
    const record = JSON.parse(payments[0]);
    assert.equal(record.address, WALLET_A);
    assert.equal(record.paid, 0.7);
    assert.match(record.txid, /^0xdd/);
});

test('a failed unlock keeps every balance and sends nothing', async (t) => {
    if (!available) return t.skip('no redis');
    const state: ChainState = {
        height: 200,
        blocks: {},
        uncles: {},
        receipts: {},
        sent: [],
        unlockCalls: [],
        unlockAccepts: false
    };
    const processor = await makeProcessor(state, {
        accountPassword: 'wrong'
    });
    await redis.hSet(
        `${COIN}:balances`,
        `${WALLET_A}.rig1`,
        (10n ** 18n).toString()
    );

    await processor.runOnce();

    assert.equal(
        state.sent.length,
        0,
        'no transaction without an unlocked account'
    );
    assert.equal(
        await redis.hGet(`${COIN}:balances`, `${WALLET_A}.rig1`),
        (10n ** 18n).toString()
    );
});

test('the reward schedule steps down by height, per the chain consensus', () => {
    // VirBiCoin's calcBlockReward: 8 VBC, minus 1 every 2,100,000 blocks from
    // 4,200,000, floor 1. The entry with the highest height <= block applies.
    const schedule = [
        { height: 0, reward: 8 },
        { height: 4200000, reward: 7 },
        { height: 6300000, reward: 6 },
        { height: 16800000, reward: 1 }
    ];
    const R = (h: number) => rewardWeiForHeight(h, schedule, 99);
    assert.equal(R(0), 8n * 10n ** 18n);
    assert.equal(R(4199999), 8n * 10n ** 18n);
    assert.equal(R(4200000), 7n * 10n ** 18n);
    assert.equal(R(6299999), 7n * 10n ** 18n);
    assert.equal(R(6300000), 6n * 10n ** 18n);
    assert.equal(R(99999999), 1n * 10n ** 18n);
    // Order in the file must not matter.
    assert.equal(
        rewardWeiForHeight(4200001, [schedule[1], schedule[0]], 99),
        7n * 10n ** 18n
    );
    // No schedule: the numeric fallback applies.
    assert.equal(rewardWeiForHeight(123, undefined, 2), 2n * 10n ** 18n);
});
