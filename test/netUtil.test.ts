import test from 'node:test';
import assert from 'node:assert/strict';
import events from 'node:events';
import net from 'node:net';

import { listenDualStack, normalizeIp } from '../src/netUtil.ts';

/*
 * Dual-stack listening. The production pool bound 0.0.0.0 while its hostname
 * had an AAAA record: every miner that resolved IPv6 first was refused and
 * never fell back. These pin the bind and the address form the rest of the
 * pool sees.
 */

function connectOnce(port: number, host: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.once('connect', () => {
            const local = socket.localAddress || '';
            socket.end();
            resolve(local);
        });
        socket.once('error', reject);
    });
}

test('one listener takes IPv4 and IPv6 peers; addresses come out plain', async () => {
    const seen: string[] = [];
    const server = net.createServer((socket) => {
        seen.push(normalizeIp(socket.remoteAddress));
        socket.end();
    });
    await new Promise<void>((resolve, reject) =>
        listenDualStack(server, 0, resolve, reject)
    );
    const port = (server.address() as net.AddressInfo).port;

    await connectOnce(port, '127.0.0.1');
    let hasV6Loopback = true;
    try {
        await connectOnce(port, '::1');
    } catch {
        hasV6Loopback = false; // the host has no IPv6 loopback; v4 still proves the bind
    }
    await new Promise((r) => setTimeout(r, 20));
    server.close();

    assert.equal(seen[0], '127.0.0.1', 'no ::ffff: prefix on an IPv4 peer');
    if (hasV6Loopback) assert.equal(seen[1], '::1');
});

/** A server double that fails the first bind the way a v4-only kernel does. */
function fakeServer(failWith: string | null, failOnlyV6 = true) {
    const server: any = new events.EventEmitter();
    server.binds = [] as any[];
    server.listen = function (opts: any, cb: () => void) {
        server.binds.push(opts);
        const fail = failWith && (!failOnlyV6 || opts.host === '::');
        setImmediate(() => {
            if (fail) {
                const err: any = new Error(failWith);
                err.code = failWith;
                server.emit('error', err);
            } else cb();
        });
        return server;
    };
    return server;
}

test('falls back to IPv4 when the kernel has no IPv6', async () => {
    const server = fakeServer('EAFNOSUPPORT');
    const errors: any[] = [];
    await new Promise<void>((resolve) =>
        listenDualStack(server, 3333, resolve, (e) => errors.push(e))
    );
    assert.deepEqual(
        server.binds.map((b: any) => b.host),
        ['::', '0.0.0.0']
    );
    assert.equal(server.binds[0].ipv6Only, false, 'dual-stack, not v6-only');
    assert.equal(errors.length, 0, 'a fallback is not an error');
});

test('any other listen error is reported once and not retried', async () => {
    const server = fakeServer('EADDRINUSE', false);
    const errors: any[] = [];
    let listening = 0;
    listenDualStack(
        server,
        3333,
        () => listening++,
        (e) => errors.push(e)
    );
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(server.binds.length, 1);
    assert.equal(listening, 0);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'EADDRINUSE');
});

test('normalizeIp strips only the IPv4-mapped prefix', () => {
    assert.equal(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
    assert.equal(normalizeIp('::FFFF:10.0.0.1'), '10.0.0.1');
    assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1');
    assert.equal(normalizeIp('::1'), '::1');
    assert.equal(normalizeIp('198.51.100.4'), '198.51.100.4');
    assert.equal(normalizeIp(undefined), '');
    assert.equal(normalizeIp(null), '');
});
