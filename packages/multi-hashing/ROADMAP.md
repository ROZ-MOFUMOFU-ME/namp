# Roadmap

This native addon is the bottom of a three-repo stack, consumed by
[node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool) and
(transitively) [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp). Each
repo has its own `ROADMAP.md`.

## Current state

- NAN-based native addon, builds with `-std=c++20` on Node 20–24 (requires
  GCC 10+; CircleCI installs GCC 10 explicitly).
- 74 algorithms are exported (see `src/multihashing.cc`); 30 of them are
  covered by known-answer test vectors (set1/set2/set3).
- `lyra2rev2` (Monacoin's Lyra2REv2) was fixed to finalize with the SHA-3
  reference BMW (BlueMidnightWish) instead of sphlib's `sph_bmw256`, which
  produced an incompatible digest.
- Released as 1.2.0 (built and tested on Node 24 with C++20).

## Known issues & limitations

- **44 of the 74 exported algorithms have no vector coverage** — they build
  and export but are listed in each set's `exclude-algos` (or have no stored
  vector), so a regression in any of them would go unnoticed. This includes
  the whole `yespower_*` family, the cryptonight variants, scrypt/scryptjane,
  kawpow and many of the X/lyra2 chains.
- **Compiler warnings remain** in vendored C (e.g. `oaes_lib.c` unused const
  `_NR`, a `stringop-overflow` warning), inherited from upstream sources.
- **NAN ties each build to the Node ABI** — switching Node versions requires
  a rebuild (`Module did not self-register` otherwise).
- The addon must be compiled by every consumer via node-gyp; there are no
  prebuilt binaries.

## Roadmap

### Near-term
- Add known-answer vectors for the excluded algorithms, prioritising those
  used by the stack's pool coins (yescrypt/yespower variants, lyra2*).
- Clean up the remaining vendored-C compiler warnings.

### Mid-term
- Evaluate porting from NAN to N-API (node-addon-api) so the compiled binary
  is ABI-stable across Node major versions.
- **Export Ethash as a standalone algorithm** — the ethash/progpow library is
  already vendored and used by the exported `kawpow` (`src/kawpow/ethash.cpp`),
  so exposing an `ethash` function would extend coverage to the Ethash family.
  Note these algorithms need an epoch/height parameter, unlike the header-only
  hashers.
- Add more memory-hard / modern algorithms on demand (e.g. RandomX, Equihash,
  Autolykos, KHeavyHash) for coins the stack wants to support.

### Long-term
- Ship prebuilt binaries (e.g. prebuildify) so consumers can install without
  a local C/C++ toolchain.
- **WebAssembly build** of the hashing functions (Emscripten/WASM), enabling
  browser-based mining and other WASM consumers — feeds the portal's
  browser-mining feature.
- **Monorepo consolidation** — this addon is intended to eventually merge
  with node-stratum-pool and zny-nomp into a single monorepo (see the
  [zny-nomp ROADMAP](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp/blob/main/ROADMAP.md)),
  so the native build versions together with its consumers.
