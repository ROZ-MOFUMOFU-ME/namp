# NAMP — Node All-in-One Mining Portal

**NAMP** is a monorepo unifying the ROZ-MOFUMOFU-ME mining pool stack.
It continues the NOMP (Node Open Mining Portal) lineage and provides the
pool portal, the stratum layer and the hashing module all in one.

- Written **NAMP**; the repository/package name is lowercase `namp`
- TypeScript 7 (native compiler), ESM, Node 22.18+

## What gets unified

| Target (planned)         | Source repository                                                           | Role                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------- |
| `packages/portal`        | [zny-nomp](https://github.com/ROZ-MOFUMOFU-ME/zny-nomp)                     | Pool portal (NOMP) + web UI     |
| `packages/stratum-pool`  | [node-stratum-pool](https://github.com/ROZ-MOFUMOFU-ME/node-stratum-pool)   | Stratum protocol layer          |
| `packages/multi-hashing` | [node-multi-hashing](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing) | Hashing algorithms (C++ native) |

Dependency direction: `portal → stratum-pool → multi-hashing`.
The **develop branches (TypeScript) of the source repos are the migration
baseline**. The merge preserves full history via git filter-repo; see
[ROADMAP.md](ROADMAP.md) for the plan.

## Current state: scaffold

`packages/` is still empty. Until the migration completes, the three source
repos live side-by-side in this directory as plain clones, excluded via
`.gitignore` — code changes still go to each repo's develop branch.

### Interim multi-repo management — manage.sh

```bash
./manage.sh status        # branch, changes and ahead/behind for each repo
./manage.sh sync          # fetch + ff-update main/develop + pull current branch
./manage.sh exec log -1   # run any git command across the three repos
```

### VS Code

```bash
code namp.code-workspace
```

## Development (monorepo)

```bash
nvm use            # Node 24 (.nvmrc)
npm install
npm run typecheck  # runs each workspace's typecheck (TS7)
npm test           # runs each workspace's tests
npm run format     # prettier
```

The shared TypeScript config is [tsconfig.base.json](tsconfig.base.json);
each package extends it. `erasableSyntaxOnly` keeps the code runnable
as-is under Node's native type stripping (tsc is typecheck-only).

## License

[MIT](LICENSE)
