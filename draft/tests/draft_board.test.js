'use strict';
// THE DRAFT-BOARD ARCHIVE — capture and presentation, end to end.
//
// The board is Cory's most-wanted artifact from a season and the one that cannot
// be reconstructed once the room empties. Two capture paths, deliberately:
//   • live, from the war room, as picks land        (`draft_picks`, A's client)
//   • server-side, from Sleeper, once it's finished (`draft_complete`, here)
// The second exists because the first runs only while that tab is open — close
// the laptop on the last pick and the final batch may never post. `draft_complete`
// was a registered raw kind with NO WRITER at all.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const DB = require(path.join(ROOT, 'src', 'routes', 'draftboard'));
const rawarchive = require(path.join(ROOT, 'src', 'rawarchive'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

// A snake draft: 3 seats, 2 rounds. Sleeper numbers picks straight through and
// carries draft_slot, so round 2 runs 3,2,1 by slot.
const PICKS = [
  { round: 1, pick_no: 1, draft_slot: 1, roster_id: 11, player_id: 'a', metadata: { first_name: 'Bijan', last_name: 'Robinson', position: 'RB', team: 'ATL' } },
  { round: 1, pick_no: 2, draft_slot: 2, roster_id: 12, player_id: 'b', metadata: { first_name: "Ja'Marr", last_name: 'Chase', position: 'WR', team: 'CIN' } },
  { round: 1, pick_no: 3, draft_slot: 3, roster_id: 13, player_id: 'c', metadata: { first_name: 'Sam', last_name: 'LaPorta', position: 'TE', team: 'DET' } },
  { round: 2, pick_no: 4, draft_slot: 3, roster_id: 13, player_id: 'd', is_keeper: true, metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF' } },
  { round: 2, pick_no: 5, draft_slot: 2, roster_id: 12, player_id: 'e', metadata: { first_name: 'Puka', last_name: 'Nacua', position: 'WR', team: 'LAR' } },
  // seat 1's round-2 pick deliberately MISSING — an interrupted capture must
  // render a hole, not shift every later pick up a cell.
];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const active = owners.filter(o => o.active).slice(0, 3);
  const map = { '11': active[0].id, '12': active[1].id, '13': active[2].id };
  const years = Object.values(await store.get('seasons'));
  const season = String((years.find(y => y.status !== 'complete') || years[years.length - 1]).year);

  // ── THE GRID.
  const g = DB.buildGrid(PICKS, map, owners);
  ck('the grid is rounds × seats', g.rounds === 2 && g.slots === 3, g);
  ck('columns are seats, labelled with the owner who sat there',
    g.columns.map(c => c.name).join(',') === active.map(o => o.name).join(','), g.columns);
  ck('round 1 reads left to right', g.grid[0].map(c => c && c.name).join(',') === "Bijan Robinson,Ja'Marr Chase,Sam LaPorta", g.grid[0]);
  ck('a snake round stays under the seat that made the pick, not in pick order',
    g.grid[1][2] && g.grid[1][2].name === 'Josh Allen' && g.grid[1][1].name === 'Puka Nacua', g.grid[1]);
  ck('a missing pick leaves a HOLE rather than shifting the row',
    g.grid[1][0] === null, g.grid[1]);
  ck('keepers are marked', g.grid[1][2].keeper === true);
  ck('position and team ride along', g.grid[0][0].pos === 'RB' && g.grid[0][0].team === 'ATL');
  ck('an empty draft yields an empty grid, not a crash',
    DB.buildGrid([], map, owners).rounds === 0 && DB.buildGrid(null, map, owners).rounds === 0);

  // ── COMPLETENESS. The status flag is not always set promptly, so a full board
  // counts as complete on its own.
  ck('a flagged-complete draft is complete', DB.isComplete({ draft: { status: 'complete' }, picks: PICKS }, 99));
  ck('a full board is complete even without the flag', DB.isComplete({ draft: {}, picks: PICKS }, 5));
  ck('a partial board is not', !DB.isComplete({ draft: {}, picks: PICKS }, 60));
  ck('no picks is never complete', !DB.isComplete({ draft: { status: 'complete' }, picks: [] }, 0));

  // ── THE PAYLOAD carries its own map. Roster ids only mean something against
  // the mapping in force at the time; resolving them against today's map would
  // silently reattribute every pick of an old draft after any remap.
  const payload = DB.completePayload({ draft: { draft_id: 'd1', status: 'complete' }, picks: PICKS }, map, '2026-08-22T23:00:00Z');
  ck('the archived payload stores the roster→owner map WITH the picks',
    JSON.stringify(payload.sleeper_map) === JSON.stringify(map), payload.sleeper_map);
  ck('  and the picks verbatim', payload.count === PICKS.length && payload.picks.length === PICKS.length);

  // ── THE PAGE. Archive a snapshot the way the route does, then render.
  await rawarchive.snapshot(store, { kind: 'draft_complete', season, source_at: null, payload });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async u => { const r = await fetch(base + u, { headers: { cookie } }); return { status: r.status, html: await r.text() }; };

  const board = await get(`/history/board/${season}`);
  ck('the board page renders', board.status === 200 && /Draft Board/.test(board.html), board.status);
  ck('  and it IS the board page, not a redirect', /every pick, the way it looked on the wall/.test(board.html));
  ck('  with the picks in it', /Bijan Robinson/.test(board.html) && /Puka Nacua/.test(board.html));
  ck('  and the seats named', new RegExp(active[0].name).test(board.html));
  ck('  no template error', !/ReferenceError|is not defined|Cannot read propert/.test(board.html));

  // The click-through must APPEAR on the season page for a year that has one —
  // a page nothing links to is the same as a page that does not exist. Tested
  // against a COMPLETED season, because /history/season only serves years that
  // are in the chronicle and the current one isn't written yet.
  const chron = Number(season) - 2;
  await rawarchive.snapshot(store, { kind: 'draft_complete', season: String(chron), source_at: null, payload });
  const sp = await get(`/history/season/${chron}`);
  ck('the season page renders for an archived year', sp.status === 200, sp.status);
  ck('the season page links through to the board', new RegExp(`/history/board/${chron}`).test(sp.html), sp.status);

  // ── HONEST EMPTY STATE for a year with no archived board.
  const empty = await get('/history/board/2016');
  ck('a season with no archived board says so plainly',
    /No board archived for 2016/.test(empty.html) && !/<table class="db-board"/.test(empty.html), empty.status);
  const sp16 = await get('/history/season/2016');
  ck('  and that season page does NOT offer a dead link',
    !/\/history\/board\/2016/.test(sp16.html));

  // ── DEDUP: the archive is content-hashed, so re-capturing an unchanged board
  // is free. Pressing the button twice must not double the record.
  const again = await rawarchive.snapshot(store, { kind: 'draft_complete', season, source_at: null, payload });
  ck('re-archiving an unchanged board is deduped, not duplicated', again.deduped === true, again);
  const rows = await rawarchive.readAll(store, season, 'draft_complete');
  ck('  so the archive still holds exactly one snapshot', rows.length === 1, rows.length);

  // ── FALLBACK: a year captured only by the live war-room stream still renders.
  const streamSeason = String(Number(season) - 1);
  await rawarchive.snapshot(store, { kind: 'draft_picks', season: streamSeason, source_at: null,
    payload: { count: PICKS.length, picks: PICKS } });
  const fb = await get(`/history/board/${streamSeason}`);
  ck('a board captured only by the live stream still renders',
    /Bijan Robinson/.test(fb.html) && /from the live pick stream/.test(fb.html), fb.status);

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
