# Adding a coin

NAMP runs any chain that fits one of two families:

- **Bitcoin family** — the daemon answers `getblocktemplate` (BIP 22/23), the
  pool assembles the coinbase and the block, miners hash an 80-byte header
  (or the chain's variant of it) with one of the [56 native algorithms](../native/README.md).
  Bitcoin, Litecoin-style scrypt chains, the yescrypt/yespower CPU coins,
  the X11…X25X chains, PoW/PoS hybrids, Sapling/Koto-style blocks and the
  qtum-style 181-byte header (VIPSTARCOIN) all live here.
- **Ethash family** — a geth-family node hands out work over `eth_getWork`
  and the pool verifies solutions itself: Ethereum Classic (Etchash),
  VirBiCoin and any other Ethash chain. Its own guide is
  [ethash.md](ethash.md); the port-sizing and hardware notes below apply to
  it too.

Not covered: RandomX (Monero's RPC and stratum are different), KawPow /
ProgPoW (the hash is in the addon and verified against Ravencoin's vectors,
but the ProgPoW stratum dialect is not implemented), kHeavyHash (Kaspa speaks
gRPC), Autolykos, Equihash stratum, and merged mining (AuxPoW) — a Litecoin
pool without Dogecoin on the side is not competitive today.

Everything below is for the Bitcoin family. The shipped examples in
[`coins/coins-examples/`](../coins/coins-examples/) and
[`pool_configs/examples/`](../pool_configs/examples/) are the templates;
`npm run check:config` validates every JSON file the portal reads.

## 1. Run the daemon

Build the chain's daemon, sync it fully and give it an RPC login and a wallet
that holds the pool address:

```ini
# ~/.bitcoin/bitcoin.conf — the same keys exist in every Bitcoin-derived wallet
server=1
rpcuser=rpcuser
rpcpassword=rpcpassword
rpcallowip=127.0.0.1
# The pool connects as a P2P peer for instant block notifications and never
# relays transactions; whitelist it so the node does not score it down.
whitelist=127.0.0.1
```

Check the three calls the pool depends on before touching NAMP:

```bash
bitcoin-cli getblocktemplate '{"rules": ["segwit"]}'   # a template with coinbasevalue
bitcoin-cli validateaddress <pool address>             # isvalid: true
bitcoin-cli getaddressinfo <pool address>              # ismine: true (0.17+; older daemons report it in validateaddress)
```

`getblocktemplate` refuses to answer until the node is synced and has peers.
Old wallets that only know `getinfo` are supported through the `getInfo` /
`noNetworkInfo` / `noGetnetworkhashps` flags in the coin definition.

## 2. Write the coin definition

`coins/<name>.json` describes the chain itself and is shared by every pool
config that points at it. Start from
[`coins/coins-examples/bitcoin.json`](../coins/coins-examples/bitcoin.json)
(a plain SHA-256 chain) or the example closest to your coin.

| Field                                            | Required   | Meaning                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `symbol`                                 | yes        | `name` (lower-cased) is the pool's key everywhere: Redis prefixes, the API, the web UI. Keep testnet definitions distinct (`Bitcoin_testnet4`).                                                             |
| `algorithm`                                      | yes        | A key of [`src/algoProperties.ts`](../src/algoProperties.ts) — `sha256`, `scrypt`, `scrypt-n`, `x11`, `x16r`, `lyra2rev2`, `yescryptR8`, `yespower`, `blake3`, `vipstar`, … (full list below).              |
| `peerMagic`, `peerMagicTestnet`                  | for p2p    | `pchMessageStart` from the daemon's `chainparams.cpp`, as hex. Needed only when the pool config enables `p2p` block notifications.                                                                          |
| `blockTime`                                      | yes        | Target seconds per block; drives the luck and network-hashrate figures.                                                                                                                                     |
| `txfee`                                          | no         | Transaction-fee reserve per payout (default `0.0004`). Match an old wallet's `paytxfee` so payouts never stall on "Insufficient funds".                                                                     |
| `version_mask`                                   | SHA-256    | Hex mask of header-version bits miners may roll — see **Version rolling (AsicBoost)** below. `"1fffe000"` for Bitcoin and nearly every SHA-256 fork; omit for other algorithms.                             |
| `mainnet`, `testnet`                             | yes        | Address parameters as **hex strings**: `pubKeyHash`, `scriptHash`, `bip32.public`, plus `bech32` for chains with native segwit (`bc`/`tb`). Needed to turn addresses into coinbase scripts.                 |
| `getInfo`, `noNetworkInfo`, `noGetnetworkhashps` | no         | Compatibility flags for daemons that still speak `getinfo` or lack `getnetworkinfo` / `getnetworkhashps`.                                                                                                   |
| `reward`                                         | no         | `"POW"` or `"POS"`. Auto-detected from `getdifficulty`; PoS chains need the pool address in the daemon's wallet because the coinbase pays to its public key.                                                |
| `networkHashFromDiff`                            | hybrids    | PoW/PoS hybrids report a `networkhashps` that folds in the PoS difficulty; set this to derive the PoW hashrate from the difficulty instead (VIPSTARCOIN, KumaCoin).                                         |
| `txMessages`                                     | no         | The chain's transactions carry a message field (old Bitcoin forks).                                                                                                                                         |
| `passAlgorithm` / `passAlgorithmKey`             | multi-algo | Daemons that mine several algorithms (Myriad-style) take the algorithm as a `getblocktemplate` argument or key; `true` passes `algorithm`, a string passes that name.                                       |
| `nValue`, `rValue`                               | scrypt     | Scrypt parameters (default 1024 / 1). `scrypt-n` takes a `timeTable`, `scrypt-jane` `chainStartTime` / `nMin` / `nMax`; `keccak` chains that hash the coinbase with sha256d set `normalHashing`.            |
| `explorer`                                       | no         | `txURL`, `blockURL`, `address` — link targets on the blocks, payments and worker pages.                                                                                                                     |
| `miningTools`                                    | no         | `[{ "name", "url" }]` shown on the Getting Started page. List what miners actually use today (see **Miners by algorithm**).                                                                                 |
| `subVersion`                                     | no         | Template such as `"/Satoshi:{version}/"` for getinfo-only daemons that do not report their user agent.                                                                                                      |
| `coingecko`, `coinpaprika`                       | no         | Price-feed ids (the portal config's `priceFeed.coins` can carry them instead).                                                                                                                              |
| Zcash/Koto family                                | Sapling    | `sapling`, `requireShielding`, `kotoFoundersReward`, `nSubsidyHalvingInterval`, … — copy [`koto.json`](../coins/coins-examples/koto.json); the pool config adds `zAddress` / `tAddress` / `walletInterval`. |
| Ethash family                                    | ethash     | `epochLength` (30000, or 60000 for Etchash) and `blockRewardSchedule`; see [ethash.md](ethash.md).                                                                                                          |

`_comment_*` keys are ignored, so annotate freely.

### Which network parameters are used

The pool asks the daemon which chain it is on. `main` uses `mainnet`;
`test` (testnet3), `testnet4` and `signet` use `testnet`. Regtest is treated
as mainnet, so a regtest setup carries its own definition under
`coins/regtest/` (git-ignored) with regtest's prefixes in `mainnet`.

### Version rolling (overt AsicBoost)

Every SHA-256 ASIC made since 2018 — Antminer S9 firmware onward, the whole
S17/S19/S21/S23 and Whatsminer M-series lines, Avalon, and the Bitaxe family
of home miners — implements **overt AsicBoost** ([BIP 320](https://github.com/bitcoin/bips/blob/master/bip-0320.mediawiki)):
it rolls bits 13–28 of the block header's version field as extra nonce
space. Candidates that differ only in those bits share the second 64-byte
SHA-256 chunk, so the chip computes that chunk's message expansion once
and reuses it, which cuts energy per hash by roughly 10–20 %. (The covert
variant that reordered transactions is dead since segwit's witness
commitment.)

The miner negotiates it over stratum with
[BIP 310](https://github.com/bitcoin/bips/blob/master/bip-0310.mediawiki)'s
`mining.configure`:

```jsonc
→ {"id":1,"method":"mining.configure","params":[["version-rolling"],{"version-rolling.mask":"1fffe000","version-rolling.min-bit-count":2}]}
← {"id":1,"result":{"version-rolling":true,"version-rolling.mask":"1fffe000"},"error":null}
   … later, mining.submit carries the rolled bits as a sixth parameter:
→ {"id":7,"method":"mining.submit","params":["bc1q….rig1","job","extranonce2","ntime","nonce","00e00000"]}
```

NAMP turns this on when the coin definition carries `version_mask`. The pool
then answers `mining.configure` with `version-rolling: true` and the mask
(intersected with the mask the miner asked for), rejects any share whose
version bits fall outside it, and builds the header as
`(template.version & ~mask) | (bits & mask)` before hashing. The startup log
reports `ASICBoost Enabled: true`. Without a mask the pool answers
`version-rolling: false`; the firmware then falls back to plain nonce
rolling, runs hotter, and recent Bitmain firmware refuses the pool outright.
Set the mask for every SHA-256 chain.

Which mask: Bitcoin and almost every SHA-256 fork accept `1fffe000`, the
16 bits BIP 320 reserved so they never collide with BIP 9 deployments. A
chain that uses other version bits for its own signalling must narrow the
mask to the bits its consensus rules ignore — check `versionbits.cpp` /
`consensus/params.h` of the daemon. AsicBoost is a property of SHA-256d:
scrypt, Ethash and the CPU algorithms gain nothing from it, so leave
`version_mask` out of their definitions.

### Algorithm names

`algorithm` must match a key in `src/algoProperties.ts`. The current keys:

`sha256` `sha256d` `scrypt` `scrypt-og` `scrypt-jane` `scrypt-n` `sha1`
`sha512256d` `blake2b` `blake3` `x11` `x13` `x15` `x16r` `x16rv2` `x16s`
`x16rt` `x17` `x21s` `x22i` `x25x` `skydoge` `nist5` `quark` `keccak`
`allium` `blake` `blake2s` `skein` `groestl` `groestlmyriad` `fugue`
`shavite3` `hefty1` `neoscrypt` `minotaur` `lyra2` `lyra2v2` `lyra2v3`
`lyra2re` `lyra2re2` `lyra2rev2` `lyra2z` `qubit` `odo` `yescryptR8`
`yescryptR8G` `yescryptR16` `yescryptR24` `yescryptR32` `yespower`
`yespowerSUGAR` `yespowerLTNCG` `yespowerR16` `yespowerURX` `vipstar`

Each entry also fixes the **difficulty multiplier**: a share of difficulty
`d` is expected to take `d × 2³² ÷ multiplier` hashes. SHA-256 and the
X-chains use 1 (difficulty 1 = 2³² hashes), scrypt and the yescrypt/yespower
family use 2¹⁶ (difficulty 1 = 65 536 hashes), lyra2 variants 2⁷–2⁸. That is
why the CPU-coin examples run ports at difficulty 0.5 while a Bitcoin port
starts in the thousands. An algorithm missing from the list is added in
three places — the native hasher, the `algoProperties` entry and a
known-answer test — see "Adding an algorithm" in
[native/README.md](../native/README.md).

## 3. Write the pool config

`pool_configs/<name>.json` is one pool on one chain: its stratum ports, its
payout rules and its daemons. Copy
[`pool_configs/examples/bitcoin.json`](../pool_configs/examples/bitcoin.json)
and fill in:

| Field               | Meaning                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coin`              | The coin definition's file name, relative to `coins/` (`"bitcoin.json"`, `"testnet/bitcoin.json"`).                                                                                                                                                                                                               |
| `address`           | The pool wallet address every block reward is paid to; it must belong to the daemon's wallet. bech32 works when the coin definition carries `bech32`.                                                                                                                                                             |
| `rewardRecipients`  | `{ "address": percent }` pool fees, paid as extra coinbase outputs. Keep each output above the chain's dust limit (546 sat on Bitcoin).                                                                                                                                                                           |
| `blockIdentifier`   | Text embedded in the coinbase so explorers can attribute your blocks; empty uses `website.stratumHost`.                                                                                                                                                                                                           |
| `paymentProcessing` | `paymentMode` (`prop`, `pplnt`, `pplns`, `solo`, `pps`, `dpps`, `fpps`, `ppsplus`, `smpps`, `esmpps` — [payment-schemes.md](payment-schemes.md)), `minConf` (at least the chain's coinbase maturity: 100 on Bitcoin), `paymentInterval`, `minimumPayment`, `maxBlocksPerPayment`, and its **own** `daemon` login. |
| `ports`             | One entry per stratum port: `diff`, optional `varDiff { minDiff, maxDiff, targetTime, retargetTime, variancePercent }`, `tls`. Sizing below.                                                                                                                                                                      |
| `daemons`           | One or more RPC endpoints; every one is polled and any one can submit a block.                                                                                                                                                                                                                                    |
| `p2p`               | Connect to the daemon's P2P port for instant block notifications (needs `peerMagic`). `disableTransactions: true` keeps the node from relaying its mempool to the pool.                                                                                                                                           |
| `getwork`           | HTTP getwork bridge for the few miners that cannot speak the qtum-style stratum (VIPSTARCOIN); leave disabled otherwise.                                                                                                                                                                                          |
| `tlsOptions`        | Certificate for ports marked `tls: true` — [stratum-tls.md](stratum-tls.md).                                                                                                                                                                                                                                      |
| `poolId`            | Region label when several stratum instances serve one coin.                                                                                                                                                                                                                                                       |
| overrides           | Anything in the portal config's `defaultPoolConfigs` (`banning`, `connectionTimeout`, `blockRefreshInterval`, `jobRebroadcastTimeout`, `validateWorkerUsername`, `tcpProxyProtocol`, `redis`) can be set per pool.                                                                                                |

### Sizing ports for today's hardware

Pick the starting `diff` so a typical miner on that port submits a share
every `targetTime` seconds, then let varDiff keep it there:

```
diff = hashrate × targetTime × multiplier ÷ 2³²
```

Worked examples (15 s target unless noted):

| Algorithm                               | Miner class, 2026                                                | Typical hashrate       | Starting diff        |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------------- | -------------------- |
| sha256 (multiplier 1)                   | Home ASIC (Bitaxe Gamma, NerdQAxe, Avalon Nano)                  | 1–5 TH/s               | 4 000 – 16 000       |
|                                         | Hashboard ASIC (Antminer S21/S23, Whatsminer M60/M70, SealMiner) | 200–1 200 TH/s         | 700 000 – 4 000 000  |
|                                         | Farm proxy (many machines, one connection)                       | 1 PH/s and up          | 2²² and up           |
| scrypt (2¹⁶)                            | Antminer L9, Elphapex DG1+, Goldshell home units                 | 0.5–17 GH/s            | 100 000 – 4 000 000  |
| ethash / etchash (diff in hashes)       | Antminer E9 Pro / E11, Jasminer X-series; RTX 4090-class GPUs    | 3–10 GH/s; 60–130 MH/s | hashrate × target    |
| lyra2rev2, x16r family, other GPU algos | Current GPUs (lolMiner, Rigel, BzMiner, SRBMiner, ccminer forks) | 10–100 MH/s per card   | 0.1 – 10 (×2⁷ algos) |
| yescrypt / yespower (2¹⁶)               | Desktop CPUs (cpuminer-opt, cpuminer-opt-rplant, SRBMiner-Multi) | 1–10 KH/s per CPU      | 0.25 – 2             |

Rules of thumb:

- A `varDiff` range of about 2¹⁰–2¹² between `minDiff` and `maxDiff` covers
  one hardware class; offer a second port rather than one enormous range.
  The Bitcoin example runs 3333 for home ASICs and 3334 for hashboards.
- A difficulty above the network difficulty is pointless; the Ethash pool
  caps it and warns at startup, size Bitcoin-family ports sensibly.
- Miners may ask for a difficulty with `mining.suggest_difficulty` (Bitaxe,
  Braiins OS, NiceHash and most proxies do). The pool honours it within the
  port's `varDiff` bounds, or never below a fixed port's `diff`.
- The password field accepts `d=<diff>` (starting difficulty) and
  `md=<diff>` (minimum, enables a narrow varDiff); `m=solo` marks a worker
  as solo on pools whose payment mode supports it.
- NiceHash and similar rental services identify themselves in
  `mining.subscribe` and get the algorithm's documented minimum difficulty
  and `mining.extranonce.subscribe`; nothing to configure.

### Miners by algorithm

What people actually run in 2026, for the `miningTools` list and your
Getting Started page:

| Family                                 | Software                                                                                                                                                                                                                                                  | Connect with                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| SHA-256 ASIC                           | Stock firmware, [Braiins OS](https://braiins.com/os), LuxOS, Vnish; [Bitaxe / AxeOS](https://bitaxe.org/) for home miners; `cgminer` for bench tests                                                                                                      | `stratum+tcp://host:3333`, user `<address>.<rig>`, password `x`                  |
| Scrypt ASIC                            | Stock firmware (Bitmain, Elphapex, Goldshell)                                                                                                                                                                                                             | same                                                                             |
| Ethash / Etchash                       | [lolMiner](https://github.com/Lolliedieb/lolMiner-releases/releases), [Rigel](https://github.com/rigelminer/rigel/releases), [BzMiner](https://www.bzminer.com/), T-Rex (unmaintained since 2023 but still common); Antminer E-series / Jasminer firmware | see [ethash.md](ethash.md) for the per-miner scheme (`stratum1+tcp`, `ETHPROXY`) |
| GPU algorithms (lyra2, x16r family, …) | lolMiner, [SRBMiner-Multi](https://github.com/doktor83/SRBMiner-Multi/releases), ccminer forks (KlausT, tpruvot) for older algorithms                                                                                                                     | `stratum+tcp://host:port`, user `<address>.<rig>`                                |
| CPU algorithms (yescrypt, yespower, …) | [cpuminer-opt](https://github.com/JayDDee/cpuminer-opt/releases), [cpuminer-opt-rplant](https://github.com/rplant8/cpuminer-opt-rplant/releases), SRBMiner-Multi                                                                                          | `cpuminer -a yespower -o stratum+tcp://host:3333 -u <address>.<rig> -p x`        |

Stratum **V1** is what every one of these speaks, with the BIP 310
extensions above. Stratum V2 (encrypted transport, miner-side transaction
selection) is in production at a handful of Bitcoin pools and in Braiins OS;
NAMP does not implement it. SV2 firmware reaches an SV1 pool through the
Stratum Reference Implementation's translation proxy.

## 4. Start and verify

```bash
cp coins/coins-examples/bitcoin.json coins/
cp pool_configs/examples/bitcoin.json pool_configs/
#   fill in address, daemons, paymentProcessing.daemon
npm run check:config    # every JSON file parses
npm start
```

The startup log prints the detected network, reward type, `ASICBoost
Enabled`, the pool address script, the block height and the ports it opened;
`Stratum Pool Server Started for <coin>` means the first template was built.
Then connect a miner and watch:

```bash
cpuminer -a sha256d -o stratum+tcp://127.0.0.1:3333 -u <address>.test -p x
curl -s http://127.0.0.1:8080/api/stats | jq '.pools.bitcoin | {hashrate, workerCount, blocks}'
```

Rehearse on **regtest** before testnet: `bitcoind -regtest`, generate 101
blocks to the pool address (`generatetoaddress 101 <address>`), run the pool
against port 18443 with a `coins/regtest/bitcoin.json` whose `mainnet`
block carries regtest's prefixes (`6f` / `c4` / `bcrt`), and mine with a
CPU miner: a found block appears on the Blocks page within seconds, and the
payment processor pays it once it has `minConf` confirmations. Testnet4
(`-testnet4`, RPC 48332, P2P 48333) is the dress rehearsal with real peers;
its example configs are `coins/coins-examples-testnet/bitcoin.json` and
`pool_configs/examples/bitcoin_testnet.json`.

## 5. Checklist

- [ ] Daemon synced, `getblocktemplate` / `validateaddress` / `getaddressinfo` answer, pool IP whitelisted
- [ ] `coins/<name>.json`: algorithm key, magic bytes, address parameters (hex), `version_mask` on SHA-256 chains, explorer and miner links
- [ ] `pool_configs/<name>.json`: pool address in the wallet, both daemon logins, `minConf` ≥ coinbase maturity, ports sized for the hardware you expect
- [ ] `npm run check:config` passes; `npm start` prints the started-server line
- [ ] A miner submits accepted shares; a regtest or testnet block is found, matures and pays out
- [ ] Firewall / TLS / reverse proxy per [security.md](security.md), [stratum-tls.md](stratum-tls.md), [reverse-proxy.md](reverse-proxy.md)
