import type net from 'net';

/*
 * Socket helpers shared by the stratum and getwork servers.
 */

/** What a '::' bind raises on a host whose kernel has no IPv6. */
const NO_IPV6 = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL']);

/**
 * Listen on every address, IPv6 and IPv4 alike.
 *
 * Binding '0.0.0.0' served IPv4 only. A pool whose hostname also carries an
 * AAAA record then refused every miner that resolved it over IPv6 — and the
 * miners kept retrying that address instead of falling back, so the pool
 * never saw them at all. '::' without ipv6Only takes both families; a host
 * with IPv6 disabled gets the IPv4 bind instead. Listen errors reach
 * `onError` rather than crashing the fork.
 */
export function listenDualStack(
    server: net.Server,
    port: number,
    onListening: () => void,
    onError: (err: NodeJS.ErrnoException) => void
): net.Server {
    let host = '::';
    server.on('error', function (err: NodeJS.ErrnoException) {
        if (host === '::' && NO_IPV6.has(String(err.code))) {
            host = '0.0.0.0';
            server.listen({ port, host }, onListening);
            return;
        }
        onError(err);
    });
    server.listen({ port, host, ipv6Only: false }, onListening);
    return server;
}

/**
 * A dual-stack socket reports an IPv4 peer as IPv4-mapped IPv6
 * ('::ffff:1.2.3.4'). Everything keyed by address — bans, logs, stats —
 * expects the plain form.
 */
export function normalizeIp(address: string | null | undefined): string {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address || '');
    return mapped ? mapped[1] : address || '';
}
