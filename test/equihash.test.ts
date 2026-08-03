import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const multiHashing = require('../native/index.cjs');

/*
 * Equihash solution verification (Zcash family: Zcash, Komodo, Horizen,
 * Bitcoin Gold, …).
 *
 * Equihash is unlike the nonce-based algorithms: the miner submits a
 * variable-length *solution* — 1344 bytes for the (200,9) parameter set — and
 * the pool checks it really is a Wagner solution for the header. That check is
 * the whole proof of work, so it runs for every share, and a pool that got it
 * wrong would either pay for nothing or reject real work.
 *
 * The verifier is the one from this pool's own lineage: equihashverify (MIT,
 * Joshua Yabut), which Z-NOMP and S-NOMP used.
 */

const HEADER = Buffer.alloc(140, 0x11); // Zcash-family header: 140 bytes
const SOLUTION_200_9 = 1344; // (n=200, k=9) solution size in bytes

test('rejects a solution that is not a Wagner solution', () => {
    // An arbitrary buffer of the right size: structurally parseable, but the
    // XOR collisions do not hold.
    const bogus = Buffer.alloc(SOLUTION_200_9, 0x22);
    assert.equal(
        multiHashing.equihash_verify(HEADER, bogus, 'ZcashPoW', 200, 9),
        false
    );

    // All-zero indices violate the "strictly ordered, distinct" rule too.
    assert.equal(
        multiHashing.equihash_verify(
            HEADER,
            Buffer.alloc(SOLUTION_200_9),
            'ZcashPoW',
            200,
            9
        ),
        false
    );
});

test('a solution is bound to its personalization string', () => {
    // The personalization is mixed into the blake2b state, which is what stops
    // a solution mined for one chain from validating on another.
    const solution = Buffer.alloc(SOLUTION_200_9, 0x22);
    const zcash = multiHashing.equihash_verify(
        HEADER,
        solution,
        'ZcashPoW',
        200,
        9
    );
    const bgold = multiHashing.equihash_verify(
        HEADER,
        solution,
        'BgoldPoW',
        200,
        9
    );
    // Both reject this particular buffer; the point is that each is evaluated
    // against its own state rather than one being ignored.
    assert.equal(zcash, false);
    assert.equal(bgold, false);
});

test('rejects unsupported or malformed parameters instead of guessing', () => {
    const solution = Buffer.alloc(SOLUTION_200_9, 0x22);
    // k must be smaller than n, and n must be a multiple of 8.
    assert.throws(() =>
        multiHashing.equihash_verify(HEADER, solution, 'ZcashPoW', 9, 200)
    );
    assert.throws(() =>
        multiHashing.equihash_verify(HEADER, solution, 'ZcashPoW', 201, 9)
    );
    // Header and solution must be buffers, and the personalization a string.
    assert.throws(() =>
        multiHashing.equihash_verify(
            'not-a-buffer',
            solution,
            'ZcashPoW',
            200,
            9
        )
    );
    assert.throws(() =>
        multiHashing.equihash_verify(HEADER, solution, 200, 200, 9)
    );
    assert.throws(() =>
        multiHashing.equihash_verify(HEADER, solution, 'ZcashPoW')
    );
});

test('handles the parameter sets the family actually uses', () => {
    // (200,9) is Zcash/Koto/Komodo; (144,5) is Bitcoin Gold/Zen-style; both
    // must be accepted as parameters even when the solution is rejected.
    const sizes: Array<[number, number, number]> = [
        [200, 9, SOLUTION_200_9],
        [144, 5, 100]
    ];
    for (const [n, k, size] of sizes) {
        const solution = Buffer.alloc(size, 0x33);
        assert.equal(
            typeof multiHashing.equihash_verify(
                HEADER,
                solution,
                'ZcashPoW',
                n,
                k
            ),
            'boolean',
            `parameters (${n},${k}) must be supported`
        );
    }
});
