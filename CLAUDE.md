# CLAUDE.md

Guidance for working on the NAMP (Node All-in-One Mining Portal) monorepo.

## Naming

- Write **NAMP** (uppercase) in documentation and UI
- The repository / package name and paths are lowercase `namp`
- Lineage: NOMP (Node Open Mining Portal) → ZNY-NOMP → NAMP

## Language

All code, comments, documentation and commit messages are written in
English.

## Layout and current state

One flat application — a single package.json, lockfile and node_modules
(M5 dissolved the interim npm workspaces):

- `src/` — the portal: cluster master (`init.ts`) + pool / payment /
  website workers
- `src/stratum/` — the stratum protocol library (GPL-2.0), imported
  relatively (`./stratum/index.ts`); deep imports use `./stratum/*.ts`
- `native/` — the C/C++ hashing addon (GPL-2.0, NAN, deliberately JS
  loader `index.cjs`); binding.gyp at the root builds it on install
- `web/` — the React/Vite SPA with its own tsconfig; built to
  `web/dist`, served by `src/website.ts`
- `test/` — every suite, one `node --test` run (hashing vectors on
  node:test included); redis-backed tests skip without a local Redis
- `coins/`, `pool_configs/` — operator config (examples committed, real
  files gitignored); `docs/` — operator guides

**Development happens here.** The source repos (zny-nomp,
node-stratum-pool, node-multi-hashing) are frozen pending archive;
their main branches follow the TS line since 2026-08-02 (legacy JS
mains survive as legacy-main). ROADMAP.md is the source of truth.

Per-directory CLAUDE.md files (src/, src/stratum/, native/) carry the
deep dives. CI is one root pipeline; releases are one vX.Y.Z tag
matching package.json (.github/workflows/).

## Toolchain

- Node 22.18+ (.nvmrc says 24), ESM (`"type": "module"`); the backend
  runs on plain Node — buildless TS via native type stripping, no
  loader (tsx retired with the workspaces: no more .ts under
  node_modules)
- **TypeScript 7** (native compiler, root devDependency). Packages
  extend tsconfig.base.json; `noEmit` + `erasableSyntaxOnly` +
  `verbatimModuleSyntax` keep the code runnable under Node's native
  type stripping / tsx — tsc is typecheck-only. Do not use
  non-erasable syntax such as enums
- **Linting: eslint 10 + @babel/eslint-parser** (typescript-eslint
  cannot run against TS7 — no JS compiler API). TS is parsed with
  @babel/preset-typescript (no type info); rules that misfire without
  types (no-unused-vars, no-undef) stay off — tsc owns type-aware
  checking. The whole lint setup is one root eslint.config.js (per-area
  rule blocks inside it) plus root devDependencies; run `npm run lint`
  from the root — packages have no lint/format scripts of their own
- Root scripts: `npm run typecheck` / `npm test` delegate to the
  workspaces; `npm run lint` / `npm run format` run directly at the root
- prettier: singleQuote / semi / tabWidth 4 / trailingComma none (.prettierrc)

## Commit conventions

conventional commits (`fix(stats): ...` / `feat:` / `chore:` / `docs:`).
Explain what changed and why in the body (zny-nomp's main history is the
model). Single-branch flow: everything lands on main (no develop
branch in this repo; the frozen source repos keep theirs).

**Never add `Co-Authored-By: Claude` or other AI trailers to commits**
(owner policy: Claude showing up in the contributor list makes the repo
harder to manage).

## GitHub

- Owner: ROZ-MOFUMOFU-ME (User account). The gh CLI is authenticated as
  emerauda (collaborator; can push / merge). Creating new repos under
  ROZ-MOFUMOFU-ME is NOT possible from emerauda
- The claude.ai GitHub connector cannot write to ROZ-MOFUMOFU-ME repos
  (read-only there) — use the gh CLI for writes
