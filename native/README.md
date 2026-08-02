# multi-hashing

> NAMP's native hashing layer: C/C++ algorithm implementations built by the root binding.gyp, loaded through [`index.cjs`](index.cjs) and consumed by the stratum modules in `src/`.

[![CI](https://img.shields.io/github/actions/workflow/status/ROZ-MOFUMOFU-ME/namp/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/ROZ-MOFUMOFU-ME/namp/actions/workflows/ci.yml)&nbsp;[![C/C++](https://img.shields.io/badge/C%2FC%2B%2B-00599C?style=flat-square&logo=cplusplus&logoColor=white)](https://isocpp.org/)&nbsp;[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)&nbsp;[![node-gyp](https://img.shields.io/badge/node--gyp-native_addon-689F63?style=flat-square&logo=nodedotjs&logoColor=white)](https://github.com/nodejs/node-gyp)&nbsp;[![License](https://img.shields.io/badge/license-GPLv2-blue?style=flat-square)](https://opensource.org/licenses/GPL-2.0)&nbsp;[![Discord](https://img.shields.io/badge/Discord-join-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/zHUdQy2NzU)

Cryptocurrency hashing functions for node.js.

## Algorithms

Supported algorithms: `quark, x11, x13, x15, x16r, x16rv2, x17, x25x, c11, nist5, fresh, scrypt, scryptn, scryptjane, neoscrypt, keccak, bcrypt, skein, groestl, groestlmyriad, blake, blake2s, fugue, qubit, hefty1, shavite3, argon2d, argon2i, argon2id, cryptonight, cryptonightfast, boolberry, sha1, sha256d, lbry, kawpow, allium, gost, hsr, lyra2re, lyra2re2, lyra2rev2, lyra2rev3, lyra2z, lyra2z330, lyra2z16m330, m7, m7m, minotaur, odo, phi1612, skunk, skydoge, tribus, vipstar, whirlpoolx, xevan, zr5, yespower` (plus a family of `yespower_*` coin variants), _**and more!**_

Note: `lyra2rev2` (Monacoin's Lyra2REv2) is finalized with the SHA-3 reference BMW (BlueMidnightWish), which is what the live network uses — `sph_bmw256` produces a different, incompatible digest. `vipstar` is the VIPSTARCOIN (HTMLcoin/qtum-style) sha256d over a 181-byte header. The exact set of exports is defined in `src/multihashing.cc`.

## Requirements

- Node.js v22+ (exercised in the monorepo CI on Node 22/24)
- A C/C++ toolchain with C++20 support (gcc 10+ or equivalent) — the addon is built with `-std=c++20`, which the V8 headers of Node 24 require
- Python (used by node-gyp)

## Usage

Inside the monorepo, `packages/stratum-pool` already depends on this package through npm workspaces; a root `npm install` builds the addon. Example usage:

```javascript
const multiHashing = require('multi-hashing');

const algorithms = ['quark', 'x11', 'scrypt', 'scryptn', 'keccak', 'bcrypt', 'skein', 'blake'];

const data = Buffer.from("7000000001e980924e4e1109230383e66d62945ff8e749903bea4336755c00000000000051928aff1b4d72416173a8c3948159a09a73ac3bb556aa6bfbcad1a85da7f4c1d13350531e24031b939b9e2b", "hex");

const hashedData = algorithms.map((algo) => multiHashing[algo](data));

console.log(hashedData);
//<Buffer 0b de 16 ef 2d 92 e4 35 65 c6 6c d8 92 d9 66 b4 3d 65 ..... >
```

## Development

```bash
npm install          # builds the native addon via node-gyp
npm run build        # rebuild after source or Node version changes
npm test             # run the known-answer test vectors
```

The whole public API lives in the native layer — `index.js` is a single `require('bindings')('multihashing.node')` line, and it (along with `tests/*.js`) is intentionally kept as JavaScript: routing the `bindings` resolver through Node's ESM→CJS translation of a `.ts` entry stops it from locating the compiled `multihashing.node`.

Note: the compiled addon is tied to the Node ABI it was built with. If you switch Node versions and see `Error: Module did not self-register`, run `npm run build` again (or `npm rebuild multi-hashing` in a consuming project).

Community, donations, contributing guidelines and credits live in the [root README](../../README.md).
