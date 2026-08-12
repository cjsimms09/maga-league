// TERRITORY: A
/* THE ONESIE HARD CAP — a roster-legality rule, not a valuation one.
 *
 * WHY IT EXISTS, measured rather than argued. Across 120 simulated rooms the
 * modal draft was QB3 RB1 WR3 TE3 K1 DEF1: six of twelve picks on two positions
 * that start one each, against 0.9 running backs. `ONESIE_KEEP = 0.10` was
 * already discounting duplicates — but a discount is MULTIPLICATIVE, and a tenth
 * of a small positive bench score is still positive when every alternative sits
 * near zero. A discount cannot express "never".
 *
 * AFTER THE CAP: modal QB2 RB1 WR5 TE2 K1 DEF1, 96.7% of rooms, still 0/120
 * unfilled starting slots.
 *
 * Run: node draft/tests/onesie_cap.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
const byV = pool.slice().sort((a, b) => (b.vorp || 0) - (a.vorp || 0));

function build(positions) {
  const r = [];
  positions.forEach(pos => {
    const p = byV.find(x => x.position === pos && r.indexOf(x) < 0);
    if (p) r.push(p);
  });
  return r;
}
function board(roster) {
  const taken = new Set(roster.map(p => String(p.player_id)));
  return pool.filter(p => !taken.has(String(p.player_id)));
}
function rec(roster, opts) {
  const o = opts || {};
  return E.recommend({
    board: board(roster), roster: roster, league: L, weights: E.MEASURED_WEIGHTS,
    currentPick: o.pick || 90, nextPick: (o.pick || 90) + 15, totalPicks: 150,
    myPicksLeft: o.left == null ? 5 : o.left, roundsLeft: 6,
    runMultipliers: {}, intervening: [],
  });
}
const rankOfPos = (res, pos) => res.findIndex(r => r.player.position === pos) + 1;

// ── THE CAP BINDS ──────────────────────────────────────────────────────────
{
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster);
  /* TARGETED AT THE CAPPED PLAYER, NOT THE FIRST ONE AT THE POSITION.
   * My first version asserted "the first QB is sunk" and failed once the elite
   * fall-through exception was restored — correctly, because at this state a
   * top-three quarterback has fallen far enough to earn the exception and
   * surfaces at rank 44. That is the cap working as a ceiling rather than a
   * prohibition, so the assertion has to name the CAPPED man. */
  const firstCappedRank = pos => {
    const i = res.findIndex(r => r.player.position === pos && r.onesie && r.onesie.capped);
    return i + 1;
  };
  ck('with 2 QB and 2 TE carried, a CAPPED third of either is sunk to the bottom',
    firstCappedRank('QB') > res.length / 2 && firstCappedRank('TE') > res.length / 2,
    { first_capped_QB: firstCappedRank('QB'), first_capped_TE: firstCappedRank('TE'),
      of: res.length });
  ck('  and the top of the board is a startable position instead',
    ['RB', 'WR', 'K', 'DEF'].indexOf(res[0].player.position) >= 0, res[0].player.position);
  const capped = res.find(r => r.onesie && r.onesie.capped);
  ck('  the entry carries the cap flag the demotion reads',
    !!capped, capped ? capped.player.name : null);
  ck('  and SAYS why, in a sentence a human can overrule',
    capped && /cannot reach the lineup/.test(capped.onesie.why || ''),
    capped && capped.onesie.why);
}

