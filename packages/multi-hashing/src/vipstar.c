#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "vipstar.h"

void vipstar_hash(uint32_t *output, const uint32_t *input) {
    sha256d_181_swap(output, input);
}

static inline void sha256d_preextend(uint32_t *W)
{
	W[16] = s1(W[14]) + W[ 9] + s0(W[ 1]) + W[ 0];
	W[17] = s1(W[15]) + W[10] + s0(W[ 2]) + W[ 1];
	W[18] = s1(W[16]) + W[11]             + W[ 2];
	W[19] = s1(W[17]) + W[12] + s0(W[ 4]);
	W[20] =             W[13] + s0(W[ 5]) + W[ 4];
	W[21] =             W[14] + s0(W[ 6]) + W[ 5];
	W[22] =             W[15] + s0(W[ 7]) + W[ 6];
	W[23] =             W[16] + s0(W[ 8]) + W[ 7];
	W[24] =             W[17] + s0(W[ 9]) + W[ 8];
	W[25] =                     s0(W[10]) + W[ 9];
	W[26] =                     s0(W[11]) + W[10];
	W[27] =                     s0(W[12]) + W[11];
	W[28] =                     s0(W[13]) + W[12];
	W[29] =                     s0(W[14]) + W[13];
	W[30] =                     s0(W[15]) + W[14];
	W[31] =                     s0(W[16]) + W[15];
}

static inline void sha256d_prehash(uint32_t *S, const uint32_t *W)
{
	uint32_t t0, t1;
	RNDr(S, W, 0);
	RNDr(S, W, 1);
	RNDr(S, W, 2);
}

static inline void sha256d_181_swap(uint32_t *hash, const uint32_t *data)
{
	uint32_t S[16];
	int i;

	sha256_init(S);
	sha256_transform(S, data);
	sha256_transform(S, data + 16);
	sha256_transform(S, data + 32);
	memcpy(S + 8, sha256d_hash1 + 8, 32);
	sha256_init(hash);
	sha256_transform(hash, S);
}


static inline void sha256d_preextend2(uint32_t *W)
{
	int i;
	for (i = 16; i < 64; i += 2) {
		W[i]   = s1(W[i - 2]) + W[i - 7] + s0(W[i - 15]) + W[i - 16];
		W[i+1] = s1(W[i - 1]) + W[i - 6] + s0(W[i - 14]) + W[i - 15];
	}
}

