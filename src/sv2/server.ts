/*
 * The Stratum V2 server: Mining Protocol over Noise-encrypted TCP for the
 * Bitcoin-family pool. It serves the ports a pool config marks `sv2: true`
 * next to the V1 server, with the same job manager, share validation,
 * varDiff, banning and authorization:
 *
 *   handshake  -> SetupConnection -> Open{Standard,Extended}MiningChannel
 *   job flow   -> NewMiningJob / NewExtendedMiningJob (+ SetNewPrevHash on
 *                 a new block), SetTarget when varDiff retargets
 *   shares     -> SubmitShares{Standard,Extended} -> jobManager.processShare
 *                 -> SubmitShares.Success / SubmitShares.Error
 *
 * Standard channels get header-only jobs: the pool fixes the whole
 * extranonce per channel and computes that channel's merkle root. Extended
 * channels (proxies, the SRI translator) get the coinbase split around an
 * extranonce of the size they ask for and build the merkle root themselves.
 * Work selection (Job Declaration) is declined at SetupConnection; group
 * channels are not used (every channel gets its own jobs).
 */
import net from 'node:net';
import events from 'node:events';

import { listenDualStack, normalizeIp } from '../netUtil.ts';
import algos, { diff1 } from '../algoProperties.ts';
import * as codec from './codec.ts';
import * as noise from './noise.ts';
import { authorityFromSecret, encodePublicKey } from './keys.ts';
import { bigIntToBytes } from './secp256k1.ts';

export const VERSION_ROLLING_MASK = 0x1fffe000;
const MAX_TARGET = (1n << 256n) - 1n;
const MAX_EXTRANONCE_LEN = 32;
const DEFAULT_CERTIFICATE_VALIDITY = 24 * 3600;
const DEFAULT_DIFFICULTY = 8;
// Difficulties are doubles; 2^64 scaling keeps CPU-coin fractions and
// farm-size integers exact enough (relative error ~1e-16).
const SCALE = 1n << 64n;
const EMPTY = Buffer.alloc(0);

/** The 32-byte little-endian target a share of `difficulty` must hash under. */
export function targetForDifficulty(
    difficulty: number,
    multiplier: bigint
): Buffer {
    if (!(difficulty > 0)) throw new RangeError('difficulty must be positive');
    const scaled = BigInt(Math.round(difficulty * 2 ** 64)) || 1n;
    let target = (diff1 * multiplier * SCALE) / scaled;
    if (target > MAX_TARGET) target = MAX_TARGET;
    if (target < 1n) target = 1n;
    return bigIntToBytes(target).reverse();
}

export function targetToBigInt(targetLE: Uint8Array): bigint {
    return BigInt('0x' + Buffer.from(targetLE).reverse().toString('hex'));
}

/** The difficulty of a target (the share difficulty that target enforces). */
export function difficultyForTarget(
    target: bigint,
    multiplier: bigint
): number {
    if (target <= 0n) return Infinity;
    return Number((diff1 * multiplier * SCALE) / target) / 2 ** 64;
}

type ChannelJob = { templateJobId: string; version: number; height: number };

type Channel = {
    id: number;
    kind: 'standard' | 'extended';
    worker: string;
    extranoncePrefix: Buffer;
    extranonceSize: number;
    difficulty: number;
    previousDifficulty: number | undefined;
    maxTarget: bigint;
    nominalHashRate: number;
    jobs: Map<number, ChannelJob>;
    lastSequence: number;
    varDiffClient: any;
};

function mapShareError(error: any[], stale: boolean): string {
    switch (error[0]) {
        case 21:
            return stale ? 'stale-share' : 'invalid-job-id';
        case 22:
            return 'duplicate-share';
        case 23:
            return 'difficulty-too-low';
        default:
            return 'invalid-share';
    }
}

const hex32 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

class Sv2Connection extends events.EventEmitter {
    [key: string]: any;

