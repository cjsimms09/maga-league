# THE WEEKLY LEARNING LOOP — EXTERNAL AUDIT PACKET (2026-09-02)

**For a reviewer with no access to this repository.** Everything needed is in this
file: the league, the data, the method, the numbers, the code that produced
them, and four questions in priority order. Paste it whole. The response comes
back to the relay, is verified against the repository, and anything adopted
gets a preregistration like everything else — an external suggestion is a
hypothesis, never an order.

**Why this and not more.** The owner ruled on 08-21: *"Every audit cost money.
Once you think we're to a point you can correct then stop sending."* So this
packet carries only what the team cannot verify by re-reading its own work:
whether the backtest that every in-season decision now rests on is leak-free,
and three grading-design choices that decide what the loop learns for a season.
Routine rows, code style and presentation are not asked about.

## 0. WHAT I AM ASKING FOR
**I want errors** — leakage, a comparison that is not paired when it claims to
be, an inference stronger than its evidence, a counterfactual that quietly
favours one side. **I do not want a redesign.** Week 1 kicks off 09-10. If the
whole approach is wrong, say so in three sentences and audit what is here anyway.

## 1. THE LEAGUE AND THE DATA
- 10 teams, head-to-head, half-PPR with custom scoring (6-point passing TDs).
  Starters QB 1, RB 2, WR 2, TE 1, FLEX 1 (RB/WR/TE), K 1, DEF 1. Keepers up
  to 3 per team (23 kept league-wide in 2026). Free waivers by priority.
