# node-multi-hashing

[![CI](https://img.shields.io/github/actions/workflow/status/ROZ-MOFUMOFU-ME/node-multi-hashing/node.js.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/actions/workflows/node.js.yml)&nbsp;[![CircleCI](https://img.shields.io/circleci/build/github/ROZ-MOFUMOFU-ME/node-multi-hashing/main?style=flat-square&logo=circleci&label=CircleCI)](https://circleci.com/gh/ROZ-MOFUMOFU-ME/node-multi-hashing/tree/main)&nbsp;[![C/C++](https://img.shields.io/badge/C%2FC%2B%2B-00599C?style=flat-square&logo=cplusplus&logoColor=white)](https://isocpp.org/)&nbsp;[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)&nbsp;[![node-gyp](https://img.shields.io/badge/node--gyp-native_addon-689F63?style=flat-square&logo=nodedotjs&logoColor=white)](https://github.com/nodejs/node-gyp)&nbsp;[![License](https://img.shields.io/badge/license-GPLv2-blue?style=flat-square)](https://opensource.org/licenses/GPL-2.0)&nbsp;[![Discord](https://img.shields.io/badge/Discord-join-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/zHUdQy2NzU)

Cryptocurrency hashing functions for node.js.

**Roadmap:** see [ROADMAP.md](ROADMAP.md) for current status, known issues, and planned improvements.

### Community

ZNY-NOMP official Discord Server

- Join [https://discord.gg/zHUdQy2NzU](https://discord.gg/zHUdQy2NzU)

## Algorithms

Supported algorithms: `quark, x11, x13, x15, x16r, x16rv2, x17, x25x, nist5, scrypt, scryptn, scryptjane, keccak, bcrypt, skein, groestl, blake, fugue, qubit, hefty1, shavite3, cryptonight, boolberry, sha256d, lbry, kawpow, allium, blake2s, gost, hsr, lyra2re, lyra2re2, lyra2rev2, lyra2z, m7, m7m, minotaur, odo, phi1612, sha1, skunk, skydoge, tribus, vipstar, whirlpoolx, xevan, zr5, yescrypt, yespower`, _**and more!**_

Note: `lyra2rev2` (Monacoin's Lyra2REv2) is finalized with the SHA-3 reference BMW (BlueMidnightWish), which is what the live network uses — `sph_bmw256` produces a different, incompatible digest. `vipstar` is the VIPSTARCOIN (HTMLcoin/qtum-style) sha256d over a 181-byte header.

## Requirements

- Node.js v18+ (tested on Node 18, 20, 22 and 24)
- A C/C++ toolchain with C++20 support (gcc 10+ or equivalent) — the addon is built with `-std=c++20`, which the V8 headers of Node 24 require
- Python (used by node-gyp)

## Usage

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

## Development

```bash
npm install          # builds the native addon via node-gyp
npm run build        # rebuild after source or Node version changes
npm test             # run the known-answer test vectors
```

This repository is developed on the `main` branch together with [node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool) and [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp), which consume it as a git dependency (`#main`).

Note: the compiled addon is tied to the Node ABI it was built with. If you switch Node versions and see `Error: Module did not self-register`, run `npm run build` again (or `npm rebuild multi-hashing` in a consuming project).

## Donations

Donations for development are greatly appreciated!

- ZNY: ZmnBu9jPKvVFL22PcwMHSEuVpTxFeCdvNv
- NUKO: 0xa79bde46faab3c40632604728e9f2165b052581c
- KOTO: k1FTuimwDJ8oo3x23cEBLxovxw5Cqq2U1HK
- SUSU: SeXbMBaax7NgnTEFEMxin5ycXy9r9CDBot
- MONA: MLEqE3vi11j4ZguMjkvMn5rUtze6kXbAzQ
- BELL: BCVicYRSqKKt1ynJKPrXHA46hUWLrbjR49
- SUGAR: sugar1qtwqle9lrr753kxuzqqsh3hv28jl07e3mntx78n
- VIPS: VFixsia2EstV4uEEigUXUrknDGsFeWyNhE
- KUMA: KHjjZ5misqq45zwhj86WKqV8bzqcYExzyM
- BTC: 3FpbJ5cotwPZQn9fcdZrPv4h72XquzEvez
- ETH: 0xc664a0416c23b1b13a18e86cb5fdd1007be375ae
- LTC: Lh96WZ7Rw9Wf4GDX2KXpzieneZFV5Xe5ou
- BCH: pzdsppue8uwc20x35psaqq8sgchkenr49c0qxzazxu
- ETC: 0xc664a0416c23b1b13a18e86cb5fdd1007be375ae

## Credits

### node-multi-hashing

- [ROZ](https://github.com/ROZ-MOFUMOFU-ME)

### Algorithms

- [NSA](http://www.nsa.gov/) and [NIST](http://www.nist.gov/) for creation or sponsoring creation of SHA2 and SHA3 algos
- [Keccak](http://en.wikipedia.org/wiki/Keccak) - Guido Bertoni, Joan Daemen, Michaël Peeters, and Gilles Van Assche
- [Skein](<http://en.wikipedia.org/wiki/Skein_(hash_function)>) - Bruce Schneier, Stefan Lucks, Niels Ferguson, Doug Whiting, Mihir Bellare, Tadayoshi Kohno, Jon Callas and Jesse Walker.
- [BLAKE](<http://en.wikipedia.org/wiki/BLAKE_(hash_function)>) - Jean-Philippe Aumasson, Luca Henzen, Willi Meier, and Raphael C.-W. Phan
- [Grøstl](http://en.wikipedia.org/wiki/Gr%C3%B8stl) - Praveen Gauravaram, Lars Knudsen, Krystian Matusiewicz, Florian Mendel, Christian Rechberger, Martin Schläffer, and Søren S. Thomsen
- [JH](<http://en.wikipedia.org/wiki/JH_(hash_function)>) - Hongjun Wu
- [Fugue](<http://en.wikipedia.org/wiki/Fugue_(hash_function)>) - Shai Halevi, William E. Hall, and Charanjit S. Jutla
- [scrypt](http://en.wikipedia.org/wiki/Scrypt) - Colin Percival
- [bcrypt](http://en.wikipedia.org/wiki/Bcrypt) - Niels Provos and David Mazières
- [X11](http://www.darkcoin.io/), [Hefty1](http://heavycoin.github.io/about.html), [Quark](http://www.qrk.cc/) creators (they just mixed together a bunch of the above algos)

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. 🔀 Fork this repository
2. 🌿 Create a new branch (`git checkout -b feature/amazing-feature`)
3. 💾 Commit your changes (`git commit -m 'Add some amazing feature'`)
4. 📤 Push to the branch (`git push origin feature/amazing-feature`)
5. 🔃 Open a Pull Request

### 📋 Contributing Guidelines

- This is a native (NAN) addon built with node-gyp; keep it building on Node 20–24 with `-std=c++20`
- Add known-answer test vectors for any new algorithm
- Write clear and descriptive commit messages

#### Building & Testing

Before submitting a pull request, please make sure the addon builds and the test vectors pass:

```bash
npm install          # builds the native addon via node-gyp
npm run build        # rebuild after source or Node version changes
npm test             # run the known-answer test vectors
```

---

## 📄 License

This project is licensed under the GNU General Public License v2.0. See [http://www.gnu.org/licenses/gpl-2.0.html](http://www.gnu.org/licenses/gpl-2.0.html) for details.

---

## 👥 Team

<div align="center">

[![Contributors](https://contrib.rocks/image?repo=ROZ-MOFUMOFU-ME/node-multi-hashing)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/graphs/contributors)

</div>

---

## 📞 Support

- 🐛 **Bug Reports**: [Issues](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/issues)
- 💡 **Feature Requests**: [Discussions](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/discussions)
- 💬 **Community**: [Discord](https://discord.gg/zHUdQy2NzU)

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ROZ-MOFUMOFU-ME/node-multi-hashing&type=Date&theme=dark)](https://star-history.com/#ROZ-MOFUMOFU-ME/node-multi-hashing&Date)

---

## 📊 Statistics

![GitHub Stats](https://github-readme-stats.vercel.app/api?username=ROZ-MOFUMOFU-ME&repo=node-multi-hashing&show_icons=true&theme=dark)

---

<div align="center">

**⭐ If you like this project, please give it a star! ⭐**

[![GitHub stars](https://img.shields.io/github/stars/ROZ-MOFUMOFU-ME/node-multi-hashing.svg?style=social&label=Star)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing)
[![GitHub forks](https://img.shields.io/github/forks/ROZ-MOFUMOFU-ME/node-multi-hashing.svg?style=social&label=Fork)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/fork)
[![GitHub watchers](https://img.shields.io/github/watchers/ROZ-MOFUMOFU-ME/node-multi-hashing.svg?style=social&label=Watch)](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing)

Made with ❤️ by [ROZ](https://github.com/ROZ-MOFUMOFU-ME)

</div>
