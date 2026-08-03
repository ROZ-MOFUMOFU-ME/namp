# Ethash / Etchash pools

NAMP serves the Ethash family (Ethereum, Ethereum Classic, VirBiCoin, …)
through a separate path from the Bitcoin-family coins, because the work model
is different: there is no coinbase to build, no merkle tree and no header for
the pool to serialize. The daemon hands out sealed work and the miner returns
the nonce plus the mix it derived from the DAG.

```
eth_getWork    -> [headerHash, seedHash, boundary, blockNumber]
eth_submitWork <- [nonce, headerHash, mixHash] -> true when accepted
```

## Daemon requirements

**The node must be started with the miner engaged but no local threads:**

```bash
gvbc --http --http.addr 127.0.0.1 --http.api eth,net,web3 \
     --mine --miner.threads=0 --miner.etherbase 0xYourPoolAddress
```

- `--mine` is what makes the node _prepare_ sealing work; without it
  `eth_getWork` answers `no mining work available yet` and the pool cannot
  start.
- `--miner.threads=0` stops the node from solving that work itself. Leaving
  the node mining with threads means it competes with your miners for the
  same blocks.
- `--miner.etherbase` is the address the block reward is paid to.
- The pool sends `Content-Type: application/json` on every RPC because
  geth-family nodes reject anything else.

## Pool configuration

```json
{
    "coin": "virbicoin.json",
    "ports": { "3333": { "diff": 4000000000 } },
    "daemons": [
        { "host": "127.0.0.1", "port": 8329, "user": "", "password": "" }
    ]
}
```

`diff` is the share difficulty each miner hashes against. The pool derives the
share boundary from it and sends that to miners — never the network boundary —
then decides separately whether a share also solved the block.

Ports take the same knobs as the Bitcoin-family stratum
(pool_configs/examples/virbicoin.json shows the full shape):

- **varDiff** retargets each miner toward `targetTime` seconds per share
  within `[minDiff, maxDiff]`; the new boundary reaches the miner with the
  next pushed job. This is what keeps one port usable for rigs of very
  different sizes and the hashrate chart smooth.
- **banning** applies the standard policy: after `checkThreshold` shares, an
  IP whose invalid percentage exceeds `invalidPercent` is banned for `time`
  seconds (with the verdict still delivered before the socket closes).
- **connectionTimeout** drops miners that stopped talking.

Coin definitions take an optional `epochLength`:

| Chain                        | epochLength     | Note                        |
| ---------------------------- | --------------- | --------------------------- |
| Ethash (Ethereum, VirBiCoin) | 30000 (default) |                             |
| Etchash (Ethereum Classic)   | 60000           | ECIP-1099 halves DAG growth |

## Miner setup

The stratum ports speak the **eth-proxy** dialect, which ethminer, T-Rex,
lolMiner, NBMiner and gminer all support:

```bash
ethminer -P stratum1+tcp://0xYourWallet.rig1@pool-host:3333
t-rex -a ethash -o stratum1+tcp://pool-host:3333 -u 0xYourWallet -w rig1
```

Miners log in with `eth_submitLogin`, receive work unsolicited (id 0) on every
new block, and submit with `eth_submitWork`. `eth_submitHashrate` is
acknowledged but only informational.

## How a share is checked

Share validation is two-tier, which is what keeps a pool both fast and honest:

1. **Every share** gets a keccak-only check against the miner's boundary — no
   DAG, no cache, microseconds.
2. **Only a block candidate** pays for the cache-backed check that proves the
   mix really came from the DAG. A miner cannot invent a mix that survives it,
   and the pool never relays garbage to the network.

Only after that does the pool call `eth_submitWork`, and anything other than a
literal `true` counts as a rejection.

## Block maturity and payouts

An Ethash block pays its reward to the node's etherbase, so there is no
wallet transaction for the pool to watch. NAMP's ethash payment processor
follows the open-ethereum-pool model instead — enable it per pool:

```json
"paymentProcessing": {
    "enabled": true,
    "paymentInterval": 600,
    "blockCheckInterval": 60,
    "minConf": 120,
    "blockReward": 2,
    "minimumPayment": 0.5,
    "accountPassword": "optional keystore password"
}
```

