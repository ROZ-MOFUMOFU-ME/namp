#ifndef VIPSTAR_H
#define VIPSTAR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void vipstar_hash(const char *input, char *output, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif
