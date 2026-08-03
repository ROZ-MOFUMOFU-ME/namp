import daemonModule from './daemon.ts';
import { createRedisClient } from './redisUtil.ts';
import { pplnsPercents, parsePplnsEntry } from './pplnsLogic.ts';
import type { Logger } from './logUtil.ts';

/*
 * Ethash payment processor: the open-ethereum-pool model on NAMP's Redis
 * layout.
 *
 * An Ethash block pays its reward to the sealing node's etherbase, so unlike
 * the Bitcoin flow there is no wallet transaction to watch. Instead the
 * processor resolves each pending candidate against the chain itself:
 *
 *   pending entry (headerHash:nonce:height:worker:time)
 *     -> wait minConf confirmations
 *     -> the block at that height carries our nonce   -> CANONICAL
 *        reward = blockReward + tx fees + uncle inclusion bonus
 *     -> an uncle within 7 blocks carries our nonce   -> UNCLE
 *        reward = blockReward * (8 - depth) / 8
 *     -> neither                                      -> ORPHAN
 *        shares return to the current round
 *
 * Credits are split over the round's shares and kept in wei (BigInt; a float
 * cannot hold wei), stored as decimal strings in <coin>:balances. Payouts
 * send eth_sendTransaction from the pool address — the node must hold that
 * key — optionally unlocking it first with personal_unlockAccount.
 */

const UNCLE_DEPTH = 7;

/**
 * No real pool balance reaches a trillion coins; anything above this is a
 * pre-v1.1.0 wei value sitting in a field that now holds coins.
 */
const LEGACY_WEI_THRESHOLD = 1e12;

/**
 * Reward for a block at a given height, in wei.
 *
 * Chains step their subsidy down over time (VirBiCoin: 8 VBC, minus 1 every
 * 2,100,000 blocks from block 4,200,000, floor 1 — see go-virbicoin
 * consensus.go), so the coin definition may carry a schedule:
 *
 *   "blockRewardSchedule": [
 *       { "height": 0, "reward": 8 },
 *       { "height": 4200000, "reward": 7 },
 *       ...
 *   ]
 *
 * The entry with the highest height not above the block applies. A plain
 * numeric blockReward stays supported as a single-entry schedule.
 */
export function rewardWeiForHeight(
    height: number,
    schedule: Array<{ height: number; reward: number }> | undefined,
    fallbackCoins: number
): bigint {
    if (Array.isArray(schedule) && schedule.length) {
        const sorted = [...schedule].sort((a, b) => a.height - b.height);
        let chosen = sorted[0];
        for (const entry of sorted) {
            if (entry.height <= height) chosen = entry;
            else break;
        }
        return coinsToWei(chosen.reward);
    }
    return coinsToWei(fallbackCoins);
}

/** Coins (float, as configs express amounts) to wei without float drift. */
export function coinsToWei(coins: number): bigint {
    return BigInt(Math.round(coins * 1e6)) * 10n ** 12n;
}

/**
 * Wei to coins at 8 decimals — the unit every other part of the portal reads
 * from <coin>:balances, :payouts and :immature. The arithmetic stays in wei
 * (BigInt); only what is persisted for the UI is converted, exactly like the
 * Bitcoin flow converts satoshis.
 */
export function weiToCoins(wei: bigint): number {
    return Number(wei / 10n ** 10n) / 1e8;
}

/**
 * Pool fee recipients and the total percentage they take, from the pool's
 * rewardRecipients map. Keys that are not addresses (the shipped `_comment`,
 * for one) are ignored rather than credited to nothing.
 */
export function parseRewardRecipients(
    rewardRecipients: Record<string, unknown> | undefined
): { recipients: Array<{ address: string; percent: number }>; total: number } {
    const recipients: Array<{ address: string; percent: number }> = [];
    let total = 0;
    for (const address of Object.keys(rewardRecipients || {})) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
        const percent = parseFloat(String((rewardRecipients as any)[address]));
        if (!(percent > 0)) continue;
        recipients.push({ address, percent });
        total += percent;
    }
    return { recipients, total };
}

