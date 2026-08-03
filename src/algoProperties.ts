import multiHashing from '../native/index.cjs';
import * as util from './util.ts';

const diff1 = ((global as any).diff1 = BigInt(
    '0x00000000ffff0000000000000000000000000000000000000000000000000000'
));

/*
 * Every algorithm is declared here in one place: its hasher, its difficulty
 * multiplier, and how jobManager must derive the coinbase and block-identifier
 * hashes for it. jobManager reads those policies through getCoinbaseHasher /
 * getBlockHasher below instead of re-deriving them from parallel switch
 * statements — the two used to drift apart from this table.
 *
 * blockHasher (how the block IDENTIFIER hash is produced; the PoW hash is
 * always `hash()`):
 *   'digest'    — reverseBuffer(hashDigest(header, nTime))     [default]
 *   'sha256d'   — reverseBuffer(sha256d(header)); the daemon computes
 *                 CBlockHeader::GetHash as plain sha256d for these chains
 *   'posDigest' — 'digest' on POS chains, 'sha256d' otherwise
 *
 * coinbaseHasher:
 *   'sha256d'       — sha256d(coinbase)                        [default]
 *   'normalHashing' — sha256d when coin.normalHashing is set, else sha256
 */

/** Algorithms whose hasher is a plain pass-through to a multi-hashing export. */
function passthrough(fnName: string, props: any = {}) {
    return {
        ...props,
        hash() {
            return function (this: any, ...args: any[]) {
                return (multiHashing as any)[fnName].apply(this, args);
            };
        }
    };
}

