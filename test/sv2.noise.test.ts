import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import * as noise from '../src/sv2/noise.ts';
import * as codec from '../src/sv2/codec.ts';
import { generateAuthorityKeyPair } from '../src/sv2/keys.ts';

/*
 * The Noise NX handshake and the encrypted framing, both roles in JS: the
 * pool's Responder against the test Initiator. Interoperability with the
 * reference implementation is exercised separately (test/sv2.test.ts drives
 * the SRI mining device when it is available).
 */

const authority = generateAuthorityKeyPair();

function handshake(validity = 3600, now = Math.floor(Date.now() / 1000)) {
    const responder = new noise.Responder(authority, validity);
    const initiator = new noise.Initiator();
    const m1 = initiator.start();
    assert.equal(m1.length, noise.HANDSHAKE_MESSAGE_1_LEN);
    const { message2, transport: pool } = responder.respond(m1, now);
    assert.equal(message2.length, noise.HANDSHAKE_MESSAGE_2_LEN);
    const miner = initiator.finish(message2, authority.publicKey, now);
    return { pool, miner };
}

test('handshake: both sides derive the same transport keys', () => {
    const { pool, miner } = handshake();
    for (let i = 0; i < 5; i++) {
        const plain = crypto.randomBytes(100 + i);
        const ct = pool.encryptor.encryptWithAd(Buffer.alloc(0), plain);
        assert.equal(ct.length, plain.length + 16);
        assert.deepEqual(
            miner.decryptor.decryptWithAd(Buffer.alloc(0), ct),
            plain
        );
        const back = miner.encryptor.encryptWithAd(Buffer.alloc(0), plain);
        assert.deepEqual(
            pool.decryptor.decryptWithAd(Buffer.alloc(0), back),
            plain
        );
    }
});

test('handshake: the certificate binds the authority key and its validity window', () => {
    const other = generateAuthorityKeyPair();
    const responder = new noise.Responder(authority, 60);
    const now = 1_800_000_000;

    let initiator = new noise.Initiator();
    let m2 = responder.respond(initiator.start(), now).message2;
    assert.throws(
        () => initiator.finish(m2, other.publicKey, now),
        /certificate/
    );

    initiator = new noise.Initiator();
    m2 = responder.respond(initiator.start(), now).message2;
    assert.throws(
        () => initiator.finish(m2, authority.publicKey, now + 60 + 11),
        /certificate/
    );

    initiator = new noise.Initiator();
    m2 = responder.respond(initiator.start(), now).message2;
    assert.ok(initiator.finish(m2, authority.publicKey, now + 60 + 9)); // inside the leeway

    initiator = new noise.Initiator();
    m2 = responder.respond(initiator.start(), now).message2;
    m2[100] ^= 0x01; // the encrypted static key
    assert.throws(() => initiator.finish(m2, authority.publicKey, now));
});

test('frames: header and payload chunks round-trip, including multi-chunk payloads', () => {
    const { pool, miner } = handshake();
    const sizes = [
        0,
        1,
        100,
        noise.MAX_PLAINTEXT_CHUNK,
        noise.MAX_PLAINTEXT_CHUNK + 1,
        150_000
    ];
    const decryptor = new noise.FrameDecryptor(miner.decryptor);
    let stream = Buffer.alloc(0);
    const frames: Buffer[] = [];
    for (const size of sizes) {
        const frame = codec.buildFrame(0x15, true, crypto.randomBytes(size));
        frames.push(frame);
        const encrypted = noise.encryptFrame(pool.encryptor, frame);
        assert.equal(
            encrypted.length,
            noise.ENCRYPTED_FRAME_HEADER_LEN +
                noise.encryptedPayloadLength(size)
        );
        stream = Buffer.concat([stream, encrypted]);
    }
    // deliver the stream in awkward pieces
    const received: Buffer[] = [];
    for (let i = 0; i < stream.length; i += 1000)
        received.push(...decryptor.push(stream.subarray(i, i + 1000)));
    assert.equal(received.length, frames.length);
    frames.forEach((f, i) => assert.deepEqual(received[i], f));
});

test('frames: a tampered byte is rejected', () => {
    const { pool, miner } = handshake();
    const encrypted = noise.encryptFrame(
        pool.encryptor,
        codec.buildFrame(0x01, false, Buffer.from('hello'))
    );
    encrypted[encrypted.length - 1] ^= 0x80;
    assert.throws(() =>
        new noise.FrameDecryptor(miner.decryptor).push(encrypted)
    );
});