/** A percentage of a wei amount, without leaving BigInt. */
export function percentOfWei(wei: bigint, percent: number): bigint {
    const SCALE = 1000000n;
    return (wei * BigInt(Math.round(percent * Number(SCALE)))) / (100n * SCALE);
}

/** Split a reward over shares; the remainder stays with the pool address. */
export function splitReward(
    rewardWei: bigint,
    shares: Record<string, string | number>
): Record<string, bigint> {
    const SCALE = 1_000_000_000n;
    let total = 0n;
    const scaled: Record<string, bigint> = {};
    for (const worker of Object.keys(shares)) {
        const value = BigInt(Math.round(Number(shares[worker]) * 1e9));
        if (value <= 0n) continue;
        scaled[worker] = value;
        total += value;
    }
    const out: Record<string, bigint> = {};
    if (total <= 0n) return out;
    for (const worker of Object.keys(scaled)) {
        out[worker] = (rewardWei * ((scaled[worker] * SCALE) / total)) / SCALE;
    }
    return out;
}

function SetupForPool(
    logger: Logger,
    poolOptions: any,
    setupFinished: (ok: boolean) => void
) {
    const coin = poolOptions.coin.name;
    const processingConfig = poolOptions.paymentProcessing;
    const logSystem = 'Payments';
    const logComponent = coin;

    const minConf = Math.max(processingConfig.minConf || 120, 10);
    const intervalSecs = Math.max(processingConfig.paymentInterval || 120, 30);
    // prop: the block's round shares. solo: the finder takes it all.
    // pplns: the last-N-shares window snapshotted by shareProcessor at find
    // time (worker:diff entries, newest first; window = n x block difficulty,
    // multiplier 1 — ethash share difficulty already counts hashes).
    const paymentMode = (processingConfig.paymentMode || 'prop').toLowerCase();
    const pplnsN =
        parseFloat(
            (processingConfig.pplns && processingConfig.pplns.n) as any
        ) || 2;
    // The pool's cut, taken off every block before miners are paid — the same
    // contract as the Bitcoin flow's rewardRecipients.
    const { recipients: feeRecipients, total: feePercent } =
        parseRewardRecipients(poolOptions.rewardRecipients);
    const rewardSchedule = poolOptions.coin.blockRewardSchedule;
    const fallbackReward = processingConfig.blockReward || 2;
    const rewardWeiAt = (height: number) =>
        rewardWeiForHeight(height, rewardSchedule, fallbackReward);
    const minPaymentWei = coinsToWei(processingConfig.minimumPayment || 0.1);
    const poolAddress = poolOptions.address;
    const accountPassword = processingConfig.accountPassword;

    const daemon = new (daemonModule as any).interface(
        [processingConfig.daemon || poolOptions.daemons[0]],
        function (severity: string, message: string) {
            (logger as any)[severity](logSystem, logComponent, message);
        }
    );
    const redisClient = createRedisClient(poolOptions.redis);
    redisClient.on('error', (err: any) =>
        logger.error(logSystem, logComponent, `Redis error: ${err}`)
    );

    function rpc(method: string, params: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            daemon.cmd(
                method,
                params,
                (result: any) => {
                    if (result.error) reject(result.error);
                    else resolve(result.response);
                },
                true
            );
        });
    }

    const hex = (n: number) => '0x' + n.toString(16);
    const sameNonce = (a: any, b: any) =>
        String(a || '').toLowerCase() === String(b || '').toLowerCase();

    /** Fees actually paid inside a block: sum of gasUsed * gasPrice. */
    async function blockFeesWei(block: any): Promise<bigint> {
        let fees = 0n;
        const transactions = (block.transactions || []).slice(0, 200);
        for (const tx of transactions) {
            const receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
            if (!receipt) continue;
            const gasUsed = BigInt(receipt.gasUsed || 0);
            const gasPrice = BigInt(
                receipt.effectiveGasPrice || tx.gasPrice || 0
            );
            fees += gasUsed * gasPrice;
        }
        return fees;
    }

    interface Resolution {
        kind: 'confirmed' | 'kicked';
        rewardWei: bigint;
        /** Difficulty of the block that earned the reward (window sizing). */
        blockDifficulty?: number;
    }

    /** Decide what a matured candidate became on chain. */
    async function resolveCandidate(
        height: number,
        nonce: string
    ): Promise<Resolution> {
        const block = await rpc('eth_getBlockByNumber', [hex(height), true]);
        if (block && sameNonce(block.nonce, nonce)) {
            const reward = rewardWeiAt(height);
            const fees = await blockFeesWei(block);
            const uncleBonus =
                BigInt((block.uncles || []).length) * (reward / 32n);
            return {
                kind: 'confirmed',
                rewardWei: reward + fees + uncleBonus,
                blockDifficulty: parseInt(block.difficulty, 16) || 0
            };
        }
        for (let depth = 1; depth <= UNCLE_DEPTH; depth++) {
            const host = await rpc('eth_getBlockByNumber', [
                hex(height + depth),
                false
            ]).catch(() => null);
            if (!host || !(host.uncles || []).length) continue;
            for (let i = 0; i < host.uncles.length; i++) {
                const uncle = await rpc('eth_getUncleByBlockNumberAndIndex', [
                    hex(height + depth),
                    hex(i)
                ]).catch(() => null);
                if (
                    uncle &&
                    sameNonce(uncle.nonce, nonce) &&
                    parseInt(uncle.number, 16) === height
                ) {
                    // The consensus formula scales by the reward of the block
                    // that INCLUDED the uncle: (uncleHeight + 8 - hostHeight)
                    // x R(host) / 8, which is (8 - depth) x R / 8 here.
                    const hostReward = rewardWeiAt(height + depth);
                    return {
                        kind: 'confirmed',
                        rewardWei: (hostReward * BigInt(8 - depth)) / 8n,
                        blockDifficulty: parseInt(host.difficulty, 16) || 0
                    };
                }
            }
        }
        return { kind: 'kicked', rewardWei: 0n };
    }

    /** Per-worker weights for a block, per the configured payment mode. */
    async function weightsForBlock(
        height: number,
        finderWorker: string,
        blockDifficulty: number
    ): Promise<Record<string, number | string>> {
        if (paymentMode === 'solo') {
            return finderWorker ? { [finderWorker]: 1 } : {};
        }
        if (paymentMode === 'pplns') {
            const entries = await redisClient.lRange(
                `${coin}:shares:pplnsRound${height}`,
                0,
                -1
            );
            const parsed = entries
                .map(parsePplnsEntry)
                .filter(Boolean) as any[];
            const windowDiff = pplnsN * blockDifficulty;
            const percents = pplnsPercents(parsed, windowDiff);
            if (Object.keys(percents).length) return percents;
            // An empty window (fresh pool, missing snapshot) must not burn
            // the block: fall back to the round shares.
        }
        return await redisClient.hGetAll(`${coin}:shares:round${height}`);
    }

    /** Credit a resolved block's reward per the payment mode. */
    async function creditRound(
        height: number,
        rewardWei: bigint,
        finderWorker: string,
        blockDifficulty: number
    ) {
        const roundKey = `${coin}:shares:round${height}`;
        const shares = await weightsForBlock(
            height,
            finderWorker,
            blockDifficulty
        );
        // Fee first, miners split what is left.
        let minersWei = rewardWei;
        for (const recipient of feeRecipients) {
            const feeWei = percentOfWei(rewardWei, recipient.percent);
            if (feeWei <= 0n) continue;
            minersWei -= feeWei;
            await redisClient.hIncrByFloat(
                `${coin}:balances`,
                recipient.address,
                weiToCoins(feeWei)
            );
        }

        const split = splitReward(minersWei, shares);
        for (const worker of Object.keys(split)) {
            const amount = weiToCoins(split[worker]);
            if (amount > 0) {
                await redisClient.hIncrByFloat(
                    `${coin}:balances`,
                    worker,
                    amount
                );
            }
        }
        await redisClient.del(roundKey);
        await redisClient.del(`${coin}:shares:pplnsRound${height}`);
    }

    /**
     * What each worker stands to earn from blocks that have not matured yet.
     * Recomputed from scratch every cycle (blocks move out of pending, and an
     * orphan must not leave a phantom credit behind), so the key is replaced
     * rather than incremented.
     */
    async function refreshImmature(pending: string[], currentHeight: number) {
        const immature: Record<string, number> = {};
        for (const entry of pending) {
            const [, , heightRaw, finder] = entry.split(':');
            const height = parseInt(heightRaw, 10);
            if (!Number.isFinite(height)) continue;
            if (currentHeight - height >= minConf) continue; // resolved below

            const block = await rpc('eth_getBlockByNumber', [
                hex(height),
                false
            ]).catch(() => null);
            const weights = await weightsForBlock(
                height,
                finder,
                block ? parseInt(block.difficulty, 16) || 0 : 0
            );
            const gross = rewardWeiAt(height);
            let net = gross;
            for (const recipient of feeRecipients) {
                net -= percentOfWei(gross, recipient.percent);
            }
            const split = splitReward(net, weights);
            for (const worker of Object.keys(split)) {
                immature[worker] =
                    (immature[worker] || 0) + weiToCoins(split[worker]);
            }
        }
        await redisClient.del(`${coin}:immature`);
        for (const worker of Object.keys(immature)) {
            if (immature[worker] > 0) {
                await redisClient.hSet(
                    `${coin}:immature`,
                    worker,
                    immature[worker].toString()
                );
            }
        }
    }

    /** Return an orphaned round's shares to the live round. */
    async function requeueRound(height: number) {
        const roundKey = `${coin}:shares:round${height}`;
        const shares = await redisClient.hGetAll(roundKey);
        for (const worker of Object.keys(shares)) {
            await redisClient.hIncrByFloat(
                `${coin}:shares:roundCurrent`,
                worker,
                Number(shares[worker])
            );
        }
        await redisClient.del(roundKey);
        await redisClient.del(`${coin}:shares:pplnsRound${height}`);
    }

    async function processPendingBlocks(currentHeight: number) {
        const pending = await redisClient.sMembers(`${coin}:blocksPending`);
        cycle.pending = pending.length;
        await refreshImmature(pending, currentHeight);
        for (const entry of pending) {
            const [blockHash, nonce, heightRaw, finderWorker] =
                entry.split(':');
            const height = parseInt(heightRaw, 10);
            if (!Number.isFinite(height)) continue;

            const confirmations = currentHeight - height;
            if (confirmations < minConf) {
                cycle.immature++;
                await redisClient.hSet(
                    `${coin}:blocksPendingConfirms`,
                    blockHash,
                    confirmations
                );
                continue;
            }

            let resolution: Resolution;
            try {
                resolution = await resolveCandidate(height, nonce);
            } catch (e: any) {
                // Chain data is temporarily unanswerable; never decide on
                // uncertainty — the candidate stays pending for next cycle.
                logger.warning(
                    logSystem,
                    logComponent,
                    `Could not resolve block ${height} yet: ${e?.message || e}`
                );
                continue;
            }

            if (resolution.kind === 'confirmed') {
                await creditRound(
                    height,
                    resolution.rewardWei,
                    finderWorker,
                    resolution.blockDifficulty || 0
                );
                cycle.matured++;
                logger.special(
                    logSystem,
                    logComponent,
                    `Block ${height} matured: ${weiToCoins(resolution.rewardWei)} ${
                        poolOptions.coin.symbol
                    } credited over its round`
                );
            } else {
                cycle.orphaned++;
                await requeueRound(height);
                logger.warning(
                    logSystem,
                    logComponent,
                    `Block ${height} was orphaned; its shares return to the current round`
                );
            }
            await redisClient.sRem(`${coin}:blocksPending`, entry);
            await redisClient.sAdd(
                `${coin}:blocks${resolution.kind === 'confirmed' ? 'Confirmed' : 'Kicked'}`,
                entry
            );
            await redisClient.hDel(`${coin}:blocksPendingConfirms`, blockHash);
        }
    }

    /** Counters for the per-cycle summary. */
    let cycle = {
        pending: 0,
        immature: 0,
        matured: 0,
        orphaned: 0,
        walletsBelowMinimum: 0,
        paid: 0,
        payoutErrors: 0
    };

    async function processPayouts() {
        const balances = await redisClient.hGetAll(`${coin}:balances`);
        // Rigs share one wallet: aggregate "0xwallet.rig" entries per wallet.
        // Balances are stored in coins (the portal-wide unit); the transfer
        // amount is computed back in wei so nothing is lost in the send.
        const byWallet: Record<
            string,
            { total: bigint; workers: Record<string, number> }
        > = {};
        for (const worker of Object.keys(balances)) {
            const wallet = worker.split('.')[0];
            if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) continue;
            const coins = parseFloat(balances[worker] || '0');
            if (!(coins > 0)) continue;
            // Balances before v1.1.0 were stored in wei in this same field.
            // Paying one out as coins would try to send 1e18 times too much —
            // refuse and say so rather than hammering the daemon forever.
            if (coins > LEGACY_WEI_THRESHOLD) {
                cycle.payoutErrors++;
                logger.error(
                    logSystem,
                    logComponent,
                    `Balance for ${worker} is ${balances[worker]}, which is not a ` +
                        'plausible coin amount — it looks like a wei-format balance ' +
                        'written before v1.1.0. Divide it by 1e18 (see ' +
                        'docs/ethash.md, "Upgrading from a pre-1.1.0 ledger"); ' +
                        'this worker is skipped until then.'
                );
                continue;
            }
            byWallet[wallet] = byWallet[wallet] || { total: 0n, workers: {} };
            byWallet[wallet].total += coinsToWei(coins);
            byWallet[wallet].workers[worker] = coins;
        }

        let unlocked = false;
        for (const wallet of Object.keys(byWallet)) {
            const { total, workers } = byWallet[wallet];
            if (total < minPaymentWei) {
                cycle.walletsBelowMinimum++;
                continue;
            }

            if (accountPassword && !unlocked) {
                try {
                    await rpc('personal_unlockAccount', [
                        poolAddress,
                        accountPassword,
                        60
                    ]);
                    unlocked = true;
                } catch (e: any) {
                    cycle.payoutErrors++;
                    logger.error(
                        logSystem,
                        logComponent,
                        `Could not unlock ${poolAddress}: ${e?.message || e}; payouts wait`
                    );
                    return;
                }
            }

            let txid: string;
            try {
                txid = await rpc('eth_sendTransaction', [
                    {
                        from: poolAddress,
                        to: wallet,
                        value: '0x' + total.toString(16)
                    }
                ]);
            } catch (e: any) {
                cycle.payoutErrors++;
                logger.error(
                    logSystem,
                    logComponent,
                    `Payout to ${wallet} failed: ${e?.message || e}; balance kept`
                );
                continue;
            }

            const paidCoins = weiToCoins(total);
            const now = Date.now();
            for (const worker of Object.keys(workers)) {
                // Subtract what was paid rather than zeroing: a credit that
                // landed between reading the balance and sending must survive.
                await redisClient.hIncrByFloat(
                    `${coin}:balances`,
                    worker,
                    -workers[worker]
                );
                // Lifetime paid per worker — what the UI's "paid" column and
                // the worker stats page read.
                await redisClient.hIncrByFloat(
                    `${coin}:payouts`,
                    worker,
                    workers[worker]
                );
            }
            // Pool-wide total, shown next to the found blocks.
            await redisClient.hIncrByFloat(
                `${coin}:stats`,
                'totalPaid',
                paidCoins
            );
            await redisClient.zAdd(`${coin}:payments`, {
                score: now,
                value: JSON.stringify({
                    time: now,
                    txid,
                    paid: paidCoins,
                    miners: 1,
                    blocks: [],
                    amounts: { [wallet]: paidCoins },
                    address: wallet
                })
            });
            cycle.paid++;
            logger.special(
                logSystem,
                logComponent,
                `Paid ${paidCoins} ${poolOptions.coin.symbol} to ${wallet} (${txid})`
            );
        }
    }

    let stopped = false;
    let timer: any = null;

    /** One line an operator can read to see what the cycle did, and why. */
    function summarize() {
        const parts = [
            `${cycle.pending} pending (${cycle.immature} awaiting ${minConf} confirmations)`,
            `${cycle.matured} matured`,
            ...(cycle.orphaned ? [`${cycle.orphaned} orphaned`] : []),
            cycle.paid ? `${cycle.paid} payout(s) sent` : 'no payouts sent',
            ...(cycle.walletsBelowMinimum
                ? [
                      `${cycle.walletsBelowMinimum} wallet(s) below the ${
                          processingConfig.minimumPayment || 0.1
                      } ${poolOptions.coin.symbol} minimum`
                  ]
                : []),
            ...(cycle.payoutErrors ? [`${cycle.payoutErrors} error(s)`] : [])
        ];
        logger.debug(logSystem, logComponent, `Cycle: ${parts.join(', ')}`);
    }

    async function processCycle() {
        cycle = {
            pending: 0,
            immature: 0,
            matured: 0,
            orphaned: 0,
            walletsBelowMinimum: 0,
            paid: 0,
            payoutErrors: 0
        };
        try {
            const currentHex = await rpc('eth_blockNumber', []);
            const currentHeight = parseInt(currentHex, 16);
            await processPendingBlocks(currentHeight);
            await processPayouts();
            summarize();
        } catch (e: any) {
            logger.error(
                logSystem,
                logComponent,
                `Payment cycle failed: ${e?.message || e}`
            );
        }
        if (!stopped) {
            timer = setTimeout(processCycle, intervalSecs * 1000);
        }
    }

    const processor = {
        // Exposed for tests and shutdown; production runs on the timer.
        runOnce: async () => {
            const currentHeight = parseInt(
                await rpc('eth_blockNumber', []),
                16
            );
            await processPendingBlocks(currentHeight);
            await processPayouts();
        },
        stop: async () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            await redisClient.quit().catch(() => {});
        }
    };

    // createRedisClient() already connects (failures surface on 'error'),
    // and node-redis queues commands until the socket is ready.
    logger.debug(
        logSystem,
        logComponent,
        `Ethash payment processing every ${intervalSecs}s: mode ${paymentMode}, minConf ${minConf}, ` +
            `blockReward ${
                Array.isArray(rewardSchedule) && rewardSchedule.length
                    ? 'schedule(' + rewardSchedule.length + ' steps)'
                    : fallbackReward
            } ${poolOptions.coin.symbol}, ` +
            `minimumPayment ${processingConfig.minimumPayment || 0.1}, ` +
            `pool fee ${feePercent}%`
    );
    timer = setTimeout(processCycle, intervalSecs * 1000);
    setupFinished(true);

    return processor;
}

export default SetupForPool;
