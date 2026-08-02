import events from 'events';

import daemonModule from './daemon.ts';
import EthashJobManager from './ethashJobManager.ts';

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
            _this.emit('share', { ...submission, isBlockCandidate: false });
            callback?.(result);
            return result;
        }

        const work = _this.jobManager.currentWork;
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
                        height: work.height
                    },
                    accepted
                );
                callback?.({ ...result, accepted });
            }
        );
        return result;
    };

    this.start = function () {
        // No Bitcoin-style liveness probe here: daemon.init()'s check calls
        // getnetworkinfo, which geth-family nodes do not implement. For an
        // Ethash chain the first eth_getWork answer *is* the proof of life.
        _this.daemon.on('error', (message: any) =>
            emitErrorLog(describe(message))
        );

        let attempts = 0;
        const tryStart = function () {
            pollWork(function () {
                if (!_this.jobManager.currentWork) {
                    if (++attempts >= 5) {
                        emitErrorLog(
                            'Could not get work from the daemon(s) - is the node mining-enabled?'
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
                emitSpecialLog(
                    `Ethash pool started for ${options.coin.name} [${
                        options.coin.symbol
                    }] {${options.coin.algorithm}} at height ${
                        _this.jobManager.currentWork.height
                    }`
                );
                _this.emit('started');
            });
        };
        tryStart();
    };

    /** Stop polling; the caller owns any stratum server on top. */
    this.stop = function (callback?: () => void) {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        callback?.();
    };
};

Object.setPrototypeOf(EthashPool.prototype, events.EventEmitter.prototype);

export function createEthashPool(options: any, authorizeFn: any) {
    return new (EthashPool as any)(options, authorizeFn);
}

export default EthashPool;
