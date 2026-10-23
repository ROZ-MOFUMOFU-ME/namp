# Stratum V2

NAMP serves **Stratum V2** on any Bitcoin-family port a pool config marks
`sv2: true`, next to the V1 ports, from the same job manager with the same
share validation, varDiff, banning and authorization. Miners connect with
the pool's authority public key in the URL:

```
stratum2+tcp://pool.example.com:3336/9bXiEd8boQVhq7WddEcERUL5tyyJVFYdU8th3HfbNXK3Yw6GRXh
```

What V2 changes for a pool operator: the connection is encrypted and
authenticated (Noise with a certificate signed by the pool's authority key,
so a miner cannot be redirected to an impostor), messages are binary (a
share is 38 bytes instead of a JSON line), and devices can mine header-only
"standard" jobs while proxies open "extended" channels with their own
extranonce space.

## Setting it up

1. Generate the pool's authority key pair once:

    ```bash
    npm run sv2:keygen
    # authority public key (give to miners): 9bX…
    # authority secret key (sv2.authoritySecretKey): 2EA…
    ```

2. Put the secret in the pool config and mark the port(s):

    ```jsonc
    "sv2": {
        "authoritySecretKey": "2EA…",          // keep private; this IS the pool's identity
        "certificateValiditySeconds": 86400    // optional, default one day
    },
    "ports": {
        "3336": {
            "sv2": true,
            "diff": 262144,
            "varDiff": { "minDiff": 128, "maxDiff": 268435456, "targetTime": 15, "retargetTime": 60, "variancePercent": 30 }
        }
    }
    ```

    `diff` and `varDiff` mean exactly what they mean on a V1 port
    ([adding-a-coin.md](adding-a-coin.md#sizing-ports-for-todays-hardware)).
    A V2 port ignores `tls` — the transport is always encrypted.

3. Publish the public key. The startup log prints it
   (`SV2 Authority Key:`), the web UI's Getting Started page shows the full
   `stratum2+tcp://` URL for every V2 port, and `GET /api/config` exposes
   it as `sv2.authorityPublicKey` per pool. The secret never leaves the
   pool config.

[`pool_configs/examples/bitcoin.json`](../pool_configs/examples/bitcoin.json)
carries a complete example.

## What miners see

- **Braiins OS** and other SV2 firmware: the `stratum2+tcp://host:port/key`
  URL, worker name as `address.rig`.
- **Stratum V1 ASICs** behind the Stratum Reference Implementation's
  **translator** (`translator_sv2`): the translator takes the pool URL and
  key upstream and speaks V1 to the machines; it opens an extended channel
  and asks for the extranonce size its downstream needs (the pool grants up
  to 28 bytes beyond its 4-byte prefix).
- The SRI **mining device** (a CPU miner used for testing) and anything
  built on the SRI libraries.

The pool offers version 2 of the protocol, grants `version-rolling` when
the coin definition carries `version_mask` (and otherwise answers
`REQUIRES_FIXED_VERSION`, refusing clients that insist on rolling), and
declines work selection: a client that sets `REQUIRES_WORK_SELECTION`
gets `SetupConnection.Error unsupported-feature-flags`. Job Declaration
(miner-chosen transactions) is not implemented.

## How it works

| Step             | Pool behaviour                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake        | `Noise_NX_Secp256k1+EllSwift_ChaChaPoly_SHA256`: the miner's ephemeral key arrives in the clear, the pool answers with its ephemeral key, its static key and a certificate signed by the authority key. Fresh ephemeral and static keys per connection; the certificate is valid `certificateValiditySeconds`.                                          |
| SetupConnection  | Version 2, Mining Protocol only. Flags as above.                                                                                                                                                                                                                                                                                                        |
| Standard channel | The pool fixes the whole extranonce (its 4-byte counter plus zero padding), computes the channel's merkle root and sends header-only `NewMiningJob`s. `user_identity` is authorized like a V1 login (`address.rig`).                                                                                                                                    |
| Extended channel | The pool hands out `coinbase_tx_prefix` / `coinbase_tx_suffix` around an extranonce of `4 + extranonce_size` bytes and the merkle path; the client builds the coinbase and the root.                                                                                                                                                                    |
| Jobs             | On a new block: a future job (`ntime_start` empty) then `SetNewPrevHash` activating it. On a template refresh within the block: an immediately valid job. Every channel gets its own jobs; group channels are not used.                                                                                                                                 |
| Targets          | The starting target comes from the port's `diff`, or from the miner's `nominal_hash_rate` and the port's `varDiff.targetTime` when a varDiff range is configured, and never exceeds the miner's `max_target`. varDiff retargets send `SetTarget` followed by a fresh job that carries it; `UpdateChannel` lowering `max_target` does the same.          |
| Shares           | `SubmitShares.Success` per accepted share (`new_shares_sum` = its difficulty) or `SubmitShares.Error` with `invalid-channel-id`, `invalid-job-id`, `stale-share`, `duplicate-share`, `difficulty-too-low`, `bad-extranonce-size` or `invalid-share` (a version outside the rolling mask, bad ntime). Rejections count toward the IP ban like V1 shares. |
| Version rolling  | Standard and extended jobs allow the BIP 320 bits (`0x1fffe000`) when the coin has `version_mask`; other bits must equal the job's version.                                                                                                                                                                                                             |

The implementation lives in [`src/sv2/`](../src/sv2/): `secp256k1.ts`
(field/group arithmetic, BIP 340 Schnorr, x-only ECDH through OpenSSL),
`ellswift.ts` (BIP 324 ElligatorSwift), `noise.ts` (handshake and
encrypted framing), `codec.ts` (the binary messages), `keys.ts` (the
Base58Check authority keys), `server.ts` (connections, channels, jobs,
shares). The cryptography is checked against the official BIP 340 and BIP
324 vectors and the specification's key example
(`test/sv2.crypto.test.ts`), the handshake and framing in
`test/sv2.noise.test.ts`, and the whole protocol end to end against the
mock daemon in `test/sv2.test.ts`.

## Interoperability test with the reference implementation

`test/sv2.interop.test.ts` runs the SRI CPU mining device against the pool
when `SV2_MINING_DEVICE` names a command that starts it. Build the device
once (Rust, ~15 minutes) and run the test:

```bash
cat > /tmp/sv2-tools.Dockerfile <<'DOCKERFILE'
FROM rust:1.88-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev clang cmake capnproto
RUN git clone --depth 1 https://github.com/stratum-mining/sv2-apps.git /sv2-apps
WORKDIR /sv2-apps
RUN cargo build --release -p integration_tests_sv2 --bin mining_device
DOCKERFILE
docker build -t sv2-apps-tools -f /tmp/sv2-tools.Dockerfile /tmp
SV2_MINING_DEVICE="docker run --rm --network host sv2-apps-tools /sv2-apps/target/release/mining_device" \
  node --test test/sv2.interop.test.ts
```

## Security notes

- The authority secret key is the pool's identity: anyone holding it can
  impersonate the pool to every miner that trusts the public key. Keep it
  in the pool config only (the file is git-ignored) and rotate it by
  generating a new pair and telling miners the new public key.
- The handshake's secret-key operations run in OpenSSL; the Schnorr
  certificate signature and ElligatorSwift encoding use BigInt arithmetic
  that is not constant-time. The signed message is public and the authority
  key signs once per connection, so this is the same exposure as any
  JavaScript Schnorr implementation; a dedicated HSM is not supported.
- The pool answers every connection with a certificate before it knows who
  the client is; connection limits and the usual firewalling apply
  ([security.md](security.md)).
