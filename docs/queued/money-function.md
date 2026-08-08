# THE MONEY FUNCTION — The Objective Is Dollars, and the Payout Table Is Now Ground Truth

Two ground-truth corrections from Cory, both of which amend the championship-objective spec BEFORE it builds — apply these as modifications to that pass, not a separate pass.

## 1. The payout structure (encode in config as payouts.json — all objective math derives from it)

- Weekly High Point: $100 × 15 weeks = $1,500 (37.5% of pot)
- Regular Season Champ $250 · Runner-up $125
- Playoffs: 1st $675 · 2nd $575 · 3rd $475 · 4th $400 (flat gradient: 1st−4th = $275)
- Total pot $4,000

**The true objective: E[$] = Σ_w P(league-high score, week w)·$100 + P(RS champ)·$250 + P(RS 2nd)·$125 + Σ_k P(playoff finish k)·payout_k**

Config-driven so a future payout change is one file edit tripping the watchdog, never a code hunt.

## 2. What the math actually says (write these into the spec as cited rationale)

- **Variance is subsidized.** 37.5% of the pot pays pure weekly ceiling against all 9 opponents simultaneously — matchup-independent. Expected weekly-high revenue for a balanced roster ≈ $150/season; a ceiling-built roster plausibly $300–400. That delta rivals the ENTIRE 1st-vs-4th playoff gradient.
- **The playoff gradient is flat.** Top-4 entry is the real playoff prize (~$400 floor); seeding and winning add modestly. Consequence: the weeks-15-17 SOS term from the championship spec DOWNGRADES to a smaller cap (advisory display stays — it's still the tiebreaker between comparable players), and P(make top 4) matters more than P(win it).
- **Regular-season money ($375 combined) rewards consistent winning** — so this is NOT a pure ceiling league; the floor still buys playoff entry and RS money. The honest formulation: draft a roster whose STARTING CORE is solid enough to make top-4, with variance CONCENTRATED where it's cheap — stacks, bench, and flex.

## 3. Draft-engine amendments (through normal gates, replacing/adjusting the championship-spec terms)

- **Ceiling term: raise its cap and let it ramp earlier.** Under this payout table, ceiling isn't a late-round luxury — it's 37.5% of the objective. Quantify before installing: at my real state, how much does the top-40 reorder? Cite it.
- **Stacking term: upgrade from small bonus to first-class.** Weekly high point is won by CORRELATED booms — QB+WR1 stacks, and where the board allows, game stacks (my WR + opposing WR in a projected shootout). The stack bonus scales with combined ceiling, not mean. This is the single clearest edit the payout table demands.
- **Playoff-SOS term: cap reduced per above; card display retained.**
- **New display: WEEKLY-HIGH ENGINE read on my roster panel** — a running estimate of my roster's boom capacity (share of projected outcomes above the league's typical weekly-high threshold, crude version now: count of top-quartile-ceiling starters + stack presence; honest version arrives with quantile V). I should watch this number grow as I draft, next to the bye grid.
- **Bench-as-lottery-tickets: unchanged and REINFORCED** — it was right for replacement-level reasons and is doubly right for weekly-high reasons.

## 4. In-season amendments

- **Lineup optimizer gets a dual objective:** each start/sit evaluated on BOTH ΔP(win matchup) and ΔP(league weekly high)·$100. Early season especially, the $100 chase can outweigh marginal matchup safety — the optimizer should SAY when: "Start the boom play: costs 1.2% win prob, adds 3.1% high-point odds — worth ~$2.60 net this week." Dollar-denominated advice.
- **Weekly brief adds the money ledger:** season E[$] tracking — weekly highs banked, current playoff-position equity, RS-standing equity. The scoreboard is dollars now.
- **Streaming engine: ceiling-aware** — when chasing the weekly high, stream the shootout DST/QB, not the safe floor.

## 5. Waiver engine correction #2 (supersedes the priority-economics refit)

Actual mechanism: reverse-standings order, RESETS WEEKLY, each claim slides you back within that week's processing. Therefore:
- Priority is NOT a durable asset — no hoarding logic, no cross-week option value. Claim aggressively; the cross-week cost of claiming is ~zero.
- The real decisions: (a) WITHIN-WEEK claim ordering when I want multiple players — sequence claims by scarcity (who else wants each target, from dossier add-patterns), since my 2nd claim processes behind the field's 1st; (b) roster-spot opportunity cost (the drop is the price, not the priority); (c) FA SPEED after processing — first-come-first-served remains the biggest edge and the clear-time alert stays the priority build.
- Dossier metrics: per-manager claim aggression by standing position, and add-speed after clears.
- Verify waiver clear day/time and exact reset behavior from league settings API; stamp into config.

## 6. September alignment

Quantile V's roster evaluation becomes E[$] directly — the distributions feed P(weekly high) exactly, the playoff simulator feeds the finish probabilities, and MCTS re-evaluates against dollars. The interim terms above are the August approximation of that function; January grades every one of them against realized dollars, and the Annual proposes recalibration with evidence.

## Honesty gates
- Every amended term: capped, cited to this payout math, participation-tested, ledger-logged
- Pre-registered caution: P(weekly high) estimates from point projections + variance proxies are crude until quantile V — the crude version steers gently (display > weight), the September version steers for real
- The payout table itself gets a checklist line: config matches the league site's published structure, re-verified if the commissioner edits payouts
