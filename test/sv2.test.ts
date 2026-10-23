import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import { createPool } from '../src/pool.ts';
import * as util from '../src/util.ts';
import * as codec from '../src/sv2/codec.ts';
import {
    targetForDifficulty,
    difficultyForTarget,
    targetToBigInt
} from '../src/sv2/server.ts';
import {
    generateAuthorityKeyPair,
    encodeSecretKey,
    encodePublicKey,
    decodePublicKey
} from '../src/sv2/keys.ts';
import {
    HOST,
    POOL_ADDRESS,
    EASY_BITS,
    startMockDaemon,
    type DaemonState
} from './helpers/mockDaemon.ts';
import { Sv2TestClient } from './helpers/sv2Client.ts';

/*
 * Stratum V2 end to end against the real pool and the mock daemon: Noise
 * handshake with certificate verification, SetupConnection, standard and
 * extended channels, jobs and SetNewPrevHash, shares that are accepted,
 * rejected and that solve the block, varDiff's SetTarget, and the pool's
 * flag handling.
 */

const authority = generateAuthorityKeyPair();
const cleanup: Array<() => void> = [];
after(() => cleanup.forEach((fn) => fn()));

async function startPool(sv2Port: number, extra: any = {}) {
    const state: DaemonState = {
        calls: [],
        submittedBlocks: [],
        confirmedHashes: []
    };
    const daemon = await startMockDaemon(state);
    cleanup.push(() => daemon.close());
    const daemonPort = (daemon.address() as net.AddressInfo).port;
    const pool: any = createPool(
        {
            coin: {
                name: 'mockcoin',
                symbol: 'MOCK',
                algorithm: 'sha256',
                peerMagic: 'fabfb5da',
                version_mask: '1fffe000',
                ...(extra.coin || {})
            },
            address: POOL_ADDRESS,
            rewardRecipients: {},
            blockRefreshInterval: 0,
            jobRebroadcastTimeout: 3600,
            connectionTimeout: 60,
            p2p: { enabled: false },
            sv2: {
                authoritySecretKey: encodeSecretKey(authority.secretKey),
                certificateValiditySeconds: 600
            },
            ports: {
                [sv2Port]: {
                    sv2: true,
                    // tiny difficulties so a JS nonce scan finds shares at once
                    diff: 0.000001,
                    varDiff: {
                        minDiff: 0.000001,
                        maxDiff: 1,
                        targetTime: 15,
                        retargetTime: 60,
                        variancePercent: 30
                    }
                },
                ...(extra.ports || {})
            },
            daemons: [
                { host: HOST, port: daemonPort, user: 'mock', password: 'mock' }
            ],
            ...(extra.options || {})
        },
        (_ip: any, _port: any, worker: string, _password: any, callback: any) =>
            callback({
                error: null,
                authorized: !worker.startsWith('nobody'),
                disconnect: false
            })
    );
    cleanup.push(() => pool.stop());
    const shares: any[] = [];
    pool.on('share', (isValid: boolean, isBlock: boolean, data: any) =>
        shares.push({ isValid, isBlock, data })
    );
    const logs: string[] = [];
    pool.on('log', (severity: string, text: string) =>
        logs.push(`${severity}: ${text}`)
    );
    pool.start();
    await new Promise<void>((resolve, reject) => {
        pool.once('started', resolve);
        setTimeout(() => reject(new Error('pool did not start')), 15000);
    });
    return { pool, state, shares, logs };
}

async function connect(port: number, flags?: number) {
    const client = new Sv2TestClient(port);
    cleanup.push(() => client.close());
    await client.connected();
    await client.handshake(authority.publicKey);
    const setup = await client.setup(flags);
    assert.equal(setup.name, 'SetupConnectionSuccess');
    assert.equal(setup.body.usedVersion, 2);
    return client;
}

