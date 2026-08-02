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

## License

Per package: the repo scaffolding and `packages/portal` are
[MIT](LICENSE); `packages/stratum-pool` and `packages/multi-hashing`
are GPL-2.0 (see their LICENSE files), inherited from their upstream
lineage.
