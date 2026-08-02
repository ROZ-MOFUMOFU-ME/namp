import { createPool } from './pool.ts';
import net from 'net';

import { createRedisClient } from './redisUtil.ts';

import ShareProcessor from './shareProcessor.ts';

import type { Logger } from './logUtil.ts';

export default function (this: any, logger: Logger) {
    const _this = this;

    const poolConfigs = JSON.parse(process.env.pools as string);
    const portalConfig = JSON.parse(process.env.portalConfig as string);

    const forkId = process.env.forkId;

    const pools: any = {};

    const proxySwitch: any = {};

    const redisClient = createRedisClient(
        portalConfig.redis,
        function (err: any) {
            logger.error(
                'Pool',
                'Redis',
                'Thread ' + (parseInt(forkId as string) + 1),
                'Redis client had an error: ' + JSON.stringify(err.message)
            );
        }
    );
    //Handle messages from master process sent via IPC
    process.on('message', function (message: any) {
        switch (message.type) {
            case 'banIP':
                for (const p in pools) {
                    if (pools[p].stratumServer)
                        pools[p].stratumServer.addBannedIP(message.ip);
                }
                break;

            case 'blocknotify':
                var messageCoin = message.coin.toLowerCase();
                var poolTarget = Object.keys(pools).filter(function (p) {
                    return p.toLowerCase() === messageCoin;
                })[0];

                if (poolTarget)
                    pools[poolTarget].processBlockNotify(
                        message.hash,
                        'blocknotify script'
                    );

                break;

            // IPC message for pool switching
            case 'coinswitch':
                var logSystem = 'Proxy';
                var logComponent = 'Switch';
                var logSubCat = 'Thread ' + (parseInt(forkId as string) + 1);

                var switchName = message.switchName;

                var newCoin = message.coin;

                var algo = poolConfigs[newCoin].coin.algorithm;

                var newPool = pools[newCoin];
                var oldCoin = proxySwitch[switchName].currentPool;
                var oldPool = pools[oldCoin];
                var proxyPorts = Object.keys(proxySwitch[switchName].ports);

                if (newCoin == oldCoin) {
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'Switch message would have no effect - ignoring ' +
                            newCoin
                    );
                    break;
                }

                logger.debug(
                    logSystem,
                    logComponent,
                    logSubCat,
                    'Proxy message for ' +
                        algo +
                        ' from ' +
                        oldCoin +
                        ' to ' +
                        newCoin
                );

                if (newPool) {
                    oldPool.relinquishMiners(
                        function (miner: any, cback: any) {
                            // relinquish miners that are attached to one of the "Auto-switch" ports and leave the others there.
                            cback(
                                proxyPorts.indexOf(
                                    miner.client.socket.localPort.toString()
                                ) !== -1
                            );
                        },
                        function (clients: any) {
                            newPool.attachMiners(clients);
                        }
                    );
                    proxySwitch[switchName].currentPool = newCoin;

                    redisClient
                        .hSet('proxyState', algo, newCoin)
                        .then(function () {
                            logger.debug(
                                logSystem,
                                logComponent,
                                logSubCat,
                                'Last proxy state saved to redis for ' + algo
                            );
                        })
                        .catch(function (error: any) {
                            logger.error(
                                logSystem,
                                logComponent,
                                logSubCat,
                                'Redis error writing proxy config: ' +
                                    JSON.stringify(error.message)
                            );
                        });
                }
                break;
        }
    });

    Object.keys(poolConfigs).forEach(function (coin) {
        const poolOptions = poolConfigs[coin];

        const logSystem = 'Pool';
        const logComponent = coin;
        const logSubCat = 'Thread ' + (parseInt(forkId as string) + 1);

        const handlers: any = {
            auth: function () {},
            share: function () {},
            diff: function () {}
        };

        //Internal share / payment processing (shares are written to Redis).
        const shareProcessor = new (ShareProcessor as any)(logger, poolOptions);

        handlers.auth = function (
            port: any,
            workerName: any,
            password: any,
            authCallback: any
        ) {
            if (poolOptions.validateWorkerUsername !== true) authCallback(true);
            else {
                pool.daemon.cmd(
                    'validateaddress',
                    [String(workerName).split('.')[0]],
                    function (results: any) {
                        const isValid =
                            results.filter(function (r: any) {
                                if (r.response) return r.response.isvalid;
                                return false;
                            }).length > 0;
                        authCallback(isValid);
                    }
                );
            }
        };

        handlers.share = function (
            isValidShare: any,
            isValidBlock: any,
            data: any
        ) {
            shareProcessor.handleShare(isValidShare, isValidBlock, data);
        };

        const authorizeFN = function (
            ip: any,
            port: any,
            workerName: any,
            password: any,
            callback: any
        ) {
            handlers.auth(
                port,
                workerName,
                password,
                function (authorized: any) {
                    const authString = authorized
                        ? 'Authorized'
                        : 'Unauthorized ';

                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        authString +
                            ' ' +
                            workerName +
                            ':' +
                            password +
                            ' [' +
                            ip +
                            ']'
                    );
                    callback({
                        error: null,
                        authorized: authorized,
                        disconnect: false
                    });
                }
            );
        };

        // createPool takes (options, authorizeFn); a stray third argument
        // used to vanish behind an any-cast.
        var pool = createPool(poolOptions, authorizeFN);
        pool.on(
            'share',
            function (isValidShare: any, isValidBlock: any, data: any) {
                if (data.worker != undefined)
                    data.worker = data.worker.replace(/:/g, '-');

                const shareData = JSON.stringify(data);

                if (data.blockHash && !isValidBlock)
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'We thought a block was found but it was rejected by the daemon, share data: ' +
                            shareData
                    );
                else if (isValidBlock)
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'Block found: ' + data.blockHash + ' by ' + data.worker
                    );

                if (isValidShare) {
                    if (data.shareDiff > 1000000000) {
                        logger.debug(
                            logSystem,
                            logComponent,
                            logSubCat,
                            'Share was found with diff higher than 1.000.000.000!'
                        );
                    }
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'Share accepted at diff ' +
                            data.difficulty +
                            '/' +
                            data.shareDiff +
                            ' by ' +
                            data.worker +
                            ' [' +
                            data.ip +
                            ']'
                    );
                } else if (!isValidShare) {
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'Share rejected: ' + shareData
                    );
                }

                // handle the share
                handlers.share(isValidShare, isValidBlock, data);

                // send to master for pplnt time tracking — only the pplnt payment mode
                // uses per-worker share times, so skip the IPC + Redis writes + logs for
                // every other mode (prop/solo/pps/...).
                if (
                    poolOptions.paymentProcessing &&
                    poolOptions.paymentProcessing.paymentMode === 'pplnt'
                ) {
                    process.send!({
                        type: 'shareTrack',
                        thread: parseInt(forkId as string) + 1,
                        coin: poolOptions.coin.name,
                        isValidShare: isValidShare,
                        isValidBlock: isValidBlock,
                        data: data
                    });
                }
            }
        )
            .on('difficultyUpdate', function (workerName: any, diff: any) {
                logger.debug(
                    logSystem,
                    logComponent,
                    logSubCat,
                    'Difficulty update to diff ' +
                        diff +
                        ' workerName=' +
                        JSON.stringify(workerName)
                );
                handlers.diff(workerName, diff);
            })
            .on('log', function (severity: any, text: any) {
                (logger as any)[severity](
                    logSystem,
                    logComponent,
                    logSubCat,
                    text
                );
            })
            .on('banIP', function (ip: any, worker: any) {
                process.send!({ type: 'banIP', ip: ip });
            })
            .on('started', function () {
                _this.setDifficultyForProxyPort(
                    pool,
                    poolOptions.coin.name,
                    poolOptions.coin.algorithm
                );
            });

        pool.start();
        pools[poolOptions.coin.name] = pool;
    });

    if (portalConfig.switching) {
        var logSystem = 'Switching';
        var logComponent = 'Setup';
        const logSubCat = 'Thread ' + (parseInt(forkId as string) + 1);

        let proxyState: any = {};

        //
        // Load proxy state for each algorithm from redis which allows NOMP to resume operation
        // on the last pool it was using when reloaded or restarted
        //
        logger.debug(
            logSystem,
            logComponent,
            logSubCat,
            'Loading last proxy state from redis'
        );

        /*redisClient.on('error', function(err){
            logger.debug(logSystem, logComponent, logSubCat, 'Pool configuration failed: ' + err);
        });*/

        redisClient
            .hGetAll('proxyState')
            .catch(function () {
                return {};
            })
            .then(function (obj: any) {
                if (obj && Object.keys(obj).length > 0) {
                    proxyState = obj;
                    logger.debug(
                        logSystem,
                        logComponent,
                        logSubCat,
                        'Last proxy state loaded from redis'
                    );
                }

                //
                // Setup proxySwitch object to control proxy operations from configuration and any restored
                // state.  Each algorithm has a listening port, current coin name, and an active pool to
                // which traffic is directed when activated in the config.
                //
                // In addition, the proxy config also takes diff and varDiff parmeters the override the
                // defaults for the standard config of the coin.
                //
                Object.keys(portalConfig.switching).forEach(
                    function (switchName) {
                        const algorithm =
                            portalConfig.switching[switchName].algorithm;

                        if (!portalConfig.switching[switchName].enabled) return;

                        const initalPool = proxyState.hasOwnProperty(algorithm)
                            ? proxyState[algorithm]
                            : _this.getFirstPoolForAlgorithm(algorithm);
                        proxySwitch[switchName] = {
                            algorithm: algorithm,
                            ports: portalConfig.switching[switchName].ports,
                            currentPool: initalPool,
                            servers: []
                        };

                        Object.keys(proxySwitch[switchName].ports).forEach(
                            function (port) {
                                const f = net
                                    .createServer(function (socket) {
                                        const currentPool =
                                            proxySwitch[switchName].currentPool;

                                        logger.debug(
                                            logSystem,
                                            'Connect',
                                            logSubCat,
                                            'Connection to ' +
                                                switchName +
                                                ' from ' +
                                                socket.remoteAddress +
                                                ' on ' +
                                                port +
                                                ' routing to ' +
                                                currentPool
                                        );

                                        if (pools[currentPool])
                                            pools[currentPool]
                                                .getStratumServer()
                                                .handleNewClient(socket);
                                        else
                                            pools[initalPool]
                                                .getStratumServer()
                                                .handleNewClient(socket);
                                    })
                                    .listen(parseInt(port), function () {
                                        logger.debug(
                                            logSystem,
                                            logComponent,
                                            logSubCat,
                                            'Switching "' +
                                                switchName +
                                                '" listening for ' +
                                                algorithm +
                                                ' on port ' +
                                                port +
                                                ' into ' +
                                                proxySwitch[switchName]
                                                    .currentPool
                                        );
                                    });
                                proxySwitch[switchName].servers.push(f);
                            }
                        );
                    }
                );
            });
    }

    this.getFirstPoolForAlgorithm = function (algorithm: any) {
        let foundCoin = '';
        Object.keys(poolConfigs).forEach(function (coinName) {
            if (poolConfigs[coinName].coin.algorithm == algorithm) {
                if (foundCoin === '') foundCoin = coinName;
            }
        });
        return foundCoin;
    };

    //
    // Called when stratum pool emits its 'started' event to copy the initial diff and vardiff
    // configuation for any proxy switching ports configured into the stratum pool object.
    //
    this.setDifficultyForProxyPort = function (
        pool: any,
        coin: any,
        algo: any
    ) {
        logger.debug(
            logSystem,
            logComponent,
            algo,
            'Setting proxy difficulties after pool start'
        );

        Object.keys(portalConfig.switching).forEach(function (switchName) {
            if (!portalConfig.switching[switchName].enabled) return;

            const switchAlgo = portalConfig.switching[switchName].algorithm;
            if (pool.options.coin.algorithm !== switchAlgo) return;

            // we know the switch configuration matches the pool's algo, so setup the diff and
            // vardiff for each of the switch's ports
            for (const port in portalConfig.switching[switchName].ports) {
                if (portalConfig.switching[switchName].ports[port].varDiff)
                    pool.setVarDiff(
                        port,
                        portalConfig.switching[switchName].ports[port].varDiff
                    );

                if (portalConfig.switching[switchName].ports[port].diff) {
                    if (!pool.options.ports.hasOwnProperty(port))
                        pool.options.ports[port] = {};
                    pool.options.ports[port].diff =
                        portalConfig.switching[switchName].ports[port].diff;
                }
            }
        });
    };
}