- Stores on disk for 2024 and 2025: every player's weekly points under our table
  (nflverse), every team's implied total from closing lines, three season-total
  priors captured before each season (our own model own_v6; FantasyPros; Sleeper
  — Sleeper only for 2025), player prop lines for every week (a paid historical
  API's snapshot of the-odds-api, 35,326 player-weeks over three seasons), and
  the owner's actual weekly lineups, rosters and transactions from Sleeper.
- 2026 in-season: the weekly champion is priced every Wednesday/Thursday before
  the first kickoff and committed (the commit timestamp is the forward
  guarantee); graded every Tuesday against real points; a promotion rule may
  replace the champion mechanically.

## 2. THE WEEKLY MODEL AND ITS CHALLENGERS
Every arm prices every skill player the board carries (full population, so
arms are graded on identical players). The formula:

    weekly = prior / divisor × (1 + tilt_scale × vg[pos] × (implied_team − mean_implied) / mean_implied)
    pull arms: (k × weekly + Σ realized) / (k + n_realized), k = 3, realized = the player's graded in-season points before this week

Arms: `v1` (own_v6 prior, /17, tilt 1.0), tilt 0/0.5/1.5, /16, `v1_pull3`
(the live champion), and `v1_blend_pull3` (same, on the board's multi-source
blended prior instead of own_v6). A props arm prices a player from his week's
prop lines (yards, receptions, expected touchdowns from the anytime-TD price,
de-vigged and Poisson-converted), summed as a stat line under our table; it
covers only players with a quoted line. A preregistered blend uses props where a
line exists and the pull arm elsewhere.

### The pricer (live code, `draft/weekly_own_projection.py`)
```python
def price_week(players: list, week: int, implied: dict,
               arms: list | None = None, realized: dict | None = None) -> dict:
    """Price every arm for one week. Returns
    {"means": {arm_name: {pid: mean}}, "meta": {pid: {"team","pos","name"}},
     "byes": [pid...], "no_line": {"players": [pid...], "teams": [...]},
     "mean_implied": float|None}.

    Population rules (identical across arms, so grades compare like to like):
    QB/RB/WR/TE with a proj_ownmodel; bye week => ABSENT, not zero; a player
    whose team has no line this week prices at tilt 1.0 in every arm and is
    named here."""
    arms = arms if arms is not None else DEFAULT_ARMS
    mean_imp = (sum(implied.values()) / len(implied)) if implied else None
    means: dict[str, dict] = {a["name"]: {} for a in arms}
    meta: dict[str, dict] = {}
    prior_fallbacks: dict[str, list] = {}
    byes: list[str] = []
    no_line_players: list[str] = []
    no_line_teams: set[str] = set()
    for p in players:
        pos = p.get("position")
        proj = p.get("proj_ownmodel")
        pid = str(p.get("player_id") or "")
        if pos not in POSITIONS or proj is None or not pid:
            continue
        if p.get("bye") == week:
            byes.append(pid)
            continue
        team = p.get("team")
        delta = None
        if mean_imp and team in implied:
            delta = (implied[team] - mean_imp) / mean_imp
        else:
            no_line_players.append(pid)
            if team:
                no_line_teams.add(team)
        for a in arms:
            # `prior` (2026-09-02, register 474): an arm may price a DIFFERENT
            # season prior off the same board row — the single-axis challenger
            # the two backtest folds pointed at (the prior mattered more than
            # the formula; own_v6 was the worst prior on every grade). The
            # POPULATION stays the champion's: gated on proj_ownmodel above,
            # and a row whose alternative prior is missing/zero falls back to
            # proj_ownmodel and is counted, so every arm prices every player.
            pv = proj
            if a.get("prior") and a["prior"] != "proj_ownmodel":
                alt = p.get(a["prior"])
                if isinstance(alt, (int, float)) and not isinstance(alt, bool) and alt > 0:
                    pv = alt
                else:
                    prior_fallbacks.setdefault(a["name"], []).append(pid)
            base = float(pv) / a["divisor"]
            tilt = 1.0
            if delta is not None and a["tilt_scale"]:
                tilt = 1.0 + a["tilt_scale"] * VG[pos] * delta
            val = max(0.0, base * tilt)
            k = a.get("pull")
            if k:
                hist = (realized or {}).get(pid) or []
                val = (k * val + sum(hist)) / (k + len(hist))
            means[a["name"]][pid] = round(val, 2)
        meta[pid] = {"team": team, "pos": pos, "name": p.get("name")}
    return {
        "means": means,
        "meta": meta,
        "byes": sorted(byes, key=lambda x: (len(x), x)),
        "no_line": {"players": sorted(no_line_players, key=lambda x: (len(x), x)),
                    "teams": sorted(no_line_teams)},
        "mean_implied": round(mean_imp, 3) if mean_imp else None,
        "prior_fallbacks": {k: sorted(v, key=lambda x: (len(x), x)) for k, v in prior_fallbacks.items()},
    }
```

### The props arm in the backtest (`draft/backtest/weekly_arms_2025_backtest.py`)
```python
def props_arm(props_w, names, tp, scoring_table):
    """Prop lines -> stat line -> our points, via the repo's own rule. The
    props store is keyed by NAME, so it is crosswalked through normalize_name
    against the pid->name map, disambiguated by the team the player was on
    that week. Ambiguity is dropped, never guessed."""
    idx: dict[str, list] = {}
    for pid, nm in names.items():
        if nm and pid in tp:
            idx.setdefault(normalize_name(nm), []).append(pid)
    out, unmatched, ambiguous = {}, 0, 0
    for nm, lines in props_w.items():
        cands = idx.get(normalize_name(nm)) or []
        if not cands:
            unmatched += 1
            continue
        if len(cands) > 1:
            cands = [c for c in cands if tp[c][1] in POSITIONS]
            if len(cands) != 1:
                ambiguous += 1
                continue
        pid = cands[0]
        mp = {STAT_TO_MARKET[k]: v for k, v in lines.items() if k in STAT_TO_MARKET}
        #: any_td (EXPECTED TDs in the historical store) is folded by
        #: `implied_points` itself since register 467 — one rush/rec TD per
        #: expected TD, skipped when a per-type TD line is quoted. This file
        #: used to fold it here, by hand, for RB/WR/TE only, while the live
        #: converter dropped it entirely: two arms sharing one name. Now the
        #: live and backtested arms are the same function. CONTROL K6 below:
        #: RB/WR/TE prices are unchanged by the move; QBs gain their rushing-
        #: TD expectation, which the hand fold had excluded.
        pts, _line = implied_points(mp, scoring_table) if mp else (None, {})
        if pts is not None:
            out[pid] = round(pts, 2)
    return out, {"unmatched_names": unmatched, "ambiguous": ambiguous, "priced": len(out)}
```

## 3. THE BACKTEST — method
Weeks 1–17 of a season, priced with strictly-prior inputs: the preseason prior,
that week's closing implied totals, realized points from weeks < w, that week's
prop lines (the historical snapshot, treated as pre-kickoff — a stated limit).
Three grades:
1. **MAE** on the shared population of all full-coverage arms (players every
   arm priced and who have a real stat row that week; a player with no stat row
   is absent, never zero).
2. **Pairwise start/sit accuracy** (the owner's frozen decision metric): for
   every same-position pair whose real points differ by ≥ 3, did the higher
   projection score more; pooled over weeks; ≥ 200 pairs to report.
3. **The unit that pays:** the owner's actual roster each week, best legal lineup
   by each arm, scored with real points, vs the lineup he started; K/DEF fixed
   to what he started.
Nulls: shuffle each arm within position within week (must be worse than the
real arm for every arm); best-of-K random legal lineups on grade 3.

```python
def shared_population(arms: dict, act_w: dict, tp: dict) -> list:
    pids = set(act_w)
    for a in arms.values():
        pids &= set(a)
    return sorted(p for p in pids if tp.get(p, (None, None))[1] in POSITIONS)

def grade_mae(arms, act_w, tp):
    pop = shared_population(arms, act_w, tp)
    pos = {p: tp[p][1] for p in pop}
    return {name: _score(pop, vals, act_w, pos) for name, vals in arms.items()}, pop
```

Controls in the artifact (both folds green):
- **K1** own_v6:v1 reproduces price_week byte-for-byte (week 3) — OK
- **K8** site_ours == the live pull arm without its tilt, every shared player, weeks 2-17: one pull rule, not two — OK
- **K2** Cory's recorded points == sum of his starters' points, every week — OK
- **K3** hindsight-optimal lineup >= every arm's lineup and >= actual, every week — OK
- **K4** props arm priced Josh Allen in week 1 from his lines — OK
- **K6** shared any_td fold == the hand fold at RB/WR/TE (week 1); QBs gain exactly rush_td x any_td — OK
- **K5** shuffle null is worse than the real arm on MAE, for every arm — OK

## 4. THE NUMBERS
### 2025 (the fold read first; a prereg held it blind — see Q4)
| arm | pooled MAE | start/sit QB / RB / WR / TE |
|---|---|---|
| own_v6:v1 | 4.853 | 0.5916 / 0.7803 / 0.735 / 0.7296 |
| own_v6:v1_pull3 | 4.6 | 0.5939 / 0.8141 / 0.7539 / 0.7697 |
| blend:v1_pull3 | 4.551 | 0.5988 / 0.8154 / 0.7554 / 0.7729 |
| site_ours | 4.655 | 0.5922 / 0.8136 / 0.7532 / 0.7697 |
| blend_props_pull | 4.411 | 0.6132 / 0.832 / 0.7849 / 0.7772 |
| sleeper:v1 | 4.713 | 0.6256 / 0.7804 / 0.7417 / 0.7478 |
| props (shared pop, n_pairs 24279 RB) | — | 0.5868 / 0.8527 / 0.7985 / 0.7923 |
| own_v6:v1 on that same population | — | 0.5677 / 0.8018 / 0.7511 / 0.7499 |

### 2024 (replication; the three claims below were written into the harness before this fold was read)
| arm | pooled MAE | start/sit QB / RB / WR / TE |
|---|---|---|
| own_v6:v1 | 5.188 | 0.6177 / 0.7339 / 0.6973 / 0.72 |
| own_v6:v1_pull3 | 4.831 | 0.641 / 0.7678 / 0.7274 / 0.7379 |
| blend:v1_pull3 | 4.785 | 0.6414 / 0.7701 / 0.7311 / 0.7386 |
| site_ours | 4.9 | 0.6364 / 0.7642 / 0.7287 / 0.7379 |
| blend_props_pull | 4.65 | 0.6542 / 0.7898 / 0.7505 / 0.7597 |
| fp:v1 | 5.007 | 0.6378 / 0.7488 / 0.7185 / 0.7208 |
| props (shared pop, n_pairs 22898 RB) | — | 0.6432 / 0.8047 / 0.7652 / 0.7662 |
| own_v6:v1 on that same population | — | 0.6109 / 0.7531 / 0.7092 / 0.7366 |

The three fixed claims — props beats own_v6:v1 at ≥ 3 of 4 positions on start/sit;
the pull rule beats the plain prior on MAE; the blend beats the pull arm on MAE
and at ≥ 3 of 4 positions — are TRUE in both folds. The pooled MAE of every arm
rises in 2024 (a harder season), the ordering does not change. Re-priced on a
rebuilt own_v6 prior (the committed store's inputs had drifted; 211 of 510
identical, max drift 22.55 points) every claim holds with the same ordering.

Game environment, measured 09-02 with claims fixed first
(`draft/backtest/game_env_lab.py`): the implied-total tilt is inert (0×–1.5×
span 0.02–0.05 MAE); a prior-season pace tilt is inert; a weather discount
(wind ≥ 15 mph or ≤ 32°F, outdoor games) on the props arm improves the affected
players' MAE by 0.069 in 2025 (n 572) and
0.001 in 2024 (n 380), both beating a shuffled weather map.

## 5. THE LIVE GRADING RULES UNDER QUESTION
### 5a. The promotion rule (live, MAE) and its shadow (start/sit)
```python
def decide_promotion(champion: dict, weeks: dict, active_arms: list) -> dict | None:
    """The rule, exactly as the module header states it. Returns None or a
    promotion record (no side effects — the caller applies it)."""
    champ_arm = champion["arm"]
    champ_series = _arm_series(weeks, champ_arm)
    qualifiers = []
    for arm_def in active_arms:
        arm = arm_def["name"]
        if arm == champ_arm:
            continue
        cand = _arm_series(weeks, arm)
        common = sorted(set(cand) & set(champ_series))
        if len(common) < PROMOTION_MIN_WEEKS:
            continue
        recent = common[-PROMOTION_RECENT_WINDOW:]
        wins = sum(1 for w in recent if cand[w][0] < champ_series[w][0])
        need = min(PROMOTION_RECENT_WINS, len(recent))
        if wins < need:
            continue
        cum_cand = sum(cand[w][0] for w in common) / len(common)
        cum_champ = sum(champ_series[w][0] for w in common) / len(common)
        if not cum_cand < cum_champ:
            continue
        rho_cand = [cand[w][1] for w in common if cand[w][1] is not None]
        rho_champ = [champ_series[w][1] for w in common
                     if champ_series[w][1] is not None]
        if rho_cand and rho_champ:
            if (sum(rho_cand) / len(rho_cand)
                    < sum(rho_champ) / len(rho_champ)
                    - PROMOTION_SPEARMAN_TOLERANCE):
                continue
        qualifiers.append({
            "arm": arm,
            "weeks_used": common,
            "recent_wins": f"{wins} of last {len(recent)}",
            "cum_mae": round(cum_cand, 3),
            "champion_cum_mae": round(cum_champ, 3),
            "cum_spearman": (round(sum(rho_cand) / len(rho_cand), 4)
                             if rho_cand else None),
            "champion_cum_spearman": (round(sum(rho_champ) / len(rho_champ), 4)
                                      if rho_champ else None),
            "per_week": {str(w): {"challenger": cand[w][0],
                                  "champion": champ_series[w][0]}
                         for w in common},
        })
    if not qualifiers:
        return None
    best = min(qualifiers, key=lambda q: q["cum_mae"])
    m = re.match(r"^own_weekly_v(\d+)$", champion["version"])
    nxt = f"own_weekly_v{int(m.group(1)) + 1}" if m else champion["version"] + "+1"
    return {
        "from": {"version": champion["version"], "arm": champ_arm},
        "to": {"version": nxt, "arm": best["arm"]},
        "evidence": best,
        # THE STANDING NULL (BLEND-SEARCH-DESIGN §3, D's condition 4, wired
        # 08-18): picking the best of K arms buys a margin for free, and that
        # free margin GROWS as arms are added. ATTACHED, NOT GATING — the
        # promotion rule above is Cory-ruled verbatim and this does not change
        # it; it makes every promotion carry the question "would K skill-free
        # arms have produced this margin?" so the human reading the promotion
        # issue sees the answer beside the win instead of nobody asking.
        "best_of_k": _best_of_k_null(weeks, [a["name"] for a in active_arms]),
    }

def decide_promotion_startsit(champion: dict, weeks: dict,
                              active_arms: list) -> dict | None:
    """The live rule's SHAPE on the frozen start/sit metric. Returns None or a
    would-promote record — NEVER applied by anything; see promotion_shadow.

      (a) >= PROMOTION_MIN_WEEKS graded weeks with pairs for both arms;
      (b) beats the champion on per-week POOLED pairwise accuracy in >=
          PROMOTION_RECENT_WINS of the last PROMOTION_RECENT_WINDOW weeks;
      (c) leads cumulative pooled accuracy over the common span, AND is ahead
          at >= 3 of the 4 positions on the pooled-over-weeks per-position
          accuracy with MIN_PAIRS enforced (PROJECTION-PROGRAM-2027's
          "3 of 4 positions" shape, WEEKLY-LAB-FREEZE-2026's pair rule).
    Best cumulative pooled accuracy among qualifiers."""
    from start_sit_metric import MIN_PAIRS, POSITIONS
    champ = champion["arm"]
    arms = [a["name"] for a in active_arms]
    if champ not in arms:
        arms.append(champ)
    per_week = {}
    for wk, e in weeks.items():
        wr, present = _week_rows_for_arms(e, arms)
        if wr and champ in present:
            t = startsit_week_tally(wr, present)
            if _pooled(t, champ)[1] > 0:
                per_week[int(wk)] = t
    if not per_week:
        return None
    qualifiers = []
    for arm in arms:
        if arm == champ:
            continue
        common = sorted(w for w in per_week if _pooled(per_week[w], arm)[1] > 0)
        if len(common) < PROMOTION_MIN_WEEKS:
            continue
        recent = common[-PROMOTION_RECENT_WINDOW:]
        wins = sum(1 for w in recent
                   if _pooled(per_week[w], arm)[0] > _pooled(per_week[w], champ)[0])
        need = min(PROMOTION_RECENT_WINS, len(recent))
        if wins < need:
            continue
        hc = sum(_pooled(per_week[w], arm)[0] * _pooled(per_week[w], arm)[1] for w in common)
        hk = sum(_pooled(per_week[w], champ)[0] * _pooled(per_week[w], champ)[1] for w in common)
        n_all = sum(_pooled(per_week[w], arm)[1] for w in common)
        cum_cand, cum_champ = hc / n_all, hk / n_all
        if not cum_cand > cum_champ:
            continue
        per_pos, won = {}, 0
        for q in POSITIONS:
            n_q = sum(per_week[w][arm][q][1] for w in common)
            if n_q < MIN_PAIRS:
                per_pos[q] = {"status": "unmeasurable", "n_pairs": n_q}
                continue
            a_q = sum(per_week[w][arm][q][0] for w in common) / n_q
            c_q = sum(per_week[w][champ][q][0] for w in common) / n_q
            per_pos[q] = {"challenger": round(a_q, 4), "champion": round(c_q, 4),
                          "n_pairs": n_q, "won": a_q > c_q}
            won += a_q > c_q
        if won < 3:
            continue
        qualifiers.append({
            "arm": arm,
            "weeks_used": common,
            "recent_wins": f"{wins} of last {len(recent)}",
            "cum_accuracy": round(cum_cand, 4),
            "champion_cum_accuracy": round(cum_champ, 4),
            "n_pairs": n_all,
            "positions_won": won,
            "per_position": per_pos,
            "per_week": {str(w): {"challenger": round(_pooled(per_week[w], arm)[0], 4),
                                  "champion": round(_pooled(per_week[w], champ)[0], 4)}
                         for w in common},
        })
    if not qualifiers:
        return None
    return max(qualifiers, key=lambda q: q["cum_accuracy"])
```

### 5b. The tool-vs-what-the-owner-did grades (`src/forecast_grade.js`)
Lineup: the tool's Sunday lineup vs the starters he actually fielded, same
week's real points. Waiver: the tool's Tuesday claim vs the player he actually
added that week, both summed over a 3-week window (the league's median hold);
if he added nobody his side is 0. Stream: the tool's K/DEF vs the K/DEF he
started, by slot; an empty slot is 0.
```js

      /* ── THE TOOL vs WHAT CORY ACTUALLY STARTED, WITH NO BUTTON (2026-09-01) ──
       * Cory ruled ("Do all of these!!", item 5): where the tool and his gut
       * disagree, the disagreement is a graded decision. The existing
       * `inseason_override` row captures that only when he CLICKS override —
       * a disagreement he never logs is a decision nobody grades. This derives
       * it every week from two things already fetched: the Sunday auto-capture
       * of the tool's lineup (method lineup-auto-v1) and his real starters off
       * the matchup rows (opts.actualStarters[week]). Same points, same week,
       * paired — the delta is the disagreement alone.
       *
       * A DISTINCT forecast_key on purpose: unresolvedDecisionEntries keys on
       * forecast_key alone, so reusing the decision's key would either be
       * skipped as already-resolved or mark it resolved before the primary
       * row landed. `|vs_actual` joins to nothing by design; it carries its
       * own outcome and is read through toolVsActualSummary(). */
      const starters = o.actualStarters && o.actualStarters[String(week)];
      if (e.method === 'lineup-auto-v1' && Array.isArray(starters) && starters.length) {
        const toolIds = rec.map(pidOf).filter(Boolean).map(String);
        const humanIds = starters.map(String);
        const tool = sideValue(rec, pts);
        const human = sideValue(humanIds.map(id => ({ id })), pts);
        const toolOnly = toolIds.filter(id => humanIds.indexOf(id) < 0);
        const humanOnly = humanIds.filter(id => toolIds.indexOf(id) < 0);
        out.push({
          kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
          payload: { forecast_key: key + '|vs_actual', week: Number(week),
            realized_chosen: r2(tool), realized_counterfactual: r2(human),
            outcome: r2(tool - human),
            disagreement: { n: toolOnly.length, tool_only: toolOnly, human_only: humanOnly },
            source: 'weekly realized points, tool recommendation vs the lineup the human '
                  + 'actually started (auto-derived from matchup starters, no button)' },
        });
```
```js
      const chosen = window.reduce((s, pts) => s + delivered(pts, chosenPid), 0);
      /* ── THE TOOL'S TUESDAY CLAIM vs WHAT CORY ACTUALLY CLAIMED (register 466 ①,
       * 2026-09-02) — the waiver twin of the lineup vs_actual row above. The
       * human side is his FIRST completed add that week off the transactions
       * feed (opts.actualAdds[week], built by claims-cron from Sleeper); an
       * EMPTY list is a real answer — he held — and his side is then 0, the
       * same "a decision that delivered nothing to the roster delivered 0"
       * convention every branch here uses. Same window, same points, paired.
       * Absent map (feed unavailable) => no row, never a graded hold. Manual
       * waiver_claim rows are not double-graded; only the auto capture is the
       * tool's unprompted advice. Priority/FAAB cost is unmodelled here too. */
      const adds = o.actualAdds && o.actualAdds[String(w0)];
      if (e.method === 'waiver-auto-v1' && Array.isArray(adds)) {
        const humanPid = adds.length ? String(adds[0].player_id) : null;
        const human = humanPid ? window.reduce((s, pts) => s + delivered(pts, humanPid), 0) : 0;
        const agree = adds.some(a => String(a.player_id) === String(chosenPid));
        out.push({
          kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
          payload: { forecast_key: key + '|vs_actual', week: w0, decision_kind: 'waiver_claim',
            realized_chosen: r2(chosen), realized_counterfactual: r2(human),
            outcome: r2(chosen - human),
            human_add: humanPid, human_adds_that_week: adds.map(a => String(a.player_id)),
            held: !adds.length,
            disagreement: { n: agree ? 0 : 1,
              tool_only: agree ? [] : [String(chosenPid)],
              human_only: agree || !humanPid ? [] : [humanPid] },
            source: `claim window w${w0}-w${wEnd}: the tool's Tuesday claim vs the player the human `
                  + 'actually added that week (auto-derived from Sleeper transactions, no button; '
                  + 'no add = held = 0; priority cost unmodelled)' },
        });
      }