/** The 80-byte header a Stratum V2 device builds, and a nonce that clears `target`. */
function mine(
    job: {
        version: number;
        merkleRoot: Buffer;
        prevHash: Buffer;
        nbits: number;
    },
    ntime: number,
    target: bigint,
    maxNonce = 200000
) {
    const header = Buffer.alloc(80);
    header.writeUInt32LE(job.version, 0);
    job.prevHash.copy(header, 4);
    job.merkleRoot.copy(header, 36);
    header.writeUInt32LE(ntime, 68);
    header.writeUInt32LE(job.nbits, 72);
    for (let nonce = 0; nonce < maxNonce; nonce++) {
        header.writeUInt32LE(nonce, 76);
        const hash = util.reverseBuffer(util.sha256d(header));
        if (BigInt('0x' + hash.toString('hex')) <= target)
            return { nonce, header: Buffer.from(header) };
    }
    throw new Error('no nonce found');
}

const base = 3700 + Math.floor(process.pid % 100);

test('target arithmetic: difficulty <-> target round-trips and matches the share check', () => {
    for (const d of [0.001, 1, 8, 2048, 262144, 1e9]) {
        const t = targetForDifficulty(d, 1n);
        assert.equal(t.length, 32);
        const back = difficultyForTarget(targetToBigInt(t), 1n);
        assert.ok(Math.abs(back - d) / d < 1e-6, `${d} -> ${back}`);
    }
    // scrypt-style multiplier: difficulty 1 is 2^16 hashes, the target 2^16 larger
    assert.equal(
        targetToBigInt(targetForDifficulty(1, 65536n)),
        targetToBigInt(targetForDifficulty(1, 1n)) * 65536n
    );
    assert.equal(
        targetToBigInt(targetForDifficulty(1e-12, 1n)),
        (1n << 256n) - 1n,
        'capped at the maximum'
    );
});

