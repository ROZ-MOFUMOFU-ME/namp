#ifndef SHA512256D_H
#define SHA512256D_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void sha512256d_hash(const char *input, char *output, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif
