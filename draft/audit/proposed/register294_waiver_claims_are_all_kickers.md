# Register 294 — the waiver page's eight claims are eight kickers. Two filter lines.

**E, 2026-08-24. For B.** Apply with
`git apply draft/audit/proposed/register294_waiver_claims_are_all_kickers.patch`.

## What it changes

Three lines of logic in `src/waiver_reco.js`; everything else in the diff is the
comment explaining why.

```js
- out.claims = res.claims.filter(c => c.net_value > 0).slice(0, 8);
+ const ONESIE = c => c.position === 'K' || c.position === 'DEF';
+ out.claims = res.claims.filter(c => c.net_value > 0 && !ONESIE(c)).slice(0, 8);

- out.streamClaims = res.claims.filter(c => (c.position === 'K' || c.position === 'DEF')
-   && c.net_value > 0).slice(0, 2);
+ out.streamClaims = res.claims.filter(c => ONESIE(c) && c.net_value > 0).slice(0, 2);
```

**It is a filter on which block a claim renders in. The valuation is untouched** —
`evaluateClaims`, `claimValue`, `startableValue`, `lineupPoints` all unchanged.

## Why

`evaluateClaims` sorts on `net_value` = lineup points gained. A position with an
**empty starting slot** books the candidate's *whole season projection* as the
gain. Cory drafted no kicker (register 275), so every free kicker outranks every
real upgrade:

- **33 consecutive kickers** before the first non-kicker
- the weakest one shown is **87.8 points below replacement**
- the tight-end upgrade — the largest positional hole on any roster in this
  league — is at **rank 34** and never renders
- the top two render **twice on one page**, because `streamClaims` is the same
  ranking filtered to K/DEF

The arithmetic is right and the ranking is not a ranking: he can start one
kicker, so the block presents one decision eight times.

## Before / after, through the real function

`node draft/audit/proposed/register294_endtoend_control.js` drives the actual
`computeWaiverReco` — the one both the page and the Tuesday cron call, not a
re-implementation of its filter — on Cory's real post-draft roster.

```
BEFORE  claims (8): K Mevis · K Santos · K Folk · K McLaughlin · K Loop · K Grupe · K McPherson · K Lutz
        stream (2): K Mevis · K Santos
        onesies in the claims block: 8

AFTER   claims (8): TE Strange · TE Johnson · TE Hockenson · TE Schultz · TE Freiermuth · TE Sadiq · TE Dulcich · TE Okonkwo
        stream (2): K Mevis · K Santos        <- unchanged
        drop: Emmett Johnson                  <- unchanged
        onesies in the claims block: 0
```

The bundle is synthesised from committed data (pick log + board) because Sleeper
egress is blocked from the sandbox. That is a limit on the *inputs*, not on the
code path: the function under test is the shipped one.

## The one consequence you should rule on rather than discover

**It moves what the Tuesday cron grades.** `waiver_reco`'s ledger row logs
`claims[0]` as the tool's headline advice. With onesies excluded, that headline
becomes the best real claim instead of the best kicker.

I believe that is correct — a kicker stream is a free weekly swap, not a
priority-costly claim, which is the entire reason `streamClaims` exists as a
separate decision shape — but it changes the population the shadow ledger scores
from this week forward, so it is named here instead of turning up in a grade.

## What this deliberately does NOT do

Register 294's REC is the general form: **cap claims per position at the number
of open slots at that position.** That is the right long-run rule — the flood
fires for *any* unfilled position, not only kicker — but it needs open-slot
counts `computeWaiverReco` does not currently compute. The onesie split fixes
the live case today, in the week it matters, and the general form stays on the
register rather than being smuggled in behind a two-line patch.

## Controls

- The patch applies clean to pristine `main` (`git apply --check`).
- The functional diff is exactly the three lines above; the rest is comment.
- The end-to-end harness is a **paired before/after on one tree**, so any
  difference is the patch and nothing else.
- `streamClaims` and `drop` are asserted unchanged, which is what makes this a
  re-routing rather than a re-ranking.

`ASK:` apply, or SEND BACK.
`DEFAULT:` if untouched, Cory's first waiver decision of the season is made off a
page whose entire visible surface is one choice repeated eight times.
