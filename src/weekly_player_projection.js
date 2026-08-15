// TERRITORY: A
/* WEEKLY PLAYER PROJECTIONS — the predicted half of the league-wide player loop.
 *
 * THE GAP, MEASURED. claims-cron emits TEAM-level forecasts (matchup win
 * probabilities, the weekly-high pick) and the resolution path already reads
 * Sleeper's players_points — realized per-player points for every rostered
 * player in every matchup, every week. So the REALIZED half of a player-level
 * loop flows and nothing emits the PREDICTED half. Every graded week yields a
 * handful of team-level residuals when it could yield hundreds of player-level
 * ones. This module is the predicted half: per-player expected points for the
 * coming week, for every rostered player on every roster.
 *
 * TWO ARMS, EMITTED SIDE BY SIDE, so the grading loop can learn which is
 * better rather than us asserting it:
 *
 *   'ours'    — the strictly-prior blend: the board's season projection
 *               (proj_mean, already scored under OUR table) scaled to a
 *               per-week basis, pulled toward the player's own in-season
 *               realized mean as weeks accumulate. Same leak discipline
 *               exp_weekly_env proved: every input for week w is knowable
 *               before week w.
 *   'sleeper' — Sleeper's own weekly projection line (pts_half_ppr), taken
 *               as-is. DECLARED CAVEAT: Sleeper's half-PPR table is not our
 *               table (we score 6-pt pass TDs; theirs assumes 4), so this arm
 *               carries a known positional bias — the grading MEASURES it per
 *               position instead of us correcting it silently, which would
 *               make it partly our number and stop it being a second source.
 *
 * BYE/INACTIVE-AWARE BY CONSTRUCTION: a player on bye or ruled out projects 0
 * and the row says why — the zeroing reuses proj_feed's reason() semantics
 * (the 540-week sweep's lesson) rather than reimplementing it.
 *
 * REFUSAL-FIRST: a player the board has no projection for and too little
 * in-season history projects NOTHING — status 'absent', no forecast row. An
 * invented number graded against reality teaches the loop that inventing
 * works.
 *
 * TIMED HONESTLY. Emission is scheduled Thursday 10:00 UTC — before Thursday
 * Night Football (~00:20 UTC Friday). A run that happens at or after the
 * week's first possible kickoff stamps every row emitted_late, and the grader
 * EXCLUDES late rows (counted, never silently graded): a projection committed
 * after the games started is not a prediction.
 */
'use strict';

const PF = require('./proj_feed');
const { getDoc, setDoc } = require('./data');

const METHOD = 'player-week-projection-v1';
const ARMS = ['ours', 'sleeper'];

/* THE BLEND CONSTANT: the prior counts as this many pseudo-weeks of evidence.
 * 3 matches exp_weekly_env's MIN_PRIOR_APPEARANCES — the point at which that
 * experiment first trusted a running mean at all. Declared before the offline
 * validation ran; the validation MEASURES it (K sweep reported alongside),
 * it does not tune it. */
const PRIOR_PSEUDO_WEEKS = 3;
/* Without a board prior, a pure realized mean needs at least this many
 * appearances before it is a number rather than noise (exp_weekly_env's
 * eligibility floor, reused). */
const MIN_REALIZED_ONLY = 3;

const PROJ_TTL_MS = 6 * 60 * 60 * 1000;   // projections drift until kickoff
const FAIL_TTL_MS = 10 * 60 * 1000;       // negative cache, bundle() discipline

// ── keys ────────────────────────────────────────────────────────────────────
/* Deterministic from (season, week, player, arm) so a re-run cannot mint a
 * second forecast for the same claim — same dedupe discipline as
 * weekly_claims.matchupKey, and the grader's pair() keeps the earliest per key
 * as the backstop. */
function playerKey(season, week, playerId, arm) {
  return `wk|${season}|${week}|player|${playerId}|${arm}`;
}
function isPlayerKey(key) {
  return typeof key === 'string' && key.split('|')[3] === 'player';
}
function armOfKey(key) {
  const parts = String(key).split('|');
  return parts.length >= 6 ? parts[5] : null;
}

// ── the timing guard ────────────────────────────────────────────────────────
/* The moment after which a week-N emission is post-hoc. Sleeper's
 * state.season_start_date is the opening Thursday; NFL regular-season weeks
 * advance seven days at a time from it, and the earliest game of a week is
 * Thursday night (~00:20 UTC Friday). 22:00 UTC on the week's Thursday is a
 * deliberate two-hour margin BEFORE any possible kickoff — conservative in
 * the direction that marks a borderline row late rather than on time.
 * Returns null when the start date is unknown: unknown timing is not "on
 * time", and the grader treats null as ungradeable (named, never graded). */
