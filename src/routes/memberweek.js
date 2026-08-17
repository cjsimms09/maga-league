'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// MEMBER WEEK ENGINE — the member-site design pass (2026-08-16).
//
// Three jobs, all league-visible (results and Sleeper-derived numbers only —
// ACCESS-RULE.md; the commissioner's model never enters this file):
//
//   1. TUESDAY PREVIEWS — the auto-preview facts for any pairing: all-time
//      record, current streak, last meeting, playoff meetings. Read from the
//      same box-score archive /rivalry reads (h2h.js), by name, so it works
//      offline and pre-season.
//
//   2. WEEK NAVIGATION — any past week's slate from the docs the app already
//      freezes (pickem-slate + pickem-points/weekpoints), and the UPCOMING
//      schedule from a cached schedule doc refreshed best-effort off Sleeper's
//      future-week matchups. When neither source knows a week, the surface
//      says so — never a guessed pairing.
//
//   3. SLEEPER-FED WIN ODDS — the member-facing win-odds line. Cory, verbatim:
//      "their odds of winning this week (sleeper info only, not our model for
//      anyone but me)". So the mean is `proj_sleeper` — Sleeper's OWN season
//      projection on the board artifact, scored under league scoring — and
//      NEVER `proj_mean` (which carries our opportunity adjustment) and NEVER
//      `proj_ownmodel` (the commissioner's model). The probability core is the
//      /watch panel's mechanism reused verbatim: LO.pWin over Normal sums,
//      position sigmas from realized league history (whatwatch's own core).
//      Positions Sleeper does not project (K/DEF on the real board) are
//      excluded from BOTH sides symmetrically and the surface says so; a
//      skill-position starter with no Sleeper number REFUSES the odds rather
//      than fabricating a zero (absent is not zero — the no-manufactured-odds
//      rule).
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const H2H = require('./h2h');
const PF = require('../proj_feed');
const LO = require('./lineup');
const WW = require('./whatwatch');
const { getDoc, setDoc } = require('../data');

const r1 = n => Math.round(Number(n) * 10) / 10;

/* ══ 1. TUESDAY PREVIEWS ════════════════════════════════════════════════════
 * The facts for one pairing, neutral voice (the scoreboard shows every game,
 * so "you" is the wrong subject here — names only).
 * Returns null when either owner can't be placed in the archive: a lookup
 * failure is not a record of no meetings (h2h.js's own rule, kept).
 */
function previewFor(aName, bName, dataOrNull) {
  const ua = H2H.userIdForName(aName), ub = H2H.userIdForName(bName);
  if (!ua || !ub) return null;
  const r = H2H.headToHead(ua, ub, dataOrNull);
  if (!r || !r.played) {
    return { played: 0, lead: null, leadLine: `First meeting on record — the box scores start in 2023.`,
      streak: null, streakLine: null, last: null, lastLine: null, playoffs: 0 };
  }
  const leadWho = r.a.wins > r.b.wins ? aName : (r.b.wins > r.a.wins ? bName : null);
  const rec = leadWho === bName
    ? `${r.b.wins}–${r.a.wins}${r.ties ? '–' + r.ties : ''}`
    : `${r.a.wins}–${r.b.wins}${r.ties ? '–' + r.ties : ''}`;
  const leadLine = leadWho ? `${leadWho} leads ${rec} all-time` : `All square ${rec} all-time`;
  const streak = r.streak ? { who: r.streak.who === 'a' ? aName : bName, n: r.streak.n } : null;
  const streakLine = streak && streak.n >= 2 ? `${streak.who} has won ${streak.n} straight` : null;
  const g = r.lastMeeting;
  const last = g ? {
    season: g.season, week: g.week,
    winner: g.winner === 'a' ? aName : (g.winner === 'b' ? bName : null),
    winnerPts: g.winner === 'b' ? g.b : g.a,
    loserPts: g.winner === 'b' ? g.a : g.b,
    margin: g.margin, playoff: !!g.playoff,
  } : null;
  const lastLine = last ? (last.winner
    ? `last meeting: ${last.winner} won ${last.winnerPts.toFixed(1)}–${last.loserPts.toFixed(1)} (${last.season} wk${last.week}${last.playoff ? ', playoffs' : ''})`
    : `last meeting: a ${last.winnerPts.toFixed(1)}–${last.loserPts.toFixed(1)} tie (${last.season} wk${last.week})`) : null;
  return { played: r.played, lead: leadWho, leadLine, streak, streakLine, last, lastLine,
    playoffs: r.playoffs, record: rec };
}

