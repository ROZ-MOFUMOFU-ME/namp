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

Dependency direction: portal → stratum-pool → multi-hashing, wired as
**workspace references** (single root lockfile; `packages/portal/web`
is a separate npm project, not a workspace, with its own lockfile).
**Development happens in this repository now.** The source repos are
frozen pending archive (M4); their main branches follow the TS develop
line since 2026-08-02 (legacy JS mains survive as legacy-main).
ROADMAP.md is the source of truth for migration steps and progress.

Each package has its own CLAUDE.md with package-specific guidance
(architecture, commands, caveats) — read it before working inside that
package. CI is one root pipeline (.github/workflows/ci.yml); releases
are one vX.Y.Z tag matching the root package.json version
(.github/workflows/release.yml).

## Toolchain

- Node 22.18+ (.nvmrc says 24), ESM (`"type": "module"`)
- **TypeScript 7** (native compiler, root devDependency). Packages
  extend tsconfig.base.json; `noEmit` + `erasableSyntaxOnly` +
  `verbatimModuleSyntax` keep the code runnable under Node's native
  type stripping / tsx — tsc is typecheck-only. Do not use
  non-erasable syntax such as enums
- **Linting: eslint 10 + @babel/eslint-parser** (typescript-eslint
  cannot run against TS7 — no JS compiler API). TS is parsed with
  @babel/preset-typescript (no type info); rules that misfire without
  types (no-unused-vars, no-undef) stay off — tsc owns type-aware
  checking. The whole lint toolchain lives in the root devDependencies;
  each package keeps its own eslint.config.js (rule sets differ)
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
