/*
 * Byte-order detection for the Keccak-P[800] reference permutation, in the
 * shape its upstream expects (Brian Gladman's brg_endian.h): the file is not
 * part of this tree, so this is the few lines of it that are actually used.
 */
#ifndef BRG_ENDIAN_H
#define BRG_ENDIAN_H

#define IS_BIG_ENDIAN 4321
#define IS_LITTLE_ENDIAN 1234

#if defined(__BYTE_ORDER__) && defined(__ORDER_BIG_ENDIAN__) && \
    (__BYTE_ORDER__ == __ORDER_BIG_ENDIAN__)
#define PLATFORM_BYTE_ORDER IS_BIG_ENDIAN
#else
#define PLATFORM_BYTE_ORDER IS_LITTLE_ENDIAN
#endif

#endif