/* ══ 2. WEEK NAVIGATION ═════════════════════════════════════════════════════ */

/** A PAST week's slate + scores, from the frozen docs. Null when the slate was
 *  never frozen (the honest "we didn't see that week" answer). */
async function pastWeek(seasonYear, leagueId, week) {
  const slate = await getDoc(`pickem-slate:${seasonYear}:${week}`, null);
  if (!slate || !Array.isArray(slate.games) || !slate.games.length) return null;
  let points = await getDoc(`pickem-points:${seasonYear}:${week}`, null);
  if (!points || !Object.keys(points).length) {
    const wp = await getDoc(`weekpoints:${leagueId}:${week}`, null);
    points = (wp && wp.points) || null;
  }
  const games = slate.games.map(g => {
    const aPts = points && points[String(g.a.id)] != null ? Number(points[String(g.a.id)]) : null;
    const bPts = points && points[String(g.b.id)] != null ? Number(points[String(g.b.id)]) : null;
    const winnerId = (aPts != null && bPts != null && aPts !== bPts)
      ? (aPts > bPts ? g.a.id : g.b.id) : null;
    return { id: g.id, a: g.a, b: g.b, aPts, bPts, winnerId };
  });
  return { week: Number(week), games, final: !!points };
}

/* THE UPCOMING SCHEDULE. Sleeper posts every regular-season week's pairings up
 * front (future weeks come back with zero points), so one sweep caches the
 * whole season under `schedule:<league>:<season>` and a stale-friendly TTL —
 * pairings only change on a mid-season league edit, which the weekly refresh
 * would pick up. When Sleeper is unreachable AND no doc exists, the answer is
 * null and the surface says "not posted yet" — never an invented pairing. */
const SCHEDULE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEDULE_FAIL_TTL_MS = 6 * 60 * 60 * 1000;

async function futureSchedule(leagueId, seasonYear, curWeek, regWeeks, opts = {}) {
  if (!leagueId) return null;
  const key = `schedule:${leagueId}:${seasonYear}`;
  const doc = await getDoc(key, null);
  const fresh = doc && doc.fetched_at && (Date.now() - doc.fetched_at < SCHEDULE_TTL_MS);
  // A recent failed refresh also short-circuits: without this, every page load
  // in an outage pays one fetch timeout per remaining week — the exact failure
  // mode sleeper.bundle's negative cache exists to prevent.
  const recentlyFailed = doc && doc.failed_at && (Date.now() - doc.failed_at < SCHEDULE_FAIL_TTL_MS);
  if (fresh || recentlyFailed || opts.noFetch) return doc || null;
  // Refresh best-effort. `fetchWeek` is injectable for tests; default is the
  // live matchups endpoint (already null-safe on failure). The FIRST dead week
  // aborts the whole sweep — one timeout, not one per week.
  const fetchWeek = opts.fetchWeek || (w => require('../sleeper').matchupsForWeek(leagueId, w));
  const mapOwner = opts.rosterToOwner || (() => null);
  const weeks = {};
  let any = false;
  for (let w = Math.max(1, Number(curWeek) || 1) + 1; w <= (Number(regWeeks) || 14); w++) {
    let rows = null;
    try { rows = await fetchWeek(w); } catch (e) { rows = null; }
    if (!Array.isArray(rows) || !rows.length) break;   // unreachable/unposted → stop paying timeouts
    const byMatch = {};
    for (const m of rows) {
      if (m.matchup_id == null) continue;
      (byMatch[m.matchup_id] ??= []).push(m.roster_id);
    }
    const pairs = [];
    for (const pair of Object.values(byMatch)) {
      if (pair.length !== 2) continue;
      const a = mapOwner(pair[0]), b = mapOwner(pair[1]);
      if (a == null || b == null) continue;
      pairs.push([a, b]);
    }
    if (pairs.length) { weeks[w] = pairs; any = true; }
  }
  if (!any) {
    // Remember the failure (keeping any last-known schedule) so the next
    // render serves the doc instead of re-paying the timeout.
    try {
      await setDoc(key, Object.assign({}, doc || {}, { failed_at: Date.now() }));
    } catch (e) { /* best-effort */ }
    return doc || null;
  }
  const fresh_doc = { fetched_at: Date.now(), season: String(seasonYear), weeks };
  try { await setDoc(key, fresh_doc); } catch (e) { /* cache is best-effort */ }
  return fresh_doc;
}

