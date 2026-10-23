/*
 * Stratum V2 binary framing and the Mining Protocol messages (specification
 * §3 and §5; type numbers as the reference implementation's mining and
 * common-messages crates define them). Every message is a schema — a list
 * of (field, type) pairs — so encoding and decoding are one routine each.
 *
 * A frame is a 6-byte header followed by the payload:
 *   extension_type U16 (bit 15 = channel_msg) | msg_type U8 | msg_length U24
 * Trailing bytes after a message's fields are ignored: the specification
 * reserves them for TLV extension fields.
 */

export const SV2_PROTOCOL_VERSION = 2;
export const MINING_PROTOCOL = 0;
export const CHANNEL_MSG_BIT = 0x8000;
export const FRAME_HEADER_LEN = 6;
export const MAX_PAYLOAD_LEN = 0xffffff;

/** SetupConnection flags (Mining Protocol): what the client requires. */
export const REQUIRES_STANDARD_JOBS = 1 << 0;
export const REQUIRES_WORK_SELECTION = 1 << 1;
export const REQUIRES_VERSION_ROLLING = 1 << 2;
/** SetupConnection.Success flags: what the server imposes. */
export const REQUIRES_FIXED_VERSION = 1 << 0;
export const REQUIRES_EXTENDED_CHANNELS = 1 << 1;

type FieldType =
    | 'u8'
    | 'u16'
    | 'u24'
    | 'u32'
    | 'u64'
    | 'f32'
    | 'bool'
    | 'u256'
    | 'str0_255'
    | 'b0_32'
    | 'b0_64k'
    | 'seq0_255_u256'
    | 'seq0_64k_u32'
    | 'option_u32';

type Schema = {
    type: number;
    channelMsg: boolean;
    fields: [string, FieldType][];
};

