import test from 'node:test';
import assert from 'node:assert';

import BlockTemplate from '../src/blockTemplate.ts';
import * as util from '../src/util.ts';

/*
 * Block serialization tests: the bytes the daemon ultimately validates.
 *
 * serializeHeader builds the header back-to-front and reverses the whole
 * buffer at the end, so a field-order mistake is invisible in review but makes
 * every block rejected. These tests pin the wire layout of both header shapes
 * the pool produces (80-byte bitcoin, 181-byte qtum/VIPSTARCOIN) and the block
 * envelope around them.
 */

const POOL_SCRIPT = Buffer.alloc(25, 0x11);
const EXTRANONCE_PLACEHOLDER = Buffer.from('f000000ff111111f', 'hex');

const PREVHASH = '11'.repeat(32);
const MERKLE_ROOT = '22'.repeat(32);
const BITS = '1e0fffff';
const NTIME = '5f5e1000';
const NONCE = 'deadbeef';
const STATEROOT = '33'.repeat(32);
const UTXOROOT = '44'.repeat(32);

// What closes a qtum-style header, in wire order: a null prevoutStake
// outpoint (32-byte zero hash + 0xffffffff index) and the empty vchBlockSig
// length byte. serializeHeader writes a 35-byte literal into this 37-byte
// field and lets the allocation zero the rest.
const QTUM_TAIL = '00'.repeat(32) + 'ffffffff' + '00';

function makeTemplate(rpcOverrides: any = {}, reward?: string, recipients: any[] = []) {
    return new (BlockTemplate as any)(
        '1',
        {
            bits: BITS,
            previousblockhash: PREVHASH,
            height: 500,
            coinbasevalue: 5000000000,
            curtime: 1000,
            version: 4,
            transactions: [],
            ...rpcOverrides,
        },
        POOL_SCRIPT,
        EXTRANONCE_PLACEHOLDER,
        reward,
        undefined,
        recipients,
        undefined
    );
}

/** Reverse a hex string's bytes, the transform serializeHeader applies. */
const rev = (hex: string) => util.reverseHex(hex);

test('serializes a standard 80-byte header in wire order', () => {
    const header = makeTemplate().serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);

    assert.strictEqual(header.length, 80);
    const hex = header.toString('hex');

    // version (LE) | prevhash | merkle root | nTime | bits | nonce
    assert.strictEqual(hex.slice(0, 8), '04000000', 'version must be little-endian');
    assert.strictEqual(hex.slice(8, 72), rev(PREVHASH));
    assert.strictEqual(hex.slice(72, 136), rev(MERKLE_ROOT));
    assert.strictEqual(hex.slice(136, 144), rev(NTIME));
    assert.strictEqual(hex.slice(144, 152), rev(BITS));
    assert.strictEqual(hex.slice(152, 160), rev(NONCE));
});

test('applies a version mask only to the version-rolling bits', () => {
    const template = makeTemplate({ version: 0x20000000 });

    const plain = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);
    assert.strictEqual(plain.readUInt32LE(0), 0x20000000);

    // BIP310: miners may roll only the bits inside 0x1fffe000.
    const rolled = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, 0xffffffff);
    assert.strictEqual(rolled.readUInt32LE(0), 0x20000000 | 0x1fffe000);

    // Bits outside the mask are ignored, so the base version survives.
    const outside = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, 0xe0001fff);
    assert.strictEqual(outside.readUInt32LE(0), 0x20000000);
});

test('serializes the 181-byte qtum header as bitcoin header + roots', () => {
    // VIPSTARCOIN / HTMLcoin: the daemon hashes the full 181-byte header, so the
    // 80-byte prefix must stay byte-identical to the bitcoin layout and the
    // roots must follow it in canonical little-endian.
    const template = makeTemplate({
        hashstateroot: STATEROOT,
        hashutxoroot: UTXOROOT,
    });
    const header = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);

    assert.strictEqual(header.length, 181);
    const hex = header.toString('hex');

    // The first 80 bytes are exactly the standard header.
    const standard = makeTemplate()
        .serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined)
        .toString('hex');
    assert.strictEqual(hex.slice(0, 160), standard, 'qtum header must extend the 80-byte header');

    assert.strictEqual(hex.slice(160, 224), rev(STATEROOT), 'hashStateRoot follows the header');
    assert.strictEqual(hex.slice(224, 288), rev(UTXOROOT), 'hashUTXORoot follows the state root');
    assert.strictEqual(
        hex.slice(288),
        QTUM_TAIL,
        'null prevoutStake + empty block signature close the header'
    );
});

