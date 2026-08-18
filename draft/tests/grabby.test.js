/* GRAB-BY (live) — the client that recomputes QB/TE timing every pick.
 * Run: node draft/tests/grabby.test.js
 */
'use strict';
global.DraftEngine = require('../../public/js/draft/engine.js');
const GB = require('../../public/js/draft/grabby.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const wr = (id, mean, adp, tier) => ({ player_id: id, name: id, position: 'WR',
  proj_mean: mean, proj_ceiling: mean + 30, raw_adp: adp, adjusted_adp: adp, vorp: mean - 100,
  tier: tier || 1, tier_drop: 5, tier_size: 4 });
const at = (pos, mean, adp) => ({ player_id: pos + adp, name: pos + adp, position: pos,
  proj_mean: mean, proj_ceiling: mean + 30, raw_adp: adp, adjusted_adp: adp, vorp: mean - 100, tier: 1 });

// --- need + flex awareness ----------------------------------------------------
{
  const need = GB.positionalNeed([{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }], LEAGUE);
  check('RB dedicated filled by two keepers', need.dedicated.RB === 0);
  check('WR still needs one', need.dedicated.WR === 1);
  check('flex still open (no RB/WR/TE surplus)', need.flexOpen === 1);
  check('a filled onesie is not a live need', GB.isLiveNeed('QB', GB.positionalNeed(
    [{ position: 'QB' }], LEAGUE)) === false);
  check('an empty onesie IS a live need', GB.isLiveNeed('TE', need) === true);
}

// --- QB waits when deep, K/DEF wait late, a cliff position grabs --------------
{
  // deep QB pool (many close), thin/steep TE (one good then a cliff)
  const board = [];
  for (let i = 0; i < 14; i++) board.push(at('QB', 360 - i * 3, 50 + i * 6));   // smooth, deep
  board.push(at('TE', 230, 45)); board.push(at('TE', 175, 70)); board.push(at('TE', 150, 95)); // cliff after #1
  for (let i = 0; i < 8; i++) board.push(wr('wr' + i, 220 - i * 8, 30 + i * 5, 1 + Math.floor(i / 3)));
  board.push(at('K', 130, 150)); board.push(at('DEF', 120, 150));
  const roster = [{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }];
  const rep = GB.report(board, roster, [34, 47, 60], LEAGUE);
  const byPos = {}; rep.positions.forEach(r => { byPos[r.position] = r; });
  check('QB waits when the pool is deep (low EVLW)', byPos.QB.verdict === 'WAIT', JSON.stringify(byPos.QB));
  check('the steep TE (cliff after #1) is urgent', byPos.TE.evlw > 20 && byPos.TE.verdict !== 'WAIT',
    JSON.stringify(byPos.TE));
  /* ══ THE VERDICT BANDS, ASSERTED AT THE BOUNDARY ══
 *
 * B's eight-break audit found this was the one silence left: flipping
 * BAND_URGENT from 0.8 to 0.3 per week left the ENTIRE suite green, baseline
 * included. The reason is visible above — every existing verdict assertion is
 * `=== 'WAIT'` or `!== 'WAIT'`, and both of those survive a moved TAKE-NOW
 * threshold, because nothing was ever measured in the range the threshold
 * governs.
 *
 * Rule 10a: break AT the boundary. A value at 10x the threshold proves only that
 * the mechanism fires; a value one hundredth either side proves the ceiling is
 * where it claims to be. These are expressed in EVLW (season points) converted
 * through the same WEEK_DIVISOR the code uses, so the test cannot drift from the
 * implementation by re-deriving the conversion.
 */
{
  const B = GB.BANDS;
  const evlwFor = perWeek => perWeek * B.WEEK_DIVISOR;
  const eps = 0.01 * B.WEEK_DIVISOR;

  check('a filled position is FILLED regardless of value',
    GB.verdict(evlwFor(99), 0) === 'FILLED');

  check('just OVER the urgent band is TAKE-NOW',
    GB.verdict(evlwFor(B.URGENT) + eps, 1) === 'TAKE-NOW',
    'at ' + (B.URGENT + 0.01).toFixed(2) + '/wk got ' + GB.verdict(evlwFor(B.URGENT) + eps, 1));
  check('just UNDER the urgent band is NOT TAKE-NOW',
    GB.verdict(evlwFor(B.URGENT) - eps, 1) === 'GRAB-SOON',
    'at ' + (B.URGENT - 0.01).toFixed(2) + '/wk got ' + GB.verdict(evlwFor(B.URGENT) - eps, 1));

  check('just OVER the negligible band is GRAB-SOON',
    GB.verdict(evlwFor(B.NEGLIGIBLE) + eps, 1) === 'GRAB-SOON',
    'at ' + (B.NEGLIGIBLE + 0.01).toFixed(2) + '/wk got ' + GB.verdict(evlwFor(B.NEGLIGIBLE) + eps, 1));
  check('just UNDER the negligible band is WAIT',
    GB.verdict(evlwFor(B.NEGLIGIBLE) - eps, 1) === 'WAIT',
    'at ' + (B.NEGLIGIBLE - 0.01).toFixed(2) + '/wk got ' + GB.verdict(evlwFor(B.NEGLIGIBLE) - eps, 1));

  /* AND THE BAND VALUES THEMSELVES ARE PINNED. The boundary tests above are
   * written in terms of B.URGENT, so they would follow the constant if it moved
   * — which is the shape that let this through in the first place. Pinning the
   * numbers is what makes a change to them a deliberate, visible edit. */
  check('the bands are the values the tool ships',
    B.URGENT === 0.8 && B.NEGLIGIBLE === 0.3 && B.WEEK_DIVISOR === 17.0,
    JSON.stringify(B) + ' — a band change is a recommendation change and must be deliberate');
  check('the bands are ordered (urgent above negligible)',
    B.URGENT > B.NEGLIGIBLE);
}

check('K and DEF wait to the late rounds', byPos.K.verdict === 'WAIT' && byPos.DEF.verdict === 'WAIT');
  check('headline names the most urgent NEEDED position', rep.headline && /TE|RB|WR/.test(rep.headline),
    rep.headline);
}

