# Changelog

Releases are tagged `vX.Y.Z` on `main`; the GitHub release carries the
generated commit list, this file the summary.

## 1.2.0 — 2026-10-24

### Stratum V2

- A Stratum V2 server (`src/sv2/`) for the Bitcoin-family pool: Noise
  (`Noise_NX_Secp256k1+EllSwift_ChaChaPoly_SHA256`) handshake with a
  certificate signed by the pool's authority key, binary framing, standard
  and extended mining channels, future/active jobs with `SetNewPrevHash`,
  `SetTarget` from varDiff, version rolling, the specification's error
  codes, and the same share validation, banning and authorization as V1.
  Any port marked `sv2: true` is served by it; `npm run sv2:keygen` makes
  the authority key pair; the web UI and `/api/config` publish the
  `stratum2+tcp://host:port/<key>` URL. Job Declaration is declined.
- Cryptography implemented in-tree and verified against the official
  BIP 340 (Schnorr) and BIP 324 (ElligatorSwift) vectors; secret-key
  operations go through OpenSSL.

### Stratum V1

- `mining.configure` answers every requested extension per BIP 310 and
  narrows the version-rolling mask to the bits the miner asked for; a coin
  without `version_mask` now answers `version-rolling: false` instead of
  silence.
- `mining.suggest_difficulty` is honoured within the port's varDiff range
  (never below a fixed port's difficulty) and applied immediately.

### Chains and examples

- Segwit blocks serialize the coinbase with its witness (marker, flag and
  the 32-byte reserved value); Bitcoin mainnet/testnet4 blocks were
  rejected without it.
- Bitcoin Core's `testnet4` and `signet` are recognised as test networks.
- New examples: Bitcoin (mainnet and testnet4, with a Stratum V2 port) and
  Ethereum Classic (Etchash, ECIP-1017 reward schedule). The generic
  samples and the quick start use Bitcoin.

### Codebase

- Every backend module is an ES class (no more `Object.setPrototypeOf`
  constructor functions); `var` is gone and the lint rules enforce it.
- Dependencies refreshed; the last CommonJS test is TypeScript.
- CI tests on Node 22, 24 and 26 with the runner's default GCC; the Docker
  image is Debian 13 and no longer inherits the host's addon build.

### Documentation

- New: `docs/adding-a-coin.md` (coin definition and pool config field by
  field, overt AsicBoost, port sizing for 2026 hardware, miner software,
  regtest/testnet rehearsal), `docs/stratum-v2.md`.
- Rewritten: `docs/guide.md` (operator guide), `docs/stratum.md` (protocol
  reference and programmatic use), `README.md` (documentation index).

## 1.1.0 — 2026-08-03

Ethash-family pools, ten payment schemes, the single-repository layout.
See the GitHub release.

## 1.0.0 — 2026-08-02

First release of the consolidated NAMP (portal, stratum, hashing).
