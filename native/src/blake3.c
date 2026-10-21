/* BLAKE3, 256-bit output: the official C implementation under blake3/. */
#include "blake3.h"
#include "blake3/blake3.h"

void blake3_hash(const char *input, char *output, uint32_t len)
{
    blake3_hasher hasher;
    blake3_hasher_init(&hasher);
    blake3_hasher_update(&hasher, input, len);
    blake3_hasher_finalize(&hasher, (uint8_t *)output, BLAKE3_OUT_LEN);
}