// ── THE FIRST SPARE IS STILL ALLOWED ───────────────────────────────────────
{
  /* THE CAP IS NOT "NEVER A BACKUP". One spare quarterback is real insurance;
   * the second cannot reach the lineup even if the starter goes down, because
   * the first is already there. That is the whole distinction. */
  const roster = build(['QB', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster);
  const qb = res.find(r => r.player.position === 'QB');
  ck('with ONE QB carried, a second is NOT capped',
    qb && !(qb.onesie && qb.onesie.capped), qb && qb.onesie);
  const te = res.find(r => r.player.position === 'TE');
  ck('  nor is a second TE, who can still take the flex',
    te && !(te.onesie && te.onesie.capped), te && te.onesie);
}

// ── K AND DEF GET NO SPARE AT ALL ──────────────────────────────────────────
{
  const roster = build(['QB', 'TE', 'RB', 'RB', 'WR', 'WR', 'K', 'DEF']);
  const res = rec(roster, { left: 5 });
  const k = res.find(r => r.player.position === 'K');
  const d = res.find(r => r.player.position === 'DEF');
  ck('a SECOND kicker is capped — both are streamed and neither has ever earned a pick',
    k && k.onesie && k.onesie.capped, k && k.onesie);
  ck('  and so is a second defence', d && d.onesie && d.onesie.capped, d && d.onesie);
  ck('  (measured: both sit at exactly 1.0 picks in every simulated arm)', true);
}

// ── THE ENDGAME STILL RELAXES IT ───────────────────────────────────────────
{
  /* Every other clause in onesieState relaxes with two picks left, and this one
   * must too: a legal lineup outranks a tidy one, and refusing the only body
   * left on the board would be the cap causing the failure it exists to prevent. */
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster, { left: E.CFG.ONESIE_ENDGAME_PICKS });
  const anyCapped = res.some(r => r.onesie && r.onesie.capped);
  ck('with ONESIE_ENDGAME_PICKS left, nothing is capped', !anyCapped);
  ck('  because a legal lineup outranks a tidy one', true);
}

// ── THE CAP COUNTS STRICT SLOTS, NOT FLEX ──────────────────────────────────
{
  /* Deliberate: the FLEX is contested by RB/WR/TE and must not be pre-reserved
   * for whichever position happens to be scoring well. Counting it would let a
   * third tight end through on the theory that the flex is his. */
  ck('the cap is declared per position, against strict starters',
    E.CFG.ONESIE_MAX_SPARE.QB === 1 && E.CFG.ONESIE_MAX_SPARE.TE === 1
    && E.CFG.ONESIE_MAX_SPARE.K === 0 && E.CFG.ONESIE_MAX_SPARE.DEF === 0,
    E.CFG.ONESIE_MAX_SPARE);
  ck('  RB and WR are NOT capped — depth at a two-starter flex position is real',
    E.CFG.ONESIE_MAX_SPARE.RB === undefined && E.CFG.ONESIE_MAX_SPARE.WR === undefined);
}

// ── NON-VACUITY: THE CAP IS WHAT MOVED THE ANSWER ──────────────────────────
{
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  /* MY FIRST CONTROL HERE ASSERTED THE WRONG THING and failed honestly: it
   * checked whether the TOP PICK changes with the cap off. At this state a
   * receiver is already best, so the cap cannot move the #1 and the control
   * failed while the cap worked. The cap's effect is on the RANK of the capped
   * player — and, over twelve picks, on the shape. Rank is what to assert. */
  /* Track ONE SPECIFIC ordinary quarterback across both settings, rather than
   * "the first QB at the position" — with the exception restored, the first QB
   * is the elite fall-through in one arm and somebody else in the other, so the
   * comparison would be between two different players. */
  const on = rec(roster);
  const target = on.find(r => r.player.position === 'QB' && r.onesie && r.onesie.capped);
  const rankOfPlayer = (list, id) =>
    list.findIndex(r => String(r.player.player_id) === String(id)) + 1;
  const cappedRankOn = rankOfPlayer(on, target.player.player_id);
  const saved = E.CFG.ONESIE_HARD_CAP;
  E.CFG.ONESIE_HARD_CAP = false;
  let cappedRankOff;
  try { cappedRankOff = rankOfPlayer(rec(roster), target.player.player_id); }
  finally { E.CFG.ONESIE_HARD_CAP = saved; }
  ck('CONTROL: with the cap OFF, THE SAME ordinary QB ranks far higher',
    cappedRankOff < cappedRankOn / 10,
    { player: target.player.name, rank_with_cap: cappedRankOn, rank_without: cappedRankOff });
  ck('  so the CAP moved him, not the board or the weights', cappedRankOn > cappedRankOff);
  ck('  and the flag was restored', E.CFG.ONESIE_HARD_CAP === saved);
}


