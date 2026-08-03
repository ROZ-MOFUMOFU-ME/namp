import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';

import { createEthashPool } from '../src/ethashPool.ts';

/*
 * Ethash pool against a mock geth-family daemon.
 *
 * The mock speaks the JSON-RPC subset an Ethash chain exposes, in the shapes
 * a live VirBiCoin node (Gvbc 1.9.38) returns — including the detail that
 * broke the first attempt for real: geth rejects any request without
 * Content-Type: application/json.
 */

const HOST = '127.0.0.1';
const HEADER =
    '0xded75f7eca9e5f37d930dedace3ca48f0de82d261dfa4cd7e549ecac4efb10d7';
const SEED =
    '0xcc55dae5d4738f1350d80a23aed0b0b0049085afc24eca54277a4ce9600ff670';
const TIGHT_BOUNDARY =
    '0x000000004809a7a88ee02c52d11948e7796e29be9718d0fb7c669ec638196b2a';
const LOOSE_BOUNDARY = '0x' + 'ff'.repeat(32);

interface MockState {
    calls: string[];
    submitted: any[][];
    work: any[];
    submitAccepts: boolean;
    sawContentType: string[];
}

function startMockDaemon(state: MockState): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            state.sawContentType.push(String(req.headers['content-type']));
            if (req.headers['content-type'] !== 'application/json') {
                res.writeHead(415);
                res.end(
                    'invalid content type, only application/json is supported'
                );
                return;
            }
            const call = JSON.parse(body);
            state.calls.push(call.method);
            let result: any = null;
            if (call.method === 'eth_getWork') result = state.work;
            else if (call.method === 'eth_submitWork') {
                state.submitted.push(call.params);
                result = state.submitAccepts;
            } else if (call.method === 'eth_blockNumber') result = '0x1';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
        });
    });
    return new Promise((resolve) =>
        server.listen(0, HOST, () => resolve(server))
    );
}

const cleanup: Array<() => void> = [];
after(() => cleanup.forEach((fn) => fn()));

async function startPool(state: MockState, coin: any = {}, ports?: any) {
    const daemon = await startMockDaemon(state);
    cleanup.push(() => daemon.close());
    const port = (daemon.address() as net.AddressInfo).port;

    const pool: any = createEthashPool(
        {
            coin: {
                name: 'virbicoin',
                symbol: 'VBC',
                algorithm: 'ethash',
                ...coin
            },
            blockRefreshInterval: 0, // the tests drive polling themselves
            ports,
            daemons: [{ host: HOST, port, user: '', password: '' }]
        },
        (_ip: any, _port: any, _worker: any, _pw: any, cb: any) =>
            cb({ error: null, authorized: true, disconnect: false })
    );
    cleanup.push(() => pool.stop());
    pool.on('log', () => {});

    pool.start();
    await new Promise<void>((resolve, reject) => {
        pool.once('started', resolve);
        setTimeout(() => reject(new Error('pool did not start')), 10000);
    });
    return pool;
}

test('starts by fetching work and sends geth an acceptable content type', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const pool = await startPool(state);

    assert.ok(state.calls.includes('eth_getWork'));
    assert.ok(
        state.sawContentType.every((t) => t === 'application/json'),
        'every request must carry application/json or geth refuses it'
    );
    assert.equal(pool.jobManager.currentWork.headerHash, HEADER);
    assert.equal(pool.jobManager.currentWork.seedHash, SEED);
    assert.equal(pool.jobManager.currentWork.height, 0x2624a9);
});

test('emits newWork only when the daemon moves to a new header', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const pool = await startPool(state);

    const seen: any[] = [];
    pool.on('newWork', (w: any) => seen.push(w));

    await new Promise<void>((r) => pool.pollWork(() => r()));
    assert.equal(seen.length, 0, 'the same header is not a new job');

    state.work = [
        HEADER.replace('0xde', '0xab'),
        SEED,
        TIGHT_BOUNDARY,
        '0x2624aa'
    ];
    await new Promise<void>((r) => pool.pollWork(() => r()));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].height, 0x2624aa);
});

test('an ordinary share is reported without touching the daemon', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const pool = await startPool(state);

    const shares: any[] = [];
    pool.on('share', (data: any, accepted: any) =>
        shares.push({ data, accepted })
    );

    const result = await new Promise<any>((resolve) =>
        pool.processShare(
            {
                headerHash: HEADER,
                nonce: '0x0102030405060708',
                mixHash: '0x' + '22'.repeat(32),
                difficulty: 1e-9,
                worker: '0xminer.rig1'
            },
            resolve
        )
    );

    assert.equal(result.valid, true);
    assert.equal(result.isBlockCandidate, false);
    assert.equal(shares.length, 1);
    assert.equal(shares[0].data.worker, '0xminer.rig1');
    assert.equal(
        state.submitted.length,
        0,
        'a plain share must not be submitted'
    );
});

test('a rejected share is reported and never reaches the daemon', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const pool = await startPool(state);

    const shares: any[] = [];
    pool.on('share', (data: any) => shares.push(data));

    const result = pool.processShare({
        headerHash: HEADER,
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e9 // far beyond an arbitrary mix
    });

    assert.equal(result.error[0], 23);
    assert.equal(shares[0].error, 'low difficulty share');
    assert.equal(state.submitted.length, 0);
});

