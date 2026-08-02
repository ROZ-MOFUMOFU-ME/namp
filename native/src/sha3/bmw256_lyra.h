#ifndef BMW256_LYRA_H
#define BMW256_LYRA_H
#ifdef __cplusplus
extern "C" {
#endif
/* BMW-256 (SHA-3 reference finalization) over a 32-byte input, as used by
   the Lyra2REv2 chain in monacoin. in: 32 bytes, out: 32 bytes. */
void bmw256_lyra(const unsigned char *in, unsigned char *out);
#ifdef __cplusplus
}
#endif
#endif
