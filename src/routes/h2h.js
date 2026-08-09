'use strict';
//
// HEAD-TO-HEAD — the all-time record between two owners, from the box scores.
//
// The matchup page answers "who am I playing this week" and then the question
// everyone actually argues about in the group chat: "what's our record?" This
// module answers it from the same harvest the History page reads — every
// regular-season and playoff game two owners ever played against each other,
// 2023-25 (the Sleeper era; the master sheet before that has money, not game
// pairings, so honest H2H starts where the box scores start).
//
// SOURCE (read-only — Session A's territory, we only read, same as history-data):
//   draft/data/league_history.json — full box scores, seasons keyed by week.
//
// Two team-week rows in the same week that share a `matchup_id` are opponents.
// The join key ACROSS seasons is the Sleeper `user_id`, never `roster_id`:
// roster_id is reassigned every season, user_id is the person. The route hands
// this module the two user_ids (resolved from the live Sleeper bundle); the
// module stays pure over the harvest so it is trivially testable.

const fs = require('fs');
const path = require('path');

// Mirror history-data's findFile: the function bundle may land the repo at the
// root, at cwd, or under /var/task in a deployed function.
function findFile(rel) {
  const roots = [
    path.join(__dirname, '..', '..'),
    process.cwd(),
    '/var/task',
    path.join(__dirname, '..', '..', '..', '..'),
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    try { if (fs.existsSync(p)) return p; } catch (e) { /* keep looking */ }
  }
  return path.join(roots[0], rel);
}

let _harvest = null;
function harvest() {
  if (_harvest) return _harvest;
  _harvest = JSON.parse(fs.readFileSync(findFile('draft/data/league_history.json'), 'utf8'));
  return _harvest;
}

const r2 = n => Math.round(n * 100) / 100;
const PLAYOFF_START = 16;   // weeks 16+ are the bracket in this league

/**
 * Every game owner A ever played against owner B, most-recent first, plus the
 * tallies the page wants to show. Pure over `data` so a test can pass a fixture.
 *
 * @param dataOrNull  the harvest object; defaults to the committed file
 * @param uidA        Sleeper user_id for the "A" side (usually the viewer)
 * @param uidB        Sleeper user_id for the opponent
 */
function headToHead(uidA, uidB, dataOrNull) {
  const data = dataOrNull || harvest();
  uidA = String(uidA); uidB = String(uidB);
  const games = [];
  if (!data || !Array.isArray(data.seasons) || uidA === uidB || !uidA || !uidB) {
    return summarize(games);
  }

  for (const s of data.seasons) {
    if (!s.weeks) continue;
    // roster_id -> user_id, for THIS season only (roster_id is not stable).
    const r2u = {};
    for (const [rid, o] of Object.entries(s.owners || {})) r2u[rid] = String(o.user_id);

    for (const [wk, rows] of Object.entries(s.weeks)) {
      if (!Array.isArray(rows)) continue;
      const ra = rows.find(r => r2u[r.roster_id] === uidA);
      const rb = rows.find(r => r2u[r.roster_id] === uidB);
      // Same week, same matchup_id => they actually played each other. A shared
      // null matchup_id (a bye, or a week with no bracket game) is not a game.
      if (!ra || !rb) continue;
      if (ra.matchup_id == null || ra.matchup_id !== rb.matchup_id) continue;

      const pa = Number(ra.points) || 0;
      const pb = Number(rb.points) || 0;
      games.push({
        season: String(s.season),
        week: Number(wk),
        playoff: Number(wk) >= PLAYOFF_START,
        a: r2(pa),
        b: r2(pb),
        margin: r2(Math.abs(pa - pb)),
        winner: pa > pb ? 'a' : (pb > pa ? 'b' : 'tie'),
      });
    }
  }

  // Most-recent first: by season desc, then week desc.
  games.sort((x, y) => (x.season === y.season ? y.week - x.week : Number(y.season) - Number(x.season)));
  return summarize(games);
}

function summarize(games) {
  let aWins = 0, bWins = 0, ties = 0, aPts = 0, bPts = 0;
  let aBig = null, bBig = null;   // biggest win each way
  for (const g of games) {
    aPts += g.a; bPts += g.b;
    if (g.winner === 'a') { aWins++; if (!aBig || g.margin > aBig.margin) aBig = g; }
    else if (g.winner === 'b') { bWins++; if (!bBig || g.margin > bBig.margin) bBig = g; }
    else ties++;
  }
  const played = games.length;

  // Current streak, walking from the most recent game backward. A tie ends it.
  let streak = null;
  if (played) {
    const who = games[0].winner;
    if (who !== 'tie') {
      let n = 0;
      for (const g of games) { if (g.winner === who) n++; else break; }
      streak = { who, n };
    }
  }

  return {
    played,
    a: { wins: aWins, pointsFor: r2(aPts), avg: played ? r2(aPts / played) : 0, biggest: aBig },
    b: { wins: bWins, pointsFor: r2(bPts), avg: played ? r2(bPts / played) : 0, biggest: bBig },
    ties,
    games,
    lastMeeting: games[0] || null,
    streak,
    firstSeason: played ? games[games.length - 1].season : null,
    lastSeason: played ? games[0].season : null,
    // A one-line record from A's point of view: "4-3" or "4-3-1".
    record: `${aWins}-${bWins}${ties ? '-' + ties : ''}`,
  };
}

// Real first name (as world.owners stores it) -> Sleeper handle. Same table
// history-data keys on, in the one direction the matchup page needs. Zero owner
// turnover across the Sleeper era, so this is stable.
const NAME_TO_HANDLE = {
  Cory: 'coryjsimms', David: 'ds7mmet', Michael: 'mhagen', Jeremy: 'Jreis',
  Justin: 'cashworth', Dylan: 'Schmelley', Sam: 'Sadbru', Bates: 'B8T3S',
  Marian: 'MarianSaar', Richard: 'Richard2121',
};

// handle (== harvest display_name) -> user_id, unioned across every season.
let _byHandle = null;
function handleUserIds() {
  if (_byHandle) return _byHandle;
  _byHandle = {};
  const data = harvest();
  for (const s of (data.seasons || [])) {
    for (const o of Object.values(s.owners || {})) {
      if (o.display_name && o.user_id) _byHandle[o.display_name] = String(o.user_id);
    }
  }
  return _byHandle;
}

/**
 * Sleeper user_id for a league owner, OFFLINE — the fallback the route uses when
 * the live Sleeper bundle is unreachable (sandbox, pre-season, or an outage).
 * When the bundle IS live, the route prefers its userMap, which is authoritative.
 */
function userIdForName(name, alias) {
  const byHandle = handleUserIds();
  for (const n of [name, alias]) {
    const handle = NAME_TO_HANDLE[n];
    if (handle && byHandle[handle]) return byHandle[handle];
  }
  return null;
}

module.exports = { headToHead, userIdForName, handleUserIds, NAME_TO_HANDLE, _harvest: harvest };
