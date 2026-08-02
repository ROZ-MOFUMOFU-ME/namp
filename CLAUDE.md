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

npm workspaces monorepo (`packages/*`). **M1 (history import) is done**:
the full develop histories live under packages/, imported via git
filter-repo path rewrites (blame/bisect work across the import).

- `packages/portal` (from zny-nomp) — pool portal + web UI
- `packages/stratum-pool` (from node-stratum-pool) — stratum protocol layer
- `packages/multi-hashing` (from node-multi-hashing) — C++ native, not TS

Dependency direction: portal → stratum-pool → multi-hashing.
**Development happens in this repository now.** The source repos are
frozen pending archive (M4); their main branches follow the TS develop
line since 2026-08-02 (legacy JS mains survive as legacy-main).
ROADMAP.md is the source of truth for migration steps and progress.

Until M2 lands workspace references, package.json deps still use git
URLs (`stratum-pool#develop`, `multi-hashing#develop`), so npm installs
duplicate copies inside packages/*/node_modules; the root node_modules
symlinks are the workspace-local versions.

## Toolchain

- Node 22.18+ (.nvmrc says 24), ESM (`"type": "module"`)
- **TypeScript 7** (native compiler). Packages extend tsconfig.base.json.
  `noEmit` + `erasableSyntaxOnly`: code runs via Node's native type
  stripping / tsx, tsc is typecheck-only. Do not use non-erasable syntax
  such as enums
- Root scripts delegate to workspaces: `npm run typecheck` / `npm test` /
  `npm run lint`
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
