import http from 'node:http';

/*
 * A coin daemon that answers exactly what pool startup and mining need: the
 * JSON-RPC subset the pool calls (single and batch), with a regtest-style
 * target so a short nonce scan finds a block. Shared by the stratum V1 and
 * V2 end-to-end tests.
 */

export const HOST = '127.0.0.1';
// A well-formed base58check P2PKH address: addressToScript decodes it for real.
export const POOL_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
export const EASY_BITS = '207fffff'; // ~2^254: most nonces clear it

export interface DaemonState {
    calls: string[];
    submittedBlocks: string[];
    confirmedHashes: string[];
}

/** A coin daemon that answers exactly what pool startup and mining need. */
export function startMockDaemon(
    state: DaemonState,
    overrides: Record<string, (params: any[]) => any> = {}
): Promise<http.Server> {
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

    Object.assign(handlers, overrides);

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