const yescryptDiff = parseInt(
    '0x0007ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

const algos: any = ((global as any).algos = {
    sha256: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        hash() {
            return function (this: any, ...args: any[]) {
                return (util.sha256d as any).apply(this, args);
            };
        }
    },
    sha256d: passthrough('sha256d'),
    scrypt: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        multiplier: Math.pow(2, 16),
        blockHasher: 'posDigest',
        hash(coinConfig: any) {
            const nValue = coinConfig.nValue || 1024;
            const rValue = coinConfig.rValue || 1;
            return function (data: Buffer) {
                return multiHashing.scrypt(data, nValue, rValue);
            };
        }
    },
    'scrypt-og': {
        //Aiden settings
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        multiplier: Math.pow(2, 16),
        blockHasher: 'posDigest',
        hash(coinConfig: any) {
            const nValue = coinConfig.nValue || 64;
            const rValue = coinConfig.rValue || 1;
            return function (data: Buffer) {
                return multiHashing.scrypt(data, nValue, rValue);
            };
        }
    },
    'scrypt-jane': {
        multiplier: Math.pow(2, 16),
        blockHasher: 'posDigest',
        hash(coinConfig: any) {
            const nTimestamp = coinConfig.chainStartTime || 1367991200;
            const nMin = coinConfig.nMin || 4;
            const nMax = coinConfig.nMax || 30;
            return function (data: Buffer, nTime: number) {
                return multiHashing.scryptjane(
                    data,
                    nTime,
                    nTimestamp,
                    nMin,
                    nMax
                );
            };
        }
    },
    'scrypt-n': {
        multiplier: Math.pow(2, 16),
        blockHasher: 'sha256d',
        hash(coinConfig: any) {
            const timeTable: any = coinConfig.timeTable || {
                2048: 1389306217,
                4096: 1456415081,
                8192: 1506746729,
                16384: 1557078377,
                32768: 1657741673,
                65536: 1859068265,
                131072: 2060394857,
                262144: 1722307603,
                524288: 1769642992
            };

            const nFactor = (function () {
                const n = Object.keys(timeTable)
                    .sort()
                    .reverse()
                    .filter(function (nKey) {
                        return Date.now() / 1000 > timeTable[nKey];
                    })[0];

                const nInt = parseInt(n);
                return Math.log(nInt) / Math.log(2);
            })();

            return function (data: Buffer) {
                return multiHashing.scryptn(data, nFactor);
            };
        }
    },
    sha1: passthrough('sha1', { blockHasher: 'sha256d' }),
    x11: passthrough('x11', { blockHasher: 'sha256d' }),
    x13: passthrough('x13'),
    x15: passthrough('x15'),
    x16r: passthrough('x16r', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    x16rv2: passthrough('x16rv2', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    x17: passthrough('x17', { blockHasher: 'sha256d' }),
    skydoge: passthrough('skydoge'),
    x25x: passthrough('x25x'),
    nist5: passthrough('nist5'),
    quark: passthrough('quark'),
    keccak: {
        multiplier: Math.pow(2, 8),
        coinbaseHasher: 'normalHashing',
        hash(coinConfig: any) {
            if (coinConfig.normalHashing === true) {
                return function (data: Buffer, nTimeInt: number) {
                    return multiHashing.keccak(
                        multiHashing.keccak(
                            Buffer.concat([
                                data,
                                Buffer.from(nTimeInt.toString(16), 'hex')
                            ])
                        )
                    );
                };
            } else {
                return function (this: any, ...args: any[]) {
                    return (multiHashing.keccak as any).apply(this, args);
                };
            }
        }
    },
    allium: passthrough('allium', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    blake: passthrough('blake', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d',
        coinbaseHasher: 'normalHashing'
    }),
    blake2s: passthrough('blake2s', {
        multiplier: Math.pow(2, 0),
        blockHasher: 'sha256d'
    }),
    skein: passthrough('skein', { blockHasher: 'sha256d' }),
    groestl: passthrough('groestl', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d',
        coinbaseHasher: 'normalHashing'
    }),
    groestlmyriad: passthrough('groestlmyriad', { blockHasher: 'sha256d' }),
    fugue: passthrough('fugue', {
        multiplier: Math.pow(2, 8),
        coinbaseHasher: 'normalHashing'
    }),
    shavite3: passthrough('shavite3'),
    hefty1: passthrough('hefty1'),
    neoscrypt: passthrough('neoscrypt', {
        multiplier: Math.pow(2, 5),
        blockHasher: 'sha256d'
    }),
    minotaur: passthrough('minotaur', { blockHasher: 'sha256d' }),
    lyra2: passthrough('lyra2re', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    lyra2v2: passthrough('lyra2rev2', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    lyra2v3: passthrough('lyra2rev3', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    lyra2re: passthrough('lyra2re', { multiplier: Math.pow(2, 7) }),
    lyra2re2: passthrough('lyra2rev2', {
        multiplier: Math.pow(2, 8),
        blockHasher: 'sha256d'
    }),
    lyra2rev2: {
        multiplier: Math.pow(2, 8),
        hash() {
            return function (data: Buffer, nTimeInt?: number) {
                // For lyra2rev2, we need to handle nTimeInt parameter correctly
                if (nTimeInt !== undefined) {
                    // Create a buffer with nTimeInt appended to data
                    const nTimeBuffer = Buffer.alloc(4);
                    nTimeBuffer.writeUInt32LE(nTimeInt, 0);
                    const combinedData = Buffer.concat([data, nTimeBuffer]);
                    return multiHashing.lyra2rev2(combinedData);
                } else {
                    // Fallback to original behavior if nTimeInt is not provided
                    return multiHashing.lyra2rev2(data);
                }
            };
        }
    },
    lyra2z: passthrough('lyra2z', { multiplier: Math.pow(2, 8) }),
    qubit: passthrough('qubit', { blockHasher: 'sha256d' }),
    odo: {
        blockHasher: 'sha256d',
        hash(coinConfig: any) {
            const odoKey = function (nTime: number) {
                return nTime - (nTime % coinConfig.shapechangeInterval);
            };

            return function (data: Buffer, nTime: number) {
                return multiHashing.odo(data, odoKey(nTime));
            };
        }
    },
    yescryptR8: passthrough('yespower_0_5_R8', {
        multiplier: 65536,
        diff: yescryptDiff
    }),
    yescryptR8G: passthrough('yespower_0_5_R8G', {
        multiplier: 65536,
        diff: yescryptDiff,
        blockHasher: 'sha256d'
    }),
    yescryptR16: passthrough('yespower_0_5_R16', {
        multiplier: 65536,
        diff: yescryptDiff,
        blockHasher: 'sha256d'
    }),
    yescryptR24: passthrough('yespower_0_5_R24', {
        multiplier: 65536,
        diff: yescryptDiff
    }),
    yescryptR32: passthrough('yespower_0_5_R32', {
        multiplier: 65536,
        diff: yescryptDiff
    }),
    yespower: passthrough('yespower', { multiplier: 65536 }),
    yespowerSUGAR: {
        multiplier: Math.pow(2, 16),
        blockHasher: 'sha256d',
        hash(coinConfig: any) {
            const nValue = coinConfig.nValue || 2048;
            const rValue = coinConfig.rValue || 32;
            return function (data: Buffer) {
                return multiHashing.yespower_sugar(data, nValue, rValue);
            };
        }
    },
    yespowerLTNCG: {
        multiplier: Math.pow(2, 16),
        blockHasher: 'sha256d',
        hash(coinConfig: any) {
            const nValue = coinConfig.nValue || 2048;
            const rValue = coinConfig.rValue || 32;
            return function (data: Buffer) {
                return multiHashing.yespower_ltncg(data, nValue, rValue);
            };
        }
    },
    yespowerR16: passthrough('yespower_r16', {
        multiplier: 65536,
        blockHasher: 'sha256d'
    }),
    yespowerURX: {
        multiplier: Math.pow(2, 16),
        hash(coinConfig: any) {
            const nValue = coinConfig.nValue || 2048;
            const rValue = coinConfig.rValue || 32;
            return function (data: Buffer) {
                return multiHashing.yespower_urx(data, nValue, rValue);
            };
        }
    },
    vipstar: {
        blockHasher: 'sha256d',
        hash() {
            return function (this: any, data: Buffer) {
                // VIPSTARCOIN's daemon validates PoW as standard sha256d
                // over the FULL qtum-style serialized block header — the
                // 80-byte bitcoin part PLUS hashstateroot + hashutxoroot +
                // prevoutStake + the (empty) vchBlockSig length byte (181
                // bytes total). Verified against block.GetHash() of an
                // actual daemon-produced PoW block: sha256d(headerBuffer)
                // matches the stored block hash exactly. The earlier
                // multiHashing.vipstar binding (cpuminer's sha256d_181_swap)
                // expects pre-byte-swapped cpuminer-style pdata, not the
                // canonical wire bytes serializeHeader produces, which is
                // what made every share read as shareDiff=0 before.
                return util.sha256d(data);
            };
        }
    }
});

for (const algo in algos) {
    if (!algos[algo].multiplier) algos[algo].multiplier = 1;
}

/**
 * Algorithms served by the Ethash pool rather than the Bitcoin-style one.
 * They have no coinbase, merkle tree or pool-serialized header, so they run
 * on src/ethashPool.ts with its own job model and stratum dialect.
 */
export const ETHASH_ALGORITHMS = new Set(['ethash', 'etchash']);

export function isEthashAlgorithm(algorithm: string): boolean {
    return ETHASH_ALGORITHMS.has(String(algorithm).toLowerCase());
}

/** Coinbase hasher for a coin, per its algorithm's declared policy. */
export function getCoinbaseHasher(coin: any): (data: Buffer) => Buffer {
    if (algos[coin.algorithm]?.coinbaseHasher === 'normalHashing') {
        return coin.normalHashing === true ? util.sha256d : util.sha256;
    }
    return util.sha256d;
}

/**
 * Block-identifier hasher for a coin, per its algorithm's declared policy.
 * `hashDigest` is the algorithm's PoW hasher (`algos[algo].hash(coin)`).
 */
export function getBlockHasher(
    coin: any,
    hashDigest: (...args: any[]) => Buffer
): (...args: any[]) => Buffer {
    const sha256dHasher = function (this: any, ...args: any[]) {
        return util.reverseBuffer((util.sha256d as any).apply(this, args));
    };
    const digestHasher = function (this: any, ...args: any[]) {
        return util.reverseBuffer(hashDigest.apply(this, args));
    };

    switch (algos[coin.algorithm]?.blockHasher) {
        case 'sha256d':
            return sha256dHasher;
        case 'posDigest':
            return coin.reward === 'POS' ? digestHasher : sha256dHasher;
        default:
            return digestHasher;
    }
}

export { diff1 };
export default algos;
