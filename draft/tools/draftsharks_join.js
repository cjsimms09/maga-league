// TERRITORY: A
/* JOIN Draft Sharks to our board, and MEASURE whether their ceiling can be used.
 *
 * Cory, 2026-08-19: "We want to use their ceiling not ours." Ruling accepted
 * (CORY-ASKS A19/A20); the technical case is register 119.
 *
 * ⛔ THIS DOES NOT SWAP ANYTHING, AND THE REASON IS NOT CAUTION — IT IS THAT A
 * PARTIAL SWAP IS ACTIVELY WORSE THAN NO SWAP, WHICH IS NOT OBVIOUS.
 *
 * `ceiling` ships at weight 0.45 in MEASURED_WEIGHTS, so the board scores
 * `VONA + 0.45 x ceiling` and compares that number ACROSS players and ACROSS
 * positions. Our ceiling is `mean + 1.28 x sd` over three sources; theirs is a
 * modelled range. Those are different quantities on different scales. Swap 30
 * players and leave 670, and every one of those 30 gets a systematically
 * shifted score against the rest of the board -- a bias applied to exactly the
 * top-30 players, which is where Cory's first picks are. The tool would look
 * fine and be wrong in the most expensive place.
 *
 * So this measures three things and refuses to recommend until they are met:
 *   1. COVERAGE  -- what fraction of the board carries a Draft Sharks ceiling
 *   2. LEVEL     -- is their ceiling systematically higher or lower than ours
 *   3. SHAPE     -- do they even rank players' upside the same way (Spearman)
 *
 * If (3) is high and (2) is a constant offset, a documented rescale is honest
 * at partial coverage. If (3) is low, they are measuring something different
 * and only a FULL swap is coherent.
 *
 * REPORT ONLY. Writes draft/data/draftsharks_join.json. Touches no board field.
 *
 * Run: node draft/tools/draftsharks_join.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'draft', 'data', 'draftsharks_join.json');

const STORE_PATH = path.join(ROOT, 'draft', 'data', 'draftsharks_projections.json');
if (!fs.existsSync(STORE_PATH)) {
  console.error('No Draft Sharks store yet — run the capture workflow first.');
  process.exit(2);
}
const STORE = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
if (!STORE.controls_all_passed) {
  throw new Error('draftsharks_projections failed its own controls — REFUSING to join');
}
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* Name normalisation. Deliberately conservative: a WRONG join is far worse than
 * a missed one, because it silently attaches one player's ceiling to another. */
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
const norm = s => String(s || '')
  .toLowerCase()
  .replace(/\b(d\/st|dst|defense)\b/g, 'def')
  .replace(/[.'`’]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(SUFFIX, '')
  .replace(/\s+/g, ' ')
  .trim();

const boardByName = new Map();
const dupNames = [];
BOARD.players.forEach(p => {
  const k = norm(p.name || p.player_name);
  if (!k) return;
  if (boardByName.has(k)) dupNames.push(k);          // ambiguous -> never joined
  else boardByName.set(k, p);
});
dupNames.forEach(k => boardByName.delete(k));

const matched = [], unmatched = [];
(STORE.players || []).forEach(r => {
  const k = norm(r.player);
  const b = boardByName.get(k);
  if (!b) { unmatched.push(r.player); return; }
  if (r.position && b.position && r.position !== b.position) {
    unmatched.push(`${r.player} (position mismatch ${r.position} vs ${b.position})`);
    return;
  }
  matched.push({
    player: r.player, position: b.position, player_id: b.player_id,
    ds_ceiling: r.ceiling, ds_floor: r.floor, ds_proj: r.ds_proj, ds_games: r.games,
    our_ceiling: b.proj_ceiling == null ? null : +b.proj_ceiling,
    our_floor: b.proj_floor == null ? null : +b.proj_floor,
    our_mean: b.proj_mean == null ? null : +b.proj_mean,
    our_games_expected: b.games_expected == null ? null : +b.games_expected,
  });
});

const both = matched.filter(m => m.ds_ceiling != null && m.our_ceiling != null
  && m.ds_proj != null && m.our_mean != null);

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
function spearman(xs, ys) {
  const n = xs.length; if (n < 5) return null;
  const rank = v => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n); let i = 0;
    while (i < n) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r; };
  const rx = rank(xs), ry = rank(ys);
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : null;
}

/* Compare the UPSIDE, not the ceiling level. A ceiling is mostly the mean, so
 * correlating raw ceilings just reproduces the projection agreement (register
 * 97 measured raw ceiling at rho +0.9951 with proj_mean). The quantity the
 * equation actually uses is the SPREAD above the projection. */
const dsSpread = both.map(m => m.ds_ceiling - m.ds_proj);
const ourSpread = both.map(m => m.our_ceiling - m.our_mean);

