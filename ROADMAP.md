# NAMP Roadmap

NAMP (Node All-in-One Mining Portal) unifies the three-repo stack —
zny-nomp (portal), node-stratum-pool (stratum), node-multi-hashing
(native hashing) — into this monorepo. This document tracks both the
migration itself and the stack-wide plans inherited from the source
repos' roadmaps, which this file supersedes once the merge lands.

## Where we are (2026-08-02)

- Scaffold in place: npm workspaces (`packages/*`), TypeScript 7 (native
  compiler), prettier, MIT, Node 22.18+/ESM. `packages/` is still empty;
  the source repos sit beside it as gitignored clones.
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

- [ ] multi-hashing → `packages/multi-hashing`
- [ ] stratum-pool → `packages/stratum-pool`
- [ ] zny-nomp → `packages/portal`
- [ ] Gate: root `npm install && npm run typecheck && npm test` green
      with the imported packages untouched
- [ ] Drop the side-by-side clones and their .gitignore entries;
      retire manage.sh / namp.code-workspace

### M2 — One workspace

- [ ] Replace the git-URL dependency chain
      (`portal → stratum-pool#develop → multi-hashing#develop`) with
      workspace references; single root lockfile
- [ ] One CI pipeline: lint / typecheck / prettier / unit tests /
      config checks / native build (GCC 10+), replacing the per-repo
      workflows
- [ ] Merge the three ROADMAP.md / CLAUDE.md files into the root ones;
      keep per-package READMEs
- [ ] Single release flow: one `vX.Y.Z` tag releases the stack
      (replaces "tag downstream, pin upstream, npm link chain")

### M3 — TS7 alignment and rebranding

- [ ] Hoist typescript ^7 / eslint / prettier to the root (portal and
      stratum-pool currently pin typescript ^6)
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

Condensed from the source repos' roadmaps; the detailed histories live in
each package's ROADMAP.md until M2 merges them here.

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
