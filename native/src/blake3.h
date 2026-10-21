#ifndef BLAKE3_HASH_H
#define BLAKE3_HASH_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void blake3_hash(const char *input, char *output, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif
