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

// ── WHAT THE CAP WAS COVERING, NOW UNGUARDED ──────────────────────────────
/* THIS BLOCK USED TO ASSERT THAT A CAPPED THIRD QB/TE SANK TO THE BOTTOM.
 * The cap is deleted (Cory, 2026-08-14: "delete them, do not fix them"), so
 * nothing sinks and this measures what is left instead.
 *
 * THE CAP WAS A STAND-IN FOR A VALUATION THAT DOES NOT WORK -- the bench branch
 * ranks on proj_ceiling - proj_mean in RAW SEASON POINTS, and a quarterback
 * scores 350-400, so his spread is the largest absolute number on the board by
 * construction. This file's own retirement trigger was "the units defect is
 * gone". IT IS NOT GONE. The cap was removed by instruction, not because the
 * thing it covered was fixed, and the difference matters: measured immediately
 * after deletion, with 2 QB and 2 TE carried, a third of each surfaces at
 * BOARD RANK 5 AND 4 -- discounted to a spare, and still near the top, because
 * the value exception fires once the better ones are gone and they have fallen
 * past ADP.
 *
 * PINNED AS A FACT, NOT AS A DESIRED STATE. If these ranks move in EITHER
 * direction this fires: worse means the exposure grew, better means something
 * fixed the units defect and this file can finally retire. Read it as the alarm
 * going off and re-derive; do not adjust the numbers to make it quiet. */
{
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster);
  const rankOf = pos => res.findIndex(r => r.player.position === pos) + 1;
  const qb = rankOf('QB'), te = rankOf('TE');

  /* THIS BLOCK ASSERTED THE DEFECT (2026-08-13). When the cap was deleted these
   * two checks were rewritten to pin the CONSEQUENCE — "a third QB still
   * surfaces near the top" — as a standing exposure. That was honest at the
   * time. But it made the suite go RED ON THE FIX and green on the bug, which
   * is the same shape as test_acceptance.py asserting adp_sd_for(100) == 22.0.
   * The cap is restored, so the expectation moves back and the reason is here
   * rather than in a diff nobody reads. */
  ck('a THIRD quarterback is sunk, not surfaced near the top',
    qb === 0 || qb > 12, { third_QB_board_rank: qb, of: res.length });
  ck('  and so is a third TE',
    te === 0 || te > 12, { third_TE_board_rank: te, of: res.length });
  ck('  both are at least PRICED as spares rather than at full value',
    res[qb - 1].onesie && res[qb - 1].onesie.discounted
    && res[te - 1].onesie && res[te - 1].onesie.discounted);
  ck('  and each SAYS he cannot start, in a sentence a human can overrule',
    /CANNOT START HIM|cannot start him/.test((res[qb - 1].onesie || {}).why || ''),
    (res[qb - 1].onesie || {}).why);
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
  /* ONESIE_MAX_SPARE is {K: 0, DEF: 0} — no spare at all. Both are streamed, so a
   * second one cannot earn a pick even as insurance; the wire restocks them on
   * demand (waiver_supply: 100% of the DEF pool and 83% of K cycle every year). */
  ck('a SECOND kicker is priced as a spare — both are streamed and neither earns a pick',
    k && k.onesie && k.onesie.discounted, k && k.onesie);
  ck('  and so is a second defence', d && d.onesie && d.onesie.discounted, d && d.onesie);
  ck('  and BOTH are capped — zero spares allowed, so pricing low is not enough',
    (k && k.onesie && k.onesie.capped) && (d && d.onesie && d.onesie.capped),
    { k: k && k.onesie, d: d && d.onesie });
}

