import events from 'events';

import daemonModule from './daemon.ts';
import EthashJobManager, {
    boundaryForDifficulty,
    epochOf,
    DEFAULT_EPOCH_LENGTH
} from './ethashJobManager.ts';
import EthashStratumServer from './ethashStratum.ts';
import { getReadableHashRateString } from './util.ts';

/*
 * Ethash pool: the daemon side of the Ethash/Etchash family.
 *
 * Where the Bitcoin-family pool polls getblocktemplate and builds a block,
 * an Ethash pool only relays sealed work and hands solutions back:
 *
 *   eth_getWork    -> [headerHash, seedHash, boundary, blockNumber]
 *   eth_submitWork <- [nonce, headerHash, mixHash] -> true when accepted
 *
 * Emits:
 *   started()                     once the daemon answered its first work
 *   newWork(work)                 the daemon moved to a new header
 *   share(shareData, accepted)    a validated submission; accepted is the
 *                                 daemon's eth_submitWork verdict for block
 *                                 candidates, undefined for ordinary shares
 *   log(severity, message)
 */

const DEFAULT_POLL_MS = 500;

/** RPC errors can carry the request/response objects, which cycle. */
function describe(error: any): string {
    if (!error) return String(error);
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

const EthashPool = function EthashPool(
    this: any,
    options: any,
    authorizeFn: any
) {
    const _this = this;
    const emitLog = (text: string) => _this.emit('log', 'debug', text);
    const emitErrorLog = (text: string) => _this.emit('log', 'error', text);
    const emitSpecialLog = (text: string) => _this.emit('log', 'special', text);

    let pollTimer: any = null;
    let stopped = false;

    this.options = options;
    this.authorizeFn = authorizeFn;

    this.jobManager = new (EthashJobManager as any)({
        epochLength: options.coin && options.coin.epochLength
    });
    this.jobManager.on('newWork', (work: any) => _this.emit('newWork', work));
    this.jobManager.on('log', (severity: string, message: string) =>
        _this.emit('log', severity, message)
    );

    this.daemon = new (daemonModule as any).interface(
        options.daemons,
        function (severity: string, message: string) {
            _this.emit('log', severity, message);
        }
    );

    /** Ask the daemon for work; feeds the job manager and returns freshness. */
    function pollWork(callback?: (isNew: boolean) => void) {
        _this.daemon.cmd(
            'eth_getWork',
            [],
            function (result: any) {
                if (result.error) {
                    emitErrorLog(
                        `eth_getWork failed: ${describe(result.error)}`
                    );
                    callback?.(false);
                    return;
                }
                const isNew = _this.jobManager.processWork(result.response);
                callback?.(isNew);
            },
            true
        );
    }
    this.pollWork = pollWork;

    /**
     * Hand a solved share to the daemon. eth_submitWork answers with a plain
     * boolean; anything else (or an RPC error) counts as a rejection so a bad
     * block is never recorded as found.
     */
    this.submitWork = function (
        share: { nonce: string; headerHash: string; mixHash: string },
        callback: (accepted: boolean) => void
    ) {
        _this.daemon.cmd(
            'eth_submitWork',
            [share.nonce, share.headerHash, share.mixHash],
            function (result: any) {
                if (result.error) {
                    emitErrorLog(
                        `eth_submitWork failed: ${describe(result.error)}`
                    );
                    callback(false);
                    return;
                }
                const accepted = result.response === true;
                if (!accepted) {
                    emitErrorLog(
                        `Block rejected by the daemon at height ${
                            _this.jobManager.currentWork?.height
                        }`
                    );
                }
                callback(accepted);
            },
            true
        );
    };

    /**
     * Validate a miner submission and, when it clears the network boundary,
     * relay it to the daemon.
     */
    this.processShare = function (
        submission: any,
        callback?: (r: any) => void
    ) {
        const result = _this.jobManager.processShare(submission);
        if (result.error) {
            _this.emit(
                'share',
                { ...submission, error: result.error[1] },
                false
            );
            callback?.(result);
            return result;
        }

        if (!result.isBlockCandidate) {
            _this.emit('share', {
                ...submission,
                isBlockCandidate: false,
                isStale: result.isStale,
                shareDiff: result.shareDiff
            });
            callback?.(result);
            return result;
        }

        // The work the share actually solved: with the recent-works window a
        // candidate can belong to a slightly older header, and the daemon
        // accepts solutions for any work it still remembers.
        const work = result.work;
        emitSpecialLog(`Block candidate found at height ${work.height}`);
        _this.submitWork(
            {
                nonce: submission.nonce,
                headerHash: work.headerHash,
                mixHash: submission.mixHash
            },
            function (accepted: boolean) {
                if (accepted) {
                    emitSpecialLog(
                        `Block accepted by the daemon at height ${work.height}`
                    );
                    // A found block invalidates the current work immediately.
                    pollWork();
                }
                _this.emit(
                    'share',
                    {
                        ...submission,
                        isBlockCandidate: true,
                        isStale: result.isStale,
                        shareDiff: result.shareDiff,
                        height: work.height
                    },
                    accepted
                );
                callback?.({ ...result, accepted });
            }
        );
        return result;
    };

    /** Serve miners the eth-proxy dialect and route their submissions. */
    function startStratum(callback: () => void) {
        if (!options.ports || !Object.keys(options.ports).length) {
            emitLog('No stratum ports configured; running daemon-side only');
            callback();
            return;
        }

        const server: any = new (EthashStratumServer as any)(
            {
                ports: options.ports,
                connectionTimeout: options.connectionTimeout,
                banning: options.banning
            },
            authorizeFn
        );
        // Miners hash against their SHARE boundary, never the network one.
        // Cached per difficulty: varDiff moves clients between a small set of
        // values.
        const boundaries: Record<number, string> = {};
        server.boundaryForDifficulty = function (difficulty: number) {
            if (!boundaries[difficulty]) {
                boundaries[difficulty] =
                    '0x' + boundaryForDifficulty(difficulty).toString('hex');
            }
            return boundaries[difficulty];
        };

        server.on('log', (severity: string, message: string) =>
            _this.emit('log', severity, message)
        );
        server.on('client.connected', (client: any) =>
            emitLog(
                `Miner connected: ${client.workerName} (${client.remoteAddress})`
            )
        );
        server.on('share', function (submission: any, respond: any) {
            _this.processShare(submission, function (outcome: any) {
                respond(!outcome.error, outcome.error);
            });
        });

        _this.on('newWork', (work: any) => server.broadcastWork(work));
        // The first work arrived before this server existed; seed it so the
        // miner that logs in next gets a job instead of waiting for a block.
        server.broadcastWork(_this.jobManager.currentWork);

        _this.stratumServer = server;
        server.start(function () {
            emitLog(
                `Stratum listening on ${Object.keys(options.ports).join(', ')}`
            );
            callback();
        });
    }

    /**
     * open-ethereum-pool-style self-configuration: when the node was started
     * without --mine/--miner.etherbase, engage its sealer over the miner RPC
     * API instead of demanding command-line flags. miner_start(0) prepares
     * work without the node competing for it. Needs "miner" in --http.api;
     * degrades to the flag guidance below when it is not exposed.
     */
    function engageSealing(callback: (engaged: boolean) => void) {
        if (!options.address) return callback(false);
        _this.daemon.cmd(
            'miner_setEtherbase',
            [options.address],
            function (result: any) {
                if (result.error) {
                    emitLog(
                        'miner API not exposed; cannot self-configure sealing'
                    );
                    return callback(false);
                }
                _this.daemon.cmd(
                    'miner_start',
                    [0],
                    function (startResult: any) {
                        if (startResult.error) return callback(false);
                        emitSpecialLog(
                            `Engaged the daemon's sealer via the miner API ` +
                                `(etherbase ${options.address}, 0 local threads)`
                        );
                        callback(true);
                    },
                    true
                );
            },
            true
        );
    }

    /**
     * The startup banner, in the same shape the Bitcoin-family pool prints —
     * with the figures that matter for an Ethash chain: epoch (the DAG the
     * miners must build), the etherbase every block reward is paid to, and
     * the daemon's identity.
     */
    function outputPoolInfo(callback: () => void) {
        const startMessage = `Ethash Pool Server Started for ${
            options.coin.name
        } [${String(options.coin.symbol).toUpperCase()}] {${
            options.coin.algorithm
        }}`;
        if (process.env.forkId && process.env.forkId !== '0') {
            emitLog(startMessage);
            callback();
            return;
        }
        const rpc = (method: string, params: any[]) =>
            new Promise<any>(function (resolve) {
                _this.daemon.cmd(
                    method,
                    params,
                    (r: any) => resolve(r.error ? null : r.response),
                    true
                );
            });
        Promise.all([
            rpc('eth_chainId', []),
            rpc('net_peerCount', []),
            rpc('eth_getBlockByNumber', ['latest', false]),
            rpc('web3_clientVersion', []),
            rpc('eth_coinbase', [])
        ]).then(function ([chainId, peers, latest, clientVersion, coinbase]) {
            const work = _this.jobManager.currentWork;
            const difficulty =
                latest && latest.difficulty
                    ? parseInt(latest.difficulty, 16)
                    : null;
            const blockTime = options.coin.blockTime || 13;
            const epochLen = options.coin.epochLength || DEFAULT_EPOCH_LENGTH;
            const feePercent = Object.keys(
                options.rewardRecipients || {}
            ).reduce(function (total, address) {
                return (
                    total + (parseFloat(options.rewardRecipients[address]) || 0)
                );
            }, 0);

            const infoLines = [
                startMessage,
                `Chain ID:\t\t${chainId !== null ? parseInt(chainId, 16) : '—'}`,
                `Current Block Height:\t${work.height}`,
                `Current Epoch:\t\t${epochOf(work.height, epochLen)} (length ${epochLen})`,
                `Current Connect Peers:\t${peers !== null ? parseInt(peers, 16) : '—'}`,
                `Network Difficulty:\t${difficulty !== null ? difficulty : '—'}`,
                `Network Hash Rate:\t${
                    difficulty !== null
                        ? getReadableHashRateString(difficulty / blockTime)
                        : '—'
                }`,
                `Etherbase:\t\t${coinbase || '—'}`,
                `Daemon:\t\t${clientVersion || '—'}`,
                `Stratum Port(s):\t${Object.keys(options.ports || {}).join(', ') || '—'}`,
                `Pool Fee Percent:\t${feePercent}%`,
                `Payment Processing:\t${
                    options.paymentProcessing &&
                    options.paymentProcessing.enabled
                        ? `enabled (${
                              options.paymentProcessing.paymentMode || 'prop'
                          }, minConf ${options.paymentProcessing.minConf || 120})`
                        : 'disabled'
                }`
            ];
            if (
                typeof options.blockRefreshInterval !== 'number' ||
                options.blockRefreshInterval > 0
            ) {
                infoLines.push(
                    `Work polling every:\t${
                        options.blockRefreshInterval === undefined
                            ? DEFAULT_POLL_MS
                            : options.blockRefreshInterval
                    } ms`
                );
            }
            emitSpecialLog(infoLines.join('\n\t\t\t\t\t\t'));
            callback();
        });
    }

    this.start = function () {
        // No Bitcoin-style liveness probe here: daemon.init()'s check calls
        // getnetworkinfo, which geth-family nodes do not implement. For an
        // Ethash chain the first eth_getWork answer *is* the proof of life.
        _this.daemon.on('error', (message: any) =>
            emitErrorLog(describe(message))
        );

        let attempts = 0;
        let sealingTried = false;
        const tryStart = function () {
            pollWork(function () {
                if (!_this.jobManager.currentWork) {
                    if (!sealingTried) {
                        sealingTried = true;
                        engageSealing(() => setTimeout(tryStart, 1000));
                        return;
                    }
                    if (++attempts >= 5) {
                        emitErrorLog(
                            'Could not get work from the daemon(s). geth-family ' +
                                'nodes only prepare sealing work while the miner ' +
                                'is engaged: either expose the miner API ' +
                                '(--http.api eth,net,web3,miner) and set the ' +
                                'pool address so NAMP engages it itself, or run ' +
                                'the node with --mine --miner.threads=0 ' +
                                '--miner.etherbase <address>.'
                        );
                        return;
                    }
                    setTimeout(tryStart, 1000);
                    return;
                }

                const interval =
                    options.blockRefreshInterval === undefined
                        ? DEFAULT_POLL_MS
                        : options.blockRefreshInterval;
                if (interval > 0) {
                    pollTimer = setInterval(() => {
                        if (!stopped) pollWork();
                    }, interval);
                    emitLog(`Work polling every ${interval} ms`);
                } else {
                    emitLog('Work polling has been disabled');
                }
                startStratum(function () {
                    outputPoolInfo(function () {
                        _this.emit('started');
                    });
                });
            });
        };
        tryStart();
    };

    /** Stop polling and close the stratum server. */
    this.stop = function (callback?: () => void) {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (_this.stratumServer) _this.stratumServer.stop(callback);
        else callback?.();
    };
};

Object.setPrototypeOf(EthashPool.prototype, events.EventEmitter.prototype);

export function createEthashPool(options: any, authorizeFn: any) {
    return new (EthashPool as any)(options, authorizeFn);
}

export default EthashPool;