    constructor(server: Sv2Server, socket: net.Socket) {
        super();
        this.server = server;
        this.socket = socket;
        this.remoteAddress = normalizeIp(socket.remoteAddress);
        this.localPort = socket.localPort;
        this.transport = null;
        this.decryptor = null;
        this.pending = EMPTY;
        this.ready = false;
        this.channels = new Map<number, Channel>();
        this.nextChannelId = 1;
        this.nextJobId = 1;
        this.lastActivity = Date.now();
        this.shares = { valid: 0, invalid: 0 };
        this.closed = false;
        this.device = '';

        socket.setKeepAlive(true);
        socket.on('data', (data: Buffer) => {
            try {
                this.onData(data);
            } catch (e: any) {
                this.fail(`protocol error: ${e && e.message ? e.message : e}`);
            }
        });
        socket.on('error', (err: any) => {
            server.log(
                'warning',
                `Socket error from ${this.label()}: ${err && err.message}`
            );
        });
        socket.on('close', () => {
            this.closed = true;
            for (const channel of this.channels.values())
                this.detachChannel(channel);
            this.channels.clear();
            this.emit('closed');
        });
    }

    label(): string {
        const workers = [...this.channels.values()].map(
            (c: Channel) => c.worker
        );
        return `${workers[0] || this.device || 'sv2'} [${this.remoteAddress}:${this.localPort}]`;
    }

    fail(reason: string) {
        if (this.closed) return;
        this.server.log('warning', `Dropping ${this.label()}: ${reason}`);
        this.socket.destroy();
    }

    send(name: codec.MessageName, body: Record<string, any>) {
        if (this.closed || this.transport === null) return;
        const frame = codec.encodeMessage(name, body);
        this.socket.write(noise.encryptFrame(this.transport.encryptor, frame));
    }

    onData(data: Buffer) {
        this.lastActivity = Date.now();
        if (this.transport === null) {
            this.pending = this.pending.length
                ? Buffer.concat([this.pending, data])
                : data;
            if (this.pending.length < noise.HANDSHAKE_MESSAGE_1_LEN) return;
            const message1 = this.pending.subarray(
                0,
                noise.HANDSHAKE_MESSAGE_1_LEN
            );
            const rest = this.pending.subarray(noise.HANDSHAKE_MESSAGE_1_LEN);
            this.pending = EMPTY;
            const { message2, transport } =
                this.server.responder.respond(message1);
            this.transport = transport;
            this.decryptor = new noise.FrameDecryptor(transport.decryptor);
            this.socket.write(message2);
            if (rest.length === 0) return;
            data = rest;
        }
        for (const frame of this.decryptor.push(data)) this.onFrame(frame);
    }

    onFrame(frame: Buffer) {
        const parsed = codec.parseFrame(frame);
        const message = codec.decodeMessage(parsed);
        if (message === null) {
            this.server.log(
                'debug',
                `Ignoring unknown SV2 message type 0x${parsed.msgType.toString(16)} (extension ${parsed.extensionType}) from ${this.label()}`
            );
            return;
        }
        if (!this.ready && message.name !== 'SetupConnection') {
            this.fail(`${message.name} before SetupConnection`);
            return;
        }
        switch (message.name) {
            case 'SetupConnection':
                return this.onSetupConnection(message.body);
            case 'OpenStandardMiningChannel':
                return this.onOpenChannel(message.body, false);
            case 'OpenExtendedMiningChannel':
                return this.onOpenChannel(message.body, true);
            case 'SubmitSharesStandard':
                return this.onSubmit(message.body, false);
            case 'SubmitSharesExtended':
                return this.onSubmit(message.body, true);
            case 'UpdateChannel':
                return this.onUpdateChannel(message.body);
            case 'CloseChannel':
                return this.onCloseChannel(message.body);
            default:
                this.server.log(
                    'debug',
                    `Ignoring ${message.name} from ${this.label()}`
                );
        }
    }

