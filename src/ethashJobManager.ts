import events from 'events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const multiHashing = require('../native/index.cjs');

/*
 * Ethash job manager (Ethereum / Ethereum Classic / VirBiCoin family).
 *
 * Ethash work has nothing in common with the Bitcoin-style pipeline: there is
 * no coinbase to build, no merkle tree and no header for the pool to
 * serialize. The daemon hands out a sealed header hash and the miner returns
 * the nonce and the mix it derived from the DAG:
 *
 *   eth_getWork    -> [headerHash, seedHash, boundary, blockNumber]
 *   eth_submitWork <- [nonce, headerHash, mixHash]
 *
 * So this lives beside jobManager rather than inside it. Share checking is
 * two-tier, mirroring the native exports: every share gets the keccak-only
 * check against the miner's boundary, and only a block candidate pays for the
 * cache-backed check that proves the mix really came from the DAG.
 */

/** Ethash epoch length; Etchash (ECIP-1099) halves the DAG growth by doubling it. */
export const DEFAULT_EPOCH_LENGTH = 30000;
export const ETCHASH_EPOCH_LENGTH = 60000;

const MAX_TARGET = (1n << 256n) - 1n;

export interface EthashWork {
    headerHash: string;
    seedHash: string;
    /** Network boundary as returned by eth_getWork (32-byte hex). */
    boundary: string;
    height: number;
}

const strip = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);

/** 32-byte buffer from a hex string of any accepted width. */
function hash256(hex: string, name: string): Buffer {
    const clean = strip(hex);
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length > 64) {
        throw new Error(`${name} is not a 32-byte hex value`);
    }
    return Buffer.from(clean.padStart(64, '0'), 'hex');
}

/** 8-byte little-endian nonce buffer, as the ethash library expects it. */
function nonceBuffer(nonceHex: string): Buffer {
    const clean = strip(nonceHex);
    if (!/^[0-9a-fA-F]{1,16}$/.test(clean)) {
        throw new Error('nonce is not a hex value of at most 8 bytes');
    }
    // eth_getWork nonces are big-endian hex; the verifier reads a uint64 LE.
    return Buffer.from(clean.padStart(16, '0'), 'hex').reverse();
}

/** Boundary for a share difficulty, the way every ethash pool derives it. */
export function boundaryForDifficulty(difficulty: number): Buffer {
    if (!(difficulty > 0)) throw new Error('difficulty must be positive');
    // Scale so fractional difficulties survive the integer division, and clamp:
    // a difficulty below 1 would otherwise produce a target wider than the
    // 256-bit space, and truncating that to 32 bytes yields a *tighter*
    // boundary — silently rejecting the easy shares it was meant to accept.
    const SCALE = 1000000n;
    const scaled = BigInt(Math.round(difficulty * Number(SCALE)));
    // Below the scale's resolution the boundary is the whole space anyway —
    // and dividing by the rounded-down zero would throw.
    if (scaled <= 0n) return Buffer.alloc(32, 0xff);
    const target = (MAX_TARGET * SCALE) / scaled;
    const clamped = target > MAX_TARGET ? MAX_TARGET : target;
    return Buffer.from(clamped.toString(16).padStart(64, '0'), 'hex');
}

/**
 * Which Ethash exports the loaded native addon is missing. Non-empty means
 * the addon was built from older sources than this code — the operator needs
 * `npm run rebuild:native` (a plain `git pull` does not rebuild it).
 */
export function missingEthashNativeExports(): string[] {
    return ['ethash_verify_final', 'ethash_verify'].filter(
        (name) => typeof (multiHashing as any)[name] !== 'function'
    );
}

export function epochOf(
    height: number,
    epochLength = DEFAULT_EPOCH_LENGTH
): number {
    return Math.floor(height / epochLength);
}

/**
 * Tracks the daemon's current work and validates submissions against it.
 * Emits 'newWork' when the daemon moves to a new header.
 */
