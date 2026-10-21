/*
 * GOST R 34.11-2012 (Streebog) 512-bit over the input; the export carries
 * the first 32 bytes. The digest is 64 bytes, and this used to be written
 * straight into the 32-byte output — an overflow Ubuntu's stack protector
 * reports as "stack smashing detected" and Debian's compiler let through.
 */
#include "gost.h"
#include <string.h>
#include "sha3/sph_gost.h"

void gost_hash(const char* input, char* output, uint32_t len)
{
    sph_gost512_context ctx_gost;
    unsigned char digest[64];

    sph_gost512_init(&ctx_gost);
    sph_gost512(&ctx_gost, input, len);
    sph_gost512_close(&ctx_gost, digest);
    memcpy(output, digest, 32);
}
