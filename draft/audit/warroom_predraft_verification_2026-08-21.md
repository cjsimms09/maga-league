# WAR ROOM — PRE-DRAFT VERIFICATION, 2026-08-21

Cory: *"It's time to make sure everything on warroom is working and up to date,
then deploy the warroom to site."* Draft is **2026-08-22**; keeper lock is
**tonight 18:00 CDT / 23:00 UTC**.

This is what was checked, how, and what the numbers were — measured against the
**shipped artifacts and shipped modules**, not against test proxies. Where a
check is a NULL ("nothing wrong"), it says how it could have returned a positive
(rule 3e).

---

## 0. What is NOT covered here

Two things remain after this, both this evening, both Cory's:

1. **Keeper lock at 18:00** — 6 of 10 teams have designated, **13 keepers across
   5 teams are still withheld**. Two suites are RED *on purpose* until that
   clears (`slate_exposure_commitment`, `withheld_slate_exposure`). They are
   backstops reporting a partial slate, not defects, and they go green when the
   confirmed slate reaches the board.
2. **The board rebuild** on the locked slate.

Everything below is verified on the **current** board (`built_at
2026-08-21T00:29:00Z`) and will need a re-run after that rebuild — the numbers
move, the properties should not.

---

## 1. Every blend source is on the Big Board toggle

Cory, 08-21: *"big board tab was wrong… other sites aren't on there"* and
*"Where are all the other sources we got??"*

| | |
|---|---|
| toggle offers | `sleeper, espn, cbs, ds, fftoday, fantasypros, clay, ownmodel` |
| blend actually uses | `cbs, clay, draftsharks, espn, fantasypros, fftoday, sleeper` |
| in the blend but missing from the toggle | **none** |

✅ Every source that contributes to the number on screen can be selected.

---

## 2. Changing the source changes VONA

Cory's ruling, 08-21: *"Vona should change for each source in which we have a
projected points total. If we don't have projected points then it shouldn't show
Vona for that source."*

Scored at his real first pick (33), next pick 48, on the live board:

| source | pool | median \|ΔVONA\| vs blend | its top pick |
|---|---|---|---|
| blend | 700 | — | Puka Nacua |
| FantasyPros | 427 | 3.00 | **Jahmyr Gibbs** |
| Sleeper | 700 | 7.27 | **Jahmyr Gibbs** |
| Draft Sharks | 247 | 7.54 | Puka Nacua |
| FFToday | 350 | 8.37 | Puka Nacua |
| CBS | 398 | 9.93 | Puka Nacua |
| ESPN | 400 | 9.94 | Puka Nacua |
| Mike Clay (= ESPN) | 377 | 10.57 | Puka Nacua |
| our model | 507 | 19.00 | Puka Nacua |

✅ The toggle moves the number the recommendation is made from, not just the
sort order — and it can change **the pick itself** (two sources name Gibbs).

**The inertness detector exists** (`source_toggle_moves_vona.test.js`): the
failure it guards is a toggle that re-sorts, drops uncovered players and prints
its ordering note while silently no longer swapping `proj_mean`. Measured by
stripping all 5,600 `proj_used_*` fields off the board — four other suites
stayed green, that one went red. That is the gap it covers.

---

## 3. No VONA where a source has no projection

The shipped `public/position_boards.json` carries per-source VONA:

- **576** per-source VONA cells across 72 position blocks (12 picks × 6
  positions × 8 sources)
- **125** are null, and **every one is classified**:

| n | why it is null |
|---|---|
| 77 | that source prices **nobody** at that position — exactly Cory's rule |
| 48 | it is his **last pick**: there is no next pick, so VONA is undefined |
| **0** | **unexplained** |

✅ A dash on screen always has a reason behind it.

---

## 4. Survival percentages make sense

Cory: *"Survival percentages don't seem to make sense."* Root cause was
register 195 — pre-draft, `currentPick` is an **anchor** (33) while the board
still holds everyone, so anchored conditional survival collapsed and handed the
elites one identical number.

Measured now, survival to pick 48 across his whole draft range (ADP ≤ 160,
n = 159, 54 distinct values):

- **100%** for 66 players — deep players who certainly last. Correct.
- **0%** for 29 players — elites who are certainly gone. Correct.
- The **decision band** (5%–95%), which is the only part that informs a pick:
  **22 players, 22 distinct values**, rising monotonically with ADP —

  | ADP | player | survives to 48 |
  |---|---|---|
  | 34.4 | QB Lamar Jackson | 10.9% |
  | 38.1 | RB Travis Etienne | 6.3% |
  | 40.0 | WR Ladd McConkey | 9.4% |
  | 43.3 | RB Bucky Irving | 38.1% |
  | 45.5 | RB David Montgomery | 53.4% |
  | 47.1 | RB D'Andre Swift | 65.4% |
  | 48.1 | WR DJ Moore | 68.3% |

✅ Per-player, monotone in ADP, no wall.