function lateCutoffUtc(seasonStartDate, week) {
  if (!seasonStartDate || !week) return null;
  const start = Date.parse(String(seasonStartDate) + 'T22:00:00Z');
  if (!Number.isFinite(start)) return null;
  return start + (Number(week) - 1) * 7 * 24 * 60 * 60 * 1000;
}

// ── realized history ────────────────────────────────────────────────────────
/* One week's per-player realized points from raw Sleeper matchup rows. This is
 * the SAME players_points the resolution path reads — league scoring, every
 * rostered player. Returns null (not {}) when nothing has scored: an unplayed
 * week is an absence, not a week of zeros. */
function playersPointsFromMatchups(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const out = {};
  let any = false;
  for (const m of rows) {
    const pp = m && m.players_points;
    if (!pp || typeof pp !== 'object') continue;
    for (const [pid, pts] of Object.entries(pp)) {
      const n = Number(pts);
      if (!Number.isFinite(n)) continue;
      out[String(pid)] = Math.round(n * 100) / 100;
      if (n !== 0) any = true;
    }
  }
  return any ? out : null;
}

/* Cached forever once final — a completed week's players_points do not change.
 * Mirrors sleeper.weekPointsByOwner's caching, at player grain. */
async function playersPointsForWeek(sleeperMod, leagueId, week) {
  if (!leagueId || !week) return null;
  const key = `playerpoints:${leagueId}:${week}`;
  const cache = await getDoc(key, null);
  if (cache && cache.points) return cache.points;
  const rows = await sleeperMod.matchupsForWeek(leagueId, week);
  const points = playersPointsFromMatchups(rows);
  if (points) await setDoc(key, { fetched_at: Date.now(), points });
  return points;
}

/* A player's strictly-prior appearances: weeks < `week`, never the bye week,
 * and never a 0.0 week. THE ZERO RULE IS AN ASSUMPTION, STATED: in
 * players_points a did-not-play week and a played-for-zero week are both 0.0
 * and indistinguishable, so both are treated as non-appearances. That slightly
 * flatters boom players who truly blanked (rare for skill positions) and is
 * far cheaper than the alternative — counting DNP weeks as production, which
 * poisons every injured player's mean. exp_weekly_env's store had only
 * played-game rows, so this reproduces its appearance semantics as closely as
 * the live feed allows. */
function appearances(historyByWeek, playerId, week, bye) {
  const out = [];
  const pid = String(playerId);
  for (const [w, points] of Object.entries(historyByWeek || {})) {
    const wk = Number(w);
    if (!(wk >= 1) || wk >= Number(week)) continue;         // strictly prior
    if (bye != null && wk === Number(bye)) continue;         // bye is not a game
    const pts = points && points[pid];
    if (pts == null || Number(pts) === 0) continue;          // DNP-indistinguishable
    out.push(Number(pts));
  }
  return out;
}

// ── arm (a): the strictly-prior blend ───────────────────────────────────────
/* { value, basis, status, zeroed_because, n_prior } — never a bare number.
 * status: 'priced' | 'zeroed' | 'absent'. 'absent' emits NOTHING. */
function armOurs(player, opts) {
  const o = opts || {};
  const w = PF.weekly(player, { week: o.week });
  if (!w) return { value: null, basis: null, status: 'absent', zeroed_because: null, n_prior: 0 };
  if (w.basis === 'zeroed') {
    return { value: 0, basis: 'zeroed', status: 'zeroed',
             zeroed_because: w.zeroed_because, n_prior: 0 };
  }
  const realized = o.realized || [];
  const n = realized.length;
  const sum = realized.reduce((s, v) => s + Number(v), 0);
  if (w.proj != null) {
    // The prior is proj_mean on a per-week basis (proj_feed's number, one
    // scorer, one source of truth), weighted as PRIOR_PSEUDO_WEEKS of games.
    // Pre-week-3 the prior dominates; realized takes over as n grows.
    const v = (PRIOR_PSEUDO_WEEKS * w.proj + sum) / (PRIOR_PSEUDO_WEEKS + n);
    return { value: Math.round(v * 100) / 100,
             basis: `blend:prior${PRIOR_PSEUDO_WEEKS}w+realized${n}w`,
             status: 'priced', zeroed_because: null, n_prior: n };
  }
  if (n >= MIN_REALIZED_ONLY) {
    return { value: Math.round((sum / n) * 100) / 100,
             basis: `realized_mean:${n}w`, status: 'priced',
             zeroed_because: null, n_prior: n };
  }
  // No board prior and too little season: refuse. absent-is-not-zero.
  return { value: null, basis: null, status: 'absent', zeroed_because: null, n_prior: n };
}

