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

/* ── THE SOURCE SWITCH (Cory, 2026-08-16: "Make a way for me to easily switch
 * between models in the site!") ──────────────────────────────────────────────
 *
 * The board carries THREE season totals per player (proj_mean = the blend the
 * tools have always used, proj_sleeper, proj_fantasypros), all scored under the
 * one scoring table at build time. The switch chooses which of them this feed's
 * season rate derives from — set on /admin/model-scoreboard, stored in the
 * `model_controls` league doc, read here and NOWHERE ELSE, so every consumer of
 * the feed changes together. Default 'blend' IS current behavior. The basis
 * string always names the source, so a January read can tell which regime
 * priced any given week.
 *
 * What this deliberately is NOT: a switch of the draft board's proj_mean
 * composition (REC-2 blocks that until the January 2027 grade) and not a live
 * weekly provider feed — every option here is a season-total rate; true weekly
 * provider numbers exist only in the Thursday archive, where they are GRADED
 * (draft/weekly_own_grade.py) so this switch can one day be flipped on
 * evidence instead of vibes.
 */
var PROJ_SOURCES = ['blend', 'sleeper', 'fantasypros', 'sleeper_fp_average'];

/* The validated source out of a model_controls doc (or anything else).
 * Unknown/absent -> 'blend', the default, out loud rather than by accident. */
function sourceFromControls(doc) {
  const s = doc && doc.projection_source;
  return PROJ_SOURCES.indexOf(s) >= 0 ? s : 'blend';
}

/* The season total a source assigns this player: { value, from }. `from` names
 * the actual field(s) used, because sleeper_fp_average degrades honestly: both
 * present -> their mean; one present -> that one, SAYING SO; none -> absent. */
function seasonTotal(player, source) {
  if (source === 'sleeper') {
    return { value: player.proj_sleeper == null ? null : Number(player.proj_sleeper),
      from: 'proj_sleeper' };
  }
  if (source === 'fantasypros') {
    return { value: player.proj_fantasypros == null ? null : Number(player.proj_fantasypros),
      from: 'proj_fantasypros' };
  }
  if (source === 'sleeper_fp_average') {
    const s = player.proj_sleeper == null ? null : Number(player.proj_sleeper);
    const f = player.proj_fantasypros == null ? null : Number(player.proj_fantasypros);
    if (s != null && f != null) return { value: (s + f) / 2, from: 'avg(proj_sleeper,proj_fantasypros)' };
    if (s != null) return { value: s, from: 'avg:proj_sleeper_only' };
    if (f != null) return { value: f, from: 'avg:proj_fantasypros_only' };
    return { value: null, from: 'avg(proj_sleeper,proj_fantasypros)' };
  }
  return { value: player.proj_mean == null ? null : Number(player.proj_mean),
    from: 'proj_mean' };
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
  const st = seasonTotal(player, sourceFromControls({ projection_source: o.source }));
  if (st.value == null) {
    // NOT ZERO. A player the board has no projection for is unknown, and a zero
    // here would seat everyone else ahead of him for a reason the board never
    // stated. absent-is-not-zero, which this project has now been bitten by
    // three times.
    return { proj: null, basis: 'absent', zeroed_because: null };
  }
  return {
    proj: Math.round((st.value / PROJ_GAMES) * 100) / 100,
    basis: 'season_rate:' + st.from + '/' + PROJ_GAMES,
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
    // The regime that priced this feed — set on /admin/model-scoreboard,
    // stamped here so a January read never has to guess which switch was live.
    source: sourceFromControls({ projection_source: o.source }),
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

module.exports = { PROJ_GAMES, CANNOT_PLAY, PROJ_SOURCES, sourceFromControls,
  seasonTotal, weekly, buildFeed, rosterProjections, matchupGap };