test('codec: every message encodes and decodes to itself', () => {
    const samples: Record<codec.MessageName, Record<string, any>> = {
        SetupConnection: {
            protocol: 0,
            minVersion: 2,
            maxVersion: 2,
            flags: 5,
            endpointHost: 'pool.example.com',
            endpointPort: 3336,
            vendor: 'NAMP',
            hardwareVersion: 'v1',
            firmware: 'f1',
            deviceId: 'rig-1'
        },
        SetupConnectionSuccess: { usedVersion: 2, flags: 0 },
        SetupConnectionError: {
            flags: 2,
            errorCode: 'unsupported-feature-flags'
        },
        ChannelEndpointChanged: { channelId: 7 },
        Reconnect: { newHost: 'other.example.com', newPort: 3336 },
        OpenStandardMiningChannel: {
            requestId: 1,
            userIdentity: 'bc1q.rig',
            nominalHashRate: Math.fround(1.5e12),
            maxTarget: Buffer.alloc(32, 0xff)
        },
        OpenStandardMiningChannelSuccess: {
            requestId: 1,
            channelId: 2,
            target: Buffer.alloc(32, 1),
            extranoncePrefix: Buffer.from('0102030405060708', 'hex'),
            groupChannelId: 0
        },
        OpenMiningChannelError: { requestId: 1, errorCode: 'unknown-user' },
        OpenExtendedMiningChannel: {
            requestId: 3,
            userIdentity: 'u',
            nominalHashRate: 0,
            maxTarget: Buffer.alloc(32, 0xff),
            minExtranonceSize: 8
        },
        OpenExtendedMiningChannelSuccess: {
            requestId: 3,
            channelId: 4,
            target: Buffer.alloc(32, 2),
            extranonceSize: 8,
            extranoncePrefix: Buffer.alloc(4, 9),
            groupChannelId: 0
        },
        NewMiningJob: {
            channelId: 2,
            jobId: 10,
            ntimeStart: null,
            version: 0x20000000,
            merkleRoot: crypto.randomBytes(32)
        },
        UpdateChannel: {
            channelId: 2,
            nominalHashRate: Math.fround(2e12),
            maxTarget: Buffer.alloc(32, 0xfe)
        },
        UpdateChannelError: {
            channelId: 2,
            errorCode: 'max-target-out-of-range'
        },
        CloseChannel: { channelId: 2, reasonCode: 'bye' },
        SetExtranoncePrefix: {
            channelId: 2,
            extranoncePrefix: Buffer.alloc(8, 3)
        },
        SubmitSharesStandard: {
            channelId: 2,
            sequenceNumber: 9,
            jobId: 10,
            nonce: 0xdeadbeef,
            ntime: 1700000000,
            version: 0x20000000
        },
        SubmitSharesExtended: {
            channelId: 4,
            sequenceNumber: 1,
            jobId: 11,
            nonce: 1,
            ntime: 1700000001,
            version: 0x20002000,
            extranonce: Buffer.alloc(8, 5)
        },
        SubmitSharesSuccess: {
            channelId: 2,
            lastSequenceNumber: 9,
            newSubmitsAcceptedCount: 1,
            newSharesSum: 262144n
        },
        SubmitSharesError: {
            channelId: 2,
            sequenceNumber: 9,
            errorCode: 'difficulty-too-low'
        },
        NewExtendedMiningJob: {
            channelId: 4,
            jobId: 11,
            ntimeStart: 1700000000,
            version: 0x20000000,
            versionRollingAllowed: true,
            merklePath: [crypto.randomBytes(32), crypto.randomBytes(32)],
            coinbaseTxPrefix: crypto.randomBytes(60),
            coinbaseTxSuffix: crypto.randomBytes(90)
        },
        SetNewPrevHash: {
            channelId: 2,
            jobId: 10,
            prevHash: crypto.randomBytes(32),
            ntimeStart: 1700000000,
            nbits: 0x1d00ffff
        },
        SetTarget: { channelId: 2, target: Buffer.alloc(32, 0x7f) },
        SetCustomMiningJob: { channelId: 4, requestId: 1 },
        SetGroupChannel: { groupChannelId: 100, channelIds: [2, 4] }
    };
    for (const name of Object.keys(samples) as codec.MessageName[]) {
        const frame = codec.encodeMessage(name, samples[name]);
        const parsed = codec.parseFrame(frame);
        assert.equal(parsed.msgType, codec.MESSAGES[name].type, name);
        assert.equal(parsed.channelMsg, codec.MESSAGES[name].channelMsg, name);
        const decoded = codec.decodeMessage(parsed);
        assert.ok(decoded && decoded.name === name, name);
        assert.deepEqual(decoded.body, samples[name], name);
        if (codec.MESSAGES[name].channelMsg)
            assert.equal(codec.channelIdOf(parsed), samples[name].channelId);
    }
    // the first ChannelEndpointChanged bytes, by hand: ext 0x8000 LE, type 3, len 4, channel 7
    assert.equal(
        codec
            .encodeMessage('ChannelEndpointChanged', { channelId: 7 })
            .toString('hex'),
        '0080' + '03' + '040000' + '07000000'
    );
});
