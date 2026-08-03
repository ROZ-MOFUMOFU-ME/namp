import events from 'events';
import net from 'net';

/*
 * Ethash stratum server (eth-proxy dialect).
 *
 * Ethash miners do not speak the Bitcoin stratum in src/stratum.ts — there is
 * no extranonce, no coinbase and no merkle branch to send. The dialect
 * implemented here is eth-proxy, the one virtually every ethash miner
 * supports (ethminer, T-Rex, lolMiner, NBMiner, gminer, …):
 *
 *   -> {"id":1,"method":"eth_submitLogin","params":["<wallet>","<worker>"]}
 *   <- {"id":1,"result":true}
 *   -> {"id":2,"method":"eth_getWork","params":[]}
 *   <- {"id":2,"result":[headerHash, seedHash, shareBoundary]}
 *   <- {"id":0,"result":[...]}                 pushed on every new block
 *   -> {"id":3,"method":"eth_submitWork","params":[nonce, headerHash, mixHash]}
 *   <- {"id":3,"result":true|false}
 *   -> {"id":4,"method":"eth_submitHashrate","params":[rate, id]}
 *
 * Note the boundary sent to miners is the SHARE boundary derived from the
 * port difficulty, not the network one — miners hash against what the pool
 * asks of them, and the pool decides separately whether a share also solved
 * the block.
 */

const CLIENT_TIMEOUT_MS = 600000;

export interface EthashStratumOptions {
    ports: Record<string, { diff: number }>;
    connectionTimeout?: number;
    banning?: { enabled?: boolean };
}

let clientCounter = 0;

/**
 * One connected miner. Frames newline-delimited JSON and answers the
 * eth-proxy methods; everything policy-related is delegated upward.
 */
const StratumClient = function StratumClient(this: any, params: any) {
    const _this = this;
    const socket = params.socket;
    let buffer = '';

    this.id = `${++clientCounter}`;
    this.remoteAddress = socket.remoteAddress;
    this.port = params.port;
    this.difficulty = params.difficulty;
    this.authorized = false;
    this.workerName = null as string | null;
    this.lastActivity = Date.now();

    function send(payload: any) {
        if (socket.writable) socket.write(`${JSON.stringify(payload)}\n`);
    }
    this.send = send;

    /** Push work to the miner; id 0 marks an unsolicited job in eth-proxy. */
    this.sendWork = function (work: any, boundary: string) {
        if (!work) return;
        send({
            id: 0,
            jsonrpc: '2.0',
            result: [work.headerHash, work.seedHash, boundary],
        });
    };

    function handleMessage(message: any) {
        switch (message.method) {
            case 'eth_submitLogin': {
                const login = (message.params && message.params[0]) || '';
                const worker = (message.params && message.params[1]) || '';
                _this.emit(
                    'login',
                    { login, worker },
                    function (authorized: boolean) {
                        _this.authorized = authorized;
                        // Miners send the wallet as the login and an optional
                        // rig name; the pool credits "wallet.rig".
                        _this.workerName = worker ? `${login}.${worker}` : login;
                        send({ id: message.id, jsonrpc: '2.0', result: authorized });
                        if (!authorized) socket.destroy();
                    }
                );
                break;
            }
            case 'eth_getWork':
                _this.emit('getWork', function (work: any, boundary: string) {
                    if (!work) {
                        send({
                            id: message.id,
                            jsonrpc: '2.0',
                            error: { code: -1, message: 'no work available' },
                        });
                        return;
                    }
                    send({
                        id: message.id,
                        jsonrpc: '2.0',
                        result: [work.headerHash, work.seedHash, boundary],
                    });
                });
                break;
            case 'eth_submitWork': {
                const [nonce, headerHash, mixHash] = message.params || [];
                _this.emit(
                    'submit',
                    { nonce, headerHash, mixHash },
                    function (accepted: boolean, error?: any) {
                        send({
                            id: message.id,
                            jsonrpc: '2.0',
                            result: accepted,
                            error: accepted
                                ? null
                                : { code: error?.[0] ?? -1, message: error?.[1] },
                        });
                    }
                );
                break;
            }
            case 'eth_submitHashrate':
                // Informational only; miners expect an acknowledgement.
                _this.emit('hashrate', (message.params && message.params[0]) || '0x0');
                send({ id: message.id, jsonrpc: '2.0', result: true });
                break;
            default:
                send({
                    id: message.id,
                    jsonrpc: '2.0',
                    error: { code: -3, message: 'method not supported' },
                });
        }
    }

    socket.setEncoding('utf8');
    socket.on('data', function (chunk: string) {
        _this.lastActivity = Date.now();
        buffer += chunk;
        if (buffer.length > 10240) {
            // A miner never sends this much; drop rather than buffer forever.
            buffer = '';
            socket.destroy();
            return;
        }
        let index: number;
        while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (!line.trim()) continue;
            let message: any;
            try {
                message = JSON.parse(line);
            } catch {
                _this.emit('malformedMessage', line);
                socket.destroy();
                return;
            }
            handleMessage(message);
        }
    });
    socket.on('close', () => _this.emit('socketDisconnect'));
    socket.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') _this.emit('socketError', err);
    });

    this.disconnect = function () {
        socket.destroy();
    };
};
Object.setPrototypeOf(StratumClient.prototype, events.EventEmitter.prototype);

