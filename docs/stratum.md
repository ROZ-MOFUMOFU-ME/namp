# The stratum layer

The protocol modules in [`src/`](../src/) — `pool`, `stratum`, `jobManager`,
`blockTemplate`, `transactions`, `daemon`, `peer`, `varDiff` — are the
Bitcoin-family mining engine: one `Pool` per coin that polls the daemons,
builds jobs, serves stratum ports and validates shares. The portal
(`poolWorker.ts`) drives it; this page documents what it does and the
protocol it speaks. (This text began life as the node-stratum-pool README;
the Ethash engine is described in [ethash.md](ethash.md).)

## What the engine does

- Daemon RPC with batching, redundancy across several daemons and
  sync-progress reporting while a daemon is still catching up
- `getblocktemplate` → job manager → block template, coinbase and merkle
  construction (segwit witness commitments, PoW/PoS coinbases,
  transaction messages, Sapling/Koto roots, qtum-style headers)
- Stratum TCP (and TLS) servers on any number of ports, each with its own
  difficulty and variable-difficulty policy
- Share validation against the share target and the network target, block
  assembly and submission (`submitblock` or `getblocktemplate` submit)
- P2P peer connection to the daemon for instant block notifications
- Session management: zombie-worker purge, flood protection, invalid-share
  banning by IP, TCP proxy protocol for HAProxy-style load balancers
- Hashing through the native addon — the algorithm table lives in
  [`src/algoProperties.ts`](../src/algoProperties.ts), the sources in
  [native/README.md](../native/README.md)

## The protocol: Stratum V1 with the BIP 310 extensions

| Method                          | Behaviour                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mining.subscribe`              | Returns the subscription, the per-connection `extranonce1` and `extranonce2_size`. A user agent starting with `NiceHash/` switches the connection to the algorithm's documented NiceHash minimum difficulty.                                                                                                                                   |
| `mining.authorize`              | Validates `address.worker` (`validateaddress` on the daemon when `validateWorkerUsername` is on). Password options: `d=<diff>` starting difficulty, `md=<diff>` minimum difficulty with a narrow varDiff, `m=solo` solo flag.                                                                                                                  |
| `mining.configure`              | [BIP 310](https://github.com/bitcoin/bips/blob/master/bip-0310.mediawiki). Every requested extension is answered; `version-rolling` (overt AsicBoost) is granted when the coin definition carries `version_mask`, with the mask intersected with the miner's. Details in [adding-a-coin.md](adding-a-coin.md#version-rolling-overt-asicboost). |
| `mining.suggest_difficulty`     | Honoured within the port's bounds: varDiff's `[minDiff, maxDiff]`, or never below a fixed port's `diff`. Before subscription it becomes the starting difficulty, afterwards it is applied immediately with `mining.set_difficulty`.                                                                                                            |
| `mining.suggest_target`         | Converted to a difficulty and applied the same way.                                                                                                                                                                                                                                                                                            |
| `mining.extranonce.subscribe`   | Accepted (NiceHash and proxies require it). The pool never changes a connection's `extranonce1`, so no `mining.set_extranonce` follows.                                                                                                                                                                                                        |
| `mining.submit`                 | `[worker, job, extranonce2, ntime, nonce]`, plus the rolled version bits as a sixth parameter when version rolling is on. Duplicate, stale and out-of-range submissions are rejected with the standard error codes.                                                                                                                            |
| `mining.get_transactions`       | Not supported (answers an error).                                                                                                                                                                                                                                                                                                              |
| `mining.get_multiplier`, `ping` | Non-standard helpers some miners send; answered.                                                                                                                                                                                                                                                                                               |
| anything else                   | Logged as an unknown method and ignored (`mining.multi_version` from old Antminer firmware, for instance).                                                                                                                                                                                                                                     |

Notifications sent: `mining.set_difficulty`, `mining.notify` (with
`clean_jobs` on new blocks), and `client.reconnect` / `client.show_message`
where the portal uses them.

Stratum V2 is not implemented. SV2 firmware reaches the pool through the
Stratum Reference Implementation's translation proxy.

## Using the engine directly

The portal creates pools from `pool_configs/*.json`; the same object shape
works programmatically, which is how the integration tests drive it
([`test/mockDaemon.test.ts`](../test/mockDaemon.test.ts)):

```typescript
import { createPool } from './src/pool.ts';

const pool = createPool(
    {
        coin: {
            name: 'Bitcoin',
            symbol: 'BTC',
            algorithm: 'sha256',
            version_mask: '1fffe000',
            peerMagic: 'f9beb4d9',
            // address parameters already decoded (init.ts does this for
            // coins/*.json): pubKeyHash / scriptHash as numbers, bech32 as
            // the prefix
            mainnet: { pubKeyHash: 0x00, scriptHash: 0x05, bech32: 'bc' }
        },

        address: 'bc1q…', // block rewards go here
        rewardRecipients: { 'bc1q…fee': 1.0 }, // percent of each block, as coinbase outputs

        blockRefreshInterval: 500, // ms between getblocktemplate polls
        jobRebroadcastTimeout: 55, // s without a new block before the job is re-sent
        connectionTimeout: 600, // s of silence before a worker is dropped
        emitInvalidBlockHashes: false,
        tcpProxyProtocol: false, // true behind HAProxy send-proxy

        banning: {
            enabled: true,
            time: 600, // s
            invalidPercent: 50,
            checkThreshold: 500, // shares before the ratio is checked
            purgeInterval: 300 // s
        },

        ports: {
            3333: {
                diff: 2048,
                varDiff: {
                    minDiff: 128,
                    maxDiff: 1048576,
                    targetTime: 15, // s per share to aim for
                    retargetTime: 60, // s between retargets
                    variancePercent: 30
                }
            },
            3334: { diff: 262144 } // fixed difficulty, no varDiff
        },

        daemons: [
            {
                host: '127.0.0.1',
                port: 8332,
                user: 'rpcuser',
                password: 'rpcpassword'
            }
        ],

        p2p: {
            enabled: true,
            host: '127.0.0.1',
            port: 8333,
            disableTransactions: true
        }
    },
    function authorize(ip, port, workerName, password, callback) {
        callback({ error: null, authorized: true, disconnect: false });
    }
);

pool.on('share', (isValidShare, isValidBlock, data) => {
    // data: job, ip, port, worker, height, blockReward, difficulty,
    // shareDiff, blockDiff, blockDiffActual, blockHash (when a block was
    // found), blockHashInvalid (with emitInvalidBlockHashes), txHash,
    // error (when rejected)
});
pool.on('log', (severity, logKey, text) => {
    // severity: debug | warning | error; logKey: system | client
});
pool.on('difficultyUpdate', (workerName, diff) => {});
pool.on('started', () => {});

pool.start();
```

Pool options accepted by `createPool` are exactly the keys of a pool config
plus the `defaultPoolConfigs` block of `config.json`, so
[guide.md](guide.md) is the field reference.
