import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';

import { createPool } from '../src/pool.ts';
import * as util from '../src/util.ts';

/*
 * End-to-end integration test: getblocktemplate -> mining.notify -> share ->
 * submitblock, driven through the real pool against a mock coin daemon.
 *
 * Everything below the daemon is production code — pool, jobManager,
 * blockTemplate, the stratum server and the TCP protocol itself. The mock
 * speaks the JSON-RPC subset the pool actually calls (single and batch), so
 * the test exercises the startup handshake, job broadcast, share validation
 * and block submission exactly as a live pool does.
 *
 * sha256 hashes with util.sha256d (pure JS), and the template uses a
 * regtest-style target, so a short nonce scan finds a block.
 */

const HOST = '127.0.0.1';
// A well-formed base58check P2PKH address: addressToScript decodes it for real.
const POOL_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const EASY_BITS = '207fffff'; // ~2^254: most nonces clear it

interface DaemonState {
    calls: string[];
    submittedBlocks: string[];
    confirmedHashes: string[];
}

/** A coin daemon that answers exactly what pool startup and mining need. */
function startMockDaemon(state: DaemonState): Promise<http.Server> {
    const handlers: Record<string, (params: any[]) => any> = {
        validateaddress: () => ({
            isvalid: true,
            address: POOL_ADDRESS,
            scriptPubKey: '76a914' + '11'.repeat(20) + '88ac',
            ismine: true,
            pubkey: '02' + '22'.repeat(32)
        }),
        getdifficulty: () => 0.0001,
        getnetworkinfo: () => ({
            version: 200000,
            subversion: '/Mock:1.0/',
            protocolversion: 70015,
            connections: 8
        }),
        getmininginfo: () => ({
            blocks: 100,
            difficulty: 0.0001,
            networkhashps: 1000,
            chain: 'regtest'
        }),
        getnetworkhashps: () => 1000,
        getpeerinfo: () => [],
        getblocktemplate: () => ({
            version: 4,
            previousblockhash: '00'.repeat(32),
            bits: EASY_BITS,
            height: 101,
            curtime: Math.floor(Date.now() / 1000) - 10,
            coinbasevalue: 5000000000,
            // Must agree with bits: getblocktemplate's target takes precedence
            // over the bits-derived one in blockTemplate.
            target: '7fffff' + '00'.repeat(29),
            transactions: [],
            mutable: ['time', 'transactions', 'prevblock'],
            noncerange: '00000000ffffffff',
            sigoplimit: 20000,
            sizelimit: 1000000
        }),
        submitblock: (params: any[]) => {
            // Startup probes submitblock with no arguments; a real daemon
            // answers with an error, which is how the pool detects support.
            if (!params.length) {
                return {
                    __error: { code: -1, message: 'submitblock "hexdata"' }
                };
            }
            state.submittedBlocks.push(params[0]);
            return null; // null result == block accepted
        },
        getnewaddress: () => POOL_ADDRESS,
        // The pool confirms acceptance with getblock; answer for the hash it
        // just submitted, as a daemon that accepted the block would.
        getblock: (params: any[]) => {
            const hash = params[0];
            if (!state.submittedBlocks.length) {
                return { __error: { code: -5, message: 'Block not found' } };
            }
            state.confirmedHashes.push(hash);
            return { hash, tx: ['mock-coinbase-txid'], confirmations: 1 };
        }
    };

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const payload = JSON.parse(body || '{}');
            const one = (call: any) => {
                state.calls.push(call.method);
                const handler = handlers[call.method];
                if (handler) {
                    const value = handler(call.params || []);
                    return value && value.__error
                        ? { id: call.id, result: null, error: value.__error }
                        : { id: call.id, result: value, error: null };
                }
                return {
                    id: call.id,
                    result: null,
                    error: { code: -32601, message: 'Method not found' }
                };
            };
            const reply = Array.isArray(payload)
                ? payload.map(one)
                : JSON.stringify(one(payload));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(Array.isArray(payload) ? JSON.stringify(reply) : reply);
        });
    });

    return new Promise((resolve) =>
        server.listen(0, HOST, () => resolve(server))
    );
}

/** Minimal stratum client: subscribe, authorize, collect notifications. */
class StratumClient {
    socket: net.Socket;
    private buffer = '';
    private nextId = 1;
    private pending = new Map<number, (msg: any) => void>();
    notifications: any[] = [];
    difficulty = 1;

    constructor(port: number) {
        this.socket = net.connect(port, HOST);
        this.socket.setEncoding('utf8');
        this.socket.on('data', (chunk: string) => {
            this.buffer += chunk;
            let index: number;
            while ((index = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.slice(0, index);
                this.buffer = this.buffer.slice(index + 1);
                if (!line.trim()) continue;
                const msg = JSON.parse(line);
                if (msg.id !== null && this.pending.has(msg.id)) {
                    this.pending.get(msg.id)!(msg);
                    this.pending.delete(msg.id);
                } else if (msg.method) {
                    if (msg.method === 'mining.set_difficulty') {
                        this.difficulty = msg.params[0];
                    }
                    this.notifications.push(msg);
                }
            }
        });
    }

    connected() {
        return new Promise<void>((resolve, reject) => {
            this.socket.once('connect', resolve);
            this.socket.once('error', reject);
        });
    }

    call(method: string, params: any[]): Promise<any> {
        const id = this.nextId++;
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.socket.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }

    /** Wait for a mining.notify to arrive. */
    async job(timeoutMs = 5000): Promise<any> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const notify = this.notifications.find(
                (n) => n.method === 'mining.notify'
            );
            if (notify) return notify.params;
            await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('no mining.notify received');
    }

    close() {
        this.socket.destroy();
    }
}

const cleanup: Array<() => void> = [];
after(() => cleanup.forEach((fn) => fn()));

