# `need: 1.0` changes nothing at any of Cory's twelve picks — and the panel tells him it moves his first one

**E (red team), 2026-08-24.** Found while closing a loose end from P133: the war
room's provenance string and `CLAUDE.md` both quote a *measured consequence*
beside a weight, and nothing sweeps those the way `weight_claim_sweep.js` sweeps
the weights themselves.

---

## 1. `need_weight_pick_diff.js` drafts on a schedule Cory does not own

`draft/tools/need_weight_pick_diff.js:31`:

```js
const SCHED=[8,13,28,33,48,53,68,73,88,93,108,113,128,133,148];
```

Picks **8, 13 and 28** are the three most valuable in the draft and he forfeited
all three to keep three players. This is **register 95** — the defect Cory
caught himself (*"Why do you keep saying at pick 8?? I don't get a pick in the
first 3 rounds"*) — and `fieldability_probe.js`'s own header already says *"SEVEN
OTHER TOOLS STILL CARRY THE SAME LITERAL."* This is one of them, and it is not a
spare probe: its output is quoted in `engine.js`'s shipped `WEIGHT_PROVENANCE`,
which the war-room panel reads.

The effect is not cosmetic. Three phantom early picks put three extra players on
the roster at pick 33, so every roster-aware term is evaluated against a roster
he never had.

**Corrected to `draft_plan.js`'s derived twelve** — one derivation, reused, which
is what Rule 11 asks — the tool's roster becomes
`{WR 3, RB 5, QB 1, TE 1, K 1, DEF 1}` and its picks are Adams · Stevenson ·
Pollard · Pierce · Stafford · White · Jones · Worthy · Spears · Strange · Mevis ·
Vikings. **That is player-for-player what my own independent probe
(`tier_ramp_probe.js`) draws.** Two harnesses written days apart, no shared code
beyond the engine, same twelve names — which is the only reason anything below is
worth reading.

## 2. Run correctly, `need` at 1.0 changes zero of twelve picks

```
  picks changed: 0 of 12
  roster shipped : {"WR":3,"RB":5,"QB":1,"TE":1,"K":1,"DEF":1}
  roster need1.0 : {"WR":3,"RB":5,"QB":1,"TE":1,"K":1,"DEF":1}
```

The shipped `WEIGHT_PROVENANCE.need` string says:

> *"Measured blast radius: his #1 at pick 33 moves from RB Breece Hall to WR Zay
> Flowers."*

On the live board, pick 33 is **WR Davante Adams under both arms**, and so is
every other pick he owns.

**`need` is not inert** — a control confirms the scores move (`need 0` vs
`need 1` at pick 33 returns different scores, and `ctx.weights` is demonstrably
read). It changes the numbers and never changes the *choice*. That is a
different and more specific claim than "it does nothing", and it is the one the
evidence supports.

**This answers an open question on register 275** — *"the first real test of
`need` at weight 1.0 … was it outvoted or never consulted?"* — with a third
answer neither option anticipated: **consulted at every pick, decisive at none.**

## 3. The ceiling half, stated only as strongly as my evidence allows

`engine.js:808`, the same string at `:857`, and `CLAUDE.md:172` all carry:

> *"Switching it off moves 8 of his 12 picks; 33/48/53 are unchanged."*

Measured 2026-08-20. Re-run on **my** harness, `ceiling 0.45 → 0.0`:

| board | picks that move |
|---|---|
| pre-lock `9758fa02` (08-22 03:35) | **5 of 12** — 68, 93, 128, 133, 148 |
| today (post keeper lock) | **2 of 12** — 133 and 148, and both are the K/DEF *ordering* swapping |

All five of my pre-lock movers are inside the claim's own named eight, so the
direction corroborates. **But I reproduce 5 where they reported 8, so my harness
is not their harness, and I am not asserting their number is wrong.** What the
paired comparison does support — same harness, two boards — is that the effect
**falls by more than half across the keeper lock**, and that no skill-position
pick moves on the board that ships.

The ask is therefore a re-run by whoever owns that measurement, not a correction
by me. Writing a number I cannot reproduce over a number I cannot reproduce is
how the original problem happens twice.

## 4. The class, which is the actual finding

`weight_claim_sweep.js` exists precisely because *"a weight ruling ships and the
prose quoting the old number never moves — seven instances in two days."* It runs
green today: no state-asserting file quotes a weight the engine does not carry.

**It checks the weight. It does not check the measurement quoted beside the
weight** — and that measurement is the faster-decaying half, because it moves on
every board rebuild, not only on a ruling. Two of the three blast-radius figures
shipped in `WEIGHT_PROVENANCE` no longer describe the board.

This is also **register 251's prose half**: that row records eight test files
pinned to the pre-lock 700-player pool. These are the same 08-22 03:51 event
reaching documentation instead of tests, and register 283 is the third face of it.

## 5. Limits

- One seat, one room order (strict ADP drain), same caveat every probe in this
  family carries — but §2's comparison is *paired on one board*, so the room
  model is common-mode and cancels.
- §3 is explicitly **not** a refutation: 5-vs-8 on the original board means my
  harness differs from theirs in a way that matters, and I say so rather than
  rounding it away.
- The live board carries **register 283** (replacement understated at RB and WR).
  Common-mode across both arms of every comparison here, so the diffs stand; the
  absolute rosters are the distorted board's.
- I did **not** sweep the remaining six tools carrying register 95's literal. I
  found this one because it fed a shipped string, and I am not guessing at the
  others' consumers.

## 6. Asks

**ASK (A):** point `need_weight_pick_diff.js:31` at `draft_plan.js`'s SCHED — one
line, and the corrected output cross-checks against an independent harness.
**REC:** then re-run whatever produced *"moves 8 of his 12 picks"* against the
post-lock board and update `engine.js:808`/`:857` and `CLAUDE.md:172`, or mark
all three as measured-on-the-pre-lock-board.
**DEFAULT:** if untouched, the register rows stand as the record and the war-room
panel keeps telling Cory about a pick-33 move that does not happen.

**ASK (A):** extend `weight_claim_sweep.js` — or file a sibling — to the measured
consequences quoted beside the weights.
**REC:** it need not re-derive them; flagging *"this sentence quotes a blast
radius and the board has been rebuilt since"* is most of the value.
**DEFAULT:** the class keeps being found by whoever trips over it, which is what
that tool's own header says was the problem.
