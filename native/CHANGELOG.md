# [1.2.0](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/compare/v1.1.2...v1.2.0) (2026-06-15)


Built and tested on Node 24 with the C++20 toolchain. 74 hashing algorithms
are exported; 30 are covered by the set1/set2/set3 known-answer vectors.


### Build

* compile the native addon with `-std=c++20` for Node 24 support (V8 headers)


### Continuous Integration

* install GCC 10 explicitly on CircleCI for the C++20 build
* modernize CircleCI config (Node 20/22/24 matrix); bump actions/checkout and setup-node to v6


### Documentation

* add ROADMAP.md (test-vector coverage, compiler warnings, NAN→N-API, WebAssembly, monorepo)
* modernize the README badge row and align it with the sibling repos
* CLAUDE.md: `develop` is the working branch, `main` is for releases



## [1.1.2](https://github.com/ROZ-MOFUMOFU-ME/node-multi-hashing/compare/v1.0.2...v1.1.2) (2026-06-13)


### Bug Fixes

* use the SHA-3 reference BMW (BlueMidnightWish) for `lyra2rev2` so Monacoin's Lyra2REv2 digest matches the live network (`sph_bmw256` was incompatible)
* replace deprecated `ftime()` with `gettimeofday()` in oaes_lib
* fix NeoScrypt output endianness for test-vector compatibility


### Features

* add the `vipstar` (VIPSTARCOIN) sha256d-over-181-byte-header algorithm, with SIMD optimizations and test vectors


### Tests

* enable the `lyra2re2`/`lyra2rev2` vectors with corrected digests


### Chores

* update `nan` to 2.27 and refresh dev tooling
* override mocha's vulnerable transitive dependencies



## [1.0.1](https://github.com/zone117x/node-multi-hashing/compare/v1.0.0...v1.0.1) (2021-07-15)


### Bug Fixes

* DEP0128 DeprecationWarning: Invalid 'main' field ([27dd90e](https://github.com/zone117x/node-multi-hashing/commit/27dd90e7476e71774bea5b50888f4df8d3b604a3))

# 1.0.0 (2020-08-26)


### Bug Fixes

* building on macos ([951ba10](https://github.com/zone117x/node-multi-hashing/commit/951ba106e234ca99d2b78a0f9b2881fb3f90c81c))
* bump test timeout ([9dc7dab](https://github.com/zone117x/node-multi-hashing/commit/9dc7dab38186c35723e57d3625ccdef1a13daea6))
* run gh actions on all branches ([1aa6f9e](https://github.com/zone117x/node-multi-hashing/commit/1aa6f9e8f938cba71ee82722abe593d799b15be8))