    onSetupConnection(body: any) {
        if (this.ready) return this.fail('duplicate SetupConnection');
        const refuse = (flags: number, errorCode: string) => {
            this.send('SetupConnectionError', { flags, errorCode });
            this.server.log(
                'warning',
                `SetupConnection from ${this.label()} refused: ${errorCode}`
            );
            this.socket.end();
        };
        if (body.protocol !== codec.MINING_PROTOCOL)
            return refuse(0, 'unsupported-protocol');
        if (
            body.minVersion > codec.SV2_PROTOCOL_VERSION ||
            body.maxVersion < codec.SV2_PROTOCOL_VERSION
        )
            return refuse(0, 'protocol-version-mismatch');
        let unsupported = 0;
        if (body.flags & codec.REQUIRES_WORK_SELECTION)
            unsupported |= codec.REQUIRES_WORK_SELECTION;
        if (
            body.flags & codec.REQUIRES_VERSION_ROLLING &&
            !this.server.versionRollingAllowed
        )
            unsupported |= codec.REQUIRES_VERSION_ROLLING;
        if (unsupported)
            return refuse(unsupported, 'unsupported-feature-flags');
        this.device = [body.vendor, body.firmware, body.deviceId]
            .filter(Boolean)
            .join(' ');
        this.requiresStandardJobs =
            (body.flags & codec.REQUIRES_STANDARD_JOBS) !== 0;
        this.ready = true;
        this.send('SetupConnectionSuccess', {
            usedVersion: codec.SV2_PROTOCOL_VERSION,
            flags: this.server.versionRollingAllowed
                ? 0
                : codec.REQUIRES_FIXED_VERSION
        });
        this.server.log(
            'debug',
            `SV2 connection set up by ${this.label()} (${this.device || 'no device info'})`
        );
    }

    onOpenChannel(body: any, extended: boolean) {
        const error = (code: string) => {
            this.send('OpenMiningChannelError', {
                requestId: body.requestId,
                errorCode: code
            });
            this.server.log(
                'warning',
                `Channel refused for ${this.label()}: ${code}`
            );
        };
        const worker = String(body.userIdentity || '').trim();
        if (!worker) return error('invalid-user-identity');
        const maxTarget = targetToBigInt(body.maxTarget);
        if (maxTarget === 0n) return error('max-target-out-of-range');
        const prefixLength = this.server.jobManager.extraNonceCounter.size;
        const extranonceSize = extended
            ? Math.max(
                  body.minExtranonceSize,
                  this.server.jobManager.extraNonce2Size
              )
            : 0;
        if (extended && prefixLength + extranonceSize > MAX_EXTRANONCE_LEN)
            return error('min-extranonce-size-too-large');
        this.server.authorize(
            this.remoteAddress,
            this.localPort,
            worker,
            (result: any) => {
                if (this.closed) return;
                if (!result || !result.authorized) {
                    error('unknown-user');
                    if (result && result.disconnect) this.socket.end();
                    return;
                }
                const channel = this.createChannel(
                    extended,
                    worker,
                    extranonceSize,
                    maxTarget,
                    body.nominalHashRate
                );
                const target = targetForDifficulty(
                    channel.difficulty,
                    this.server.multiplier
                );
                if (extended) {
                    this.send('OpenExtendedMiningChannelSuccess', {
                        requestId: body.requestId,
                        channelId: channel.id,
                        target,
                        extranonceSize: channel.extranonceSize,
                        extranoncePrefix: channel.extranoncePrefix,
                        groupChannelId: 0
                    });
                } else {
                    this.send('OpenStandardMiningChannelSuccess', {
                        requestId: body.requestId,
                        channelId: channel.id,
                        target,
                        extranoncePrefix: channel.extranoncePrefix,
                        groupChannelId: 0
                    });
                }
                this.server.log(
                    'debug',
                    `${channel.kind} channel ${channel.id} opened for ${worker} at difficulty ${channel.difficulty} [${this.remoteAddress}:${this.localPort}]`
                );
                this.sendJob(
                    channel,
                    this.server.jobManager.currentJob,
                    true,
                    true
                );
            }
        );
    }

