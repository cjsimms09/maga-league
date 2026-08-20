// TERRITORY: B
/* LIKE / DISLIKE PLAYERS, GRADED LATER — Cory, live 2026-08-20: "There needs
 * to be a way for me to like and dislike players when doing mocks and this
 * info needs to stay in the room for when I do my draft.. we should also
 * grade me on these likes and dislikes to see if player over or under
 * performs and if I was right.."
 *
 * Three things this tests, matching the three clauses of that ask:
 *   1. THE CAPTURE (setPlayerCall in app.js) — toggles a like/dislike,
 *      snapshotting proj_mean/games_expected/tier/adp AT THE MOMENT OF THE
 *      CALL, since a grader asking "was Cory right" later needs to know
 *      what the board said THEN, not what it says after ten more rebuilds.
 *   2. IT STAYS IN THE ROOM (src/prefs.js's playerCalls key) — same A-1
 *      server-side, owner-scoped, mock-and-real sync path targets/avoid/
 *      queue already use; a new call reaches the SAME persisted document.
 *   3. THE GRADE (draft/tools/grade_player_calls.js) — real Sleeper season
 *      stats (src/sleeper.js's seasonStats(), no new fetch pipeline)
 *      against the snapshot, honest PENDING before there is enough season
 *      to judge, never a guessed verdict.
 *
 * Run: node draft/tests/player_calls.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── 1. src/prefs.js — playerCalls is in the whitelist and sanitized ────────
{
  const P = require(path.join(ROOT, 'src', 'prefs.js'));
  ck('playerCalls is in the KEYS whitelist', P.KEYS.indexOf('playerCalls') >= 0, P.KEYS);
  const clean = P.sanitize({ playerCalls: {
    '111': { call: 'like', proj_mean: 200, games_expected: 15 },
    '222': { call: 'dislike', proj_mean: 100 },
  } });
  ck('a valid like/dislike map passes through', Object.keys(clean.playerCalls).length === 2, clean);
  ck('...the like entry keeps its fields', clean.playerCalls['111'].call === 'like'
    && clean.playerCalls['111'].proj_mean === 200);
  const dirty = P.sanitize({ playerCalls: {
    '111': { call: 'maybe', proj_mean: 200 },       // bad enum
    '222': { call: 'like' },                         // otherwise fine
    '333': 'not an object',                          // garbage value
    '444': null,
  } });
  ck('CONTROL — an invalid call enum is DROPPED, not passed through as garbage',
    !dirty.playerCalls['111'], dirty);
  ck('...a valid sibling entry survives the same sanitize pass', !!dirty.playerCalls['222'], dirty);
  ck('...a non-object value is dropped, not a throw', !dirty.playerCalls['333']);
  ck('...a null value is dropped', !dirty.playerCalls['444']);
  ck('an entirely absent playerCalls key -> no key on the output, not an empty object forced in',
    !('playerCalls' in P.sanitize({ lists: { targets: [] } })));
  ck('a non-object playerCalls (e.g. an array) is dropped whole',
    !('playerCalls' in P.sanitize({ playerCalls: ['not', 'a', 'map'] })));
  ck('MAX_LIST caps the number of ids accepted, same ceiling as playerOverrides', (() => {
    const many = {};
    for (let i = 0; i < 500; i++) many[String(i)] = { call: 'like' };
    const out = P.sanitize({ playerCalls: many });
    return Object.keys(out.playerCalls).length === 400;
  })());
}

// ── 2. app.js wiring — source-text assertions (no server, no DOM needed) ──
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('state initializes playerCalls', /playerCalls:\s*\{\}/.test(SRC));
  ck('currentPrefs() includes playerCalls in the sync payload',
    /playerCalls:\s*state\.playerCalls \|\| \{\}/.test(SRC));
  ck('applyServerPrefs() adopts an incoming playerCalls doc',
    /if \(p\.playerCalls\) state\.playerCalls = p\.playerCalls;/.test(SRC));
  ck('applyServerPrefs() refreshes the offline localStorage cache for calls too',
    /localStorage\.setItem\(CALLS_KEY, JSON\.stringify\(state\.playerCalls/.test(SRC));
  ck('loadCalls() runs at init, alongside the other prefs loaders',
    /loadOverrides\(\);\s*\n\s*loadLists\(\);\s*\n\s*loadRailAcks\(\);\s*\n\s*loadCalls\(\);/.test(SRC));
  ck('the click delegate wires data-call and data-uncall',
    /closest\('\[data-call\]'\)/.test(SRC) && /closest\('\[data-uncall\]'\)/.test(SRC));
  ck('WarRoomData exposes playerCalls() for the controller half to read',
    /playerCalls:\s*function\s*\(\)\s*\{\s*return state\.playerCalls \|\| \{\};?\s*\}/.test(SRC));
  ck('the end-draft confirm copy tells Cory his likes\\/dislikes survive too, not just targets',
    /likes\/dislikes are kept/.test(SRC));
  ck('renderPositionBoardsPanel passes calls through to the position-board view',
    /renderPositionBoards\([^)]*state\.playerCalls/.test(SRC));
}

// ── 3. setPlayerCall — the real toggle logic, sandboxed with a stub state ──
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const i = SRC.indexOf('function setPlayerCall(');
  if (i < 0) throw new Error('setPlayerCall not found in app.js');
  let depth = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    if (SRC[k] === '}') { depth--; if (!depth) { j = k + 1; break; } }
  }
  const body = SRC.slice(i, j);
  // eslint-disable-next-line no-new-func
  const makeSetPlayerCall = new Function('state', 'currentPick', 'saveCalls', 'renderAll',
    body + ';\nreturn setPlayerCall;');

  function mkState() {
    return {
      playerCalls: {},
      data: { league: { season: '2026' }, players: [
        { player_id: '1', name: 'Alpha', position: 'RB', team: 'AAA', proj_mean: 200, adjusted_adp: 10, tier: 1, games_expected: 16 },
      ] },
    };
  }

  {
    const state = mkState();
    let saved = 0, rendered = 0;
    const setPlayerCall = makeSetPlayerCall(state, () => 33, () => saved++, () => rendered++);
    setPlayerCall('1', 'like');
    ck('liking a player creates a call record', state.playerCalls['1'] && state.playerCalls['1'].call === 'like');
    ck('...and snapshots the board\'s numbers AT THAT MOMENT (proj_mean/adp/tier/games_expected)',
      state.playerCalls['1'].proj_mean === 200 && state.playerCalls['1'].adjusted_adp === 10
      && state.playerCalls['1'].tier === 1 && state.playerCalls['1'].games_expected === 16);
    ck('...and the season and pick context, so a call can be scoped to the right year/moment',
      state.playerCalls['1'].season === '2026' && state.playerCalls['1'].pick === 33);
    ck('...and it actually persisted and re-rendered', saved === 1 && rendered === 1);

    setPlayerCall('1', 'like');
    ck('clicking the SAME call again CLEARS it — a like is not forever', !state.playerCalls['1']);

    setPlayerCall('1', 'like');
    setPlayerCall('1', 'dislike');
    ck('clicking the OTHER call overwrites — a player cannot be both liked and disliked',
      state.playerCalls['1'].call === 'dislike');
  }
  {
    // Missing player (e.g. id typo, or a player who fell off the board) -> a
    // call record still forms, honestly null on the fields it cannot fill.
    const state = mkState();
    const setPlayerCall = makeSetPlayerCall(state, () => null, () => {}, () => {});
    setPlayerCall('999', 'like');
    ck('a player not found on the board -> the call still records, with null context rather than a throw',
      state.playerCalls['999'] && state.playerCalls['999'].call === 'like'
      && state.playerCalls['999'].proj_mean === null && state.playerCalls['999'].name === null);
  }
  {
    // currentPick() throwing (off the clock, manual mode edge cases elsewhere
    // in this codebase are known to throw) must not break the call itself.
    const state = mkState();
    const setPlayerCall = makeSetPlayerCall(state, () => { throw new Error('no clock'); }, () => {}, () => {});
    setPlayerCall('1', 'dislike');
    ck('currentPick() throwing does not prevent the call from being recorded',
      state.playerCalls['1'] && state.playerCalls['1'].call === 'dislike' && state.playerCalls['1'].pick === null);
  }
}

// ── 4. warroom_charts.js — the drill-down buttons ──────────────────────────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  ck('renderDrill reads the current call via WarRoomData.playerCalls()',
    /d\.playerCalls \? d\.playerCalls\(\)/.test(SRC));
  ck('a like button and a dislike button both exist, wired with data-call/data-call-id',
    /data-call="like" data-call-id=/.test(SRC) && /data-call="dislike" data-call-id=/.test(SRC));
  ck('the buttons are OUTSIDE the `taken` gate — an opinion about a player someone else '
    + 'drafted is still gradeable, unlike "queue"/"I took him"',
    (() => {
      const idx = SRC.indexOf('wr-drill-calls');
      const takenGateIdx = SRC.lastIndexOf('taken ? \'\' : \'<div class="wr-drill-actions">\'', idx);
      // the calls block must not itself be inside that taken-gated ternary's
      // false-branch string — i.e. it is concatenated as its own top-level
      // `+` term, not nested inside the '' taken-branch.
      return idx > 0 && SRC.slice(idx - 400, idx).indexOf('(function () {') >= 0;
    })());
  ck('the button label flips to "liked"/"disliked" once set, not a static label',
    /call === 'like' \? 'liked' : 'like'/.test(SRC) && /call === 'dislike' \? 'disliked' : 'dislike'/.test(SRC));
}

// ── 5. position_boards_view.js — the at-a-glance indicator on board rows ──
{
  const V = require(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'));
  const esc = s => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const block = {
    players: [
      { player_id: '1', name: 'Liked Guy', team: 'AAA', proj: 200, floor: 170, ceiling: 250 },
      { player_id: '2', name: 'Disliked Guy', team: 'BBB', proj: 180, floor: 150, ceiling: 220 },
      { player_id: '3', name: 'No Call Guy', team: 'CCC', proj: 100, floor: 80, ceiling: 130 },
    ],
  };
  const calls = {
    '1': { call: 'like' },
    '2': { call: 'dislike' },
  };
  const html = V.positionColumn('RB', block, esc, null, 'ds', null, calls);
  ck('a liked player shows the thumbs-up glyph', /Liked Guy[\s\S]{0,120}pb-call-like/.test(html), html);
  ck('a disliked player shows the thumbs-down glyph', /Disliked Guy[\s\S]{0,120}pb-call-dislike/.test(html), html);
  ck('a player with no call gets no glyph at all', !/No Call Guy[\s\S]{0,120}pb-call-(like|dislike)/.test(html), html);
  ck('CONTROL — no calls map at all -> renders exactly like before, no throw',
    V.positionColumn('RB', block, esc, null, 'ds', null, null).indexOf('Liked Guy') >= 0);
}

// ── 6. draft/tools/grade_player_calls.js — the grading logic itself ────────
{
  const G = require(path.join(ROOT, 'draft', 'tools', 'grade_player_calls.js'));
  ck('KNOWN-POSITIVE self-check (rule 3e): every hand-worked case grades correctly', G.selfCheck());

  // gradeAllCalls, end to end, against injected fakes (no network, no real store).
  const P = require(path.join(ROOT, 'src', 'prefs.js'));
  function memStore() {
    const m = new Map();
    return { async get(k, d) { return m.has(k) ? m.get(k) : (d === undefined ? null : d); },
             async set(k, v) { m.set(k, v); } };
  }
  (async () => {
    const store = memStore();
    await P.save(store, 42, { updated_at: '2026-08-20T00:00:00Z', device: 'x', prefs: { playerCalls: {
      '111': { call: 'like', name: 'Star', proj_mean: 170, games_expected: 17 },
      '222': { call: 'dislike', name: 'Bust', proj_mean: 170, games_expected: 17 },
    } } });
    const fakeStats = async () => ({ '111': { gp: 6, pts_half_ppr: 120 }, '222': { gp: 6, pts_half_ppr: 120 } });
    const r = await G.gradeAllCalls(P, store, fakeStats, 42, '2026');
    ck('gradeAllCalls composes prefs + Sleeper stats into real verdicts',
      r.graded.length === 2 && r.graded.find(g => g.player_id === '111').verdict === 'RIGHT'
      && r.graded.find(g => g.player_id === '222').verdict === 'WRONG', r);

    const rNoStats = await G.gradeAllCalls(P, store, async () => { throw new Error('offline'); }, 42, '2026');
    ck('CONTROL: Sleeper unreachable (true today, pre-season) -> every call PENDING, never a fabricated verdict',
      rNoStats.graded.every(g => g.verdict === 'PENDING'), rNoStats);

    const rEmpty = await G.gradeAllCalls(P, store, fakeStats, 999, '2026');
    ck('an owner with no calls recorded -> an honest empty report, not a throw',
      rEmpty.graded.length === 0 && /no calls recorded/.test(rEmpty.summary));

    console.log('\n' + pass + '/' + (pass + fail) + ' checks passed (async section included)');
    process.exit(fail ? 1 : 0);
  })();
}
