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

npm workspaces monorepo (`packages/*`). **Currently a scaffold — packages/
is empty.** The three source repos sit side-by-side at the root as plain
clones, excluded via .gitignore:

- `zny-nomp/` → will become `packages/portal` (pool portal + web UI)
- `node-stratum-pool/` → `packages/stratum-pool` (stratum protocol layer)
- `node-multi-hashing/` → `packages/multi-hashing` (C++ native, not TS)

Dependency direction: portal → stratum-pool → multi-hashing.
**The migration baseline is each repo's develop branch (TypeScript).**
Since 2026-08-02 main follows the same TS line (replaced via a -s ours
merge; the legacy JS main survives as each repo's legacy-main branch).
ROADMAP.md is the source of truth for migration steps and progress.

Important: until the merge completes, code changes go to the source
repos' develop branches (packages/ has no content yet). Use `./manage.sh`
(status / sync / pull / push / exec) for bulk git operations across the
three repos.

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
model). Branching: develop for work, merged into main.

**Never add `Co-Authored-By: Claude` or other AI trailers to commits**
(owner policy: Claude showing up in the contributor list makes the repo
harder to manage).

## GitHub

- Owner: ROZ-MOFUMOFU-ME (User account). The gh CLI is authenticated as
  emerauda (collaborator; can push / merge). Creating new repos under
  ROZ-MOFUMOFU-ME is NOT possible from emerauda
- The claude.ai GitHub connector cannot write to ROZ-MOFUMOFU-ME repos
  (read-only there) — use the gh CLI for writes