/** One owner's season, week by week: past results (frozen docs), the current
 *  live week, and future opponents (schedule doc). Weeks nobody can vouch for
 *  come back with `known: false` — rendered as honest gaps, never guessed.
 *  @returns [{ week, oppId, oppName, myPts, oppPts, result: 'W'|'L'|'T'|null,
 *              state: 'past'|'current'|'future', known }]
 */
async function ownerSeason(ownerId, ctx) {
  const { seasonYear, leagueId, curWeek, regWeeks, nameOf, currentOppId, scheduleDoc } = ctx;
  const rows = [];
  for (let w = 1; w <= regWeeks; w++) {
    if (w < curWeek) {
      const pw = await pastWeek(seasonYear, leagueId, w);
      const g = pw && pw.games.find(x => x.a.id === ownerId || x.b.id === ownerId);
      if (!g) { rows.push({ week: w, state: 'past', known: false }); continue; }
      const mine = g.a.id === ownerId ? 'a' : 'b';
      const myPts = mine === 'a' ? g.aPts : g.bPts;
      const oppPts = mine === 'a' ? g.bPts : g.aPts;
      const opp = mine === 'a' ? g.b : g.a;
      const result = (myPts == null || oppPts == null) ? null
        : (myPts > oppPts ? 'W' : myPts < oppPts ? 'L' : 'T');
      rows.push({ week: w, state: 'past', known: true, oppId: opp.id,
        oppName: opp.name || nameOf(opp.id), myPts, oppPts, result });
    } else if (w === curWeek) {
      rows.push({ week: w, state: 'current', known: currentOppId != null,
        oppId: currentOppId ?? null,
        oppName: currentOppId != null ? nameOf(currentOppId) : null,
        myPts: null, oppPts: null, result: null });
    } else {
      const pairs = scheduleDoc && scheduleDoc.weeks && scheduleDoc.weeks[String(w)];
      const pair = (pairs || []).find(p => Number(p[0]) === Number(ownerId) || Number(p[1]) === Number(ownerId));
      if (!pair) { rows.push({ week: w, state: 'future', known: false }); continue; }
      const oppId = Number(pair[0]) === Number(ownerId) ? Number(pair[1]) : Number(pair[0]);
      rows.push({ week: w, state: 'future', known: true, oppId, oppName: nameOf(oppId),
        myPts: null, oppPts: null, result: null });
    }
  }
  return rows;
}

/* ══ 3. SLEEPER-FED WIN ODDS ════════════════════════════════════════════════ */

/* The board artifact, read once per process (same DRAFT_DATA_PATH test hook the
 * waiver tool uses, same defensive shape). */
