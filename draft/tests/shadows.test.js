/* PHASE H — shadow rosters (strategy-hunt-learning-seed.md Phase H reqs 1-4).
 * Run: node draft/tests/shadows.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SH = require('../../public/js/draft/shadows.js');
const E = require('../../public/js/draft/engine.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

/* The REAL board artifact, same as robot-mock: shadows must diverge on the
 * board they'll actually see, not on a toy fixture whose lone TE makes every
 * weighting agree. */
const ART = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const ALL = ART.players.filter(p => p.proj_mean > 0);
function makeBoard() { return ALL.slice(0, 120); }
const LEAGUE = ART.league;
function ctxAt(pick, board) {
  return { board, currentPick: pick, nextPick: pick + 13, totalPicks: 150,
    myPicksLeft: 12, roster: [], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 12 };
}

// --- creation + weight hashes -----------------------------------------------
{
  const sh = SH.create({ rounds: 15, built_at: '2026-08-22T00:00:00Z' });
  const keys = Object.keys(sh.strategies);
  check('all named profiles create shadows (Default + 6 variants)', keys.length === 7, keys.join(','));
  const hashes = new Set(keys.map(k => sh.strategies[k].weight_hash));
  check('distinct strategies carry distinct weight-function hashes (except intentional aliases)',
    hashes.size >= 6, hashes.size + ' unique of ' + keys.length);
  check('a rehearsal shadow set is flagged rehearsal (req 4)',
    SH.create({ rehearsal: true }).rehearsal === true);
}

// --- req 1: board-state hash + sequencing ------------------------------------
{
  const sh = SH.create({});
  const board1 = makeBoard();
  const h1 = SH.boardHash(board1);
  const picks1 = SH.onMyPick(sh, board1, ctxAt(4, board1), 1);
  check('every shadow logs the SAME board hash at the same real pick',
    picks1.length === 7 && picks1.every(p => p.board_hash === h1), JSON.stringify(picks1.map(p => p.board_hash)));

  // History moves on: the room drafts the top two. New snapshot, new hash.
  const gone = new Set(board1.slice(0, 2).map(p => String(p.player_id)));
  const board2 = board1.filter(p => !gone.has(String(p.player_id)));
  const h2 = SH.boardHash(board2);
  const picks2 = SH.onMyPick(sh, board2, ctxAt(17, board2), 2);
  check('the next pick logs the NEW snapshot hash — sequencing is provable',
    h2 !== h1 && picks2.every(p => p.board_hash === h2));
  check('board hash is order-independent (same set, same hash)',
    SH.boardHash(board1.slice().reverse()) === h1);

  // Requirement: a shadow never rosters the same player twice, even when
  // history left its earlier choice on the board.
  const dupes = Object.values(sh.strategies).some(s => {
    const ids = s.roster.map(p => String(p.player_id));
    return new Set(ids).size !== ids.length;
  });
  check('no shadow ever rosters a duplicate across picks', !dupes);
  check('every shadow holds one player per real pick (2 picks -> 2 players)',
    Object.values(sh.strategies).every(s => s.roster.length === 2));
}

// --- req 2: hard filters yes, taste no (participation both ways) -------------
{
  // The engine's recommend() carries the legality rails; shadows must NOT see
  // targets/never. The default shadow's pick must equal the RAW engine top with
  // default weights — proving no taste-list layer sits between shadow and
  // engine (onTheClock, which applies my lists, is never called here).
  const sh = SH.create({});
  const board = makeBoard();
  const picks = SH.onMyPick(sh, board, ctxAt(4, board), 1);
  const raw = E.recommend(ctxAt(4, board));
  const def = picks.find(p => p.strategy === 'default');
  check('the default shadow equals the raw engine top (no taste layer between)',
    def && raw.length && def.player_id === String(raw[0].player.player_id),
    def && def.player_id + ' vs ' + (raw[0] && raw[0].player.player_id));
  // Structural proof: onMyPick's ctx contains no lists key at all.
  check('the shadow context carries no targets/never lists field',
    !('lists' in ctxAt(4, board)));
}

