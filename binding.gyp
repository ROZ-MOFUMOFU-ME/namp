{
    "targets": [
        {
            "target_name": "multihashing",
            "sources": [
                # The addon itself: argument handling and the export table.
                "native/src/multihashing.cc",

                # Algorithm entry points (one per export).
                "native/src/allium.c",
                "native/src/bcrypt.c",
                "native/src/blake.c",
                "native/src/blake2s.c",
                "native/src/blake2b.c",
                "native/src/blake3.c",
                "native/src/boolberry.cc",
                "native/src/c11.c",
                "native/src/cryptonight.c",
                "native/src/cryptonight_fast.c",
                "native/src/fresh.c",
                "native/src/fugue.c",
                "native/src/gost.c",
                "native/src/groestl.c",
                "native/src/hefty1.c",
                "native/src/hsr14.c",
                "native/src/kawpow.cpp",
                "native/src/keccak.c",
                "native/src/lbry.c",
                "native/src/lyra2re.c",
                "native/src/lyra2z.c",
                "native/src/lyra2z16m330.c",
                "native/src/lyra2z330.c",
                "native/src/minotaur.c",
                "native/src/neoscrypt.c",
                "native/src/nist5.c",
                "native/src/odo.cc",
                "native/src/phi1612.c",
                "native/src/quark.c",
                "native/src/qubit.c",
                "native/src/scryptjane.c",
                "native/src/scryptn.c",
                "native/src/sha1.c",
                "native/src/sha256d.c",
                "native/src/sha512256d.c",
                "native/src/shavite3.c",
                "native/src/skein.c",
                "native/src/skunk.c",
                "native/src/skydoge.c",
                "native/src/sm3.c",
                "native/src/tribus.c",
                "native/src/vipstar.c",
                "native/src/whirlpoolx.c",
                "native/src/x11.c",
                "native/src/x13.c",
                "native/src/x15.c",
                "native/src/x16r.c",
                "native/src/x16rv2.c",
                "native/src/x16rt.c",
                "native/src/x16s.c",
                "native/src/x17.c",
                "native/src/x21s.c",
                "native/src/x22i.c",
                "native/src/x25x.c",
                "native/src/xevan.c",
                "native/src/zr5.c",

                # sphlib primitives (SHA-3 contest candidates and friends) the X-family chains use.
                "native/src/sha3/KeccakP-800-reference.c",
                "native/src/sha3/SWIFFTX.c",
                "native/src/sha3/lane.c",
                "native/src/sha3/aes_helper.c",
                "native/src/sha3/bmw_lyra.c",
                "native/src/sha3/hamsi.c",
                "native/src/sha3/sph_blake.c",
                "native/src/sha3/sph_blake2s.c",
                "native/src/sha3/sph_bmw.c",
                "native/src/sha3/sph_cubehash.c",
                "native/src/sha3/sph_echo.c",
                "native/src/sha3/sph_fugue.c",
                "native/src/sha3/sph_gost.c",
                "native/src/sha3/sph_groestl.c",
                "native/src/sha3/sph_haval.c",
                "native/src/sha3/sph_hefty1.c",
                "native/src/sha3/sph_jh.c",
                "native/src/sha3/sph_keccak.c",
                "native/src/sha3/sph_luffa.c",
                "native/src/sha3/sph_panama.c",
                "native/src/sha3/sph_ripemd.c",
                "native/src/sha3/sph_sha1.c",
                "native/src/sha3/sph_sha2.c",
                "native/src/sha3/sph_sha2big.c",
                "native/src/sha3/sph_shabal.c",
                "native/src/sha3/sph_shavite.c",
                "native/src/sha3/sph_simd.c",
                "native/src/sha3/sph_skein.c",
                "native/src/sha3/sph_tiger.c",
                "native/src/sha3/sph_whirlpool.c",

                # CryptoNight, Lyra2, Argon2, yespower and the OdoCrypt cipher.
                "native/src/crypto/aesb.c",
                "native/src/crypto/argon2/argon2.c",
                "native/src/crypto/argon2/blake2/blake2b.c",
                "native/src/crypto/argon2/core.c",
                "native/src/crypto/argon2/encoding.c",
                "native/src/crypto/argon2/opt.c",
                "native/src/crypto/argon2/thread.c",
                "native/src/crypto/c_blake256.c",
                "native/src/crypto/c_groestl.c",
                "native/src/crypto/c_jh.c",
                "native/src/crypto/c_keccak.c",
                "native/src/crypto/c_skein.c",
                "native/src/crypto/hash.c",
                "native/src/crypto/lyra2.c",
                "native/src/crypto/oaes_lib.c",
                "native/src/crypto/odocrypt.cpp",
                "native/src/crypto/sha256.c",
                "native/src/crypto/sponge.c",
                "native/src/crypto/wild_keccak.cpp",
                "native/src/crypto/yespower/yespower-opt.c",
                "native/src/crypto/yespower/yespower.c",

                # Equihash solution verifier (Zcash family).
                "native/src/equihash/blake/blake2b.cpp",
                "native/src/equihash/endian.c",
                "native/src/equihash/equihash.cpp",

                # BLAKE3 (official C implementation, portable kernel).
                "native/src/blake3/blake3.c",
                "native/src/blake3/blake3_dispatch.c",
                "native/src/blake3/blake3_portable.c",

                # Ethash (chfast/ethash: light-cache verification) and the KawPow ProgPoW kernel.
                "native/src/ethash/ethash.cpp",
                "native/src/ethash/keccak.c",
                "native/src/ethash/keccakf1600.c",
                "native/src/ethash/keccakf800.c",
                "native/src/ethash/managed.cpp",
                "native/src/ethash/primes.c"
            ],
            "include_dirs": [
                "native/src/crypto",
                "<!(node -e \"require('nan')\")"
            ],
            # The hashing code type-puns freely (Lyra2's sponge views the same
            # bytes as uint64 and uint8): under GCC's strict-aliasing
            # assumptions at -O2/-O3 lyra2rev3 returned a different hash on
            # every call. Miners build with the same flag for the same reason.
            # sphlib ships lookup tables its variants do not all use.
            # -fstack-protector-strong is Ubuntu's default and caught an
            # overflow Debian's compiler let through; every build gets it.
            "cflags": ["-fno-strict-aliasing", "-fstack-protector-strong", "-Wno-unused-const-variable"],
            # The V8 headers of Node 24 need C++20; the Equihash port throws.
            "cflags_cc": ["-std=c++20", "-fexceptions", "-fno-strict-aliasing", "-fstack-protector-strong", "-Wno-unused-const-variable"],
            # BLAKE3: the portable kernel only. Its SIMD kernels need per-file
            # -m flags node-gyp cannot express, and a pool verifies one hash
            # per share.
            "defines": ["BLAKE3_NO_SSE2", "BLAKE3_NO_SSE41", "BLAKE3_NO_AVX2", "BLAKE3_NO_AVX512", "BLAKE3_USE_NEON=0"],
            "xcode_settings": {
                "OTHER_CFLAGS": ["-fno-strict-aliasing"],
                "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
                "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
            }
        }
    ]
}
