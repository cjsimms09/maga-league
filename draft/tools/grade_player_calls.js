// TERRITORY: B
/* GRADE PLAYER CALLS — Cory, live 2026-08-20: "we should also grade me on
 * these likes and dislikes to see if player over or under performs and if
 * I was right.."
 *
 * The capture side (public/js/draft/app.js's setPlayerCall()) snapshots
 * proj_mean/games_expected/tier/adp at the MOMENT Cory likes or dislikes a
 * player, synced server-side per owner (src/prefs.js's `playerCalls` key).
 * This is the other half: once real games have been played, pull each
 * player's REAL season stat line from Sleeper (src/sleeper.js's
 * seasonStats() — the same cached, already-tested fetch the rest of the
 * site uses, not a new pipeline) and compare actual points-per-game against
 * what the board expected when Cory made the call.
 *
 * A 'like' grades RIGHT if the player is outperforming his preseason pace;
 * a 'dislike' grades RIGHT if he is underperforming it. Anything short of
 * GAMES_MIN_TO_GRADE games played grades PENDING, never a guess off one big
 * or small week — and with zero calls recorded, or no season stats
 * reachable at all (pre-season, today), the whole report degrades to an
 * honest "nothing gradeable yet" rather than fabricating a verdict.
 *
 * gradeCall() is a PURE function — no store, no network — so it is what the
 * self-check below exercises. gradeAllCalls() is the only part that touches
 * the store/Sleeper, and it is a thin composition of gradeCall() over real
 * data, kept thin on purpose so a network/store bug and a comparison-logic
 * bug can never be confused for each other.
 *
 * Run: node draft/tools/grade_player_calls.js <ownerId> [season]
 *      node draft/tools/grade_player_calls.js --selfcheck
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const GAMES_MIN_TO_GRADE = 3;    // one huge/tiny week must not decide a verdict
const DEFAULT_SEASON_GAMES = 17; // fallback only when games_expected wasn't captured

/* Pure comparison. `entry` is one stored call ({call, proj_mean,
 * games_expected, ...}); `statLine` is Sleeper's real season stat object for
 * that player_id ({gp, pts_half_ppr, pts_ppr, pts_std, ...}) or null/absent
 * if Sleeper has nothing for him yet. */
function gradeCall(entry, statLine) {
  if (!entry || (entry.call !== 'like' && entry.call !== 'dislike')) return null;
  const gp = statLine && statLine.gp;
  if (!gp || gp < GAMES_MIN_TO_GRADE) {
    return { verdict: 'PENDING',
      reason: gp ? ('only ' + gp + ' game(s) played — too early to grade')
        : 'no games played yet this season' };
  }
  const pts = statLine.pts_half_ppr != null ? statLine.pts_half_ppr
    : statLine.pts_ppr != null ? statLine.pts_ppr
      : statLine.pts_std;
  if (pts == null) return { verdict: 'PENDING', reason: 'no scored stat line yet' };
  if (entry.proj_mean == null) {
    return { verdict: 'UNGRADEABLE', reason: 'no proj_mean was captured when the call was made' };
  }
  const expectedGames = entry.games_expected != null && entry.games_expected > 0
    ? entry.games_expected : DEFAULT_SEASON_GAMES;
  const actualPpg = pts / gp;
  const expectedPpg = entry.proj_mean / expectedGames;
  const outperforming = actualPpg > expectedPpg;
  const correct = entry.call === 'like' ? outperforming : !outperforming;
  return {
    verdict: correct ? 'RIGHT' : 'WRONG',
    games_played: gp,
    actual_ppg: Math.round(actualPpg * 10) / 10,
    expected_ppg: Math.round(expectedPpg * 10) / 10,
    delta_pct: Math.round(((actualPpg - expectedPpg) / expectedPpg) * 1000) / 10,
  };
}

/* Composition over real data. `store` and `sleeperSeasonStats` are injected
 * so the self-check below can run this exact path against a fixture without
 * a network call or a real store. */
async function gradeAllCalls(prefsModule, store, sleeperSeasonStats, ownerId, season) {
  const doc = await prefsModule.load(store, ownerId);
  const calls = (doc && doc.prefs && doc.prefs.playerCalls) || {};
  const ids = Object.keys(calls);
  if (!ids.length) {
    return { ok: true, graded: [], summary: 'no calls recorded yet' };
  }
  let stats = null;
  try { stats = await sleeperSeasonStats(season); } catch (e) { stats = null; }
  const graded = ids.map(function (id) {
    const entry = calls[id];
    const line = stats ? stats[id] : null;
    const g = gradeCall(entry, line) || { verdict: 'UNGRADEABLE', reason: 'malformed call record' };
    return Object.assign({ player_id: id }, entry, g);
  });
  if (!stats) {
    graded.forEach(function (g) {
      g.verdict = 'PENDING';
      g.reason = 'season stats unreachable (pre-season, or the fetch failed)';
    });
  }
  const right = graded.filter(function (g) { return g.verdict === 'RIGHT'; }).length;
  const wrong = graded.filter(function (g) { return g.verdict === 'WRONG'; }).length;
  const pending = graded.length - right - wrong;
  return { ok: true, graded: graded,
    summary: graded.length + ' call(s): ' + right + ' right, ' + wrong + ' wrong, ' + pending + ' pending' };
}

