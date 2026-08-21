> ## ⚠️ SUPERSEDED IN PART, 2026-08-21 — READ THIS FIRST
>
> **§2's standings measurement is retired as a CERTIFICATION and §3's
> "≥20 graded outcomes" rule is withdrawn.** Both rest on an unstated
> assumption — that R\* on our league would resolve with more data. It will
> not: at our own measured skill spread (≈0.106) R\* has **12% power today and
> 20% after nine more seasons**. Power curve and method:
> `SKILL-LUCK-R-POWER-2026-08-21.md`.
>
> **What replaces it:** the same paper's **Test 3** — grade each DECISION
> against a constructed null of random legal alternatives, where power scales
> with the number of decisions rather than the number of competitors.
> Built and measured: `draft/backtest/start_sit_vs_random.py`,
> `GETTY-TEST3-STARTSIT-2026-08-21.md` — 530 owner-weeks, mean percentile
> **0.8497** vs a null band of **[0.4754, 0.5246]**, decisive where R\* was not.
>
> **What SURVIVES from this document, unchanged and still right:** the tool
> itself and its controls; the never-quote-a-naked-R\* rule; the
> quitting-boundary-layer warning about our own quick-kill bias; and the
> pricing insight in §3's last bullet (skill lives where pricing is wrong).
> §2's per-owner numbers remain usable as a DESCRIPTIVE prior with the
> non-significance label attached — which is what §2 already said.

# SKILL OR LUCK, AS A NUMBER — Getty et al. (SIAM Review 2018) IMPLEMENTED, MEASURED ON OUR OWN LEAGUE

**Relay, 2026-08-20, from Cory's uploaded paper ("Luck and the Law: Quantifying
Chance in Fantasy Sports"). RULE 1c. Tool: `draft/tools/skill_luck_r.py`,
controls green (known-negative fair coins inside their null band; known-positive
0.75-skill players at R\*=0.95). EVERY LANE READS §3 — the ruling standard's
"skill design" now has a computable instrument, and three of the paper's
findings change how we already work.**

## 1 · The metric, in one paragraph

Split each competitor's record into halves. First-half vs second-half win
fractions rotate into S (the PERSISTENCE axis — being good in both halves) and
T (the NOISE axis — flipping between halves). **R\* = 1 − Var(T)/Var(S)**:
pure luck 0 (halves uncorrelated), pure skill 1 (first half predicts second).
Significance comes from the paper's own Monte-Carlo null: redraw every
competitor's outcomes from the pooled distribution (no persistent skill) and
ask whether the real R\* clears the null's 97.5th percentile. Outcomes may be
binary (W/L) or fractional (all-play share) — the tool handles both.

## 2 · Our league, measured (2023–25, `league_history`, ~50 games/owner)

| outcome measure | R\* | null 95% band | verdict |
|---|---|---|---|
| head-to-head W/L | **0.68** | [−2.90, +0.73] | suggestive (~p≈0.06), NOT significant |
| all-play fraction (schedule luck removed) | 0.17 | [−2.28, +0.74] | not significant |

**The honest headline: with 10 owners and three seasons, our league's
standings cannot be certified as skill at 95% — the null band at m=10 is
enormous.** The per-owner persistence scores are still the best available
*prior* (descriptive, not proof): roster_7 and roster_2 sit clearly high
(all-play .578/.566, positive S in both halves), roster_10 clearly low (.366).
E's opponent dossiers should carry these as priors with the non-significance
label attached.

## 3 · What every lane changes tomorrow

* **Never quote a small-m R\* — or ANY split-half statistic — without its null
  band.** Building this tool, the first control seed drew R\*=−0.54 on fair
  coins (a legitimate sub-percentile fluke). The tool prints the band always;
  a naked R\* in a ledger row bounces at the Wednesday sweep.
* **The skill-design menu (three-part standard, ADAPTATION-POLICY) now
  includes split-half persistence**: any arm/tool/edge with ≥20 graded
  outcomes gets R\*+band beside its mean. The weekly model scoreboard
  (own vs Sleeper vs FP) reaches that n by midseason — D wires it in.
* **The quitting boundary layer is OUR quick-kill bias.** The paper measured
  that players quit after losing streaks, biasing records; our adaptation
  policy's quick-kill benches arms after 3 bad weeks — which truncates graded
  records at their WORST, flattering every surviving arm. From now on:
  cross-arm comparisons must either include benched arms' full records to the
  bench date or state the truncation. (Policy amended same day.)
* **Skill lives where pricing is wrong.** The paper's designer insight —
  perfect pricing makes a game pure luck — is our edge map: the edge budget
  is exactly the gap between market prices (ADP, wire, FAAB, trade values)
  and true value. E's red-team lens: find where THIS league's pricing is
  least accurate and point tools there; the register-129 rookie premium and
  the FAAB name-brand study (P145) are already this shape.

## 4 · Uses queued (each files under the three-part standard)

D: R\* on the weekly arm scoreboard when n≥20 · R\* on our own waiver/lineup
calls at season end. E: owner priors from §2 into dossiers/opponent model ·
the pricing-error map. Relay: the Wednesday sweep enforces the null-band rule.
