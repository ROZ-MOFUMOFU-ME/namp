/*
 * Ambient module declarations shared across the workspace for runtime
 * dependencies that ship no TypeScript types and have no @types package.
 * A bare declaration types the import as `any`, which is acceptable here.
 * Package-specific shims live in each package's own types/ directory.
 */

// koto/zcash address handling (used by stratum-pool, type-checked by the
// portal through its deep imports).
declare module '@exodus/bitcoinjs-lib-zcash';

// multi-hashing is an intentionally JS-only NAN native addon (no .d.ts).
declare module 'multi-hashing';