// --- it is LIVE: the same call re-run on a shrunken board changes the answer --
{
  const mkBoard = qbGone => {
    const b = [];
    for (let i = qbGone; i < 14; i++) b.push(at('QB', 360 - i * 3, 50 + i * 6));  // top qbGone QBs drafted
    for (let i = 0; i < 6; i++) b.push(wr('wr' + i, 210 - i * 6, 30 + i * 6, 1));
    return b;
  };
  const roster = [{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }];
  const early = GB.report(mkBoard(2), roster, [34, 47], LEAGUE);
  const late = GB.report(mkBoard(12), roster, [110, 123], LEAGUE);
  const qbEarly = early.positions.find(r => r.position === 'QB').evlw;
  const qbLate = late.positions.find(r => r.position === 'QB').evlw;
  check('QB urgency RISES as the pool is drafted down (live, board-aware)', qbLate > qbEarly,
    `early=${qbEarly} late=${qbLate}`);
}

// --- projects WHO will be gone + the concrete drop (Cory's ask #2) -----------
{
  // QB: an early-ADP stud gone before my next pick, a later-ADP arm that survives
  const board = [
    at('QB', 360, 30),   // adp 30 — gone well before pick 90
    at('QB', 340, 55),   // adp 55 — likely gone by 90
    at('QB', 320, 120),  // adp 120 — survives to pick 90
    at('QB', 315, 130),
  ];
  const roster = [{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }];
  const rep = GB.report(board, roster, [78, 90], LEAGUE, ['QB']);
  const qb = rep.positions[0];
  const goneNames = (qb.likely_gone || []).map(g => g.name);
  check('projects WHICH players are gone before my next pick', goneNames.indexOf('QB30') >= 0,
    JSON.stringify(goneNames));
  check('names the best arm that SURVIVES to my next pick', qb.best_next && /QB120|QB130/.test(qb.best_next.name),
    JSON.stringify(qb.best_next));
  check('quantifies the value drop if I wait (EVLW)', qb.evlw > 0, String(qb.evlw));
  check('the survivor is not the early stud who will be gone', qb.best_next.name !== 'QB30');
}


// --- WIRE-COVERED ONESIE CAP — the QB denominator fix (Cory, 2026-08-17) ----
// The empirical study measured the QB wire AT replacement in this league, the
// DP plan takes QB at pick 73, the top-3 drafters wait to R7.1 — yet a one-pick
// −8pt drop printed GRAB-SOON while the LRM strip said "startable until 93" on
// the same screen. The cap makes the verdict read the LRM boundary.
{
  const board = [
    at('QB', 360, 30),   // stud, going soon — the drop that used to force GRAB-SOON
    at('QB', 340, 55),
    at('QB', 320, 120),
    at('QB', 315, 130),
  ];
  const roster = [{ position: 'RB' }, { position: 'RB' }, { position: 'WR' }];
  const noCap = GB.report(board, roster, [33, 48], LEAGUE, ['QB']);
  const capped = GB.report(board, roster, [33, 48], LEAGUE, ['QB'], { QB: 93 });
  const q0 = noCap.positions[0], q1 = capped.positions[0];
  check('FAIL ARM — without LRM bounds the old myopic verdict fires (control: the cap changes something real)',
    q0.verdict === 'TAKE-NOW' || q0.verdict === 'GRAB-SOON', q0.verdict);
  check('with the LRM boundary past my picks, the QB verdict caps at WAIT', q1.verdict === 'WAIT', q1.verdict);
  check('and says WHY in the wire-covered sentence (measured fact, not a vibe)',
    /replacement-level/.test(q1.wire_covered || ''), q1.wire_covered);
  check('grab_by becomes my LAST pick inside the startable boundary', q1.grab_by_pick === 48,
    String(q1.grab_by_pick));
  check('the EVLW FACT still prints — the cap moves the verdict, never the number',
    q1.evlw === q0.evlw && q1.evlw > 0, `${q0.evlw} vs ${q1.evlw}`);
  // Boundary INSIDE the window: urgency is real and must survive the cap.
  const tight = GB.report(board, roster, [33, 48], LEAGUE, ['QB'], { QB: 20 });
  check('a boundary BEFORE all my picks leaves the urgent verdict alone (the cliff is real)',
    tight.positions[0].verdict === q0.verdict, tight.positions[0].verdict);
  // TE is deliberately NOT wire-covered — its elite cliff is measured.
  check('TE is not in WIRE_COVERED (elite cliff is real, the cap must not touch it)',
    !GB.WIRE_COVERED.TE && GB.WIRE_COVERED.QB && GB.WIRE_COVERED.K && GB.WIRE_COVERED.DEF);
}

console.log(`\n${pass}/${pass + fail} grabby checks passed`);
process.exit(fail ? 1 : 0);
