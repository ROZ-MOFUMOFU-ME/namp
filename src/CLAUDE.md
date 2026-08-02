# CLAUDE.md

Guidance for `packages/portal` — the mining portal at the top of the
NAMP stack. Monorepo-wide guidance lives in the root CLAUDE.md.

## Startup and runtime

Depends on `stratum-pool` (workspace reference), which depends on
`multi-hashing`. **Start via the tsx loader** (`npm start` =
`node --import tsx src/init.ts`; `tsx` is a regular dependency): the
workspace deps resolve under `node_modules` as TypeScript sources, and
Node's built-in type stripping refuses `.ts` under `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so tsx transforms them
at runtime. `src/init.ts` forks all workers with `cluster.fork()`,
which inherits `execArgv`, so `--import tsx` propagates to every
worker. The portal's own `src/*.ts` would also run under native type
stripping, but the startup path is unified on tsx.

Minimum Node: `>=22.18` (`engines`; Node 24 recommended). The
`@exodus/bitcoinjs-lib-zcash` dependency (via stratum-pool, for
koto/zcash addresses) `require()`s an ESM package, so
require(ESM)-capable Node is mandatory (`ERR_REQUIRE_ESM` otherwise).

Native addon caveat: see packages/multi-hashing/CLAUDE.md — after a
Node version switch run `npm rebuild multi-hashing` at the root.

## Commands

```bash
npm start             # boots the portal (needs Redis and coin daemons)
npm run typecheck     # lint/format run at the monorepo root
npm run test:unit     # node:test unit tests (the redis-backed ones skip without a local Redis)
npm run check:config  # JSON-parse validation of configs and examples (also in test:unit; CI)
```

`npm test` is a boot smoke (it just runs `src/init.ts`), not the test
suite — use `test:unit`. `node --test test/` (directory form) is buggy
on this Node; pass globs/files instead. Admin commands
reloadpool/coinswitch go through `POST /api/admin/<method>`
(adminCenter.password-gated); block detection is per-pool p2p.

The web frontend (SPA) lives in `web/` — Vite + React + TypeScript with
its own package.json/tsconfig/vite config. It is **not a workspace**
and keeps its own lockfile; it is the stack's only build step. First
time: `cd web && npm install --legacy-peer-deps`. Dev: `npm run dev`
(Vite on :5173 proxying `/api` to the portal on :8080). Production:
`npm run build` → `web/dist`, served by `src/website.ts` with an
index.html fallback for client-side routes.

## Configuration

`src/init.ts` loads `config.json` (falls back to
`config_example.json`); pools are enabled per file in
`pool_configs/*.json`, each referencing a coin definition in
`coins/*.json`. The real `config.json` / `pool_configs/*.json` /
`coins/*.json` are gitignored (production settings); only the examples
are committed — `coins/coins-examples{,-testnet}/` and
`pool_configs/examples/` — and CI validates them via `check:config`.

Coin definitions carry:

- `mainnet`/`testnet` address params (`pubKeyHash`/`scriptHash`/
  `bech32`/`bip32.public` as **hex strings**; required for coins using
  bech32/P2SH — without a network block `addressToScript` falls back to
  version-byte-agnostic base58 P2PKH; koto uses `kotoAddressToScript`
  and needs none; kumacoin is Peercoin-era with no BIP32)
- daemon capability flags `getInfo` / `noNetworkInfo` /
  `noGetnetworkhashps`
