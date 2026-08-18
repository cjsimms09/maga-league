// TERRITORY: A
// VONA READS A MARKET THAT IS NOT OUR ROOM.
//
// Cory: "if vona is our main strategy this year we need to triple verify our
// VONA calculations and values are correct or we will ruin our predictions and
// the draft." This is the INPUT check of the three.
//
//     VONA(p) = proj_mean(p) − E[best available at his position at my NEXT pick]
//
// The arithmetic of expectedBestAvailable is sound. The risk is `survival()`,
// which is driven by ADP — a statement about SOME market, not about our room.
// VONA is 62% of what moves the composite, so if survival is wrong the primary
// decision metric is wrong.
//
// ── WHAT THIS FILE ASSERTS, AND WHAT IT REFUSES TO ────────────────────────
//
// It re-derives the tables in draft/backtest/VONA-ROOM-VS-MARKET.md from the
// data, so the claims move when the data moves. It asserts DIRECTION and
// CONSISTENCY, which the sample supports. It deliberately asserts NO
// MAGNITUDE and pins no correction: three drafts against a single year's ADP
// establishes that our room front-loads quarterbacks, and does not establish by
// how much. A fitted curve over six noisy slots is how a confident wrong number
// reaches a draft board.
//
// Run: node draft/tests/vona_room_vs_market.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const POS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8')).positions;
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const DOC = path.join(ROOT, 'draft', 'backtest', 'VONA-ROOM-VS-MARKET.md');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* COMPLETE DRAFTS ONLY. A 30-pick fragment has no QB4 and would silently
 * shorten every column it appears in. */
const DRAFTS = [];
(H.seasons || []).forEach(s => (s.drafts || []).forEach(d => {
  const pk = (d.picks || []).filter(x => x && x.pick_no != null && x.player_id != null);
  if (pk.length >= 150) DRAFTS.push(pk);
}));

const marketSlots = pos => B.players.filter(p => p.adp != null && p.position === pos)
  .map(p => p.adp).sort((a, b) => a - b);
const roomSlots = (pk, pos) => pk.filter(x => POS[String(x.player_id)] === pos)
  .map(x => x.pick_no).sort((a, b) => a - b);
const gaps = (pos, slot) => DRAFTS.map(pk => {
  const r = roomSlots(pk, pos), m = marketSlots(pos);
  return (slot < r.length && slot < m.length) ? r[slot] - m[slot] : null;
}).filter(v => v != null);

// ── 0. THE SAMPLE IS WHAT THE WRITE-UP SAYS IT IS ───────────────────────
{
  ck('three complete drafts, which is the sample every claim below rests on',
    DRAFTS.length === 3, DRAFTS.length);
  ck('and the board carries market ADP at all four positions',
    ['QB', 'RB', 'WR', 'TE'].every(p => marketSlots(p).length >= 6));
  ck('CONTROL — the position record resolves the historical ids, or every row '
    + 'below is computed over a fraction of the picks',
    DRAFTS.every(pk => pk.filter(x => POS[String(x.player_id)]).length > pk.length * 0.8),
    DRAFTS.map(pk => pk.filter(x => POS[String(x.player_id)]).length + '/' + pk.length));
}

// ── 1. QB — THE FINDING, ASSERTED AS DIRECTION AND CONSISTENCY ──────────
{
  const all = [];
  for (let i = 0; i < 6; i++) all.push(...gaps('QB', i));
  ck('every QB slot in every draft is taken EARLIER than market ADP — 18 of 18',
    all.length === 18 && all.every(g => g < 0),
    { n: all.length, positive: all.filter(g => g >= 0) });
  ck('QB1 is the tightest measurement we have, so it is the one to trust',
    Math.max(...gaps('QB', 0)) - Math.min(...gaps('QB', 0)) <= 4, gaps('QB', 0));
  /* AND THE DEEP SLOTS ARE NOT THE SAME QUALITY OF NUMBER. Asserted so nobody
   * later fits one curve across all six as if they were. */
  ck('the deep slots are MUCH noisier than QB1 — they must not carry equal '
    + 'weight in any correction',
  (Math.max(...gaps('QB', 2)) - Math.min(...gaps('QB', 2)))
    > 3 * (Math.max(...gaps('QB', 0)) - Math.min(...gaps('QB', 0))),
  { qb1_spread: Math.max(...gaps('QB', 0)) - Math.min(...gaps('QB', 0)),
    qb3_spread: Math.max(...gaps('QB', 2)) - Math.min(...gaps('QB', 2)) });
}

