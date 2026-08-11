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
 * The grid. Columns run in DRAFT ORDER — the team that made the first overall
 * pick is leftmost — each labelled with the owner who sat there; rows are rounds.
 * Snake order is preserved as-is: cell [round][column] is whoever that team took
 * in that round, which is what a board shows regardless of direction.
 *
 * @param picks       Sleeper draft picks
 * @param sleeperMap  { roster_id: owner_id }
 * @param owners      league owners (for names)
 * @returns { rounds, slots, columns:[{slot,draftSlot,ownerId,name}], grid:[[cell|null]] }
 *          columns[0] made pick 1; `slot` is the board position, `draftSlot` is
 *          Sleeper's own seat number, kept so the two can be compared.
 *          cell = { name, pos, team, pickNo, round, slot, ownerId, keeper }
 */
function buildGrid(picks, sleeperMap, owners) {
  const list = (picks || []).filter(p => p && p.round != null);
  if (!list.length) return { rounds: 0, slots: 0, columns: [], grid: [] };

  const rounds = Math.max(...list.map(p => Number(p.round) || 0));
  if (!rounds) return { rounds: 0, slots: 0, columns: [], grid: [] };

  const nameOf = id => {
    const o = (owners || []).find(x => Number(x.id) === Number(id));
    return o ? o.name : null;
  };
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  // COLUMNS RUN IN DRAFT ORDER: whoever picked first is leftmost.
  //
  // A seat is a TEAM, identified by roster_id, and its column position is set by
  // the earliest pick it made — which is the overall pick order in round one, and
  // is what "order of pick" means on a board. Ordering by `draft_slot` instead
  // would be the same thing only when Sleeper's slot numbering happens to start
  // at the first pick, and there is no reason to depend on that.
  //
  // The old code also fell back to `pick_no` when `draft_slot` was missing, which
  // is wrong past round one: in a ten-team league pick 11 became "seat 11", so a
  // draft with no slot field would have spread one team's picks across a row of
  // phantom columns instead of stacking them in a single one.
  const seatKeyOf = p => (p.roster_id != null ? 'r' + p.roster_id
    : p.draft_slot != null ? 's' + p.draft_slot : null);

  const seats = new Map();
  for (const p of list) {
    const key = seatKeyOf(p);
    if (key == null) continue;
    if (!seats.has(key)) seats.set(key, { key, firstPick: Infinity, firstRound: Infinity, sample: p });
    const s = seats.get(key);
    const pn = num(p.pick_no), r = num(p.round);
    // Rank on the earliest pick this team made. Falls back to (round, slot) when
    // pick_no is absent, so an incomplete stream still orders sensibly.
    const rank = pn != null ? pn : (r != null ? r * 1000 + (num(p.draft_slot) || 0) : Infinity);
    if (rank < s.firstPick) { s.firstPick = rank; s.sample = p; }
    if (r != null && r < s.firstRound) s.firstRound = r;
  }
  const ordered = [...seats.values()].sort((a, b) =>
    (a.firstPick - b.firstPick) || String(a.key).localeCompare(String(b.key)));
  const slots = ordered.length;
  if (!slots) return { rounds: 0, slots: 0, columns: [], grid: [] };

  const colIndex = new Map();
  const columns = ordered.map((s, i) => {
    colIndex.set(s.key, i);
    const ownerId = ownerForPick(s.sample, sleeperMap);
    return {
      slot: i + 1,                                     // board position, 1 = first pick
      draftSlot: num(s.sample.draft_slot),             // Sleeper's own seat number, kept
      ownerId,
      name: (ownerId != null && nameOf(ownerId)) || (num(s.sample.draft_slot) != null ? `Seat ${s.sample.draft_slot}` : `Seat ${i + 1}`),
    };
  });

  const grid = [];
  for (let r = 1; r <= rounds; r++) grid.push(new Array(slots).fill(null));
  for (const p of list) {
    const r = Number(p.round), key = seatKeyOf(p);
    const c = key == null ? undefined : colIndex.get(key);
    if (c === undefined || !(r >= 1 && r <= rounds)) continue;
    const m = p.metadata || {};
    grid[r - 1][c] = {
      name: playerName(p),
      pos: String(m.position || '').toUpperCase() || null,
      team: String(m.team || '').toUpperCase() || null,
      pickNo: num(p.pick_no),
      round: r, slot: c + 1,
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
