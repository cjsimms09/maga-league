/* THE CEILING TIEBREAK MAY NOT DECIDE ON A BAND CONSTANT.
 *
 * Cory, live 2026-08-17: *"has Nix as the pick yet isn't the top QB on the
 * rankings on the side?"* Reproduced at pick 88 with Burrow rostered — the
 * engine promoted Bo Nix (proj 335.72, ceiling 478.61) over Brock Purdy
 * (proj 350.2, ceiling 460.87) and said so in its own words: "↑ ahead of Brock
 * Purdy on upside — within 2 pts, higher ceiling". The 14.5-points-worse player
 * won on "upside", and the rendered order stopped matching the rendered score.
 *
 * WHY IT COULD NOT HAVE BEEN ANYTHING ELSE. `proj_ceiling` is `proj_mean × a
 * per-(position, band) constant` — Spearman exactly 1.000000 against proj_mean
 * inside every cell, 16 of 16 measured. So a raw `ceiling(b) > ceiling(a)`
 * across two cells compares two calibration constants, and those are not
 * ordered by quality: QB runs 1.230/1.316/1.426/1.484/1.094 while RB runs
 * 1.721/1.635/1.640/1.890/1.434.
 *
 * WHAT IS PINNED HERE — the GUARD, not a flag and not a date. The mechanism is
 * sound and stays on: on a board whose ceilings genuinely vary per player it is
 * exactly right, and engine.test.js pins that with synthetic rows. What the
 * guard adds is the question "is b's upside bigger than his CELL already
 * explains?", so the tiebreak self-disables on degenerate data and
 * self-releases the day VOLATILITY-WIRING-PREREG.md §2 lands. A hold that
 * cannot unblock itself becomes a permanent accident.
 *
 * Session E (red team). Working:
 * draft/audit/ceiling_is_still_a_cell_constant_2026-08-17.md
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (name, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + name + (detail != null ? '  — ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + name); if (detail != null) console.log('        -> ' + detail); }
};

const byName = n => board.players.find(p => p.name === n);

// ── 1. THE LIVE CASE CORY HIT, REPRODUCED FROM THE REAL BOARD ──────────────
{
  const nix = byName('Bo Nix'), purdy = byName('Brock Purdy');
  ck('CONTROL: the two players are still on the board and still straddle a band edge',
    !!nix && !!purdy && nix.pos_rank > 8 && purdy.pos_rank <= 8,
    nix && purdy ? `Purdy QB${purdy.pos_rank} (4-8), Nix QB${nix.pos_rank} (9-16)` : 'missing');

  ck('CONTROL: and the WORSE projection still carries the BIGGER raw ceiling',
    nix.proj_mean < purdy.proj_mean && nix.proj_ceiling > purdy.proj_ceiling,
    `Nix proj ${nix.proj_mean} ceil ${nix.proj_ceiling} vs Purdy proj ${purdy.proj_mean} ceil ${purdy.proj_ceiling}`);

  const rosterIds = new Set(board.kept_players.map(p => String(p.player_id)));
  const mine = ['Joe Burrow', 'Chris Olave', 'Tetairoa McMillan', 'Tucker Kraft', 'Rome Odunze']
    .map(byName).filter(Boolean);
  mine.forEach(p => rosterIds.add(String(p.player_id)));
  const gone = new Set(board.players
    .filter(p => p.adp != null && Number(p.adp) <= 88 && !rosterIds.has(String(p.player_id)))
    .map(p => String(p.player_id)));
  const available = board.players.filter(p =>
    !gone.has(String(p.player_id)) && !rosterIds.has(String(p.player_id)));

  const out = E.recommend({ board: available, roster: board.kept_players.concat(mine),
    league: board.league, currentPick: 88, totalPicks: 150, myPicksLeft: 7,
    roundsLeft: 7, runMultipliers: {}, weights: E.MEASURED_WEIGHTS });
  const list = Array.isArray(out) ? out : Object.values(out);

  const iNix = list.findIndex(s => (s.player || {}).name === 'Bo Nix');
  const iPurdy = list.findIndex(s => (s.player || {}).name === 'Brock Purdy');
  ck('the higher-scoring QB is no longer passed by the lower-scoring one',
    iPurdy >= 0 && iNix >= 0 && iPurdy < iNix,
    `Purdy at #${iPurdy + 1}, Nix at #${iNix + 1}`);
  ck('  and no ceiling_tiebreak mark was awarded across the band edge',
    !(list[iNix] || {}).ceiling_tiebreak,
    'a cross-cell promotion is a promotion on the calibration constant, not on upside');

  /* THE PROPERTY CORY ACTUALLY COMPLAINED ABOUT: the order he reads must agree
   * with the number he reads. This is the whole-list version. */
  let inversions = 0;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (E.scoreable(a) && E.scoreable(b) && typeof a.score === 'number'
        && typeof b.score === 'number' && b.score > a.score + 1e-9) inversions++;
  }
  ck('the rendered ORDER matches the rendered SCORE for the whole list',
    inversions === 0, inversions + ' score inversions (was 16 before the guard)');
}

// ── 2. THE MECHANISM STILL WORKS WHERE THE CEILING IS REAL ─────────────────
/* If this ever fails, the guard has over-reached and killed the feature rather
 * than the defect — which is the failure mode of every "just turn it off" fix. */
{
  const mk = (name, mean, ceil, rank) => ({ name, position: 'WR', tier: 1,
    pos_rank: rank, proj_mean: mean, proj_ceiling: ceil, vorp: 50,
    proj_floor: mean * 0.5, adp: 40, player_id: name });
  // SAME cell (both WR pos_rank 1-3), equal mean, genuinely different ceilings.
  const out = E.recommend({ board: [mk('steady', 150, 175, 1), mk('boom', 150, 230, 2)],
    roster: [], league: { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } },
    currentPick: 40, nextPick: 53, totalPicks: 150, myPicksLeft: 11,
    roundsLeft: 11, runMultipliers: {}, weights: E.DEFAULT_WEIGHTS });
  const list = Array.isArray(out) ? out : Object.values(out);
  ck('SAME-cell genuine upside still wins the tiebreak (the feature is not dead)',
    (list[0].player || {}).name === 'boom',
    list.map(s => (s.player || {}).name).join(',') + ' — equal mean, ratio 1.533 vs 1.167');
}

// ── 3. THE GUARD READS ONLY FIELDS THE PRE-DRAFT FREEZE CAPTURES ───────────
/* Found the hard way: the first version read `variance_why`, which names the
 * calibration cell verbatim and is NOT one of the 44 frozen PLAYER_FIELDS. That
 * made the engine order a frozen board differently from the live one, and
 * freeze_replay_fidelity.test.js went red immediately. A guard that only works
 * live would silently break the 2027 replay this project grades itself on. */
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  const fn = (src.match(/function cellStamp[\s\S]*?\n  \}/) || [''])[0];
  ck('the cell is derived from frozen fields only (position + pos_rank)',
    /pos_rank/.test(fn) && /position/.test(fn) && !/variance_why/.test(fn),
    'variance_why is not in PLAYER_FIELDS; reading it here breaks the freeze replay');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
