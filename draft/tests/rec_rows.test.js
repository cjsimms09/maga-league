// TERRITORY: A
// HE ASKED FOR TEN CANDIDATES TWICE AND HAD FIVE BOTH TIMES.
//
// Cory, 2026-08-13, in these words:
//   "Need top 5 recommended players so I can compare options."
//   "Again! More options, I need to 10 next best players in easy view to make a
//    decision. Feel free to compact things more, even with smaller font. I can
//    click for more info."
//
// He already had five, which is why the first ask read as satisfied and nothing
// happened. The word "Again!" is the second one.
//
// ── THE TEN WERE ALREADY BEING COMPUTED, AND SHOWN TO NOBODY ────────────────
//
// `PredLedger.recommendation` has captured `out.scored.slice(0, 10)` on every
// pick since decision-capture went in. So ten candidates were scored, written
// down for the January grade, and then five were rendered. `all.slice(0, 5)`
// was the entire gap — no new model, no new data, one number.
//
// ── AND THAT MAKES A SECOND THING CHECKABLE THAT WAS NOT BEFORE ─────────────
//
// The ledger exists so a decision can be graded against the board it was made
// from. That only means anything if THE TEN RECORDED ARE THE TEN HE SAW. While
// the render showed five and the ledger stored ten, the extra five were rows
// nobody looked at, filed as though they had been considered. Now they are the
// same list, and this file pins them together so they cannot drift apart again.
//
// Run: node draft/tests/rec_rows.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const MY = D.pick_order.my_picks;
const REC = (function () {
  const m = SRC.match(/const REC_ROWS = (\d+);/);
  return m ? Number(m[1]) : null;
})();

/* ⚠️ THIS SUITE WAS GRADING A LIST NOBODY IS SHOWN (found 2026-08-14).
 *
 * Every context below carried `weights: (D.defaults && D.defaults.weights) ||
 * undefined`. `D.defaults` HAS NEVER EXISTED on the board — check the key list
 * of public/draft_data.json — so that expression has always evaluated to
 * `undefined`, and `engine.js:1448` then falls back to DEFAULT_WEIGHTS: all
 * eight terms live, `ceiling: 0.65`. The app initialises from MEASURED_WEIGHTS
 * (app.js:52, pinned in surface_contract.test.js): five of the eight are ZERO.
 *
 * MEASURED, not assumed. Same boards, same picks, weights the only variable:
 *
 *     the TOP recommendation differs at 7 of the 12 picks he owns
 *     34 of 120 name slots differ
 *     pick 33 — his FIRST — this suite said Zay Flowers; the app says Colston Loveland
 *
 * So the file whose stated purpose is *"the ten recorded for the January grade
 * are the ten he saw"* was asserting distinctness, availability, ordering and
 * spread over a tenth list that no surface renders and no ledger stores.
 *
 * IT IS THE SILENT FALLBACK THAT DID IT, not the wrong constant. `|| undefined`
 * turned "the board did not declare weights" into "score it however you like",
 * which is the same shape as the `|| echo` this repo already removed from the
 * keeper generator: an absent input reads as a successful one. So this REFUSES
 * instead. A suite that cannot find the production weights must stop, not guess.
 *
 * NO PRODUCTION BEHAVIOUR CHANGES HERE. The app already ran MEASURED_WEIGHTS;
 * only the yardstick moved onto the thing being measured. */
const WEIGHTS = (function () {
  const w = E.MEASURED_WEIGHTS;
  if (!w || typeof w.value !== 'number') {
    throw new Error('REFUSING to score: engine.js no longer exports MEASURED_WEIGHTS, '
      + 'which is what app.js initialises state.weights from. Scoring this suite with '
      + 'anything else grades a board that is not rendered anywhere.');
  }
  return w;
})();