- The pool-address ownership RPC is **auto-detected per daemon**:
  `getaddressinfo` (Bitcoin Core 0.17+, where `validateaddress` lost
  the wallet fields) vs `validateaddress` (older), probed once via
  `-32601` method-not-found — capability-based, not version-based
  (altcoin forks don't map onto Core version numbers).
- `networkHashFromDiff: true` for PoS/PoW hybrids (VIPSTARCOIN,
  KumaCoin): derives `networkHash` from the raw PoW difficulty
  (`networkDiff × 2^32 ÷ blockTime`, algo-multiplier-independent)
  because `getmininginfo.networkhashps` includes the far-harder PoS
  difficulty and breaks Network H/s and Luck displays.
- Optional `subVersion` template (e.g. `"/Antenna:{version}/"`)
  synthesizes a daemon-version string for getinfo-only wallets whose
  `getinfo.version` is a git build string (kumacoin).
- Optional `miningTools` (`[{name, url}]`) and `explorer`
  (`txURL`/`blockURL`/`address`) are surfaced via `GET /api/config`
  (mining-software links on Getting Started; address links on worker
  stats).

## Architecture

ESM TypeScript throughout (strict/nodenext/erasableSyntaxOnly; import
specifiers use real extensions; `eslint.config.js` alone stays JS).
Ambient types for untyped deps live in `types/shims.d.ts`.
`src/init.ts` is the cluster master, forking role workers:

- **Pool workers** (`src/poolWorker.ts`) — `clustering.forks` forks,
  each running one stratum-pool instance per enabled pool; shares
  arrive via the pool's `share` event and `src/shareProcessor.ts`
  writes them to Redis. Stratum ports come from pool_configs (per-port
  `diff`/`tls`/`varDiff`); `tls: true` ports serve TLS from the shared
  `tlsOptions` (boot refuses to fall back to plaintext on cert
  errors). An optional **getwork bridge** (`getwork.enabled`, same
  port shape) lets getwork-only miners (qtum-style coins, e.g.
  VIPSTARCOIN with official ccminer) join the same pool; plaintext main
  ports are recommended since most miners speak only plain
  `stratum+tcp://` (TLS on extra ports; see `docs/stratum-tls.md`).
- **Payment processor** (`src/paymentProcessor.ts`) — the largest
  module: reads share data from Redis on an interval, confirms blocks
  over daemon RPC, sends payouts. Payment modes (prop/pplnt/solo/
  pplns/pps/dpps/fpps/ppsplus/smpps/esmpps) are selected per pool via
  `paymentMode`; see `docs/payment-schemes.md`.
- **Website** (`src/website.ts`) — Express 5, serves the `web/dist` SPA
  and the JSON API: `src/api.ts` (stats, password-gated `/api/admin/*`
  incl. the home announcement, `/api/prices`, public
  `/api/announcement`, `/api/metrics` Prometheus via `src/metrics.ts`,
  `/api/health` via `src/health.ts`, and `GET /api/config` exposing
  public runtime config incl. `website.branding`) plus
  `src/workerapi.ts`; stats aggregation in `src/stats.ts` (attaches
  latest prices as `stats.prices`).
- **Price feed** (`src/priceFeed.ts`) — polls CoinGecko/CoinPaprika via
  the pluggable providers in `src/priceProviders.ts` into Redis
  `priceFeed:prices` using global `fetch`; off by default
  (`priceFeed.enabled`). Informational only — never wire prices into
  payouts/balances (explicit out-of-scope, see the root ROADMAP).
- **Profit switcher** (`src/profitSwitch.ts`) — switches hashpower
  between same-algorithm coins using `reward × price / difficulty`;
  pure selection logic is separated in `src/profitSwitchLogic.ts`
  (testable); off by default; requires the price feed.
- **CLI listener** (`src/cliListener.ts`) — internal TCP port
  (`cliPort`) accepting the profit switcher's `coinswitch`; manual
  admin commands route through the website admin API to the master's
  `dispatchCliCommand`.

Redis is the primary datastore (shares, blocks, balances, stats); all
inter-process communication flows through cluster IPC in `init.ts`. The
Redis client is node-redis v6 (promise API) with shared helpers in
`src/redisUtil.ts` — use `execCommands()` for raw `[command, args…]`
MULTIs, and typed camelCase multis (`hGetAll` chains) when a reply must
be object-shaped (raw HGETALL returns a flat array).

Algorithms referenced by coin files must exist in stratum-pool's
`algoProperties` — adding one is multi-hashing + stratum-pool work, not
portal work.

## Caution

This is production pool software ("beta"): config file structure and
the Redis data layout are considered unstable between commits; only
tagged releases are stable. Be conservative with config-schema and
Redis-key-format changes.
