# CLAUDE.md

Guidance for `native/` — the hashing addon at the bottom of the NAMP
stack. Repository-wide guidance lives in the root CLAUDE.md.

## Role

Consumed by the stratum layer (`src/algoProperties.ts`,
`import multiHashing from 'multi-hashing'`) as a workspace dependency.
Each exported hash function is called as
`fn(dataBuffer, ...params) → Buffer`.

## Commands

```bash
npm run build        # node-gyp rebuild (root npm install also builds it)
npm test             # mocha known-answer vector tests (tests/test.vectors.js)
```

The build uses `-std=c++20` (binding.gyp) — Node 24's V8 headers
require C++20; gcc 10+ is needed.

**ABI caveat**: this is a NAN addon (not N-API), so the compiled
`build/Release/multihashing.node` is tied to the Node ABI it was built
with. After switching Node versions, consumers fail with
`Error: Module did not self-register` — run `npm run rebuild:native`
at the monorepo root (or `npm run build` here).

## Architecture

- `index.js` is one line: `require('bindings')('multihashing.node')` —
  the whole API is defined on the native side. **Keep `index.js` (and
  `tests/*.js`) JavaScript**: a `.ts` entry loaded through Node's
  ESM→CJS translation breaks the `bindings` resolver ("Could not locate
  the bindings file"), which is why this package stays JS while
  portal/stratum-pool are TypeScript.
- `src/multihashing.cc` is the NAN binding layer: one `NAN_METHOD` per
  algorithm, registered in `NAN_MODULE_INIT(init)` at the bottom
  (worker-thread enabled via `NAN_MODULE_WORKER_ENABLED`). Each method
  validates Buffer arguments, calls the C hash function and returns a
  Buffer.
- Algorithm implementations live one file per algorithm in `src/`
  (`x11.c`, `quark.c`, `neoscrypt.c`, …) on top of shared primitive
  libraries:
    - `src/sha3/` — sph\_\* hash primitives (blake, bmw, cubehash, echo,
      groestl, jh, keccak, luffa, shavite, simd, skein, whirlpool, …)
      used by the chained X-family algorithms
    - `src/crypto/` — argon2, lyra2, yespower (also serving the
      yescrypt family), cryptonight internals
    - `src/kawpow/` — ethash/kawpow machinery
- `binding.gyp` explicitly lists every compiled source and sets
  `-std=c++20`.

Adding an algorithm:

1. Add the C/C++ implementation under `src/` and list it in
   `binding.gyp` `sources`.
2. Add a `NAN_METHOD` in `src/multihashing.cc` and register the export.
3. `npm run build`, then add known-answer vectors under `tests/vectors/`
   covered by `tests/test.vectors.js`.
4. Register it downstream in
   `src/algoProperties.ts` (hash wrapper +
   difficulty multiplier).
