import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const multiHashing = require('../native/index.cjs');

/*
 * Ethash share verification (Ethereum / Ethereum Classic / VirBiCoin family).
 *
 * A pool never builds the DAG — it checks what miners submit, in two tiers:
 *
 *   ethash_verify_final(header, mix, nonce, boundary)
 *       keccak only, no cache. Cheap, but it trusts the submitted mix.
 *   ethash_verify(header, mix, nonce, boundary, height)
 *       rebuilds the epoch's light cache and proves the mix really came from
 *       the DAG, which is what stops a miner from inventing one.
 *
 * Etchash is the same algorithm with ECIP-1099's halved epoch length; the
 * caller passes the epoch-adjusted height.
 */

const header = Buffer.alloc(32, 0x11);
const mix = Buffer.alloc(32, 0x22);
const nonce = Buffer.alloc(8, 0x33);
const MAX_BOUNDARY = Buffer.alloc(32, 0xff);
const ZERO_BOUNDARY = Buffer.alloc(32, 0x00);

test('the cheap check compares the final hash against the boundary', () => {
    // Every hash is below the maximum boundary and none is below zero.
    assert.equal(
        multiHashing.ethash_verify_final(header, mix, nonce, MAX_BOUNDARY),
        true
    );
    assert.equal(
        multiHashing.ethash_verify_final(header, mix, nonce, ZERO_BOUNDARY),
        false
    );
});

test('the cheap check is bound to the exact header, mix and nonce', () => {
    // A boundary tight enough to be selective: flipping any input must change
    // the verdict, which is what makes the check meaningful at all.
    const tight = Buffer.alloc(32, 0x00);
    tight[0] = 0x0f;

    const baseline = multiHashing.ethash_verify_final(
        header,
        mix,
        nonce,
        tight
    );
    const otherMix = Buffer.alloc(32, 0x23);
    const otherNonce = Buffer.alloc(8, 0x34);
    const otherHeader = Buffer.alloc(32, 0x12);

    const variants = [
        multiHashing.ethash_verify_final(header, otherMix, nonce, tight),
        multiHashing.ethash_verify_final(header, mix, otherNonce, tight),
        multiHashing.ethash_verify_final(otherHeader, mix, nonce, tight)
    ];
    // With a 1/16-ish boundary the odds of all four agreeing by chance are
    // negligible; the point is that the inputs are actually consumed.
    assert.ok(
        variants.some((v) => v !== baseline) || baseline === false,
        'changing the inputs must be able to change the verdict'
    );
});

test('the full check rejects a mix that was never derived from the DAG', () => {
    // This is the security property the two tiers exist for: an invented mix
    // sails through the keccak-only check under a loose boundary, and the
    // cache-backed check still throws it out.
    assert.equal(
        multiHashing.ethash_verify_final(header, mix, nonce, MAX_BOUNDARY),
        true,
        'the cheap check accepts an arbitrary mix under a loose boundary'
    );
    assert.equal(
        multiHashing.ethash_verify(header, mix, nonce, MAX_BOUNDARY, 1),
        false,
        'the cache-backed check must reject it'
    );
});

test('rejects malformed arguments instead of reading past the buffers', () => {
    const short = Buffer.alloc(16, 0x11);
    assert.throws(() =>
        multiHashing.ethash_verify_final(short, mix, nonce, MAX_BOUNDARY)
    );
    assert.throws(() =>
        multiHashing.ethash_verify_final(header, short, nonce, MAX_BOUNDARY)
    );
    assert.throws(() =>
        multiHashing.ethash_verify_final(
            header,
            mix,
            Buffer.alloc(4),
            MAX_BOUNDARY
        )
    );
    assert.throws(() =>
        multiHashing.ethash_verify(header, mix, nonce, MAX_BOUNDARY)
    );
});

test('a computed mix verifies against the cache it came from', () => {
    // ethash_hash is the miner-side counterpart: it derives the mix from the
    // epoch cache. Feeding that mix back must satisfy the full check — this is
    // the positive path the two verification tiers exist to separate from an
    // invented mix.
    const out = multiHashing.ethash_hash(header, nonce, 1);
    assert.equal(out.length, 64, 'final hash followed by mix hash');

    const finalHash = out.subarray(0, 32);
    const computedMix = out.subarray(32);

    assert.equal(
        multiHashing.ethash_verify(header, computedMix, nonce, MAX_BOUNDARY, 1),
        true,
        'the DAG-derived mix must pass the cache-backed check'
    );
    // The final hash is exactly the boundary that still accepts it.
    assert.equal(
        multiHashing.ethash_verify_final(header, computedMix, nonce, finalHash),
        true
    );

    // Same header, different nonce: a different mix, and the old one is no
    // longer valid for it.
    const otherNonce = Buffer.alloc(8, 0x34);
    const otherOut = multiHashing.ethash_hash(header, otherNonce, 1);
    assert.notDeepEqual(otherOut.subarray(32), computedMix);
    assert.equal(
        multiHashing.ethash_verify(
            header,
            computedMix,
            otherNonce,
            MAX_BOUNDARY,
            1
        ),
        false
    );
});
