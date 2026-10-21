# native — the hashing addon

NAMP's proof-of-work code: C/C++ implementations of every algorithm the pool
serves, built into one Node addon (`multihashing.node`) by the root
`binding.gyp` on `npm install`, loaded through [`index.cjs`](index.cjs) and
typed by [`index.d.cts`](index.d.cts). The stratum code in `src/` calls it
through the algorithm table in `src/algoProperties.ts`.

Every export is synchronous and deterministic: the same bytes in, the same
bytes out, on every call and every machine. Bad arguments throw a JavaScript
error; nothing is read past the end of a buffer.

## Layout

| Path                      | What it holds                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/multihashing.cc`     | The addon: argument checking, the export table, the Ethash epoch cache                                           |
| `src/*.c`, `src/*.h`      | One entry point per export (`x11.c` → `x11_hash`), chaining the primitives below                                 |
| `src/sha3/`               | sphlib primitives (BLAKE, BMW, Groestl, JH, Keccak, Skein, Luffa, CubeHash, SHAvite, SIMD, ECHO, Hamsi, Fugue, Shabal, Whirlpool, SHA-2, HAVAL, Tiger, Panama, GOST, BLAKE2s), SWIFFTX, Lane, Keccak-P[800], SM3 |
| `src/crypto/`             | Lyra2 (`lyra2.c`, `sponge.c`), CryptoNight, Argon2, yespower, OdoCrypt                                           |
| `src/scryptjane/`         | scrypt-jane                                                                                                      |
| `src/equihash/`           | The Zcash-family solution verifier                                                                               |
| `src/ethash/`             | chfast/ethash: light-cache verification for Ethash and the base of KawPow. `src/kawpow.cpp` is the ProgPoW kernel |
| `src/blake3/`             | The official BLAKE3 C implementation (portable kernel)                                                           |

## API

### Hashers: `(data: Buffer) => Buffer` (32 bytes)

The input is normally the 80-byte block header; the output is the raw digest,
which the pool compares against the target.

| Family                   | Exports                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHA-2 / SHA-1            | `sha256d`, `sha512256d` (Radiant: double SHA-512/256), `sha1` (the Sha1coin construction: SHA-1, base64, 26 windowed SHA-1s XORed, digest in the last 20 bytes), `vipstar` (sha256d of VIPSTARCOIN's 181-byte qtum-style header; same as `sha256d` for any input) |
| BLAKE                    | `blake` (BLAKE-256), `blake2b` (BLAKE2b-256, unkeyed), `blake2s` (BLAKE2s-256), `blake3`                                                                      |
| X-chains                 | `x11`, `x13`, `x15`, `x16r`, `x16rv2`, `x16s`, `x16rt`, `x17`, `x21s`, `x22i`, `x25x`, `c11`, `xevan`, `skydoge`, `tribus`, `nist5`, `quark`, `qubit`, `hsr`, `phi1612`, `skunk`, `allium`, `minotaur`, `fresh`, `zr5` |
| Single primitives        | `keccak`, `skein`, `groestl`, `groestlmyriad`, `fugue`, `shavite3`, `hefty1`, `whirlpoolx`, `gost` (Streebog-512, first 32 bytes), `lbry`                            |
| Lyra2                    | `lyra2re`, `lyra2re2` (alias of `lyra2re`), `lyra2rev2`, `lyra2rev3`, `lyra2z`, `lyra2z330`, `lyra2z16m330`                                                   |
| yespower / yescrypt      | `yespower` (1.0, N=2048 r=32), `yespower_0_5_R8`, `_R8G`, `_R16`, `_R24`, `_R32` (yescrypt-era 0.5), and the coin profiles `yespower_arwn`, `_ic`, `_iots`, `_litb`, `_ltncg`, `_mgpc`, `_r16`, `_sugar`, `_tide`, `_urx` |
| bcrypt                   | `bcrypt`: three Blowfish passes over 16-byte slices of the header                                                                                             |

`x16r` and `x16rv2` take their order from the previous block hash (header bytes
4..11), `x16s` and `x21s` permute the same sixteen with each nibble, and `x16rt`
hashes the block time (bytes 68..71, low 7 bits cleared) to pick the order.
`x22i` and `x25x` run the chain in fixed order and add SWIFFTX, HAVAL, Tiger,
Lyra2, GOST and SHA-256 (`x25x` then Panama, Lane, a shuffle and BLAKE2s).

### Hashers with parameters

| Export                                                     | Notes                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `scrypt(data, N, r)`                                       | scrypt with p=1, the input as both password and salt, 32-byte output                    |
| `scryptn(data, nFactor)`                                   | `scrypt(data, 2^nFactor, 1)`                                                             |
| `scryptjane(data, timestamp, nChainStartTime, nMin, nMax)` | scrypt-jane with the N-factor derived from the timestamp                                |
| `neoscrypt(data, profile)`                                 | Input must be at least 80 bytes                                                         |
| `argon2d(data, t, m, p)`, `argon2i`, `argon2id`            | The input is also the salt; `m` in KiB                                                   |
| `cryptonight(data, fast?, height?)`                        | 2nd argument: `true` for the fast variant or a variant number (4 needs the height)      |
| `cryptonightfast(data, fast?)`                             |                                                                                         |
| `boolberry(data, scratchpad, height?)`                     |                                                                                         |
| `odo(data, key)`                                           | OdoCrypt with the epoch key                                                              |

### Share verification (Ethash, KawPow, Equihash)

These check what a miner submitted rather than hashing a header.

| Export                                                              | Returns                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ethash_verify_final(headerHash, mixHash, nonce, boundary)`         | `boolean` — keccak-only check against the boundary          |
| `ethash_verify(headerHash, mixHash, nonce, boundary, epoch)`        | `boolean` — also proves the mix came from the DAG (epoch cache) |
| `ethash_hash(headerHash, nonce, epoch)`                             | 64 bytes: final hash ‖ mix hash (miner side, used by tests)  |
| `ethash_final_hash(headerHash, mixHash, nonce)`                     | 32 bytes: the final hash (for reporting a share's difficulty) |
| `kawpow(headerHash, nonce, height)`                                 | 64 bytes: final hash ‖ mix hash                             |
| `equihash_verify(header, solution, personalization, n, k)`          | `boolean`                                                  |

Hashes are 32-byte buffers, the nonce an 8-byte little-endian buffer. The
epoch's light cache (16 MB + 128 KB per epoch) is built on first use and the
three most recent are kept, so a verification costs milliseconds after the
first one of an epoch. Ethash and KawPow share the cache; the chain's
dataset-parents setting (256 or 512) is applied per call.

## Build

`npm install` runs `node-gyp rebuild`; after pulling changes under `native/`,
run `npm run rebuild:native`. Needs a C/C++ toolchain with C++20 (GCC 10+ or
clang) and Python for node-gyp.

Two flags in `binding.gyp` matter:

- `-fno-strict-aliasing` — the hashing code views the same bytes as several
  types (Lyra2's sponge, scrypt's mixing). Without the flag GCC 12 at `-O3`
  returned a different `lyra2rev3` on every call and a wrong `scrypt`; miners
  build with the same flag.
- `-std=c++20` — the V8 headers of Node 24 require it.

BLAKE3 is built with its portable kernel only (`BLAKE3_NO_*` defines): the
SIMD kernels need per-file `-m` flags node-gyp cannot express, and a pool
verifies one hash per share.

The build is warning-free in NAMP's own code; the remaining warnings come
from upstream sphlib, Argon2 and yespower sources and are left as they are.

## Tests

Every export has a known answer it is checked against, and nothing is
skipped. `node --test test/native.test.ts test/hashing.vectors.test.cjs`
runs it all; `test/native.test.ts` ends with a coverage test that fails if an
export has no known answer anywhere.

| Where                                                | What it checks                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/native.test.ts`                                | Every export runs, returns the documented shape and is deterministic; `sha256d`, `sha512256d`, `blake2s`, `scrypt`, `scryptn`, `vipstar` and `sha1` against Node's `crypto`; `blake3` against its official vectors; `blake2b` and `keccak` against published known answers; `gost` against RFC 6986; `cryptonight` against Monero's test files; `kawpow` against Ravencoin's; `odo` against DigiByte's |
| `test/hashing.vectors.test.cjs` + `test/vectors/`    | Stored answers: `set1..3` (inherited from node-multi-hashing), `reference.json` (an independent implementation: cpuminer-multi and cpuminer-opt built standalone, 26 algorithms), `regression.json` (the addon's own recorded answers for the exports no reference covers), `blake3.json`, `cryptonight.json`, `kawpow.json`, `odo.json` |
| `test/ethash.test.ts`, `test/equihash.test.ts`       | The verifiers, including a block sealed by a real geth                                                                                                                                                                                                         |

`regression.json` is the honest residue: bcrypt, boolberry, hsr, skunk,
skydoge, whirlpoolx, minotaur, scryptjane, x16rt, x21s, x22i, x25x, the
yespower coin profiles and cryptonightfast have no second implementation or
published vector to compare with, so their current output is pinned to catch
unintended change. The yespower profiles for IOTS, MGPC and LITB carry
parameters inherited from node-multi-hashing that could not be confirmed
against the coins (a personalization length of 8 for longer strings; a
73-byte string ending in "mini").

### Adding an algorithm

1. Put the entry point in `src/<name>.c` with `void <name>_hash(const char*
   input, char* output, uint32_t len)` and a header with `extern "C"` guards;
   chain the primitives from `src/sha3` and `src/crypto`.
2. List every new source in `binding.gyp`. A source that is missing links
   silently and the export aborts the process on first call — `ldd -r
   build/Release/multihashing.node` must show no undefined symbols beyond V8's.
3. Add `DECLARE_CALLBACK(<name>, <name>_hash, 32)` and `NAN_EXPORT(target,
   <name>)` in `src/multihashing.cc`, and the entry in `src/algoProperties.ts`.
4. Add the name to the export list in `test/native.test.ts`, and a known
   answer (an official vector, a Node `crypto` oracle, or a hash the coin's
   daemon produced) wherever one exists.

## Licenses

NAMP is GPL-2.0-only. The vendored code keeps its own licenses, stated in the
file headers: sphlib (MIT-style, Projet RNRT SAPHIR), Equihash (MIT, see
`src/equihash/LICENSE`), chfast/ethash (Apache-2.0), BLAKE3 (CC0 1.0 /
Apache-2.0, see `src/blake3/LICENSE`), Argon2 (CC0 / Apache-2.0), yespower
(BSD), scrypt-jane (public domain), CryptoNight (BSD-3), and the algorithm
entry points inherited from node-multi-hashing (GPL-2.0).
