# TODO — the real count, in plain English (regenerated from files 2026-08-09)

_One line each, no jargon, ordered by when it matters. Generated from STATUS.md,
PARKED.md, DECISIONS-NEEDED.md and the Lab registry — not from memory. A ✅ line cites
the evidence it is done. Draft is **Aug 22**. Session B keeps the site/in-season half
of this list (see the note at the bottom)._

## BEFORE THE DRAFT (Aug 22) — the things that must be right by draft night

- ✅ **The war room tells you where the market is weak vs strong.** The deviation card
  now says "market ranks R1-3 RB weakly — freer to deviate" vs "ranks late WR well —
  respect it" (deviation.js + app.js, exp 36, deployed).
- ✅ **Deploys can no longer silently strand work.** The gate is opt-out: any change a
  visitor would see ships automatically; only docs/Lab/CI skip (netlify-ignore.sh, 7/7).
- ✅ **Fresh sessions bootstrap from the repo, not a retyped prompt** (SESSION-A.md,
  SESSION-B.md, ACCESS-RULE.md on main).
- ◻ **EXTERNAL DATA (Underdog BBM → exp 24) — NEW #1.** Millions of outcome-labeled rosters,
  re-scored to our rules, break the n-ceiling and answer 'what roster shape wins under our
  payouts' — the construction question where exp 34 measured us losing money. Build: probe →
  ingest → translate (verified) → exp 24. Draft-relevant; highest expected dollars.
- ◻ **The weekly-high pool (37.5% of the pot) rewards ceiling/distribution shape — nobody drafts
  for it.** Likely the most underexploited edge; fold spike-week construction into the exp-24 build.
- ◻ **Third arm — composite vs ADP in dollars** (the deviation-trust verdict; thin at n≈27, so #2).
- ◻ **Mock #4 + the degraded drill → the one-page failure card.** Parked until you say GO.
- ◻ **Whether to build Stage 2 as a real market anchor** (D14). Recommendation stands:
  HOLD — and if built, its binding comes from the exp-36 surface, not a hand-set gate.

## WAITING ON YOU (Cory) — nothing moves until you rule

- ◻ **D14:** build the real Stage-2 anchor now, or keep holding? (I recommend hold.)
- ◻ **GO for mock #4 + the degraded drill?** (parked on your word).
- ◻ **Open a gated REGRESSION_WEIGHT change?** exp 35 confirmed we over-regress
  (top-decile 0.51 at weight 0 vs 0.40 shipped); lowering it is a separate SHIP
  decision (null + leave-one-season-out), not auto-installed.
- ◻ **Deploy policy after Aug 22:** keep opt-out, or revisit? (opt-out is live now).

## WAITING ON THE WORLD — can't be done until something external happens

- ◻ **Covariance / portfolio rho verdict** — runs in CI on push; read it when it lands.
- ◻ **Anything needing a live 2026 season** — continuous re-grading, in-season tools.

## AFTER THE DRAFT — real, but not now

- ◻ **The learning engine** — weekly re-grading that moves confidence tiers on its own;
  hypotheses from residuals. Needs a live season's weekly outcomes.
- ◻ **Site optimization Phase 2.**
- ◻ **Revisit the deploy policy** (opt-out was chosen for the draft window).

## THE LAB — the experiment queue, in order

- ◻ **REGRESSION_WEIGHT install gate** — the one remaining projection lever now that replace is
  closed: exp 35 showed the blend over-regresses on the whole board; run a candidate lower weight
  through null + leave-one-season-out AND the exp-33b pool check at your picks. Install only if it
  clears both (cited, reversible). Draft-relevant: it changes the board you draft off.
- ◻ **Third arm — composite vs ADP in dollars** (now the key VERDICT: value-ranking is validated by
  exp 34/33b, so the open question is whether the composite's construction earns money vs the market —
  tells you how much to trust the tool's deviations on draft night; needs JS replay).
- ◻ **Dollar-grade the exp 35 sweep** — points curve is done (EXP35.md); the dollar-per-weight
  curve through the grader is the flagged increment.
- ✅ **Naive-as-source (exp 33b)** — CLOSED: KEEP the blend. It out-ranks naive at your
  actual picks (0.404 vs 0.35) and beats the market (+0.166); naive earns −$200. Replacement
  is off the table (EXP33B.md).
- ◻ **Exp 41 paired-room race** — the calibration-weighted ensemble; combiner core is built
  + tested (exp41.py), the money-graded race vs the composite is the increment.
- ◻ **Auto-adjuster conditional mining** on heterogeneous rooms.
- ◻ **What-would-have-worked** — every registered strategy vs the 3 historical drafts, in dollars.
- ◻ **upsideBonus endgame gated sweep** — the one residual dead-term flip, measured not blind.
- ◻ **Exp 42 — the bench as contingent claims** (registered, behind exp 34).

### Recently FIRED (evidence, so they leave the queue)

- ✅ **Exp 34 dollar arm** — our-minus-ADP −$575/yr (value-greedy; EXP34-DOLLARS.md).
- ✅ **Exp 34 correlation arm** — our ordering beats the market, +0.14 CI [0.053,0.224], n=27
  after the 2025 harvest recovery (EXP34.md).
- ✅ **Exp 36 ADP-efficiency surface** — early ADP weak, mid/late strong; inverted the anchor
  doctrine's early premise (EXP36.md, doctrine amended).
- ✅ **Exp 33 bake-off** — our blend loses to naive at top-decile; a leaking Sleeper source
  caught + disqualified (EXP33.md; EVIDENCE_STATE[33]).
- ✅ **Exp 35 regression sweep** — over-regression confirmed, monotonic (EXP35.md).

---

_Session B owns the site/in-season half — matchup page follow-ups, Sunday alert, the
lineup optimizer's in-season surfaces, the deployed-vs-main health strip (parked to B),
and the design sweep. B: regenerate your own slice of this list from the files and prune
your queue the same way (verify-then-remove with citations, dedupe keeping the newest)._
