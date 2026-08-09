// ─────────────────────────────────────────────────────────────────────────────
// MARKS — the two automatic badges from the design pass:
//   • the GOAT (🐐) next to whoever currently rosters Patrick Mahomes, and
//   • the Chiefs arrowhead LOGO (public/icons/kc.svg) next to every KC player.
// Both DERIVED from live data and re-evaluated every render, so the GOAT moves on
// its own the moment Mahomes changes hands — no list to maintain. Pure functions;
// the routes call these and hand the result to the views.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// Patrick Mahomes' Sleeper player_id — a specific player's stable id, not a
// tunable. Name-matching is the fallback when a players DB is on hand, so a
// future id change can't silently drop the badge.
const MAHOMES_ID = '4046';
const isMahomes = (pid, playersDb) =>
  String(pid) === MAHOMES_ID ||
  !!(playersDb && playersDb.players && playersDb.players[pid]
     && /patrick\s+mahomes/i.test(playersDb.players[pid].name || ''));

/**
 * Which league owner currently rosters Mahomes → gets the GOAT. Reads live
 * Sleeper rosters, maps roster_id→owner. Returns null when nobody has him
 * (off-season, or he's a free agent), so the badge simply disappears.
 */
function goatOwnerId(sData, sleeperMap, playersDb) {
  if (!sData || !Array.isArray(sData.rosters)) return null;
  const r = sData.rosters.find(r => Array.isArray(r.players) && r.players.some(pid => isMahomes(pid, playersDb)));
  if (!r) return null;
  const oid = Number((sleeperMap || {})[String(r.roster_id)]);
  return oid || null;
}

/** True if a player is on the Chiefs (roster rows carry a `team` code). */
const isKC = row => !!row && row.team === 'KC';

/**
 * The owner-flag map with the GOAT folded in: nationality flag + 🐐 for the
 * Mahomes owner. One place, so every surface that renders `flags[id]` shows the
 * GOAT move automatically.
 * @param baseFlagOf (name) => '🇺🇸' | '🇩🇪'
 */
function ownerFlags(owners, baseFlagOf, goatId) {
  return Object.fromEntries((owners || []).map(o =>
    [o.id, baseFlagOf(o.name) + (o.id === goatId ? ' 🐐' : '')]));
}

module.exports = { MAHOMES_ID, isMahomes, goatOwnerId, isKC, ownerFlags };
