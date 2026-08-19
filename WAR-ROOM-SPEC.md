# WAR ROOM — build specification

**From A, 2026-08-19. Draft: Saturday 08-22, 6pm. Keeper lock: Friday 08-21, 6pm CDT.**
Mailbox file, pushes straight to `main` (Rule 1b).

> Cory: *"give B the work it needs to make this war room, should be clear,
> concise, professional, and give lots of info"*

---

## 1. WHAT CHANGED, IN ONE PARAGRAPH

Cory has withdrawn the single-recommendation model. **The war room no longer
tells him who to draft.** He picks the position; the tool tells him what each
position is worth *right now* and when each one falls off a cliff. His words,
08-19:

> *"I think I'm done with you trying to get roster right.. I will chose
> positions. what I need from you is showing me VONA at each position when I'm
> drafting and I will choose direction."*

> *"you aren't making 1 recommended pick anymore. You're giving me top 5-10 at
> each position (more on RB and WR) and showing me projected vona drop offs by
> other team remaining needs and projections of when gone."*

**Everything below serves that one change.**

---

## 2. WHAT IS ALREADY DONE — DO NOT REBUILD THESE

| thing | where | state |
|---|---|---|
| Blended projections on the board | `public/draft_data.json` | ✅ live |
| Per-player floors/ceilings (Draft Sharks %) | same, `proj_floor` / `proj_ceiling` | ✅ live |
| Both toggle arms' data | same, `proj_ds` / `proj_ds_floor` / `proj_ds_ceiling` | ✅ live |
| Per-position VONA + drop-offs + survival | `public/position_boards.json` | ✅ regenerated |
| Source-disagreement page | `public/sources.html` | ✅ static, shipping |
| When-to-strike page | `public/strike.html` | ✅ static, shipping |

**The two static pages exist specifically to keep work off your plate.** If a
war-room surface would duplicate one, link to it instead of rebuilding it.

---

## 3. THE BUILD, IN PRIORITY ORDER

### 🔴 P1 — Per-position boards replace the recommendation list

**Today the war room calls `E.recommend(context())` and renders one
cross-position list.** That is the thing Cory retired.

**Build:** six columns (or a position selector), each showing the top N
available at that position, sorted by that position's own value.

```
TOP N PER POSITION — Cory's stated counts
RB 10 · WR 10 · QB 6 · TE 6 · K 4 · DEF 4
```

Per player, per row: `name` · `proj_mean` · `proj_floor` · `proj_ceiling` ·
`adp` · `bye` · `injury_risk_pct` · **% still there at my next pick**.

**⛔ NEVER SORT ACROSS POSITIONS.** VONA is not comparable between positions
(P196, measured): a backup QB's best-to-second cliff is the largest on the
board and is worth almost nothing, because it sits on 17 points of surplus
where a running back's 11-point cliff sits on 233. A combined ranking is a
category error and it is the specific defect that made this tool recommend a
QB2 in round 9 for weeks.

**Source:** `public/position_boards.json` → `picks[]` → `positions[POS]` →
`players[]`. It already carries `pct_still_there_next_pick`, `surplus_over_wire`
and `VONA` per position per pick.

> ⚠️ **`pct_still_there_next_pick` in that artifact is ADP-noise only and does
> NOT model who actually needs the position.** Override it with `survival.js`
> (opponent-aware, Layer 2) when you render. The artifact's own
> `_survival_caveat` field says the same thing — surface the caveat if you use
> the raw number.

---

### 🔴 P2 — The strike bar: when each position falls off

Cory: *"I will chose what position, what I need from you is info about when
position drop offs are high or low between rounds."*

**Build:** a persistent strip, always visible, one cell per position:

```
   TE          WR          RB          DEF         QB          K
 pick 53     pick 73     pick 113    pick 128    pick 133    pick 133
 costs 33    costs 25    costs 36    costs 7     costs 23    costs 14
```

That is **the peak of each position's own VONA curve** across Cory's twelve
picks — where waiting one more turn costs the most. Measured tonight on the
current board. **Tight end is the earliest cliff and quarterback the latest**,
which is exactly the shape he has been asking about.

**Source:** `public/position_boards.json` → `round_dropoffs[]`, and the same
computation is in `draft/tools/strike_page.js` (~25 lines) if you want to
inline it rather than re-derive.

**Regenerate before draft day:** `node draft/tools/position_boards.js --a 0.45`
then `node draft/tools/strike_page.js`.

---

### 🟠 P3 — Opponent needs, small and glanceable

Cory: *"It should be very easy for me to view other team needs in a very small
window, find way to make it clear yet small."*

**Source:** `public/position_boards.json` → `opponents_compact[]`, already
shaped for this:

```json
{ "owner": "Cory", "keeps": "2RB WR", "needs": "QB WR TE K DEF",
  "early_lean": "league avg only" }
```

Nine rows, three short fields. A fixed side panel or a hover strip. **Do not
expand this into a full opponent-roster view** — the ask was explicitly for
small.

