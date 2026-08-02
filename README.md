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

[MIT](LICENSE)
