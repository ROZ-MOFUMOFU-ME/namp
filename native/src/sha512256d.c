/*
 * Double SHA-512/256 (Radiant). SHA-512/256 is SHA-512 run from its own
 * initial values (FIPS 180-4, 5.3.6.2) and truncated to 256 bits, so the
 * sphlib SHA-512 core does the work once its state is reseeded.
 */
#include <string.h>

#include "sha512256d.h"
#include "sha3/sph_sha2.h"

static const sph_u64 SHA512_256_IV[8] = {
    SPH_C64(0x22312194FC2BF72C), SPH_C64(0x9F555FA3C84C64C2),
    SPH_C64(0x2393B86B6F53B151), SPH_C64(0x963877195940EABD),
    SPH_C64(0x96283EE2A88EFFE3), SPH_C64(0xBE5E1E2553863992),
    SPH_C64(0x2B0199FC2C85B8AA), SPH_C64(0x0EB72DDC81C52CA2)
};

static void sha512_256(const void *data, size_t len, unsigned char out[32])
{
    sph_sha512_context ctx;
    unsigned char full[64];

    sph_sha512_init(&ctx);
    memcpy(ctx.val, SHA512_256_IV, sizeof(SHA512_256_IV));
    sph_sha512(&ctx, data, len);
    sph_sha512_close(&ctx, full);
    memcpy(out, full, 32);
}

void sha512256d_hash(const char *input, char *output, uint32_t len)
{
    unsigned char first[32];

    sha512_256(input, len, first);
    sha512_256(first, 32, (unsigned char *)output);
}