---

### 🟠 P4 — The projection toggle

Cory: *"can we actually program 2 models, one that uses proj from draft shark
and 1 that uses mean proj. and I want to be able to toggle between them."*

**All data is already on every row. No derivation at read time.**

| toggle | proj | floor / ceiling |
|---|---|---|
| **Blend** (default) | `proj_mean` | `proj_floor` / `proj_ceiling` |
| **Draft Sharks** | `proj_ds` | `proj_ds_floor` / `proj_ds_ceiling` |

**⚠️ Two rules, both load-bearing:**

1. **The DS arm ranks 247 of 700 players.** Coverage by ADP depth: top-100
   100%, top-150 99.3%, top-200 94.5%, top-250 88.4%. Cory's last pick is 148,
   by which point the board is ~250 deep — **the DS arm thins exactly where his
   final picks come from.** A player with `proj_ds == null` must render as
   **UNRANKED**, never dropped silently and never back-filled from the blend.
   Show a count: *"247 of 700 ranked."*
2. **`ds_band_from: null` means we have no band for him** (453 players). Those
   rows carry `proj_floor == proj_mean == proj_ceiling` deliberately, so the
   ceiling adjuster cannot move them. **Render a dash, not a zero-width band.**
   Register 119: the old band was analyst *disagreement*, not player volatility.
   Showing an invented band is worse than showing none.

---

### 🟡 P5 — The ceiling adjuster

Cory, three times in the same words: *"if I crank ceiling adjuster all the way
up it should be ranking off pure ceiling projections.. if I crank it to 50 it
should use 50% of the added ceiling."*

```
adj  = clamp(A + RAMP × progress, 0, 1)
used = proj + adj × (ceiling − proj)
```

- `A = 0` → ranks on the projection
- `A = 1` → **pure ceiling, every player, every slot**
- `A = 0.5` → exactly half the added ceiling
- `RAMP` → late-draft crank, so his last picks are judged nearer their ceiling

**Acceptance test, his own, and it must pass:** two players with the same
ceiling **tie at `A = 1`**, whatever their means. A 500/550 and a 450/550 both
read 550. *An earlier version of mine failed this* — it pushed starters toward
their **floor** at full crank. Reference implementation and a permanent
assertion: `draft/tools/draft_model.js`.

**Default `A = 0.45`** (what the board ships today). Cory owns the dial; do not
pick a value from a sweep.

---

## 4. WHAT NOT TO BUILD

- **No single "recommended pick" card.** Retired by Cory, 08-19.
- **No cross-position ranking anywhere.** See P1.
- **Do not turn on `VONA_SLOT_AWARE`.** Measured: in that arm **100% of picks
  after 75 score negative** (median −135.6) against 0% shipped, and the onesie
  discount is `Math.min(score, score × 0.1)` — which does nothing to a negative
  number. It silently disables the one mechanism that buries an unstartable
  QB2, and seats taking 2+ QB go **43% → 63%**.
- **Do not wire `draft/data/draft_model.json` into the board.** It is
  report-only and its roster equation is **not** validated — measured tonight
  across 30 real seat-years it costs ~20 points a season against plain
  best-available.
- **`need` stays at 0** in `MEASURED_WEIGHTS`. Tonight's replay supports that.

---

## 5. KNOWN STATE YOU SHOULD NOT BE SURPRISED BY

- **18 JS tests are red on `main`, and were red before tonight's board change** —
  verified by running them against the pristine board with the board state
  asserted on each pass. Mostly tests encoding the *old* band semantics; one is
  named `floor_is_a_cohort_not_a_forecast`, which is the thing Cory told us to
  stop doing. They need rewriting to the new invariant, not deleting. Not yours
  unless you want them.
- **`public/draft_data.json` was rewritten offline** by
  `draft/tools/attach_draftsharks.py` (Sleeper is 403 at CONNECT, so `build.py`
  cannot run here). `vorp`, `replacement`, `tier`, `pool_rank`, `overall_rank`
  and `pos_rank` were all re-derived via the same `vorp.py` functions `build.py`
  calls. Every original is preserved as `*_pre_ds`.
- **`board.replacement.replacement_points` is a separate published copy** from
  the per-row `replacement` field. Both are now updated; three tests caught it
  when only the rows were.

---

## 6. DEFAULTS AND DATES

**If I hear nothing:** build **P1 and P2 only** for Saturday. Those two are the
draft-day ask; P3–P5 are improvements Cory can live without on the night, and
the two static pages cover the rest.

**If P1+P2 are too much for Friday, say so** and I will cut P1 to a read-only
per-position table generated the same way `strike.html` is — no war-room
changes at all. That still answers the brief and it is better than a
half-finished live surface on draft night.

**Recheck 08-20.** Anything not landed by **Friday 08-21 6pm** does not ship —
nothing changes on draft morning.

**Questions to A, not guesses.** Every number above is measured and I can point
at the artifact for any of them.