    createChannel(
        extended: boolean,
        worker: string,
        extranonceSize: number,
        maxTarget: bigint,
        nominalHashRate: number
    ): Channel {
        const jobManager = this.server.jobManager;
        const counter = Buffer.from(jobManager.extraNonceCounter.next(), 'hex');
        const channel: Channel = {
            id: this.nextChannelId++,
            kind: extended ? 'extended' : 'standard',
            worker,
            // Standard channels own the whole extranonce (the pool rolls
            // nothing); extended channels append their own bytes to the prefix.
            extranoncePrefix: extended
                ? counter
                : Buffer.concat([
                      counter,
                      Buffer.alloc(jobManager.extraNonce2Size)
                  ]),
            extranonceSize,
            difficulty: this.server.initialDifficulty(
                this.localPort,
                nominalHashRate,
                maxTarget
            ),
            previousDifficulty: undefined,
            maxTarget,
            nominalHashRate,
            jobs: new Map(),
            lastSequence: 0,
            varDiffClient: null
        };
        this.channels.set(channel.id, channel);
        const varDiff = this.server.getVarDiff(this.localPort);
        if (varDiff) {
            // varDiff watches a client's 'submit' events and asks for a new
            // difficulty through enqueueNextDifficulty, as it does for V1.
            const client: any = new events.EventEmitter();
            client.socket = { localPort: this.localPort };
            client.difficulty = channel.difficulty;
            client.enqueueNextDifficulty = (newDiff: number) =>
                this.retarget(channel, newDiff);
            channel.varDiffClient = client;
            varDiff.manageClient(client);
        }
        return channel;
    }

    detachChannel(channel: Channel) {
        if (channel.varDiffClient) channel.varDiffClient.removeAllListeners();
    }

    /** Apply a new difficulty: SetTarget, then a fresh job that carries it. */
    retarget(channel: Channel, newDiff: number) {
        if (this.closed || !this.channels.has(channel.id)) return;
        const bounded = Math.max(
            newDiff,
            difficultyForTarget(channel.maxTarget, this.server.multiplier)
        );
        if (!(bounded > 0) || bounded === channel.difficulty) return;
        channel.previousDifficulty = channel.difficulty;
        channel.difficulty = bounded;
        if (channel.varDiffClient) channel.varDiffClient.difficulty = bounded;
        this.send('SetTarget', {
            channelId: channel.id,
            target: targetForDifficulty(bounded, this.server.multiplier)
        });
        this.sendJob(channel, this.server.jobManager.currentJob, false, false);
        this.server.emit('difficultyChanged', channel.worker, bounded);
    }

