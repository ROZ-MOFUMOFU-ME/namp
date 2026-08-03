import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';

import { createEthashPool } from '../src/ethashPool.ts';

/*
 * Security behaviour of the public surfaces.
 *
 * Both a pool's stratum ports and its website are reachable from the open
 * internet; these pin the guards that keep an unauthenticated peer from
 * driving work, brute-forcing the admin password, or flooding a port.
 */

const HOST = '127.0.0.1';
const HEADER =
    '0xded75f7eca9e5f37d930dedace3ca48f0de82d261dfa4cd7e549ecac4efb10d7';
const SEED =
    '0xcc55dae5d4738f1350d80a23aed0b0b0049085afc24eca54277a4ce9600ff670';
const BOUNDARY =
    '0x000000004809a7a88ee02c52d11948e7796e29be9718d0fb7c669ec638196b2a';

const cleanup: Array<() => void> = [];
after(() => cleanup.forEach((fn) => fn()));

function startMockDaemon(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            const call = JSON.parse(body);
            const result =
                call.method === 'eth_getWork'
                    ? [HEADER, SEED, BOUNDARY, '0x2624a9']
                    : null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
        });
    });
    return new Promise((resolve) =>
        server.listen(0, HOST, () => resolve(server))
    );
}

/** Raw stratum conversation: no login unless the test sends one. */
function rawClient(port: number) {
    const socket = net.connect(port, HOST);
    socket.setEncoding('utf8');
    let buffer = '';
    const replies: any[] = [];
    socket.on('data', (chunk: string) => {
        buffer += chunk;
        let i: number;
        while ((i = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, i);
            buffer = buffer.slice(i + 1);
            if (line.trim()) replies.push(JSON.parse(line));
        }
    });
    return {
        socket,
        replies,
        connected: () =>
            new Promise<void>((resolve, reject) => {
                socket.once('connect', resolve);
                socket.once('error', reject);
            }),
        send: (msg: any) => socket.write(JSON.stringify(msg) + '\n'),
        waitFor: async (id: number, timeoutMs = 3000) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const hit = replies.find((r) => r.id === id);
                if (hit) return hit;
                await new Promise((r) => setTimeout(r, 20));
            }
            throw new Error(`no reply for id ${id}`);
        }
    };
}

async function startPool(ports: any) {
    const daemon = await startMockDaemon();
    cleanup.push(() => daemon.close());
    const pool: any = createEthashPool(
        {
            coin: { name: 'sec', symbol: 'SEC', algorithm: 'ethash' },
            blockRefreshInterval: 0,
            ports,
            daemons: [
                {
                    host: HOST,
                    port: (daemon.address() as net.AddressInfo).port,
                    user: '',
                    password: ''
                }
            ]
        },
        (_ip: any, _p: any, _l: any, _w: any, cb: any) =>
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

test('stratum refuses work and submissions before a login', async () => {
    const port = 4100 + (process.pid % 100);
    await startPool({ [port]: { diff: 1000 } });

    const client = rawClient(port);
    cleanup.push(() => client.socket.destroy());
    await client.connected();

    client.send({ id: 1, method: 'eth_getWork', params: [] });
    const work = await client.waitFor(1);
    assert.equal(work.result, undefined, 'no work for an anonymous peer');
    assert.match(work.error.message, /unauthorized/);

    client.send({
        id: 2,
        method: 'eth_submitWork',
        params: ['0x01', HEADER, '0x' + '22'.repeat(32)]
    });
    const submit = await client.waitFor(2);
    assert.equal(submit.result, false);
    assert.match(submit.error.message, /unauthorized/);
});

test('stratum drops a flooding connection instead of doing its work', async () => {
    const port = 4200 + (process.pid % 100);
    await startPool({ [port]: { diff: 1000 } });

    const client = rawClient(port);
    cleanup.push(() => client.socket.destroy());
    await client.connected();

    const closed = new Promise<boolean>((resolve) => {
        client.socket.once('close', () => resolve(true));
        setTimeout(() => resolve(false), 5000);
    });
    // Well past the per-window cap; a real miner never approaches this.
    for (let i = 0; i < 800; i++) {
        client.send({ id: i, method: 'eth_submitHashrate', params: ['0x1'] });
    }
    assert.equal(await closed, true, 'the flooder is disconnected');
});

test('an oversized line is dropped rather than buffered', async () => {
    const port = 4300 + (process.pid % 100);
    await startPool({ [port]: { diff: 1000 } });

    const client = rawClient(port);
    cleanup.push(() => client.socket.destroy());
    await client.connected();

    const closed = new Promise<boolean>((resolve) => {
        client.socket.once('close', () => resolve(true));
        setTimeout(() => resolve(false), 5000);
    });
    // 64 KB with no newline: a client trying to grow the pool's buffer.
    client.socket.write('x'.repeat(64 * 1024));
    assert.equal(await closed, true, 'the connection is closed');
});