test('sends the notify roots word-swapped so miners rebuild the header', () => {
    // ccminer runs le32dec over each root, i.e. byteswaps every uint32 word.
    // The pool therefore ships the words in reverse order; applying the miner's
    // per-word swap to what we send must yield the canonical header bytes.
    const template = makeTemplate({ hashstateroot: STATEROOT, hashutxoroot: UTXOROOT });

    const minerSwap = (hex: string) => {
        const b = Buffer.from(hex, 'hex');
        const out = Buffer.alloc(b.length);
        for (let i = 0; i + 4 <= b.length; i += 4) {
            b.subarray(i, i + 4).copy(out, b.length - 4 - i);
        }
        return out.toString('hex');
    };

    assert.strictEqual(minerSwap(template.hashstaterootReversed), STATEROOT);
    assert.strictEqual(minerSwap(template.hashutxorootReversed), UTXOROOT);
});

test('serializes a 112-byte Sapling header with the final root first', () => {
    const template = makeTemplate({ version: 5, finalsaplingroothash: '55'.repeat(32) });
    const header = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);

    assert.strictEqual(header.length, 112);
    // The reversal puts the sapling root last, after the 80-byte header.
    assert.strictEqual(header.toString('hex').slice(160), rev('55'.repeat(32)));
});

test('wraps the block as header, tx count, coinbase, then transactions', () => {
    const txData = 'abcdef0123456789';
    const template = makeTemplate({
        transactions: [{ data: txData, txid: 'aa'.repeat(32) }],
    });
    const header = template.serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);
    const coinbase = template.serializeCoinbase(
        Buffer.from('00000000', 'hex'),
        Buffer.from('00000000', 'hex')
    );

    const block = template.serializeBlock(header, coinbase).toString('hex');

    assert.strictEqual(
        block,
        header.toString('hex') +
            '02' + // varint: coinbase + 1 transaction
            coinbase.toString('hex') +
            txData,
        'block must be header || txcount || coinbase || transactions'
    );
});

test('appends the POS marker byte only for POS coins', () => {
    const header = makeTemplate().serializeHeader(MERKLE_ROOT, NTIME, NONCE, undefined);
    const coinbase = Buffer.from('00', 'hex');

    const pow = makeTemplate().serializeBlock(header, coinbase);
    const pos = makeTemplate({}, 'POS').serializeBlock(header, coinbase);

    assert.strictEqual(pos.length, pow.length + 1);
    assert.strictEqual(pos[pos.length - 1], 0);
});

test('the coinbase pays the pool and each reward recipient', () => {
    const feeScript = Buffer.alloc(25, 0x22);
    const coinbasevalue = 5000000000;
    const template = makeTemplate({ coinbasevalue }, undefined, [
        { percent: 0.01, script: feeScript },
    ]);

    const coinbase = template.serializeCoinbase(
        Buffer.from('00000000', 'hex'),
        Buffer.from('00000000', 'hex')
    );

    // The fee recipient's output: value (int64 LE) followed by its script.
    const feeReward = Math.floor(0.01 * coinbasevalue);
    const feeOutput = Buffer.concat([
        util.packInt64LE(feeReward),
        util.varIntBuffer(feeScript.length),
        feeScript,
    ]);
    assert.ok(coinbase.includes(feeOutput), 'recipient output missing from the coinbase');

    // The pool keeps the remainder.
    const poolOutput = Buffer.concat([
        util.packInt64LE(coinbasevalue - feeReward),
        util.varIntBuffer(POOL_SCRIPT.length),
        POOL_SCRIPT,
    ]);
    assert.ok(coinbase.includes(poolOutput), 'pool output missing or misvalued');

    // The extranonces sit between the two halves of the generation transaction.
    assert.ok(
        coinbase.includes(Buffer.from('0000000000000000', 'hex')),
        'extranonce bytes must be spliced into the coinbase'
    );
});