// ── arm (b): Sleeper's own weekly line ──────────────────────────────────────
/* Same pts coalesce sleeper.weekStats uses. The bye/inactive zero-guard is
 * applied HERE TOO (the loop's rows must all be bye-aware), and when we zero a
 * Sleeper number the basis says so — that zero is our guard, not their line. */
function armSleeper(player, opts) {
  const o = opts || {};
  const w = PF.weekly(Object.assign({}, player, { proj_mean: null }), { week: o.week });
  if (w && w.basis === 'zeroed') {
    return { value: 0, basis: 'zeroed(guard-over-sleeper)', status: 'zeroed',
             zeroed_because: w.zeroed_because };
  }
  const row = o.sleeperRow;
  const stats = row && (row.stats && typeof row.stats === 'object' ? row.stats : row);
  const pts = stats == null ? null
    : (stats.pts_half_ppr ?? stats.pts_ppr ?? stats.pts_std ?? null);
  if (pts == null || !Number.isFinite(Number(pts))) {
    return { value: null, basis: null, status: 'absent', zeroed_because: null };
  }
  return { value: Math.round(Number(pts) * 100) / 100,
           basis: 'sleeper:pts_half_ppr-coalesce', status: 'priced', zeroed_because: null };
}

// ── forecast rows ───────────────────────────────────────────────────────────
const RESOLUTION_RULE =
  'This player\'s realized fantasy points in this week, under the league\'s own '
  + 'scoring, read from Sleeper matchup players_points once the week is final. '
  + 'A player with no realized entry (dropped before Sunday, no game data) '
  + 'resolves nothing — pending is not a miss. Rows with emitted_late != false '
  + 'are excluded from grading.';

function forecastRow(opts) {
  const o = opts || {};
  for (const k of ['season', 'week', 'player_id', 'arm']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`forecastRow: \`${k}\` is required and has no default.`);
    }
  }
  if (o.value === undefined || o.value === null || !Number.isFinite(Number(o.value))) {
    throw new Error('forecastRow: a numeric value is required — an absent '
      + 'projection is a refusal upstream, never a row here.');
  }
  return {
    key: playerKey(o.season, o.week, o.player_id, o.arm),
    ftype: 'point',
    value: Number(o.value),
    resolution_rule: RESOLUTION_RULE,
    subject: {
      week: Number(o.week), player_id: String(o.player_id),
      position: o.position == null ? null : String(o.position),
      owner_id: o.owner_id == null ? null : String(o.owner_id),
      starter: Boolean(o.starter),
    },
    arm: String(o.arm),
    basis: o.basis == null ? null : String(o.basis),
    zeroed_because: o.zeroed_because == null ? null : String(o.zeroed_because),
    n_prior_weeks: o.n_prior == null ? null : Number(o.n_prior),
    /* true | false | null. null = timing unknowable (no season start date) —
     * treated by the grader exactly like late: named, excluded. */
    emitted_late: o.emitted_late === true ? true : (o.emitted_late === false ? false : null),
  };
}

/* THE WEEK'S WHOLE SLATE, pure over its inputs so the test can hand it a
 * league and read back exactly what the ledger will contain.
 *
 * rosters:    Sleeper roster rows ({roster_id, players[], starters[]})
 * sleeperMap: roster_id -> owner id (records key on OWNER; roster ids renumber)
 * boardById:  player_id -> board row (proj_mean, position, team, bye, injury_status)
 * playersDb:  sleeper players() slim rows ({pos, team, inj}) — live injury beats
 *             the board's build-time snapshot when both exist
 * byes:       team -> bye week (src/nfl_byes.json for the season)
 * history:    {week: {player_id: realized points}} for weeks already played
 * sleeperProj:player_id -> projection row, or null (arm skipped, named)
 */