    /**
     * One job for one channel. A future job (no ntime) is activated by the
     * SetNewPrevHash that follows it; an immediately valid job carries the
     * template's time and rides the prevhash the channel already has.
     */
    sendJob(
        channel: Channel,
        template: any,
        future: boolean,
        activate: boolean
    ) {
        if (!template || this.closed) return;
        const jobManager = this.server.jobManager;
        const rpc = template.rpcData;
        const jobId = this.nextJobId++;
        const version = rpc.version >>> 0;
        const ntimeStart = future ? null : rpc.curtime;
        if (channel.kind === 'standard') {
            const prefixLength = jobManager.extraNonceCounter.size;
            const coinbase = template.serializeCoinbase(
                channel.extranoncePrefix.subarray(0, prefixLength),
                channel.extranoncePrefix.subarray(prefixLength)
            );
            const merkleRoot = template.merkleTree.withFirst(
                jobManager.coinbaseHasher(coinbase)
            );
            this.send('NewMiningJob', {
                channelId: channel.id,
                jobId,
                ntimeStart,
                version,
                merkleRoot
            });
        } else {
            const [coinbaseTxPrefix, coinbaseTxSuffix] = template.coinbaseParts(
                channel.extranoncePrefix.length + channel.extranonceSize
            );
            this.send('NewExtendedMiningJob', {
                channelId: channel.id,
                jobId,
                ntimeStart,
                version,
                versionRollingAllowed: this.server.versionRollingAllowed,
                merklePath: template.merkleTree.steps,
                coinbaseTxPrefix,
                coinbaseTxSuffix
            });
        }
        channel.jobs.set(jobId, {
            templateJobId: template.jobId,
            version,
            height: rpc.height
        });
        if (activate) {
            this.send('SetNewPrevHash', {
                channelId: channel.id,
                jobId,
                prevHash: Buffer.from(rpc.previousblockhash, 'hex').reverse(),
                ntimeStart: rpc.curtime,
                nbits: parseInt(rpc.bits, 16) >>> 0
            });
        }
        // Keep the previous block's jobs so late shares are reported stale, not unknown.
        for (const [id, job] of channel.jobs)
            if (job.height < rpc.height - 1) channel.jobs.delete(id);
    }

    onSubmit(body: any, extended: boolean) {
        const reject = (code: string) => {
            this.send('SubmitSharesError', {
                channelId: body.channelId,
                sequenceNumber: body.sequenceNumber,
                errorCode: code
            });
            this.shares.invalid++;
            this.checkBan();
        };
        const channel: Channel | undefined = this.channels.get(body.channelId);
        if (!channel) return reject('invalid-channel-id');
        if (extended !== (channel.kind === 'extended'))
            return reject('invalid-share');
        const job = channel.jobs.get(body.jobId);
        if (!job) return reject('invalid-job-id');
        const rolling = this.server.versionRollingAllowed;
        const fixedBits = (v: number) => (v & ~VERSION_ROLLING_MASK) >>> 0;
        if (
            rolling
                ? fixedBits(body.version) !== fixedBits(job.version)
                : body.version >>> 0 !== job.version
        )
            return reject('invalid-share');
        const prefixLength = this.server.jobManager.extraNonceCounter.size;
        let extraNonce1: Buffer;
        let extraNonce2: Buffer;
        if (extended) {
            if (body.extranonce.length !== channel.extranonceSize)
                return reject('bad-extranonce-size');
            extraNonce1 = channel.extranoncePrefix;
            extraNonce2 = body.extranonce;
        } else {
            extraNonce1 = channel.extranoncePrefix.subarray(0, prefixLength);
            extraNonce2 = channel.extranoncePrefix.subarray(prefixLength);
        }
        channel.lastSequence = body.sequenceNumber;
        const result = this.server.jobManager.processShare(
            job.templateJobId,
            channel.previousDifficulty,
            channel.difficulty,
            extraNonce1.toString('hex'),
            extraNonce2.toString('hex'),
            hex32(body.ntime),
            hex32(body.nonce),
            this.remoteAddress,
            this.localPort,
            channel.worker,
            rolling ? body.version >>> 0 : undefined,
            false,
            extraNonce2.length
        );
        if (channel.varDiffClient) channel.varDiffClient.emit('submit');
        if (result.error) {
            const current = this.server.jobManager.currentJob;
            return reject(
                mapShareError(
                    result.error,
                    !!current && job.height < current.rpcData.height
                )
            );
        }
        this.shares.valid++;
        this.send('SubmitSharesSuccess', {
            channelId: channel.id,
            lastSequenceNumber: body.sequenceNumber,
            newSubmitsAcceptedCount: 1,
            newSharesSum: BigInt(Math.max(1, Math.round(channel.difficulty)))
        });
        this.checkBan();
    }

