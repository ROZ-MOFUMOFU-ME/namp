import daemonModule from './daemon.ts';
import { createRedisClient } from './redisUtil.ts';
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

/** Coins (float, as configs express amounts) to wei without float drift. */
export function coinsToWei(coins: number): bigint {
    return BigInt(Math.round(coins * 1e6)) * 10n ** 12n;
}

export function weiToCoins(wei: bigint): number {
    return Number(wei / 10n ** 12n) / 1e6;
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
    const blockRewardWei = coinsToWei(processingConfig.blockReward || 2);
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
    }

    /** Decide what a matured candidate became on chain. */
    async function resolveCandidate(
        height: number,
        nonce: string
    ): Promise<Resolution> {
        const block = await rpc('eth_getBlockByNumber', [hex(height), true]);
        if (block && sameNonce(block.nonce, nonce)) {
            const fees = await blockFeesWei(block);
            const uncleBonus =
                BigInt((block.uncles || []).length) * (blockRewardWei / 32n);
            return {
                kind: 'confirmed',
                rewardWei: blockRewardWei + fees + uncleBonus
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
                    return {
                        kind: 'confirmed',
                        rewardWei: (blockRewardWei * BigInt(8 - depth)) / 8n
                    };
                }
            }
        }
        return { kind: 'kicked', rewardWei: 0n };
    }

    /** Credit a resolved block's reward over its round shares. */
    async function creditRound(height: number, rewardWei: bigint) {
        const roundKey = `${coin}:shares:round${height}`;
        const shares = await redisClient.hGetAll(roundKey);
        const split = splitReward(rewardWei, shares);
        const commands: any[] = [];
        for (const worker of Object.keys(split)) {
            const current = BigInt(
                (await redisClient.hGet(`${coin}:balances`, worker)) || '0'
            );
            commands.push([
                'hSet',
                `${coin}:balances`,
                worker,
                (current + split[worker]).toString()
            ]);
        }
        for (const command of commands) {
            await (redisClient as any)[command[0]](...command.slice(1));
        }
        await redisClient.del(roundKey);
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
    }

    async function processPendingBlocks(currentHeight: number) {
        const pending = await redisClient.sMembers(`${coin}:blocksPending`);
        for (const entry of pending) {
            const [blockHash, nonce, heightRaw] = entry.split(':');
            const height = parseInt(heightRaw, 10);
            if (!Number.isFinite(height)) continue;

            const confirmations = currentHeight - height;
            if (confirmations < minConf) {
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
                await creditRound(height, resolution.rewardWei);
                logger.special(
                    logSystem,
                    logComponent,
                    `Block ${height} matured: ${weiToCoins(resolution.rewardWei)} ${
                        poolOptions.coin.symbol
                    } credited over its round`
                );
            } else {
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

    async function processPayouts() {
        const balances = await redisClient.hGetAll(`${coin}:balances`);
        // Rigs share one wallet: aggregate "0xwallet.rig" entries per wallet.
        const byWallet: Record<string, { total: bigint; workers: string[] }> =
            {};
        for (const worker of Object.keys(balances)) {
            const wallet = worker.split('.')[0];
            if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) continue;
            byWallet[wallet] = byWallet[wallet] || { total: 0n, workers: [] };
            byWallet[wallet].total += BigInt(balances[worker] || '0');
            byWallet[wallet].workers.push(worker);
        }

        let unlocked = false;
        for (const wallet of Object.keys(byWallet)) {
            const { total, workers } = byWallet[wallet];
            if (total < minPaymentWei) continue;

            if (accountPassword && !unlocked) {
                try {
                    await rpc('personal_unlockAccount', [
                        poolAddress,
                        accountPassword,
                        60
                    ]);
                    unlocked = true;
                } catch (e: any) {
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
                logger.error(
                    logSystem,
                    logComponent,
                    `Payout to ${wallet} failed: ${e?.message || e}; balance kept`
                );
                continue;
            }

            for (const worker of workers) {
                await redisClient.hSet(`${coin}:balances`, worker, '0');
            }
            await redisClient.zAdd(`${coin}:payments`, {
                score: Date.now(),
                value: JSON.stringify({
                    time: Date.now(),
                    txid,
                    paid: weiToCoins(total),
                    address: wallet
                })
            });
            logger.special(
                logSystem,
                logComponent,
                `Paid ${weiToCoins(total)} ${poolOptions.coin.symbol} to ${wallet} (${txid})`
            );
        }
    }

    let stopped = false;
    let timer: any = null;

    async function processCycle() {
        try {
            const currentHex = await rpc('eth_blockNumber', []);
            const currentHeight = parseInt(currentHex, 16);
            await processPendingBlocks(currentHeight);
            await processPayouts();
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
        `Ethash payment processing every ${intervalSecs}s: minConf ${minConf}, ` +
            `blockReward ${processingConfig.blockReward || 2} ${poolOptions.coin.symbol}, ` +
            `minimumPayment ${processingConfig.minimumPayment || 0.1}`
    );
    timer = setTimeout(processCycle, intervalSecs * 1000);
    setupFinished(true);

    return processor;
}

export default SetupForPool;