```
```js
        : 'weekly realized points, chosen vs held');
      /* ── THE STREAMED K/DEF vs THE ONE CORY ACTUALLY FIELDED (register 466 ①,
       * 2026-09-02) — the stream twin of the lineup and waiver vs_actual rows.
       * opts.actualStartersBySlot[week] = {K: pid|null, DEF: pid|null}, built by
       * claims-cron from his matchup starters and the league's slot order. An
       * empty slot is a real answer (0). Only the auto capture is graded. */
      const bySlot = o.actualStartersBySlot && o.actualStartersBySlot[String(week)];
      const spos = p.chosen && (p.chosen.position || p.chosen.pos);
      if (e.method === 'stream-auto-v1' && bySlot && spos && (spos in bySlot)) {
        const chosenPid = String(pidOf(p.chosen));
        const humanPid = bySlot[spos] == null ? null : String(bySlot[spos]);
        const human = humanPid ? delivered(pts, humanPid) : 0;
        const agree = humanPid === chosenPid;
        out.push({
          kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
          payload: { forecast_key: key + '|vs_actual', week: Number(week), decision_kind: 'stream_call',
            realized_chosen: r2(chosen), realized_counterfactual: r2(human),
            outcome: r2(chosen - human), position: spos,
            human_started: humanPid, slot_empty: humanPid == null,
            disagreement: { n: agree ? 0 : 1, tool_only: agree ? [] : [chosenPid],
              human_only: agree || !humanPid ? [] : [humanPid] },
            source: 'weekly realized points, the tool\'s streamed ' + spos + ' vs the ' + spos
                  + ' the human actually started (auto-derived from matchup starters by slot; '
                  + 'empty slot = 0)' },
        });
```

## 6. THE QUESTIONS, IN PRIORITY ORDER
**Q1 — LEAKAGE.** Is anything in §3 knowable only after the week it prices?
Specifically: (a) the props "snapshot" is the historical API's stored lines,
which we treat as pre-kickoff — what would you require before believing that;
(b) `realized` uses graded points from weeks < w only — is there a path by which
the week-w stat row shapes the week-w price; (c) own_v6's 2025 prior is a
walk-forward rebuild from committed helpers, not a frozen artifact — does that
admit 2025 information; (d) the shared-population rule drops players any arm
failed to price — does that bias toward arms with narrower coverage.

**Q2 — WHICH METRIC SHOULD CROWN THE CHAMPION.** The live rule promotes on MAE
(3 of the last 4 weeks, cumulative lead, rank-correlation tolerance). The
program's bar is start/sit accuracy, and in both folds the two disagree at QB
(the Sleeper prior wins QB on start/sit, ours on MAE). A shadow now writes both
verdicts weekly and the owner will rule by 09-15. Given a 17-week season, ten
owners and ~250 graded players a week: which should select, what minimum
evidence should a promotion require, and is the shadow's construction (§5a)
the right shape for that evidence?

**Q3 — ARE THE OWNER-VS-TOOL COUNTERFACTUALS FAIR.** In §5b: "he held" is
scored as 0 for his side; his FIRST add is paired against the tool's ONE
claim; K/DEF are taken by slot. Which of these quietly favours the tool, which
favours the owner, and what is the least-biased pairing you would grade?

**Q4 — FOLD DISCIPLINE.** 2025 was graded by this harness while another lane's
sealed preregistration held it blind; 2024 was then spent the same way before
the guard existed. Only 2023 remains blind for the props arm. Given what is
already known, is a 2023 read worth anything as a blind test, and if the weather
result (§4, "FALSE in both folds by a pre-fixed rule, a tie in substance in
2024") were yours, would you promote it to a live arm or call it a null?

**Cheap add-on:** what would you capture this season that would make next
year's version of this audit unnecessary?