function buildWeekForecasts(opts) {
  const o = opts || {};
  const { season, week } = o;
  if (!season || !week) return { forecasts: [], team_sums: {}, coverage: null };
  const boardById = o.boardById || {};
  const playersDb = o.playersDb || {};
  const byes = o.byes || {};
  const late = o.now == null || o.lateCutoff == null ? null : (Number(o.now) >= Number(o.lateCutoff));

  const forecasts = [];
  const teamSums = {};
  const cov = { rostered: 0, ours_priced: 0, ours_zeroed: 0, ours_absent: 0,
                sleeper_priced: 0, sleeper_zeroed: 0, sleeper_absent: 0,
                sleeper_arm_available: !!o.sleeperProj };

  for (const roster of o.rosters || []) {
    const owner = (o.sleeperMap || {})[String(roster.roster_id)];
    if (owner == null) continue;                       // unmapped roster: no owner to key on
    const starters = new Set(roster.starters || []);
    const sums = { total: null, sum_priced: 0, starters: 0, priced: 0, zeroed: 0, absent: 0 };

    for (const pid of roster.players || []) {
      cov.rostered++;
      const board = boardById[String(pid)] || null;
      const live = playersDb[String(pid)] || null;
      const team = (live && live.team) || (board && board.team) || null;
      const player = {
        proj_mean: board ? board.proj_mean : null,
        bye: byes[team] != null ? Number(byes[team])
          : (board && board.bye != null ? Number(board.bye) : null),
        injury_status: (live && live.inj) || (board && board.injury_status) || null,
      };
      const position = (live && live.pos) || (board && board.position) || null;
      const realized = appearances(o.history, pid, week, player.bye);
      const isStarter = starters.has(pid);

      const a = armOurs(player, { week, realized });
      if (a.status !== 'absent') {
        forecasts.push(forecastRow({
          season, week, player_id: pid, arm: 'ours', value: a.value,
          basis: a.basis, zeroed_because: a.zeroed_because, n_prior: a.n_prior,
          position, owner_id: owner, starter: isStarter, emitted_late: late,
        }));
      }
      cov[`ours_${a.status}`]++;

      if (o.sleeperProj) {
        const b = armSleeper(player, { week, sleeperRow: o.sleeperProj[String(pid)] });
        if (b.status !== 'absent') {
          forecasts.push(forecastRow({
            season, week, player_id: pid, arm: 'sleeper', value: b.value,
            basis: b.basis, zeroed_because: b.zeroed_because,
            position, owner_id: owner, starter: isStarter, emitted_late: late,
          }));
        }
        cov[`sleeper_${b.status}`]++;
      }

      // Bye-aware team sum over the CURRENT starters, from OUR arm — this is
      // the per-matchup projected-points input the analyzer hypothesis needs.
      if (isStarter) {
        sums.starters++;
        if (a.status === 'absent') sums.absent++;
        else {
          sums.sum_priced = Math.round((sums.sum_priced + a.value) * 100) / 100;
          if (a.status === 'zeroed') sums.zeroed++; else sums.priced++;
        }
      }
    }
    /* A total over a roster missing a starter's number is a DIFFERENT quantity
     * than a full one and reads identically — so the total is null unless every
     * starter priced or zeroed, and the partial sum is published under its own
     * name (proj_feed.matchupGap's refusal, applied at team grain). */
    sums.total = sums.absent === 0 ? sums.sum_priced : null;
    sums.complete = sums.absent === 0;
    teamSums[String(owner)] = sums;
  }
  return { forecasts, team_sums: teamSums, coverage: cov };
}

/* Emission-side dedupe against the marker doc a previous run wrote. The
 * ledger's pair() keeping the earliest per key is the backstop; this keeps a
 * re-run from bloating the season's blob count by 300 rows a pop. */
function dedupeAgainstMarker(forecasts, marker) {
  const done = new Set((marker && marker.keys) || []);
  return (forecasts || []).filter(f => !done.has(f.key));
}

// ── resolution ──────────────────────────────────────────────────────────────
/* Joined by key against the week's realized players_points — the read the
 * resolution path ALREADY does for team scores, at player grain. A forecast
 * whose player has no realized entry yields nothing (roster churn between
 * Thursday and Sunday): pending, not a miss. */
function resolvePlayerForecasts(forecasts, playersPoints) {
  const pp = playersPoints || {};
  const out = [];
  for (const f of forecasts || []) {
    if (!f || !isPlayerKey(f.key) || f.ftype !== 'point') continue;
    const pid = f.subject && f.subject.player_id;
    const pts = pid != null ? pp[String(pid)] : undefined;
    if (pts == null) continue;
    out.push({
      forecast_key: f.key,
      outcome: Number(pts),
      realized: { points: Number(pts) },
    });
  }
  return out;
}

