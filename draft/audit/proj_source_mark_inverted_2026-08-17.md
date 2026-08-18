# E's fourth sweep — the "single-source" caveat marks the wrong 255 players

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`, 682 players.

This pass found the live truth defect my inbox said was waiting (registers
21/21b), and killed a much louder-looking flag. Both are below.

---

## THE SURVIVOR — `projSourceMark` asserts a second opinion that does not exist

`public/js/draft/app.js:5545` renders the board's projection column as
`Math.round(p.proj_mean) + projSourceMark(p)`. That function, at
`app.js:642`:

```js
function projSourceMark(p) {
  if (!p || p.proj_mean == null) return '';
  if (p.proj_fantasypros != null) return '';          //  <-- no caveat
  return caveatOnce('single_source', '¹',
    'single-source projection (Sleeper only) — FantasyPros does not cover this '
    + 'position, so there is no second opinion behind this number');
}
```

**The caveat is attached when `proj_fantasypros` is ABSENT.** Carrying a
FantasyPros number is treated as evidence that `proj_mean` has more than one
source behind it.

**It is not.** Register 21, independently reconfirmed on this board:
`proj_baseline == proj_sleeper` for **427 of 427** rows carrying both, and
`build.py:1003` declares the formula — `"sleeper_baseline * (1 + opportunity_adj)"`.
`proj_fantasypros` is carried and displayed; it never enters `proj_mean`.

So the mark divides the board exactly backwards:

| | players | what the surface tells Cory | what is true |
|---|---|---|---|
| `proj_fantasypros` present | **427** | *no caveat* — reads as having a second opinion behind it | **Sleeper-only, 427 of 427** |
| `proj_fantasypros` absent | 255 | "single-source projection (Sleeper only)" | Sleeper-only |

**Every one of the 682 is Sleeper-only. The caveat appears on the 255 where
FantasyPros data does not exist, and is withheld from the 427 where it exists
and is ignored.** Inside the top 150 — the draftable core — **96 are unmarked
and 54 are marked**, and all 150 are Sleeper × an adjuster.

```
Jahmyr Gibbs         proj_mean 344.9 = sleeper 299.9 x 1.1500   FP 337.3 carried, never used   NO CAVEAT
Bijan Robinson       proj_mean 336.8 = sleeper 292.9 x 1.1500   FP 332.2 carried, never used   NO CAVEAT
Christian McCaffrey  proj_mean 294.4 = sleeper 256.0 x 1.1500   FP 295.6 carried, never used   NO CAVEAT
```

**The caveat text is the sharpest part of it.** It reads *"FantasyPros does not
cover this position, so there is no second opinion behind this number"* — which
makes its ABSENCE an affirmative claim that there IS a second opinion behind the
number. There is no second opinion behind any number in that column.

This is register **21b** exactly — *"every surface shows a `proj_mean` that looks
like a consensus… surface the refusal where the number is shown, or the board
implies a blend that does not exist"* — with the mechanism located and counted.

**What this is NOT, stated so it is not overclaimed.** The war room's separate
**consensus column** (`public/js/draft/consensus.js`) is honest and is not part
of this finding: it derives its label per player from the per-source fields
actually present, renders `"Consensus (2 src)"` only when it really averaged
two, and falls back to `"<Source> proj"` otherwise. Cory's designed sanity-check
column works. **The defect is confined to the caveat on the `proj_mean` column,
which is our valuation's input rather than his cross-check** — but that is the
column he reads a projection off, and the mark on it is telling him something
false in the direction of confidence.

**Nor is this a number defect.** No projection, rank or dollar figure changes.
`proj_mean` is what it is; the surface mislabels which of them have corroboration.

### ASK / EVIDENCE / REC / DEFAULT → **B** (owns `app.js`), copied to A and the relay

```
ASK:      Invert the mark's condition, or replace it with one that states the
          truth for every row.
EVIDENCE: app.js:642 gates the caveat on proj_fantasypros being ABSENT;
          proj_baseline == proj_sleeper for 427 of 427; 96 of the top 150
          render with no caveat; build.py:1003 declares the formula.