// --- strategies diverge on a close call (they are different drafts) ----------
// HONEST FINDING (2026-08-08): on the REAL board the value term dominates so
// completely that all seven profiles pick the same player at every tested
// depth — strategy differences only surface on CLOSE CALLS. So divergence is
// proven on a constructed contested board (floor-vs-boom, value gap inside the
// ceiling ramp's reach at round 8), which is exactly where Upside-Late is
// SUPPOSED to depart from Default. The convergence-on-clear-boards property is
// itself worth knowing for Phase S: profile edges will be small, and the
// null/CV gates are what separate them from noise.
{
  const mk = (id, name, pos, vorp, spread, adp, tier) => ({
    player_id: id, name, position: pos, vorp, proj_mean: 150 + vorp,
    proj_ceiling: 150 + vorp + spread, adjusted_adp: adp, raw_adp: adp,
    tier, bye: 7, risk: 0.1 });
  const board = [mk('A', 'Floor Guy', 'RB', 63, 4, 52, 4), mk('B', 'Boom Guy', 'RB', 61, 85, 54, 4),
                 mk('C', 'WR Depth1', 'WR', 30, 10, 60, 5), mk('D', 'WR Depth2', 'WR', 26, 8, 66, 5)];
  // Onesies already filled so the RB close call IS the decision.
  const roster = [mk('r1', 'My RB1', 'RB', 80, 20, 5, 1), mk('r2', 'My WR1', 'WR', 70, 20, 8, 1),
                  mk('r3', 'My WR2', 'WR', 60, 15, 18, 2), mk('r4', 'My TE', 'TE', 50, 10, 22, 2),
                  mk('r5', 'My QB', 'QB', 55, 10, 30, 2)];
  const ctx = Object.assign({}, ctxAt(75, board), { roster, myPicksLeft: 9, roundsLeft: 9 });
  const sh = SH.create({});
  const picks = SH.onMyPick(sh, board, ctx, 8);      // round 8: shadows explore ceiling all-stages
  const byKey = {}; picks.forEach(p => { byKey[p.strategy] = p.player_id; });
  // A value/need-forward strategy still holds the floor on the close call...
  check('a value-forward strategy holds the floor on the close call', byKey.value_anchor === 'A',
    JSON.stringify(byKey));
  // ...while the ceiling-forward strategy takes the boom. (Default now leans ceiling too,
  // via Cory's same-tier/same-position tiebreaker — the weekly-payout lean.)
  check('Upside-Late takes the boom — strategies genuinely diverge',
    byKey.upside_late === 'B', JSON.stringify(byKey));
  check('divergent strategies produce divergent rosters',
    new Set(Object.values(byKey)).size >= 2);
}

// --- req 3: freeze + gradeGuard ----------------------------------------------
{
  const sh = SH.create({ built_at: '2026-08-22T20:00:00Z' });
  const board = makeBoard();
  SH.onMyPick(sh, board, ctxAt(4, board), 1);
  SH.freeze(sh, { built_at: '2026-08-22T20:00:00Z' });
  check('freeze stamps frozen + built_at on every shadow',
    Object.values(sh.strategies).every(s => s.frozen && s.built_at === '2026-08-22T20:00:00Z'));
  check('a frozen shadow set takes no more picks',
    SH.onMyPick(sh, board, ctxAt(17, board), 2).length === 0);

  const ok = SH.gradeGuard(sh.strategies.default, 15);
  check('gradeGuard passes an unchanged, frozen strategy', ok.ok === true, JSON.stringify(ok));

  // A changed strategy is a different strategy: tamper with the stored hash the
  // way a code change would make the recomputed hash differ.
  const tampered = Object.assign({}, sh.strategies.tier_hunter, { weight_hash: 'deadbeef' });
  const refused = SH.gradeGuard(tampered, 15);
  check('gradeGuard REFUSES a roster whose weight-function hash changed',
    refused.ok === false && /hash changed/.test(refused.reason), JSON.stringify(refused));

  const unfrozen = SH.create({});
  SH.onMyPick(unfrozen, board, ctxAt(4, board), 1);
  check('gradeGuard refuses an unfrozen roster',
    SH.gradeGuard(unfrozen.strategies.default, 15).ok === false);
}

