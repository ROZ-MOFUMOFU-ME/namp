# NAMP operator guide

NAMP is a complete mining pool in one repository: the portal (stats,
payments, web UI), the Bitcoin-family stratum engine, the Ethash engine and
the native hashing addon, run as one Node application. This guide takes a
pool from an empty server to a running portal. Adding a chain is covered in
[adding-a-coin.md](adding-a-coin.md); the other documents are listed in the
[README](../README.md#documentation).

Only tagged releases are considered stable: configuration keys and the Redis
schema can change between them, so read the release notes before pulling new
code into a production pool.

## Requirements

- A synced coin daemon per pool, with RPC enabled and a wallet holding the
  pool address (see [adding-a-coin.md](adding-a-coin.md#1-run-the-daemon)).
- [Node.js](https://nodejs.org/) **22.18 or newer** — tested on 22, 24 and 26. The backend is TypeScript run directly by Node's type stripping, so
  there is no build step for it.
- [Redis](https://redis.io/) **6.2 or newer** (the portal uses node-redis 6).
  Bind it to localhost or a private network and set a password; the pool,
  the website and the payment processor all keep their state there
  ([security.md](security.md)).
- A C/C++ toolchain with C++20 and Python 3 for the hashing addon:
  `build-essential python3` on Debian/Ubuntu. GCC 12 through 14 are verified
  against the addon's known-answer vectors.

## Install

```bash
git clone https://github.com/ROZ-MOFUMOFU-ME/namp.git
cd namp
npm install     # dependencies + the native hashing addon
npm run build   # the web UI (Vite + React) into web/dist
```

`npm install` compiles the addon in `native/`; a failure there is almost
always a missing compiler or Python. The web UI is the stack's only build
step; rebuild it after pulling changes under `web/`.

Everything is driven from the repo root:

| Command                   | What it does                                                       |
| ------------------------- | ------------------------------------------------------------------ |
| `npm start`               | Run the portal (`node src/init.ts`)                                |
| `npm run build`           | Build the web UI                                                   |
| `npm run web:dev`         | Vite dev server on :5173, proxying `/api` to a running portal      |
| `npm run check:config`    | Parse every config file the portal reads (also part of `npm test`) |
| `npm test`                | The whole test suite (hashing vectors, stratum, portal, payments)  |
| `npm run typecheck`       | `tsc --noEmit` for the backend and the web UI                      |
| `npm run lint` / `format` | ESLint / Prettier                                                  |
| `npm run rebuild:native`  | Recompile the addon (after `native/` changes or a Node upgrade)    |

## Configure

Three kinds of JSON, all read at startup. Comments (`//`, `/* */`) are
allowed in every one of them, and `_comment_*` keys are ignored.

| File                       | Purpose                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `config.json`              | The portal: logging, Redis, website, clustering, price feed, defaults every pool inherits    |
| `coins/<name>.json`        | A chain: algorithm, magic bytes, address parameters — [adding-a-coin.md](adding-a-coin.md)   |
| `pool_configs/<name>.json` | A pool on that chain: ports, payouts, daemons. One file per pool; `enabled: false` parks one |

Only the examples are committed (`config_example.json`,
`coins/coins-examples/`, `pool_configs/examples/`); your copies are
git-ignored.

### Portal config

```bash
cp config_example.json config.json
```

```javascript
{
    "logLevel": "debug",            // debug | warning | error
    "logColors": true,              // off when logging to a file

    /* The CLI listener (scripts/cli, admin tools) on localhost. */
    "cliPort": 17117,

    /* One stratum worker per CPU core ("auto") or a fixed count. The
       kernel load-balances miners across the forks; the website, payment
       processor and CLI run as their own processes. */
    "clustering": { "enabled": true, "forks": "auto" },

    /* Every pool config inherits these unless it sets its own. */
    "defaultPoolConfigs": {
        "blockRefreshInterval": 500,    // ms between getblocktemplate polls (p2p notifications are instant anyway)
        "jobRebroadcastTimeout": 55,    // s without a new block before the job is re-sent (miners drop silent pools)
        "connectionTimeout": 600,       // s of silence before a worker is disconnected
        "emitInvalidBlockHashes": false,
        "validateWorkerUsername": true, // miners must log in with a valid address
        "tcpProxyProtocol": false,      // true behind HAProxy send-proxy, or you ban your own IP
        "banning": {
            "enabled": true,
            "time": 600,            // s a banned IP stays banned
            "invalidPercent": 50,   // invalid-share ratio that triggers a ban
            "checkThreshold": 500,  // shares before the ratio is checked
            "purgeInterval": 300    // s between purges of expired bans
        }
    },

    "website": {
        "enabled": true,
        "host": "0.0.0.0",          // 127.0.0.1 behind nginx (reverse-proxy.md)
        "port": 8080,
        "stratumHost": "pool.example.com", // shown on the Getting Started page; also the default blockIdentifier
        "branding": { ... },        // see "Branding" below; config_example.json has every key
        "stats": {
            "updateInterval": 300,          // s between stats snapshots (and SSE pushes)
            "historicalRetention": 28800,   // s of history kept for the charts
            "hashrateWindow": 600           // s of shares used for hashrate figures
        },
        "adminCenter": { "enabled": false, "password": "password" }, // /admin and the admin API
        "tlsOptions": { "enabled": false, "cert": "", "key": "" }   // serve the site over HTTPS directly
    },

    /* One Redis for everything; pools may override with their own "redis".
       REDIS_HOST / REDIS_PORT / REDIS_PASSWORD in the environment win. */
    "redis": { "host": "127.0.0.1", "port": 6379, "password": "" },

    /* Algorithm-switching ports: miners connect per algorithm and the
       portal points them at the current best coin for it (profitSwitch).
       Off by default. */
    "switching": { "switch1": { "enabled": false, "algorithm": "sha256", "ports": { "3333": { "diff": 10, "varDiff": { ... } } } } },
    "profitSwitch": { "enabled": false, "updateInterval": 600, "threshold": 1.05 },

    /* Prices for the ticker, /api/prices and profit switching: CoinGecko
       and CoinPaprika, tried in order per symbol. */
    "priceFeed": {
        "enabled": false,
        "providers": ["coingecko", "coinpaprika"],
        "vsCurrency": "usd",
        "updateInterval": 300,
        "coins": { "BTC": { "coingecko": "bitcoin", "coinpaprika": "btc-bitcoin" } }
    },

    /* Log each pool wallet's balance to Redis (stats.pools[coin].walletBalance,
       the nomp_pool_wallet_balance metric). */
    "balanceLog": { "enabled": false, "interval": 300, "historyRetention": 86400 }
}
```

### Coin definition

```bash
cp coins/coins-examples/bitcoin.json coins/
```

The file names the algorithm, the P2P magic bytes, the address parameters
and the explorer and miner links for one chain. Every field, the
[version-rolling (AsicBoost)](adding-a-coin.md#version-rolling-overt-asicboost)
mask that SHA-256 ASICs need, and the list of algorithm names are in
[adding-a-coin.md](adding-a-coin.md#2-write-the-coin-definition). Eleven
examples ship (Bitcoin, BitZeny, Koto, MonaCoin, VIPSTARCOIN, Sugarchain,
Bellcoin, Yenten, KumaCoin, Susucoin, VirBiCoin), with testnet variants under
`coins/coins-examples-testnet/`.

### Pool config

```bash
cp pool_configs/examples/bitcoin.json pool_configs/
```

```javascript
{
    "enabled": true,
    "coin": "bitcoin.json",         // the coin definition, relative to coins/ ("testnet/bitcoin.json" for a testnet copy)

    "blockIdentifier": "",          // text embedded in the coinbase; "" uses website.stratumHost
    "address": "bc1q...",           // pool wallet address (must be in the daemon's wallet); block rewards land here
    "rewardRecipients": {           // pool fees as coinbase outputs: address -> percent of the block
        "bc1q...fee": 1.0
    },

    /* Koto / Zcash-family pools only: */
    // "zAddress": "",              // shielded address the rewards are moved through
    // "tAddress": "",              // transparent address payouts are sent from (not the pool address)
    // "walletInterval": 2.5,       // minutes between shielding operations
    // "urlInsight": "",            // alternative Insight explorer

    "paymentProcessing": {
        "enabled": true,
        "paymentMode": "solo",      // prop | pplnt | pplns | solo | pps | dpps | fpps | ppsplus | smpps | esmpps (payment-schemes.md)
        "pplns": { "n": 2, "maxLogLength": 100000 },    // per-mode settings; the examples carry every mode's block
        "minConf": 101,             // confirmations before a block pays out: at least the coinbase maturity
        "paymentInterval": 600,     // s between payout runs
        "minimumPayment": 0.001,    // coins; smaller balances carry over
        "maxBlocksPerPayment": 3,
        /* The payment processor opens its OWN daemon connection; filling
           in `daemons` below but leaving this one at the example values
           keeps mining working while every payout fails. */
        "daemon": { "host": "127.0.0.1", "port": 8332, "user": "rpcuser", "password": "rpcpassword" }
    },

    /* TLS for ports marked tls:true. Most miners only speak plaintext,
       so keep the main ports plain and add TLS ones (stratum-tls.md). */
    "tlsOptions": { "enabled": false, "serverKey": "", "serverCert": "", "ca": "" },

    /* One entry per stratum port. diff is the starting share difficulty;
       varDiff retargets each miner toward targetTime seconds per share
       inside [minDiff, maxDiff]. Sizing: adding-a-coin.md. */
    "ports": {
        "3333": {
            "diff": 2048,
            "tls": false,
            "varDiff": {
                "minDiff": 128,
                "maxDiff": 1048576,
                "targetTime": 15,
                "retargetTime": 60,
                "variancePercent": 30
            }
        },
        "3334": { "diff": 262144, "tls": false, "varDiff": { "minDiff": 65536, "maxDiff": 268435456, "targetTime": 15, "retargetTime": 60, "variancePercent": 30 } }
    },

    /* HTTP getwork bridge for miners that cannot speak the qtum-style
       stratum (VIPSTARCOIN). Same per-port shape; leave disabled otherwise. */
    "getwork": { "enabled": false, "ports": { "3336": { "diff": 0.5, "tls": false } } },

    "poolId": "main",               // region label when several stratum instances serve one coin

    "daemons": [                    // one or more; all are polled, any can submit a block
        { "host": "127.0.0.1", "port": 8332, "user": "rpcuser", "password": "rpcpassword" }
    ],

    /* Peer connection to the daemon for instant block notifications
       (needs peerMagic in the coin definition). */
    "p2p": { "enabled": true, "host": "127.0.0.1", "port": 8333, "disableTransactions": true }
}
```

Any key of `defaultPoolConfigs` (`banning`, `connectionTimeout`,
`blockRefreshInterval`, `jobRebroadcastTimeout`, `validateWorkerUsername`,
`tcpProxyProtocol`, `redis`) can be set here to override the portal default
for this pool. Ethash pools use a smaller shape described in
[ethash.md](ethash.md#pool-configuration).

Difficulty units: on `sha256` a share of difficulty 1 is 2³² hashes; scrypt
and the yescrypt/yespower family count 2¹⁶ hashes per difficulty unit. The
pool sums difficulty, not share count — a miner submitting ten shares at 0.1
and one submitting one share at 1.0 have done the same work.

### Block notifications and admin commands

New blocks arrive over P2P the moment the daemon sees them (`p2p.enabled`),
so no `blocknotify` script is needed; `blockRefreshInterval` polling is the
fallback.

Operator commands go through the password-gated admin API (also behind the
`/admin` page); the password is `website.adminCenter.password`:

```
POST /api/admin/reloadpool   { "password": "...", "coin": "bitcoin" }
POST /api/admin/coinswitch   { "password": "...", "coin": "bitcoin", "algorithm": "sha256" }
POST /api/admin/announcement { "password": "...", "text": "..." }
```

## Run

```bash
npm run check:config   # every JSON file parses
npm start              # = node src/init.ts
```

The master process reads the configs, forks the stratum workers (one per
core by default), the website, the payment processor and the CLI listener,
and logs each pool's startup: detected network and reward type,
`ASICBoost Enabled`, pool address, block height, and
`Stratum Pool Server Started for <coin>` once the first job exists.

For production, run it under a process manager so it restarts and logs:

```bash
npm i -g pm2
pm2 start npm --name namp -- start
pm2 save && pm2 startup       # restart on boot
pm2 logs namp                 # the portal's log
```

A systemd unit works the same way (`ExecStart=/usr/bin/npm start`,
`WorkingDirectory=/path/to/namp`, `Restart=always`). Put nginx in front of
the website ([reverse-proxy.md](reverse-proxy.md)) and read
[security.md](security.md) before opening the ports to the internet.

## Docker

```bash
docker compose up --build
```

[`docker-compose.yml`](../docker-compose.yml) runs the portal with a Redis
service and mounts your `config.json`, `pool_configs/` and `coins/` into the
container; without a `config.json` the image falls back to
`config_example.json`. Redis is reached through `REDIS_HOST` / `REDIS_PORT`
(set by the compose file), so nothing in the config changes between bare
metal and Docker. Coin daemons are not included: point each pool's
`daemons` at a node the container can reach (`host.docker.internal`,
another container, an external host) and publish the stratum ports in the
compose `ports:` list. The image compiles the addon and the web UI itself
(host build output is excluded), and its healthcheck probes `/api/health`.

## JSON API and monitoring

Besides the stats endpoints under `/api` the portal serves:

- `GET /api/config` — what the web UI needs: stratum host, switching ports,
  per-pool coin / ports / explorer / `miningTools`, and `branding`.
- `GET /api/prices` — latest prices from the price feed.
- `GET /api/announcement` — the home-page banner (set via the admin API).
- `GET /api/metrics` — Prometheus exposition format: pool and algorithm
  hashrate, shares, blocks, network stats, prices, wallet balances.
- `GET /api/health` — readiness probe: `200` ok, `503` degraded (used by
  the Docker healthcheck).

## Branding

`website.branding` in `config.json` rebrands the site without code changes;
every field is optional and `config_example.json` documents each one
inline:

- `siteName`, `logo` (header), `favicon` — paths or absolute CDN URLs.
- `tagline` and `navLinks[]` — extra header links; a link with `children[]`
  becomes a dropdown.
- `showTabStats` — the per-pool comparison page; auto-hidden for a single
  coin unless forced.
- `home` — hero logo, heading (`title` wins over the `{{coin}}` template),
  payout facts, `highlights[]` badges, `sections[]` of operator HTML, and
  `servers[]` location cards with live in-browser ping.
- `analytics` — a GA4 id and/or arbitrary `scripts[]` for `<head>`.

The UI is translated into 20 languages; only the values above are
operator-supplied. The web UI is responsive down to 320 px and follows the
OS light/dark preference with a header toggle.

## Upgrading

```bash
git pull
npm install            # rebuilds the addon when native/ changed
npm run build          # rebuild the web UI
npm run check:config
pm2 restart namp       # or your process manager's equivalent
```

Compare `config.json` and your pool configs with the shipped examples after
each release: new keys are additive with safe defaults, but renamed or
removed ones are listed in the release notes. Ethash pools created before
1.1.0 have a one-time ledger migration described in
[ethash.md](ethash.md#upgrading-from-a-pre-110-ledger).