Two clocks, because maturity and money are different jobs:

- **`blockCheckInterval`** (seconds, default `min(paymentInterval, 60)`,
  floor 15) — how often matured blocks are resolved, credited to balances
  and moved out of the pending list. Keep this short: it is what the UI's
  block list reflects, and it costs only chain reads.
- **`paymentInterval`** (seconds, floor 30) — how often balances at or above
  `minimumPayment` are actually sent. Long intervals here are normal; they
  batch transfers and save fees, and they no longer leave matured blocks
  showing as pending while they wait.

`blockReward` is the flat per-block subsidy. Chains that step their subsidy
down over time declare a schedule in the **coin definition** instead, and it
takes precedence; the entry with the highest height at or below the block
applies (see coins-examples/virbicoin.json for the full VirBiCoin schedule
taken from go-virbicoin's calcBlockReward):

```json
"blockRewardSchedule": [
    { "height": 0, "reward": 8 },
    { "height": 4200000, "reward": 7 }
]
```

Uncle credits scale with the reward of the block that included the uncle,
matching the consensus formula.

### Pool fees

The pool's cut comes from `rewardRecipients` in the pool config, the same key
the Bitcoin-family pools use, and is taken off each block before miners are
paid:

```json
"rewardRecipients": { "0xYourFeeAddress": 1.0 }
```

Each recipient is credited in the same ledger as a miner, so the fee is paid
out by the normal payout run. Keys that are not addresses are ignored, which
is what keeps the `_comment` in the shipped example from being treated as a
recipient.

### Payment modes

`paymentMode` selects how each matured block is divided:

| Mode             | Who gets paid                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prop` (default) | The block's round shares, proportionally                                                                                                                               |
| `solo`           | The block finder takes the entire reward                                                                                                                               |
| `pplns`          | The last-N-shares window snapshotted at find time; `pplns.n` sizes the window as N x the block's difficulty (share difficulty already counts hashes, so no multiplier) |

An empty PPLNS window (fresh pool) falls back to the round shares rather
than burning the block.

Each cycle, every pending block candidate old enough (`minConf`
confirmations) is resolved against the chain itself:

| On chain                                   | Credit                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| The block at that height carries our nonce | `blockReward` + tx fees + uncle-inclusion bonus (`blockReward/32` each) |
| An uncle within 7 blocks carries our nonce | `blockReward × (8 − depth) / 8`                                         |
| Neither                                    | Orphan — its round's shares return to the current round                 |

Credits are split over the block's round shares and held in **wei**
(BigInt end to end; a float cannot represent wei) in `<coin>:balances`.

Payouts aggregate every rig of a wallet, and any wallet at or above
`minimumPayment` is paid with a single `eth_sendTransaction` from the pool
`address` — which **must be an account the node holds a key for**. Check the
two agree before you rely on payouts:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":1}' \
  http://127.0.0.1:8545
```

If the pool `address` is not in that list, either set it to one that is, or
import the key (`gvbc account import`). NAMP checks this at startup and says
so rather than letting the mismatch surface hours later as "no key for given
address". That means **the node must hold the pool address's key** (import
it into the node keystore); set `accountPassword` to have NAMP unlock it
with `personal_unlockAccount` first (requires the `personal` API), or keep
the account unlocked with `--unlock`. Payments are recorded in
`<coin>:payments` for the web UI.

## Upgrading from a pre-1.1.0 ledger

Before v1.1.0 the Ethash payment processor wrote `<coin>:balances` in **wei**,
while the rest of the portal reads that field in **coins**. If your pool
credited any balance before upgrading, those entries are 10^18 times too
large and the pool will refuse to pay them, logging the worker and this
section.

Convert them once, with the pool stopped:

```bash
redis-cli -h <host> hgetall <coin>:balances     # inspect first

# For each wei-format entry, set the coin value:
redis-cli -h <host> hset <coin>:balances "0xwallet.rig" 391
```

Balances credited after the upgrade are already in coins, so an entry may be
a _sum_ of both — for example `242000000000000000149` is 242 VBC of legacy wei
plus 149 VBC credited since, i.e. 391 VBC. Cross-check against the pool's
confirmed blocks (`scard <coin>:blocksConfirmed` x the block reward) before
writing the value.
