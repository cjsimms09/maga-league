/* THE DOCTRINE MUST NOT CLAIM TO GOVERN WHAT IT DOES NOT TOUCH.
 *
 * Audited 2026-08-08: the enrolled doctrine never reached the engine. Its only
 * consumer added a badge to an already-generated path, and recommendations were
 * byte-identical whether enrolled or not.
 *
 * A plan line reading "plan intact" while nothing executes the plan is the same
 * failure as an uninstalled term wearing a badge — a truthful-looking label on
 * a computation it did not touch. This suite ties the LABEL to the FACT so they
 * cannot drift apart in either direction:
 *
 *   - if GOVERNS is false, the surface must SAY display-only;
 *   - if someone flips GOVERNS to true, the engine must ACTUALLY be wired,
 *     which the last check verifies by source inspection rather than by trust.
 *
 * Run: node draft/tests/doctrine-governance.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DOC = require('../../public/js/draft/doctrine.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };


// --- the label matches the fact, both directions ----------------------------
{
  const before = DOC.governs();

  DOC.setGoverns(false);
  check('while display-only, the enrolled line SAYS display-only',
    /DISPLAY-ONLY/.test(DOC.governanceLine(true)), DOC.governanceLine(true));
  check('...and says it is not driving recommendations',
    /not driving/i.test(DOC.governanceLine(true)));

  DOC.setGoverns(true);
  check('once governing, the line claims the tilt instead',
    /tilting/i.test(DOC.governanceLine(true))
    && !/DISPLAY-ONLY/.test(DOC.governanceLine(true)), DOC.governanceLine(true));

  DOC.setGoverns(before);
  check('an unenrolled seat is described as the control, either way',
    /control/i.test(DOC.governanceLine(false)));
}

// --- THE ANTI-DRIFT CHECK, DONE BEHAVIOURALLY -------------------------------
//
// The first version of this guard tested /doctrine/i against engine.js source.
// That is barely stronger than the flag it was meant to police: A COMMENT
// MENTIONING THE DOCTRINE WOULD SATISFY IT. Flag-flipped-but-unreferenced is
// the exact failure this file exists to catch, so the guard must prove the
// doctrine VALUE reaches the SCORING PATH — and the only proof that cannot be
// faked by a string is a behavioural one:
//
//   score the SAME board under TWO different doctrines and compare the output.
//
//   GOVERNS false -> the rankings MUST be identical (that is what display-only
//                    means, and it is the audited current state)
//   GOVERNS true  -> the rankings MUST differ for at least one board, or the
//                    tilt is not wired no matter what the source says
{
  const E = require('../../public/js/draft/engine.js');

  const mk = (id, pos, v) => ({ player_id: String(id), name: 'P' + id, position: pos,
    vorp: v, proj_mean: 100 + v, proj_ceiling: 130 + v, proj_floor: 70,
    proj_sd: 20, adjusted_adp: 40 - v / 6, raw_adp: 40 - v / 6,
    adp_sd: 5, adp_source: 'ffc' });
  // A board where a WR-first and an RB-first doctrine genuinely disagree: the
  // top RB and top WR are within a whisker, so any real tilt flips the order.
  const board = [
    mk(1, 'RB', 60), mk(2, 'WR', 59.4), mk(3, 'RB', 52), mk(4, 'WR', 51),
    mk(5, 'TE', 40), mk(6, 'QB', 38), mk(7, 'WR', 36), mk(8, 'RB', 35),
    mk(9, 'K', 8), mk(10, 'DEF', 9),
  ];
  /* THE WIDE BOARD — the UPPER bound's fixture.
   *
   * Here the composite's favourite is far ahead: the top RB leads the top WR by
   * ~25 vorp, which is not a close call by any reading. A doctrine tilt that
   * flips THIS is not a tilt, it is an override — and an override that always
   * wins is the 74%-intervention problem wearing a doctrine label. Small and
   * cited means bounded, and a bound nobody tests is a preference. */
  // The vorp spread has to be LARGE because the composite compresses it — VONA,
  // tier urgency and need all pull toward the middle. A first pass used a
  // 25-vorp lead and produced a composite gap of only 4.0, which the
  // non-vacuity check below caught on its first run: the upper bound would have
  // passed trivially on the day the tilt landed. This spread is calibrated
  // against the measured gap, not guessed.
  const wideBoard = [
    mk(1, 'RB', 190), mk(2, 'WR', 44), mk(3, 'RB', 40), mk(4, 'WR', 38),
    mk(5, 'TE', 36), mk(6, 'QB', 34), mk(7, 'WR', 32), mk(8, 'RB', 30),
    mk(9, 'K', 8), mk(10, 'DEF', 9),
  ];
  const ctxOn = (bd, doctrine) => ({
    board: bd.slice(), roster: [],
    league: { starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 }, teams: 10 },
    weights: E.DEFAULT_WEIGHTS, currentPick: 34, nextPick: 47,
    totalPicks: 150, myPicksLeft: 12, roundsLeft: 12,
    runMultipliers: {}, intervening: [],
    doctrine: doctrine,                 // the field a wired engine would read
  });
  const ctxFor = doctrine => ctxOn(board, doctrine);
  const order = d => E.recommend(ctxFor(d)).slice(0, 5)
    .map(s => s.player.player_id).join(',');
  const topOf = (bd, d) => {
    const sc = E.recommend(ctxOn(bd, d));
    return sc.length ? sc[0] : null;
  };

  const wrFeast = order('wr_feast');
  const rbAnchor = order('rb_anchor');
  const none = order(null);

  check('the CLOSE fixture is capable of showing a difference (non-vacuity)',
    board.length >= 8 && wrFeast.length > 0, 'order=' + wrFeast);

  /* THE WIDE FIXTURE IS CHECKED IN BOTH STATES, deliberately.
   *
   * The upper-bound assertion only runs once the tilt is wired, so its fixture
   * would otherwise sit unexercised for however long that takes and could rot
   * silently — the board data drifts, the gap narrows, and on the day the tilt
   * lands the upper bound passes trivially against a "wide" board that is no
   * longer wide. Checking the gap now keeps the assertion honest before it is
   * ever needed. */
  const wideGap = (() => {
    const sc = E.recommend(ctxOn(wideBoard, null));
    return sc.length > 1 ? sc[0].score - sc[1].score : 0;
  })();
  check('the WIDE fixture really is wide, checked even while display-only',
    wideGap > 8, 'composite gap is only ' + wideGap.toFixed(1)
      + ' — the upper-bound assertion would pass trivially when the tilt lands');

  if (!DOC.governs()) {
    check('DISPLAY-ONLY means two different doctrines produce IDENTICAL rankings',
      wrFeast === rbAnchor && wrFeast === none,
      'wr_feast=' + wrFeast + ' rb_anchor=' + rbAnchor + ' none=' + none
        + ' — rankings differ while GOVERNS is false, so something IS tilting '
        + 'and the banner is understating the model');
  } else {
    // ---- LOWER BOUND: it must move something, or it is decoration ----------
    check('LOWER BOUND — on a CLOSE call, two doctrines produce DIFFERENT rankings',
      wrFeast !== rbAnchor,
      'GOVERNS=true but wr_feast and rb_anchor rank identically — the flag was '
        + 'flipped without the tilt reaching the scoring path, which is exactly '
        + 'the audited bug wearing a fix\'s clothes');
    check('...and a doctrine actually moves the board off the no-doctrine order',
      wrFeast !== none || rbAnchor !== none,
      'neither doctrine differs from no-doctrine — nothing is being tilted');

    // ---- UPPER BOUND: it must NOT be able to dominate ----------------------
    const wideNone = topOf(wideBoard, null);
    const wideWr = topOf(wideBoard, 'wr_feast');
    const gap = wideGap;
    check('UPPER BOUND — a doctrine does NOT displace a strongly-preferred player',
      wideWr && wideNone
        && String(wideWr.player.player_id) === String(wideNone.player.player_id),
      'wr_feast flipped the top pick on a board where the composite led by '
        + gap.toFixed(1) + ' — that is an OVERRIDE, not a tilt. A tilt that '
        + 'always wins is the 74%-intervention problem wearing a doctrine label.');
  }
}

// --- the current, audited state, asserted explicitly ------------------------
{
  check('CURRENT STATE (2026-08-08): the doctrine is display-only',
    DOC.governs() === false,
    'governs=' + DOC.governs()
      + ' — if Stage 3 has landed, update this check WITH the wiring, not before');
}

console.log(`\n${pass}/${pass + fail} doctrine-governance checks passed`);
process.exit(fail ? 1 : 0);
