#ifndef X16S_H
#define X16S_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void x16s_hash(const char* input, char* output, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif
