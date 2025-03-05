#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <inttypes.h>
#include "../sha3/sph_sha2.h"
#include "vipstar.h"

#if defined(__SSE2__) && defined(USE_ASM)
static inline void sha256_init_128(__m128i *state)
{
	for (size_t i = 0; i < 8; i++)
		state[i] = sha256_h_128[i];
}
#endif /* __SSE2__ */

#if defined(__AVX2__) && defined(USE_ASM)
static inline void sha256_init_256(__m256i *state)
{
	for (size_t i = 0; i < 8; i++)
		state[i] = sha256_h_256[i];
}
#endif /* __SSE2__ */

static inline uint32_t swab32(uint32_t x)
{
	return ((x & 0x000000FF) << 24) |
		   ((x & 0x0000FF00) << 8) |
		   ((x & 0x00FF0000) >> 8) |
		   ((x & 0xFF000000) >> 24);
}

static inline void sha256d_preextend(uint32_t *W)
{
	W[16] = s1(W[14]) + W[9] + s0(W[1]) + W[0];
	W[17] = s1(W[15]) + W[10] + s0(W[2]) + W[1];
	W[18] = s1(W[16]) + W[11] + W[2];
	W[19] = s1(W[17]) + W[12] + s0(W[4]);
	W[20] = W[13] + s0(W[5]) + W[4];
	W[21] = W[14] + s0(W[6]) + W[5];
	W[22] = W[15] + s0(W[7]) + W[6];
	W[23] = W[16] + s0(W[8]) + W[7];
	W[24] = W[17] + s0(W[9]) + W[8];
	W[25] = s0(W[10]) + W[9];
	W[26] = s0(W[11]) + W[10];
	W[27] = s0(W[12]) + W[11];
	W[28] = s0(W[13]) + W[12];
	W[29] = s0(W[14]) + W[13];
	W[30] = s0(W[15]) + W[14];
	W[31] = s0(W[16]) + W[15];
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
	sha256_transform(S, data, 0);
	sha256_transform(S, data + 16, 0);
	sha256_transform(S, data + 32, 0);
	memcpy(S + 8, sha256d_hash1 + 8, 32);
	sha256_init(hash);
	sha256_transform(hash, S, 0);
	for (i = 0; i < 8; i++)
		hash[i] = swab32(hash[i]);
}

static inline void sha256d_preextend2(uint32_t *W)
{
	int i;
	for (i = 16; i < 64; i += 2)
	{
		W[i] = s1(W[i - 2]) + W[i - 7] + s0(W[i - 15]) + W[i - 16];
		W[i + 1] = s1(W[i - 1]) + W[i - 6] + s0(W[i - 14]) + W[i - 15];
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

	W[18] += s0(W[3]);
	W[19] += W[3];
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

	for (i = 32; i < 64; i += 2)
	{
		W[i] = s1(W[i - 2]) + W[i - 7] + s0(W[i - 15]) + W[i - 16];
		W[i + 1] = s1(W[i - 1]) + W[i - 6] + s0(W[i - 14]) + W[i - 15];
	}

	memcpy(S, prehash, 32);

	RNDr(S, W, 3);
	RNDr(S, W, 4);
	RNDr(S, W, 5);
	RNDr(S, W, 6);
	RNDr(S, W, 7);
	RNDr(S, W, 8);
	RNDr(S, W, 9);
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

	RNDr(S2, W2, 0);
	RNDr(S2, W2, 1);
	RNDr(S2, W2, 2);
	RNDr(S2, W2, 3);
	RNDr(S2, W2, 4);
	RNDr(S2, W2, 5);
	RNDr(S2, W2, 6);
	RNDr(S2, W2, 7);
	RNDr(S2, W2, 8);
	RNDr(S2, W2, 9);
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

	// second
	memcpy(S + 8, sha256d_hash1 + 8, 32);
	S[16] = s0(S[1]) + S[0];
	S[17] = s1(0x00000100u) + s0(S[2]) + S[1];
	S[18] = s1(S[16]) + s0(S[3]) + S[2];
	S[19] = s1(S[17]) + s0(S[4]) + S[3];
	S[20] = s1(S[18]) + s0(S[5]) + S[4];
	S[21] = s1(S[19]) + s0(S[6]) + S[5];
	S[22] = s1(S[20]) + 0x00000100u + s0(S[7]) + S[6];
	S[23] = s1(S[21]) + S[16] + s0(0x80000000u) + S[7];
	S[24] = s1(S[22]) + S[17] + 0x80000000u;
	S[25] = s1(S[23]) + S[18];
	S[26] = s1(S[24]) + S[19];
	S[27] = s1(S[25]) + S[20];
	S[28] = s1(S[26]) + S[21];
	S[29] = s1(S[27]) + S[22];
	S[30] = s1(S[28]) + S[23] + s0(0x00000100u);
	S[31] = s1(S[29]) + S[24] + s0(S[16]) + 0x00000100u;
	for (i = 32; i < 60; i += 2)
	{
		S[i] = s1(S[i - 2]) + S[i - 7] + s0(S[i - 15]) + S[i - 16];
		S[i + 1] = s1(S[i - 1]) + S[i - 6] + s0(S[i - 14]) + S[i - 15];
	}
	S[60] = s1(S[58]) + S[53] + s0(S[45]) + S[44];

	sha256_init(hash);

	RNDr(hash, S, 0);
	RNDr(hash, S, 1);
	RNDr(hash, S, 2);
	RNDr(hash, S, 3);
	RNDr(hash, S, 4);
	RNDr(hash, S, 5);
	RNDr(hash, S, 6);
	RNDr(hash, S, 7);
	RNDr(hash, S, 8);
	RNDr(hash, S, 9);
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

#if defined(__SSE2__) && defined(USE_ASM)
static inline int scanhash_sha256d_vips_4way(int thr_id, struct work *work, uint32_t max_nonce, uint64_t *hashes_done)
{
	uint32_t _ALIGN(32) data[4 * 128];
	uint32_t _ALIGN(32) hash[4 * 8];
	uint32_t _ALIGN(32) midstate[4 * 8];
	uint32_t _ALIGN(32) prehash[4 * 8];
	uint32_t *pdata = work->data;
	uint32_t *ptarget = work->target;
	uint32_t n = pdata[19] - 1;
	const uint32_t first_nonce = pdata[19];
	const uint32_t Htarg = ptarget[7];
	int i, j;

	memcpy(data, pdata + 16, 64);
	sha256d_preextend(data);
	for (i = 31; i >= 0; i--)
		for (j = 0; j < 4; j++)
			data[i * 4 + j] = data[i];

	const size_t offset = 64 * 4;
	memcpy(data + offset, pdata + 32, 64);
	sha256d_preextend2(data + offset);
	for (i = 63; i >= 0; i--)
		for (j = 0; j < 4; j++)
			data[i * 4 + j + offset] = data[i + offset];

	sha256_init(midstate);
	sha256_transform(midstate, pdata, 0);
	memcpy(prehash, midstate, 32);
	sha256d_prehash(prehash, pdata + 16);
	for (i = 7; i >= 0; i--)
	{
		for (j = 0; j < 4; j++)
		{
			midstate[i * 4 + j] = midstate[i];
			prehash[i * 4 + j] = prehash[i];
		}
	}

	do
	{
		for (i = 0; i < 4; i++)
			data[4 * 3 + i] = ++n;

		sha256d_vips_ms_4way((__m128i *)hash, (__m128i *)data, (__m128i *)midstate, (__m128i *)prehash);

		for (i = 0; i < 4; i++)
		{
			if (unlikely(swab32(hash[4 * 7 + i]) <= Htarg))
			{
				pdata[19] = data[4 * 3 + i];
				sha256d_181_swap(hash, pdata);
				if (fulltest(hash, ptarget))
				{
					work_set_target_ratio(work, hash);
					*hashes_done = n - first_nonce + 1;
					return 1;
				}
			}
		}
	} while (n < max_nonce && !work_restart[thr_id].restart);

	*hashes_done = n - first_nonce + 1;
	pdata[19] = n;
	return 0;
}

static inline void sha256d_vips_ms_4way(__m128i *hash, __m128i *W,
										const __m128i *midstate, const __m128i *prehash)
{
	__m128i S[64];
	__m128i *W2, *S2;
	__m128i t0, t1;
	int i;

	memcpy(S + 18, W + 18, sizeof(uint32_t) * 4 * 14);

	W[18] = _mm_add_epi32(W[18], s0_128(W[3]));
	W[19] = _mm_add_epi32(W[19], W[3]);
	W[20] = _mm_add_epi32(W[20], s1_128(W[18]));
	W[21] = _mm_add_epi32(W[21], s1_128(W[19]));
	W[22] = _mm_add_epi32(W[22], s1_128(W[20]));
	W[23] = _mm_add_epi32(W[23], s1_128(W[21]));
	W[24] = _mm_add_epi32(W[24], s1_128(W[22]));
	W[25] = _mm_add_epi32(_mm_add_epi32(W[25], s1_128(W[23])), W[18]);
	W[26] = _mm_add_epi32(_mm_add_epi32(W[26], s1_128(W[24])), W[19]);
	W[27] = _mm_add_epi32(_mm_add_epi32(W[27], s1_128(W[25])), W[20]);
	W[28] = _mm_add_epi32(_mm_add_epi32(W[28], s1_128(W[26])), W[21]);
	W[29] = _mm_add_epi32(_mm_add_epi32(W[29], s1_128(W[27])), W[22]);
	W[30] = _mm_add_epi32(_mm_add_epi32(W[30], s1_128(W[28])), W[23]);
	W[31] = _mm_add_epi32(_mm_add_epi32(W[31], s1_128(W[29])), W[24]);

	for (i = 32; i < 64; i += 2)
	{
		W[i] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(W[i - 2]), W[i - 7]), s0_128(W[i - 15])), W[i - 16]);
		W[i + 1] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(W[i - 1]), W[i - 6]), s0_128(W[i - 14])), W[i - 15]);
	}

	memcpy(S, prehash, sizeof(uint32_t) * 4 * 8);

	RNDr_128(S, W, 3);
	RNDr_128(S, W, 4);
	RNDr_128(S, W, 5);
	RNDr_128(S, W, 6);
	RNDr_128(S, W, 7);
	RNDr_128(S, W, 8);
	RNDr_128(S, W, 9);
	RNDr_128(S, W, 10);
	RNDr_128(S, W, 11);
	RNDr_128(S, W, 12);
	RNDr_128(S, W, 13);
	RNDr_128(S, W, 14);
	RNDr_128(S, W, 15);
	RNDr_128(S, W, 16);
	RNDr_128(S, W, 17);
	RNDr_128(S, W, 18);
	RNDr_128(S, W, 19);
	RNDr_128(S, W, 20);
	RNDr_128(S, W, 21);
	RNDr_128(S, W, 22);
	RNDr_128(S, W, 23);
	RNDr_128(S, W, 24);
	RNDr_128(S, W, 25);
	RNDr_128(S, W, 26);
	RNDr_128(S, W, 27);
	RNDr_128(S, W, 28);
	RNDr_128(S, W, 29);
	RNDr_128(S, W, 30);
	RNDr_128(S, W, 31);
	RNDr_128(S, W, 32);
	RNDr_128(S, W, 33);
	RNDr_128(S, W, 34);
	RNDr_128(S, W, 35);
	RNDr_128(S, W, 36);
	RNDr_128(S, W, 37);
	RNDr_128(S, W, 38);
	RNDr_128(S, W, 39);
	RNDr_128(S, W, 40);
	RNDr_128(S, W, 41);
	RNDr_128(S, W, 42);
	RNDr_128(S, W, 43);
	RNDr_128(S, W, 44);
	RNDr_128(S, W, 45);
	RNDr_128(S, W, 46);
	RNDr_128(S, W, 47);
	RNDr_128(S, W, 48);
	RNDr_128(S, W, 49);
	RNDr_128(S, W, 50);
	RNDr_128(S, W, 51);
	RNDr_128(S, W, 52);
	RNDr_128(S, W, 53);
	RNDr_128(S, W, 54);
	RNDr_128(S, W, 55);
	RNDr_128(S, W, 56);
	RNDr_128(S, W, 57);
	RNDr_128(S, W, 58);
	RNDr_128(S, W, 59);
	RNDr_128(S, W, 60);
	RNDr_128(S, W, 61);
	RNDr_128(S, W, 62);
	RNDr_128(S, W, 63);

	for (i = 0; i < 8; i++)
		S[i] = _mm_add_epi32(S[i], midstate[i]);

	W2 = W + 64;
	S2 = S + 8;

	memcpy(S2, S, sizeof(uint32_t) * 4 * 8);

	RNDr_128(S2, W2, 0);
	RNDr_128(S2, W2, 1);
	RNDr_128(S2, W2, 2);
	RNDr_128(S2, W2, 3);
	RNDr_128(S2, W2, 4);
	RNDr_128(S2, W2, 5);
	RNDr_128(S2, W2, 6);
	RNDr_128(S2, W2, 7);
	RNDr_128(S2, W2, 8);
	RNDr_128(S2, W2, 9);
	RNDr_128(S2, W2, 10);
	RNDr_128(S2, W2, 11);
	RNDr_128(S2, W2, 12);
	RNDr_128(S2, W2, 13);
	RNDr_128(S2, W2, 14);
	RNDr_128(S2, W2, 15);
	RNDr_128(S2, W2, 16);
	RNDr_128(S2, W2, 17);
	RNDr_128(S2, W2, 18);
	RNDr_128(S2, W2, 19);
	RNDr_128(S2, W2, 20);
	RNDr_128(S2, W2, 21);
	RNDr_128(S2, W2, 22);
	RNDr_128(S2, W2, 23);
	RNDr_128(S2, W2, 24);
	RNDr_128(S2, W2, 25);
	RNDr_128(S2, W2, 26);
	RNDr_128(S2, W2, 27);
	RNDr_128(S2, W2, 28);
	RNDr_128(S2, W2, 29);
	RNDr_128(S2, W2, 30);
	RNDr_128(S2, W2, 31);
	RNDr_128(S2, W2, 32);
	RNDr_128(S2, W2, 33);
	RNDr_128(S2, W2, 34);
	RNDr_128(S2, W2, 35);
	RNDr_128(S2, W2, 36);
	RNDr_128(S2, W2, 37);
	RNDr_128(S2, W2, 38);
	RNDr_128(S2, W2, 39);
	RNDr_128(S2, W2, 40);
	RNDr_128(S2, W2, 41);
	RNDr_128(S2, W2, 42);
	RNDr_128(S2, W2, 43);
	RNDr_128(S2, W2, 44);
	RNDr_128(S2, W2, 45);
	RNDr_128(S2, W2, 46);
	RNDr_128(S2, W2, 47);
	RNDr_128(S2, W2, 48);
	RNDr_128(S2, W2, 49);
	RNDr_128(S2, W2, 50);
	RNDr_128(S2, W2, 51);
	RNDr_128(S2, W2, 52);
	RNDr_128(S2, W2, 53);
	RNDr_128(S2, W2, 54);
	RNDr_128(S2, W2, 55);
	RNDr_128(S2, W2, 56);
	RNDr_128(S2, W2, 57);
	RNDr_128(S2, W2, 58);
	RNDr_128(S2, W2, 59);
	RNDr_128(S2, W2, 60);
	RNDr_128(S2, W2, 61);
	RNDr_128(S2, W2, 62);
	RNDr_128(S2, W2, 63);

	for (i = 0; i < 8; i++)
		S[i] = _mm_add_epi32(S[i], S2[i]);

	memcpy(W + 18, S + 18, sizeof(uint32_t) * 4 * 14);

	// second
	memcpy(S + 8, sha256d_hash1_128 + 8, sizeof(uint32_t) * 4 * 8);

	S[16] = _mm_add_epi32(s0_128(S[1]), S[0]);
	S[17] = _mm_add_epi32(_mm_add_epi32(s1_128(sha256d_hash1_128[15]), s0_128(S[2])), S[1]);
	S[18] = _mm_add_epi32(_mm_add_epi32(s1_128(S[16]), s0_128(S[3])), S[2]);
	S[19] = _mm_add_epi32(_mm_add_epi32(s1_128(S[17]), s0_128(S[4])), S[3]);
	S[20] = _mm_add_epi32(_mm_add_epi32(s1_128(S[18]), s0_128(S[5])), S[4]);
	S[21] = _mm_add_epi32(_mm_add_epi32(s1_128(S[19]), s0_128(S[6])), S[5]);
	S[22] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[20]), sha256d_hash1_128[15]), s0_128(S[7])), S[6]);
	S[23] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[21]), S[16]), s0_128(sha256d_hash1_128[8])), S[7]);
	S[24] = _mm_add_epi32(_mm_add_epi32(s1_128(S[22]), S[17]), sha256d_hash1_128[8]);
	S[25] = _mm_add_epi32(s1_128(S[23]), S[18]);
	S[26] = _mm_add_epi32(s1_128(S[24]), S[19]);
	S[27] = _mm_add_epi32(s1_128(S[25]), S[20]);
	S[28] = _mm_add_epi32(s1_128(S[26]), S[21]);
	S[29] = _mm_add_epi32(s1_128(S[27]), S[22]);
	S[30] = _mm_add_epi32(_mm_add_epi32(s1_128(S[28]), S[23]), s0_128(sha256d_hash1_128[15]));
	S[31] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[29]), S[24]), s0_128(S[16])), sha256d_hash1_128[15]);
	for (i = 32; i < 60; i += 2)
	{
		S[i] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[i - 2]), S[i - 7]), s0_128(S[i - 15])), S[i - 16]);
		S[i + 1] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[i - 1]), S[i - 6]), s0_128(S[i - 14])), S[i - 15]);
	}
	S[60] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(s1_128(S[58]), S[53]), s0_128(S[45])), S[44]);

	sha256_init_128(hash);

	RNDr_128(hash, S, 0);
	RNDr_128(hash, S, 1);
	RNDr_128(hash, S, 2);
	RNDr_128(hash, S, 3);
	RNDr_128(hash, S, 4);
	RNDr_128(hash, S, 5);
	RNDr_128(hash, S, 6);
	RNDr_128(hash, S, 7);
	RNDr_128(hash, S, 8);
	RNDr_128(hash, S, 9);
	RNDr_128(hash, S, 10);
	RNDr_128(hash, S, 11);
	RNDr_128(hash, S, 12);
	RNDr_128(hash, S, 13);
	RNDr_128(hash, S, 14);
	RNDr_128(hash, S, 15);
	RNDr_128(hash, S, 16);
	RNDr_128(hash, S, 17);
	RNDr_128(hash, S, 18);
	RNDr_128(hash, S, 19);
	RNDr_128(hash, S, 20);
	RNDr_128(hash, S, 21);
	RNDr_128(hash, S, 22);
	RNDr_128(hash, S, 23);
	RNDr_128(hash, S, 24);
	RNDr_128(hash, S, 25);
	RNDr_128(hash, S, 26);
	RNDr_128(hash, S, 27);
	RNDr_128(hash, S, 28);
	RNDr_128(hash, S, 29);
	RNDr_128(hash, S, 30);
	RNDr_128(hash, S, 31);
	RNDr_128(hash, S, 32);
	RNDr_128(hash, S, 33);
	RNDr_128(hash, S, 34);
	RNDr_128(hash, S, 35);
	RNDr_128(hash, S, 36);
	RNDr_128(hash, S, 37);
	RNDr_128(hash, S, 38);
	RNDr_128(hash, S, 39);
	RNDr_128(hash, S, 40);
	RNDr_128(hash, S, 41);
	RNDr_128(hash, S, 42);
	RNDr_128(hash, S, 43);
	RNDr_128(hash, S, 44);
	RNDr_128(hash, S, 45);
	RNDr_128(hash, S, 46);
	RNDr_128(hash, S, 47);
	RNDr_128(hash, S, 48);
	RNDr_128(hash, S, 49);
	RNDr_128(hash, S, 50);
	RNDr_128(hash, S, 51);
	RNDr_128(hash, S, 52);
	RNDr_128(hash, S, 53);
	RNDr_128(hash, S, 54);
	RNDr_128(hash, S, 55);
	RNDr_128(hash, S, 56);

	hash[2] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(hash[2], hash[6]), S1_128(hash[3])), Ch_128(hash[3], hash[4], hash[5])), S[57]), sha256_k_128[57]);
	hash[1] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(hash[1], hash[5]), S1_128(hash[2])), Ch_128(hash[2], hash[3], hash[4])), S[58]), sha256_k_128[58]);
	hash[0] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(hash[0], hash[4]), S1_128(hash[1])), Ch_128(hash[1], hash[2], hash[3])), S[59]), sha256_k_128[59]);
	hash[7] = _mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(_mm_add_epi32(hash[7], hash[3]), S1_128(hash[0])), Ch_128(hash[0], hash[1], hash[2])), S[60]), sha256_k_128[60]), sha256_h_128[7]);
}
#endif /* __SSE2__ */

#if defined(__AVX2__) && defined(USE_ASM)
static inline int scanhash_sha256d_vips_8way(int thr_id, struct work *work, uint32_t max_nonce, uint64_t *hashes_done)
{
	uint32_t _ALIGN(32) data[8 * 128];
	uint32_t _ALIGN(32) hash[8 * 8];
	uint32_t _ALIGN(32) midstate[8 * 8];
	uint32_t _ALIGN(32) prehash[8 * 8];
	uint32_t *pdata = work->data;
	uint32_t *ptarget = work->target;
	uint32_t n = pdata[19] - 1;
	const uint32_t first_nonce = pdata[19];
	const uint32_t Htarg = ptarget[7];
	int i, j;

	memcpy(data, pdata + 16, 64);
	sha256d_preextend(data);
	for (i = 31; i >= 0; i--)
		for (j = 0; j < 8; j++)
			data[i * 8 + j] = data[i];

	const size_t offset = 64 * 8;
	memcpy(data + offset, pdata + 32, 64);
	sha256d_preextend2(data + offset);
	for (i = 63; i >= 0; i--)
		for (j = 0; j < 8; j++)
			data[i * 8 + j + offset] = data[i + offset];

	sha256_init(midstate);
	sha256_transform(midstate, pdata, 0);
	memcpy(prehash, midstate, 32);
	sha256d_prehash(prehash, pdata + 16);
	for (i = 7; i >= 0; i--)
	{
		for (j = 0; j < 8; j++)
		{
			midstate[i * 8 + j] = midstate[i];
			prehash[i * 8 + j] = prehash[i];
		}
	}

	do
	{
		for (i = 0; i < 8; i++)
			data[8 * 3 + i] = ++n;

		sha256d_vips_ms_8way((__m256i *)hash, (__m256i *)data, (__m256i *)midstate, (__m256i *)prehash);

		for (i = 0; i < 8; i++)
		{
			if (unlikely(swab32(hash[8 * 7 + i]) <= Htarg))
			{
				pdata[19] = data[8 * 3 + i];
				sha256d_181_swap(hash, pdata);
				if (fulltest(hash, ptarget))
				{
					work_set_target_ratio(work, hash);
					*hashes_done = n - first_nonce + 1;
					return 1;
				}
			}
		}
	} while (n < max_nonce && !work_restart[thr_id].restart);

	*hashes_done = n - first_nonce + 1;
	pdata[19] = n;
	return 0;
}

static inline void sha256d_vips_ms_8way(__m256i *hash, __m256i *W,
										const __m256i *midstate, const __m256i *prehash)
{
	__m256i S[64];
	__m256i *W2, *S2;
	__m256i t0, t1;
	int i;

	memcpy(S + 18, W + 18, sizeof(uint32_t) * 8 * 14);

	W[18] = _mm256_add_epi32(W[18], s0_256(W[3]));
	W[19] = _mm256_add_epi32(W[19], W[3]);
	W[20] = _mm256_add_epi32(W[20], s1_256(W[18]));
	W[21] = _mm256_add_epi32(W[21], s1_256(W[19]));
	W[22] = _mm256_add_epi32(W[22], s1_256(W[20]));
	W[23] = _mm256_add_epi32(W[23], s1_256(W[21]));
	W[24] = _mm256_add_epi32(W[24], s1_256(W[22]));
	W[25] = _mm256_add_epi32(_mm256_add_epi32(W[25], s1_256(W[23])), W[18]);
	W[26] = _mm256_add_epi32(_mm256_add_epi32(W[26], s1_256(W[24])), W[19]);
	W[27] = _mm256_add_epi32(_mm256_add_epi32(W[27], s1_256(W[25])), W[20]);
	W[28] = _mm256_add_epi32(_mm256_add_epi32(W[28], s1_256(W[26])), W[21]);
	W[29] = _mm256_add_epi32(_mm256_add_epi32(W[29], s1_256(W[27])), W[22]);
	W[30] = _mm256_add_epi32(_mm256_add_epi32(W[30], s1_256(W[28])), W[23]);
	W[31] = _mm256_add_epi32(_mm256_add_epi32(W[31], s1_256(W[29])), W[24]);

	for (i = 32; i < 64; i += 2)
	{
		W[i] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(W[i - 2]), W[i - 7]), s0_256(W[i - 15])), W[i - 16]);
		W[i + 1] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(W[i - 1]), W[i - 6]), s0_256(W[i - 14])), W[i - 15]);
	}

	memcpy(S, prehash, sizeof(uint32_t) * 8 * 8);

	RNDr_256(S, W, 3);
	RNDr_256(S, W, 4);
	RNDr_256(S, W, 5);
	RNDr_256(S, W, 6);
	RNDr_256(S, W, 7);
	RNDr_256(S, W, 8);
	RNDr_256(S, W, 9);
	RNDr_256(S, W, 10);
	RNDr_256(S, W, 11);
	RNDr_256(S, W, 12);
	RNDr_256(S, W, 13);
	RNDr_256(S, W, 14);
	RNDr_256(S, W, 15);
	RNDr_256(S, W, 16);
	RNDr_256(S, W, 17);
	RNDr_256(S, W, 18);
	RNDr_256(S, W, 19);
	RNDr_256(S, W, 20);
	RNDr_256(S, W, 21);
	RNDr_256(S, W, 22);
	RNDr_256(S, W, 23);
	RNDr_256(S, W, 24);
	RNDr_256(S, W, 25);
	RNDr_256(S, W, 26);
	RNDr_256(S, W, 27);
	RNDr_256(S, W, 28);
	RNDr_256(S, W, 29);
	RNDr_256(S, W, 30);
	RNDr_256(S, W, 31);
	RNDr_256(S, W, 32);
	RNDr_256(S, W, 33);
	RNDr_256(S, W, 34);
	RNDr_256(S, W, 35);
	RNDr_256(S, W, 36);
	RNDr_256(S, W, 37);
	RNDr_256(S, W, 38);
	RNDr_256(S, W, 39);
	RNDr_256(S, W, 40);
	RNDr_256(S, W, 41);
	RNDr_256(S, W, 42);
	RNDr_256(S, W, 43);
	RNDr_256(S, W, 44);
	RNDr_256(S, W, 45);
	RNDr_256(S, W, 46);
	RNDr_256(S, W, 47);
	RNDr_256(S, W, 48);
	RNDr_256(S, W, 49);
	RNDr_256(S, W, 50);
	RNDr_256(S, W, 51);
	RNDr_256(S, W, 52);
	RNDr_256(S, W, 53);
	RNDr_256(S, W, 54);
	RNDr_256(S, W, 55);
	RNDr_256(S, W, 56);
	RNDr_256(S, W, 57);
	RNDr_256(S, W, 58);
	RNDr_256(S, W, 59);
	RNDr_256(S, W, 60);
	RNDr_256(S, W, 61);
	RNDr_256(S, W, 62);
	RNDr_256(S, W, 63);

	for (i = 0; i < 8; i++)
		S[i] = _mm256_add_epi32(S[i], midstate[i]);

	W2 = W + 64;
	S2 = S + 8;

	memcpy(S2, S, sizeof(uint32_t) * 8 * 8);

	RNDr_256(S2, W2, 0);
	RNDr_256(S2, W2, 1);
	RNDr_256(S2, W2, 2);
	RNDr_256(S2, W2, 3);
	RNDr_256(S2, W2, 4);
	RNDr_256(S2, W2, 5);
	RNDr_256(S2, W2, 6);
	RNDr_256(S2, W2, 7);
	RNDr_256(S2, W2, 8);
	RNDr_256(S2, W2, 9);
	RNDr_256(S2, W2, 10);
	RNDr_256(S2, W2, 11);
	RNDr_256(S2, W2, 12);
	RNDr_256(S2, W2, 13);
	RNDr_256(S2, W2, 14);
	RNDr_256(S2, W2, 15);
	RNDr_256(S2, W2, 16);
	RNDr_256(S2, W2, 17);
	RNDr_256(S2, W2, 18);
	RNDr_256(S2, W2, 19);
	RNDr_256(S2, W2, 20);
	RNDr_256(S2, W2, 21);
	RNDr_256(S2, W2, 22);
	RNDr_256(S2, W2, 23);
	RNDr_256(S2, W2, 24);
	RNDr_256(S2, W2, 25);
	RNDr_256(S2, W2, 26);
	RNDr_256(S2, W2, 27);
	RNDr_256(S2, W2, 28);
	RNDr_256(S2, W2, 29);
	RNDr_256(S2, W2, 30);
	RNDr_256(S2, W2, 31);
	RNDr_256(S2, W2, 32);
	RNDr_256(S2, W2, 33);
	RNDr_256(S2, W2, 34);
	RNDr_256(S2, W2, 35);
	RNDr_256(S2, W2, 36);
	RNDr_256(S2, W2, 37);
	RNDr_256(S2, W2, 38);
	RNDr_256(S2, W2, 39);
	RNDr_256(S2, W2, 40);
	RNDr_256(S2, W2, 41);
	RNDr_256(S2, W2, 42);
	RNDr_256(S2, W2, 43);
	RNDr_256(S2, W2, 44);
	RNDr_256(S2, W2, 45);
	RNDr_256(S2, W2, 46);
	RNDr_256(S2, W2, 47);
	RNDr_256(S2, W2, 48);
	RNDr_256(S2, W2, 49);
	RNDr_256(S2, W2, 50);
	RNDr_256(S2, W2, 51);
	RNDr_256(S2, W2, 52);
	RNDr_256(S2, W2, 53);
	RNDr_256(S2, W2, 54);
	RNDr_256(S2, W2, 55);
	RNDr_256(S2, W2, 56);
	RNDr_256(S2, W2, 57);
	RNDr_256(S2, W2, 58);
	RNDr_256(S2, W2, 59);
	RNDr_256(S2, W2, 60);
	RNDr_256(S2, W2, 61);
	RNDr_256(S2, W2, 62);
	RNDr_256(S2, W2, 63);

	for (i = 0; i < 8; i++)
		S[i] = _mm256_add_epi32(S[i], S2[i]);

	memcpy(W + 18, S + 18, sizeof(uint32_t) * 8 * 14);

	// second
	memcpy(S + 8, sha256d_hash1_256 + 8, sizeof(uint32_t) * 8 * 8);

	S[16] = _mm256_add_epi32(s0_256(S[1]), S[0]);
	S[17] = _mm256_add_epi32(_mm256_add_epi32(s1_256(sha256d_hash1_256[15]), s0_256(S[2])), S[1]);
	S[18] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[16]), s0_256(S[3])), S[2]);
	S[19] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[17]), s0_256(S[4])), S[3]);
	S[20] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[18]), s0_256(S[5])), S[4]);
	S[21] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[19]), s0_256(S[6])), S[5]);
	S[22] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[20]), sha256d_hash1_256[15]), s0_256(S[7])), S[6]);
	S[23] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[21]), S[16]), s0_256(sha256d_hash1_256[8])), S[7]);
	S[24] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[22]), S[17]), sha256d_hash1_256[8]);
	S[25] = _mm256_add_epi32(s1_256(S[23]), S[18]);
	S[26] = _mm256_add_epi32(s1_256(S[24]), S[19]);
	S[27] = _mm256_add_epi32(s1_256(S[25]), S[20]);
	S[28] = _mm256_add_epi32(s1_256(S[26]), S[21]);
	S[29] = _mm256_add_epi32(s1_256(S[27]), S[22]);
	S[30] = _mm256_add_epi32(_mm256_add_epi32(s1_256(S[28]), S[23]), s0_256(sha256d_hash1_256[15]));
	S[31] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[29]), S[24]), s0_256(S[16])), sha256d_hash1_256[15]);
	for (i = 32; i < 60; i += 2)
	{
		S[i] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[i - 2]), S[i - 7]), s0_256(S[i - 15])), S[i - 16]);
		S[i + 1] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[i - 1]), S[i - 6]), s0_256(S[i - 14])), S[i - 15]);
	}
	S[60] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(s1_256(S[58]), S[53]), s0_256(S[45])), S[44]);

	sha256_init_256(hash);

	RNDr_256(hash, S, 0);
	RNDr_256(hash, S, 1);
	RNDr_256(hash, S, 2);
	RNDr_256(hash, S, 3);
	RNDr_256(hash, S, 4);
	RNDr_256(hash, S, 5);
	RNDr_256(hash, S, 6);
	RNDr_256(hash, S, 7);
	RNDr_256(hash, S, 8);
	RNDr_256(hash, S, 9);
	RNDr_256(hash, S, 10);
	RNDr_256(hash, S, 11);
	RNDr_256(hash, S, 12);
	RNDr_256(hash, S, 13);
	RNDr_256(hash, S, 14);
	RNDr_256(hash, S, 15);
	RNDr_256(hash, S, 16);
	RNDr_256(hash, S, 17);
	RNDr_256(hash, S, 18);
	RNDr_256(hash, S, 19);
	RNDr_256(hash, S, 20);
	RNDr_256(hash, S, 21);
	RNDr_256(hash, S, 22);
	RNDr_256(hash, S, 23);
	RNDr_256(hash, S, 24);
	RNDr_256(hash, S, 25);
	RNDr_256(hash, S, 26);
	RNDr_256(hash, S, 27);
	RNDr_256(hash, S, 28);
	RNDr_256(hash, S, 29);
	RNDr_256(hash, S, 30);
	RNDr_256(hash, S, 31);
	RNDr_256(hash, S, 32);
	RNDr_256(hash, S, 33);
	RNDr_256(hash, S, 34);
	RNDr_256(hash, S, 35);
	RNDr_256(hash, S, 36);
	RNDr_256(hash, S, 37);
	RNDr_256(hash, S, 38);
	RNDr_256(hash, S, 39);
	RNDr_256(hash, S, 40);
	RNDr_256(hash, S, 41);
	RNDr_256(hash, S, 42);
	RNDr_256(hash, S, 43);
	RNDr_256(hash, S, 44);
	RNDr_256(hash, S, 45);
	RNDr_256(hash, S, 46);
	RNDr_256(hash, S, 47);
	RNDr_256(hash, S, 48);
	RNDr_256(hash, S, 49);
	RNDr_256(hash, S, 50);
	RNDr_256(hash, S, 51);
	RNDr_256(hash, S, 52);
	RNDr_256(hash, S, 53);
	RNDr_256(hash, S, 54);
	RNDr_256(hash, S, 55);
	RNDr_256(hash, S, 56);

	hash[2] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(hash[2], hash[6]), S1_256(hash[3])), Ch_256(hash[3], hash[4], hash[5])), S[57]), sha256_k_256[57]);
	hash[1] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(hash[1], hash[5]), S1_256(hash[2])), Ch_256(hash[2], hash[3], hash[4])), S[58]), sha256_k_256[58]);
	hash[0] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(hash[0], hash[4]), S1_256(hash[1])), Ch_256(hash[1], hash[2], hash[3])), S[59]), sha256_k_256[59]);
	hash[7] = _mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(_mm256_add_epi32(hash[7], hash[3]), S1_256(hash[0])), Ch_256(hash[0], hash[1], hash[2])), S[60]), sha256_k_256[60]), sha256_h_256[7]);
}
#endif /* __AVX2__ */

void vipstar_hash(char *output, const char *input, uint32_t len)
{
	sha256d_181_swap((uint32_t *)output, (uint32_t *)input);
}