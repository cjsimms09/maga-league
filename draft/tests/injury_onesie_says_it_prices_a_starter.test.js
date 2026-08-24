/* THE LINE SAID "insurance, not a starter" WHILE PRICING HIM AS A STARTER.
 *
 * Register E20. `onesieState`'s injury exception returns `discount: 1`, and the
 * application in `recommend` is gated on `onesie.discount < 1` — so this branch
 * applies NO discount and prices a positional duplicate at full standalone
 * value, exactly as if the slot were empty.
 *
 * That price is defensible on the football: if your starter is on PUP, this man
 * plays. It is the opposite of what the sentence told the reader.
 *
 * MEASURED on the live board with George Kittle (TE, PUP, proj 152.8) rostered
 * and the FLEX closed:
 *
 *     TE1 flagged PUP    -> Travis Kelce rank 4 at pick 73, score 6.1
 *     TE1 healthy        -> Travis Kelce rank 8 at pick 73, score 0.6
 *
 * A tenfold difference in score, under a line saying he was not being treated
 * as a starter.
 *
 * This file pins the SENTENCE, not the price. Nothing here asserts the discount
 * should change — that question (and whether PUP should differ from IR) is E20,
 * owner A.
 *
 * Run: node draft/tests/injury_onesie_says_it_prices_a_starter.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const ART = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
const board = ART.players, L = ART.league, RP = ART.replacement.replacement_points;

const W = (function () {
  const w = E.MEASURED_WEIGHTS;
  if (!w || typeof w.value !== 'number') {
    throw new Error('REFUSING to score: engine.js no longer exports MEASURED_WEIGHTS.');
  }
  return w;
})();

/* ⚠️ FILTERED TO CORY'S SEAT (A, 2026-08-24, register 303). Post-lock
 * `kept_players` is the whole league's 23, and these rows go to
 * `ctx.currentKeepers`, which composite.js folds into INCUMBENTS —
 * the men competing for MY keeper slots. Its own comment says "with
 * three valued keepers the bar is ranked[2]". Twenty-three inflates
 * that bar and collapses every candidate's keeper value, and `keeper`
 * ships at weight 1.0. */
const _mySlot = String((ART.league || {}).my_draft_slot);
const keepers = ART.kept_players
  .filter(k => String(k.team_slot) === _mySlot)
  .map(k => Object.assign({}, k, { is_keeper: true,
    vorp: Math.round((k.proj_mean - RP[k.position]) * 100) / 100 }));
const kittle = board.find(p => p.name === 'George Kittle');
const filler = board.find(p => p.name === 'Chuba Hubbard');
const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));

function run(status, pick) {
  const te1 = Object.assign({}, kittle, { injury_status: status });
  const roster = keepers.concat([te1, filler]);
  const t = new Set();
  for (let i = 0; i < pick - 1 && i < byAdp.length; i++) t.add(String(byAdp[i].player_id));
  roster.forEach(p => t.add(String(p.player_id)));
  const out = E.onTheClock({ board: board.filter(p => !t.has(String(p.player_id))),
    roster: roster, currentKeepers: keepers, league: L, weights: W, currentPick: pick,
    nextPick: pick + 15, totalPicks: 150, myPicksLeft: 8, roundsLeft: 8,
    runMultipliers: {}, intervening: [], taken: t }, { targets: [], avoid: [] });
  const i = out.scored.findIndex(s => s.player.position === 'TE');
  return { rank: i + 1, s: out.scored[i] };
}

// ─────────────── 1. the premise: a real PUP starter exists on the live board
ck('George Kittle really is on the board flagged PUP — this scenario is not '
  + 'hypothetical', !!kittle && String(kittle.injury_status) === 'PUP',
kittle && { name: kittle.name, status: kittle.injury_status, proj: kittle.proj_mean });

// ─────────────── 2. KNOWN-POSITIVE: the exception fires and is NOT discounted
const hurt = run('PUP', 73);
ck('KNOWN-POSITIVE: with an injured starter the TE2 takes the injury exception',
  hurt.s.onesie && hurt.s.onesie.exception === 'injury',
  hurt.s.onesie);