const EthashJobManager = function EthashJobManager(
    this: any,
    options: any = {}
) {
    const _this = this;
    const epochLength = options.epochLength || DEFAULT_EPOCH_LENGTH;
    // geth regenerates the sealing work on every pending-block reassembly
    // (new transactions, recommit ticks), not only on new blocks — several
    // times per block. A share computed on the previous header is still a
    // perfectly good solution for it, and geth's remote sealer keeps recent
    // works and accepts solutions for any of them. Keeping only the newest
    // work here rejected every submission that crossed a rotation — including
    // block solutions, which is fatal for a pool. So recent works stay
    // acceptable, each with its own duplicate ledger.
    const maxWorkWindow = options.maxWorkWindow || 8;
    const works = new Map<string, EthashWork & { submissions: Set<string> }>();

    this.currentWork = null as EthashWork | null;

    /** Feed a raw eth_getWork response; returns true when the work is new. */
    this.processWork = function (result: any[]): boolean {
        if (!Array.isArray(result) || result.length < 3) {
            _this.emit(
                'log',
                'error',
                'eth_getWork returned an unusable response'
            );
            return false;
        }
        const [headerHash, seedHash, boundary, blockNumber] = result;
        const height =
            blockNumber === undefined ? 0 : Number(BigInt(blockNumber));

        if (works.has(headerHash)) return false;

        const work = {
            headerHash,
            seedHash,
            boundary,
            height,
            submissions: new Set<string>()
        };
        works.set(headerHash, work);
        while (works.size > maxWorkWindow) {
            const oldest = works.keys().next().value as string;
            works.delete(oldest);
        }
        _this.currentWork = work;
        _this.emit('newWork', work);
        return true;
    };

    this.epoch = function (): number {
        return _this.currentWork
            ? epochOf(_this.currentWork.height, epochLength)
            : 0;
    };

    /**
     * Validate a miner submission.
     *
     * Returns { error } on rejection, or { valid: true, isBlockCandidate } —
     * the caller submits candidates with eth_submitWork.
     */
    this.processShare = function (share: {
        headerHash: string;
        nonce: string;
        mixHash: string;
        difficulty: number;
        worker?: string;
    }) {
        if (!_this.currentWork) return { error: [21, 'no work available'] };
        // Any work still in the window is valid to solve; the daemon is the
        // final judge for candidates on the older ones.
        const work = works.get(share.headerHash);
        if (!work) {
            return { error: [21, 'job not found'] };
        }
        const isStale = work !== _this.currentWork;

        let header: Buffer;
        let mix: Buffer;
        let nonce: Buffer;
        try {
            header = hash256(share.headerHash, 'header hash');
            mix = hash256(share.mixHash, 'mix hash');
            nonce = nonceBuffer(share.nonce);
        } catch (e: any) {
            return { error: [20, e.message] };
        }

        const key = `${share.nonce}:${share.mixHash}`;
        if (work.submissions.has(key))
            return { error: [22, 'duplicate share'] };
        work.submissions.add(key);

        const shareBoundary = boundaryForDifficulty(share.difficulty);
        if (
            !multiHashing.ethash_verify_final(header, mix, nonce, shareBoundary)
        ) {
            return { error: [23, 'low difficulty share'] };
        }

        // The difficulty this share actually achieved (2^256 / final hash):
        // what operators read next to the port difficulty in the share log.
        // Optional on purpose: an addon built before this export exists must
        // degrade the display, not crash the fork on the first share.
        let shareDiff: number | undefined;
        if (typeof multiHashing.ethash_final_hash === 'function') {
            const finalHash: Buffer = multiHashing.ethash_final_hash(
                header,
                mix,
                nonce
            );
            const finalValue = BigInt('0x' + finalHash.toString('hex'));
            shareDiff =
                finalValue > 0n
                    ? Number((MAX_TARGET * 1000n) / finalValue) / 1000
                    : Infinity;
        }

        const networkBoundary = hash256(work.boundary, 'network boundary');
        const isBlockCandidate = multiHashing.ethash_verify_final(
            header,
            mix,
            nonce,
            networkBoundary
        );

        if (isBlockCandidate) {
            // Only a candidate is worth the epoch cache: this is the check that
            // proves the mix came from the DAG rather than being invented.
            const proven = multiHashing.ethash_verify(
                header,
                mix,
                nonce,
                networkBoundary,
                work.height
            );
            if (!proven)
                return { error: [23, 'mix hash does not match the DAG'] };
        }

        _this.emit('share', {
            worker: share.worker,
            height: work.height,
            headerHash: work.headerHash,
            nonce: share.nonce,
            mixHash: share.mixHash,
            difficulty: share.difficulty,
            shareDiff,
            isStale,
            isBlockCandidate
        });

        return { valid: true, isBlockCandidate, isStale, shareDiff, work };
    };
};

Object.setPrototypeOf(
    EthashJobManager.prototype,
    events.EventEmitter.prototype
);

export default EthashJobManager;
