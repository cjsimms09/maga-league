# WAR ROOM v2 — TWO ADDITIONS (Zone 2, compose existing computations)

Filed 2026-08-08 (Cory). Both live in **Zone 2 (CONTEXT rail)** of the three-zone layout and both compose computations that already exist. Both feed the ledger so January can grade them.

## 1. THE STRATEGY NAVIGATOR — the live "how is my draft going" instrument
- A running **E[$] forecast of my roster-in-progress** (same decomposition as the Money Meter: **high-pool / entry / RS**), tracked against the **pre-draft projection** as a small **trajectory line** — ahead/behind plan visible at a glance.
- Beneath it, the **PIVOT READ:** after each of my picks, one generated line assessing whether my current path still maximizes projected earnings given what the room has done:
  - "Plan intact — WR value falling as projected"
  - "**PIVOT SIGNAL:** QB run erased your late-QB edge — the Early-QB branch now projects **+12 dollars** over staying the course; Paths re-ranked."
- Driven by **re-running the archetype-conditional forecasts (Experiment 19's continuations)** against the live board each turn. The Paths panel already re-ranks; the Navigator **NAMES the strategic meaning** of the re-ranking, so Cory steers a strategy, not just takes cards.

## 2. STACK ROUTES — upgrade the Stack Finder from reactive flags to route planning
- Identify **COMPLETE stack constructions across my remaining picks:**
  - "**Route:** Burrow at live 26 (61%) + Higgins at live 49 (44%) = double-stack with Chase; combined completion odds **27%**; projected high-pool value **+34 dollars** if landed."
- **Ranked by expected dollars × completion odds**, updating as picks burn.
- Each route **tappable to star its players** (feeds the queue + survival watchlist).
- The **top route surfaces as a badge on any path card that keeps it alive** ("preserves Stack Route 1").
- **Game-stacks included** where the board offers them.

## Ledger + grading
Both instruments **feed the ledger** — Navigator pivot-signals and route states logged per pick — so January can grade them _(source message truncated at "so January can gr…" — captured as: January grades whether the pivot signals and route calls were right in realized dollars; reconcile against the full text on resend)_.

## 3. THE LIVE DRAFT MONEY LEADERBOARD (Navigator expansion — Zone 2, expandable)
All ten owners ranked by **projected E[$] of their roster-as-drafted**, updating on **every pick in the room** (not just mine).
- **Each row:** rank · owner · **projected dollars** (tap to decompose high-pool / entry) · **movement arrow** since their last pick · a one-word **grade of their last pick's dollar impact** ("+$19" / "−$8 reach").
- **My row highlighted** with **gap-to-first**.
- **Opponents graded honestly with THEIR observed lineup efficiency.** Every opponent's roster is fully known (their picks + keepers), so grade them with the same engine (`playerDollars` / E[$]) but **scale by their measured efficiency** — a Schmelley roster projects at **84–87% of its optimal**, because his drafting is graded on what he'll actually EXTRACT, not on a perfect lineup he never sets. (Efficiency map from the dossiers; same principle as the Phase-$ observed-efficiency opponents.)
- **Doubles as live opponent intel:** the leaderboard IS the "who's drafting best" answer in real time.
- **Post-draft:** seeds the recap's draft grades (D-1).
- **Ledger-logged per round** so January can **grade the grader** — did draft-night projected-dollar ranks predict realized money?
- **Robot:** a fixture draft asserts (a) re-ranking on each pick, (b) the efficiency discount is applied to opponent projections, (c) my-row gap-to-first math is correct.
- **Buildable now** on `playerDollars` + a per-owner efficiency map (dossiers) — it does NOT need Experiment 19 (that feeds the *pivot read*, not the leaderboard). It's the simplest of the three Navigator instruments; can land first.

## Dependencies / sequencing
- Composes: the **Money Meter** decomposition (B7 `dollarGap` / `playerDollars` are the seed), the **Paths panel** re-ranking, the **branch forecast** (survival to next picks), the **Stack Finder**, and **Experiment 19** (archetype-conditional forecasts) — so it lands AFTER Exp 19's harness work gives the archetype continuations. Until then, the Navigator can run on the current composite forecast (labeled provisional) and the Stack Routes on survival×dollar without the archetype layer.
- Both are Zone-2 rail cards in the three-zone layout (Part 2 §2).
