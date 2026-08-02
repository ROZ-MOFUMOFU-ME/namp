# NAMP Roadmap

NAMP (Node All-in-One Mining Portal) unifies the three-repo stack —
zny-nomp (portal), node-stratum-pool (stratum), node-multi-hashing
(native hashing) — into this monorepo. This document tracks both the
migration itself and the stack-wide plans inherited from the source
repos' roadmaps, which this file supersedes once the merge lands.

## Where we are (2026-08-02)

- Monorepo live: npm workspaces (`packages/*`), TS7-ready TypeScript
  config (toolchain on ^6 until typescript-eslint supports 7), prettier,
  MIT, Node 22.18+/ESM. **M1 and M2 done
  (2026-08-02)** — the three source histories (2,706 commits) are
  imported under `packages/`, the packages reference each other as
  workspaces behind a single lockfile, CI/release run as one root
  pipeline, and the root install/typecheck/test gate is green.
- **All three source repos' main now follows the TypeScript develop line**
  (replaced 2026-08-02 via `-s ours` merges; the legacy JS mains survive
  as `legacy-main`). Releases so far: zny-nomp v1.4.0 (develop is v2.0.0
  unreleased), node-stratum-pool v0.4.0, node-multi-hashing v1.2.0.
- The stack is production-verified on live pools: mining + payouts on
  BitZeny, Koto, Monacoin, Bellcoin, Sugarchain, KumaCoin; TS migration,
  React/Vite SPA, 9 payment modes, Prometheus metrics and the price feed
  are already shipped in the source repos.

## Migration

### M1 — History-preserving import

Import each repo's full history under `packages/`, most-depended-on
first, using git filter-repo path rewrites + `--allow-unrelated-histories`
merges. Nothing is squashed; blame and bisect keep working.

- [x] multi-hashing → `packages/multi-hashing` (497 commits)
- [x] stratum-pool → `packages/stratum-pool` (784 commits)
- [x] zny-nomp → `packages/portal` (1425 commits)
- [x] Gate: root `npm install && npm run typecheck && npm test` green
      with the imported packages untouched (typecheck ×2, KAT vectors,
      stratum node --test incl. the native addon, portal 106 unit tests)
- [x] Drop the side-by-side clones and their .gitignore entries;
      retire manage.sh / namp.code-workspace (done 2026-08-02)

### M2 — One workspace (done: 2026-08-02)

- [x] Replace the git-URL dependency chain
      (`portal → stratum-pool#develop → multi-hashing#develop`) with
      workspace references; single root lockfile (zero git URLs; the
      per-package lockfiles are gone, `packages/portal/web` keeps its
      own as a non-workspace project)
- [x] One CI pipeline (.github/workflows/ci.yml): lint / prettier /
      typecheck + Node 22/24 test matrix incl. the native build and
      config checks, replacing the per-repo workflows and CircleCI
- [x] Per-package ROADMAPs absorbed here (full text survives in git
      history); per-package CLAUDE.mds rewritten in English for the
      monorepo (multi-repo/npm-link workflow notes dropped); READMEs
      kept
- [x] Single release flow (.github/workflows/release.yml): one
      `vX.Y.Z` tag matching the root package.json releases the stack

### M3 — TS7 alignment and rebranding

- [ ] Unify typescript on ^7 and hoist eslint / prettier config to the
      root — **blocked on typescript-eslint TS7 support** (its peer
      range caps at <6.1 as of 2026-08; a hoisted 7.x crashes eslint,
      so the whole tree pins ^6 for now)
- [ ] Rebrand the portal from ZNY-NOMP to NAMP (site branding is already
      config-driven, so this is naming/docs/UI defaults, not a rewrite)
- [ ] npm package identities: decide whether stratum-pool /
      multi-hashing stay independently consumable (published names,
      prebuilds) or become internal workspaces only

### M4 — Cutover

- [ ] Release NAMP v1.0.0 (repo is already public)
- [ ] Archive the three source repos; READMEs point here
      (legacy-main branches stay browsable in the archives)
- [ ] Re-point dependabot, branch protection, and any external
      consumers of the git URLs

## Inherited stack roadmap

Condensed from the source repos' roadmaps (absorbed in M2; their full
text survives in each package's git history).

### Verification debt (can proceed before/during migration)

- [ ] VIPSTARCOIN mainnet payout run (PoW verified; needs the pool
      restarted onto current stratum-pool)
- [ ] Susucoin end-to-end (daemon builds; mining + payout unverified)
- [ ] Yenten matured-block payout (dev-fee coinbase verified live)
- [ ] Sustained testnet run for the share-based payment modes
      (pps / dpps / fpps / ppsplus / smpps / esmpps, pplns)

### Testing & robustness

- [ ] stratum-pool: unit tests for `jobManager.processShare` and block
      template serialization from captured real headers; mock-daemon
      integration test (getblocktemplate → share → submitblock)
- [ ] portal: unit tests for shareProcessor / paymentProcessor / stats
      against a local Redis
- [ ] multi-hashing: known-answer vectors for the 44 uncovered
      algorithms (yespower/yescrypt/lyra2 families first)
- [ ] multi-hashing: investigate the GCC 13+ miscompilation of vendored
      C (neoscrypt KAT vectors fail when built with the ubuntu-24.04
      default toolchain; CI pins GCC 12, matching the verified builds)
- [ ] Architecture modernization (portal): typed data-access layer over
      raw Redis, service layer + DI, zod-validated config, structured
      logging (pino), idempotent payments, graceful shutdown, and a
      unit/integration/e2e test pyramid in CI

### Protocol & algorithm growth

- [ ] NiceHash-compatible stratum (`mining.extranonce.subscribe`,
      extranonce rolling) + NiceHash API-driven profitability
- [ ] multi-hashing NAN → N-API port (ABI-stable binary), then prebuilt
      binaries; export ethash standalone
- [ ] Ethash-family job model in stratum-pool (epoch/DAG/seedhash);
      later RandomX / Equihash / Autolykos / KHeavyHash on demand;
      optional merged mining (AuxPoW)
- [ ] Browser mining: WASM build of multi-hashing + WebSocket→stratum
      bridge, consent-gated and rate-limited; per-coin one-click miner
      apps as the long-tail onboarding path

### Operations, security, miner experience

- [ ] Security hardening: RPC credentials out of plaintext configs, TLS
      (web + stratum), Redis ACLs, admin 2FA, CSP, tuned DoS/banning
- [ ] Containerized deployment (multi-stage Dockerfile, compose stack,
      then Helm) and tag→deploy CD; documented backup/restore; status page
- [ ] Observability: alerting on stale daemons / payment failures /
      crashed workers; miner notifications (block found, payment sent,
      worker offline) via email / Discord / webhook / Web Push
- [ ] Miner-facing: per-miner minimum payout + payout address, richer
      hashrate history, PWA, OpenAPI docs, a11y pass, Web3
      wallet-signature login with EVM payout addresses
- [ ] Profitability: fiat-denominated dashboard views, calculator,
      price-driven profit switching validated on a live multi-coin pool,
      Yiimp-style auto-exchange payouts (pay in the miner's chosen coin)

## Out of scope (won't do)

Carried over from zny-nomp so it is not re-proposed:

- **Anchoring payouts or balances to fiat.** The live price feed stays
  informational (tickers, dashboards); it must never feed payment
  records or owed amounts — the operator does not back/hold fiat.
