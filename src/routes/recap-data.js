/* GATHERING FOR THE WEEKLY RECAP.
 *
 * Deliberately its own module rather than a function inside the member router:
 * the commissioner's preview page (admin) and the Tuesday cron (member) both
 * need it, and requiring one router from the other to share a function is how a
 * circular import gets introduced for no reason.
 *
 * The split that matters is the other one: THIS file only reads data. All of the
 * writing lives in src/recap.js, which takes a resolved week and returns prose —
 * so the voice is testable without a network, and "is any of this mean" can be a
 * unit test rather than a screenshot somebody remembers to look at.
 */
'use strict';
const H = require('../helpers');
const RECAP = require('../recap');
const RIV = require('../rivalries');
const H2H = require('./h2h');
const PO = require('./playoffs');
const sleeper = require('../sleeper');

/* THE WEEK, RESOLVED.
 *
 * Gathering only. src/recap.js does the writing, so the prose is testable
 * without a network and the meanness check can be a unit test rather than a
 * screenshot.
 *
 * WHY IT REFUSES RATHER THAN DEGRADES. The recap makes CLAIMS — "X beat Y" is
 * false at 4pm on Sunday and stays false forever once it is in nine inboxes.
 * So every matchup must be final before a word is written, and "not ready" is a
 * reported state the caller can act on, never a half-recap.
 */