let _artifact;
function boardArtifact() {
  if (_artifact !== undefined) return _artifact;
  try {
    _artifact = JSON.parse(fs.readFileSync(
      process.env.DRAFT_DATA_PATH
        || path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  } catch (e) { _artifact = null; }
  return _artifact;
}
// Test hook: the artifact is cached for the process; tests that swap
// DRAFT_DATA_PATH mid-run reset the cache through this.
function _resetArtifactCache() { _artifact = undefined; }

/** One player's weekly number from SLEEPER'S OWN projection. Reuses
 *  proj_feed's zeroing ladder (bye/OUT → 0, absent → null) by shimming the one
 *  field it reads, then labels the basis truthfully. */
function sleeperWeekly(player, opts) {
  if (!player) return null;
  const w = PF.weekly(Object.assign({}, player, { proj_mean: player.proj_sleeper }), opts);
  if (!w) return null;
  if (w.basis && w.basis.indexOf('season_rate') === 0) w.basis = 'season_rate:proj_sleeper/' + PF.PROJ_GAMES;
  return w;
}

/** Positions the board projects with Sleeper numbers at all. Data-derived so a
 *  future board that DOES project K/DEF stops excluding them by itself. */
function sleeperProjectedPositions(artifact) {
  const have = new Set();
  for (const p of ((artifact && artifact.players) || [])) {
    if (p && p.proj_sleeper != null && p.position) have.add(String(p.position));
  }
  return have;
}

/**
 * The member win-odds for one matchup, pre-kick.
 * @param myIds/oppIds  starter player_id arrays (Sleeper ids, from the bundle)
 * @param opts.week     current week (bye zeroing)
 * @param opts.artifact injectable board (tests); default the shipped artifact
 * @returns { ok, pWin, my, opp, excluded:[pos], basis } |
 *          { ok:false, why }  — refusal, never a guessed number
 */
function matchupOdds(myIds, oppIds, opts = {}) {
  const artifact = opts.artifact !== undefined ? opts.artifact : boardArtifact();
  if (!artifact || !Array.isArray(artifact.players) || !artifact.players.length) {
    return { ok: false, why: 'no board artifact' };
  }
  if (!Array.isArray(myIds) || !myIds.length || !Array.isArray(oppIds) || !oppIds.length) {
    return { ok: false, why: 'starters not posted' };
  }
  const byId = {};
  for (const p of artifact.players) if (p && p.player_id != null) byId[String(p.player_id)] = p;
  const projected = sleeperProjectedPositions(artifact);
  const sigmaByPos = opts.sigmaByPos || LO.positionSigmas();
  const sd = pos => Number(sigmaByPos && sigmaByPos[pos]) || WW.CFG.DEFAULT_SD;

  const excluded = new Set();
  const side = ids => {
    let mean = 0, varc = 0, priced = 0;
    for (const rawId of ids) {
      const id = String(rawId);
      if (!id || id === '0') continue;               // empty slot — scores zero either way
      const p = byId[id];
      if (!p) return { refuse: `starter ${id} is not on the board` };
      const pos = String(p.position || '');
      if (!projected.has(pos)) { excluded.add(pos); continue; }   // symmetric by construction
      const w = sleeperWeekly(p, { week: opts.week });
      if (!w || w.proj == null) return { refuse: `${p.name || id} has no Sleeper projection` };
      mean += w.proj;
      if (w.basis !== 'zeroed') { const s = sd(pos); varc += s * s; }
      priced++;
    }
    if (!priced) return { refuse: 'no priced starters' };
    return { mean, varc, priced };
  };
  const mine = side(myIds);
  if (mine.refuse) return { ok: false, why: mine.refuse };
  const theirs = side(oppIds);
  if (theirs.refuse) return { ok: false, why: theirs.refuse };
  return {
    ok: true,
    pWin: LO.pWin(mine.mean, mine.varc, theirs.mean, theirs.varc),
    my: r1(mine.mean), opp: r1(theirs.mean),
    excluded: [...excluded].sort(),
    basis: 'sleeper:season_rate/' + PF.PROJ_GAMES,
  };
}

module.exports = {
  previewFor,
  pastWeek, futureSchedule, ownerSeason, SCHEDULE_TTL_MS,
  sleeperWeekly, sleeperProjectedPositions, matchupOdds,
  boardArtifact, _resetArtifactCache,
};
