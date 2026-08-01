# NAMP migration roadmap

Plan for unifying the three repositories (zny-nomp / node-stratum-pool /
node-multi-hashing) into the namp monorepo. Each phase is self-contained
so the source repos keep operating during the staged migration.

## Phase 0 — Scaffold (done: 2026-08-02)

- [x] git init (main / develop)
- [x] npm workspaces (`packages/*`), TypeScript 7, prettier, MIT license
- [x] README / ROADMAP / CLAUDE.md
- [x] Interim multi-repo management (manage.sh / namp.code-workspace)

## Phase 1 — History-preserving merge

Rewrite each repo's develop branch with git filter-repo so its files move
under `packages/<name>/`, then merge with --allow-unrelated-histories in
dependency order (most-depended-on first). Every commit survives in namp.

- [ ] multi-hashing → `packages/multi-hashing`
- [ ] stratum-pool → `packages/stratum-pool`
- [ ] zny-nomp → `packages/portal`
- [ ] Drop the side-by-side clones and their temporary .gitignore entries

## Phase 2 — Workspace references

- [ ] Replace git-URL dependencies (`stratum-pool: git#develop`,
      `multi-hashing: git#develop`) with workspace references and unify
      the lockfile at the root
- [ ] Consolidate CI (GitHub Actions): typecheck / test / native build /
      check:config across workspaces
- [ ] Redesign the release flow (single tag instead of
      "tag downstream, pin upstream")

## Phase 3 — TS7 alignment and rebranding

- [ ] Unify each package's typescript ^6 → ^7 (hoisted to root devDependencies)
- [ ] Share eslint / prettier config at the root
- [ ] Rebrand zny-nomp-specific naming in the portal to NAMP
      (BitZeny-specific → general-purpose)
- [ ] Swap web UI branding

## Phase 4 — Cutover

- [ ] Release v1.0.0 (the GitHub repo is already public)
- [ ] Archive the three source repos with a pointer to namp in their READMEs
- [ ] Reconfigure dependabot / branch protection
