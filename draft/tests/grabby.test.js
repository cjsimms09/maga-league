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

console.log(`\n${pass}/${pass + fail} grabby checks passed`);
process.exit(fail ? 1 : 0);