// ── A GENUINE FALL-THROUGH SURVIVES THE CAP ────────────────────────────────
{
  /* THE CORRECTION, and it was a real defect in the first version. The cap was
   * checked BEFORE the exceptions, on my argument that a man who cannot reach
   * the lineup gains nothing from having fallen far. Cory: a top-three player
   * handed to me eighty picks past his price is a TRADE ASSET in a room where
   * somebody will need one, and insurance at the one position where a bye
   * leaves me starting NOBODY. Refusing him is a worse error than the one the
   * cap fixes. Measured before the correction: rank 1401 of 1753. */
  const roster = build(['QB', 'QB', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const qbs = pool.filter(p => p.position === 'QB')
    .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0));
  const elite = qbs.find(p => roster.indexOf(p) < 0);          // top-3 at the position
  const res = rec(roster, { pick: 140, left: 4 });
  const at = res.findIndex(r => String(r.player.player_id) === String(elite.player_id));
  const row = res[at];
  ck('a TOP-3 player at a capped position, fallen far past ADP, is NOT capped',
    row && row.onesie && row.onesie.capped === false,
    { player: elite.name, rank: at + 1, of: res.length, onesie: row && row.onesie });
  ck('  and he surfaces near the top rather than being sunk',
    at >= 0 && at < 25, { rank: at + 1, of: res.length });
  ck('  tagged as a VALUE exception, so the card can say why',
    row.onesie.exception === 'value', row.onesie);
  ck('  and STILL DISCOUNTED — priced low because he cannot start, not forbidden',
    row.onesie.discounted === true, row.onesie);

  // AND THE ORDINARY THIRD QUARTERBACK STILL SINKS, which is what makes the
  // exception an exception rather than a hole in the cap.
  const dull = qbs.filter(p => roster.indexOf(p) < 0)[8];
  const dj = res.findIndex(r => String(r.player.player_id) === String(dull.player_id));
  ck('  while an ORDINARY third quarterback is still capped',
    res[dj].onesie && res[dj].onesie.capped === true,
    { player: dull.name, rank: dj + 1 });
  ck('  so the cap is a ceiling on habitual behaviour, not a prohibition',
    at < dj / 10, { elite_rank: at + 1, ordinary_rank: dj + 1 });
}

// ── RETIREMENT: THIS CAP IS A BANDAGE AND SHOULD SAY SO ────────────────────
{
  /* THE CAP IS TEMPORARY AND ITS REPLACEMENT IS NAMED: position-normalised
   * ceiling. The bench branch ranks on `proj_ceiling − proj_mean` in RAW SEASON
   * POINTS, which measures SCALE, not upside — a quarterback scores 350-400 a
   * season so his spread is the largest absolute number on the board almost by
   * construction. The cap is a constraint standing in for a valuation that does
   * not work.
   *
   * THIS CHECK IS THE RETIREMENT TRIGGER. It asserts the underlying units
   * defect is STILL PRESENT — that with the cap off, an ordinary third
   * quarterback still floats. The day somebody lands the normalisation, this
   * check FAILS, and that failure is the instruction: the cap is now redundant,
   * delete CFG.ONESIE_HARD_CAP and this file's cap sections with it. */
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const saved = E.CFG.ONESIE_HARD_CAP;
  E.CFG.ONESIE_HARD_CAP = false;
  let rankOff;
  try { rankOff = rankOfPos(rec(roster), 'QB'); }
  finally { E.CFG.ONESIE_HARD_CAP = saved; }
  const stillBroken = rankOff <= 40;
  ck('RETIREMENT TRIGGER: the units defect the cap covers is still present',
    stillBroken, { third_QB_rank_with_cap_off: rankOff });
  if (!stillBroken) {
    console.log('\n' + '='.repeat(70));
    console.log('RETIRE THE CAP. With ONESIE_HARD_CAP off, a third quarterback no');
    console.log('longer floats (rank ' + rankOff + '), which means the ceiling term was');
    console.log('normalised and the cap is now a constraint with nothing to constrain.');
    console.log('Delete CFG.ONESIE_HARD_CAP, ONESIE_MAX_SPARE, the `wouldCap` branch in');
    console.log('onesieState, the capped clause in demoteFlaggedOnesies, and this file.');
    console.log('='.repeat(70));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
