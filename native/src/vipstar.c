/*
 * VIPSTARCOIN proof of work: double SHA-256 over the full qtum-style
 * serialized header — the 80 bitcoin bytes plus hashStateRoot, hashUTXORoot,
 * prevoutStake and the (empty) vchBlockSig length byte, 181 bytes in all —
 * exactly what the daemon's block.GetHash() computes.
 *
 * The previous entry point was cpuminer's sha256d_181_swap, which expects a
 * byte-swapped, pre-padded 192-byte buffer: fed the 181 wire bytes the pool
 * has, it read past the end and every share came out at difficulty 0. The
 * hash takes the bytes as they are, whatever their length.
 */
#include "vipstar.h"
#include "sha3/sph_sha2.h"

void vipstar_hash(const char *input, char *output, uint32_t len)
{
    sph_sha256_context ctx;
    unsigned char first[32];

    sph_sha256_init(&ctx);
    sph_sha256(&ctx, input, len);
    sph_sha256_close(&ctx, first);

    sph_sha256_init(&ctx);
    sph_sha256(&ctx, first, 32);
    sph_sha256_close(&ctx, output);
}