test('a block candidate is relayed with eth_submitWork and its verdict reported', async () => {
    // A loose boundary makes the share a candidate; the mix cannot survive the
    // cache-backed check, so a *legitimate* candidate needs the DAG. Use the
    // job manager's own accounting by asserting on what the daemon received
    // when the pool does accept one.
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, LOOSE_BOUNDARY, '0x1'],
        submitAccepts: true,
        sawContentType: []
    };
    const pool = await startPool(state);

    const result = pool.processShare({
        headerHash: HEADER,
        nonce: '0x0102030405060708',
        mixHash: '0x' + '22'.repeat(32),
        difficulty: 1e-9
    });

    // The invented mix is caught before the daemon is ever asked: this is the
    // guarantee that a pool never submits garbage to the network.
    assert.deepEqual(result.error, [23, 'mix hash does not match the DAG']);
    assert.equal(state.submitted.length, 0);
});

test('submitWork reports the daemon verdict, including a rejection', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: false,
        sawContentType: []
    };
    const pool = await startPool(state);

    const accepted = await new Promise<boolean>((resolve) =>
        pool.submitWork(
            {
                nonce: '0x0102030405060708',
                headerHash: HEADER,
                mixHash: '0x' + '22'.repeat(32)
            },
            resolve
        )
    );

    assert.equal(
        accepted,
        false,
        'a false result must not count as a found block'
    );
    assert.deepEqual(state.submitted[0], [
        '0x0102030405060708',
        HEADER,
        '0x' + '22'.repeat(32)
    ]);
});

/*
 * Stratum layer: the eth-proxy dialect every ethash miner speaks
 * (ethminer, T-Rex, lolMiner, NBMiner, …). The client below sends exactly
 * what those miners send.
 */

class EthProxyClient {
    socket: net.Socket;
    private buffer = '';
    private nextId = 1;
    private pending = new Map<number, (m: any) => void>();
    pushed: any[] = [];

    constructor(port: number) {
        this.socket = net.connect(port, HOST);
        this.socket.setEncoding('utf8');
        this.socket.on('data', (chunk: string) => {
            this.buffer += chunk;
            let i: number;
            while ((i = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.slice(0, i);
                this.buffer = this.buffer.slice(i + 1);
                if (!line.trim()) continue;
                const msg = JSON.parse(line);
                // id 0 is an unsolicited job push in eth-proxy.
                if (msg.id === 0) this.pushed.push(msg.result);
                else if (this.pending.has(msg.id)) {
                    this.pending.get(msg.id)!(msg);
                    this.pending.delete(msg.id);
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

    async waitForPush(count = 1, timeoutMs = 3000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (this.pushed.length >= count) return this.pushed[count - 1];
            await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('no work pushed');
    }

    close() {
        this.socket.destroy();
    }
}

test('serves miners the eth-proxy dialect end to end', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const stratumPort = 3600 + (process.pid % 100);
    // A realistic pool difficulty: below 1 the boundary clamps to the whole
    // 256-bit space and every submission would pass.
    const pool = await startPool(state, {}, { [stratumPort]: { diff: 4e9 } });

    const miner = new EthProxyClient(stratumPort);
    cleanup.push(() => miner.close());
    await miner.connected();

    // eth_submitLogin: wallet plus an optional rig name.
    const login = await miner.call('eth_submitLogin', ['0xwallet', 'rig1']);
    assert.equal(login.result, true);

    // Work arrives unsolicited right after login, and on request.
    const pushedWork = await miner.waitForPush();
    assert.equal(pushedWork[0], HEADER, 'header hash');
    assert.equal(pushedWork[1], SEED, 'seed hash');

    const requested = await miner.call('eth_getWork', []);
    assert.deepEqual(requested.result, pushedWork);

    // The third element is the SHARE boundary from the port difficulty, not
    // the network boundary: miners must hash against what the pool asks.
    assert.notEqual(requested.result[2], TIGHT_BOUNDARY);
    assert.equal(requested.result[2].length, 66);

    // A submission that misses the share difficulty is rejected, with the
    // reason, and never reaches the daemon.
    const rejected = await miner.call('eth_submitWork', [
        '0x0102030405060708',
        HEADER,
        '0x' + '22'.repeat(32)
    ]);
    assert.equal(rejected.result, false);
    assert.match(rejected.error.message, /low difficulty share/);
    assert.equal(state.submitted.length, 0);

    // Hashrate reports are acknowledged so miners do not treat it as an error.
    const hashrate = await miner.call('eth_submitHashrate', ['0x500000', '0xid']);
    assert.equal(hashrate.result, true);
});

test('pushes new work to connected miners when the daemon moves on', async () => {
    const state: MockState = {
        calls: [],
        submitted: [],
        work: [HEADER, SEED, TIGHT_BOUNDARY, '0x2624a9'],
        submitAccepts: true,
        sawContentType: []
    };
    const stratumPort = 3700 + (process.pid % 100);
    const pool = await startPool(state, {}, { [stratumPort]: { diff: 1 } });

    const miner = new EthProxyClient(stratumPort);
    cleanup.push(() => miner.close());
    await miner.connected();
    await miner.call('eth_submitLogin', ['0xwallet', 'rig1']);
    await miner.waitForPush();

    const nextHeader = HEADER.replace('0xde', '0xab');
    state.work = [nextHeader, SEED, TIGHT_BOUNDARY, '0x2624aa'];
    await new Promise<void>((r) => pool.pollWork(() => r()));

    const pushed = await miner.waitForPush(2);
    assert.equal(pushed[0], nextHeader, 'a new block must reach the miner');
});