    onUpdateChannel(body: any) {
        const channel: Channel | undefined = this.channels.get(body.channelId);
        if (!channel)
            return this.send('UpdateChannelError', {
                channelId: body.channelId,
                errorCode: 'invalid-channel-id'
            });
        const maxTarget = targetToBigInt(body.maxTarget);
        if (maxTarget === 0n)
            return this.send('UpdateChannelError', {
                channelId: body.channelId,
                errorCode: 'max-target-out-of-range'
            });
        channel.nominalHashRate = body.nominalHashRate;
        channel.maxTarget = maxTarget;
        const floor = difficultyForTarget(maxTarget, this.server.multiplier);
        if (channel.difficulty < floor) this.retarget(channel, floor);
    }

    onCloseChannel(body: any) {
        const channel: Channel | undefined = this.channels.get(body.channelId);
        if (!channel) return;
        this.detachChannel(channel);
        this.channels.delete(channel.id);
        this.server.log(
            'debug',
            `Channel ${channel.id} closed by ${this.label()}: ${body.reasonCode}`
        );
    }

    checkBan() {
        const banning = this.server.options.banning;
        if (!banning || !banning.enabled) return;
        const total = this.shares.valid + this.shares.invalid;
        if (total < banning.checkThreshold) return;
        const percentBad = (this.shares.invalid / total) * 100;
        if (percentBad < banning.invalidPercent) {
            this.shares = { valid: 0, invalid: 0 };
            return;
        }
        this.server.ban(this.remoteAddress);
        this.fail(
            `banned: ${this.shares.invalid} of the last ${total} shares were invalid`
        );
    }
}

export default class Sv2Server extends events.EventEmitter {
    [key: string]: any;

    constructor(
        options: any,
        authorizeFn: any,
        jobManager: any,
        getVarDiff: (port: number) => any
    ) {
        super();
        this.options = options;
        this.authorizeFn = authorizeFn;
        this.jobManager = jobManager;
        this.getVarDiff = getVarDiff;
        this.ports = Object.keys(options.ports || {}).filter(
            (p) => options.ports[p] && options.ports[p].sv2
        );
        this.connections = new Set<Sv2Connection>();
        this.bannedIPs = new Map<string, number>();
        this.servers = [];
        this.timers = [];
        const algo = algos[options.coin.algorithm] || {};
        this.multiplier = BigInt(algo.multiplier || 1);
        this.versionRollingAllowed =
            typeof options.coin.version_mask === 'string' &&
            /^[0-9A-Fa-f]+$/.test(options.coin.version_mask);
        this.certificateValidity =
            (options.sv2 && Number(options.sv2.certificateValiditySeconds)) ||
            DEFAULT_CERTIFICATE_VALIDITY;
        this.authority = null;
        this.authorityPublicKey = null;
        this.responder = null;
    }

    log(severity: string, text: string) {
        this.emit('log', severity, text);
    }

    authorize(
        ip: string,
        port: number,
        worker: string,
        callback: (result: any) => void
    ) {
        this.authorizeFn(ip, port, worker, '', callback);
    }

    /** Starting difficulty for a channel on `port`, from the port, the hashrate and the miner's max target. */
    initialDifficulty(
        port: number,
        nominalHashRate: number,
        maxTarget: bigint
    ): number {
        const portCfg = (this.options.ports || {})[port] || {};
        const varDiff = portCfg.varDiff;
        let difficulty =
            Number(portCfg.diff) > 0
                ? Number(portCfg.diff)
                : DEFAULT_DIFFICULTY;
        if (varDiff && nominalHashRate > 0 && varDiff.targetTime > 0) {
            const wanted =
                (nominalHashRate *
                    varDiff.targetTime *
                    Number(this.multiplier)) /
                2 ** 32;
            const lo = varDiff.minDiff > 0 ? varDiff.minDiff : difficulty;
            const hi = varDiff.maxDiff > 0 ? varDiff.maxDiff : Infinity;
            difficulty = Math.min(Math.max(wanted, lo), hi);
        }
        return Math.max(
            difficulty,
            difficultyForTarget(maxTarget, this.multiplier)
        );
    }

