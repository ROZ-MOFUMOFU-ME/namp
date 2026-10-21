/*
 * The Keccak-P[800] reference permutation reports its intermediate state
 * through these hooks when built as a tracing tool. A pool only needs the
 * permutation, so they are no-ops here.
 */
#ifndef DISPLAY_INTERMEDIATE_VALUES_H
#define DISPLAY_INTERMEDIATE_VALUES_H

static inline void displayRoundNumber(unsigned int level, unsigned int i)
{
    (void)level;
    (void)i;
}

static inline void displayStateAsBytes(unsigned int level, const char *text,
                                       const unsigned char *bytes, unsigned int size)
{
    (void)level;
    (void)text;
    (void)bytes;
    (void)size;
}

static inline void displayStateAsLanes(unsigned int level, const char *text,
                                       void *state, unsigned int size)
{
    (void)level;
    (void)text;
    (void)state;
    (void)size;
}

#endif