// --- req 4: rehearsal entries are flagged, never mixed -----------------------
{
  const real = SH.create({ rehearsal: false });
  const mock = SH.create({ rehearsal: true });
  const board = makeBoard();
  const rp = SH.onMyPick(real, board, ctxAt(4, board), 1);
  const mp = SH.onMyPick(mock, board, ctxAt(4, board), 1);
  check('real shadow picks carry rehearsal:false', rp.every(p => p.rehearsal === false));
  check('mock shadow picks carry rehearsal:true', mp.every(p => p.rehearsal === true));
}

// --- the LIVE PROJECTION (read-only): what each strategy would take NOW --------
{
  const board = makeBoard();
  const proj = SH.project(board, ctxAt(9, board), 1, []);
  check('project returns one row per strategy', proj.length === 7, String(proj.length));
  check('every projected row names a player + strategy',
    proj.every(r => r.player_id && r.player && r.key));
  check('project commits NOTHING (it is read-only — a re-run is identical)',
    JSON.stringify(SH.project(board, ctxAt(9, board), 1, [])) === JSON.stringify(proj));
  check('project excludes players already on my roster',
    (function () {
      const mine = [board[0]];
      const p = SH.project(board, ctxAt(9, board), 1, mine);
      return p.every(r => r.player_id !== String(board[0].player_id));
    })());
  check('project is populated with an EMPTY roster (the "renders empty" fix)',
    SH.project(board, ctxAt(9, board), 1, []).length === 7);
  check('empty board projects nothing (no fabricated pick)',
    SH.project([], ctxAt(9, []), 1, []).length === 0);

  // consensus/split summary
  const cons = SH.consensus(proj);
  check('consensus reports n, a leader, and a contested flag',
    cons && cons.n === 7 && cons.lead && typeof cons.contested === 'boolean',
    JSON.stringify(cons));
  check('consensus on unanimity is NOT contested',
    (function () {
      const all = [{ player_id: 'x', player: 'A', position: 'RB', key: 'k1' },
                   { player_id: 'x', player: 'A', position: 'RB', key: 'k2' },
                   { player_id: 'x', player: 'A', position: 'RB', key: 'k3' },
                   { player_id: 'x', player: 'A', position: 'RB', key: 'k4' }];
      return SH.consensus(all).contested === false && SH.consensus(all).agree === 4;
    })());
  check('consensus on a real split IS contested (the slow-down signal)',
    (function () {
      const split = [{ player_id: 'a', player: 'A', position: 'RB', key: 'k1' },
                     { player_id: 'a', player: 'A', position: 'RB', key: 'k2' },
                     { player_id: 'b', player: 'B', position: 'WR', key: 'k3' },
                     { player_id: 'c', player: 'C', position: 'TE', key: 'k4' }];
      const c = SH.consensus(split);
      return c.contested === true && c.dissenters.length === 2;
    })());
  check('consensus on an empty projection is null (never a fabricated majority)',
    SH.consensus([]) === null);

  // WHY the lead leads — the driver + runner-up, so unanimity is auditable.
  check('consensus names the driver term that produced the agreement',
    cons && typeof cons.lead_driver === 'string' && cons.lead_driver.length > 0,
    JSON.stringify({ lead_driver: cons && cons.lead_driver }));
  check('consensus flags a need-driven agreement as an artifact, value-driven as real',
    (function () {
      const rows = k => ([
        { player_id: 'x', player: 'A', position: 'QB', key: k + '1', driver: k, runner_up: 'B', gap_to_second: 2 },
        { player_id: 'x', player: 'A', position: 'QB', key: k + '2', driver: k, runner_up: 'B', gap_to_second: 4 },
      ]);
      const needC = SH.consensus(rows('need'));
      const valC = SH.consensus(rows('value'));
      return needC.lead_driver === 'need' && needC.driver_is_artifact === true
        && valC.lead_driver === 'value' && valC.driver_is_artifact === false;
    })());
  check('consensus keeps the runner-up name + median gap visible even at unanimity',
    (function () {
      const c = SH.consensus([
        { player_id: 'x', player: 'A', position: 'RB', key: 'k1', driver: 'value', runner_up: 'Bench Guy', gap_to_second: 1 },
        { player_id: 'x', player: 'A', position: 'RB', key: 'k2', driver: 'value', runner_up: 'Bench Guy', gap_to_second: 3 },
      ]);
      return c.contested === false && c.runner_up === 'Bench Guy' && c.gap_to_second === 1;
    })());
}


