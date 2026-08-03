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
    "paymentInterval": 120,
    "minConf": 120,
    "blockReward": 2,
    "minimumPayment": 0.5,
    "accountPassword": "optional keystore password"
}
```

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
`address`. That means **the node must hold the pool address's key** (import
it into the node keystore); set `accountPassword` to have NAMP unlock it
with `personal_unlockAccount` first (requires the `personal` API), or keep
the account unlocked with `--unlock`. Payments are recorded in
`<coin>:payments` for the web UI.
