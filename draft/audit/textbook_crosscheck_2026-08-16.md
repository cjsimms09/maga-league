<!-- TERRITORY: A -->
# TEXTBOOK CROSSCHECK — the Fantasy Football Analytics Textbook vs our own committed work (2026-08-16)

**Source (Cory-shared):**
[github.com/isaactpetersen/Fantasy-Football-Analytics-Textbook](https://github.com/isaactpetersen/Fantasy-Football-Analytics-Textbook)
— a real, CC-BY-4.0 open textbook on fantasy football analytics (R/Quarto,
academic rigor, cites primary literature). Read via `github.com/.../blob/main/*.qmd`
(github.io is sandbox-blocked).

**What this pass is: research + light validation, not a build.** Eight
chapters read (two by the relay before this session — `modern-portfolio-
theory.qmd`, `base-rates.qmd` — six by this session: `draft.qmd`,
`cognitive-bias.qmd`, `decision-making.qmd`, `mythbusters.qmd`, `player-
evaluation.qmd`, `fantasy-football.qmd`). Every extractable, checkable claim
is cross-checked against our own committed 2026-08-16 audits
(`roster_construction`, `edge_hunt`, `league_benchmark`, `draft_replay_2025_
vs_actual`, `conditional_value`) and, where those didn't already answer it,
against a fresh, cheap, reused-code computation. **One small proof-of-concept
was built** (§3) because the mandate specifically asked for it and it took
minutes, not a study; nothing else warranted new code, and that is reported
as a fine, honest outcome, not stretched.

---

## 1. Per-chapter extracted claims

### 1a. `modern-portfolio-theory.qmd` + `base-rates.qmd` (relay, prior read)

- Stacking (correlated same-team players) raises roster variance — the
  portfolio-theory mechanism.
- Season-long (non-payout-tiered) league structures favor LOWER roster
  variance; the chapter does not address weekly-prize-pool payouts at all.
- TE-RB position pairs are claimed **"slightly negatively correlated."**
  Flagged UNVERIFIED against our own data — resolved in §3 below.

### 1b. `draft.qmd`

1. Auction drafts: salary cap (e.g. $200), $1 minimum bid increment; snake
   drafts deny the 10th-pick manager access to the top 9 players auction
   drafts don't.
2. "Stars and scrubs" auction guidance (Harvard Sports Analysis): 10%
   premium on top players, 10% discount on lower tiers.
3. **Positional dropoff order, steepest first: RB, then TE, then QB, then
   WR**, defensive positions least steep.
4. QB shows its steepest dropoff after position rank ~10.
5. Lee (2022): **teams that drafted more RBs and WRs tended to outperform.**
6. **"There is not strong evidence that handcuffing leads to better
   outcomes."**
7. Draft K/DEF late — low positional scarcity there.
8. Defenses are among the least predictable positions.
9. Since 2000, league-wide QB fantasy points have risen and RB points have
   fallen (historical scoring-environment trend).
10. Lee (2022): **herding occurs at QB/K/DEF picks, NOT at RB/WR/TE.**

### 1c. `cognitive-bias.qmd`

31 named biases/heuristics with a fantasy-specific illustration each
(availability, representativeness, anchoring, affect, WYSIATI,
overconfidence [overestimation + overprecision], optimism, confirmation,
in-group, hindsight, outcome, self-serving, omission, loss aversion, risk
aversion, primacy, recency, framing, endowment, bandwagon, Dunning-Kruger,
base-rate fallacy, regression fallacy, hot-hand fallacy, sunk cost,
gambler's fallacy, anecdotal fallacy, narrative fallacy, ecological
fallacy). Two numeric anchors worth carrying: **"nearly 45% of fantasy
football variability is luck"** (cited twice, under overconfidence and
self-serving bias) and the recurring recency/hot-hand claim that managers
overweight a player's most recent games relative to his season-long rate.
Full one-line-per-bias list is in §4.

### 1d. `decision-making.qmd`

1. Crowd-averaged seasonal projections explain **~60–75% of variance** in
   fantasy points across all offensive players, but only **~30%** among
   high-performing players; individual sources explain **~50–65%** overall.