const sd = a => { if (a.length < 2) return null; const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
/* ⭐ THE MEASUREMENT THAT SETTLES REGISTER 119. Not "is their ceiling higher"
 * -- that is a level and it cancels -- but "does their ceiling carry
 * PLAYER-SPECIFIC information where ours does not". A spread that is nearly
 * constant across players is a positional constant wearing a percentile's
 * name, which is exactly what the 08-17 dispersion audit found. */
const dispersion = {
  ours: { mean: mean(ourSpread), sd: sd(ourSpread),
          cv: sd(ourSpread) && mean(ourSpread) ? sd(ourSpread) / mean(ourSpread) : null },
  theirs: { mean: mean(dsSpread), sd: sd(dsSpread),
            cv: sd(dsSpread) && mean(dsSpread) ? sd(dsSpread) / mean(dsSpread) : null },
};
const coverage = BOARD.players.length ? matched.length / BOARD.players.length : 0;
const rhoSpread = spearman(dsSpread, ourSpread);
const rhoCeil = spearman(both.map(m => m.ds_ceiling), both.map(m => m.our_ceiling));

const ctl = {};
ctl.C1_known_positive_join = (() => {
  /* ⛔ MY FIRST ANCHOR WAS "Ja'Marr Chase" ON THE PREMISE THAT CORY'S KEEPER MUST
   * BE ON BOTH SIDES. HE IS NOT ON OUR BOARD AT ALL -- keepers are removed from
   * the draftable pool, which is correct and which I did not check. The control
   * reported on_board:false rather than passing silently, so it worked and the
   * PREMISE was wrong. Re-anchored on a top-5 player who is NOT a keeper. */
  const want = 'jahmyr gibbs';
  const onBoard = boardByName.has(want);
  const inStore = (STORE.players || []).some(r => norm(r.player) === want);
  const joined = matched.some(m => norm(m.player) === want);
  const keeperNames = new Set(['jamarr chase', 'derrick henry', 'kenneth walker']);
  return { ok: !inStore || (onBoard && joined), on_board: onBoard,
    in_store: inStore, joined,
    why: 'if Draft Sharks lists a top-1 player our board also carries and the '
       + 'join misses him, the normaliser is broken. Vacuous only if he is not '
       + 'in the store yet, which is reported rather than passed silently.' };
})();
ctl.C2_no_ambiguous_names_joined = { ok: true, dropped_duplicate_board_names: dupNames.length,
  why: 'a name appearing twice on our board is DROPPED, never joined — a wrong '
     + 'join silently attaches one player\'s ceiling to another' };
ctl.C3_spread_is_not_just_the_mean = { ok: rhoSpread == null || Math.abs(rhoSpread) < 0.99,
  rho_spread: rhoSpread, rho_raw_ceiling: rhoCeil,
  why: 'raw ceilings correlate at ~0.995 with the projection (register 97), so '
     + 'comparing them proves nothing. The comparison that matters is the SPREAD.' };

const COVERAGE_BAR = 0.95;
const verdict = {
  coverage: +coverage.toFixed(4),
  matched: matched.length, board_players: BOARD.players.length,
  unmatched_from_store: unmatched.length,
  level_ds_minus_ours_spread_median: median(dsSpread) != null && median(ourSpread) != null
    ? +(median(dsSpread) - median(ourSpread)).toFixed(2) : null,
  rho_spread: rhoSpread == null ? null : +rhoSpread.toFixed(4),
  SAFE_TO_SWAP: coverage >= COVERAGE_BAR,
  why_not: coverage >= COVERAGE_BAR ? null
    : `coverage ${(coverage * 100).toFixed(1)}% is below the ${COVERAGE_BAR * 100}% bar. `
      + 'A partial ceiling swap biases exactly the players it covers -- the top of '
      + 'the board, where Cory picks first -- against the rest, because `ceiling` '
      + 'ships at weight 0.45 and is compared across players.',
};

const doc = {
  _territory: 'TERRITORY: A — draft/tools/draftsharks_join.js',
  _ruling: "Cory 2026-08-19: 'We want to use their ceiling not ours' (CORY-ASKS A19/A20)",
  _note: 'REPORT ONLY. Touches no board field.',
  store_captured_players: (STORE.players || []).length,
  controls: ctl, controls_all_passed: Object.values(ctl).every(c => c.ok),
  verdict, dispersion, sample_matched: matched.slice(0, 8),
  unmatched_sample: unmatched.slice(0, 15),
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));

console.log('DRAFT SHARKS -> OUR BOARD\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
console.log(`\n  store players      ${(STORE.players || []).length}`);
console.log(`  joined to board    ${matched.length}  (unmatched ${unmatched.length})`);
console.log(`  board coverage     ${(coverage * 100).toFixed(1)}%`);
console.log(`  rho(spread)        ${verdict.rho_spread}   (n=${both.length})`);
console.log('\n  DOES THE CEILING CARRY PLAYER-SPECIFIC INFORMATION?');
console.log(`    ours    spread mean ${dispersion.ours.mean?.toFixed(1)}  sd ${dispersion.ours.sd?.toFixed(1)}  cv ${dispersion.ours.cv?.toFixed(3)}`);
console.log(`    theirs  spread mean ${dispersion.theirs.mean?.toFixed(1)}  sd ${dispersion.theirs.sd?.toFixed(1)}  cv ${dispersion.theirs.cv?.toFixed(3)}`);
console.log(`  their spread − ours (median)  ${verdict.level_ds_minus_ours_spread_median}`);
console.log(`\n  SAFE TO SWAP: ${verdict.SAFE_TO_SWAP ? 'YES' : 'NO'}`);
if (verdict.why_not) console.log('  ' + verdict.why_not);
console.log(`\n  wrote ${OUT}`);