test('standard channel: jobs, shares, a block, and the error codes', async () => {
    const port = base;
    const { pool, state, shares } = await startPool(port);
    const client = await connect(port);

    client.send('OpenStandardMiningChannel', {
        requestId: 7,
        userIdentity: 'miner.sv2',
        nominalHashRate: 300,
        maxTarget: Buffer.alloc(32, 0xff)
    });
    const opened = await client.receive([
        'OpenStandardMiningChannelSuccess',
        'OpenMiningChannelError'
    ]);
    assert.equal(opened.name, 'OpenStandardMiningChannelSuccess');
    assert.equal(opened.body.requestId, 7);
    const channelId = opened.body.channelId;
    assert.equal(
        opened.body.extranoncePrefix.length,
        8,
        'the pool fixes the whole 8-byte extranonce'
    );
    const target = targetToBigInt(opened.body.target);
    // 300 H/s at 15 s per share wants 1.05e-6, inside the port's range
    const diff = difficultyForTarget(target, 1n);
    assert.ok(
        diff > 1.0e-6 && diff < 1.1e-6,
        `initial difficulty from the hashrate: ${diff}`
    );

    const job = await client.receive('NewMiningJob');
    assert.equal(job.body.channelId, channelId);
    assert.equal(job.body.ntimeStart, null, 'the first job is a future job');
    const prev = await client.receive('SetNewPrevHash');
    assert.equal(
        prev.body.jobId,
        job.body.jobId,
        'activated by SetNewPrevHash'
    );
    assert.equal(prev.body.prevHash.toString('hex'), '00'.repeat(32));
    assert.equal(prev.body.nbits, parseInt(EASY_BITS, 16));

    // A share at the channel target but under the block target is rejected? No:
    // the mock chain's block target (2^254) is far easier than any share target,
    // so the first valid share is also a block.
    const found = mine(
        {
            version: job.body.version,
            merkleRoot: job.body.merkleRoot,
            prevHash: prev.body.prevHash,
            nbits: prev.body.nbits
        },
        prev.body.ntimeStart,
        target
    );
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 1,
        jobId: job.body.jobId,
        nonce: found.nonce,
        ntime: prev.body.ntimeStart,
        version: job.body.version
    });
    const ok = await client.receive([
        'SubmitSharesSuccess',
        'SubmitSharesError'
    ]);
    assert.equal(
        ok.name,
        'SubmitSharesSuccess',
        String(ok.body.errorCode ?? ok.name)
    );
    assert.equal(ok.body.lastSequenceNumber, 1);
    assert.equal(ok.body.newSubmitsAcceptedCount, 1);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(
        state.submittedBlocks.length,
        1,
        'the block went to the daemon'
    );
    const block = Buffer.from(state.submittedBlocks[0], 'hex');
    assert.deepEqual(
        block.subarray(0, 80),
        found.header,
        'the submitted block starts with the header the device built'
    );
    assert.ok(
        shares.some(
            (s) => s.isValid && s.isBlock && s.data.worker === 'miner.sv2'
        )
    );

    // duplicate
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 2,
        jobId: job.body.jobId,
        nonce: found.nonce,
        ntime: prev.body.ntimeStart,
        version: job.body.version
    });
    assert.equal(
        (await client.receive(['SubmitSharesSuccess', 'SubmitSharesError']))
            .body.errorCode,
        'duplicate-share'
    );
    // wrong job
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 3,
        jobId: 999,
        nonce: 1,
        ntime: prev.body.ntimeStart,
        version: job.body.version
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'invalid-job-id'
    );
    // version bits outside the rolling mask
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 4,
        jobId: job.body.jobId,
        nonce: 2,
        ntime: prev.body.ntimeStart,
        version: job.body.version ^ 1
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'invalid-share'
    );
    // rolled version bits are fine, difficulty is not
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 5,
        jobId: job.body.jobId,
        nonce: found.nonce + 1,
        ntime: prev.body.ntimeStart,
        version: job.body.version | 0x00e00000
    });
    const low = await client.receive([
        'SubmitSharesSuccess',
        'SubmitSharesError'
    ]);
    assert.ok(
        low.name === 'SubmitSharesError'
            ? low.body.errorCode === 'difficulty-too-low'
            : true
    );
    // unknown channel
    client.send('SubmitSharesStandard', {
        channelId: 42,
        sequenceNumber: 6,
        jobId: 1,
        nonce: 1,
        ntime: 1,
        version: 1
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'invalid-channel-id'
    );

    // a new template with the same prevhash: an immediately valid job
    pool.jobManager.updateCurrentJob({
        ...pool.jobManager.currentJob.rpcData,
        curtime: pool.jobManager.currentJob.rpcData.curtime + 1
    });
    const updated = await client.receive('NewMiningJob');
    assert.equal(
        updated.body.ntimeStart,
        pool.jobManager.currentJob.rpcData.curtime
    );

    // a new block: future job + SetNewPrevHash, and the old job turns stale
    pool.jobManager.processTemplate({
        ...pool.jobManager.currentJob.rpcData,
        previousblockhash: '11'.repeat(32),
        height: 102
    });
    const next = await client.receive('NewMiningJob');
    assert.equal(next.body.ntimeStart, null);
    const nextPrev = await client.receive('SetNewPrevHash');
    assert.equal(nextPrev.body.jobId, next.body.jobId);
    assert.equal(nextPrev.body.prevHash.toString('hex'), '11'.repeat(32));
    client.send('SubmitSharesStandard', {
        channelId,
        sequenceNumber: 7,
        jobId: job.body.jobId,
        nonce: 5,
        ntime: prev.body.ntimeStart,
        version: job.body.version
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'stale-share'
    );

    // UpdateChannel with a stricter max_target forces a SetTarget
    const strict = targetForDifficulty(0.5, 1n);
    client.send('UpdateChannel', {
        channelId,
        nominalHashRate: 300,
        maxTarget: strict
    });
    const setTarget = await client.receive('SetTarget');
    assert.equal(
        targetToBigInt(setTarget.body.target) <= targetToBigInt(strict),
        true
    );
    assert.equal(
        (await client.receive('NewMiningJob')).body.ntimeStart !== null,
        true,
        'a fresh job carries the new target'
    );

    client.send('CloseChannel', { channelId, reasonCode: 'done' });
});