2. Wisdom-of-crowds needs **5–10 sources**; more has diminishing returns,
   and needs the sources to "bracket" the true value from both sides.
3. **~55% of fantasy football performance variance is skill, ~45% is
   luck** (the same 45% cited in cognitive-bias.qmd).
4. Frequent sports bettors: predicted +0.3¢/$ wagered, actually lost
   7.5¢/$; parlay bettors lost ~25¢/$ — an overconfidence anchor, not
   fantasy-specific.
5. Egocentric discounting: people weight others' advice at ~30% relative to
   their own.

### 1e. `mythbusters.qmd`

Single-topic chapter (R/Quarto statistical analysis, not vague prose): does
the **contract-year performance boost** exist? Tested across QB/RB/WR-TE,
multiple metrics (QBR, EPA, yards/carry, fantasy points), controlling for
age/experience. **Verdict: myth debunked — players score significantly
FEWER fantasy points in contract years**, not more, across every position
group tested.

### 1f. `player-evaluation.qmd`

1. CV = s/x̄ (coefficient of variation) for boom/bust consistency.
2. VORP = projected points − typical bench-player-at-position points;
   dropoff = a player's points minus the next-best-at-position's points.
3. Combine-test ("signs") vs. game-sample ("samples") distinction:
   **college production is a stronger predictor of NFL performance than
   Combine athletic tests.**
4. PPR leagues raise pass-catcher value; 2-QB leagues raise QB value.
5. Uncertainty (sd/CV of projections across sources) is proposed as a
   sleeper-identification signal.

### 1g. `fantasy-football.qmd`

Rules/structure background (scoring values, field dimensions, league-size
norms, ~29M US fantasy football players) — no analytical claims to
cross-check; noted for completeness, not tabulated below.

---

## 2. AGREE / DISAGREE / UNTESTABLE — against our own committed work