// ── grading ─────────────────────────────────────────────────────────────────
function partitionLedger(entries) {
  const playerWeek = [], rest = [];
  for (const e of entries || []) {
    if (e && e.method === METHOD
        && (e.kind === 'forecast' || e.kind === 'forecast_resolution')) playerWeek.push(e);
    else rest.push(e);
  }
  return { playerWeek, rest };
}

function _spearman(a, b) {
  if (a.length < 3) return null;
  const rank = vals => {
    const order = vals.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const ranks = new Array(vals.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const ra = rank(a), rb = rank(b);
  const ma = ra.reduce((s, v) => s + v, 0) / ra.length;
  const mb = rb.reduce((s, v) => s + v, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2;
  }
  const den = Math.sqrt(da) * Math.sqrt(db);
  return den ? num / den : null;
}

/* Per-arm, per-position skill over the resolved player-week rows: n, MAE,
 * bias (signed, + = we projected high), and mean within-week Spearman.
 * AGGREGATES ONLY — a snapshot carrying hundreds of per-player rows every
 * Tuesday would swamp the calibration ledger it lands in.
 *
 * THE FORWARD + TIMING GUARANTEES, enforced here:
 *   - decision_at strictly before the resolution's (forecast_grade.isForward);
 *   - emitted_late must be exactly false. true OR null (timing unknowable) is
 *     excluded and COUNTED — never silently graded. */
function gradePlayerWeeks(entries) {
  const FG = require('./forecast_grade');
  const forecasts = entries.filter(e => e.kind === 'forecast');
  const resolutions = entries.filter(e => e.kind === 'forecast_resolution');
  const { pairs, pending } = FG.pair(forecasts, resolutions);

  let excludedLate = 0, disqualified = 0;
  const graded = [];   // {arm, position, week, err, pred, actual}
  for (const [fc, res] of pairs) {
    const p = fc.payload || {};
    if (p.emitted_late !== false) { excludedLate++; continue; }
    if (!FG.isForward(fc, res)) { disqualified++; continue; }
    const pred = Number(p.value), actual = Number((res.payload || {}).outcome);
    if (!Number.isFinite(pred) || !Number.isFinite(actual)) { disqualified++; continue; }
    graded.push({
      arm: p.arm || armOfKey(p.key) || 'unknown',
      position: (p.subject && p.subject.position) || 'UNK',
      week: (p.subject && p.subject.week) || null,
      pred, actual, err: pred - actual,
    });
  }

  const agg = rows => ({
    n: rows.length,
    mae: rows.length ? Math.round(rows.reduce((s, r) => s + Math.abs(r.err), 0) / rows.length * 100) / 100 : null,
    bias: rows.length ? Math.round(rows.reduce((s, r) => s + r.err, 0) / rows.length * 100) / 100 : null,
  });

  const byPosition = {};
  for (const r of graded) {
    const pos = (byPosition[r.position] || (byPosition[r.position] = {}));
    (pos[r.arm] || (pos[r.arm] = [])).push(r);
  }
  const positionTable = {};
  for (const [pos, arms] of Object.entries(byPosition)) {
    positionTable[pos] = {};
    for (const [arm, rows] of Object.entries(arms)) positionTable[pos][arm] = agg(rows);
    /* Which arm is better HERE, cumulatively — the skill table the
     * source-weight machinery consumes. Named only when both arms have a
     * real sample; a winner over n=2 is a coin read as a verdict. */
    const armNames = Object.keys(arms).filter(a => arms[a].length >= 10);
    if (armNames.length >= 2) {
      positionTable[pos].better_arm = armNames.slice().sort(
        (a, b) => positionTable[pos][a].mae - positionTable[pos][b].mae)[0];
    } else {
      positionTable[pos].better_arm = null;   // insufficient sample — named, not guessed
    }
  }

  // Mean within-week Spearman per arm (rank skill, distinct from level skill).
  const rankCorr = {};
  for (const arm of ARMS) {
    const byWeek = {};
    for (const r of graded) if (r.arm === arm && r.week != null) {
      (byWeek[r.week] || (byWeek[r.week] = [])).push(r);
    }
    const sps = [];
    for (const rows of Object.values(byWeek)) {
      const sp = _spearman(rows.map(r => r.pred), rows.map(r => r.actual));
      if (sp != null) sps.push(sp);
    }
    rankCorr[arm] = sps.length
      ? Math.round(sps.reduce((s, v) => s + v, 0) / sps.length * 1000) / 1000 : null;
  }

  const byWeek = {};
  for (const r of graded) {
    if (r.week == null) continue;
    const wk = (byWeek[r.week] || (byWeek[r.week] = {}));
    (wk[r.arm] || (wk[r.arm] = [])).push(r);
  }
  const weekTable = {};
  for (const [wk, arms] of Object.entries(byWeek)) {
    weekTable[wk] = {};
    for (const [arm, rows] of Object.entries(arms)) weekTable[wk][arm] = agg(rows);
  }

  return {
    method: METHOD,
    n_forecasts: forecasts.length,
    n_graded: graded.length,
    n_pending: pending.length,
    excluded_late_or_unknown_timing: excludedLate,
    disqualified,
    by_position: positionTable,
    by_week: weekTable,
    rank_corr: rankCorr,
  };
}

// ── the Sleeper weekly-projection fetch (arm b's source) ────────────────────
/* Same TTL + negative-cache discipline bundle() uses. The URL shape is the
 * weekly variant sleeper_import.py's endpoint probe verified; the empty-payload
 * trap documented there ("a well-formed payload with empty stat lines rather
 * than an error") is guarded by requiring a minimum of priced rows. Fails
 * SOFT: null out means the cron emits arm 'ours' alone and says so. */
const MIN_PRICED_ROWS = 50;

function normalizeProjectionPayload(raw) {
  let rows = null;
  if (Array.isArray(raw)) {
    rows = {};
    for (const r of raw) {
      if (r && r.player_id != null) rows[String(r.player_id)] = r.stats || r;
    }
  } else if (raw && typeof raw === 'object') {
    rows = raw;
  }
  if (!rows) return null;
  let priced = 0;
  for (const v of Object.values(rows)) {
    const s = v && (v.stats && typeof v.stats === 'object' ? v.stats : v);
    if (s && (s.pts_half_ppr ?? s.pts_ppr ?? s.pts_std) != null) priced++;
  }
  return priced >= MIN_PRICED_ROWS ? rows : null;   // the zeroes-board trap
}

async function fetchWeekProjections(season, week) {
  if (!season || !week) return { rows: null, status: 'no-season-or-week' };
  const cacheKey = `projcache:${season}:${week}`;
  const cache = await getDoc(cacheKey, null);
  if (cache && cache.rows && Date.now() - (cache.fetched_at || 0) < PROJ_TTL_MS) {
    return { rows: cache.rows, status: 'cache' };
  }
  if (cache && cache.failed_at && Date.now() - cache.failed_at < FAIL_TTL_MS) {
    return { rows: cache.rows || null, status: 'stale-after-failure' };
  }
  const base = process.env.SLEEPER_BASE || 'https://api.sleeper.app';
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    let raw;
    try {
      const res = await fetch(`${base}/v1/projections/nfl/regular/${season}/${week}`,
        { headers: { accept: 'application/json' }, signal: ac.signal });
      if (!res.ok) throw new Error(`Sleeper projections ${res.status}`);
      raw = await res.json();
    } finally { clearTimeout(t); }
    const rows = normalizeProjectionPayload(raw);
    if (!rows) throw new Error('empty-projection-payload (rows without points)');
    await setDoc(cacheKey, { fetched_at: Date.now(), rows });
    return { rows, status: 'live' };
  } catch (e) {
    await setDoc(cacheKey, {
      fetched_at: (cache && cache.fetched_at) || 0,
      failed_at: Date.now(), rows: (cache && cache.rows) || null,
    });
    return { rows: (cache && cache.rows) || null,
             status: `fetch-failed: ${e && e.message || e}` };
  }
}

module.exports = {
  METHOD, ARMS, PRIOR_PSEUDO_WEEKS, MIN_REALIZED_ONLY, MIN_PRICED_ROWS,
  playerKey, isPlayerKey, armOfKey, lateCutoffUtc,
  playersPointsFromMatchups, playersPointsForWeek, appearances,
  armOurs, armSleeper, forecastRow, buildWeekForecasts, dedupeAgainstMarker,
  resolvePlayerForecasts, partitionLedger, gradePlayerWeeks,
  normalizeProjectionPayload, fetchWeekProjections,
};
