# NAMP — Node All-in-One Mining Portal

**NAMP** is a monorepo unifying the ROZ-MOFUMOFU-ME mining pool stack.
It continues the NOMP (Node Open Mining Portal) lineage and provides the
pool portal, the stratum layer and the hashing module all in one.

- Written **NAMP**; the repository/package name is lowercase `namp`
- TypeScript 7 (typecheck; code runs buildless via Node type stripping), ESM, Node 22.18+

## Packages

| Package                  | Imported from                                                               | Role                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------- |
| `packages/portal`        | [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp)                     | Pool portal (NOMP) + web UI     |
| `packages/stratum-pool`  | [node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool)   | Stratum protocol layer          |
| `packages/multi-hashing` | [node-multi-hashing](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing) | Hashing algorithms (C++ native) |

Dependency direction: `portal → stratum-pool → multi-hashing`.
Each package carries the full commit history of its source repo,
imported with git filter-repo path rewrites (nothing squashed).

## Repository map

```
namp/
├── package.json          # workspaces root — install/typecheck/lint/test/format run here
├── tsconfig.base.json    # shared TS config; each package extends it
├── .github/workflows/    # the one CI + release pipeline (ci.yml, release.yml)
├── ROADMAP.md            # migration state + stack-wide roadmap
└── packages/
    ├── portal/           # the mining portal (package: namp-portal, MIT)
    │   ├── src/          #   backend: cluster master + pool/payment/web workers (buildless TS)
    │   ├── web/          #   React/Vite SPA — separate npm project with its own lockfile
    │   │                 #   (NOT a workspace; the stack's only build step)
    │   ├── coins/        #   coin definitions (examples committed, real configs gitignored)
    │   ├── pool_configs/ #   per-pool configs (same convention)
    │   └── docs/         #   operator guides (TLS, reverse proxy, payment schemes)
    ├── stratum-pool/     # stratum protocol library (GPL-2.0)
    │   └── src/          #   daemon RPC, job/share pipeline, stratum server, algo registry
    └── multi-hashing/    # C++ hashing addon (GPL-2.0, NAN, deliberately JavaScript)
        └── src/          #   one file per algorithm + sha3/crypto/kawpow primitives
```

Rules of thumb: run every command from the root (`npm install`,
`npm run typecheck`, `npm run lint`, `npm test`, `npm run format`);
each package's CLAUDE.md carries the deep dive for that layer; the only
place with a second `npm install` is `packages/portal/web`
(`--legacy-peer-deps`, see its README).

## Current state

The three source histories are fully imported under `packages/`
(migration phase M1) — 2,700+ commits, blame/bisect intact. Development
happens in this repository now; the source repos are frozen pending
archive. The packages reference each other as npm workspaces behind a
single root lockfile (see [ROADMAP.md](ROADMAP.md) for the migration
state).

## Development

```bash
nvm use            # Node 24 (.nvmrc)
npm install
npm run typecheck  # runs each workspace's typecheck (tsc --noEmit)
npm test           # runs each workspace's tests
npm run format     # prettier
```

The shared TypeScript config is [tsconfig.base.json](tsconfig.base.json);
each package extends it. `erasableSyntaxOnly` keeps the code runnable
as-is under Node's native type stripping (tsc is typecheck-only).

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

Per package: the repo scaffolding and `packages/portal` are
[MIT](LICENSE); `packages/stratum-pool` and `packages/multi-hashing`
are GPL-2.0 (see their LICENSE files), inherited from their upstream
lineage.