/* KNOWN-POSITIVE SELF-CHECK (rule 3e): proves gradeCall() can actually
 * return RIGHT, WRONG and PENDING on cases with a known answer, not just
 * that it runs. Run standalone: `node grade_player_calls.js --selfcheck`. */
function selfCheck() {
  const cases = [
    { name: 'a liked player who clearly outperforms grades RIGHT',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6, pts_half_ppr: 120 }, // 20 ppg vs 10 ppg expected
      expect: 'RIGHT' },
    { name: 'a liked player who clearly underperforms grades WRONG',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6, pts_half_ppr: 30 }, // 5 ppg vs 10 ppg expected
      expect: 'WRONG' },
    { name: 'a disliked player who underperforms grades RIGHT (the call was correct)',
      entry: { call: 'dislike', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6, pts_half_ppr: 30 },
      expect: 'RIGHT' },
    { name: 'a disliked player who outperforms grades WRONG',
      entry: { call: 'dislike', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6, pts_half_ppr: 120 },
      expect: 'WRONG' },
    { name: 'fewer than GAMES_MIN_TO_GRADE games -> PENDING, never a guess off one week',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: { gp: 1, pts_half_ppr: 40 },
      expect: 'PENDING' },
    { name: 'no stat line at all (player has not played) -> PENDING',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: null,
      expect: 'PENDING' },
    { name: 'a stat line with gp but no points field -> PENDING, not a crash',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6 },
      expect: 'PENDING' },
    { name: 'no proj_mean captured when the call was made -> UNGRADEABLE, not a guessed baseline',
      entry: { call: 'like', proj_mean: null, games_expected: 17 },
      stat: { gp: 6, pts_half_ppr: 120 },
      expect: 'UNGRADEABLE' },
    { name: 'missing games_expected falls back to the default season length, not a crash',
      entry: { call: 'like', proj_mean: 170, games_expected: null },
      stat: { gp: 6, pts_half_ppr: 120 },
      expect: 'RIGHT' },
    { name: 'pts_std used when neither half-ppr nor ppr is present',
      entry: { call: 'like', proj_mean: 170, games_expected: 17 },
      stat: { gp: 6, pts_std: 120 },
      expect: 'RIGHT' },
    { name: 'a non-call entry (bad data) -> null, not a throw',
      entry: { call: 'maybe' }, stat: { gp: 6, pts_half_ppr: 120 }, expect: null },
    { name: 'a missing entry entirely -> null, not a throw',
      entry: null, stat: { gp: 6, pts_half_ppr: 120 }, expect: null },
  ];
  let pass = 0, fail = 0;
  cases.forEach(function (c) {
    const g = gradeCall(c.entry, c.stat);
    const got = g ? g.verdict : null;
    if (got === c.expect) { pass++; console.log('PASS  ' + c.name); }
    else { fail++; console.log('FAIL  ' + c.name + '  -> got ' + got + ', expected ' + c.expect); }
  });
  console.log('\n' + pass + '/' + (pass + fail) + ' self-check cases passed');
  return fail === 0;
}

module.exports = { gradeCall, gradeAllCalls, selfCheck, GAMES_MIN_TO_GRADE };

if (require.main === module) {
  (async function () {
    if (process.argv[2] === '--selfcheck') {
      process.exit(selfCheck() ? 0 : 1);
    }
    const ownerArg = process.argv[2];
    if (!ownerArg) {
      console.log('Usage: node grade_player_calls.js <ownerId> [season]');
      console.log('       node grade_player_calls.js --selfcheck');
      process.exit(1);
    }
    const store = require(path.join(ROOT, 'src', 'store'));
    store.initFiles();
    const prefsModule = require(path.join(ROOT, 'src', 'prefs.js'));
    const sleeper = require(path.join(ROOT, 'src', 'sleeper.js'));
    let season = process.argv[3];
    if (!season) {
      try {
        const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
        season = (board.league && board.league.season) || String(new Date().getUTCFullYear());
      } catch (e) { season = String(new Date().getUTCFullYear()); }
    }
    const result = await gradeAllCalls(prefsModule, store, sleeper.seasonStats, ownerArg, season);
    console.log('PLAYER CALLS — GRADE REPORT (season ' + season + ', owner ' + ownerArg + ')');
    console.log('='.repeat(64));
    console.log(result.summary);
    result.graded.forEach(function (g) {
      console.log('  ' + (g.call === 'like' ? '\u{1F44D}' : '\u{1F44E}') + ' ' + (g.name || g.player_id)
        + ' — ' + g.verdict + (g.reason ? ' (' + g.reason + ')' : '')
        + (g.actual_ppg != null ? ' [actual ' + g.actual_ppg + ' ppg vs expected ' + g.expected_ppg
          + ' ppg, ' + (g.delta_pct >= 0 ? '+' : '') + g.delta_pct + '%]' : ''));
    });
    const outPath = path.join(ROOT, 'draft', 'data', 'player_calls_graded_' + ownerArg + '.json');
    try {
      fs.writeFileSync(outPath, JSON.stringify(
        { season: season, owner: ownerArg, graded_at: new Date().toISOString(),
          summary: result.summary, calls: result.graded }, null, 2));
      console.log('\nwritten: ' + path.relative(ROOT, outPath));
    } catch (e) { console.log('\n(could not write report file: ' + e.message + ')'); }
  })();
}
