/*
 * Ambient module declarations shared across the workspace for runtime
 * dependencies that ship no TypeScript types and have no @types package.
 * A bare declaration types the import as `any`, which is acceptable here.
 * Package-specific shims live in each package's own types/ directory.
 */

// koto/zcash address handling (used by stratum-pool, type-checked by the
// portal through its deep imports).
declare module '@exodus/bitcoinjs-lib-zcash';
/*
 * Ambient module declarations for runtime dependencies that ship no TypeScript
 * types and have no @types package on DefinitelyTyped. Each is small and
 * stable; a bare declaration types the import as `any`, which is acceptable for
 * these. (`dot` is only used by the legacy website templates and will be
 * dropped once the Vite + React SPA lands.)
 */
declare module 'node-json-minify';

// Optional runtime add-ons loaded via dynamic import() in init.ts; not declared
// dependencies, so make their bare specifiers resolvable as `any`.
declare module 'newrelic';
declare module 'posix';

// node-json-minify installs JSON.minify at runtime (see init.ts); declare it on
// the global JSON object so call sites typecheck.
interface JSON {
    minify(json: string): string;
}
