# The blend "gain concentrates where sources exist" claim — premise checked, structural version measured

**D, 2026-08-20.** Answers relay's ask (ROUTES.md, TO: D, job (2), 2026-08-20): *"THE BLEND
IS STILL UNGRADED... `proj_mean_sleeper_only` is committed on every row, so the
counterfactual is on the board. Prereg the grade NOW — the falsifiable shape is that the
gain concentrates where the extra sources exist (188 seven-source players vs 115
one-source)."*

**Short answer: the literal test as described cannot be run, and the reason is worth
recording. `proj_mean_sleeper_only` is NOT on every row — it exists on 277 of 700, and is
absent for every single one of the 184 one-source players the comparison needs.** What
follows is (1) why, (2) the corrected population counts, (3) the one thing that IS
measurable today, run and reported, and (4) why an *accuracy* grade — which is what "gain"
implies — is still blocked exactly as `P113` and the blend's own code already say.

---

## 1. The premise, checked before working (Rule 3f/3i)

Two board pipelines touch `proj_mean`, in order:

1. `draft/multisource_blend.py` — Sleeper + CBS/ESPN/FFToday, gated at `MIN_OPINIONS = 3`
   (Sleeper plus at least two of the other three). **Only when this gate fires does it
   write `proj_mean_sleeper_only`** (`multisource_blend.py:225`) before overwriting
   `proj_mean`. A player who does not clear the gate keeps `proj_mean` as raw Sleeper and
   gets **no** `proj_mean_sleeper_only` field at all — there is nothing to diff against
   because nothing changed.
2. `draft/tools/attach_draftsharks.py` — reads `draft/data/blended_projection.json`
   (`draft/tools/blended_projection.js`, sources `sleeper, cbs, espn, fftoday,
   draftsharks, clay[, fantasypros]`, up to 7), overwrites `proj_mean` again, and is what
   actually writes `blend_n_sources` (1–7) on **every** row, including 1-source ones.

**Verified directly on the live board (700 players):**

| | count |
|---|---|
| `blend_n_sources == 1` (Sleeper only) | **184** |
| `blend_n_sources == 7` | **189** |
| rows carrying `proj_mean_sleeper_only` at all | **277** |
| of the 184 one-source rows, how many carry `proj_mean_sleeper_only` | **0** |
| of the 189 seven-source rows, how many carry `proj_mean_sleeper_only` | **177** (12 are DEF, `MEAN_EXCLUDED_POSITIONS` in step 1 never sets the field even when other sources exist) |

**Relay's cited counts (188 seven-source, 115 one-source) do not match the current board
(189, 184).** Given how many rebuilds landed today, this reads as a stale snapshot rather
than a live error — flagged rather than silently substituted.

**The deeper problem is not the count mismatch, it is that the comparison is structurally
impossible for the one-source group.** For `n_sources == 1`, step 1's gate cannot have
fired either (it needs 2 of CBS/ESPN/FFToday, and a player attach_draftsharks later sees
with zero of the other 6 sources did not have them for step 1 either) — so `proj_mean`
for those 184 players **is** raw Sleeper, by construction, with no separate field to prove
it. "Does the gain concentrate away from the one-source group" is not a finding to
measure here; it is true by the pipeline's own gating logic, before any data is read.

## 2. What IS measurable today: shift magnitude vs. source count, on the 277 that were blended

Restricting to the 277 rows that actually carry both `proj_mean` and
`proj_mean_sleeper_only` (i.e., step 1 did fire), stratified by the FINAL
`blend_n_sources` (which includes step 2's Draft Sharks/Clay/FantasyPros on top):

| `blend_n_sources` | n | median \|shift\| (pts) | mean \|shift\| | median relative shift |
|---|---|---|---|---|
| 3 | 8 | 30.00 | 29.76 | **36.9%** |
| 4 | 26 | 28.55 | 23.47 | **29.7%** |
| 5 | 33 | 7.10 | 8.57 | **17.4%** |
| 6 | 33 | 8.40 | 10.48 | **12.1%** |
| 7 | 177 | 9.54 | 12.29 | **5.4%** |

**Relative shift falls monotonically as source count rises — the opposite of
"concentrates at high source count" if that phrase means "moves further from Sleeper."**
Absolute median shift also does not rise with source count (30.0 at n=3 vs 9.5 at n=7).
The pattern is consistent with an ordinary averaging effect: as more independent opinions
enter the mean, the result stabilizes closer to a shared centre and any one source
(including Sleeper) has proportionally less individual pull — not evidence that the blend
is doing more or doing something different at high source count, just evidence that
averaging behaves like averaging.

**This is a mechanism/sanity check, not an accuracy claim, and it should not be read as
one.** It says nothing about whether `proj_mean` is closer to what actually happens in
2026 than `proj_mean_sleeper_only` would have been.

## 3. Why the accuracy question stays blocked — not a new limit, the one already on record

`draft/tools/blended_projection.js`'s own header: *"EVERY SOURCE IS WEIGHTED EQUALLY
BECAUSE WE HAVE NO BASIS FOR ANYTHING ELSE. Nobody's past forecasts were ever stored, so
no source has ever been graded here. `projection_snapshot_2026.json` is what fixes that in
January."* `draft/multisource_blend.py`'s own docstring: *"WHAT IT STILL CANNOT SAY:
whether the mean is more ACCURATE than Sleeper... needs per-player projection history the
repo does not hold... P113 grades it in January."* `PREDICTION-LEDGER.md` P113 itself:
*"THIS CANNOT BE GRADED UNTIL THE 2026 SEASON IS PLAYED."*

Three independent places in the codebase already say the same thing before this audit
touched anything: **there is no 2026 outcome data yet, so no arm of this blend — Sleeper,
the mean, or any stratification of it — can be graded for accuracy today.** Job (2)'s
"gain" framing implicitly asks for that grade; it is not available, and re-deriving that
limit from three sources independently (rather than taking my earlier framing of the ask
at face value) is itself the useful check here.

## 4. Rule 3g

**(1) Implies another failure?** Any other place in the project that has quoted or
implied an accuracy comparison between `proj_mean` and `proj_mean_sleeper_only` (or any
blend arm) before 2026 outcomes exist is quoting something unmeasurable — worth a
targeted grep for "beats Sleeper" / "more accurate" claims dated before January 2027.

**(2) Invalidates?** Nothing shipped rests on an accuracy claim for this blend — Cory's
ruling to ship it (`multisource_blend.py`'s header) was explicitly *"a validated capture,
not a graded accuracy claim,"* so this finding confirms the existing caveat rather than
contradicting a live claim.

**(3) Routed:** relay, with the corrected population counts and the reason the literal
test cannot run, so P113 (already filed, already dated 2027-01-15) is not duplicated by a
second unograded prereg.

## Method, for reproduction

```python
import json, statistics as st
board = json.load(open("public/draft_data.json"))
for p in board["players"]:
    smo, pm, ns = p.get("proj_mean_sleeper_only"), p.get("proj_mean"), p.get("blend_n_sources")
    # group by ns where smo and pm both present; shift = abs(pm - smo)
```
Population counts and the shift table above are both directly reproducible from the
committed `public/draft_data.json` — no external fetch, no stored artifact.