    ban(ip: string) {
        if (this.options.banning && this.options.banning.enabled)
            this.bannedIPs.set(ip, Date.now());
    }

    banRemaining(ip: string): number {
        const banning = this.options.banning;
        if (!banning || !banning.enabled || !this.bannedIPs.has(ip)) return 0;
        const left =
            banning.time * 1000 -
            (Date.now() - (this.bannedIPs.get(ip) as number));
        if (left <= 0) this.bannedIPs.delete(ip);
        return Math.max(0, left);
    }

    connectionCount(): number {
        return this.connections.size;
    }

    start() {
        if (this.ports.length === 0) {
            this.emit('started');
            return;
        }
        const secret = this.options.sv2 && this.options.sv2.authoritySecretKey;
        try {
            if (!secret) throw new Error('sv2.authoritySecretKey is not set');
            this.authority = authorityFromSecret(String(secret));
        } catch (e: any) {
            this.log(
                'error',
                `Stratum V2 ports ${this.ports.join(', ')} not opened: ${e.message}. Generate a key pair with "npm run sv2:keygen" and put the secret under sv2.authoritySecretKey in the pool config.`
            );
            this.emit('started');
            return;
        }
        this.authorityPublicKey = encodePublicKey(this.authority.publicKey);
        this.responder = new noise.Responder(
            this.authority,
            this.certificateValidity
        );

        const timeout = Number(this.options.connectionTimeout) || 600;
        this.timers.push(
            setInterval(() => {
                const now = Date.now();
                for (const connection of this.connections) {
                    if (now - connection.lastActivity > timeout * 1000)
                        connection.fail('connection timed out');
                }
            }, 30 * 1000)
        );
        if (this.options.banning && this.options.banning.enabled) {
            this.timers.push(
                setInterval(
                    () => {
                        for (const ip of [...this.bannedIPs.keys()])
                            this.banRemaining(ip);
                    },
                    (this.options.banning.purgeInterval || 300) * 1000
                )
            );
        }
        for (const timer of this.timers) timer.unref();

        let pending = this.ports.length;
        const done = () => {
            if (--pending === 0) this.emit('started');
        };
        for (const port of this.ports) {
            const server = net.createServer((socket) => this.accept(socket));
            listenDualStack(
                server,
                Number(port),
                () => {
                    this.log(
                        'debug',
                        `Stratum V2 listening on ${port} (authority key ${this.authorityPublicKey})`
                    );
                    done();
                },
                (err) => {
                    this.log(
                        'error',
                        `Stratum V2 port ${port} failed to open: ${err.message || err}`
                    );
                    done();
                }
            );
            this.servers.push(server);
        }
    }

    accept(socket: net.Socket) {
        const ip = normalizeIp(socket.remoteAddress);
        const remaining = this.banRemaining(ip);
        if (remaining > 0) {
            this.log(
                'debug',
                `Rejected SV2 connection from ${ip}, banned for ${Math.ceil(remaining / 1000)} more seconds`
            );
            socket.destroy();
            return;
        }
        const connection = new Sv2Connection(this, socket);
        this.connections.add(connection);
        connection.on('closed', () => this.connections.delete(connection));
    }

    /** A new template: future job + SetNewPrevHash on a new block, an immediately valid job otherwise. */
    broadcastJob(template: any, isNewBlock: boolean) {
        for (const connection of this.connections) {
            for (const channel of connection.channels.values()) {
                connection.sendJob(channel, template, isNewBlock, isNewBlock);
            }
        }
    }

    stop(callback?: () => void) {
        for (const timer of this.timers) clearInterval(timer);
        this.timers = [];
        for (const connection of this.connections) connection.socket.destroy();
        let pending = this.servers.length;
        if (pending === 0) {
            callback?.();
            return;
        }
        for (const server of this.servers) {
            server.close(() => {
                if (--pending === 0) callback?.();
            });
        }
        this.servers = [];
    }
}
