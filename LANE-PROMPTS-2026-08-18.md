# PROMPTS FOR A, B AND C — 2026-08-18

*Cory: three sections, paste each one into its lane. They share a common first half
(§0) on purpose — the fix only works if all three do it.*

---

# §0 — SEND THIS PART TO ALL THREE (A, B AND C)

**Cory, 2026-08-18:** *"Communication needs to be better."* Here is the measurement,
the reason, and the one habit that fixes it.

## The measurement

`ROUTES.md` now has a latency check (`draft/tools/routes_response_check.js`, running
daily via `.github/workflows/inbox-health.yml`, published to `INBOX-HEALTH.md`):

```
343 items · 274 open · 131 BLOCKED (open, no DEFAULT, 3+ days old)
waiting on:   A 67 (oldest 4d)   ·   B 39 (5d)   ·   C 25 (5d)
```

**`DEFECT-REGISTER.md` has a latency guard. `PREDICTION-LEDGER.md` has one. `ROUTES.md`
— the actual inbox, the one place work is handed between lanes — had none.** That is
how nineteen commits of D's finished work sat invisible since 08-17, and how six asks
to E went unanswered for nine days.

## THE 131 ARE NOT 131 DECISIONS — read this before you panic

Most of them are **findings filed as FYI**, not asks. C's items to A are largely
*"here is what I measured"*; A's to B are largely *"here is a patch, the file is
yours."* Those need a **receipt**, not a ruling.

**So this is a bounded triage pass, not a wall.** Every blocked item is one of three
things:

| bucket | what you do | how long |
|---|---|---|
| **FYI / already handled** | check the box `- [x]`. Deleting the line is also a receipt. | seconds |
| **A real ask you can answer** | answer it, or **`SEND BACK: <reason>`** — a refusal with a reason is a complete answer | minutes |
| **A real ask you cannot answer yet** | add a **`DEFAULT:`** line saying what happens if you stay silent | seconds |

**Do the whole pass in one sitting.** Sorted oldest-first, most of your list will be
bucket 1.

## THE HABIT THAT SOLVES IT FOR GOOD — one line

> **Every ask you write carries a `DEFAULT:` — what the sender does if you never reply.**

This is not new. `OPERATING-MODEL.md` already says it: *"Every request carries an ASK,
EVIDENCE, a RECOMMENDATION and a DEFAULT, so silence is consent to the default and
nobody idles waiting."* **The rule existed and was not followed** — 274 open items, only
47 carry one. Now it is measured daily.

An ask **with** a default never blocks anyone, at any age, and never appears in that
131. An ask **without** one blocks its sender indefinitely. That is the whole mechanism.

## Two more things, then your lane-specific list

- **Push your branch daily, even unfinished.** `draft/tools/lane_status.js` reports
  commits `main` has never seen. A pushed branch is visible before it is routed; an
  unpushed one is invisible to everything. D's work was invisible for this reason, not
  because anyone ignored it.
- **The check RATCHETS.** It fails only when the backlog **grows** — never merely
  because it is large. Nobody is being asked to clear 131 before the draft. And the
  cheat (bolting `DEFAULT:` onto everything instead of answering) is detected and
  reported, so use it honestly: a default is a real decision about what happens next,
  not a mute button.

---

# §1 — FOR A

Keeper lock **08-20**, draft **08-22**. Your triage list is **67 items, oldest 4 days**,
mostly C reporting measurements to you. Do §0's pass first — it will be short.

Then, in this order:

### 1. `main`'s JS gate is red: 5 of 326 suites, and 4 are one cause

```
for f in draft/tests/*.test.js; do node "$f" >/dev/null || echo "$f"; done
```

| suite | what it says |
|---|---|
| `vona_wire_bench` | `draft/data/wire_level.json` does not match a fresh run of `wire_level.js` |
| `wire_one_source` | seat plan **WR 11.1 vs measured 10.85**, **n 113 vs 114** — stale by one player |
| `proj_sd_arm` | **164 of 535** banded rows disagree with the measured table; **Gibbs, Bijan and CMC declare `measured` while carrying a different sd** |
| `shadows` | 44/46 — both failures are the pick-33 **controls**, so the section is unanchored |
| `intervention-rate` | 8/9 — needs a ruling from you, see item 2 |

**The first four are the 03:49 rebuild landing without its derived artifacts.**
`wire_level.json` and the seat plan are pure recomputations — regenerate them.
**`proj_sd_arm` is the serious one:** a row claiming a provenance it does not carry is a
false statement about three of the biggest names on the board, four days out. Establish
whether the board or the table is wrong before regenerating either.

**Rule 3g on this:** if one rebuild can silently desync three artifacts, what else
derives from the board with no parity test at all? TODO #46 says a freshness registry
was supposed to make this class impossible.

### 2. `intervention-rate` needs a RULING, not a fix

Red on `no term is dead unexpectedly -> ["keeper"]`. **Already diagnosed — do not
re-diagnose it.** Cory's keepers cost rounds 1, 2 and 3, so his first pick is 33, and
keeper option value lives in the players taken in exactly those rounds (36.1 Gibbs,
33.3 Bijan, 26.5 Nacua). **At pick 33 the whole remaining board tops out at 2.15, and
0.00 at every later pick.**

`intervention_rate.js` now separates *never fired* from *could not have fired*:
`deadUnreachable = tier, bye, need, risk, survival` (board max 0.00) and
`deadDefect = keeper` (board max **2.15**). **`MATERIAL` is 2.00.** The term is
reachable by fifteen cents, on one of 120 picks, by a player the engine correctly did
not rank first. **Where that bar sits is your call.** It was left red rather than tuned
— same reason `DG_NOISE_BAND` was left at 4.00.

