import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';

import { createPool } from '../src/pool.ts';
import {
    generateAuthorityKeyPair,
    encodeSecretKey,
    encodePublicKey
} from '../src/sv2/keys.ts';
import {
    HOST,
    POOL_ADDRESS,
    startMockDaemon,
    type DaemonState
} from './helpers/mockDaemon.ts';

/*
 * Interoperability with the Stratum V2 Reference Implementation: its CPU
 * mining device (sv2-apps, integration-tests/bin/mining_device.rs) is
 * pointed at the pool with the authority key and must get shares accepted.
 *
 * The device is a Rust binary, so this test runs only when SV2_MINING_DEVICE
 * holds the command that starts it, e.g.
 *   SV2_MINING_DEVICE="docker run --rm --network host sv2-apps-tools /sv2-apps/target/release/mining_device"
 * (see docs/stratum-v2.md for the build). CI skips it.
 */

const command = process.env.SV2_MINING_DEVICE;
const cleanup: Array<() => void> = [];
after(() => cleanup.forEach((fn) => fn()));

test(
    'the SRI mining device mines against the pool over Stratum V2',
    { skip: !command },
    async () => {
        const authority = generateAuthorityKeyPair();
        const state: DaemonState = {
            calls: [],
            submittedBlocks: [],
            confirmedHashes: []
        };
        const daemon = await startMockDaemon(state);
        cleanup.push(() => daemon.close());
        const daemonPort = (daemon.address() as net.AddressInfo).port;
        const port = 3800 + Math.floor(process.pid % 100);
        const pool: any = createPool(
            {
                coin: {
                    name: 'mockcoin',
                    symbol: 'MOCK',
                    algorithm: 'sha256',
                    peerMagic: 'fabfb5da',
                    version_mask: '1fffe000'
                },
                address: POOL_ADDRESS,
                rewardRecipients: {},
                blockRefreshInterval: 0,
                jobRebroadcastTimeout: 3600,
                connectionTimeout: 60,
                p2p: { enabled: false },
                sv2: {
                    authoritySecretKey: encodeSecretKey(authority.secretKey)
                },
                ports: {
                    [port]: {
                        sv2: true,
                        diff: 1,
                        varDiff: {
                            minDiff: 1,
                            maxDiff: 1024,
                            targetTime: 5,
                            retargetTime: 30,
                            variancePercent: 30
                        }
                    }
                },
                daemons: [
                    {
                        host: HOST,
                        port: daemonPort,
                        user: 'mock',
                        password: 'mock'
                    }
                ]
            },
            (
                _ip: any,
                _port: any,
                _worker: any,
                _password: any,
                callback: any
            ) => callback({ error: null, authorized: true, disconnect: false })
        );
        cleanup.push(() => pool.stop());
        const accepted: any[] = [];
        pool.on('share', (isValid: boolean, isBlock: boolean, data: any) => {
            if (isValid) accepted.push({ isBlock, data });
        });
        const logs: string[] = [];
        pool.on('log', (severity: string, text: string) =>
            logs.push(`${severity}: ${text}`)
        );
        pool.start();
        await new Promise<void>((resolve, reject) => {
            pool.once('started', resolve);
            setTimeout(() => reject(new Error('pool did not start')), 15000);
        });

        const [bin, ...args] = (command as string).split(/\s+/);
        const device = spawn(
            bin,
            [
                ...args,
                '--address-pool',
                `${HOST}:${port}`,
                '--pubkey-pool',
                encodePublicKey(authority.publicKey),
                '--id-user',
                'sri.device',
                '--handicap',
                '1000'
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        cleanup.push(() => device.kill('SIGKILL'));
        let output = '';
        device.stdout.on('data', (d) => (output += d));
        device.stderr.on('data', (d) => (output += d));

        const deadline = Date.now() + 90_000;
        while (accepted.length < 3 && Date.now() < deadline)
            await new Promise((r) => setTimeout(r, 250));
        assert.ok(
            accepted.length >= 3,
            `expected accepted shares from the reference device; pool log:\n${logs.slice(-15).join('\n')}\ndevice output:\n${output.slice(-3000)}`
        );
        assert.ok(accepted.every((s) => s.data.worker === 'sri.device'));
        assert.ok(
            state.submittedBlocks.length >= 1,
            'the regtest-easy template means accepted shares are blocks'
        );
    }
);
