// TERRITORY: A
/* PER-PLAYER WEEKLY PROJECTIONS — the feed the matchup gap is built around.
 *
 * THE GAP, MEASURED. `src/routes/lineup.js` declares its input as
 * `roster [{ id, name, pos, proj }]` and says "live projections come from
 * sleeper.js (A's lane) at request time". SLEEPER.JS HAS NO SUCH PRODUCER. Its
 * exports are `weekStats` and `seasonStats` — REALIZED points — and `rosterView`
 * returns `wkPts` / `seasonPts`, which are what already happened. There is no
 * forward per-player number anywhere on the server, so the `proj` field in B's
 * contract has never had a source.
 *
 * ── WHERE THE NUMBER COMES FROM, AND WHY NOT FROM SLEEPER DIRECTLY ──────────
 *
 * Sleeper does publish weekly projections and the URL shapes are known and
 * verified (draft/sleeper_import.py:_PROJECTION_PATHS). Consuming them here
 * would mean scoring raw stat lines under OUR scoring table IN JAVASCRIPT —
 * a second implementation of `score_stat_line`, which is the two-places disease
 * this project has now found ten times, on the one calculation where a silent
 * divergence would be invisible (both sides produce plausible points).
 *
 * SO THE FEED READS THE BOARD. `public/draft_data.json` carries `proj_mean` per
 * player, already scored under our exact table by `score_stat_line` at build
 * time, rebuilt nightly. One scorer, one source of truth.
 *
 * THE COST OF THAT CHOICE, STATED RATHER THAN HIDDEN: `proj_mean` is a SEASON
 * total, so the weekly number is a season RATE — it knows nothing about this
 * week's opponent, weather or usage trend. It is a level, not a forecast. Every
 * row therefore carries `basis`, and B's surface must show it, because "a
 * projection" and "a season average" are different claims and a gap computed
 * from the second must not be read as the first.
 *
 * That is an honest input for a matchup gap and a poor one for a start/sit call
 * between two close players. Upgrading the basis later changes `basis` and
 * nothing else in the shape — which is the reason `basis` exists now rather
 * than being added when it matters.
 *
 * ── THE DIVISOR IS 17, AND IT IS NOT games_expected ─────────────────────────
 *
 * Reconciled against the box-score archive: `proj_mean` is a season total over
 * the 17-game season. Per-player `games_expected` is points per game PLAYED,
 * which is a different denominator; dividing by it inflates every part-season
 * player. Same constant the weekly snapshot uses.
 *
 * ── AND A PLAYER WHO CANNOT PLAY PROJECTS ZERO, NOT null ────────────────────
 *
 * lineup.js's solver has a dormant bye guard that only activates when a
 * non-playing player carries no projection. A null there is not "unknown", it
 * is "the solver may seat him on a Sunday he is not playing" — the 540-week
 * sweep's finding. So bye and OUT are zeroed HERE, at the feed, with the reason
 * recorded per row.
 */
'use strict';

const PROJ_GAMES = 17;

/* Statuses that mean the player cannot score this week. `QUESTIONABLE` is
 * deliberately NOT here: a game-time decision still has an expectation, and
 * zeroing him would be a lineup decision made by the feed. */
const CANNOT_PLAY = ['Out', 'IR', 'Doubtful', 'PUP', 'Sus', 'NA', 'DNR'];

function reason(row, week, byeOf) {
  const bye = byeOf ? byeOf(row) : (row.bye == null ? null : Number(row.bye));
  if (week != null && bye != null && Number(bye) === Number(week)) return 'bye';
  const st = row.injury_status == null ? null : String(row.injury_status);
  if (st && CANNOT_PLAY.indexOf(st) >= 0) return 'injury:' + st;
  return null;
}

/* ONE PLAYER'S WEEKLY NUMBER.
 *
 * Returns { proj, basis, zeroed_because } — never a bare number, because a bare
 * number cannot say whether it is a projection, a season rate, or a zero that
 * means "not playing" rather than "worth nothing".
 */
