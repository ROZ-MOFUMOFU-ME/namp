# NAMP — Node All-in-One Mining Portal

**NAMP** is a complete cryptocurrency mining pool in one repository: the pool
portal, the stratum servers, the web UI and the native hashing code, all
installed and run as a single application. It continues the NOMP (Node Open
Mining Portal) lineage.

[![CI](https://github.com/ROZ-MOFUMOFU-ME/namp/actions/workflows/ci.yml/badge.svg)](https://github.com/ROZ-MOFUMOFU-ME/namp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ROZ-MOFUMOFU-ME/namp?logo=github&color=success)](https://github.com/ROZ-MOFUMOFU-ME/namp/releases)
[![License](https://img.shields.io/github/license/ROZ-MOFUMOFU-ME/namp?color=blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.18-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/zHUdQy2NzU)

- Written **NAMP**; the repository/package name is lowercase `namp`
- TypeScript 7 (typecheck; code runs buildless via Node type stripping), ESM, Node 22.18+

## Features

- **Two mining families in one portal.** 49 Bitcoin-family algorithms
  (sha256d, scrypt, quark, x11/x16r, lyra2, yescrypt/yespower, vipstar and
  more) on the classic stratum pipeline, plus the **Ethash family** —
  Ethereum, Ethereum Classic (Etchash) and VirBiCoin — with its own work
  model, eth-proxy stratum dialect and chain-side payment processing.
- **10 payment schemes.** prop, pplnt, pplns, solo, pps, dpps, fpps, ppsplus,
  smpps, esmpps — see [docs/payment-schemes.md](docs/payment-schemes.md).
  Ethash pools support prop, solo and pplns.
- **Payment processing that understands the chain.** Block maturity, orphan
  and uncle handling, per-height block reward schedules, and payouts with
  balances tracked per worker.
- **Variable difficulty and banning** on every stratum port, per-port TLS,
  and an HTTP getwork bridge for miners that cannot speak the qtum stratum.
- **Web UI** with live stats over server-sent events, per-worker pages,
  found blocks, payments, and operator branding — in 20 languages.
- **Multi-process by design.** Clustered pool workers share the stratum
  ports; the website, payment processing and CLI run as their own forks.
- **Buildless TypeScript.** `npm start` runs the sources directly under
  Node's native type stripping; the only build step is the web SPA.

## Supported chains

Any Bitcoin-family coin whose daemon speaks `getblocktemplate` works by
writing a coin definition — 10 are shipped as examples (BitZeny, Koto,
MonaCoin, VIPSTARCOIN, Sugarchain, Bellcoin, Yenten, KumaCoin, Susucoin,
VirBiCoin), covering PoW/PoS hybrids, Sapling/Koto-style block
construction and the qtum-style 181-byte header.

The **Ethash family** runs beside them against any geth-family node
(`eth_getWork` / `eth_submitWork`): Ethereum, Ethereum Classic via
Etchash's ECIP-1099 epoch length, and VirBiCoin. See
[docs/ethash.md](docs/ethash.md).

## Quick start

```bash
git clone https://github.com/ROZ-MOFUMOFU-ME/namp.git && cd namp
npm install                          # dependencies + the native hashing addon

cp config_example.json config.json   # portal: redis, website, cli port
cp coins/coins-examples/bitzeny.json coins/
cp pool_configs/examples/bitzeny.json pool_configs/
#   edit pool_configs/bitzeny.json: daemon credentials, your pool address, ports

npm run build                        # build the web UI
npm start                            # run the portal
```

Redis 6.2+ and a synced coin daemon are the only external requirements.
[docs/guide.md](docs/guide.md) walks through every configuration key, and
[docs/security.md](docs/security.md) covers hardening before you expose a
pool to the internet.

## Packages

| Lives in                 | Imported from                                                               | Role                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------- |
| `src/`, `web/`           | [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp)                     | Pool portal (NOMP) + web UI     |
| `src/` (stratum modules) | [node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool)   | Stratum protocol layer          |
| `native/`                | [node-multi-hashing](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing) | Hashing algorithms (C++ native) |

Dependency direction: `portal → stratum-pool → multi-hashing`.
Each package carries the full commit history of its source repo,
imported with git filter-repo path rewrites (nothing squashed).

## Repository map

```
namp/
├── package.json          # THE package.json — deps, scripts, everything
├── binding.gyp           # native addon build (node-gyp, runs on install)
├── tsconfig.json         # backend compiler project (web/ has its own)
├── eslint.config.js      # the one lint config (per-area rule blocks)
├── src/                  # the whole backend: portal workers + stratum protocol modules
├── native/               # C/C++ hashing sources + CJS loader
├── web/                  # React/Vite SPA (own tsconfig; built to web/dist)
├── test/                 # every suite: hashing vectors + stratum + portal
├── coins/ pool_configs/  # coin definitions & pool configs (examples committed)
├── docs/                 # operator guides (setup, TLS, reverse proxy, payments)
├── Dockerfile            # container build; docker-compose.yml for the dev stack
└── .github/workflows/    # the one CI + release pipeline
```

Everything runs from the root: `npm install` (builds the addon),
`npm start` (plain Node — buildless TS via native type stripping),
`npm test`, `npm run lint / typecheck / format`, `npm run build` (the
SPA, the stack's only build step). Operator documentation lives in
[docs/](docs/): [guide.md](docs/guide.md) (full setup),
[payment-schemes.md](docs/payment-schemes.md),
[reverse-proxy.md](docs/reverse-proxy.md),
[stratum-tls.md](docs/stratum-tls.md), [ethash.md](docs/ethash.md),
[security.md](docs/security.md) (hardening a deployment), and
[stratum.md](docs/stratum.md) (the stratum layer's feature reference).

## Development

```bash
nvm use            # Node 24 (.nvmrc)
npm install        # one install: dependencies + the native addon build
npm start          # run the portal (plain Node, no loader, no build)
npm run typecheck  # backend + web compiler projects
npm run lint       # eslint (backend + web)
npm test           # one node --test run: vectors + stratum + portal
npm run build      # build the web SPA (the only build step)
npm run web:dev    # Vite dev server on :5173, proxying /api to the portal
npm run format     # prettier
```

The backend compiler project is [tsconfig.json](tsconfig.json);
`erasableSyntaxOnly` keeps the code runnable as-is under Node's native
type stripping (tsc is typecheck-only). The SPA has its own tsconfig
under `web/`.

## Docker

```bash
docker compose up -d          # portal + redis, using your config.json
```

The image builds the addon and the SPA; mount `config.json`, `coins/` and
`pool_configs/` to configure it.

## Testing

```bash
npm test
```

308 tests run in one `node --test` pass: known-answer vectors for the
hashing algorithms, the stratum protocols, share validation and block
serialization, the Ethash job/payment paths, and integration tests that
drive a real pool against a mock daemon over a socket. Redis-backed tests
skip when no Redis is reachable (CI provides one on 6379).

## Community

NAMP official Discord: [discord.gg/zHUdQy2NzU](https://discord.gg/zHUdQy2NzU)

Some pools using this stack:

- [mofumofu.me — BitZeny Mining Pool](https://zny.mofumofu.me/)

If your pool runs NAMP, let us know and we will list it here.

## Contributing

1. Fork this repository
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit and push your changes
4. Open a Pull Request

Before submitting, run everything from the repo root:

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

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

### NAMP

- [ROZ](https://github.com/ROZ-MOFUMOFU-ME)
- [zinntikumugai](https://github.com/zinntikumugai) - great supporter

### Portal lineage (NOMP → Z-NOMP → K-NOMP → S-NOMP → zny-nomp)

- [Matthew Little / zone117x](https://github.com/zone117x) - developer of NOMP
- [Jerry Brady / mintyfresh68](https://github.com/bluecircle) - got coin-switching fully working and developed proxy-per-algo feature
- [Tony Dobbs](http://anthonydobbs.com) - designs for front-end and created the NOMP logo
- [LucasJones](//github.com/LucasJones) - got p2p block notify working and implemented additional hashing algos
- [vekexasia](//github.com/vekexasia) - co-developer & great tester
- [TheSeven](//github.com/TheSeven) - answering an absurd amount of questions, found the block 1-16 problem, provided example code for peer node functionality
- [UdjinM6](//github.com/UdjinM6) - helped implement fee withdrawal in payment processing
- [Alex Petrov / sysmanalex](https://github.com/sysmanalex) - contributed the pure C block notify script
- [svirusxxx](//github.com/svirusxxx) - sponsored development of MPOS mode
- [icecube45](//github.com/icecube45) - helping out with the repo wiki
- [Fcases](//github.com/Fcases) - ordered me a pizza <3
- [Joshua Yabut / movrcx](https://github.com/joshuayabut), [Aayan L / anarch3](https://github.com/aayanl), [hellcatz](https://github.com/hellcatz) (Z-NOMP)
- [yoshuki43](https://github.com/yoshuki43) (K-NOMP)
- [egyptianbman](https://github.com/egyptianbman), [nettts](https://github.com/nettts), [potato](https://github.com/zzzpotato) (S-NOMP)
- [Invader444](//github.com/Invader444) (cryptocurrency-stratum-pool)

### Stratum lineage (node-stratum-pool)

- [Slush0](//github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
- [viperaus](//github.com/viperaus/stratum-mining) - scrypt adaptions to python code
- [ahmedbodi](//github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
- [steveshit](//github.com/steveshit) - ported X11 hashing algo from python to node module
- [pronooob](https://dogehouse.org) - knowledgeable & helpful

### Hashing algorithms (multi-hashing)

- [NSA](http://www.nsa.gov/) and [NIST](http://www.nist.gov/) for creation or sponsoring creation of SHA2 and SHA3 algos
- [Keccak](http://en.wikipedia.org/wiki/Keccak) - Guido Bertoni, Joan Daemen, Michaël Peeters, and Gilles Van Assche
- [Skein](<http://en.wikipedia.org/wiki/Skein_(hash_function)>) - Bruce Schneier, Stefan Lucks, Niels Ferguson, Doug Whiting, Mihir Bellare, Tadayoshi Kohno, Jon Callas and Jesse Walker.
- [BLAKE](<http://en.wikipedia.org/wiki/BLAKE_(hash_function)>) - Jean-Philippe Aumasson, Luca Henzen, Willi Meier, and Raphael C.-W. Phan
- [Grøstl](http://en.wikipedia.org/wiki/Gr%C3%B8stl) - Praveen Gauravaram, Lars Knudsen, Krystian Matusiewicz, Florian Mendel, Christian Rechberger, Martin Schläffer, and Søren S. Thomsen
- [JH](<http://en.wikipedia.org/wiki/JH_(hash_function)>) - Hongjun Wu
- [Fugue](<http://en.wikipedia.org/wiki/Fugue_(hash_function)>) - Shai Halevi, William E. Hall, and Charanjit S. Jutla
- [scrypt](http://en.wikipedia.org/wiki/Scrypt) - Colin Percival
- [bcrypt](http://en.wikipedia.org/wiki/Bcrypt) - Niels Provos and David Mazières
- [X11](http://www.darkcoin.io/), [Hefty1](http://heavycoin.github.io/about.html), [Quark](http://www.qrk.cc/) creators
- Those that contributed to [node-stratum-pool](//github.com/zone117x/node-stratum-pool#credits)

## Support

- 🐛 Bug reports: [Issues](https://github.com/ROZ-MOFUMOFU-ME/namp/issues)
- 💡 Feature requests: [Discussions](https://github.com/ROZ-MOFUMOFU-ME/namp/discussions)
- 💬 Community: [Discord](https://discord.gg/zHUdQy2NzU)

## Team

[![Contributors](https://contrib.rocks/image?repo=ROZ-MOFUMOFU-ME/namp)](https://github.com/ROZ-MOFUMOFU-ME/namp/graphs/contributors)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ROZ-MOFUMOFU-ME/namp&type=Date&theme=dark)](https://star-history.com/#ROZ-MOFUMOFU-ME/namp&Date)

**⭐ If you like this project, please give it a star! ⭐** Made with ❤️ by [ROZ](https://github.com/ROZ-MOFUMOFU-ME)

## License

[GPL-2.0](LICENSE). NAMP descends from NOMP and ships as one program
statically combined with its GPL-2.0 stratum and hashing code, so the
whole repository is licensed GPL-2.0-only — the historical MIT marking
on the portal portion could not survive the combination.
