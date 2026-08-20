# E's twenty-first sweep — every context key, and the one that changes an existing ruling

**Session E (red team), 2026-08-18.** I have now found two context dimensions the
hard way — the weight vector (E19) and the pick board (E21, which corrected two
of my own published numbers). Rather than keep finding them one at a time, this
sweep enumerates **every key `app.js`'s `context()` supplies** and diffs it
against what the suites pass.

---

## THE MATRIX — 20 keys, 29 engine-driving suites

| ctx key | suites passing it | omitting |
|---|---|---|
| **`wireWeekly`** | **1** | **28** |
| **`preDraftPrep`** | **1** | **28** |
| `pickBoard` | 6 | 23 |
| `totalMyPicks`, `myPickIndex`, `doctrine`, `ceilingAllStages` | 7 | 22 |
| `drift` | 9 | 20 |
| `currentKeepers` | 11 | 18 |
| `board`, `runMultipliers` | 22 | 7 |
| `roundsLeft`, `intervening` | 23 | 6 |
| `totalPicks`, `myPicksLeft` | 24 | 5 |
| `weights`, `nextPick`, `league` | 25 | 4 |
| `roster`, `currentPick` | 26 | 3 |

`preDraftPrep` is a narrow mode flag (`engine.js:2568` gates on it and its
default is the live-draft path), so omitting it is correct. **`wireWeekly` is the
one that matters**, and chasing it landed somewhere I did not expect.

## WHAT I FOUND, AND WHAT WAS ALREADY KNOWN

**Already on the record, and I am NOT re-filing it.** ROUTES, 2026-08-16:

> *"`VONA_WIRE_BENCH` — ruled ON 2026-08-16 — is DEAD CODE on the shipped
> scoring path: the wire branch is unreachable while `VONA_SLOT_AWARE` is false…
> Needs a ruling either way (off-flip diff prepared, or **finish slot-aware so
> the branch is reachable**) — deliberately NOT silently fixed in draft week."*

**THE ADDITION, WHICH CHANGES THAT REMEDY: even reachable, the DATA never
arrives.**

- `draft/data/wire_level.json` is **committed and real** — 422 scored
  acquisitions across 2023-25, weekly medians QB 23.38 / RB 7.80 / WR 11.10 /
  TE 11.60. The engine's own docstring quotes those four numbers.
- `app.js:2079` reads `state.data.wire_level` into `ctx.wireWeekly`. **The
  consumer is wired.**
- **`build.py` never writes `wire_level` onto the board.** The published artifact
  has no such key — grep finds it only inside two `build.py` comments.

So `ctx.wireWeekly` is `null` in production, `wireBenchValue` returns `null` on
its first line, and every player falls back to the vorp rule.

**MEASURED, with `VONA_SLOT_AWARE` forced true — i.e. the remedy on file
applied:**

| flags | supplying the artifact changes |
|---|---|
| shipped (`slot_aware` false) | **0 scores** — the branch is unreachable *(the half already on file, re-verified)* |
| `slot_aware` **true** | **65 scores** at pick 93 (e.g. Joe Flacco −198.55 → −155.29) |

**Making the branch REACHABLE is not the same as making it WORK.** Flipping
slot-aware alone would run the branch and take its fallback for every player.

**AND THE FALLBACK IS THE WRONG ONE TO TAKE WHOLESALE.** The `wb == null` path is
documented in the engine as the K/DEF case — *"nflverse is offense-only, see
wire_level.js's own accounting"* — i.e. a per-POSITION gap. With the map absent
entirely, **every position takes the two-position path.**

## WHY THIS PARTICULAR FEATURE BEING INERT IS WORTH SAYING OUT LOUD

Cory's design note for it, quoted in the engine:

> *"a backup QB averaging 24 isn't worth a roster spot if the wire gives you 22;
> a backup WR at 12 is, because the wire won't give you 10."*

**That is his live complaint about Bo Nix in the 9th.** The feature built to
price exactly that is enabled, measured, consumer-wired — and receives no data.

**Stated honestly: I could not show it fixes the QB symptom.** At picks 88/93/108
with Burrow rostered, QBs in the top ten go 0 → 0 with the data supplied. The 65
score changes are real but did not move a QB into or out of the top ten in the
states I measured. So this is a **broken join with a measurable effect on scores**,
not a demonstrated fix for the QB complaint, and I am not claiming the latter.

## ALSO FIXED — a stale self-description, truth only

The function's header read **"PROTOTYPED 2026-08-14/15, OFF BY DEFAULT."** True
when written; `CFG.VONA_WIRE_BENCH` was ruled **ON** on 2026-08-16. The flag now
reads as enabled while the feature cannot fire, and nothing said so at the point
of use. The header now names both reasons and points at the ruling. **No
behaviour changed.**

That the flip changed nothing is *why* nobody noticed: a flag was turned on, no
test moved, and the docstring quietly went stale.

## THE GUARD — `draft/tests/wire_level_never_reaches_the_board.test.js`, 12 checks

Including a **control** that at the shipped flags the data changes nothing (the
half already on file, re-verified rather than assumed), a **known-positive** that
with slot-aware forced true it changes many scores, and a `finally` that restores
both flags so the file cannot leak state into a shared run.

**36 of 36** suites touching the engine or the wire path pass, plus
`engine_ablation` and `bench_wire_room_sim`.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      The wire-bench ruling already in your queue needs a third option
          added. It currently reads "off-flip, or finish slot-aware so the
          branch is reachable". Reachable is not enough.
EVIDENCE: build.py never writes wire_level onto the board, so ctx.wireWeekly
          is null; with slot-aware forced true the committed artifact still
          changes 65 scores at pick 93. The null path is the documented
          K/DEF fallback being taken by every position.
REC:      Whatever you rule on the flags, the JOIN is a separate one-line
          question: either build.py emits wire_level, or the feature is
          retired. What must not persist is a flag reading ON over a branch
          that cannot receive its input -- the same third state E7 names for
          STREAMABLE_LATE, arriving from the opposite direction (that one is
          written and never read; this one is read and never written).
DEFAULT:  Nothing before 08-22. Inert today by construction, so there is no
          draft-week risk either way.
```

Rule 3d, answered:
1. **Did the input vary?** N/A in production — it is absent for every player,
   every run. In the artifact it varies by position (QB 23.38 … RB 7.80).
2. **Did it arrive?** **No.** `public/draft_data.json` has no `wire_level` key,
   and `build.py` writes none.
3. **Could the check have fired?** Yes — the known-positive shows 65 scores
   moving once the branch is reachable and the data supplied.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It does not rule on either flag.** Both are A's, one is already queued.
2. **It does not show the QB symptom is fixed by wiring the data** — measured and
   explicitly not claimed above.
3. **The other omitted context keys are not swept.** `doctrine`,
   `ceilingAllStages`, `drift`, `myPickIndex` are each passed by ~7 of 29 suites;
   whether that matters is a per-key question this sweep does not answer.
