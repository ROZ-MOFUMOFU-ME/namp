#include "blake2s.h"
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>

#include "sha3/sph_blake2s.h"

void blake2s_hash(const char* input, char* output, uint32_t len)
{
    blake2s_state ctx_blake2s;
    blake2s_init(&ctx_blake2s, BLAKE2S_OUTBYTES);
    blake2s_update(&ctx_blake2s, (const uint8_t *)input, len);
    blake2s_final(&ctx_blake2s, (uint8_t *)output, BLAKE2S_OUTBYTES);
}