/* AND WHAT IS STILL NOT THE APP'S CONTEXT, NAMED RATHER THAN QUIETLY FIXED:
 * every context below passes `roster: []` and `currentKeepers: []` at all twelve
 * picks, while the app supplies `state.myRoster` — which holds Cory's three
 * keepers before the first pick and twelve players by the last. That is a real
 * gap and it is NOT the same defect: the weights line was an input that silently
 * went missing, whereas the empty roster is a simplification with no recorded
 * intent and no obvious right value (inventing a roster for pick 133 would be
 * fiction, and `need` is weighted 0 so the largest term it feeds is inert).
 * Named here so this file cannot read as "the suite now matches production". */

// ── 1. THE NUMBER, AND THAT IT IS A NAMED ONE ───────────────────────────
{
  ck('the row count is a NAMED constant, not a literal buried in a slice — the '
    + 'literal is why this went two asks without moving', REC !== null, REC);
  ck('and it is the ten he asked for', REC === 10, REC);
  ck('the render really uses it', /const scored = all\.slice\(0, REC_ROWS\);/.test(SRC));
  ck('FAIL ARM — the shipped behaviour was five, so this file is not asserting '
    + 'something that was already true', REC !== 5);
}

// ── 2. THE LEDGER AND THE SCREEN ARE THE SAME TEN ───────────────────────
// The whole point of decision-capture. If these diverge, January grades a board
// Cory never saw, and nothing anywhere would say so.
{
  const cap = SRC.match(/top: out\.scored\.slice\(0, (\d+)\)/);
  ck('the ledger capture depth is locatable', !!cap, cap && cap[1]);
  ck('what is RECORDED for the grade is exactly what is RENDERED — a ledger '
    + 'holding rows nobody was shown files them as considered when they were not',
  cap && Number(cap[1]) === REC, { ledger: cap && Number(cap[1]), rendered: REC });
}

// ── 3. THE BOARD ACTUALLY HAS TEN TO GIVE, AT EVERY PICK HE OWNS ────────
// Raising a ceiling over an empty room changes nothing. Measured on a
// market-follow board (at pick N the N-1 best ADPs are gone) rather than the
// pre-draft board, which is not a state that exists at pick 48.
{
  function boardAt(pick) {
    const priced = D.players.filter(p => p.adp != null).slice().sort((a, b) => a.adp - b.adp);
    const gone = new Set(priced.slice(0, pick - 1).map(p => String(p.player_id)));
    return D.players.filter(p => !gone.has(String(p.player_id)));
  }
  const rows = MY.map(pick => {
    const board = boardAt(pick);
    const next = MY.find(p => p > pick) || null;
    const ctx = {
      board: board, nextPick: next, totalPicks: (D.pick_order.picks || []).length || null,
      myPicksLeft: MY.filter(p => p >= pick).length, roster: [], doctrine: null,
      myPickIndex: Math.max(0, MY.indexOf(pick)), totalMyPicks: MY.length,
      currentKeepers: [], league: D.league,
      weights: WEIGHTS,
      runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: pick,
      intervening: next ? next - pick : 0,
      roundsLeft: Math.max(0, Math.ceil((150 - pick) / (D.league.teams || 10))),
    };
    const s = (E.onTheClock(ctx, { avoid: [], target: [] }) || {}).scored || [];
    return { pick: pick, n: s.length, shown: s.slice(0, REC) };
  });
  const short = rows.filter(r => r.n < REC);
  ck('every pick he owns really has ' + REC + ' scored candidates behind it, so '
    + 'the extra rows are players and not blanks', short.length === 0,
  short.map(r => ({ pick: r.pick, had: r.n })));

  /* THE ROWS HE GAINED MUST BE NEW PLAYERS. "Gibbs listed twice" is the exact
   * complaint this change could make worse rather than better if positions 6-10
   * repeated anybody. */
  const dupes = rows.map(r => {
    const ids = r.shown.map(s => String(s.player.player_id));
    return { pick: r.pick, dup: ids.filter((v, i) => ids.indexOf(v) !== i) };
  }).filter(r => r.dup.length);
  ck('no player appears twice inside the widened list', dupes.length === 0, dupes.slice(0, 3));
  const nameDupes = rows.map(r => {
    const ns = r.shown.map(s => s.player.name);
    return { pick: r.pick, dup: [...new Set(ns.filter((v, i) => ns.indexOf(v) !== i))] };
  }).filter(r => r.dup.length);
  ck('and no two rows carry the same NAME either — same-name players are real on '
    + 'this board and read as a duplicate whatever their ids say',
  nameDupes.length === 0, nameDupes.slice(0, 3));

  /* ── ORDERED, AND WHERE IT IS NOT, IT SAYS WHY ──────────────────────────
   *
   * MY FIRST VERSION OF THIS ASSERTED STRICT SCORE ORDER AND WENT RED AT SEVEN
   * OF THE TWELVE PICKS. The engine was right and the assertion was wrong:
   * `applyCeilingTiebreak` deliberately reorders same-position, same-tier
   * near-ties toward the higher ceiling, which engine.test.js already guards.
   * Loosening this to "mostly ordered" would have thrown away the check.
   *
   * But driving it turned up something real. The swap was SILENT, so the live
   * board printed row 6 at 31.6 above row 7 at 32.9 — Waddle over Higgins — with
   * nothing on the card to distinguish a deliberate tiebreak from a broken sort.
   * Cory on that screen: "This screen doesn't make sense?" A reader who cannot
   * tell those apart stops trusting the score column, which is the column he
   * compares ten candidates with.
   *
   * So the invariant is the honest one: EVERY inversion is a marked tiebreak.
   * That is stronger than strict ordering, not weaker — it admits the one
   * documented exception and forbids every other. */
  const unexplained = [];
  rows.forEach(r => r.shown.forEach((s, i) => {
    if (i === 0) return;
    if (s.score <= r.shown[i - 1].score + 1e-9) return;
    if (!s.ceiling_tiebreak && !r.shown[i - 1].ceiling_tiebreak) {
      unexplained.push({ pick: r.pick, row: i + 1, name: s.player.name,
        above: r.shown[i - 1].player.name, scores: [r.shown[i - 1].score, s.score] });
    }
  }));
  ck('the list is ranked all the way down, and EVERY inversion is a marked '
    + 'ceiling tiebreak — a lower score above a higher one with no reason on it '
    + 'is indistinguishable from a broken sort', unexplained.length === 0,
  unexplained.slice(0, 3));
  /* ── THE CONTROL INVERTED, 2026-08-17, AND THAT IS THE POINT ──────────────
   *
   * This used to demand that inversions DO occur on the live board, so the
   * clause above could not pass vacuously. It was a good control and it is now
   * measuring the opposite fact, because the thing it was guarding got fixed.
   *
   * `moreUpsideThanTheCellExplains()` now refuses any swap whose only
   * justification is the two players' calibration constants — and while
   * `proj_ceiling` is `proj_mean × a per-cell constant`, that is EVERY
   * cross-cell swap. So zero marked inversions on the live board is the correct
   * state, not a vacuous one. (It fired live before the guard: Bo Nix, 14.5
   * points worse than Brock Purdy, promoted over him and labelled "on upside".
   * Cory caught it on the screen; there were 16 inversions in that one list.)
   *
   * SO THE CONTROL MOVES TO WHERE IT CAN STILL FAIL. The clause above says
   * "every inversion carries a mark". Its vacuity risk is that the ENGINE stops
   * producing inversions for a bad reason — a broken comparator, a sort that
   * silently drops entries — rather than for this deliberate one. That is what
   * gets checked now: the mechanism still marks an inversion when the ceiling
   * genuinely varies, so the clause above is exercised on data where inversions
   * are real, and any live inversion is still required to carry its reason. */
  {
    const wr = (name, mean, ceil, rank) => ({ name, position: 'WR', tier: 1,
      pos_rank: rank, proj_mean: mean, proj_ceiling: ceil, vorp: 50,
      proj_floor: mean * 0.5, adp: 40, player_id: name });
    const out = E.recommend({ board: [wr('steady', 150, 175, 1), wr('boom', 150, 230, 2)],
      roster: [], league: { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } },
      currentPick: 40, nextPick: 53, totalPicks: 150, myPicksLeft: 11,
      roundsLeft: 11, runMultipliers: {}, weights: E.DEFAULT_WEIGHTS });
    const list = Array.isArray(out) ? out : Object.values(out);
    ck('CONTROL — a marked inversion is still PRODUCED where the ceiling carries '
      + 'real information, so the clause above is exercised rather than vacuous',
    list.some(s => s && s.ceiling_tiebreak && s.ceiling_tiebreak.over),
    list.map(s => (s.player || {}).name + (s.ceiling_tiebreak ? '*' : '')).join(','));
    ck('  and on the LIVE board there are none, because every cross-cell swap '
      + 'there would be decided by a calibration constant',
    !rows.some(r => r.shown.some(s => s.ceiling_tiebreak)),
    'if this fails the live ceiling has started carrying per-player information');
  }
  const marks = [].concat(...rows.map(r => r.shown.filter(s => s.ceiling_tiebreak)));
  ck('every mark NAMES the man it passed — a reason the reader cannot check '
    + 'against the row below it is not a reason', marks.every(s => !!s.ceiling_tiebreak.over),
  marks.map(s => s.ceiling_tiebreak).slice(0, 2));
  /* THE MARK MUST REACH THE CARD — but "first reason" is the wrong demand, and
   * asserting it turned up the real precedence rule rather than a defect.
   * `applyRosterLegality` prepends "FORCED — 7 picks left and you still need
   * DEF, K, QB, 2xRB, TE, 2xWR. Nothing else can legally start." That outranks
   * an upside tiebreak and should: one is why this player is the only legal
   * pick, the other is why he edged the man below him. So the mark must be
   * PRESENT, and anything ahead of it must be a forcing line. */
  ck('the mark reaches the card rather than living only on the object',
    marks.every(s => (s.reasons || []).some(r => /ahead of .+ on upside/.test(r))),
    marks.filter(s => !(s.reasons || []).some(r => /ahead of .+ on upside/.test(r)))
      .map(s => s.player.name).slice(0, 3));
  ck('and the only thing allowed ahead of it is a FORCED legality line — a '
    + 'reason that says this is the only legal pick outranks one that says he '
    + 'edged the man below', marks.every(s => {
    const rs = s.reasons || [];
    const i = rs.findIndex(r => /ahead of .+ on upside/.test(r));
    return i <= 0 || rs.slice(0, i).every(r => /^FORCED —/.test(r));
  }), marks.map(s => (s.reasons || [])[0]).filter(r => r && !/^(FORCED —|↑ ahead of)/.test(r)).slice(0, 3));
  ck('every marked promotion really is inside the tie threshold it cites — a '
    + 'tiebreak that fired on a real gap would be the model overruling itself',
  marks.every(s => Math.abs(s.ceiling_tiebreak.score_gap) < E.CFG.TIE_THRESHOLD + 1e-9),
  marks.map(s => s.ceiling_tiebreak.score_gap));
  ck('and really does have the higher ceiling, which is the whole justification',
    marks.every(s => s.ceiling_tiebreak.ceiling > s.ceiling_tiebreak.ceiling_over),
    marks.map(s => [s.ceiling_tiebreak.ceiling, s.ceiling_tiebreak.ceiling_over]).slice(0, 3));

  /* WHERE THE INVERSIONS LAND — REPORTED, NOT ASSERTED.
   *
   * This block was written when the known instance was row 6 over row 7 at pick
   * 33, which is far enough down the card to read as a curiosity. It is not:
   * re-measured on the current board the promotion at pick 33 — CORY'S FIRST
   * PICK — is at ROW 2, so the score column reads 17.3 / 16.5 / 17.0 from the
   * very top. That is what moved the mark next to the score in `.rec-actions`.
   *
   * PRINTED RATHER THAN ASSERTED, deliberately. "A promotion lands in the top
   * three" is a fact about today's projections, not a property of the code; a
   * rebuild that moves it to row 7 has broken nothing, and a red test there
   * would be the model punished for the board changing. The structural claims
   * are asserted below; this is the evidence that made them worth asserting. */
  {
    const ranks = [];
    rows.forEach(r => r.shown.forEach((s, i) => {
      if (s.ceiling_tiebreak) ranks.push({ pick: r.pick, row: i + 1, name: s.player.name });
    }));
    console.log('      ceiling promotions, by row: '
      + (ranks.map(x => 'pick ' + x.pick + ' row ' + x.row).join(', ') || 'none'));
    const top3 = ranks.filter(x => x.row <= 3);
    console.log('      of those, ' + top3.length + ' land in the top three rows'
      + (top3.length ? ' (' + top3.map(x => x.name + ' @' + x.pick).join(', ') + ')' : ''));
  }

  /* WHAT THE EXTRA ROWS ARE WORTH, stated rather than assumed. If rows 6-10 were
   * a rounding error behind row 5 they would be noise; if they span a real
   * spread they are options. Reported as a measurement, asserted only weakly —
   * this is context for B's layout, not a threshold anybody tuned. */
  const spreads = rows.map(r => Math.round((r.shown[4].score - r.shown[REC - 1].score) * 10) / 10);
  console.log('      rows 5→10 score spread at each pick: ' + spreads.join(', '));
  ck('the rows he gained are not all tied with row 5 — they are real alternatives',
    spreads.filter(v => v > 1).length >= MY.length - 2, spreads);
}

// ── 4. A THIN BOARD RENDERS WHAT IT HAS ─────────────────────────────────
// The ceiling must never become a quota. Late in a draft, or in a mock with a
// short pool, fewer than ten is the correct answer.
{
  const three = D.players.filter(p => p.adp != null).sort((a, b) => a.adp - b.adp).slice(0, 3);
  const ctx = {
    board: three, nextPick: 148, totalPicks: 150, myPicksLeft: 1, roster: [],
    doctrine: null, myPickIndex: 11, totalMyPicks: 12, currentKeepers: [],
    league: D.league, weights: WEIGHTS,
    runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: 133,
    intervening: 15, roundsLeft: 2,
  };
  const s = (E.onTheClock(ctx, { avoid: [], target: [] }) || {}).scored || [];
  ck('a three-player board yields three, not ten padded with blanks',
    s.slice(0, REC).length === 3, s.length);
  ck('and an empty board yields nothing rather than throwing',
    ((E.onTheClock(Object.assign({}, ctx, { board: [] }), { avoid: [], target: [] })
      || {}).scored || []).slice(0, REC).length === 0);
}

// ── 5. THE GUARD THAT MUST STILL FIRE ───────────────────────────────────
// The panel refuses to draw at all while reconcile halts — ten rows of a board
// derived from a slate known to be wrong is worse than five, not better.
{
  ck('the reconcile halt still short-circuits the panel before any row renders',
    /if \(state\.reconcile && state\.reconcile\.halt\) \{[\s\S]{0,400}?return;/.test(SRC));
  /* SCOPED TO THE FUNCTION. My first version used bare `SRC.indexOf`, which
   * finds the FIRST occurrence anywhere in an 8,300-line file — there is an
   * earlier `state.reconcile.halt` in another function, so the assertion
   * compared two positions that have nothing to do with each other and failed
   * for a reason that had nothing to do with the code. A position check over
   * the wrong window is not a weaker check, it is a different one. */
  {
    const body = (function () {
      const i = SRC.indexOf('  function renderRecommendations(');
      return SRC.slice(i, SRC.indexOf('\n  }\n', i));
    })();
    const slice = body.indexOf('const scored = all.slice(0, REC_ROWS);');
    const halt = body.indexOf('state.reconcile && state.reconcile.halt');
    const map = body.indexOf('scored.map((s, i) =>');
    ck('all three landmarks are inside renderRecommendations, or the ordering '
      + 'below compares nothing', slice >= 0 && halt >= 0 && map >= 0,
    { slice: slice, halt: halt, map: map });
    ck('and the halt sits AFTER the slice but BEFORE the rows are drawn, so '
      + 'widening the list did not move it past the guard',
    slice < halt && halt < map, { slice: slice, halt: halt, map: map });
  }
}

// ── 6. THE PROMOTION IS MARKED IN THE COLUMN THAT LOOKS WRONG ───────────
/* THE DATA EXISTED AND THE COLUMN STILL LOOKED BROKEN, WHICH IS THE WHOLE CLASS.
 *
 * Section 3 above asserts `ceiling_tiebreak` is set and that a reason naming the
 * passed man reaches `reasons`. Both were true, and both were true of the LEFT
 * side of the card: `.rec-why`, sharing a line with a second reason. The number
 * that looks wrong is `.rec-score`, on the RIGHT, in `.rec-actions`. A guard on
 * the field is not a guard on the surface — that gap is exactly what the war-room
 * audit keeps finding, and I had routed this half to B twice before checking that
 * `public/js/draft/app.js` is A's ("A keeps app.js — the logic and the markup it
 * emits", scripts/territory-check.sh). Emitting it was mine the entire time.
 *
 * So what is asserted here is ADJACENCY, not presence: the mark and the score
 * must be in the same element, and the sentence must stay in a different one. */
{
  const body = (function () {
    const i = SRC.indexOf('  function renderRecommendations(');
    return SRC.slice(i, SRC.indexOf('\n  }\n', i));
  })();
  ck('CONTROL — the render body is locatable, or every position below is a '
    + 'comparison between two -1s', body.length > 500, body.length);

  ck('a promoted row is marked in the markup, not only on the object',
    /class="rec-promoted"/.test(body));
  ck('and the mark is CONDITIONAL on the tiebreak — an unconditional badge says '
    + 'nothing and would appear on every row',
  /s\.ceiling_tiebreak[\s\S]{0,80}class="rec-promoted"/.test(body));

  const actions = body.indexOf('<div class="rec-actions">');
  const mark = body.indexOf('class="rec-promoted"');
  const score = body.indexOf('class="rec-score"');
  const why = body.indexOf('class="rec-why"');
  ck('CONTROL — all four landmarks resolve', actions > 0 && mark > 0 && score > 0
    && why > 0, { actions: actions, mark: mark, score: score, why: why });
  ck('the mark sits INSIDE `.rec-actions`, the block that holds the score',
    mark > actions, { actions: actions, mark: mark });
  ck('and IMMEDIATELY BEFORE `.rec-score` — the inversion is in that column, so '
    + 'that column is where the explanation has to be', mark < score
    && score - mark < 900, { mark: mark, score: score, gap: score - mark });
  ck('while the full sentence stays in `.rec-why`, a DIFFERENT element — the '
    + 'mark is a pointer, not a duplicate of the reason', why < actions,
  { why: why, actions: actions });

  ck('the mark names the man it passed, so the reader can check it against the '
    + 'row below', /ceiling_tiebreak\.over/.test(body));
  ck('and carries the arithmetic — the gap and both ceilings',
    /ceiling_tiebreak\.score_gap/.test(body)
      && /ceiling_tiebreak\.ceiling\b/.test(body)
      && /ceiling_tiebreak\.ceiling_over/.test(body));

  /* READABLE WITHOUT A POINTER. The `title` carries the arithmetic and titles do
   * not exist on a phone; if the visible text were empty the mark would be
   * invisible exactly where Cory is most likely to be reading it. */
  ck('there is VISIBLE text on the mark, not only a hover title',
    />↑ upside</.test(body));

  ck('the class is emitted bare so B can style it, and A ships only a legible '
    + 'fallback rule — the same split as `.rec-context`',
  /PROMOTED_CSS/.test(SRC) && /const PROMOTED_CSS =/.test(SRC));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: ten ranked, distinct, genuinely-scored candidates at');
console.log('every pick Cory owns; the ten recorded for the January grade are the same ten');
console.log('he was shown; a thin board still renders only what it has; and the reconcile');
console.log('halt still stops the panel before a single row is drawn.');
console.log('WHAT IT DOES NOT: make ten cards readable. He asked for more rows AND for them');
console.log('compacted in the same breath — ten at the current card size is a wall, and the');
console.log('card is B\'s. Row count was mine and it was one number.');
