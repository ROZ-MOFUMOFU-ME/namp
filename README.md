# NAMP — Node All-in-One Mining Portal

**NAMP** is a monorepo unifying the ROZ-MOFUMOFU-ME mining pool stack.
It continues the NOMP (Node Open Mining Portal) lineage and provides the
pool portal, the stratum layer and the hashing module all in one.

- Written **NAMP**; the repository/package name is lowercase `namp`
- TypeScript 7 (typecheck; code runs buildless via Node type stripping), ESM, Node 22.18+

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
[stratum-tls.md](docs/stratum-tls.md), and
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
