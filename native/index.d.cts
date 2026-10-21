/*
 * Typings for the hashing addon. The JavaScript surface is one function per
 * export; the shapes below are the ones src/multihashing.cc checks at run
 * time (a wrong type or length throws). See native/README.md.
 */

/** A header (normally 80 bytes) in, the 32-byte digest out. */
type Hasher = (data: Buffer) => Buffer;

interface MultiHashing {
    // SHA-2 / SHA-1
    sha256d: Hasher;
    sha512256d: Hasher;
    sha1: Hasher;
    vipstar: Hasher;
    // BLAKE
    blake: Hasher;
    blake2b: Hasher;
    blake2s: Hasher;
    blake3: Hasher;
    // X-chains
    x11: Hasher;
    x13: Hasher;
    x15: Hasher;
    x16r: Hasher;
    x16rv2: Hasher;
    x16s: Hasher;
    x16rt: Hasher;
    x17: Hasher;
    x21s: Hasher;
    x22i: Hasher;
    x25x: Hasher;
    c11: Hasher;
    xevan: Hasher;
    skydoge: Hasher;
    tribus: Hasher;
    nist5: Hasher;
    quark: Hasher;
    qubit: Hasher;
    hsr: Hasher;
    phi1612: Hasher;
    skunk: Hasher;
    allium: Hasher;
    minotaur: Hasher;
    fresh: Hasher;
    zr5: Hasher;
    // Single primitives
    keccak: Hasher;
    skein: Hasher;
    groestl: Hasher;
    groestlmyriad: Hasher;
    fugue: Hasher;
    shavite3: Hasher;
    hefty1: Hasher;
    whirlpoolx: Hasher;
    gost: Hasher;
    lbry: Hasher;
    // Lyra2
    lyra2re: Hasher;
    lyra2re2: Hasher;
    lyra2rev2: Hasher;
    lyra2rev3: Hasher;
    lyra2z: Hasher;
    lyra2z330: Hasher;
    lyra2z16m330: Hasher;
    // yespower / yescrypt
    yespower: Hasher;
    yespower_0_5_R8: Hasher;
    yespower_0_5_R8G: Hasher;
    yespower_0_5_R16: Hasher;
    yespower_0_5_R24: Hasher;
    yespower_0_5_R32: Hasher;
    yespower_arwn: Hasher;
    yespower_ic: Hasher;
    yespower_iots: Hasher;
    yespower_litb: Hasher;
    yespower_ltncg: Hasher;
    yespower_mgpc: Hasher;
    yespower_r16: Hasher;
    yespower_sugar: Hasher;
    yespower_tide: Hasher;
    yespower_urx: Hasher;
    bcrypt: Hasher;

    // Hashers with parameters
    scrypt(data: Buffer, N: number, r: number): Buffer;
    scryptn(data: Buffer, nFactor: number): Buffer;
    scryptjane(
        data: Buffer,
        timestamp: number,
        nChainStartTime: number,
        nMin: number,
        nMax: number
    ): Buffer;
    /** The input must be at least 80 bytes. */
    neoscrypt(data: Buffer, profile: number): Buffer;
    argon2d(data: Buffer, t: number, m: number, p: number): Buffer;
    argon2i(data: Buffer, t: number, m: number, p: number): Buffer;
    argon2id(data: Buffer, t: number, m: number, p: number): Buffer;
    /** `fastOrVariant`: true for the fast variant, or a variant number (4 needs the height). */
    cryptonight(
        data: Buffer,
        fastOrVariant?: boolean | number,
        height?: number
    ): Buffer;
    cryptonightfast(data: Buffer, fastOrVariant?: boolean | number): Buffer;
    boolberry(data: Buffer, scratchpad: Buffer, height?: number): Buffer;
    odo(data: Buffer, key: number): Buffer;

    // Share verification. Hashes are 32-byte buffers; the nonce is 8 bytes
    // little-endian.
    ethash_verify_final(
        headerHash: Buffer,
        mixHash: Buffer,
        nonce: Buffer,
        boundary: Buffer
    ): boolean;
    ethash_verify(
        headerHash: Buffer,
        mixHash: Buffer,
        nonce: Buffer,
        boundary: Buffer,
        epoch: number
    ): boolean;
    /** 64 bytes: final hash followed by the mix hash. */
    ethash_hash(headerHash: Buffer, nonce: Buffer, epoch: number): Buffer;
    ethash_final_hash(headerHash: Buffer, mixHash: Buffer, nonce: Buffer): Buffer;
    /** 64 bytes: final hash followed by the mix hash. */
    kawpow(headerHash: Buffer, nonce: Buffer, height: number): Buffer;
    equihash_verify(
        header: Buffer,
        solution: Buffer,
        personalization: string,
        n: number,
        k: number
    ): boolean;
}

declare const multiHashing: MultiHashing;
export = multiHashing;