> ⚠️ **A PROBE OF MINE PRINTED A GREEN TICK ON ZERO DATA WHILE CHECKING THIS.**
> My first pass read `survival_to_next` off `components`; it is a **top-level**
> field. Zero rows survived the filter, and the "distinct ≥ half" test passed
> vacuously on an empty set. Caught only because the line also printed
> `n=0`. My second pass then measured the **top 24 by ADP** and reported a wall
> at 0.0% — which is the *correct answer* for players who are all gone before
> pick 33, and the wrong population to ask. The finding only survived once it
> was asked of the band where the answer can vary. Rule 3i, twice, inside one
> verification.

---

## 5. No kickers or defenses in the pre-draft top 20

The sweep that register 195's fix implied — five display sites were re-routed,
and this is the one that mattered most, because K/DEF had been surfacing at
ranks 12-18.

Top of the pre-draft board at pick 33:

> WR Puka Nacua | RB Jahmyr Gibbs | WR Jaxon Smith-Njigba | RB Bijan Robinson |
> WR Amon-Ra St. Brown | RB Jonathan Taylor | WR CeeDee Lamb | WR Drake London

✅ Zero K/DEF/DST in the top 20.

---

## 6. The page itself

| check | result |
|---|---|
| scripts referenced by `_warroom_scripts.ejs` | 45 |
| missing on disk | **0** |
| modules failing `node --check` | **0** |
| war-room suites run | **28**, all green |

Suites: `chaos_drill_warroom`, `every_route_renders`, `history_smoke`,
`no_drafted_player_reaches_a_render`, `panel_guide`, `panel_spec`,
`proj_source_panel`, `render_isolation`, `roster_builder_panel`, `route_smoke`,
`seat_panel_markup`, `seat_panel_mounts`, `ui_fidelity_charts`,
`ui_fidelity_explainers`, `ui_fidelity_movers`, `ui_fidelity_numbers`,
`ui_fidelity_own_model_label`, `ui_fidelity_tiebreak`, `ui_fidelity_verdict`,
`source_board`, `source_top_board`, `board_ordering_note`,
`position_boards_hide_drafted`, `source_toggle_moves_vona`,
`source_toggle_predraft_shape`, `two_vonas_one_page`,
`predraft_survival_is_not_one_number`, `vona_predraft_survival`.

---

## 7. What is live vs what is on main

Checked rather than assumed, because "deployed" is the claim that matters:

- Served files changed between the live build stamp and main's tip: **0**.
- The eight modules edited today (`app.js`, `composite.js`, `doctrine.js`,
  `engine.js`, `position_boards_view.js`, `shadows.js`, `source_board.js`,
  `warroom_charts.js`) are **byte-identical** between main's tip and what is
  live.

So the site was already serving the current war room before this deploy; this
commit carries `[deploy]` to advance the build stamp so the fact is *visible*
rather than inferred.

---

## 8. Fixed today, live on the page

| register | what it was |
|---|---|
| **195** | pre-draft survival collapsed to one number for every elite; five display sites re-routed |
| **203** | two VONAs on one page — the position boards' VONA was frozen to Draft Sharks and did not follow the toggle |
| **208** | **the banner could tell Cory to abandon his plan on one-sided arithmetic.** The retraction that stopped the doctrine banner pricing a binding plan as "an alternative that trails by $X" had only ever reached the DISPLAY; the auto-switcher still ranked on raw scores and would fire "⚡ SWITCHING TO BALANCED" after two consecutive reads. Its only guard was passing over a scenario in which nothing bound. |
| **202** | the shadow panel's "driver is an artifact" warning tested `need === 0`, a weight Cory ruled to 1.0 on 08-20 — a live wrong warning |
| **197** | ESPN and Mike Clay are one source; the toggle now labels Clay as such |

## 9. Known and deliberately NOT changed before Saturday

Cory owns the blend and the weights, and `no_fit_guard` holds until the draft.

- **197 — the blend counts ESPN twice** (`espn` 394 players, `clay` 377, same
  source). Measured: 326 players move a **median 1.22** projected points
  (p90 3.62, max 7.94); inside his ADP window **147 players** move, largest ~6
  (Tyrone Tracy −5.96, Breece Hall +4.75). Under 1% at the median.
- **207 — `playerDollars` ranks every QB above every RB/WR.** It prices raw
  points and never subtracts replacement. In the top 120: 20 QBs at $61.4–$72.8
  against 100 non-QBs at $20.6–$52.9, **zero overlap**. QB dollars are flat at
  $61–$74 through QB30 (Bryce Young $74.4 is the most expensive man on the
  board) then fall off a cliff at QB31.
- **209 / 210** — two doctrine-banner display halves, stated openly in
  `robot-mock.js` rather than papered over: when the *enrolled* plan is the one
  binding it still renders as an alternative that trails with no deferral note,
  and `_confidence` band-tests a signed gap so a $40 shortfall reads
  "Contested — within the band".

All four carry owners and recheck dates in `DEFECT-REGISTER.md`.