export const MESSAGES = {
    SetupConnection: {
        type: 0x00,
        channelMsg: false,
        fields: [
            ['protocol', 'u8'],
            ['minVersion', 'u16'],
            ['maxVersion', 'u16'],
            ['flags', 'u32'],
            ['endpointHost', 'str0_255'],
            ['endpointPort', 'u16'],
            ['vendor', 'str0_255'],
            ['hardwareVersion', 'str0_255'],
            ['firmware', 'str0_255'],
            ['deviceId', 'str0_255']
        ]
    },
    SetupConnectionSuccess: {
        type: 0x01,
        channelMsg: false,
        fields: [
            ['usedVersion', 'u16'],
            ['flags', 'u32']
        ]
    },
    SetupConnectionError: {
        type: 0x02,
        channelMsg: false,
        fields: [
            ['flags', 'u32'],
            ['errorCode', 'str0_255']
        ]
    },
    ChannelEndpointChanged: {
        type: 0x03,
        channelMsg: true,
        fields: [['channelId', 'u32']]
    },
    Reconnect: {
        type: 0x04,
        channelMsg: false,
        fields: [
            ['newHost', 'str0_255'],
            ['newPort', 'u16']
        ]
    },
    OpenStandardMiningChannel: {
        type: 0x10,
        channelMsg: false,
        fields: [
            ['requestId', 'u32'],
            ['userIdentity', 'str0_255'],
            ['nominalHashRate', 'f32'],
            ['maxTarget', 'u256']
        ]
    },
    OpenStandardMiningChannelSuccess: {
        type: 0x11,
        channelMsg: false,
        fields: [
            ['requestId', 'u32'],
            ['channelId', 'u32'],
            ['target', 'u256'],
            ['extranoncePrefix', 'b0_32'],
            ['groupChannelId', 'u32']
        ]
    },
    OpenMiningChannelError: {
        type: 0x12,
        channelMsg: false,
        fields: [
            ['requestId', 'u32'],
            ['errorCode', 'str0_255']
        ]
    },
    OpenExtendedMiningChannel: {
        type: 0x13,
        channelMsg: false,
        fields: [
            ['requestId', 'u32'],
            ['userIdentity', 'str0_255'],
            ['nominalHashRate', 'f32'],
            ['maxTarget', 'u256'],
            ['minExtranonceSize', 'u16']
        ]
    },
    OpenExtendedMiningChannelSuccess: {
        type: 0x14,
        channelMsg: false,
        fields: [
            ['requestId', 'u32'],
            ['channelId', 'u32'],
            ['target', 'u256'],
            ['extranonceSize', 'u16'],
            ['extranoncePrefix', 'b0_32'],
            ['groupChannelId', 'u32']
        ]
    },
    NewMiningJob: {
        type: 0x15,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['jobId', 'u32'],
            ['ntimeStart', 'option_u32'],
            ['version', 'u32'],
            ['merkleRoot', 'u256']
        ]
    },
    UpdateChannel: {
        type: 0x16,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['nominalHashRate', 'f32'],
            ['maxTarget', 'u256']
        ]
    },
    UpdateChannelError: {
        type: 0x17,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['errorCode', 'str0_255']
        ]
    },
    CloseChannel: {
        type: 0x18,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['reasonCode', 'str0_255']
        ]
    },
    SetExtranoncePrefix: {
        type: 0x19,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['extranoncePrefix', 'b0_32']
        ]
    },
    SubmitSharesStandard: {
        type: 0x1a,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['sequenceNumber', 'u32'],
            ['jobId', 'u32'],
            ['nonce', 'u32'],
            ['ntime', 'u32'],
            ['version', 'u32']
        ]
    },
    SubmitSharesExtended: {
        type: 0x1b,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['sequenceNumber', 'u32'],
            ['jobId', 'u32'],
            ['nonce', 'u32'],
            ['ntime', 'u32'],
            ['version', 'u32'],
            ['extranonce', 'b0_32']
        ]
    },
    SubmitSharesSuccess: {
        type: 0x1c,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['lastSequenceNumber', 'u32'],
            ['newSubmitsAcceptedCount', 'u32'],
            ['newSharesSum', 'u64']
        ]
    },
    SubmitSharesError: {
        type: 0x1d,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['sequenceNumber', 'u32'],
            ['errorCode', 'str0_255']
        ]
    },
    NewExtendedMiningJob: {
        type: 0x1f,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['jobId', 'u32'],
            ['ntimeStart', 'option_u32'],
            ['version', 'u32'],
            ['versionRollingAllowed', 'bool'],
            ['merklePath', 'seq0_255_u256'],
            ['coinbaseTxPrefix', 'b0_64k'],
            ['coinbaseTxSuffix', 'b0_64k']
        ]
    },
    SetNewPrevHash: {
        type: 0x20,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['jobId', 'u32'],
            ['prevHash', 'u256'],
            ['ntimeStart', 'u32'],
            ['nbits', 'u32']
        ]
    },
    SetTarget: {
        type: 0x21,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['target', 'u256']
        ]
    },
    SetCustomMiningJob: {
        type: 0x22,
        channelMsg: true,
        fields: [
            ['channelId', 'u32'],
            ['requestId', 'u32']
        ]
    },
    SetGroupChannel: {
        type: 0x25,
        channelMsg: false,
        fields: [
            ['groupChannelId', 'u32'],
            ['channelIds', 'seq0_64k_u32']
        ]
    }
} as const satisfies Record<string, Schema>;

export type MessageName = keyof typeof MESSAGES;

const BY_TYPE = new Map<number, MessageName>();
for (const name of Object.keys(MESSAGES) as MessageName[])
    BY_TYPE.set(MESSAGES[name].type, name);

export type Frame = {
    extensionType: number;
    msgType: number;
    channelMsg: boolean;
    payload: Buffer;
};

