# Network access: what is blocked, what is not, and what each unblocks

Measured from this environment, not assumed. Every "blocked" line below was
verified by an actual request; every "reachable" line by an actual transfer.

## Verified state

| Host | Result | Notes |
|---|---|---|
| `api.sleeper.app` | **403 at CONNECT** | league, rosters, drafts, picks, players |
| `sleepercdn.com` | **403 at CONNECT** | avatars and player images — a *separate* host from the API, and blocking it alone leaves the site rendering broken images |
| `fantasyfootballcalculator.com` | **403 at CONNECT** | ADP, including the per-player sd the survival model currently substitutes a heuristic for |
| `www.fantasyfootballcalculator.com` | **403 at CONNECT** | listed separately on purpose — see below |
| `makefbgreatagain.netlify.app` | **403 at CONNECT** | the live site; blocks post-deploy verification |
| `github.com` | reachable | |
| `raw.githubusercontent.com` | reachable | |
| `release-assets.githubusercontent.com` | reachable | 19.4 MB of nflverse play-by-play pulled successfully |

## Why the apex and the `www` host are both listed

The 403 happens at **CONNECT**, before any HTTP request is sent. That means a
redirect is indistinguishable from the host being down: the proxy refuses the
tunnel, and no `Location` header ever exists to follow. If FFC redirects apex
to `www` and only the apex is allowlisted, the fetch fails with a proxy error
that looks exactly like FFC having an outage — the wrong diagnosis, at the
worst possible time. Allowlisting both costs nothing and removes the ambiguity.

The same reasoning covers Sleeper: `api.sleeper.app` is the API, `sleepercdn.com`
is the image host, and allowlisting only the first produces a site that loads
data fine and renders every avatar broken.

## What each bucket actually unblocks

**Bucket 1 — needs the allowlist.** Live Sleeper reads (real rosters, real
keeper state, real draft picks), FFC ADP with real per-player dispersion, and
post-deploy checks against the live site.

**Bucket 2 — needs nothing.** Already flowing over
`release-assets.githubusercontent.com`: nflverse play-by-play. This is the same
source the Part 7 metric work needs, so that work is unblocked *now* and does
not wait on any policy change.

**Bucket 3 — nothing unlocks it.** The dress rehearsal: a phone, a Sleeper
mock, three rounds minimum. No allowlist entry substitutes for running the
advisor under real clock pressure.

## Rule for this repo

Per `/root/.ccr/README.md`: never disable TLS verification, never unset
`HTTPS_PROXY`, and do not retry an organization policy denial (403/407) —
report it. A 403 at CONNECT is a policy answer, not a transient failure, and
retrying it just produces the same answer more slowly.

Separately, and unrelated to policy: Sleeper's own API was hit five times in
twenty minutes during one debugging session and started timing out. That is a
rate limit doing its job. Cache aggressively; a build that re-fetches the
player list on every run will get throttled on draft day, when it matters most.