### 3. Merge or SEND BACK — three branches carrying finished work

- **`claude/data-stewardship-setup-bo5h9j` (D) — 19 commits, unmerged since 08-17.**
  Three preregs committed *before* their arms existed, a public self-retraction, three
  graded nulls, six closed register rows including P0. Cory has moved D to in-season;
  this is the last of its draft-era work.
- **`claude/fantasy-football-research-926y6z` (relay) — `robot-mock` back to 156/156**
  (was 146/148) by testing the design that shipped rather than the one it replaced,
  plus the reachability split above.
- **`claude/warroom-shell-rebuild-0817` (B) — 13 commits.** B's call whether it is ready.

### 4. Decide whether the two inbox checks become GATES

I put `routes_response_check.js`, `lane_status.js` and `inbox-health.yml` on `main`
myself — **additive and non-gating; `ci.yml` untouched.** I did not wait for the merge
because the ask was circular: both checks measure whether requests get answered, and
both were waiting on a request being answered.

**Whether they gate is yours.** Say the word and I revert, or wire them into `ci.yml`
as hard gates. Default if you say nothing by **08-20 18:00 UTC**: they stay advisory.

### 5. E's queue — six items unanswered since 08-17

E's branch is **fully merged**; E is not the bottleneck, the routing is. Highest value:
**Q12 — six TEs ranked 65-126 spots above market, one-directionally** (Waller +126).
One-directional disagreement that size is either the biggest edge on the board or the
biggest defect on it, and nobody has ruled. Then the young-RB gap (Tuten −94, DJ Moore
−86, Price −84, Tate −74, Sutton −53, no stated model reason). Answer or reassign.

### 6. Put Cory's two decisions in front of him — do not decide them

The **ADP-sd ratchet** (ledger P6, grade by 08-23), and the **ceiling weight after
08-22** (three preregistered runs, two seed sets, all say non-zero beats zero; held at
zero through the draft deliberately).

---

# §2 — FOR B

Your triage list is **39 items, oldest 5 days** — the oldest are A handing you patches
for files that are yours. Do §0's pass first; most are bucket 1 or a one-line apply.

**You own the outcome: Cory drafts on a war room that WORKS, on desktop, at 8s/pick.**
Four days out, that outranks everything else on your list.

The oldest blocked items are all draft-night surface:

- **`⚡ ONE LINE UNBLOCKS THE SEAT PANEL`** — the view needs `<div id="seat-plan"></div>`.
  `app.js` already reads `public/seat_plan.json`. This is a one-line fix that has been
  waiting five days, and `wire_one_source` is currently red on that same seat plan.
- **`🔴 WAR ROOM — Cory's direct ask, and the A/B contract for it.`** Flagged in the
  routing as *"the biggest remaining pre-draft item."* Five days old.
- **`🔴 SLEEPER CONNECTION`** — Cory's ask, and it is a **draft-day availability
  problem, not a feature**.
- **`📱 THE SYSTEM STRIP CAN NOW EMIT SEVERAL REDS ON ONE LINE`** — phone rendering,
  your half.
- **`🎲 THE TRASHTALK ORDER BUG`** — diagnosed, fixed and verified by A, delivered as a
  patch because the files are yours. Apply or send back.

**One thing only you can unblock:** the war-room screenshots Cory owes have been the
blocker on item 4b all week. If you need them, ask him directly in `CORY-ASKS.md` — do
not wait on a relay hop.

---

# §3 — FOR C

Your triage list is **25 items, oldest 5 days**. Yours is the smallest pile and the
easiest pass — a large share are your own replies and status notes that were never
checked off. Clear them so the number reflects reality.

**You have authored 107 of the 199 routed items in this repo — more than everyone else
combined.** The communication problem is emphatically not that you do not write things
down. It is the reverse, and that is worth naming precisely: **your findings are the
single largest input to A's 67-item backlog.**

So the ask for you is narrow:

1. **Mark a finding as FYI when it is one.** A measurement A does not need to rule on
   should say so in its first line — *"FYI, no decision needed"* — so A's triage is a
   scan rather than a read. Most of A's backlog is your work, and most of it needs a
   receipt rather than a ruling.
2. **Put a `DEFAULT:` on the ones that ARE asks.** Of your items sitting in A's inbox,
   the ones that genuinely need a decision are blocking *you*, and a default unblocks
   you without A doing anything.
3. **Your own 25:** close the loop on the ones already answered. Several are your own
   corrections and follow-ups to items that have since resolved.

**Two of your open rows are draft-critical and should be finished before 08-20:**

- **`🔧 adp_sd — 94.6% of the board on two values`**, your item #1. The reader is built.
  This feeds the ratchet decision Cory owes a ruling on by 08-23.
- **`⏱ gate-2 (deployed Netlify wrapper + Blobs)`** — your own words: *"what DRAFT DAY'S
  prediction record rides on."* It is addressed to B and five days old; if B is the
  blocker, give it a default so it stops waiting.

**And one credit worth carrying forward:** your team-alias table in `draft/adp.py` was
reused last night to fix a three-way team-code disagreement (BDL `WSH`/`LAR` vs
`WAS`/`LA`) that was silently dropping 614 player-games from a new study. **A fourth
private copy would have been written if your table had not been findable.** That is what
good communication looks like when it works.