function weekly(player, opts) {
  const o = opts || {};
  if (!player) return null;
  const why = reason(player, o.week, o.byeOf);
  if (why) return { proj: 0, basis: 'zeroed', zeroed_because: why };
  const season = player.proj_mean;
  if (season == null) {
    // NOT ZERO. A player the board has no projection for is unknown, and a zero
    // here would seat everyone else ahead of him for a reason the board never
    // stated. absent-is-not-zero, which this project has now been bitten by
    // three times.
    return { proj: null, basis: 'absent', zeroed_because: null };
  }
  return {
    proj: Math.round((Number(season) / PROJ_GAMES) * 100) / 100,
    basis: 'season_rate:proj_mean/' + PROJ_GAMES,
    zeroed_because: null,
  };
}

/* THE FEED: sleeper player_id -> weekly row, for every player on the board.
 *
 * Keyed on Sleeper's id because that is what every roster on the server side
 * carries — `rosterView` builds rows from `roster.players`, which are Sleeper
 * ids. A feed keyed on anything else would need a crosswalk at every call site,
 * which is where a join silently drops rows.
 */
function buildFeed(players, opts) {
  const o = opts || {};
  const out = {};
  let priced = 0, zeroed = 0, absent = 0;
  (players || []).forEach(p => {
    if (!p || p.player_id == null) return;
    const w = weekly(p, o);
    if (!w) return;
    out[String(p.player_id)] = Object.assign({
      name: p.name == null ? null : String(p.name),
      position: p.position == null ? null : String(p.position),
      team: p.team == null ? null : String(p.team),
    }, w);
    if (w.basis === 'zeroed') zeroed++;
    else if (w.basis === 'absent') absent++;
    else priced++;
  });
  return {
    week: o.week == null ? null : Number(o.week),
    season: o.season == null ? null : String(o.season),
    // COVERAGE IS FIRST-CLASS, not a log line. A feed that prices 40 of 1760 is
    // well-formed and useless, and the caller cannot tell without this.
    coverage: { priced: priced, zeroed: zeroed, absent: absent,
      total: priced + zeroed + absent },
    // The stamp that makes a January read honest about what it is reading.
    built_from: o.built_from == null ? null : String(o.built_from),
    players: out,
  };
}

/* A ROSTER IN lineup.js's SHAPE: [{ id, name, pos, proj }].
 *
 * The join is here rather than at the call site so there is exactly one place
 * where a Sleeper id fails to find a board row — and it REPORTS the misses
 * instead of dropping them, because a roster silently short two players
 * produces a matchup gap that looks precise and is wrong.
 */
function rosterProjections(sleeperIds, feed) {
  const f = (feed && feed.players) || {};
  const rows = [], missing = [];
  (sleeperIds || []).forEach(id => {
    const r = f[String(id)];
    if (!r) { missing.push(String(id)); return; }
    rows.push({ id: String(id), name: r.name, pos: r.position, proj: r.proj,
      basis: r.basis, zeroed_because: r.zeroed_because });
  });
  return { rows: rows, missing: missing };
}

/* THE MATCHUP GAP — my projected total against theirs.
 *
 * REFUSES on an incomplete side rather than returning a confident number. A gap
 * computed from a roster missing two starters is not a smaller gap, it is a
 * different quantity, and it is indistinguishable from a real one on screen.
 */
function matchupGap(mine, theirs) {
  const sum = side => (side.rows || []).reduce(
    (s, r) => s + (r.proj == null ? 0 : Number(r.proj)), 0);
  const unpriced = side => (side.rows || []).filter(r => r.proj == null).length;
  const bad = [];
  if ((mine.missing || []).length) bad.push(`mine: ${mine.missing.length} not on the board`);
  if ((theirs.missing || []).length) bad.push(`theirs: ${theirs.missing.length} not on the board`);
  if (unpriced(mine)) bad.push(`mine: ${unpriced(mine)} with no projection`);
  if (unpriced(theirs)) bad.push(`theirs: ${unpriced(theirs)} with no projection`);
  if (bad.length) {
    return { ok: false, why: 'incomplete roster — ' + bad.join('; ')
      + '. A gap computed from a partial side reads exactly like a real one.' };
  }
  const a = Math.round(sum(mine) * 100) / 100;
  const b = Math.round(sum(theirs) * 100) / 100;
  return {
    ok: true, mine: a, theirs: b, gap: Math.round((a - b) * 100) / 100,
    basis: 'season_rate — a LEVEL, not a weekly forecast. It knows nothing about '
      + 'this week\'s opponent, weather or usage.',
  };
}

module.exports = { PROJ_GAMES, CANNOT_PLAY, weekly, buildFeed, rosterProjections, matchupGap };
