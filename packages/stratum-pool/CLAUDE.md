# CLAUDE.md

Guidance for `packages/stratum-pool` — the Stratum poolserver library in
the middle of the NAMP stack. Monorepo-wide guidance lives in the root
CLAUDE.md.

## Role

Consumed by `packages/portal`; depends on `packages/multi-hashing`
(both workspace references). The portal deep-imports
`stratum-pool/src/algoProperties.ts` and `stratum-pool/src/util.ts` in
addition to the package root; `package.json` `exports` publishes `.`,
`./src/*` and a back-compat `./lib/*` → `./src/*` alias — keep both the
`src/*` surface and the `lib/*` alias stable.

## Commands

```bash
npm test              # node --test (test/smoke.test.ts: import + createPool
                      #   + per-chain merkle-leaf regression: Sapling=hash, Bitcoin=txid)
npm run lint          # eslint src/ test/ (typescript-eslint)
npm run format / format:check
npm run typecheck     # tsc --noEmit
```

## Architecture

ESM (`"type": "module"`) TypeScript, ~4.4k lines under `src/`, **no
build step** — Node's native type stripping (22.18+/24) runs `.ts`
directly; `tsc --noEmit` typechecks only (strict, nodenext,
verbatimModuleSyntax, erasableSyntaxOnly, allowImportingTsExtensions;
import specifiers use real extensions like `./foo.ts`; the untyped
`@exodus/bitcoinjs-lib-zcash` is ambient-declared in
`types/shims.d.ts`). The entry `src/index.ts` exports
`createPool(options, authorizeFn)` — it **constructs and returns a
`Pool`** (`src/pool.ts`); the caller starts it with `pool.start()` —
plus named exports `daemon` and `varDiff`. `Pool` is the orchestrator
wiring everything together.

Share lifecycle — the flow that ties most files together:

1. **Template polling** — `src/daemon.ts` (RPC client with multi-daemon
   fallback) polls `getblocktemplate`; `src/peer.ts` additionally
   connects to the daemon as a P2P peer to detect new blocks faster
   than polling.
2. **Job creation** — `src/jobManager.ts` detects a new block/height and
   builds a `BlockTemplate` (`src/blockTemplate.ts`); coinbase
   serialization lives in `src/transactions.ts` (rewards, fees,
   masternode outputs), merkle branches in `src/merkleTree.ts`.
3. **Broadcast** — `src/stratum.ts` (the TCP stratum server, largest
   file) sends `mining.notify` to all subscribed miners. Per-port
   difficulty is fixed or managed by `src/varDiff.ts` (retargeting from
   share submission rate).
4. **Share validation** — on `mining.submit`,
   `jobManager.processShare()` checks job/nonce/ntime/duplicates,
   rebuilds the header and hashes it via the per-algorithm hasher from
   `src/algoProperties.ts`; hash-vs-target decides valid share / valid
   block.
5. **Block submission** — `pool.ts` serializes the block, submits over
   RPC, confirms acceptance, then emits the `share` event; the portal
   persists it to Redis downstream.

`src/algoProperties.ts` is the algorithm registry (~50 entries: the
scrypt family, x11–x25x, lyra2 variants, yescrypt/yespower families,
vipstar, …). Each entry is
`{ multiplier, diff?, hash(coinConfig) → (data: Buffer) => Buffer }`
with the inner function wrapping a `multi-hashing` export. Adding an
algorithm = implement/export it in `packages/multi-hashing`, then
register it here (mind the difficulty `multiplier` and whether the
block hash needs `util.reverseBuffer`).

`src/stratum.ts` also implements connection policy: subscription
management, invalid-share auto-ban, connection timeouts, optional
HAProxy `tcpProxyProtocol` support.

## Native addon caveat

`multi-hashing` is a NAN addon compiled per Node ABI: after switching
Node versions, tests fail with `Module did not self-register` — run
`npm rebuild multi-hashing` at the monorepo root. Node 24 requires the
C++20 build (set in its binding.gyp).