// ── THE ENDGAME STILL RELAXES IT ───────────────────────────────────────────
{
  /* Every other clause in onesieState relaxes with two picks left, and this one
   * must too: a legal lineup outranks a tidy one, and refusing the only body
   * left on the board would be the cap causing the failure it exists to prevent. */
  const roster = build(['QB', 'QB', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR']);
  const res = rec(roster, { left: E.CFG.ONESIE_ENDGAME_PICKS });
  const anyDup = res.some(r => r.onesie && r.onesie.discounted);
  ck('with ONESIE_ENDGAME_PICKS left, nothing is discounted as a duplicate', !anyDup);
  ck('  because a legal lineup outranks a tidy one — the endgame relaxation is',
    E.CFG.ONESIE_ENDGAME_PICKS === 2);
}

// ── THE CAP COUNTS STRICT SLOTS, NOT FLEX ──────────────────────────────────
{
  /* Deliberate: the FLEX is contested by RB/WR/TE and must not be pre-reserved
   * for whichever position happens to be scoring well. Counting it would let a
   * third tight end through on the theory that the flex is his. */
  /* THIS BLOCK USED TO PIN THE CAP'S SHAPE. The cap is deleted, so it pins its
   * ABSENCE instead -- and the reason it had to go is worth keeping: it counted a
   * tight end STARTING IN THE FLEX against the spare allowance, while the gate
   * above had already excluded flex-startable players. One function, two answers
   * to "does the flex count", which priced the first unstartable QB at 81% of
   * standalone VORP and the first unstartable TE at 8%. */
  ck('CFG.ONESIE_MAX_SPARE exists and allows exactly one spare QB and TE',
    E.CFG.ONESIE_MAX_SPARE && E.CFG.ONESIE_MAX_SPARE.QB === 1
    && E.CFG.ONESIE_MAX_SPARE.TE === 1 && E.CFG.ONESIE_MAX_SPARE.K === 0
    && E.CFG.ONESIE_MAX_SPARE.DEF === 0, E.CFG.ONESIE_MAX_SPARE);
  ck('  and CFG.ONESIE_HARD_CAP is on', E.CFG.ONESIE_HARD_CAP === true);
  /* THE ROSTER HERE MUST BE LEGALLY COMPLETE, and my first version was not.
   * `['QB','QB','QB','TE','TE','TE']` has no RB, WR, K or DEF, so mandatoryGaps
   * returns six and applyRosterLegality FORCES with five picks left — the result
   * contains only the needed positions and no quarterback appears at all. The
   * assertion failed and the cap was fine; the fixture was an emergency, not a
   * roster. Legality outranks the cap and should: a legal lineup beats a tidy
   * one. Filled out so the cap is what is actually under test. */
  const full = build(['QB', 'QB', 'QB', 'TE', 'TE', 'TE', 'RB', 'RB', 'WR', 'WR', 'K', 'DEF']);
  ck('  a roster already carrying three QBs and three TEs reports capped entries',
    rec(full).some(r => r.onesie && r.onesie.capped),
    { gaps: 0, capped: rec(full).filter(r => r.onesie && r.onesie.capped).length });
}

/* ── THE TWO CONTROL BLOCKS THAT LIVED HERE ARE DELETED WITH THEIR SUBJECT ──
 *
 * One was the cap's non-vacuity control (toggle ONESIE_HARD_CAP, show the SAME
 * quarterback moves) and one was its retirement trigger (with the cap off, has
 * the units defect gone?). Both drove CFG.ONESIE_HARD_CAP, which no longer
 * exists, and both searched for an entry flagged `capped`, which no longer
 * exists either. A control for a deleted mechanism cannot fail, so keeping them
 * would have added two green lines that assert nothing -- the exact defect
 * counted 22 times across this suite directory on 2026-08-14.
 *
 * THE RETIREMENT TRIGGER'S QUESTION SURVIVES AND IS ANSWERED, in the EXPOSURE
 * block above: with the cap gone a third QB sits at board rank 5 and a third TE
 * at 4. The trigger asked "is the units defect still present?" and the answer is
 * yes. That is why the exposure block pins ranks rather than celebrating a
 * deletion -- this file no longer tests a cap, it tracks what the cap was hiding.
 *
 * THE FILE KEEPS ITS NAME so the history stays findable, and the name is now
 * wrong in a way worth reading: there is no cap. Rename it only alongside fixing
 * the units defect, because that is when its subject actually goes away. */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
