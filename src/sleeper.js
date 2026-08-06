// Sleeper's public read-only API (no key required): https://docs.sleeper.com
// One bundle per league is cached for 5 minutes so a page load never fans out
// into a dozen upstream calls.
const { getDoc, setDoc, now } = require('./data');

const TTL_MS = 5 * 60 * 1000;

async function fetchJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ac.signal });
    if (!res.ok) throw new Error(`Sleeper ${res.status} for ${url}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Returns {state, league, users, rosters, matchups} or null when no league id
// is configured / Sleeper is unreachable. Never throws — the site must work
// fine without Sleeper.
async function bundle(leagueId) {
  if (!leagueId) return null;
  const cache = await getDoc('sleeper-cache', null);
  if (cache && cache.league_id === leagueId && Date.now() - cache.fetched_at < TTL_MS) return cache.data;
  try {
    const [state, league, users, rosters] = await Promise.all([
      fetchJson('https://api.sleeper.app/v1/state/nfl'),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}`),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    ]);
    const week = Math.max(1, Math.min(state.week || 1, 18));
    const matchups = await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    const data = { state, league, users, rosters, matchups, week };
    await setDoc('sleeper-cache', { league_id: leagueId, fetched_at: Date.now(), data, cached: now() });
    return data;
  } catch (e) {
    console.error('sleeper fetch failed:', e.message);
    return cache && cache.league_id === leagueId ? cache.data : null;
  }
}

async function matchupsForWeek(leagueId, week) {
  try {
    return await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  } catch (e) { return null; }
}

function teamName(users, rosters, rosterId) {
  const roster = rosters.find(r => r.roster_id === rosterId);
  const user = roster && users.find(u => u.user_id === roster.owner_id);
  return (user && (user.metadata?.team_name || user.display_name)) || `Team ${rosterId}`;
}

// Standings from roster settings: wins desc, then points-for desc.
function standings(data, sleeperMap, owners) {
  if (!data) return [];
  const rows = data.rosters.map(r => {
    const s = r.settings || {};
    const pf = (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
    const mappedId = sleeperMap[String(r.roster_id)];
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
  const mappedId = sleeperMap[String(best.roster_id)];
  best.owner = owners.find(o => o.id === Number(mappedId)) || null;
  return best;
}

module.exports = { bundle, matchupsForWeek, standings, scoreboard, highScorer, teamName };