/**
 * Listens on the configured ports and keeps every connected miner supplied
 * with work. The pool wires authorization and share handling through events.
 */
const EthashStratumServer = function EthashStratumServer(
    this: any,
    options: EthashStratumOptions,
    authorizeFn: any
) {
    const _this = this;
    const clients: Record<string, any> = {};
    const listeners: any[] = [];
    let currentWork: any = null;
    let timeoutTimer: any = null;

    this.clients = clients;

    /** Boundary a miner hashes against, provided by the pool per difficulty. */
    this.boundaryForPort = function (_port: string): string {
        throw new Error('boundaryForPort must be provided by the pool');
    };

    function bindClient(client: any) {
        clients[client.id] = client;

        client.on('login', function (creds: any, callback: any) {
            authorizeFn(
                client.remoteAddress,
                client.port,
                creds.login,
                creds.worker,
                function (result: any) {
                    callback(result.authorized === true);
                    if (result.authorized) {
                        _this.emit('client.connected', client);
                        // Miners expect work immediately after logging in.
                        client.sendWork(currentWork, _this.boundaryForPort(client.port));
                    }
                }
            );
        });

        client.on('getWork', function (callback: any) {
            callback(currentWork, _this.boundaryForPort(client.port));
        });

        client.on('submit', function (submission: any, callback: any) {
            _this.emit(
                'share',
                {
                    ...submission,
                    difficulty: client.difficulty,
                    worker: client.workerName,
                    ip: client.remoteAddress,
                    port: client.port,
                },
                callback
            );
        });

        client.on('socketDisconnect', function () {
            delete clients[client.id];
            _this.emit('client.disconnected', client);
        });
        client.on('socketError', (err: any) =>
            _this.emit('log', 'warning', `Socket error from ${client.remoteAddress}: ${err}`)
        );
        client.on('malformedMessage', (line: string) =>
            _this.emit(
                'log',
                'warning',
                `Malformed message from ${client.remoteAddress}: ${line.slice(0, 80)}`
            )
        );
    }

    /** Broadcast fresh work to every authorized miner. */
    this.broadcastWork = function (work: any) {
        currentWork = work;
        for (const id of Object.keys(clients)) {
            const client = clients[id];
            if (client.authorized) {
                client.sendWork(work, _this.boundaryForPort(client.port));
            }
        }
    };

    this.start = function (callback?: () => void) {
        const ports = Object.keys(options.ports);
        let pending = ports.length;
        if (!pending) return callback?.();

        for (const port of ports) {
            const server = net.createServer({ allowHalfOpen: false }, function (socket: any) {
                const client = new (StratumClient as any)({
                    socket,
                    port,
                    difficulty: options.ports[port].diff,
                });
                bindClient(client);
            });
            listeners.push(server);
            server.listen(parseInt(port), '0.0.0.0', function () {
                if (--pending === 0) callback?.();
            });
        }

        // Drop miners that went away without closing the socket.
        const timeout = (options.connectionTimeout || 600) * 1000 || CLIENT_TIMEOUT_MS;
        timeoutTimer = setInterval(function () {
            const now = Date.now();
            for (const id of Object.keys(clients)) {
                if (now - clients[id].lastActivity > timeout) clients[id].disconnect();
            }
        }, 30000);
        timeoutTimer.unref?.();
    };

    /** Stop listening and drop every client. */
    this.stop = function (callback?: () => void) {
        if (timeoutTimer) clearInterval(timeoutTimer);
        for (const id of Object.keys(clients)) clients[id].disconnect();
        let pending = listeners.length;
        if (!pending) return callback?.();
        for (const listener of listeners) {
            listener.close(() => {
                if (--pending === 0) callback?.();
            });
        }
    };
};
Object.setPrototypeOf(EthashStratumServer.prototype, events.EventEmitter.prototype);

export { StratumClient };
export default EthashStratumServer;
