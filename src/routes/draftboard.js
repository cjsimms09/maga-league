'use strict';
// THE DRAFT-BOARD ARCHIVE — the completed board, kept as a grid: owners across
// the top, rounds down the side, the way it looked on the wall.
//
// WHY A SECOND CAPTURE PATH. The raw pick stream is already archived from the
// war room (`captureRawPicks` in the draft client, kind `draft_picks`), which is
// the right primary: it fires as picks land, timestamped, deduped. But it runs
// ONLY while that tab is open. Close the laptop when the last pick is in and the
// final batch may never post, and there is no server-side record of it — the
// board would then have to be reconstructed from memory, which is the thing
// worth avoiding. So there is a second, independent path: pull the finished
// draft from Sleeper server-side and archive it as `draft_complete`. The two
// agree or they don't, and disagreement is itself worth knowing.
//
// PURE. This module shapes; the route fetches and stores. It lives under
// src/routes/ alongside the other pure model modules the site owns
// (accuracy.js, whatwatch.js, standings.js, draftorder.js) — nothing under
// draft/** imports it.

/** Sleeper's slot → the league's owner id, via the roster map the site keeps. */
function ownerForPick(pick, sleeperMap) {
  const rid = pick.roster_id != null ? String(pick.roster_id) : null;
  if (rid && sleeperMap && sleeperMap[rid] != null) return Number(sleeperMap[rid]);
  return null;
}

/** "Ja'Marr Chase" from whichever of Sleeper's shapes this pick carries. */
function playerName(pick) {
  const m = pick.metadata || {};
  const n = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  return n || m.player_name || (pick.player_id != null ? `#${pick.player_id}` : '—');
}

/**
 * The grid. Columns are DRAFT SLOTS in order (that is how a board is read on the
 * wall — seat 1 on the left), each labelled with the owner who sat there; rows
 * are rounds. Snake order is preserved as-is: cell [round][slot] is whoever that
 * seat took in that round, which is what a board shows regardless of direction.
 *
 * @param picks       Sleeper draft picks
 * @param sleeperMap  { roster_id: owner_id }
 * @param owners      league owners (for names)
 * @returns { rounds, slots, columns:[{slot,ownerId,name}], grid:[[cell|null]] }
 *          cell = { name, pos, team, pickNo, round, slot, ownerId, keeper }
 */
function buildGrid(picks, sleeperMap, owners) {
  const list = (picks || []).filter(p => p && p.round != null);
  if (!list.length) return { rounds: 0, slots: 0, columns: [], grid: [] };

  const slotOf = p => Number(p.draft_slot != null ? p.draft_slot : p.pick_no);
  const rounds = Math.max(...list.map(p => Number(p.round) || 0));
  const slots = Math.max(...list.map(slotOf).filter(n => Number.isFinite(n) && n > 0), 0);
  if (!rounds || !slots) return { rounds: 0, slots: 0, columns: [], grid: [] };

  const nameOf = id => {
    const o = (owners || []).find(x => Number(x.id) === Number(id));
    return o ? o.name : null;
  };
  // Column headers: the owner who sat in each seat, read off round 1 (the round
  // every seat certainly has) and falling back to any pick in that slot.
  const columns = [];
  for (let s = 1; s <= slots; s++) {
    const inSlot = list.filter(p => slotOf(p) === s);
    const first = inSlot.find(p => Number(p.round) === 1) || inSlot[0] || null;
    const ownerId = first ? ownerForPick(first, sleeperMap) : null;
    columns.push({ slot: s, ownerId, name: (ownerId != null && nameOf(ownerId)) || `Seat ${s}` });
  }

  const grid = [];
  for (let r = 1; r <= rounds; r++) grid.push(new Array(slots).fill(null));
  for (const p of list) {
    const r = Number(p.round), s = slotOf(p);
    if (!(r >= 1 && r <= rounds && s >= 1 && s <= slots)) continue;
    const m = p.metadata || {};
    grid[r - 1][s - 1] = {
      name: playerName(p),
      pos: String(m.position || '').toUpperCase() || null,
      team: String(m.team || '').toUpperCase() || null,
      pickNo: p.pick_no != null ? Number(p.pick_no) : null,
      round: r, slot: s,
      ownerId: ownerForPick(p, sleeperMap),
      keeper: p.is_keeper === true,
    };
  }
  return { rounds, slots, columns, grid };
}

/** What we archive: the picks verbatim plus enough context to read them later. */
function completePayload(draftInfo, sleeperMap, nowIso) {
  const d = (draftInfo && draftInfo.draft) || {};
  return {
    draft_id: d.draft_id || null,
    status: d.status || null,
    type: d.type || null,
    season: d.season || null,
    settings: d.settings || null,
    // The map is stored WITH the picks. Roster ids are only meaningful against
    // the mapping in force at the time; a later remap would silently reattribute
    // every pick in the archive if we resolved names at read time instead.
    sleeper_map: sleeperMap || {},
    captured_at: nowIso,
    count: (draftInfo && draftInfo.picks || []).length,
    picks: (draftInfo && draftInfo.picks) || [],
  };
}

/** Is this draft finished enough to archive as complete? */
function isComplete(draftInfo, expectedPicks) {
  if (!draftInfo || !Array.isArray(draftInfo.picks) || !draftInfo.picks.length) return false;
  const status = String((draftInfo.draft || {}).status || '').toLowerCase();
  if (status === 'complete') return true;
  // Sleeper does not always flip the flag promptly; a full board is a full board.
  return expectedPicks > 0 && draftInfo.picks.length >= expectedPicks;
}

module.exports = { buildGrid, completePayload, isComplete, ownerForPick, playerName };
