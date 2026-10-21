/*
 * BLAKE2b with a 256-bit digest (unkeyed), the form Sia-style chains hash
 * their headers with. The core is the Argon2 tree's BLAKE2b, which already
 * takes the digest length as a parameter.
 */
#include "blake2b.h"
#include "argon2/blake2/blake2.h"

void blake2b_hash(const char *input, char *output, uint32_t len)
{
    blake2b(output, 32, input, len, NULL, 0);
}
