# Securing a NAMP deployment

A mining pool is an internet-facing service that holds other people's money.
This is what NAMP protects on its own, and what only you can do.

## The three things that matter most

**1. Redis is the pool's ledger.** Every share, every balance, every payment
record lives there. Anyone who can connect to an unauthenticated Redis can
rewrite what your miners are owed. Set a password and keep the port off the
public internet:

```conf
# redis.conf
requirepass <a long random string>
bind 127.0.0.1                 # or the private interface the pool uses
protected-mode yes
```

```json
"redis": { "host": "10.0.0.5", "port": 6379, "password": "…" }
```

The password can come from the `REDIS_PASSWORD` environment variable instead,
so it never sits in a config file. NAMP prints a `[SECURITY]` warning at
startup when it is told to reach a non-loopback Redis with no password.

**2. The payout wallet.** For Ethash chains the node holds the key that signs
payouts. Keep the account locked and let NAMP unlock it per run
(`paymentProcessing.accountPassword`, which needs `personal` in
`--http.api`) rather than running the node with a blanket `--unlock`. Expose
the node's RPC on loopback only (`--http.addr 127.0.0.1`): it has no
authentication of its own, and `personal_*` on an open port is a wallet
handed to the internet.

**3. Keep only what you need reachable.** Miners need the stratum ports and
the website. Nothing else — Redis, the coin daemons' RPC, the CLI port —
should answer from outside the host.

```bash
ufw allow 8001:8009/tcp   # stratum
ufw allow 80,443/tcp      # website behind a reverse proxy
ufw deny 6379/tcp         # redis
```

## What the pool does for you

**Stratum ports** refuse `eth_getWork` and `eth_submitWork` before a
successful login, cap the request rate per connection (a flooding peer is
disconnected rather than served), drop a client that sends an oversized line
without a newline, and time out miners that stop talking. Optional banning
disconnects an IP whose invalid-share percentage crosses a threshold:

```json
"banning": {
    "enabled": true,
    "time": 600,
    "invalidPercent": 50,
    "checkThreshold": 500,
    "purgeInterval": 300
}
```

**The website** sends `Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer` on every response,
adds HSTS when TLS is enabled, hides its server header, and caps request
bodies at 64 KB.

The CSP is derived from your config rather than fixed, so it stays as tight
as your deployment allows:

- the SPA's own inline scripts are allowed by hash, not by opening the policy
- the font and icon CDNs the shell links are named explicitly
- `connect-src` gains only the origins of the `pingUrl`s in
  `branding.home.servers`, so the server cards can measure latency
- analytics origins appear only when `branding.analytics` is configured

Configure none of those and the policy stays at `'self'`. If you add a
server card or an analytics tag and the browser console reports a CSP
violation, restart the portal — the policy is built at startup.

**The admin API** compares passwords in constant time (a plain comparison
leaks the correct prefix through response timing), refuses every request when
`adminCenter.enabled` is true but the password is blank — the shipped example
leaves it that way — and locks an IP out for 15 minutes after five failures.
Leave `adminCenter.enabled: false` unless you actually use it.

## TLS

Terminate TLS at a reverse proxy for the website
([reverse-proxy.md](reverse-proxy.md)) and, if you offer encrypted stratum,
follow [stratum-tls.md](stratum-tls.md) — note that a port marked `tls: true`
refuses to open without a readable key and certificate rather than silently
falling back to plaintext, because miners send worker credentials expecting
an encrypted channel.

## Operating

- Run the portal as an unprivileged user; nothing here needs root.
- Ports below 1024 belong to a reverse proxy, not to Node.
- Take the pool's Redis into your backup rotation — balances live only there
  until they are paid out.
- Keep dependencies current: `npm audit` in CI, and Dependabot is configured
  in `.github/dependabot.yml`.

### Known advisory

`npm audit` reports a high-severity advisory against `react-router`
(GHSA-qwww-vcr4-c8h2, _RSC Mode CSRF Bypass_). It does not apply to this
deployment: the web UI is a client-side SPA using `BrowserRouter`, with no
React Server Components, no server actions and no router-side data mutations.
Downgrading to the one unaffected release (7.11.0) pulls in eight other
advisories, so NAMP tracks the latest 7.x instead. This will clear when
upstream backports the fix.

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/ROZ-MOFUMOFU-ME/namp/security/advisories/new)
rather than a public issue.