REC:      The honest minimum is that the caveat applies to EVERY row, because
          every row is single-source -- which makes a per-row mark the wrong
          shape and a column-level statement the right one. What the mark
          could usefully say instead is the thing that IS per-player: whether
          a second source exists and was NOT used. That is a real distinction
          (427 vs 255) and it is the one register 21 is about.
DEFAULT:  Filed. I do not touch app.js -- no write territory in the pipeline.
          If B is mid-redesign, this rides with it; the sequencing note in my
          inbox holds feedback on layout, not on a false label.
```

Rule 3d, answered:
1. **Did the input vary?** Yes — `proj_fantasypros` is present on 427 rows and
   absent on 255, so the branch genuinely takes both paths.
2. **Did it arrive?** Yes — `app.js:5545`, on the board's projection column, for
   every rendered row.
3. **Could the check have fired?** Yes — the two groups differ 427/255, so a
   test comparing "marked" against "actually single-source" discriminates. It
   would return 682 single-source against 255 marked.

---

## DIED — 25 of the top 100 are K or DEF, and both consumers already handle it

This looked like the biggest finding of the day and it is not a finding at all.

On raw `overall_rank` the board reads absurdly: **Los Angeles Rams DEF at overall
35** (ADP 127 — 92 picks ahead of market) and **Brandon Aubrey at overall 59**
(ADP 119), with **25 of the top 100 being K or DEF**. The arithmetic is correct
and the cause is ordinary: K/DEF replacement is the 10th at the position
(K10 = 97.0, DEF10 = 103.0) in a 10-team 1-slot league, and only 58 players on
the whole board carry a VORP above Aubrey's 10.0.

The board's own dispersion says the edge is noise: **Aubrey's 10.0 VORP is 0.33
of his own `proj_sd` of 29.96**, and the K1–K10 spread of 10.0 points is
**0.61 points per week against a `weekly_sd` of 7.38**. The Rams' 29.0 is 0.58 sd.

**Both consumption paths already demote them, independently:**

- `engine.js` — `demoteFlaggedOnesies()` sinks every rail-flagged K/DST below the
  last unflagged player, and its comment names this exact failure: *"a confident
  kicker at the top of the list is precisely the bug the rails exist to catch
  (the codebase has shipped confident nonsense three times)."* Deliberately done
  in the engine rather than the view, *"so the app and the robot mock see the
  SAME order — a display-only sort would let the robot draft a kicker the human
  never sees offered."*
- `app.js:5495` — `demoteOnesies` is on whenever the board is unfiltered, sinks
  K/DEF in the rendered list, and prints the reason on screen: *"K & DEF below —
  demoted in this view: streamable all season, so their cross-position rank is
  not a draft signal. Use the position filter for their real tiers."* Filtering
  to K or DEF turns it off, so their real order is available at the moment you
  actually pick one.

There is also a `plausibilityRails` flag — *"K/DEF this early is almost never
right"* — fired whenever more than `RAIL_LATE_ROUNDS` remain.

**Three independent guards, one of which explains itself to Cory in plain
English.** I record this because the raw artifact genuinely looks broken to
anyone who opens it, and the next person to notice should find this note rather
than spend the hour I did.

---

## RUNNING TALLY ACROSS FOUR SWEEPS

**Filed:** the band-edge dispersion misread (9 players, `NO DEFAULT — BLOCKED`,
sweep 1) · opportunity-cap saturation across the top 50 · the adjustment's
non-mean-preservation and QB exclusion · source-ruling evidence for A2 ·
live PUP/IR status reaching no availability number · this label defect.

**Died on inspection:** draft-slot arithmetic · bye completeness · tier
construction · `injury_status` being unused · `games_expected` as an
undocumented constant · `adp_stale` one-sidedness · the `search_rank` fallback
reaching a draftable pick · K/DEF ranking.

Eight dead to six filed is roughly the ratio `SESSION-E.md` predicts, and the
dead ones cost about as much time as the live ones. That is the lane working
rather than the lane failing.

**Still uncovered:** registers 2 and 3, which concern the *fresh* 693-player
board — every sweep here has read the published 682-row board, because that is
what Cory drafts from. A fresh build needs Sleeper/FFC egress this session does
not have.
