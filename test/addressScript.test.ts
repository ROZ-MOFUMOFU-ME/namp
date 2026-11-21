import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

import * as util from '../src/util.ts';

/*
 * Address -> output script: the bytes every coinbase pays the pool with.
 *
 * The expected scripts are rebuilt here from an independent Base58Check and
 * Bech32/Bech32m decode, so an update of bitcoinjs-lib or of the Zcash fork
 * that changed what an address decodes to fails in this file instead of
 * paying block rewards to a script nobody controls.
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58Check payload (version bytes + hash), checksum verified. */
function base58CheckDecode(address: string): Buffer {
    let n = 0n;
    for (const ch of address) {
        const digit = B58.indexOf(ch);
        assert.notEqual(digit, -1, `not base58: ${ch}`);
        n = n * 58n + BigInt(digit);
    }
    let hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const zeros = address.length - address.replace(/^1+/, '').length;
    const raw = Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, 'hex')]);
    const payload = raw.subarray(0, -4);
    const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest();
    assert.deepEqual(
        sha(sha(payload)).subarray(0, 4),
        raw.subarray(-4),
        `bad checksum in ${address}`
    );
    return payload;
}

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Segwit address -> { hrp, version, program }, BIP 173 / BIP 350. */
function segwitDecode(address: string) {
    const lower = address.toLowerCase();
    const pos = lower.lastIndexOf('1');
    const hrp = lower.slice(0, pos);
    const data = [...lower.slice(pos + 1)].map((c) => BECH32.indexOf(c));
    assert.ok(
        data.every((d) => d !== -1),
        `not bech32: ${address}`
    );
    const polymod = (values: number[]) => {
        const gen = [
            0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3
        ];
        let chk = 1;
        for (const v of values) {
            const top = chk >>> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i];
        }
        return chk >>> 0;
    };
    const expanded = [
        ...[...hrp].map((c) => c.charCodeAt(0) >>> 5),
        0,
        ...[...hrp].map((c) => c.charCodeAt(0) & 31)
    ];
    const version = data[0];
    assert.equal(
        polymod([...expanded, ...data]),
        version === 0 ? 1 : 0x2bc830a3,
        `bad checksum in ${address}`
    );
    // 5-bit groups -> bytes
    let acc = 0;
    let bits = 0;
    const program: number[] = [];
    for (const value of data.slice(1, -6)) {
        acc = (acc << 5) | value;
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            program.push((acc >>> bits) & 0xff);
        }
    }
    return { hrp, version, program: Buffer.from(program) };
}

const p2pkh = (hash: Buffer) =>
    Buffer.concat([
        Buffer.from('76a914', 'hex'),
        hash,
        Buffer.from('88ac', 'hex')
    ]);
const p2sh = (hash: Buffer) =>
    Buffer.concat([Buffer.from('a914', 'hex'), hash, Buffer.from('87', 'hex')]);
const witness = (version: number, program: Buffer) =>
    Buffer.concat([
        Buffer.from([version === 0 ? 0 : 0x50 + version, program.length]),
        program
    ]);

/** A coin definition's address block the way init.ts hands it to the pool. */
function networkOf(file: string, key: 'mainnet' | 'testnet') {
    const params = JSON.parse(fs.readFileSync(file, 'utf8'))[key];
    return {
        ...params,
        bip32: {
            public: Buffer.from(params.bip32.public, 'hex').readUInt32LE(0)
        },
        pubKeyHash: Buffer.from(params.pubKeyHash, 'hex').readUInt8(0),
        scriptHash: Buffer.from(params.scriptHash, 'hex').readUInt8(0)
    };
}

const BITCOIN = networkOf('coins/coins-examples/bitcoin.json', 'mainnet');
const TESTNET = networkOf(
    'coins/coins-examples-testnet/bitcoin.json',
    'testnet'
);

test('Base58 addresses: P2PKH and P2SH scripts', () => {
    // The genesis block's address: its hash160 is a constant of Bitcoin lore.
    const genesis = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    assert.equal(
        base58CheckDecode(genesis).subarray(1).toString('hex'),
        '62e907b15cbf27d5425399ebf6f0fb50ebb88f18'
    );
    for (const [address, network, build] of [
        [genesis, BITCOIN, p2pkh],
        ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', BITCOIN, p2sh],
        ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', TESTNET, p2pkh],
        ['2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', TESTNET, p2sh]
    ] as const) {
        const payload = base58CheckDecode(address);
        assert.deepEqual(
            util.addressToScript(network, address),
            build(payload.subarray(1)),
            address
        );
    }
    // Without network parameters the pool falls back to a bare P2PKH script.
    assert.deepEqual(
        util.addressToScript(undefined, genesis),
        p2pkh(base58CheckDecode(genesis).subarray(1))
    );
    // An address of the wrong network is refused, not silently converted.
    assert.throws(() => util.addressToScript(TESTNET, genesis));
});

test('Segwit addresses: v0 key hash, v0 script hash and v1 taproot', () => {
    for (const [address, network] of [
        // BIP 173 and BIP 350 test vectors
        ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BITCOIN],
        [
            'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
            BITCOIN
        ],
        [
            'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
            BITCOIN
        ],
        ['tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', TESTNET],
        [
            'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
            TESTNET
        ]
    ] as const) {
        const decoded = segwitDecode(address);
        assert.equal(decoded.hrp, network.bech32);
        assert.deepEqual(
            util.addressToScript(network, address),
            witness(decoded.version, decoded.program),
            address
        );
    }
    assert.throws(() =>
        util.addressToScript(
            TESTNET,
            'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
        )
    );
});

test('Koto addresses decode through the Zcash library (two-byte version)', () => {
    const require = createRequire(import.meta.url);
    const zcash = require('@exodus/bitcoinjs-lib-zcash');
    const lib = zcash.default ?? zcash;
    for (const address of [
        'k1FTuimwDJ8oo3x23cEBLxovxw5Cqq2U1HK', // transparent key hash
        'k3EEgqMM8jpaGW6XXUHpv3kDprMfm1x1VEf' // script hash (the founders' address)
    ]) {
        const payload = base58CheckDecode(address);
        assert.equal(payload.length, 22, 'two version bytes + hash160');
        const decoded = lib.address.fromBase58Check(address);
        assert.equal(decoded.version, payload.readUInt16BE(0), address);
        assert.deepEqual(
            Buffer.from(decoded.hash),
            payload.subarray(2),
            address
        );
    }
    const pool = 'k1FTuimwDJ8oo3x23cEBLxovxw5Cqq2U1HK';
    assert.deepEqual(
        util.kotoAddressToScript(pool),
        p2pkh(base58CheckDecode(pool).subarray(2)),
        'the pool and reward-recipient script for a Koto address'
    );
});