// --- THE ARTIFACT FLAG IS GENERAL, AND THE PANEL ACTUALLY SHOWS IT ----------
/* `consensus()` has returned `lead_driver`, `driver_is_artifact`, `runner_up`
 * and `gap_to_second` since it was written, with a comment stating exactly why:
 * "A 7/7 driven by `need` is the artifact flag; a 7/7 driven by `value` is real
 * agreement." This suite asserted all four are CORRECT. Nothing asserted anyone
 * READS them — and nothing did. Rule 14 on the one field whose job is to stop
 * the misread the strip invites.
 *
 * MEASURED ON THE 2026-08-14 LIVE BOARD AT PICK 33, CORY'S FIRST PICK
 * (HISTORY — the 08-17 rebuild flipped this case to a live-driven consensus;
 * see the re-pin at the bottom of this block):
 *
 *     rec list #1     Colston Loveland (TE) 17.3
 *     shadow strip    "7 of 7 -> Zay Flowers"   (no contested flag)
 *     Flowers's rank in the real list: 4th
 *
 * all seven driven by `need` at values 42.7 / 21.3 / 42.7 / 85.4 / 42.7 / 64.0 /
 * 42.7 — one need computation times each strategy's need weight. Seven
 * "independent strategies" are seven multiples of one number, and `need` is
 * weighted ZERO on the board he drafts from. */
{
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const E2 = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const row = (drv) => ([
    { player_id: 'x', player: 'A', position: 'RB', key: 'k1', driver: drv, runner_up: 'B', gap_to_second: 2 },
    { player_id: 'x', player: 'A', position: 'RB', key: 'k2', driver: drv, runner_up: 'B', gap_to_second: 3 },
  ]);

  // -- the general form: `need` is not special, it is just one of the five zeros
  const zeroed = Object.keys(E2.MEASURED_WEIGHTS).filter(k => E2.MEASURED_WEIGHTS[k] === 0);
  check('CONTROL — production really does zero more than one term, or the '
    + 'generalisation below is pointless', zeroed.length >= 2, zeroed.join(','));
  check('EVERY zero-weighted driver raises driver_zero_weighted, not only `need`',
    zeroed.every(k => SH.consensus(row(k)).driver_zero_weighted === true),
    zeroed.filter(k => !SH.consensus(row(k)).driver_zero_weighted).join(','));
  check('and a LIVE term does not — the flag means "the board ignores this", not '
    + '"the shadows agreed"',
  SH.consensus(row('value')).driver_zero_weighted === false,
  JSON.stringify(SH.consensus(row('value')).driver_zero_weighted));
  check('FAIL ARM — driver_is_artifact alone would have missed the other four, '
    + 'which is why the general form was added',
  zeroed.filter(k => SH.consensus(row(k)).driver_is_artifact).length < zeroed.length,
  zeroed.filter(k => SH.consensus(row(k)).driver_is_artifact).join(','));

  // -- and the strip renders it
  check('the panel reads lead_driver rather than computing its own',
    /cons\.lead_driver/.test(APP));
  check('it treats the artifact flag as a WARNING state, not a decoration',
    /cons\.driver_is_artifact \|\| cons\.driver_zero_weighted/.test(APP)
      && /ONE TERM, NOT/.test(APP));
  check('it says the board weights that term zero — the fact that makes the '
    + 'unanimity hollow', /which the board weights 0/.test(APP));
  check('the runner-up and margin are rendered too, both previously computed and '
    + 'dropped', /cons\.runner_up/.test(APP) && /cons\.gap_to_second/.test(APP));
  check('and each strategy row shows the term that drove IT, so a reader can see '
    + 'seven-arguments vs one-argument-seven-times without trusting a summary',
  /r\.driver/.test(APP) && /sp-rowdriver/.test(APP));

  // -- the measured case, re-derived rather than quoted
  /* RE-PINNED 2026-08-18, THE THIRD TIME THIS CASE HAS MOVED, and the pin
   * moves WITH the reason on the record each time. 08-14: pick 33 was 7/7
   * Zay Flowers via `need` — hollow, flagged (block comment above, history).
   * 08-17: the rebuild re-spread the board; 6/7 Colston Loveland via
   * `keeper`, a live-weighted term — real agreement, unflagged. 08-18: the
   * keeper-vorp badge fix collapsed the incumbent-bar subsidy that was
   * inflating the keeper term (~15 phantom points; intervention-rate.test.js
   * carries the measurement), and pick 33 stopped being a consensus at all:
   * 5/7 via `value`, contested. A control pinned to a pick that no longer
   * shows the phenomenon pins nothing — so the case moved to where the live
   * board actually exhibits BOTH sides today, which is a STRONGER pin than
   * either predecessor:
   *
   *   pick 68: 7/7 Parker Washington via `need`  — zero-weighted, FLAGGED
   *            (the firing side, now measured live, not only synthetic)
   *   pick 73: 7/7 Jayden Reed via `value`       — live-weighted, quiet
   *
   * Both are uncontested, which retires the old "contested might catch it"
   * question by measurement: `contested` reads false on the hollow case and
   * the real one alike — it cannot tell them apart, and that is exactly why
   * the separate artifact signal exists. */
  const B2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const keepers = (B2.kept_players || []).slice();
  const priced = B2.players.filter(x => x.adp != null).slice().sort((a, b) => a.adp - b.adp);
  const liveCase = (pick) => {
    const gone = new Set(priced.slice(0, pick - 1).map(x => String(x.player_id)));
    keepers.forEach(t => gone.add(String(t.player_id)));
    const board = B2.players.filter(x => !gone.has(String(x.player_id)));
    const ctx = { board: board, nextPick: pick + 15, totalPicks: 150, myPicksLeft: 12,
      roster: keepers.slice(), doctrine: null, myPickIndex: 0, totalMyPicks: 12,
      currentKeepers: keepers.slice(), league: B2.league, weights: E2.MEASURED_WEIGHTS,
      runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: pick,
      intervening: 15, roundsLeft: 12 };
    return SH.consensus(SH.project(board, ctx, 4, keepers.slice()));
  };
  const cHollow = liveCase(68);
  const cReal = liveCase(73);
  [['68', cHollow], ['73', cReal]].forEach(([p, c]) => console.log(
    '      pick ' + p + ': ' + c.agree + '/' + c.n + ' -> ' + c.lead
    + ' · driver ' + c.lead_driver + ' · zero-weighted ' + c.driver_zero_weighted
    + ' · contested ' + c.contested));
  check('CONTROL — the live board still carries a unanimous HOLLOW consensus, '
    + 'and the flag fires on it (the firing side, measured live)',
  cHollow.agree === cHollow.n && cHollow.driver_zero_weighted === true
    && cHollow.driver_is_artifact === true,
  cHollow.agree + '/' + cHollow.n + ' driver ' + cHollow.lead_driver);
  check('CONTROL — the live board also carries a unanimous REAL consensus, or '
    + 'there is nothing here to mislabel', cReal.agree >= Math.ceil(cReal.n * 0.75),
  cReal.agree + '/' + cReal.n);
  check('and it is NOT flagged — the strip stays quiet on agreement driven by '
    + 'a term the board really uses',
  cReal.driver_zero_weighted === false && cReal.driver_is_artifact === false,
  'driver ' + cReal.lead_driver);
  check('FAIL ARM — the real case\'s lead driver is genuinely nonzero in '
    + 'MEASURED_WEIGHTS, or the quiet strip above would be the exact mislabel '
    + 'this section exists to catch', (E2.MEASURED_WEIGHTS[cReal.lead_driver] || 0) !== 0,
  cReal.lead_driver + '=' + E2.MEASURED_WEIGHTS[cReal.lead_driver]);
  check('CONTROL — `contested` cannot tell the hollow case from the real one '
    + '(false on BOTH), which is why the separate signal exists rather than '
    + 'reusing that flag',
  cHollow.contested === false && cReal.contested === false,
  'hollow=' + cHollow.contested + ' real=' + cReal.contested);
}

console.log(`\n${pass}/${pass + fail} shadow-roster checks passed`);
process.exit(fail ? 1 : 0);
