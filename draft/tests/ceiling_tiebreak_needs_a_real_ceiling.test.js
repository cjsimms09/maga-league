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

  /* Re-pinned 2026-08-18 (v25 sweep): this control DOCUMENTED the pathology —
   * Nix's deeper band carried a bigger p90 ratio than Purdy's, so the worse
   * projection printed the bigger ceiling. The per-player volatility term
   * healed the live pair (Purdy's own 2025 volatility now prices his tail),
   * so the control flips to pin the HEALED state; if it inverts again, a
   * cross-band ratio artifact is back on the board and the guard below is
   * load-bearing again. */
  /* ⚠️ THIS CONTROL ASSERTED THE WRONG INVARIANT, and re-measuring it produced
   * a finding worth more than the check.
   *
   * It required "the better projection carries the bigger ceiling" — ceiling
   * monotone in mean. That WAS a property of the old construction, when
   * ceilings were band CONSTANTS and therefore a fixed multiple of the mean.
   * It is not a property of the current one and should not be: since the Draft
   * Sharks ruling each player carries HIS OWN measured ratio, and a player is
   * perfectly entitled to a lower mean and a fatter tail.
   *
   * MEASURED on the live pair — and note both are `draftsharks_pct`, so this is
   * NOT the cross-band artifact the check was written for:
   *
   *     Bo Nix       our mean 344.7  ratio 1.3203  -> ceiling 455.1
   *     Brock Purdy  our mean 353.8  ratio 1.2722  -> ceiling 450.1
   *
   * AND THE SOURCE DISAGREES WITH US, which is the actual news. Draft Sharks'
   * own numbers are correctly ordered: Nix 312 -> 412, Purdy 327 -> **416**.
   * Purdy has the bigger ceiling AT SOURCE. The inversion exists only on our
   * board, because carrying a RATIO preserves each player's shape but not the
   * ordering, once it is applied to a blended mean that disagrees with the mean
   * the ratio was derived from (DS gap 15 pts, our gap 9.1).
   *
   * Swept rather than left as an anecdote: across Cory's top 200, **1,314 of
   * 17,681 comparable pairs (7.4%) order ceilings differently from Draft
   * Sharks**, largest disagreement 126.8 pts (Tank Bigsby vs Nicholas
   * Singleton). Filed for Cory as a register row — it cannot move a pick with
   * MEASURED_WEIGHTS.ceiling at 0, but proj_ceiling IS displayed.
   *
   * So the control now asserts the invariant the design actually promises:
   * our ratio is the SOURCE's ratio, carried faithfully. That is the thing that
   * would be a defect if it broke. */
  const ratio = q => q.proj_ceiling / q.proj_mean;
  const dsRatio = q => q.proj_ds_ceiling / q.proj_ds;
  ck('CONTROL: both live players carry a PER-PLAYER source ratio, not a band '
    + 'constant — the pathology this file was written for is gone',
    nix.proj_ceiling_source === 'draftsharks_pct'
      && purdy.proj_ceiling_source === 'draftsharks_pct',
    { nix: nix.proj_ceiling_source, purdy: purdy.proj_ceiling_source });
  ck('and each ratio is the SOURCE\'s own, carried faithfully onto our mean — '
    + 'the invariant the ratio-carry design actually promises (ceiling is NOT '
    + 'required to be monotone in mean; a lower mean may carry a fatter tail)',
    Math.abs(ratio(nix) - dsRatio(nix)) < 0.001
      && Math.abs(ratio(purdy) - dsRatio(purdy)) < 0.001,
    { nix: { ours: +ratio(nix).toFixed(4), ds: +dsRatio(nix).toFixed(4) },
      purdy: { ours: +ratio(purdy).toFixed(4), ds: +dsRatio(purdy).toFixed(4) } });

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
   * with the number he reads — OR carry its reason on screen. Re-pinned
   * 2026-08-18 (v25 sweep): with per-player ceilings live, the SAME-cell
   * tiebreak fires on the real board for the first time (identical cell
   * constants made it a no-op before), so a promoted row can sit above a
   * higher raw score. That is the feature working — PROVIDED the promotion
   * mark is on the row, which is what makes the deviation explainable at
   * 8s/pick. Unmarked inversions remain the defect and must be zero. */
  /* ⚠️ THERE ARE TWO LEGITIMATE REASONS AN ORDER DEVIATES FROM SCORE, AND THIS
   * KNEW ABOUT ONLY ONE — so it counted a deliberate, documented rule as a
   * defect.
   *
   * The one it knew: the same-cell ceiling tiebreak, which marks its rows.
   * The one it did not: the K/DEF CROSS-POSITION DEMOTION. `draft/vorp.py`
   * sorts onesies below the skill positions on purpose — "streamable all
   * season, so their cross-position rank is not a draft signal" — after the
   * engine was caught recommending a 4th-round defence (overall 35 against an
   * ADP of 127). They keep a real vorp and pos_rank and sort among themselves;
   * only the cross-position slot moves.
   *
   * Found by instrumenting rather than by reading: the single "unmarked"
   * inversion was rows 458/459 — Skyy Moore (WR, score -1.600) above New York
   * Jets (DEF, score 71.000), a 72.6-point gap. That is the demotion working,
   * not an unexplainable order, and no ceiling mark belongs on it.
   *
   * Both reasons are now recognised and counted SEPARATELY, so the numbers stay
   * readable and a genuine third cause would still surface as unmarked. */
  const isOnesie = e => ['K', 'DEF'].includes(((e || {}).player || {}).position);
  let unmarked = 0, marked = 0, demoted = 0;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (E.scoreable(a) && E.scoreable(b) && typeof a.score === 'number'
        && typeof b.score === 'number' && b.score > a.score + 1e-9) {
      if (a.ceiling_tiebreak) marked++;
      // the deliberate onesie demotion: a K/DEF sitting BELOW a skill player it
      // outscores is the documented rule, not a defect
      else if (isOnesie(b) && !isOnesie(a)) demoted++;
      else unmarked++;
    }
  }
  ck('every rendered ORDER deviation from SCORE has a KNOWN reason — ceiling '
    + 'tiebreak or the deliberate K/DEF demotion (tiebreak ' + marked
    + ', demotion ' + demoted + ', unexplained ' + unmarked + ')', unmarked === 0,
    unmarked + ' UNEXPLAINED score inversions — order the reader cannot account for');
  ck('CONTROL — the K/DEF demotion is genuinely present, so the clause added '
    + 'for it is not silently excusing nothing', demoted > 0, { demoted });
  ck('CONTROL — the tiebreak is genuinely live on the real board (marked '
    + 'promotions exist), so the zero-unmarked check is not vacuous', marked > 0);
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