async function recapInputs(world, owners, weekNo) {
  const lid = world.config.sleeper_league_id;
  const map = world.config.sleeper_map || {};
  const sData = await sleeper.bundle(lid);
  if (!sData || !Array.isArray(sData.matchups) || !sData.matchups.length) return null;
  const raw = await sleeper.matchupsForWeek(lid, weekNo);
  const rows = Array.isArray(raw) && raw.length ? raw : sData.matchups;
  const playersDb = await sleeper.players();
  const nameOf = rid => {
    const oid = map[String(rid)];
    return (oid != null && (H.ownerById(owners, Number(oid)) || {}).name) || null;
  };
  const pname = pid => (playersDb && playersDb.players && playersDb.players[pid]
    && playersDb.players[pid].name) || String(pid);
  const ppos = pid => (playersDb && playersDb.players && playersDb.players[pid]
    && playersDb.players[pid].pos) || null;

  const side = m => {
    const pts = Object.assign({}, m.players_points || {});
    const startIds = (m.starters || []).filter(id => id && id !== '0');
    const starters = startIds.map(id => ({ id, name: pname(id), pos: ppos(id), points: Number(pts[id] || 0) }));
    const bench = (m.players || []).filter(id => !startIds.includes(id))
      .map(id => ({ id, name: pname(id), pos: ppos(id), points: Number(pts[id] || 0) }));
    // The worst STARTER is the body a benched player would have replaced. Ignore
    // K and DEF: "your kicker scored less than a bench WR" is true every week and
    // means nothing, and a rule that fires every week is not a finding.
    const swappable = starters.filter(p => p.pos && !['K', 'DEF'].includes(p.pos));
    const worstStarter = swappable.length
      ? swappable.reduce((a, b) => (b.points < a.points ? b : a)) : null;
    return {
      roster_id: m.roster_id,
      name: nameOf(m.roster_id) || `Team ${m.roster_id}`,
      points: Number(m.points || 0),
      starters, bench, worstStarter,
      kicker: starters.find(p => p.pos === 'K') || null,
    };
  };

  const byGame = {};
  for (const m of rows) {
    if (m.matchup_id == null) continue;
    (byGame[m.matchup_id] = byGame[m.matchup_id] || []).push(side(m));
  }
  const games = Object.values(byGame).filter(p => p.length === 2).map(([a, b]) => {
    const [w, l] = a.points >= b.points ? [a, b] : [b, a];
    return { winner: w, loser: l, margin: Math.round((w.points - l.points) * 10) / 10,
             // A finished week has every team on the board. A zero total is either
             // a week that has not been played or a roster nobody set, and neither
             // is something to write a story about.
             final: a.points > 0 && b.points > 0 };
  });
  if (!games.length) return null;

  const ranked = Object.values(byGame).flat()
    .map(s => ({ name: s.name, points: s.points }))
    .sort((a, b) => b.points - a.points);

  // STREAKS, from the per-week results this season. weekPointsByOwner caches a
  // finished week forever, so this is one fetch per NEW week, not per render.
  const seq = {};
  for (let w = 1; w <= weekNo; w++) {
    const pts = await sleeper.weekPointsByOwner(lid, w, map);
    if (!pts) continue;
    const wkRows = await sleeper.matchupsForWeek(lid, w);
    if (!Array.isArray(wkRows)) continue;
    const pairs = {};
    for (const m of wkRows) { if (m.matchup_id != null) (pairs[m.matchup_id] = pairs[m.matchup_id] || []).push(m); }
    for (const pair of Object.values(pairs)) {
      if (pair.length !== 2) continue;
      const [x, y] = pair;
      if (!(x.points > 0 || y.points > 0)) continue;
      const xn = nameOf(x.roster_id), yn = nameOf(y.roster_id);
      if (xn) (seq[xn] = seq[xn] || []).push(x.points >= y.points ? 'W' : 'L');
      if (yn) (seq[yn] = seq[yn] || []).push(y.points >= x.points ? 'W' : 'L');
    }
  }
  const streaks = Object.entries(seq).map(([name, r]) => {
    let n = 0; const kind = r[r.length - 1];
    for (let i = r.length - 1; i >= 0 && r[i] === kind; i--) n++;
    return { name, kind, length: n };
  }).filter(s => s.length >= 3).sort((a, b) => b.length - a.length).slice(0, 3);

  // PLAYOFF ODDS — the same estimator the standings fold in, not a second one.
  let playoff = null, playoffCutUsed = null;
  try {
    const rosterRows = (sData.rosters || []).map(r => ({
      owner_id: map[String(r.roster_id)],
      name: nameOf(r.roster_id),
      wins: (r.settings || {}).wins || 0, losses: (r.settings || {}).losses || 0,
      pf: (r.settings || {}).fpts || 0,
    })).filter(r => r.name && (r.wins + r.losses) > 0);
    if (rosterRows.length >= 4) {
      const regWeeks = ((sData.league.settings || {}).playoff_week_start || 15) - 1;
      // THE SAME CUT THE SITE USES. This was a hardcoded 6 while every page
      // used playoff_teams || 4, so the email reported a playoff picture nobody
      // could reproduce on the site it links to.
      const cut = PO.playoffCut(sData.league);
      playoffCutUsed = cut;
      const odds = PO.simOdds(rosterRows, PO.gamesRemaining(weekNo, regWeeks), cut);
      playoff = rosterRows.map(r => ({ name: r.name,
        odds: Math.round(100 * (odds[r.owner_id] != null ? odds[r.owner_id] : 0)) }));
    }
  } catch (e) { /* the playoff line is a bonus; the recap goes without it */ }

  // The rivalry billing for THIS slate — reuse the module the home page uses.
  let rivalry = null;
  try {
    const pairs = games.map(g => ({ a: g.winner.name, b: g.loser.name }));
    const hits = RIV.billingForSlate(pairs);
    if (hits.length) {
      const rec = H2H.headToHead(H2H.userIdForName(hits[0].pair.a), H2H.userIdForName(hits[0].pair.b));
      rivalry = Object.assign({}, hits[0], { notable: RIV.notableFrom(rec, hits[0].pair.a, hits[0].pair.b) });
    }
  } catch (e) { /* billing is a bonus */ }

  return { games, ranked, streaks, playoff, rivalry, cut: playoffCutUsed };
}

async function buildWeeklyRecap(world, owners, weekNo, season) {
  const input = await recapInputs(world, owners, weekNo);
  if (!input) return { ready: false, reason: 'no-live-data' };
  return RECAP.buildRecap(Object.assign({ season, week: weekNo }, input));
}


module.exports = { recapInputs, buildWeeklyRecap, toText: RECAP.toText };