static inline void sha256d_ms_vips(uint32_t *hash, uint32_t *W,
	const uint32_t *midstate, const uint32_t *prehash)
{
	uint32_t S[64];
	uint32_t *W2, *S2;
	uint32_t t0, t1;
	int i;

	memcpy(S + 18, W + 18, sizeof(uint32_t) * 14);

	W[18] +=                     s0(W[ 3]);
	W[19] +=                                 W[ 3];
	W[20] += s1(W[18]);
	W[21] += s1(W[19]);
	W[22] += s1(W[20]);
	W[23] += s1(W[21]);
	W[24] += s1(W[22]);
	W[25] += s1(W[23]) + W[18];
	W[26] += s1(W[24]) + W[19];
	W[27] += s1(W[25]) + W[20];
	W[28] += s1(W[26]) + W[21];
	W[29] += s1(W[27]) + W[22];
	W[30] += s1(W[28]) + W[23];
	W[31] += s1(W[29]) + W[24];

	for (i = 32; i < 64; i += 2) {
		W[i]   = s1(W[i - 2]) + W[i - 7] + s0(W[i - 15]) + W[i - 16];
		W[i+1] = s1(W[i - 1]) + W[i - 6] + s0(W[i - 14]) + W[i - 15];
	}


	memcpy(S, prehash, 32);


	RNDr(S, W,  3);
	RNDr(S, W,  4);
	RNDr(S, W,  5);
	RNDr(S, W,  6);
	RNDr(S, W,  7);
	RNDr(S, W,  8);
	RNDr(S, W,  9);
	RNDr(S, W, 10);
	RNDr(S, W, 11);
	RNDr(S, W, 12);
	RNDr(S, W, 13);
	RNDr(S, W, 14);
	RNDr(S, W, 15);
	RNDr(S, W, 16);
	RNDr(S, W, 17);
	RNDr(S, W, 18);
	RNDr(S, W, 19);
	RNDr(S, W, 20);
	RNDr(S, W, 21);
	RNDr(S, W, 22);
	RNDr(S, W, 23);
	RNDr(S, W, 24);
	RNDr(S, W, 25);
	RNDr(S, W, 26);
	RNDr(S, W, 27);
	RNDr(S, W, 28);
	RNDr(S, W, 29);
	RNDr(S, W, 30);
	RNDr(S, W, 31);
	RNDr(S, W, 32);
	RNDr(S, W, 33);
	RNDr(S, W, 34);
	RNDr(S, W, 35);
	RNDr(S, W, 36);
	RNDr(S, W, 37);
	RNDr(S, W, 38);
	RNDr(S, W, 39);
	RNDr(S, W, 40);
	RNDr(S, W, 41);
	RNDr(S, W, 42);
	RNDr(S, W, 43);
	RNDr(S, W, 44);
	RNDr(S, W, 45);
	RNDr(S, W, 46);
	RNDr(S, W, 47);
	RNDr(S, W, 48);
	RNDr(S, W, 49);
	RNDr(S, W, 50);
	RNDr(S, W, 51);
	RNDr(S, W, 52);
	RNDr(S, W, 53);
	RNDr(S, W, 54);
	RNDr(S, W, 55);
	RNDr(S, W, 56);
	RNDr(S, W, 57);
	RNDr(S, W, 58);
	RNDr(S, W, 59);
	RNDr(S, W, 60);
	RNDr(S, W, 61);
	RNDr(S, W, 62);
	RNDr(S, W, 63);

	for (i = 0; i < 8; i++)
		S[i] += midstate[i];

	W2 = W + 64;
	S2 = S + 8;
	memcpy(S2, S, 32);

	RNDr(S2, W2,  0);
	RNDr(S2, W2,  1);
	RNDr(S2, W2,  2);
	RNDr(S2, W2,  3);
	RNDr(S2, W2,  4);
	RNDr(S2, W2,  5);
	RNDr(S2, W2,  6);
	RNDr(S2, W2,  7);
	RNDr(S2, W2,  8);
	RNDr(S2, W2,  9);
	RNDr(S2, W2, 10);
	RNDr(S2, W2, 11);
	RNDr(S2, W2, 12);
	RNDr(S2, W2, 13);
	RNDr(S2, W2, 14);
	RNDr(S2, W2, 15);
	RNDr(S2, W2, 16);
	RNDr(S2, W2, 17);
	RNDr(S2, W2, 18);
	RNDr(S2, W2, 19);
	RNDr(S2, W2, 20);
	RNDr(S2, W2, 21);
	RNDr(S2, W2, 22);
	RNDr(S2, W2, 23);
	RNDr(S2, W2, 24);
	RNDr(S2, W2, 25);
	RNDr(S2, W2, 26);
	RNDr(S2, W2, 27);
	RNDr(S2, W2, 28);
	RNDr(S2, W2, 29);
	RNDr(S2, W2, 30);
	RNDr(S2, W2, 31);
	RNDr(S2, W2, 32);
	RNDr(S2, W2, 33);
	RNDr(S2, W2, 34);
	RNDr(S2, W2, 35);
	RNDr(S2, W2, 36);
	RNDr(S2, W2, 37);
	RNDr(S2, W2, 38);
	RNDr(S2, W2, 39);
	RNDr(S2, W2, 40);
	RNDr(S2, W2, 41);
	RNDr(S2, W2, 42);
	RNDr(S2, W2, 43);
	RNDr(S2, W2, 44);
	RNDr(S2, W2, 45);
	RNDr(S2, W2, 46);
	RNDr(S2, W2, 47);
	RNDr(S2, W2, 48);
	RNDr(S2, W2, 49);
	RNDr(S2, W2, 50);
	RNDr(S2, W2, 51);
	RNDr(S2, W2, 52);
	RNDr(S2, W2, 53);
	RNDr(S2, W2, 54);
	RNDr(S2, W2, 55);
	RNDr(S2, W2, 56);
	RNDr(S2, W2, 57);
	RNDr(S2, W2, 58);
	RNDr(S2, W2, 59);
	RNDr(S2, W2, 60);
	RNDr(S2, W2, 61);
	RNDr(S2, W2, 62);
	RNDr(S2, W2, 63);

	for (i = 0; i < 8; i++)
		S[i] += S2[i];


	memcpy(W + 18, S + 18, sizeof(uint32_t) * 14);


	//second
	memcpy(S + 8, sha256d_hash1 + 8, 32);
	S[16] =                     s0(S[ 1]) + S[ 0];
	S[17] = s1(0x00000100u)   + s0(S[ 2]) + S[ 1];
	S[18] = s1(S[16])         + s0(S[ 3]) + S[ 2];
	S[19] = s1(S[17])         + s0(S[ 4]) + S[ 3];
	S[20] = s1(S[18])         + s0(S[ 5]) + S[ 4];
	S[21] = s1(S[19])         + s0(S[ 6]) + S[ 5];
	S[22] = s1(S[20]) + 0x00000100u + s0(S[ 7]) + S[ 6];
	S[23] = s1(S[21]) + S[16] + s0(0x80000000u) + S[ 7];
	S[24] = s1(S[22]) + S[17]             + 0x80000000u;
	S[25] = s1(S[23]) + S[18];
	S[26] = s1(S[24]) + S[19];
	S[27] = s1(S[25]) + S[20];
	S[28] = s1(S[26]) + S[21];
	S[29] = s1(S[27]) + S[22];
	S[30] = s1(S[28]) + S[23] + s0(0x00000100u);
	S[31] = s1(S[29]) + S[24] + s0(S[16]) + 0x00000100u;
	for (i = 32; i < 60; i += 2) {
		S[i]   = s1(S[i - 2]) + S[i - 7] + s0(S[i - 15]) + S[i - 16];
		S[i+1] = s1(S[i - 1]) + S[i - 6] + s0(S[i - 14]) + S[i - 15];
	}
	S[60] = s1(S[58]) + S[53] + s0(S[45]) + S[44];

	sha256_init(hash);

	RNDr(hash, S,  0);
	RNDr(hash, S,  1);
	RNDr(hash, S,  2);
	RNDr(hash, S,  3);
	RNDr(hash, S,  4);
	RNDr(hash, S,  5);
	RNDr(hash, S,  6);
	RNDr(hash, S,  7);
	RNDr(hash, S,  8);
	RNDr(hash, S,  9);
	RNDr(hash, S, 10);
	RNDr(hash, S, 11);
	RNDr(hash, S, 12);
	RNDr(hash, S, 13);
	RNDr(hash, S, 14);
	RNDr(hash, S, 15);
	RNDr(hash, S, 16);
	RNDr(hash, S, 17);
	RNDr(hash, S, 18);
	RNDr(hash, S, 19);
	RNDr(hash, S, 20);
	RNDr(hash, S, 21);
	RNDr(hash, S, 22);
	RNDr(hash, S, 23);
	RNDr(hash, S, 24);
	RNDr(hash, S, 25);
	RNDr(hash, S, 26);
	RNDr(hash, S, 27);
	RNDr(hash, S, 28);
	RNDr(hash, S, 29);
	RNDr(hash, S, 30);
	RNDr(hash, S, 31);
	RNDr(hash, S, 32);
	RNDr(hash, S, 33);
	RNDr(hash, S, 34);
	RNDr(hash, S, 35);
	RNDr(hash, S, 36);
	RNDr(hash, S, 37);
	RNDr(hash, S, 38);
	RNDr(hash, S, 39);
	RNDr(hash, S, 40);
	RNDr(hash, S, 41);
	RNDr(hash, S, 42);
	RNDr(hash, S, 43);
	RNDr(hash, S, 44);
	RNDr(hash, S, 45);
	RNDr(hash, S, 46);
	RNDr(hash, S, 47);
	RNDr(hash, S, 48);
	RNDr(hash, S, 49);
	RNDr(hash, S, 50);
	RNDr(hash, S, 51);
	RNDr(hash, S, 52);
	RNDr(hash, S, 53);
	RNDr(hash, S, 54);
	RNDr(hash, S, 55);
	RNDr(hash, S, 56);

	hash[2] += hash[6] + S1(hash[3]) + Ch(hash[3], hash[4], hash[5]) + S[57] + sha256_k[57];
	hash[1] += hash[5] + S1(hash[2]) + Ch(hash[2], hash[3], hash[4]) + S[58] + sha256_k[58];
	hash[0] += hash[4] + S1(hash[1]) + Ch(hash[1], hash[2], hash[3]) + S[59] + sha256_k[59];
	hash[7] += hash[3] + S1(hash[0]) + Ch(hash[0], hash[1], hash[2]) + S[60] + sha256_k[60] + sha256_h[7];
}
