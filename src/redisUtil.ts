import { createClient } from 'redis';

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
}

/*
 * node-redis v4+ requires an explicit connect() call and at least one
 * 'error' listener (a client without one crashes the process on the first
 * network error). Commands issued before the connection is ready are held
 * in the client's offline queue, which preserves the fire-and-forget
 * construction style the portal modules use.
 */
/** Warn once per endpoint rather than per pool fork. */
const warnedEndpoints = new Set<string>();

/**
 * An unauthenticated Redis reachable off-host holds the whole pool's share
 * ledger, balances and payment history in the open — anyone who can connect
 * can rewrite what miners are owed. Say so, loudly, once per endpoint.
 */
function warnIfExposed(redisConfig: RedisConfig) {
    const host = String(redisConfig.host || '127.0.0.1');
    const isLoopback =
        host === '127.0.0.1' ||
        host === 'localhost' ||
        host === '::1' ||
        host.startsWith('127.');
    if (isLoopback || redisConfig.password) return;
    const endpoint = `${host}:${redisConfig.port}`;
    if (warnedEndpoints.has(endpoint)) return;
    warnedEndpoints.add(endpoint);
    console.warn(
        `[SECURITY] Redis at ${endpoint} is configured without a password and ` +
            'is not on loopback. It holds every share, balance and payment ' +
            'record for this pool. Set requirepass (and redis.password, or the ' +
            'REDIS_PASSWORD environment variable) and firewall the port to the ' +
            'pool hosts. See docs/security.md.'
    );
}

export function createRedisClient(
    redisConfig: RedisConfig,
    onError?: (err: unknown) => void
) {
    warnIfExposed(redisConfig);
    const client = createClient({
        socket: {
            host: redisConfig.host,
            port: redisConfig.port
        },
        ...(redisConfig.password ? { password: redisConfig.password } : {})
    });
    client.on('error', onError || function () {});
    // connect() failures also arrive on the 'error' event
    client.connect().catch(function () {});
    return client;
}

/** The concrete node-redis client type our createRedisClient() returns. */
export type RedisClient = ReturnType<typeof createRedisClient>;

/*
 * Run an array of raw [command, arg, ...] tuples in a single MULTI/EXEC,
 * the calling convention the portal used with node-redis v3. Replies are
 * raw RESP values: commands like HGETALL yield a flat [field, value, ...]
 * array here, not an object (see flatRepliesToObject).
 */
export function execCommands(
    client: RedisClient,
    commands: Array<Array<string | number>>
) {
    const multi = client.multi();
    for (const args of commands) {
        multi.addCommand(args.map(String));
    }
    return multi.exec();
}

/* Convert a raw flat HGETALL reply ([field, value, ...]) into an object. */
export function flatRepliesToObject(reply: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    for (let i = 0; i < reply.length; i += 2) {
        obj[reply[i]] = reply[i + 1];
    }
    return obj;
}