// ── 2. TE IS NOT THE SAME STORY, AND THE MEDIAN HID THAT ────────────────
// My first pass reported "TE1 −13.0" from a median and read it as a bias.
{
  const flips = s => { const g = gaps('TE', s); return g.some(x => x > 0) && g.some(x => x < 0); };
  ck('TE1 SIGN-FLIPS across drafts — some years this room takes an elite tight '
    + 'end early and some years it does not', flips(0), gaps('TE', 0));
  ck('and TE2 as well, so "TE is systematically early" is false at the top',
    flips(1), gaps('TE', 1));
  ck('CONTROL — a median over these WOULD read like a clean bias, which is how '
    + 'it was misreported', (function () {
    const g = gaps('TE', 0).slice().sort((a, b) => a - b);
    return g[1] < -5;
  })(), gaps('TE', 0));
  ck('the deeper TE slots ARE consistent, so the effect is real but late',
    gaps('TE', 4).every(x => x < 0), gaps('TE', 4));
}

// ── 3. RB AND WR — WHERE THE MARKET IS A GOOD MODEL OF OUR ROOM ─────────
// This is the half that makes the QB result credible: the same method finds
// nothing where nothing should be found.
{
  ['RB', 'WR'].forEach(pos => {
    const all = [];
    for (let i = 0; i < 5; i++) all.push(...gaps(pos, i));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    ck('CONTROL — ' + pos + ' shows no systematic bias, so the method is not '
      + 'manufacturing one', Math.abs(mean) < 2.5, { mean: mean.toFixed(2), n: all.length });
    ck('and ' + pos + ' signs flip rather than all pointing one way',
      all.some(x => x > 0) && all.some(x => x < 0));
  });
}

// ── 4. THE CONTROL THAT DOES NOT USE ADP FOR OUR COLUMN ─────────────────
{
  const mkt = B.players.filter(p => p.adp != null && p.position)
    .sort((a, b) => a.adp - b.adp);
  const qbBy = n => DRAFTS.map(pk =>
    pk.filter(x => x.pick_no <= n && POS[String(x.player_id)] === 'QB').length);
  const mktBy = n => mkt.slice(0, n).filter(p => p.position === 'QB').length;
  ck('by pick 48 our room has taken MORE quarterbacks than the market ordering '
    + 'implies, in every draft', qbBy(48).every(v => v > mktBy(48)),
  { ours: qbBy(48), market: mktBy(48) });
  ck('and by pick 90 FEWER, because they are already gone — front-loading, not '
    + 'simply more', qbBy(90).every(v => v < mktBy(90)),
  { ours: qbBy(90), market: mktBy(90) });
  /* THE RANGE IS THE POINT. If the crossover sat outside Cory's picks this
   * would be a curiosity rather than a defect. */
  const my = (B.pick_order || {}).my_picks || [];
  ck('and Cory\'s early picks sit INSIDE that window, which is what makes this '
    + 'a live defect rather than a curiosity',
  my.filter(p => p >= 24 && p <= 60).length >= 3, my.slice(0, 6));
}

// ── 5. THE WRITE-UP'S REFUSALS ARE ON THE RECORD ────────────────────────
// A measurement that does not say what it cannot support gets fitted by the
// next reader. These are the sentences that stop that.
{
  ck('the write-up exists', fs.existsSync(DOC));
  const doc = fs.readFileSync(DOC, 'utf8');
  ck('it states production is unchanged', /Nothing is wired; production is unchanged/.test(doc));
  ck('it names the YEAR CONFOUND — 2023-25 drafts against 2026 ADP, no matched '
    + 'historical series', /year confound/i.test(doc) && /2026/.test(doc));
  ck('it refuses to fit a correction', /No shift is fitted here/i.test(doc));
  ck('it records that my TE reading was WRONG and why the median hid it',
    /median/i.test(doc) && /sign flips/i.test(doc));
  ck('and it says the arm must run before anything ships', /before anything ships/i.test(doc));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the direction is re-derived from the data rather than');
console.log('quoted — our room front-loads quarterbacks at every slot in every draft, the');
console.log('same method finds nothing at RB and WR, and the crossover falls inside the picks');
console.log('Cory owns. The TE claim is asserted as INCONSISTENT, which is what it is.');
console.log('WHAT IT DOES NOT: establish a correction, or touch survival. Three drafts give');
console.log('a direction, not a magnitude, and the deep QB slots are far too noisy to fit.');