test('mines a block end to end against a mock daemon', async () => {
    const state: DaemonState = {
        calls: [],
        submittedBlocks: [],
        confirmedHashes: []
    };
    const daemon = await startMockDaemon(state);
    cleanup.push(() => daemon.close());
    const daemonPort = (daemon.address() as net.AddressInfo).port;

    const stratumPort = 3400 + Math.floor(process.pid % 100);
    const pool: any = createPool(
        {
            coin: {
                name: 'mockcoin',
                symbol: 'MOCK',
                algorithm: 'sha256',
                peerMagic: 'fabfb5da'
            },
            address: POOL_ADDRESS,
            rewardRecipients: {},
            blockRefreshInterval: 0, // no polling; the test drives the template
            jobRebroadcastTimeout: 3600, // no rebroadcast during the test
            connectionTimeout: 60,
            p2p: { enabled: false },
            ports: { [stratumPort]: { diff: 0.0001, varDiff: undefined } },
            daemons: [
                { host: HOST, port: daemonPort, user: 'mock', password: 'mock' }
            ]
        },
        (_ip: any, _port: any, _worker: any, _password: any, callback: any) =>
            callback({ error: null, authorized: true, disconnect: false })
    );
    cleanup.push(() => pool.stop());

    const shares: any[] = [];
    pool.on(
        'share',
        (isValid: boolean, isBlock: boolean, data: any, blockHex: any) =>
            shares.push({ isValid, isBlock, data, blockHex })
    );
    pool.on('log', () => {}); // the pool logs verbosely; the assertions speak instead

    pool.start();
    await new Promise<void>((resolve, reject) => {
        pool.once('started', resolve);
        setTimeout(() => reject(new Error('pool did not start')), 15000);
    });

    // The startup handshake asked the daemon for exactly what it needs.
    for (const method of [
        'validateaddress',
        'getdifficulty',
        'getmininginfo',
        'submitblock',
        'getblocktemplate'
    ]) {
        assert.ok(state.calls.includes(method), `startup must call ${method}`);
    }

    const client = new StratumClient(stratumPort);
    cleanup.push(() => client.close());
    await client.connected();

    const subscribe = await client.call('mining.subscribe', ['namp-test/1.0']);
    assert.equal(subscribe.error, null);
    const [, extraNonce1, extraNonce2Size] = subscribe.result;
    assert.equal(typeof extraNonce1, 'string');

    const authorize = await client.call('mining.authorize', [
        'miner.rig1',
        'x'
    ]);
    assert.equal(authorize.result, true, 'authorizeFn must accept the worker');

    const [
        jobId,
        prevHash,
        coinb1,
        coinb2,
        merkleBranch,
        version,
        bits,
        nTime
    ] = await client.job();
    assert.equal(
        merkleBranch.length,
        0,
        'the mock template carries no transactions'
    );
    assert.equal(bits, EASY_BITS);

    // Rebuild the header exactly as a miner does and scan for a block.
    const extraNonce2 = '00'.repeat(extraNonce2Size);
    const coinbase = Buffer.from(
        coinb1 + extraNonce1 + extraNonce2 + coinb2,
        'hex'
    );
    const merkleRoot = util
        .reverseBuffer(util.sha256d(coinbase))
        .toString('hex');

    const header = (nonce: string) =>
        Buffer.concat([
            Buffer.from(util.reverseHex(version), 'hex'),
            Buffer.from(util.reverseHex(prevHash), 'hex'),
            Buffer.from(util.reverseHex(merkleRoot), 'hex'),
            Buffer.from(util.reverseHex(nTime), 'hex'),
            Buffer.from(util.reverseHex(bits), 'hex'),
            Buffer.from(util.reverseHex(nonce), 'hex')
        ]);

    const target = util.bignumFromBitsHex(bits);
    let winningNonce: string | undefined;
    for (let n = 0; n < 20000; n++) {
        const nonce = n.toString(16).padStart(8, '0');
        const hash = util.reverseBuffer(util.sha256d(header(nonce)));
        if (BigInt('0x' + hash.toString('hex')) <= target) {
            winningNonce = nonce;
            break;
        }
    }
    assert.ok(
        winningNonce,
        'a block-clearing nonce must exist for the regtest target'
    );

    const submit = await client.call('mining.submit', [
        'miner.rig1',
        jobId,
        extraNonce2,
        nTime,
        winningNonce
    ]);
    assert.equal(
        submit.error,
        null,
        `share rejected: ${JSON.stringify(submit.error)}`
    );
    assert.equal(submit.result, true);

    // The pool reported the share as a block and handed the daemon a block.
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(shares.length, 1);
    assert.equal(shares[0].isValid, true);
    assert.equal(
        shares[0].isBlock,
        true,
        'the share cleared the network target'
    );
    assert.equal(shares[0].data.height, 101);
    assert.equal(shares[0].data.worker, 'miner.rig1');
    assert.ok(shares[0].data.blockHash, 'a found block carries its hash');
    assert.equal(
        shares[0].data.txHash,
        'mock-coinbase-txid',
        'the coinbase txid comes back from the getblock confirmation'
    );
    assert.deepEqual(
        state.confirmedHashes,
        [shares[0].data.blockHash],
        'the pool confirms the block it submitted via getblock'
    );

    assert.equal(
        state.submittedBlocks.length,
        1,
        'the block reached submitblock'
    );
    const submitted = state.submittedBlocks[0];
    assert.equal(
        submitted.slice(0, 160),
        header(winningNonce!).toString('hex'),
        'the submitted block starts with the header the miner solved'
    );
    assert.ok(
        submitted.includes(coinbase.toString('hex')),
        'the submitted block carries the coinbase the miner committed to'
    );
});