/** The header + payload of a message of the base protocol. */
export function buildFrame(
    msgType: number,
    channelMsg: boolean,
    payload: Uint8Array
): Buffer {
    if (payload.length > MAX_PAYLOAD_LEN)
        throw new RangeError('payload too long');
    const header = Buffer.alloc(FRAME_HEADER_LEN);
    header.writeUInt16LE(channelMsg ? CHANNEL_MSG_BIT : 0, 0);
    header[2] = msgType;
    header.writeUIntLE(payload.length, 3, 3);
    return Buffer.concat([header, payload]);
}

export function parseFrame(frame: Uint8Array): Frame {
    const b = Buffer.from(frame);
    if (b.length < FRAME_HEADER_LEN)
        throw new RangeError('frame shorter than its header');
    const ext = b.readUInt16LE(0);
    const length = b.readUIntLE(3, 3);
    if (b.length !== FRAME_HEADER_LEN + length)
        throw new RangeError('frame length mismatch');
    return {
        extensionType: ext & ~CHANNEL_MSG_BIT,
        msgType: b[2],
        channelMsg: (ext & CHANNEL_MSG_BIT) !== 0,
        payload: b.subarray(FRAME_HEADER_LEN)
    };
}

class Writer {
    private parts: Buffer[] = [];

    write(type: FieldType, value: any, field: string) {
        const bad = (why: string) => new RangeError(`${field}: ${why}`);
        switch (type) {
            case 'u8':
            case 'u16':
            case 'u24':
            case 'u32': {
                const size = { u8: 1, u16: 2, u24: 3, u32: 4 }[type];
                if (
                    !Number.isInteger(value) ||
                    value < 0 ||
                    value >= 2 ** (8 * size)
                )
                    throw bad(`not a ${type}`);
                const b = Buffer.alloc(size);
                b.writeUIntLE(value, 0, size);
                this.parts.push(b);
                return;
            }
            case 'u64': {
                const n = BigInt(value);
                if (n < 0n || n > 0xffffffffffffffffn) throw bad('not a u64');
                const b = Buffer.alloc(8);
                b.writeBigUInt64LE(n);
                this.parts.push(b);
                return;
            }
            case 'f32': {
                if (
                    typeof value !== 'number' ||
                    !Number.isFinite(value) ||
                    value < 0
                )
                    throw bad('not a non-negative f32');
                const b = Buffer.alloc(4);
                b.writeFloatLE(value);
                this.parts.push(b);
                return;
            }
            case 'bool':
                this.parts.push(Buffer.from([value ? 1 : 0]));
                return;
            case 'u256':
                if (!(value instanceof Uint8Array) || value.length !== 32)
                    throw bad('not 32 bytes');
                this.parts.push(Buffer.from(value));
                return;
            case 'str0_255': {
                const bytes = Buffer.from(String(value), 'utf8');
                if (bytes.length > 255) throw bad('longer than 255 bytes');
                this.parts.push(Buffer.from([bytes.length]), bytes);
                return;
            }
            case 'b0_32':
            case 'b0_64k': {
                const bytes = Buffer.from(value as Uint8Array);
                const max = type === 'b0_32' ? 32 : 65535;
                if (bytes.length > max) throw bad(`longer than ${max} bytes`);
                const len = Buffer.alloc(type === 'b0_32' ? 1 : 2);
                len.writeUIntLE(bytes.length, 0, len.length);
                this.parts.push(len, bytes);
                return;
            }
            case 'seq0_255_u256': {
                const items = value as Uint8Array[];
                if (items.length > 255) throw bad('more than 255 items');
                this.parts.push(Buffer.from([items.length]));
                for (const item of items) {
                    if (item.length !== 32) throw bad('item is not 32 bytes');
                    this.parts.push(Buffer.from(item));
                }
                return;
            }
            case 'seq0_64k_u32': {
                const items = value as number[];
                if (items.length > 65535) throw bad('more than 65535 items');
                const b = Buffer.alloc(2 + 4 * items.length);
                b.writeUInt16LE(items.length, 0);
                items.forEach((n, i) => b.writeUInt32LE(n, 2 + 4 * i));
                this.parts.push(b);
                return;
            }
            case 'option_u32': {
                if (value === null || value === undefined) {
                    this.parts.push(Buffer.from([0]));
                } else {
                    const b = Buffer.alloc(5);
                    b[0] = 1;
                    b.writeUInt32LE(value, 1);
                    this.parts.push(b);
                }
                return;
            }
        }
    }