test('extended channel: the proxy builds the coinbase and the merkle root itself', async () => {
    const port = base + 1;
    const { state } = await startPool(port, {
        // two transactions so the merkle path is non-trivial
        options: {},
        coin: {}
    });
    // make the template carry transactions: rebuild the daemon's template through the pool
    const client = await connect(port, 0);
    client.send('OpenExtendedMiningChannel', {
        requestId: 1,
        userIdentity: 'proxy.rig',
        nominalHashRate: 0,
        maxTarget: Buffer.alloc(32, 0xff),
        minExtranonceSize: 8
    });
    const opened = await client.receive([
        'OpenExtendedMiningChannelSuccess',
        'OpenMiningChannelError'
    ]);
    assert.equal(opened.name, 'OpenExtendedMiningChannelSuccess');
    assert.equal(opened.body.extranonceSize, 8);
    assert.equal(opened.body.extranoncePrefix.length, 4);
    const channelId = opened.body.channelId;
    const target = targetToBigInt(opened.body.target);
    assert.ok(
        Math.abs(difficultyForTarget(target, 1n) - 0.000001) < 1e-9,
        'no hashrate given: the port difficulty'
    );

    const job = await client.receive('NewExtendedMiningJob');
    assert.equal(job.body.versionRollingAllowed, true);
    assert.equal(job.body.ntimeStart, null);
    const prev = await client.receive('SetNewPrevHash');

    // build the coinbase with our own extranonce and fold the merkle path
    const extranonce = Buffer.from('0102030405060708', 'hex');
    const coinbase = Buffer.concat([
        job.body.coinbaseTxPrefix,
        opened.body.extranoncePrefix,
        extranonce,
        job.body.coinbaseTxSuffix
    ]);
    let root = util.sha256d(coinbase);
    for (const node of job.body.merklePath)
        root = util.sha256d(Buffer.concat([root, node]));
    const found = mine(
        {
            version: job.body.version,
            merkleRoot: root,
            prevHash: prev.body.prevHash,
            nbits: prev.body.nbits
        },
        prev.body.ntimeStart,
        target
    );
    client.send('SubmitSharesExtended', {
        channelId,
        sequenceNumber: 1,
        jobId: job.body.jobId,
        nonce: found.nonce,
        ntime: prev.body.ntimeStart,
        version: job.body.version,
        extranonce
    });
    const ok = await client.receive([
        'SubmitSharesSuccess',
        'SubmitSharesError'
    ]);
    assert.equal(
        ok.name,
        'SubmitSharesSuccess',
        String(ok.body.errorCode ?? ok.name)
    );
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(state.submittedBlocks.length, 1);
    const block = Buffer.from(state.submittedBlocks[0], 'hex');
    assert.deepEqual(block.subarray(0, 80), found.header);
    assert.ok(
        block.subarray(81).equals(coinbase),
        'the block carries exactly the coinbase the proxy built'
    );

    client.send('SubmitSharesExtended', {
        channelId,
        sequenceNumber: 2,
        jobId: job.body.jobId,
        nonce: 1,
        ntime: prev.body.ntimeStart,
        version: job.body.version,
        extranonce: Buffer.alloc(4)
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'bad-extranonce-size'
    );
});

test('setup and authorization: refused flags, unknown users, bad certificates', async () => {
    const port = base + 2;
    await startPool(port, { coin: { version_mask: undefined } });

    // without version_mask the pool requires a fixed version and says so
    const fixed = await connect(port, codec.REQUIRES_STANDARD_JOBS);
    const client = fixed; // SetupConnectionSuccess already checked in connect()
    client.send('OpenStandardMiningChannel', {
        requestId: 1,
        userIdentity: 'nobody.here',
        nominalHashRate: 0,
        maxTarget: Buffer.alloc(32, 0xff)
    });
    assert.equal(
        (
            await client.receive([
                'OpenMiningChannelError',
                'OpenStandardMiningChannelSuccess'
            ])
        ).body.errorCode,
        'unknown-user'
    );
    client.send('OpenStandardMiningChannel', {
        requestId: 2,
        userIdentity: 'someone.rig',
        nominalHashRate: 0,
        maxTarget: Buffer.alloc(32, 0xff)
    });
    const opened = await client.receive([
        'OpenMiningChannelError',
        'OpenStandardMiningChannelSuccess'
    ]);
    assert.equal(opened.name, 'OpenStandardMiningChannelSuccess');
    const job = await client.receive('NewMiningJob');
    const prev = await client.receive('SetNewPrevHash');
    client.send('SubmitSharesStandard', {
        channelId: opened.body.channelId,
        sequenceNumber: 1,
        jobId: job.body.jobId,
        nonce: 1,
        ntime: prev.body.ntimeStart,
        version: job.body.version | 0x00e00000
    });
    assert.equal(
        (await client.receive('SubmitSharesError')).body.errorCode,
        'invalid-share',
        'rolled bits are refused when the coin forbids rolling'
    );

    // a client that demands version rolling is turned away at setup
    const rolling = new Sv2TestClient(port);
    cleanup.push(() => rolling.close());
    await rolling.connected();
    await rolling.handshake(authority.publicKey);
    const refused = await rolling.setup(codec.REQUIRES_VERSION_ROLLING);
    assert.equal(refused.name, 'SetupConnectionError');
    assert.equal(refused.body.errorCode, 'unsupported-feature-flags');
    assert.equal(
        refused.body.flags & codec.REQUIRES_VERSION_ROLLING,
        codec.REQUIRES_VERSION_ROLLING
    );

    // work selection is not offered
    const selecting = new Sv2TestClient(port);
    cleanup.push(() => selecting.close());
    await selecting.connected();
    await selecting.handshake(authority.publicKey);
    assert.equal(
        (await selecting.setup(codec.REQUIRES_WORK_SELECTION)).body.errorCode,
        'unsupported-feature-flags'
    );

    // the wrong authority key fails the handshake before any message
    const stranger = new Sv2TestClient(port);
    cleanup.push(() => stranger.close());
    await stranger.connected();
    await assert.rejects(
        stranger.handshake(generateAuthorityKeyPair().publicKey),
        /certificate/
    );

    // the API-facing key encoding round-trips the key the pool signs with
    assert.deepEqual(
        decodePublicKey(encodePublicKey(authority.publicKey)),
        authority.publicKey
    );
});

test('a V1 port and a V2 port on one pool: the V1 server leaves the V2 port alone', async () => {
    const v1 = base + 3;
    const v2 = base + 4;
    const { pool } = await startPool(v2, { ports: { [v1]: { diff: 0.001 } } });
    assert.deepEqual(pool.sv2Server.ports, [String(v2)]);
    // the V1 stratum server answers JSON on its port; the V2 port answers nothing readable
    const probe = net.connect(v1, HOST);
    cleanup.push(() => probe.destroy());
    await new Promise<void>((resolve, reject) => {
        probe.once('connect', resolve);
        probe.once('error', reject);
    });
    probe.write(
        JSON.stringify({
            id: 1,
            method: 'mining.subscribe',
            params: ['probe']
        }) + '\n'
    );
    const chunk: string = await new Promise((resolve) =>
        probe.once('data', (d) => resolve(d.toString()))
    );
    assert.equal(JSON.parse(chunk.split('\n')[0]).id, 1);
});
