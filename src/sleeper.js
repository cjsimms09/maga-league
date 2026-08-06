// Sleeper's public read-only API (no key required): https://docs.sleeper.com
// Everything here fails soft — the site must work fine when Sleeper is
// unreachable or unconfigured. Base URL is overridable for tests.
const { getDoc, setDoc, now } = require('./data');

const BASE = process.env.SLEEPER_BASE || 'https://api.sleeper.app';
const TTL_MS = 5 * 60 * 1000;            // live bundle cache
const PLAYERS_TTL_MS = 24 * 60 * 60 * 1000; // players DB cache (it's a big download)
const RECORDS_TTL_MS = 6 * 60 * 60 * 1000;  // all-time records cache

async function fetchJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(BASE + url, { headers: { accept: 'application/json' }, signal: ac.signal });
    if (!res.ok) throw new Error(`Sleeper ${res.status} for ${url}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- live bundle
// {state, league, users, rosters, matchups, week} or null.
async function bundle(leagueId) {
  if (!leagueId) return null;
  const cache = await getDoc('sleeper-cache', null);
  if (cache && cache.league_id === leagueId && Date.now() - cache.fetched_at < TTL_MS) return cache.data;
  try {
    const [state, league, users, rosters] = await Promise.all([
      fetchJson('/v1/state/nfl'),
      fetchJson(`/v1/league/${leagueId}`),
      fetchJson(`/v1/league/${leagueId}/users`),
      fetchJson(`/v1/league/${leagueId}/rosters`),
    ]);
    const week = Math.max(1, Math.min(state.week || 1, 18));
    const matchups = await fetchJson(`/v1/league/${leagueId}/matchups/${week}`);
    const data = { state, league, users, rosters, matchups, week };
    await setDoc('sleeper-cache', { league_id: leagueId, fetched_at: Date.now(), data, cached: now() });
    return data;
  } catch (e) {
    console.error('sleeper fetch failed:', e.message);
    return cache && cache.league_id === leagueId ? cache.data : null;
  }
}

async function matchupsForWeek(leagueId, week) {
  try { return await fetchJson(`/v1/league/${leagueId}/matchups/${week}`); } catch (e) { return null; }
}

function teamName(users, rosters, rosterId) {
  const roster = rosters.find(r => r.roster_id === rosterId);
  const user = roster && users.find(u => u.user_id === roster.owner_id);
  return (user && (user.metadata?.team_name || user.display_name)) || `Team ${rosterId}`;
}

// Attempt to auto-match Sleeper teams to league owners by name overlap.
function autoMap(data, owners) {
  const map = {};
  if (!data) return map;
  for (const r of data.rosters) {
    const user = data.users.find(u => u.user_id === r.owner_id);
    if (!user) continue;
    const hay = `${user.display_name || ''} ${user.metadata?.team_name || ''}`.toLowerCase();
    const hit = owners.find(o => hay.includes(o.name.toLowerCase()));
    if (hit && !Object.values(map).includes(hit.id)) map[String(r.roster_id)] = hit.id;
  }
  return map;
}

// roster->owner map plus the stable user->owner map derived from it
// (user_id survives across seasons; roster_id does not).
function userMap(data, sleeperMap) {
  const out = {};
  if (!data) return out;
  for (const [rosterId, ownerId] of Object.entries(sleeperMap || {})) {
    const roster = data.rosters.find(r => String(r.roster_id) === String(rosterId));
    if (roster && roster.owner_id) out[roster.owner_id] = Number(ownerId);
  }
  return out;
}

// Standings from roster settings: wins desc, then points-for desc.
function standings(data, sleeperMap, owners) {
  if (!data) return [];
  const rows = data.rosters.map(r => {
    const s = r.settings || {};
    const pf = (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
    const mappedId = (sleeperMap || {})[String(r.roster_id)];
    const owner = owners.find(o => o.id === Number(mappedId));
    return {
      roster_id: r.roster_id,
      team: teamName(data.users, data.rosters, r.roster_id),
      owner_name: owner ? owner.name : null,
      wins: s.wins || 0, losses: s.losses || 0, ties: s.ties || 0, pf,
    };
  });
  rows.sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  rows.forEach((r, i) => r.rank = i + 1);
  return rows;
}

// This week's scoreboard grouped into matchups.
function scoreboard(data) {
  if (!data || !Array.isArray(data.matchups)) return [];
  const byMatch = {};
  for (const m of data.matchups) {
    (byMatch[m.matchup_id || 0] ??= []).push({
      roster_id: m.roster_id,
      team: teamName(data.users, data.rosters, m.roster_id),
      points: Math.round((m.points || 0) * 100) / 100,
    });
  }
  return Object.values(byMatch);
}

// Highest scorer in a set of matchups (for the one-click weekly winner).
function highScorer(matchups, data, sleeperMap, owners) {
  if (!matchups || !matchups.length) return null;
  let best = null;
  for (const m of matchups) {
    const points = Math.round((m.points || 0) * 100) / 100;
    if (!best || points > best.points) best = { roster_id: m.roster_id, points };
  }
  if (!best || best.points <= 0) return null;
  best.team = teamName(data.users, data.rosters, best.roster_id);
  const mappedId = (sleeperMap || {})[String(best.roster_id)];
  best.owner = owners.find(o => o.id === Number(mappedId)) || null;
  return best;
}

// ---------------------------------------------------------------- record book
// Walk the previous_league_id chain and compute all-time records from every
// season Sleeper knows about. Cached; heavy to compute.
async function records(leagueId, uMap, owners, { force = false } = {}) {
  if (!leagueId) return null;
  const cache = await getDoc('records-cache', null);
  if (!force && cache && cache.league_id === leagueId && Date.now() - cache.fetched_at < RECORDS_TTL_MS) return cache.data;
  try {
    const state = await fetchJson('/v1/state/nfl');
    const seasons = [];
    let id = leagueId;
    for (let depth = 0; id && depth < 15; depth++) {
      const league = await fetchJson(`/v1/league/${id}`);
      seasons.push({ id, league });
      id = league.previous_league_id || null;
    }

    const ownerName = uid => {
      const oid = uMap[uid];
      const o = owners.find(x => x.id === oid);
      return o ? o.name : null;
    };

    const careerByUser = {}; // user_id -> {wins, losses, ties, seasons[]} across Sleeper only
    const weeks = [];       // every real team-week: {points, user_id, name, team, week, season}
    const games = [];       // every head-to-head: {margin, winner, loser, wPts, lPts, week, season}
    const seasonRows = [];  // {season, name, team, wins, losses, ties, pf, pa, complete}

    for (const s of seasons) {
      const [users, rosters] = await Promise.all([
        fetchJson(`/v1/league/${s.id}/users`),
        fetchJson(`/v1/league/${s.id}/rosters`),
      ]);
      const byRoster = {};
      for (const r of rosters) byRoster[r.roster_id] = r;
      const label = rid => {
        const r = byRoster[rid];
        const u = r && users.find(x => x.user_id === r.owner_id);
        return {
          user_id: r ? r.owner_id : null,
          name: (r && ownerName(r.owner_id)) || (u && u.display_name) || `Team ${rid}`,
          team: (u && (u.metadata?.team_name || u.display_name)) || `Team ${rid}`,
        };
      };

      const isCurrent = s.league.status === 'in_season' && s.league.season === state.season;
      const lastPlayed = s.league.status === 'complete' ? 18
        : isCurrent ? (state.week || 1) - 1
        : s.league.status === 'in_season' ? 18 : 0;

      for (const r of rosters) {
        const st = r.settings || {};
        const lbl = label(r.roster_id);
        if (lbl.user_id && ((st.wins || 0) + (st.losses || 0) + (st.ties || 0)) > 0) {
          const c = (careerByUser[lbl.user_id] ??= { wins: 0, losses: 0, ties: 0, seasons: [] });
          c.wins += st.wins || 0; c.losses += st.losses || 0; c.ties += st.ties || 0;
          if (!c.seasons.includes(s.league.season)) c.seasons.push(s.league.season);
        }
        if ((st.wins || 0) + (st.losses || 0) + (st.ties || 0) > 0) {
          seasonRows.push({
            season: s.league.season, ...lbl,
            wins: st.wins || 0, losses: st.losses || 0, ties: st.ties || 0,
            pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100,
            pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100,
            complete: s.league.status === 'complete',
          });
        }
      }

      for (let w = 1; w <= Math.min(lastPlayed, 18); w++) {
        const ms = await matchupsForWeek(s.id, w);
        if (!Array.isArray(ms) || !ms.length) continue;
        const anyPoints = ms.some(m => (m.points || 0) > 0);
        if (!anyPoints) continue;
        const byMatch = {};
        for (const m of ms) {
          const pts = Math.round((m.points || 0) * 100) / 100;
          const lbl = label(m.roster_id);
          weeks.push({ points: pts, ...lbl, week: w, season: s.league.season });
          if (m.matchup_id != null) (byMatch[m.matchup_id] ??= []).push({ pts, lbl });
        }
        for (const pair of Object.values(byMatch)) {
          if (pair.length !== 2) continue;
          const [a, b] = pair;
          const [win, lose] = a.pts >= b.pts ? [a, b] : [b, a];
          games.push({
            margin: Math.round((win.pts - lose.pts) * 100) / 100,
            winner: win.lbl, loser: lose.lbl, wPts: win.pts, lPts: lose.pts,
            week: w, season: s.league.season,
          });
        }
      }
    }

    const topWeeks = [...weeks].sort((a, b) => b.points - a.points).slice(0, 5);
    const bottomWeeks = [...weeks].filter(w => w.points > 0).sort((a, b) => a.points - b.points).slice(0, 5);
    const zeroWeeks = weeks.filter(w => w.points === 0).length;
    const blowouts = [...games].sort((a, b) => b.margin - a.margin).slice(0, 3);
    const nailbiters = [...games].filter(g => g.margin > 0).sort((a, b) => a.margin - b.margin).slice(0, 3);
    const completedSeasons = seasonRows.filter(r => r.complete);
    const bestSeasonPF = [...completedSeasons].sort((a, b) => b.pf - a.pf).slice(0, 3);
    const worstSeasonPF = [...completedSeasons].filter(r => r.pf > 0).sort((a, b) => a.pf - b.pf).slice(0, 3);
    const bestRecords = [...completedSeasons].sort((a, b) => b.wins - a.wins || b.pf - a.pf).slice(0, 3);

    const data = {
      computed_at: now(), seasonsCovered: seasons.map(s => s.league.season).sort(),
      careerByUser,
      topWeeks, bottomWeeks, zeroWeeks, blowouts, nailbiters,
      bestSeasonPF, worstSeasonPF, bestRecords,
      totalGames: games.length, totalWeeks: weeks.length,
    };
    await setDoc('records-cache', { league_id: leagueId, fetched_at: Date.now(), data });
    return data;
  } catch (e) {
    console.error('sleeper records failed:', e.message);
    return cache && cache.league_id === leagueId ? cache.data : null;
  }
}

// ---------------------------------------------------------------- war room
const WAR_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Filtered players DB (the raw download is ~5MB; we keep the fantasy-relevant slice).
async function players() {
  const cache = await getDoc('players-cache', null);
  if (cache && Date.now() - cache.fetched_at < PLAYERS_TTL_MS) return cache.data;
  try {
    const all = await fetchJson('/v1/players/nfl');
    const slim = {};
    for (const [id, p] of Object.entries(all)) {
      const pos = (p.fantasy_positions || []).find(x => WAR_POSITIONS.includes(x)) || p.position;
      if (!WAR_POSITIONS.includes(pos)) continue;
      if (p.active === false) continue;
      const rank = p.search_rank == null || p.search_rank >= 9999999 ? null : p.search_rank;
      if (rank == null || rank > 600) continue;
      slim[id] = {
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id,
        pos, team: p.team || 'FA', rank,
        inj: p.injury_status || null,
      };
    }
    const data = { players: slim, count: Object.keys(slim).length };
    await setDoc('players-cache', { fetched_at: Date.now(), data });
    return data;
  } catch (e) {
    console.error('sleeper players failed:', e.message);
    return cache ? cache.data : null;
  }
}

async function draftInfo(leagueId) {
  try {
    const drafts = await fetchJson(`/v1/league/${leagueId}/drafts`);
    if (!Array.isArray(drafts) || !drafts.length) return null;
    const draft = drafts.sort((a, b) => (b.created || 0) - (a.created || 0))[0];
    const picks = await fetchJson(`/v1/draft/${draft.draft_id}/picks`);
    return { draft, picks: Array.isArray(picks) ? picks : [] };
  } catch (e) {
    console.error('sleeper draft failed:', e.message);
    return null;
  }
}

async function trendingAdds() {
  try { return await fetchJson('/v1/players/nfl/trending/add?lookback_hours=48&limit=30'); }
  catch (e) { return []; }
}

// Mini awards for one completed week: top score, stinker, blowout, nail-biter.
function weekReview(matchups, data) {
  if (!matchups || !matchups.length || !data) return null;
  const rows = matchups.map(m => ({
    roster_id: m.roster_id, matchup_id: m.matchup_id,
    points: Math.round((m.points || 0) * 100) / 100,
    team: teamName(data.users, data.rosters, m.roster_id),
  }));
  if (!rows.some(r => r.points > 0)) return null;
  const top = [...rows].sort((a, b) => b.points - a.points)[0];
  const low = [...rows].sort((a, b) => a.points - b.points)[0];
  const byMatch = {};
  for (const r of rows) if (r.matchup_id != null) (byMatch[r.matchup_id] ??= []).push(r);
  let blowout = null, closest = null;
  for (const pair of Object.values(byMatch)) {
    if (pair.length !== 2) continue;
    const [w, l] = pair[0].points >= pair[1].points ? pair : [pair[1], pair[0]];
    const margin = Math.round((w.points - l.points) * 100) / 100;
    if (!blowout || margin > blowout.margin) blowout = { w, l, margin };
    if (margin > 0 && (!closest || margin < closest.margin)) closest = { w, l, margin };
  }
  return { top, low, blowout, closest };
}

// Recent league activity (waivers, adds/drops, trades) with player names.
async function wire(leagueId, week, data, playersDb) {
  if (!leagueId || !data) return [];
  const nameOfPlayer = id => (playersDb && playersDb.players[id] && playersDb.players[id].name) || id;
  const rosterTeam = rid => teamName(data.users, data.rosters, rid);
  const out = [];
  for (const w of [week, week - 1]) {
    if (w < 1) continue;
    let txs;
    try { txs = await fetchJson(`/v1/league/${leagueId}/transactions/${w}`); } catch (e) { txs = null; }
    if (!Array.isArray(txs)) continue;
    for (const t of txs) {
      if (t.status !== 'complete') continue;
      const adds = Object.entries(t.adds || {}).map(([pid, rid]) => `${rosterTeam(rid)} adds ${nameOfPlayer(pid)}`);
      const drops = Object.entries(t.drops || {}).map(([pid, rid]) => `${rosterTeam(rid)} drops ${nameOfPlayer(pid)}`);
      const kind = t.type === 'trade' ? 'TRADE' : t.type === 'waiver' ? 'WAIVER' : 'ADD/DROP';
      const text = t.type === 'trade'
        ? `Trade between ${(t.roster_ids || []).map(rosterTeam).join(' and ')}: ${[...adds, ...drops].join('; ') || 'picks involved'}`
        : [...adds, ...drops].join(' · ');
      if (text) out.push({ kind, text, created: t.created || 0, trade: t.type === 'trade' });
    }
    if (out.length >= 10) break;
  }
  return out.sort((a, b) => b.created - a.created).slice(0, 10);
}

// Player stat lines. Past weeks never change, so they cache hard.
async function weekStats(season, week) {
  const key = `stats-cache:${season}:${week}`;
  const cache = await getDoc(key, null);
  if (cache) return cache.data;
  try {
    const data = await fetchJson(`/v1/stats/nfl/regular/${season}/${week}`);
    await setDoc(key, { fetched_at: Date.now(), data });
    return data;
  } catch (e) { return null; }
}

async function seasonStats(season) {
  const key = `stats-cache:${season}:season`;
  const cache = await getDoc(key, null);
  if (cache && Date.now() - cache.fetched_at < 6 * 60 * 60 * 1000) return cache.data;
  try {
    const data = await fetchJson(`/v1/stats/nfl/regular/${season}`);
    await setDoc(key, { fetched_at: Date.now(), data });
    return data;
  } catch (e) { return cache ? cache.data : null; }
}

// Full roster view for one owner: players with info + recent + season stat lines.
async function rosterView(data, sleeperMap, ownerId) {
  if (!data) return null;
  const rosterId = Object.keys(sleeperMap || {}).find(rid => Number(sleeperMap[rid]) === Number(ownerId));
  if (!rosterId) return null;
  const roster = data.rosters.find(r => String(r.roster_id) === String(rosterId));
  if (!roster) return null;
  const playersDb = await players();
  const lastWeek = Math.max(1, (data.state.week || 2) - 1);
  const [wk, seas] = await Promise.all([
    weekStats(data.state.season, lastWeek),
    seasonStats(data.state.season),
  ]);
  const pts = st => st == null ? null : Math.round(((st.pts_half_ppr ?? st.pts_ppr ?? st.pts_std) || 0) * 10) / 10;
  const starters = new Set(roster.starters || []);
  const rows = (roster.players || []).map(pid => {
    const info = (playersDb && playersDb.players[pid]) || { name: pid, pos: '?', team: '?', rank: null, inj: null };
    const w = wk ? wk[pid] : null;
    const se = seas ? seas[pid] : null;
    return {
      id: pid, ...info,
      starter: starters.has(pid),
      wkPts: pts(w), seasonPts: pts(se),
      gp: se ? (se.gp || se.gms_active || null) : null,
    };
  });
  const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };
  rows.sort((a, b) => (b.starter - a.starter) || ((posOrder[a.pos] || 9) - (posOrder[b.pos] || 9)) || ((a.rank || 9999) - (b.rank || 9999)));
  return {
    team: teamName(data.users, data.rosters, roster.roster_id),
    record: roster.settings ? `${roster.settings.wins || 0}-${roster.settings.losses || 0}` : '',
    rows, lastWeek,
  };
}

module.exports = {
  bundle, matchupsForWeek, standings, scoreboard, highScorer, teamName,
  autoMap, userMap, records, players, draftInfo, trendingAdds, WAR_POSITIONS,
  weekReview, wire, weekStats, seasonStats, rosterView,
};
