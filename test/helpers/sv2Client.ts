import net from 'node:net';

import * as noise from '../../src/sv2/noise.ts';
import * as codec from '../../src/sv2/codec.ts';

/*
 * A small Stratum V2 client for the tests: handshake as the initiator,
 * SetupConnection, and typed send/receive over the encrypted transport.
 */
export class Sv2TestClient {
    socket: net.Socket;
    private transport: noise.Transport | null = null;
    private decryptor: noise.FrameDecryptor | null = null;
    private inbox: codec.Decoded[] = [];
    private waiters: Array<(m: codec.Decoded) => void> = [];
    private handshakeBuffer = Buffer.alloc(0);
    private handshakeResolve: ((m2: Buffer) => void) | null = null;

    constructor(port: number, host = '127.0.0.1') {
        this.socket = net.connect(port, host);
        this.socket.on('data', (data: Buffer) => this.onData(data));
    }

    private onData(data: Buffer) {
        if (this.transport === null) {
            this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, data]);
            if (
                this.handshakeBuffer.length >= noise.HANDSHAKE_MESSAGE_2_LEN &&
                this.handshakeResolve
            ) {
                const m2 = this.handshakeBuffer.subarray(
                    0,
                    noise.HANDSHAKE_MESSAGE_2_LEN
                );
                const rest = this.handshakeBuffer.subarray(
                    noise.HANDSHAKE_MESSAGE_2_LEN
                );
                this.handshakeBuffer = Buffer.alloc(0);
                const resolve = this.handshakeResolve;
                this.handshakeResolve = null;
                resolve(Buffer.from(m2));
                if (rest.length && this.decryptor)
                    this.onData(Buffer.from(rest));
            }
            return;
        }
        for (const frame of this.decryptor!.push(data)) {
            const decoded = codec.decodeMessage(codec.parseFrame(frame));
            if (!decoded) continue;
            const waiter = this.waiters.shift();
            if (waiter) waiter(decoded);
            else this.inbox.push(decoded);
        }
    }

    connected(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.once('connect', resolve);
            this.socket.once('error', reject);
        });
    }

    /** Noise handshake; with a key the pool's certificate is verified. */
    async handshake(authorityPublicKey: Uint8Array | null): Promise<void> {
        const initiator = new noise.Initiator();
        const m2 = await new Promise<Buffer>((resolve) => {
            this.handshakeResolve = resolve;
            this.socket.write(initiator.start());
        });
        this.transport = initiator.finish(m2, authorityPublicKey);
        this.decryptor = new noise.FrameDecryptor(this.transport.decryptor);
    }

    send(name: codec.MessageName, body: Record<string, any>) {
        const frame = codec.encodeMessage(name, body);
        this.socket.write(noise.encryptFrame(this.transport!.encryptor, frame));
    }

    /** The next message, or the next one of the given name(s), within the timeout. */
    receive(
        names?: codec.MessageName | codec.MessageName[],
        timeoutMs = 5000
    ): Promise<codec.Decoded> {
        const wanted =
            names === undefined ? null : Array.isArray(names) ? names : [names];
        const matches = (m: codec.Decoded) =>
            wanted === null || wanted.includes(m.name);
        const idx = this.inbox.findIndex(matches);
        if (idx !== -1) return Promise.resolve(this.inbox.splice(idx, 1)[0]);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            `timed out waiting for ${wanted ?? 'any message'}`
                        )
                    ),
                timeoutMs
            );
            const waiter = (m: codec.Decoded) => {
                if (matches(m)) {
                    clearTimeout(timer);
                    resolve(m);
                } else {
                    this.inbox.push(m);
                    this.waiters.push(waiter);
                }
            };
            this.waiters.push(waiter);
        });
    }

    async setup(
        flags = codec.REQUIRES_STANDARD_JOBS,
        deviceId = 'namp-test'
    ): Promise<codec.Decoded> {
        this.send('SetupConnection', {
            protocol: codec.MINING_PROTOCOL,
            minVersion: 2,
            maxVersion: 2,
            flags,
            endpointHost: '127.0.0.1',
            endpointPort: this.socket.remotePort ?? 0,
            vendor: 'NAMP tests',
            hardwareVersion: 'v1',
            firmware: 'node',
            deviceId
        });
        return this.receive(['SetupConnectionSuccess', 'SetupConnectionError']);
    }

    close() {
        this.socket.destroy();
    }
}
