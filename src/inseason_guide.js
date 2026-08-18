'use strict';
// THE IN-SEASON EXPLAINER CONTRACT — one table, four pages (2026-08-16 design pass).
//
// The war-room pass's rule, inherited verbatim: every panel explains itself in
// four halves — WHAT it says / how to READ it / what to DO with it (the
// implementation half Cory's fidelity gate demands: "the design is actually
// implementing and explaining what the model says or the model is useless if I
// cant implement it") / and the cited SOURCE of truth. A wrong explainer is
// worse than none — the war-room pass found a live one — so every load-bearing
// claim in this table is pinned by draft/tests/inseason_explainers.test.js
// against the code it paraphrases: cited files exist, cited functions exist in
// them, and every quoted threshold equals the live constant.
//
// This is a VIEW-MODEL table, not logic: nothing here computes, decides, or
// rescores. The routes pass the page's entry to the view; the view renders it
// through views/partials/_wr_explain.ejs (the ⓘ disclosure).

const GUIDE = {
  lineup: {
    posture: {
      what: 'The week’s one real call — chase the weekly $100 or protect the matchup — read off what the E[$] solver actually did, never invented.',
      read: 'CHASE means the solver traded floor for ceiling (its edge over your studs is ≥ $1). PROTECT means your highest-projection lineup is already the dollar-optimal one. PENDING means no projections have landed, so there is nothing to optimize yet.',
      do: 'CHASE: start the marked ceiling plays and accept the variance — the matchup is either nearly banked or nearly lost. PROTECT: start your studs and bank the floor. PENDING: check back closer to kickoff.',
      src: 'src/routes/lineup.js weeklyPosture() — chasing = edge ≥ 1; the P(win)/P($100) sentences are optimize()’s own ev fields',
    },
    playthis: {
      what: 'The lineup that maximises expected DOLLARS, not points: E[$] = P(win) × $110 of playoff equity + P(clear the weekly-high band) × $100.',
      read: 'Proj is the projection feed’s own number (season average until Sleeper’s land) — raw, checkable, not our valuation. 🎯 marks a ceiling bet the solver started over a higher-floor stud. A player who cannot score this week (bye, OUT) is zeroed and listed under the table — an absence is explained, never silent.',
      do: 'Set exactly these starters in Sleeper — the site never writes to Sleeper. Then log the decision below so January can grade it.',
      src: 'src/routes/lineup.js optimize() — hill-climb on E[$] from the projection-optimal lineup; the band is weeklyHighBand(), the harvested distribution of real winning scores',
    },
    todo: {
      what: 'Your ACTUAL Sleeper lineup diffed against the recommendation — the only list on this page you can act on.',
      read: 'Each row is one swap, priced in projected points (the number you can check against Sleeper in ten seconds) and in modelled dollars (which run through the opponent estimate and the weekly-high band — treat as directional).',
      do: 'Make the swaps in Sleeper, then press Log. If this card is absent, your set lineup already matches the recommendation.',
      src: 'src/routes/lineup.js optimize() `set` — the diff against ctx.current, your live starters; each change priced one swap at a time',
    },
    calls: {
      what: 'Where the dollar-optimal lineup deviates from “start your studs” — the dual objective’s own moves, each priced in dollars.',
      read: 'The measured honesty: the optimizer only finds a better lineup than your studs ~11% of weeks (~$9/season), so the quiet card is the normal one — 9 weeks in 10. When a move starts the LOWER projection, the dollars come from variance the mean can’t see; the disagreement box shows both numbers so you can tell working from broken.',
      do: 'On a quiet week, start your studs — that IS the recommendation. On a week with moves, give it a second look before kickoff: rare is exactly when it pays.',
      src: 'src/routes/lineup.js optimize() calls[] — recommended vs the projection-optimal lineup; deviation frequency measured by A (2026-08-10)',
    },
    proof: {
      what: 'The validation face: the same solver that recommends live reproduces the Lab’s certified leak measurement on 2023–25 to the dollar.',
      read: 'Gold figures are dollars left on the bench per team per season; weekly-high money is ~70–75% of the leak. Efficiency = realized ÷ optimal points, regular season only.',
      do: 'Nothing to do here — this face exists so you can trust the live one. Drill any real week to see the exact benched boom that cost the money.',
      src: 'src/routes/lineup.js ceilingLeak() / replayEfficiency() / weekDrill() — certified against the Lab’s grader (EFFICIENCY-LEAK.md, experiment L0)',
    },
  },

  waivers: {
    claims: {
      what: 'What each wire claim would ADD to your starting lineup, in points and dollars — the numerator of the priority-waivers stopping problem, deliberately not the answer.',
      read: 'net pts = your best lineup after the claim (minus the drop) − your best lineup today, both through the same bestLineup() solver the optimizer uses — one baseline, never clamped. Dollars = net × the marginal $/pt, which prices how one added point moves P(win) × $110 and P(weekly high) × $100. Contested is stated and NEVER in the price.',
      do: 'Weigh the number against your spot in the waiver order — how many weeks are left and what usually hits the wire later is not modelled, and the page says so once, up top. Then log the claim or the hold so the season grades it.',
      src: 'src/routes/waivers.js evaluateClaims() → V.claimValue (shared valuation, contract C1) and dollarsPerPoint()',
    },
    spend: {
      what: 'The other side of the ledger: what spending your priority position actually costs, said plainly.',
      read: 'A claim spends a position you get back slowly; the stopping rule (claim when the value beats what you expect to see before your priority recovers) needs the wire’s arrival distribution, which is not built.',
      do: 'Until that exists, this page is deliberately one number short of a decision — the number above is what you weigh, the order position is yours to price.',
      src: 'the gap is documented in LEARNING-ARCHITECTURE.md §1; nothing on this page models it',
    },
    stream: {
      what: 'K/DEF streaming — a FREE weekly swap, not a priority claim: the alternative is keeping who you already have.',
      read: 'Same evaluateClaims() net-points ranking as the claims above, filtered to K/DEF — season-value, not matchup-tuned (no opponent-defense or weather signal exists in it). A real limit, stated rather than hidden.',
      do: 'Stream when the ranked gap is real; it costs no priority. Log it against who you hold so the kept player’s week grades the call.',
      src: 'src/routes/member.js /waivers route streamClaims — evaluateClaims() filtered to K/DEF; no new scoring logic',
    },
  },

  accuracy: {
    summary: {
      what: 'The grading pipeline’s state: how many predictions the tools have committed, and how many reality has graded.',
      read: 'Every forecast is graded only if it was committed strictly before it resolved — no backdating. “Newly graded” is the difference between the last two runs of the append-only calibration ledger.',
      do: 'If “newly graded” sits at zero for weeks during the season, the loop has stopped turning — check the weekly grade cron before trusting anything else on this page.',
      src: 'the calibration:<season>:<ISO> ledger written by the weekly grader; shaped by src/routes/accuracy.js buildAccuracyView()',
    },
    overrides: {
      what: 'Your override record — how often you went against the tool and how much the tool said was at stake, straight off the prediction ledger.',
      read: 'The gap is the size of the disagreement, not a claim about who was right; contested means the tool was within $2 of indifferent. The verdict column stays absent until grading joins outcomes.',
      do: 'Keep logging every decision — follow AND override — or this card measures nothing. The one-tap chips on the optimizer and the wire are the capture.',
      src: 'src/routes/accuracy.js capturedOverrides() over the prediction ledger (lineup_call + inseason_override kinds)',
    },
    calibration: {
      what: 'The trust measurement: when the tools say 70%, does it happen 70% of the time?',
      read: 'Brier is mean squared error on probability calls — 0 is perfect, 0.250 is a coin flip. On the reliability curve the tick is perfect calibration; a bar short of its tick = overconfident, past it = underconfident.',
      do: 'Scale your trust to this page: a well-calibrated 60% is a real 60% — act on it as one. If the bars run short of the ticks, discount the tools’ confidence before you discount their picks.',
      src: 'graded by the weekly cron in src/forecast_grade.js shapes; the Brier-per-run series is one point per grading run of the ledger',
    },
    bykind: {
      what: 'The report card by prediction type — which TOOLS have earned trust, not just the aggregate.',
      read: 'Each row is one kind of call. Hit rate is graded against a 50% coin-flip benchmark (the hairline tick); Brier against 0.250. Decision rows (start/sit, waivers, streams) also show the measured edge in real points — the decision as recorded vs its recorded alternative — and how many of the logged decisions have resolved.',
      do: 'Lean on the kinds that grade well; treat the thin rows (small n) as unproven rather than bad. A season is the honest sample size.',
      src: 'src/routes/accuracy.js byKindRows() / deriveByKind() — the grader’s own roll-up when present, derived from the graded records otherwise',
    },
    misses: {
      what: 'The failure modes, ranked — the most confident wrong calls, never padded with successes.',
      read: 'Probability misses rank by Brier (confident-and-wrong first); point misses scale by relative error so a small miss on a big number stays small.',
      do: 'Read for a pattern, not a verdict: three misses of the same shape is a model defect worth filing; three scattered ones is variance.',
      src: 'src/routes/accuracy.js biggestMisses() — only actual misses qualify; a 55% call that hit is a mild call, not a failure',
    },
    attribution: {
      what: 'What each model component has actually been worth in realised dollars, filling in as the season grades decisions.',
      read: 'Read “$X realised on decisions where the tool recommended Y” — never “the tool earned $X”. Unmeasured cells say so instead of wearing a guessed number.',
      do: 'Nothing until cells fill; when they do, weight next season’s model work toward the components with measured worth.',
      src: 'the attribution:<season> doc (A’s lane); this page only renders what is measured',
    },
  },

  analyzer: {
    board: {
      what: 'Every team classified by what it is actually playing for, from calibrated playoff odds — the posture the other tools consume.',
      read: 'The engine’s own cut points, nothing invented: LOCK ≥ 85% playoff odds · CHASING $100 ≤ 10% · DESPERATE ≤ 30% · CONTENDER in between. Odds come from 3,000 seeded rest-of-season simulations.',
      do: 'Trade with the desperate — they overpay to swing a long shot. Expect max-ceiling lineups from anyone chasing the $100 regardless of matchup. A lock has nothing to play for but the weekly high, so their claims and streams tell you what they value.',
      src: 'src/routes/standings.js projectStandings() posture ladder (0.85 / 0.30 / 0.10); consumed by whoElseNeeds() on the wire',
    },
    table: {
      what: 'The full projection under the board: playoff odds, expected wins, posture, and the raw scoring average — every number the board summarises.',
      read: 'Avg pts is each team’s realized weekly average — raw, unmodelled, not our valuation. The odds are a chain (points → win probability → playoff odds); the raw column is the sanity check on that chain.',
      do: 'When a team’s odds and its scoring disagree, look before you trust — that disagreement is where the model is either seeing schedule or missing something.',
      src: 'src/routes/standings.js projectStandings() — 3000 sims, fixed seed; the playoff cut comes from the league’s own settings via playoffCut()',
    },
    validation: {
      what: 'What the simulator is measurably worth, said before the numbers rather than under them.',
      read: 'Picking the top four it barely beats reading the standings; the value is the CALIBRATED probabilities — a 60% team really makes it about 60% of the time.',
      do: 'Never read the top four as sharp. Use the probabilities as real odds — they are what the postures, the wire’s rival read, and the trade lens actually consume.',
      src: 'src/routes/standings.js validateStandings() — forward checkpoints on completed seasons',
    },
  },
};

module.exports = { GUIDE };
