node-multi-hashing
===============

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white)](https://discord.gg/zHUdQy2NzU)
[![GitHub CI](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/actions/workflows/node.js.yml/badge.svg)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/actions/workflows/node.js.yml)
[![CircleCI](https://circleci.com/gh/ROZ-MOFUMOFU-ME/node-multi-hashing/tree/main.svg?style=svg)](https://circleci.com/gh/ROZ-MOFUMOFU-ME/node-multi-hashing/tree/main)
[![C/C++](https://img.shields.io/badge/C%2FC%2B%2B-00599C?style=flat&logo=cplusplus&logoColor=white)](https://isocpp.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![License: GPLv2](https://img.shields.io/badge/License-GPLv2-blue.svg)](https://opensource.org/licenses/GPL-2.0)

Cryptocurrency hashing functions for node.js.


Algorithms
----------
Supported algorithms: `quark, x11, x13, x15, x16r, x16rv2, x17, x25x, nist5, scrypt, scryptn, scryptjane, keccak, bcrypt, skein, groestl, blake, fugue, qubit, hefty1, shavite3, cryptonight, boolberry, sha256d, lbry, kawpow, allium, blake2s, gost, hsr, lyra2re, lyra2re2, lyra2rev2, lyra2z, m7, m7m, minotaur, odo, phi1612, sha1, skunk, skydoge, tribus, vipstar, whirlpoolx, xevan, zr5, yescrypt, yespower`, *__and more!__*

Note: `lyra2rev2` (Monacoin's Lyra2REv2) is finalized with the SHA-3 reference BMW (BlueMidnightWish), which is what the live network uses — `sph_bmw256` produces a different, incompatible digest. `vipstar` is the VIPSTARCOIN (HTMLcoin/qtum-style) sha256d over a 181-byte header.


Requirements
------------
- Node.js v18+ (tested on Node 18, 20, 22 and 24)
- A C/C++ toolchain with C++20 support (gcc 10+ or equivalent) — the addon is built with `-std=c++20`, which the V8 headers of Node 24 require
- Python (used by node-gyp)


Usage
-----

Install

```bash
npm install multi-hashing
```

Example usage:

```javascript
const multiHashing = require('multi-hashing');

const algorithms = ['quark', 'x11', 'scrypt', 'scryptn', 'keccak', 'bcrypt', 'skein', 'blake'];

const data = Buffer.from("7000000001e980924e4e1109230383e66d62945ff8e749903bea4336755c00000000000051928aff1b4d72416173a8c3948159a09a73ac3bb556aa6bfbcad1a85da7f4c1d13350531e24031b939b9e2b", "hex");

const hashedData = algorithms.map((algo) => multiHashing[algo](data));

console.log(hashedData);
//<Buffer 0b de 16 ef 2d 92 e4 35 65 c6 6c d8 92 d9 66 b4 3d 65 ..... >
```


Development
-----------

```bash
npm install          # builds the native addon via node-gyp
npm run build        # rebuild after source or Node version changes
npm test             # run the known-answer test vectors
```

This repository is developed on the `main` branch together with [node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool) and [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp), which consume it as a git dependency (`#main`).

Note: the compiled addon is tied to the Node ABI it was built with. If you switch Node versions and see `Error: Module did not self-register`, run `npm run build` again (or `npm rebuild multi-hashing` in a consuming project).

Credits
-------
* [NSA](http://www.nsa.gov/) and [NIST](http://www.nist.gov/) for creation or sponsoring creation of SHA2 and SHA3 algos
* [Keccak](http://en.wikipedia.org/wiki/Keccak) - Guido Bertoni, Joan Daemen, Michaël Peeters, and Gilles Van Assche
* [Skein](http://en.wikipedia.org/wiki/Skein_(hash_function)) - Bruce Schneier, Stefan Lucks, Niels Ferguson, Doug Whiting, Mihir Bellare, Tadayoshi Kohno, Jon Callas and Jesse Walker.
* [BLAKE](http://en.wikipedia.org/wiki/BLAKE_(hash_function)) - Jean-Philippe Aumasson, Luca Henzen, Willi Meier, and Raphael C.-W. Phan
* [Grøstl](http://en.wikipedia.org/wiki/Gr%C3%B8stl) - Praveen Gauravaram, Lars Knudsen, Krystian Matusiewicz, Florian Mendel, Christian Rechberger, Martin Schläffer, and Søren S. Thomsen
* [JH](http://en.wikipedia.org/wiki/JH_(hash_function)) - Hongjun Wu
* [Fugue](http://en.wikipedia.org/wiki/Fugue_(hash_function)) - Shai Halevi, William E. Hall, and Charanjit S. Jutla
* [scrypt](http://en.wikipedia.org/wiki/Scrypt) - Colin Percival
* [bcrypt](http://en.wikipedia.org/wiki/Bcrypt) - Niels Provos and David Mazières
* [X11](http://www.darkcoin.io/), [Hefty1](http://heavycoin.github.io/about.html), [Quark](http://www.qrk.cc/) creators (they just mixed together a bunch of the above algos)