| # | textbook claim | our evidence | verdict |
|---|---|---|---|
| 1 | Stacking raises variance; season-long structures favor low variance (portfolio-theory) | `edge_hunt_2026-08-16.md` §4 (`variance_portfolio.py`): var_tilt buys +$5.13 weekly-high $ CI-clear in both sd treatments, mechanism confirmed both directions | **AGREE on mechanism.** Textbook is silent on weekly-payout leagues; ours is the piece that prices exactly that gap — no conflict, genuinely complementary |
| 2 | TE-RB pairs "slightly negatively correlated" | Fresh measurement, §3 below: pooled r = **0.0152**, n=153 team-seasons/1,939 weeks | **DISAGREE.** Not negative — indistinguishable from zero |
| 3 | Handcuffing: "not strong evidence... leads to better outcomes" | `conditional_value_2026-08-16.md` §3: handcuff worth +4.5–9.9 pts to the owner (vs +0.9 to the field) but absolute premium only 5–10 season points — a 14th/15th-round pick, both relevant cuffs FREE past pick 150 | **AGREE**, and ours adds the size: the asymmetry is real but tiny, never worth a mid-round reach |
| 4 | Draft K/DEF late, low scarcity | `roster_construction_2026-08-16.md` §1: K/DEF never sought/banned by any archetype overlay, timing is engine-free | **AGREE** (consistent with the shipped policy's behavior, not separately re-tested this pass) |
| 5 | Lee (2022): teams drafting **more RB/WR** outperform | `roster_construction_2026-08-16.md` §2: `robust_rb` (seek RB while RB<5 through rd 10) is the **worst of nine archetypes** in ALL FOUR model configurations — primary −4.1 wk/champ −9.7pp, ADP room −2.15/−3.7pp, mine-only −3.87/−9.5pp, wire-floor −1.88/−4.1pp. `zero_rb` (fewer early RBs, more early WR by construction) ties `shipped` everywhere, never beats it CI-clear | **DISAGREE, flagged plainly — not buried.** "Draft more RBs" measurably HURTS in our sim; "draft more WR" is a wash, not a measured win. Different study designs (Lee's is observational across real leagues/managers, skill-confounded; ours is a fixed-engine counterfactual varying only RB volume) — the discrepancy is worth a second look, not dismissed as noise, and is named as such rather than silently resolved |
| 6 | Herding at QB/K/DEF picks, not RB/WR/TE (Lee 2022) | Not directly measured — `draft_behavior.py`/`owner_persistence.py` exist and could test pick-adjacency clustering by position, but no herding-specific artifact exists tonight | **UNTESTABLE from what's built**, cheap-checkable later — named as a candidate, not run tonight (out of this pass's minutes-not-hours budget) |
| 7 | Positional dropoff steepest-first: RB > TE > QB > WR | Illustrative spot-check on the live 2026 board (`public/draft_data.json` proj_mean, rank1→rank12 gap): **RB 119.9 > TE 89.7 > WR 80.3 > QB 69.8** | **PARTIALLY AGREE.** RB steepest and QB shallowest match; our WR/QB ordering (WR steeper than QB) differs from the textbook's QB>WR. This is a single-snapshot, single-season illustrative read on OUR league's proj_mean, not the textbook's presumably multi-season replacement-level study — not a rigorous test, reported as directionally-consistent-but-not-exact |
| 8 | ~55%/45% skill/luck split; crowd projections explain 60–75%/30% of variance | `model_accuracy_2025.json`: own_v6 walk-forward Spearman ρ by position 0.66–0.73 (season-level, single model, not a crowd average) | **UNTESTABLE as a strict match** — different metric (Spearman ρ vs Pearson R², single-model vs crowd-averaged) and different population definition. Loosely consistent in direction (single source below the textbook's crowd range) but not a real test of either number; flagged rather than forced into agree/disagree |
| 9 | Contract-year performance boost is a myth (players do WORSE) | Not tested — no contract-year field exists in the committed component stores | **UNTESTABLE from what we have.** Would need a new external contracts dataset — explicitly out of this pass's no-new-fetch scope |
| 10 | College production beats Combine tests as an NFL predictor | Not tested — no Combine data in committed stores | **UNTESTABLE from what we have** |
| 11 | Since 2000, league-wide QB points up / RB points down | Component stores run 2021–2025 only | **UNTESTABLE** — insufficient history in what's committed |

**The one genuine disagreement worth a second look is #5.** Every other
disagreement or partial-match is either a measurement-design difference
named honestly (#7) or a metric mismatch (#8), not a substantive
contradiction. #5 is a real contradiction between an external, real-world
observational finding and our own controlled counterfactual, and both sides
are stated in full above rather than one being quietly preferred.

---

## 3. THE TE-RB CORRELATION — verified, with the real number

**Cory's shared claim (per the textbook, modern-portfolio-theory.qmd): TE-RB
pairs are "slightly negatively correlated."** No RB-TE cell existed in
`draft/data/conditional_value_2026.json` or `variance_inputs_2026.json` — the
committed classes are QB-WR1, QB-WR2, QB-TE1, WR1-WR2 only. Per the mandate,
this was computed fresh and cheap: `draft/backtest/te_rb_correlation_check.py`
**imports `conditional_value.py` unmodified** and reuses its already-graded
pure functions (`season_data`, `team_game_weeks`, `ranked_catchers`,
`pair_series`, `pearson`, `fisher_pool`, `mean_sd`) — `ranked_catchers`
already generalizes over position; calling it with `pos="RB"` is the exact
same function the committed classes use for WR/TE. Same construction as the
committed stack-correlation classes: same-team RB1/TE1 (top by season
points, ≥6 games), weekly Pearson r per team-season on shared active weeks
(≥8), pooled via Fisher z across team-seasons, 2021–2025.

**Result: pooled r = 0.0152**, n = **153 team-seasons / 1,939 shared weeks**
— essentially zero, and the spread across team-seasons is wide (sd=0.319,
individual team-seasons range from about −0.74 to +0.72) and roughly
symmetric around zero, so negative-in-some-seasons and positive-in-others
cancel to a pooled correlation indistinguishable from independence.

**Verdict: the textbook's "slightly negatively correlated" claim does NOT
hold on this league's own five seasons of weekly data — RB1/TE1 same-team
correlation is not negative, it's approximately zero.** For contrast, the
committed classes: QB-WR1 r=0.40 (151 pairs), QB-WR2 r=0.39, QB-TE1 r=0.33,
WR1-WR2 r=0.01. RB1-TE1 sits closest to WR1-WR2 (both near zero — pass
volume splits, whichever position catches it) rather than showing the
textbook's claimed mild anti-correlation.

**What this means for the draft:** no anti-correlation exists to exploit as
a diversification play (pairing an RB and TE from the same team does not
measurably reduce combined variance vs an independent pair) — but no real
positive correlation exists either to price as a stack. This is a **null
result that confirms the existing conditional-value work already covers
what matters** (QB-pass-catcher stacks are the real, measured lever;
RB-TE pairing is not a lever in either direction). Nothing further was
built on this — a confirmed non-effect doesn't license new machinery.

**Ships:** `draft/backtest/te_rb_correlation_check.py` (read-only import of
`conditional_value.py`, no repo file edited), `draft/data/te_rb_correlation
_2026.json` (artifact, gated — nothing reads it), `draft/tests/test_te_rb_
correlation_check.py` (5 checks: artifact-vs-regeneration parity, a hand-
checked spot-verification that `ranked_catchers(pos="RB")` behaves
identically to its WR/TE use, the `MIN_PAIR_WEEKS` floor, determinism, and a
pinned sign/magnitude assertion on the headline number). All 5 green;
`scripts/territory-check.sh A` clean; full suite run confirms the only 12
red tests are pre-existing regen-parity drift in files this pass never
touched (`own_model_v2`–`v6`, `model_accuracy_backtest`, `playoff_sos`,
`adp_sd_measured`, `mutation_gate`, `source_weight_prior`, `draft_replay_
2025` — none created or modified by this session).

---

## 4. COGNITIVE-BIAS CHECKLIST — checked vs candidate-for-later

**Checked against real data tonight (cheap, reused-artifact reads only —
`edge_hunt_2026-08-16.md`'s fifty-fifty-study near-tie features, `draft/
data/fifty_fifty_study.json`, 259 historical near-ties 2023-25):**

| bias | fantasy-relevant claim | our check | result |
|---|---|---|---|
| Recency Effect / Availability Heuristic | managers overweight a player's most recent form over his season rate | F7 "late-season trajectory" (hotter finish than own average) IS the one feature that cleared the prereg bar: hotter-finishers won 176 historical near-ties **58.0%** [CI 50.6–65.0] — a real (if weak, multiplicity-failing) signal | **PARTIALLY SUPPORTED** — recency-style information carries weak real signal at the season-trajectory grain, though this tests DRAFT-time near-ties on last season's late-window rate, not the textbook's week-to-week in-season start/sit framing — different mechanism, noted plainly |
| Hot Hand Fallacy | continuing a player after a hot streak is (per the textbook) fallacious — performance regresses to the mean | Same F7 result above cuts the other way at the SEASON-TRAJECTORY grain (not week-to-week) — a real trajectory signal existed here, however weak | **NUANCED, not a clean confirm or refute** — different time-scale from the textbook's week-to-week claim; flagged, not forced |
| "TD-share regression" (adjacent to Regression Fallacy) | players who scored disproportionately via TDs last year are likely to regress and should be devalued | F4 (lower prior-season TD-share favored): p̂=.462 [.393,.532] — **predicted nothing** | **NOT SUPPORTED** at the near-tie margin on this league's data (259 pairs) |
| Risk Aversion Bias | managers prefer steady/consistent players over volatile boom-bust ones | F8 (higher weekly cv favored, the boom/bust hypothesis): p̂=.538 [.466,.609] — **predicted nothing** | **NOT SUPPORTED** either direction — boom/bust profile doesn't decide near-ties here |
| Anchoring (on a prior-season point total) | managers anchor on last year's raw point total without adjusting for regression | F6 (higher prior-season ppg favored): p̂=.482 [.413,.552] — **predicted nothing**; an owner using this uninformative anchor gains nothing at the margin | **CONSISTENT with anchoring being a costly habit** (the anchor carries no real signal), though this is an indirect read — the study measures the anchor's predictive value, not whether owners actually anchor on it |

**Named as candidates for a LATER pass (concrete, but not checkable from
what's committed tonight — flagged for A via ROUTES rather than built):**

- **Base Rate Fallacy** (overweighting preseason performance) — no preseason
  stats exist in committed stores; would need a new fetch, out of scope.
- **Contract-year myth** (mythbusters.qmd's own finding) — no contract data
  in committed stores.
- **Endowment Effect / Loss Aversion** (overvaluing own drafted/kept
  players in trades) — would need trade-log data; `league_history.json`
  may carry trade records worth a look in a future pass, not opened
  tonight.
- **Bandwagon Effect** (waiver adds after one breakout game) — checkable in
  principle against add/drop timing if that's ever captured; not present
  now.
- **Herding at QB/K/DEF picks** (draft.qmd's Lee 2022 finding, §2 row 6) —
  checkable against `draft_behavior.py`/`owner_persistence.py`'s existing
  pick-sequence data; not run tonight, a real minutes-scale candidate for
  the next pass.
- **Sunk Cost Fallacy / Omission Bias** (keeping underperforming
  high-investment picks) — the drafter-skill study's "keeper leverage"
  finding (`league_benchmark_2026-08-16.md` §6: bottom-half owners held
  BETTER keeper value than the top 3) touches this obliquely but doesn't
  test the bias directly; a real follow-up would need in-season bench/start
  decisions, which the shadow ledger (`draft/data/draft_shadow_2026.jsonl`)
  starts capturing from the 22nd.
- **Confirmation Bias, Hindsight Bias, Outcome Bias, Self-Serving Bias,
  Gambler's Fallacy, Narrative/Anecdotal/Ecological Fallacy, Dunning-
  Kruger, Framing, Primacy, Affect/In-Group, WYSIATI, Representativeness,
  Optimism, Overconfidence (overprecision)** — genuinely psychological,
  need decision-level logs (chat, trade offers, start/sit reasoning) this
  repo doesn't capture. Named clearly as candidate war-room UI callouts
  (e.g. a "you might be anchoring" nudge next to a stale-projection pick)
  for a LATER pass — not built, per the mandate's own "flag, don't build"
  rule for the non-checkable ones.

---

## 5. What shipped, what didn't, and why

**Ships:** this doc; `draft/backtest/te_rb_correlation_check.py`; `draft/
data/te_rb_correlation_2026.json`; `draft/tests/test_te_rb_correlation_
check.py` (5 new checks, all green). Nothing else — no board change, no
composite change, no engine change, no war-room surface.

**Why nothing bigger:** every checkable textbook claim either already
agrees with committed evidence (handcuffing, stacking mechanism, K/DEF
timing), is answered by a clean null that confirms existing coverage
(TE-RB correlation), or isn't checkable from what's built without a new
fetch or a new study (contract-year, Combine data, herding, preseason
performance, the psychological biases). The one real disagreement (§2 #5,
Lee 2022's RB/WR-heavy-teams-outperform vs our robust_rb archetype losing
badly) is a genuine external-vs-internal contradiction and is reported
plainly, not resolved by fiat — it is a candidate for a second look, not a
code change, because the two studies measure different things (real-world
observational skill-confounded outcomes vs. a fixed-engine counterfactual)
and neither disproves the other.

**No ROUTES.md entry filed.** Nothing here is ready for a war-room surface
— the TE-RB result is a null (nothing to wire in), and the cognitive-bias
candidates are explicitly future work, not ready diffs. Per the mandate:
"if nothing warrants a code change, that's a fine, publishable outcome."
This is that outcome.

**Reproduce:** `python3 draft/backtest/te_rb_correlation_check.py` (rebuild
the artifact) · `python3 -m pytest draft/tests/test_te_rb_correlation_
check.py -q` (5 checks) · `bash scripts/territory-check.sh A` (clean).
