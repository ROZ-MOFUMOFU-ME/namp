/*
 * The addon is intentionally JavaScript (see native/CLAUDE.md); every export
 * is a hash function taking Buffers/numbers and returning a Buffer. Typed
 * loosely on purpose — the algorithm table wraps them per algorithm.
 */
declare const multiHashing: Record<string, (...args: any[]) => Buffer>;
export = multiHashing;
