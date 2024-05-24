#ifndef SCRYPT_H
#define SCRYPT_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

void m7_hash(const char* input, char* output, uint32_t len);
void m7m_hash(const char* input, char* output, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif
