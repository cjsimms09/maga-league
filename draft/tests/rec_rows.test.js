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
      weights: (D.defaults && D.defaults.weights) || undefined,
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
  ck('CONTROL — inversions really do occur on this board, so the clause above is '
    + 'not vacuous', rows.some(r => r.shown.some(s => s.ceiling_tiebreak)),
  rows.filter(r => r.shown.some(s => s.ceiling_tiebreak)).map(r => r.pick));
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
    league: D.league, weights: (D.defaults && D.defaults.weights) || undefined,
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

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: ten ranked, distinct, genuinely-scored candidates at');
console.log('every pick Cory owns; the ten recorded for the January grade are the same ten');
console.log('he was shown; a thin board still renders only what it has; and the reconcile');
console.log('halt still stops the panel before a single row is drawn.');
console.log('WHAT IT DOES NOT: make ten cards readable. He asked for more rows AND for them');
console.log('compacted in the same breath — ten at the current card size is a wall, and the');
console.log('card is B\'s. Row count was mine and it was one number.');
