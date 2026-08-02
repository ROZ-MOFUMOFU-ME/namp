# NAMP Roadmap

NAMP (Node All-in-One Mining Portal) unifies the three-repo stack —
zny-nomp (portal), node-stratum-pool (stratum), node-multi-hashing
(native hashing) — into this monorepo. This document tracks both the
migration itself and the stack-wide plans inherited from the source
repos' roadmaps, which this file supersedes once the merge lands.

## Where we are (2026-08-02)

- Monorepo live: npm workspaces (`packages/*`), TypeScript 7 (native
  compiler; eslint 10 lints TS via @babel/eslint-parser since
  typescript-eslint has no TS7 support), prettier, MIT, Node 22.18+/ESM. **M1 and M2 done
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

### M3 — TS7 alignment and rebranding (done: 2026-08-02)

- [x] Unify typescript on ^7 and hoist the lint toolchain to the root
      (done 2026-08-02): typescript-eslint (peer <6.1, no TS7 support)
      is dropped — eslint 10 parses TS via @babel/eslint-parser +
      @babel/preset-typescript, tsc 7 owns type-aware checking; eslint /
      @eslint/js / eslint-config-prettier / @babel/* / typescript /
      prettier live in the root devDependencies (per-package
      eslint.config.js kept — rule sets differ intentionally;
      stratum-pool also keeps its trailingComma:es5 .prettierrc to
      avoid a whole-tree reformat)
- [x] Rebrand the portal from ZNY-NOMP to NAMP (done 2026-08-02): the
      package is `namp-portal`, UI fallback branding / README / docs /
      Docker file headers / example config say NAMP, GitHub links point
      at namp; historical references (imported-from, release notes)
      stay as zny-nomp on purpose
- [x] npm package identities (decided 2026-08-02): stratum-pool and
      multi-hashing are **internal workspaces only** — names kept so
      the existing `import 'stratum-pool'` / deep-import surface stays
      intact; nothing is published to npm. Revisit only if an external
      consumer shows up (then: scoped names + prebuilds)

### M4 — Cutover

- [x] Release NAMP v1.0.0 (done 2026-08-02: GitHub Release from the
      v1.0.0 tag with auto-generated notes)
- [x] Migration notices on all three source repos (main + develop
      READMEs point at the namp package paths; stratum-pool landed via
      PR #61 due to branch protection)
- [ ] **Archive the three source repos — owner action required**:
      archiving needs admin rights (the emerauda account has write
      only). From the ROZ-MOFUMOFU-ME account:
      `gh repo archive ROZ-MOFUMOFU-ME/zny-nomp --yes` (and the same
      for node-stratum-pool / node-multi-hashing), or Settings →
      Danger Zone → Archive this repository
- [x] dependabot re-pointed: namp carries .github/dependabot.yml (root
      workspace tree, the portal web SPA, GitHub Actions); the old
      repos' updates stop once archived
- [ ] Optional (owner action): branch protection on namp main

### M5 — Dissolve the packages

The workspaces exist only for historical reasons — nothing is published
(decided in M3), so the package boundaries, the four package.json files
and the `import 'stratum-pool'` indirection are pure overhead. The end
state is one flat application with a single package.json:

```
namp/
├── package.json      # the only one
├── binding.gyp       # native addon build (was multi-hashing's)
├── native/           # C/C++ hashing sources + the bindings loader
├── src/              # the portal (was packages/portal/src)
│   └── stratum/      # the stratum library (was packages/stratum-pool/src)
├── web/              # the SPA (was packages/portal/web)
├── coins/ pool_configs/ docs/ test/ types/
```

Dissolution order (most-depended-on first, green at every step):

- [x] multi-hashing → `native/` + root binding.gyp (done 2026-08-03);
      the KAT tests run from root `test/` on node:test (mocha retired),
      the loader is `native/index.cjs` (CJS under the ESM root) with a
      `.d.cts` type surface, and stratum imports it by relative path
- [ ] stratum-pool → `src/stratum/`; the portal's `'stratum-pool'` /
      deep imports become relative; its tests join root `test/`
- [ ] portal → root `src/` (+ `coins/`, `pool_configs/`, `docs/`,
      `config_example.json`); web → root `web/`
- [ ] drop `workspaces`, merge the four package.json files into one,
      re-point Docker/CI/docs; verify tsx is still needed (no more .ts
      under node_modules — Node's native type stripping may suffice)

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