ck('and he is NOT discounted — the branch prices him at full value',
  hurt.s.onesie && hurt.s.onesie.discounted === false, hurt.s.onesie);

// ─────────────── 3. the price really is materially different
const well = run(null, 73);
ck('CONTROL: with a HEALTHY starter the same player IS discounted', 
  well.s.onesie && well.s.onesie.discounted === true, well.s.onesie);
/* ⚠️ THE `hurt.rank < well.rank` CONJUNCT WAS REMOVED 2026-08-21, AND IT WAS
 * NOT REMOVED TO GO GREEN. It had no resolution at this board position, which
 * was measured before touching it rather than assumed:
 *
 *   PUP     TE score 2.39, rank 6
 *   healthy TE score 0.24, rank 6
 *   above him in BOTH: 8.02, 5.02, 4.92, 3.54, 3.50
 *
 * The exception reprices him TENFOLD — 0.24 to 2.39 — and he still cannot
 * reach 3.50, so `rank` is pinned at 6 either way. The arm was failing because
 * it chose a measure that cannot move, not because the price stopped moving.
 * Two alternatives were measured and are also saturated: players-outscored
 * goes 620 -> 621 of 627, because most of the field scores near zero.
 *
 * So the SCORE RATIO is the measure with real resolution, and it is the one
 * the claim was always about — "a materially different price". It passes with
 * 10x against a 3x bar. `rank` is still REPORTED below, because a reader
 * should see it, but it is not asserted on.
 *
 * The property is not weakened: arms 2 and 3 already pin that the injured case
 * is NOT discounted while the healthy case IS, so the ratio cannot be produced
 * by anything other than the branch this file is about. */
ck('and the injured-starter case scores him far higher — so the sentence is '
  + 'describing a materially different price, not a rounding difference',
hurt.s.score > well.s.score * 3,
{ hurt: { rank: hurt.rank, score: +hurt.s.score.toFixed(2) },
  healthy: { rank: well.rank, score: +well.s.score.toFixed(2) },
  ratio: +(hurt.s.score / (well.s.score || 1)).toFixed(1),
  note: 'rank reported, not asserted — see comment above' });

// ─────────────── 4. THE SENTENCE NOW SAYS WHAT THE PRICE DOES
const why = hurt.s.onesie.why;
ck('the line says he is priced as a STARTER', /priced as a STARTER/.test(why), why);
ck('and says outright that no backup discount was applied',
  /NOT discounted as a backup/.test(why), why);
ck('and it no longer claims he is "not a starter"',
  !/not a starter/.test(why), why);
ck('it still names the status that triggered it', new RegExp('PUP').test(why), why);

// ─────────────── 5. IT NAMES WHAT THE MODEL DOES NOT KNOW
/* Every status in SERIOUS is treated identically, so a four-game absence is
 * priced like a season-ending one. The reader is told rather than left to
 * infer it. */
const ir = run('IR', 73);
ck('KNOWN-POSITIVE: PUP and IR really do produce the SAME rank and score — the '
  + 'model does not distinguish duration',
ir.rank === hurt.rank && Math.abs(ir.s.score - hurt.s.score) < 0.01,
{ pup: { rank: hurt.rank, score: +hurt.s.score.toFixed(2) },
  ir: { rank: ir.rank, score: +ir.s.score.toFixed(2) } });
ck('and the line says so, so a reader does not have to infer it',
  /does not weigh how long/.test(why), why);

// ─────────────── 6. FAIL ARM
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('FAIL ARM: the old sentence is gone from the source, so this file is not '
    + 'asserting something the engine can still emit',
  !/this is insurance, not a starter/.test(src));
  ck('and the branch still returns discount 1 — the PRICE was deliberately left '
    + 'alone; only the sentence moved',
  /exception: 'injury'/.test(src) && /discount: 1, exception: 'injury'/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