    finish(): Buffer {
        return Buffer.concat(this.parts);
    }
}

class Reader {
    private offset = 0;
    private buf: Buffer;

    constructor(buf: Buffer) {
        this.buf = buf;
    }

    private take(n: number, field: string): Buffer {
        if (this.offset + n > this.buf.length)
            throw new RangeError(`${field}: message truncated`);
        const out = this.buf.subarray(this.offset, this.offset + n);
        this.offset += n;
        return out;
    }

    read(type: FieldType, field: string): any {
        switch (type) {
            case 'u8':
                return this.take(1, field)[0];
            case 'u16':
                return this.take(2, field).readUInt16LE(0);
            case 'u24':
                return this.take(3, field).readUIntLE(0, 3);
            case 'u32':
                return this.take(4, field).readUInt32LE(0);
            case 'u64':
                return this.take(8, field).readBigUInt64LE(0);
            case 'f32': {
                const v = this.take(4, field).readFloatLE(0);
                if (!Number.isFinite(v) || v < 0 || Object.is(v, -0))
                    throw new RangeError(`${field}: invalid f32`);
                return v;
            }
            case 'bool':
                return (this.take(1, field)[0] & 1) === 1;
            case 'u256':
                return Buffer.from(this.take(32, field));
            case 'str0_255':
                return this.take(this.take(1, field)[0], field).toString(
                    'utf8'
                );
            case 'b0_32': {
                const len = this.take(1, field)[0];
                if (len > 32)
                    throw new RangeError(`${field}: longer than 32 bytes`);
                return Buffer.from(this.take(len, field));
            }
            case 'b0_64k':
                return Buffer.from(
                    this.take(this.take(2, field).readUInt16LE(0), field)
                );
            case 'seq0_255_u256': {
                const count = this.take(1, field)[0];
                const items: Buffer[] = [];
                for (let i = 0; i < count; i++)
                    items.push(Buffer.from(this.take(32, field)));
                return items;
            }
            case 'seq0_64k_u32': {
                const count = this.take(2, field).readUInt16LE(0);
                const items: number[] = [];
                for (let i = 0; i < count; i++)
                    items.push(this.take(4, field).readUInt32LE(0));
                return items;
            }
            case 'option_u32': {
                const present = this.take(1, field)[0];
                if (present === 0) return null;
                if (present !== 1)
                    throw new RangeError(`${field}: option count ${present}`);
                return this.take(4, field).readUInt32LE(0);
            }
        }
    }
}

/** Encode a message as a complete frame (header included). */
export function encodeMessage(
    name: MessageName,
    body: Record<string, any>
): Buffer {
    const schema: Schema = MESSAGES[name];
    const w = new Writer();
    for (const [field, type] of schema.fields)
        w.write(type, body[field], `${name}.${field}`);
    return buildFrame(schema.type, schema.channelMsg, w.finish());
}

export type Decoded = { name: MessageName; body: Record<string, any> };

/** Decode a frame of the base protocol; null for a message type this pool does not know. */
export function decodeMessage(frame: Frame): Decoded | null {
    if (frame.extensionType !== 0) return null;
    const name = BY_TYPE.get(frame.msgType);
    if (name === undefined) return null;
    const schema: Schema = MESSAGES[name];
    const r = new Reader(frame.payload);
    const body: Record<string, any> = {};
    for (const [field, type] of schema.fields)
        body[field] = r.read(type, `${name}.${field}`);
    return { name, body };
}

/** The channel a channel-bit frame is addressed to, without decoding it. */
export function channelIdOf(frame: Frame): number | null {
    if (!frame.channelMsg || frame.payload.length < 4) return null;
    return frame.payload.readUInt32LE(0);
}
