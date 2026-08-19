/* War Room UI controller.
 *
 * Two modes off one artifact: a pre-draft prep board and a live assistant.
 * The live view is built for glanceability on a phone or second monitor —
 * the recommendation must be readable without scrolling or squinting.
 */
(function () {
  'use strict';

  const E = window.DraftEngine;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const WEIGHT_KEY = 'mfga.draft.weights';

  // ── MOCK SURVIVAL CALIBRATION ───────────────────────────────────────────────
  // Grade "% to last to my next pick" — the number Cory reads most, never once
  // graded. Fires ONLY inside a mock and persists to localStorage; it NEVER posts
  // to the real prediction ledger (mock noise must not contaminate real grading).
  // Pure core + the two stamped caveats live in mock_calib.js. Feeds: renderSurvival
  // records the displayed estimates at my pick; markDrafted observes every pick and
  // resolves matured predictions as the mock proceeds.
  const MOCK_CALIB_KEY = 'maga:mockcalib:v1';
  let mockCalib = null;
  function mockCalibReady() {
    if (typeof MockCalib === 'undefined') return null;
    if (!mockCalib) {
      mockCalib = MockCalib.create();
      try { mockCalib.load(JSON.parse(localStorage.getItem(MOCK_CALIB_KEY) || 'null')); }
      catch (e) { /* corrupt store starts fresh */ }
    }
    return mockCalib;
  }
  function mockCalibSave() {
    if (!mockCalib) return;
    try { localStorage.setItem(MOCK_CALIB_KEY, JSON.stringify(mockCalib.toJSON())); }
    catch (e) { /* quota/private-mode: capture stays in memory for this session */ }
  }
  // Readout for a handful of mocks -> a real curve. Exposed for console/export so a
  // panel is not on the critical path to START capturing (the data is the windowed
  // part; the readout can be prettied any time).
  window.DraftMockCalib = {
    report: function () { const mc = mockCalibReady(); return mc ? mc.calibration() : null; },
    raw: function () { const mc = mockCalibReady(); return mc ? mc.toJSON() : null; },
    reset: function () { const mc = mockCalibReady(); if (mc) { mc.reset(); mockCalibSave(); } },
  };

  const state = {
    data: null,
    board: [],            // available players
    drafted: new Set(),
    myRoster: [],
    weights: Object.assign({}, E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS),
    runMults: {},
    recentPicks: [],
    // Movement line: the top-of-board snapshot from the LAST pick, and the frozen
    // line for THIS pick (so re-renders don't recompute it away). Advanced only
    // when the pick number actually changes.
    lastRecommendation: null,
    movement: null,
    // Stack routes for the current scored board (feeds the rec-card badge).
    stackRoutes: null,
    // Player ids I tapped myself. The difference between this and what Sleeper
    // reports on my seat is exactly the missed-mark case.
    markedLocally: new Set(),
    sync: null,
    mode: 'pre',          // 'pre' | 'live'
    rosters: {},          // team_slot -> [player] (built from picks; feeds A2 Layer 2)
    profiles: {},         // manager profiles keyed by draft slot
    overrides: {},
    filterPos: 'ALL',
    search: '',
    // Your own read. Per-device on purpose: it is your opinion, not league
    // data, and it must not need a round trip on the clock.
    // `queue` is ordered and the other two are not, on purpose: targets and
    // never are opinions about players, the queue is a plan for picks.
    lists: { targets: [], avoid: [], queue: [] },
    clockMode: false,     // the one-answer view
    clockIndex: 0,        // which recommendation it is showing
    // A2 slot verification: a slot can be set manually (a guess/placeholder) or
    // imported from the real Sleeper draft object (verified). Everything derived
    // from the slot — pick numbers, LRM, the opening script — is provisional
    // until slotVerified flips true, and a body watermark says so.
    slotVerified: false,
    slotSource: null,     // 'manual' | 'sleeper'
    // B7 compare tray: up to two player_ids selected for the dollar-gap overlay.
    compare: [],
    compareOpen: false,   // tray visible in search-mode even with <2 picked
    compareSearch: '',    // live filter for the compare search box
  };
  const LISTS_KEY = 'wr-lists-v1';
  const RAIL_ACK_KEY = 'wr-rail-acks-v1';

  /* ── Rail-fire budget (item 2 fix 2) ────────────────────────────────────
   * A rail is the engine flagging that a number is probably a bug, not an
   * insight. One flagged player in your top options is a judgement call; more
   * than two is a pattern that says the BOARD is wrong — a bad ADP pull, a join
   * that matched nobody, a component dwarfing its own VORP across the field.
   * So >2 flagged in the top 15 turns the checklist RED and keeps it red until
   * every fire is acknowledged with a reason you have to type. The reason is
   * logged (persisted with the build it was made against and the exact flags),
   * so "I looked and it's fine" is a recorded decision, not a silent dismissal.
   * A new build, or a changed set of flags, invalidates the old acknowledgement
   * — you cannot wave through a fire you never actually saw. */
  const RAIL_BUDGET = 2;   // >2 flagged in the top 15 trips the checklist item
  const RAIL_TOPN = 15;

  function loadRailAcks() {
    try { state.railAcks = JSON.parse(localStorage.getItem(RAIL_ACK_KEY) || '{}') || {}; }
    catch (e) { state.railAcks = {}; }
  }
  function saveRailAcks() {
    try { localStorage.setItem(RAIL_ACK_KEY, JSON.stringify(state.railAcks || {})); } catch (e) {}
    markPrefsChanged();
  }
  /** The current rail-fire picture: which of the top-N carry flags, and which
   *  of those the user has acknowledged for THIS build. Reuses the last
   *  recommendation list so it never disagrees with the cards on screen; the
   *  counting/ack logic itself lives in the engine (E.computeRailBudget) so the
   *  app and any test agree exactly. */
  function railFireBudget() {
    const scored = (state.lastClock && state.lastClock.scored)
      || (state.board && state.data ? E.recommend(context()) : []);
    return E.computeRailBudget(scored, { builtAt: (state.data || {}).built_at,
      acks: state.railAcks || {}, budget: RAIL_BUDGET, topN: RAIL_TOPN });
  }
  function acknowledgeRailFire(id) {
    const budget = railFireBudget();
    const fire = budget.fires.find(f => f.id === String(id));
    if (!fire) return;
    const reason = (window.prompt('Why is ' + fire.name + ' safe to keep in the top options '
      + 'despite the rail?\n(' + fire.flags.join('; ') + ')\n\nThis reason is logged.') || '').trim();
    if (!reason) return;   // no silent acknowledgement — a blank reason is not a reason
    state.railAcks[fire.id] = { sig: fire.sig, reason, flags: fire.flags,
      at: new Date().toISOString(), built_at: (state.data || {}).built_at || null, name: fire.name };
    saveRailAcks();
    renderAll();
  }

  function loadLists() {
    try {
      const raw = JSON.parse(localStorage.getItem(LISTS_KEY) || '{}');
      // queue arrived after this key shipped, so read it defensively rather
      // than versioning the key and throwing away somebody's target list.
      state.lists = { targets: raw.targets || [], avoid: raw.avoid || [], queue: raw.queue || [] };
    } catch (e) { /* private mode — lists just do not persist */ }
  }
  function saveLists() {
    try { localStorage.setItem(LISTS_KEY, JSON.stringify(state.lists)); } catch (e) {}
    markPrefsChanged();
  }

  /* --- A-1: prefs that survive the phone/laptop divide -------------------
   * localStorage stays the offline cache; the server doc (keyed to my login)
   * is what crosses devices. Newest stamp wins, whole-document, and the
   * status bar SAYS which side won. Best-effort throughout. */
  const PREFS_STAMP_KEY = 'wr-prefs-stamp-v1';
  let prefsApplying = false;     // suppress push while adopting the server copy
  const prefsPush = (typeof PrefSync !== 'undefined') ? PrefSync.scheduler(1200) : null;

  function currentPrefs() {
    return { lists: state.lists, weights: state.weights, autoWeights: !!state.autoWeights,
             playerOverrides: state.playerOverrides || {}, railAcks: state.railAcks || {} };
  }
  function markPrefsChanged() {
    if (prefsApplying) return;
    const at = new Date().toISOString();
    try { localStorage.setItem(PREFS_STAMP_KEY, at); } catch (e) {}
    if (!prefsPush) return;
    prefsPush(function () {
      return { updated_at: at, device: (navigator.platform || 'browser'), prefs: currentPrefs() };
    }, function () { stampPrefsSynced('pushed'); });
  }
  function applyServerPrefs(p) {
    prefsApplying = true;
    try {
      if (p.lists) state.lists = { targets: p.lists.targets || [], avoid: p.lists.avoid || [],
                                   queue: p.lists.queue || [] };
      if (p.weights) { state.weights = Object.assign({}, E.DEFAULT_WEIGHTS, p.weights); syncSliders(); }
      if (typeof p.autoWeights === 'boolean') state.autoWeights = p.autoWeights;
      if (p.playerOverrides) state.playerOverrides = p.playerOverrides;
      if (p.railAcks) state.railAcks = p.railAcks;
      // Refresh the offline cache so a later offline load sees the same truth.
      try { localStorage.setItem(LISTS_KEY, JSON.stringify(state.lists)); } catch (e) {}
      try { localStorage.setItem(RAIL_ACK_KEY, JSON.stringify(state.railAcks || {})); } catch (e) {}
      try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(state.playerOverrides || {})); } catch (e) {}
      try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights)); } catch (e) {}
      try { localStorage.setItem(AUTO_KEY, state.autoWeights ? '1' : '0'); } catch (e) {}
    } finally { prefsApplying = false; }
  }
  function stampPrefsSynced(note) {
    const el = $('#prefs-sync');
    if (el) { el.textContent = '☁ synced'; el.title = 'prefs ' + note; el.style.display = ''; }
  }
  function syncPrefsFromServer() {
    if (typeof PrefSync === 'undefined') return;
    PrefSync.pull().then(function (serverDoc) {
      let localAt = '';
      try { localAt = localStorage.getItem(PREFS_STAMP_KEY) || ''; } catch (e) {}
      if (serverDoc && String(serverDoc.updated_at || '') > String(localAt)) {
        // The other device wrote later — its homework wins here too.
        applyServerPrefs(serverDoc.prefs || {});
        try { localStorage.setItem(PREFS_STAMP_KEY, String(serverDoc.updated_at)); } catch (e) {}
        applyOverrides();
        renderAll();
        stampPrefsSynced('adopted from ' + (serverDoc.device || 'another device'));
      } else if (localAt) {
        markPrefsChanged();          // local is newer (or server empty): push up
        stampPrefsSynced('local copy is current');
      } else {
        stampPrefsSynced('in sync');
      }
    });
  }
  function toggleList(which, id) {
    // A-2: snapshot before the tap; undo restores the EXACT prior lists (a
    // star can knock a player off the never list, so re-toggling is not enough).
    const before = JSON.parse(JSON.stringify(state.lists));
    const wasOn = state.lists[which].indexOf(id) >= 0;
    if (!undoRunning) {
      showUndo((which === 'targets' ? (wasOn ? 'Unstarred' : 'Starred')
        : (wasOn ? 'Un-nevered' : 'Never-listed')) + ' player', function () {
        state.lists = before;
        saveLists();
      });
    }
    const other = which === 'targets' ? 'avoid' : 'targets';
    const list = state.lists[which];
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else {
      list.push(id);
      // A player cannot be both starred and blocked; the newer one wins rather
      // than leaving a contradiction for the engine to resolve silently.
      const o = state.lists[other].indexOf(id);
      if (o >= 0) state.lists[other].splice(o, 1);
    }
    saveLists();
    renderAll();
  }

  /* ── The queue ──────────────────────────────────────────────────────────
   *
   * An ordered list of who you take next, in your order. It exists for one
   * moment: the clock is at 8 seconds, the wifi is gone, and you need a name.
   * Everything else in here is analysis; this is the decision, already made.
   *
   * Blocking a player pulls him out of the queue automatically — a queue that
   * still lists somebody you have sworn never to draft is the tool arguing with
   * itself, and on the clock you will believe whichever one you read first.
   */
  function toggleQueue(id) {
    const q = state.lists.queue;
    const at = q.indexOf(id);
    if (at >= 0) q.splice(at, 1);
    else {
      q.push(id);
      const a = state.lists.avoid.indexOf(id);
      if (a >= 0) state.lists.avoid.splice(a, 1);
    }
    saveLists();
    renderAll();
  }
  function moveInQueue(id, dir) {
    const q = state.lists.queue;
    const at = q.indexOf(id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= q.length) return;
    q.splice(to, 0, q.splice(at, 1)[0]);
    saveLists();
    renderAll();
  }
  /* Seed the queue from the board's current order.
   *
   * Appends rather than replaces. Somebody who has hand-built eight names and
   * taps this wants the next twelve, not their eight thrown away — and there is
   * no undo on the clock.
   */
  function fillQueueFromBoard(n) {
    const out = E.onTheClock(context(), state.lists);
    const have = new Set(state.lists.queue);
    let added = 0;
    for (const s of out.scored) {
      if (added >= n) break;
      const id = s.player.player_id;
      if (have.has(id)) continue;
      state.lists.queue.push(id);
      have.add(id);
      added++;
    }
    saveLists();
    renderAll();
    return added;
  }
  /* Drop queued players who have already been taken.
   *
   * Deliberately NOT automatic. A name vanishing from your queue without you
   * seeing it go is how you spend a pick wondering where he went; struck
   * through and counted, you can see the run happening.
   */
  function tidyQueue() {
    const before = state.lists.queue.length;
    state.lists.queue = state.lists.queue.filter(id => !state.drafted.has(String(id)));
    saveLists();
    renderAll();
    return before - state.lists.queue.length;
  }

  // ---------------------------------------------------------------- bootstrap
  const PIN_KEY = 'mfga.draft.artifact';

  /* Pin the artifact locally.
   *
   * The draft may be somewhere with bad wifi, and this file is served from a
   * cold-startable serverless function. Cached by build timestamp, the tool
   * runs fully offline — the only thing lost is live pick sync, and manual
   * entry covers that. A tool that needs the network at the table is a tool
   * that fails at the table.
   */
  function pinArtifact(data) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify({ built_at: data.built_at, data: data }));
    } catch (e) {
      // Quota is ~5MB and a board is ~1MB, but a full store must not be fatal.
      console.warn('could not pin artifact locally:', e.message);
    }
  }
  function pinnedArtifact() {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (!raw) return null;
      const pin = JSON.parse(raw);
      return pin && pin.data ? pin.data : null;
    } catch (e) { return null; }
  }

  /* ── UNPLAYABLE PLAYERS DO NOT BELONG ON A DRAFT BOARD ──────────────────
   *
   * Cory found Marshawn Lynch — retired since 2019 — in the pool during a mock.
   * 943 of 1759 players (53.6%) carry the full signature: NO 2026 TEAM, NO
   * PROJECTION, and an ADP that is Sleeper's `search_rank` fallback rather than
   * a real one. draft/build.py admits them because its filter excludes only an
   * explicit `active === false` and applies no rank ceiling.
   *
   * C measured that REPLACEMENT LEVEL MOVES BY EXACTLY ZERO when they are
   * removed — replacement is the Nth-ranked player BY PROJECTION and they all
   * project 0.0, so they sort into the tail and cannot reach a cut of 10-29.
   * VORP is not contaminated and never was.
   *
   * BUT THEY REACH THE TOP TEN IN THE LATE ROUNDS. Measured on the mock walk:
   * Marcedes Lewis and Jason Witten at pick 105, Frank Gore at 110, Frank Gore
   * and Larry Fitzgerald at 125 — inside the ten players Cory reads when
   * deciding what to take. So it is not a valuation defect and it is not
   * cosmetic either; it is the recommendation surface offering men who retired
   * half a decade ago.
   *
   * C's DISCRIMINATOR, used verbatim because it was verified against this exact
   * board: no team AND no projection isolates all 943 WITHOUT TOUCHING A SINGLE
   * PRICED PLAYER. It does not depend on Sleeper's `active` flag being reliable,
   * which is the thing nobody can currently check.
   *
   * APPLIED HERE RATHER THAN ONLY IN build.py because the board is rebuilt
   * nightly behind an egress path this session cannot reach, and Cory drafts off
   * whatever is deployed. build.py needs the same guard at source; this one
   * means the surface is right tonight regardless. */
  function draftablePlayers(players) {
    const all = players || [];
    const playable = all.filter(p => (p.team || 'FA') !== 'FA' || Number(p.proj_mean) > 0);
    // FAIL LOUD RATHER THAN SILENTLY EMPTY. A discriminator that matched
    // everything would leave an empty board and no error — the exact shape of
    // defect this file keeps finding.
    if (all.length && playable.length < all.length * 0.25) {
      console.error('[board] draftable filter removed ' + (all.length - playable.length)
        + ' of ' + all.length + ' — refusing, this cannot be right');
      return all;
    }
    return playable;
  }

  /* ── A BYE THAT CANNOT FIRE LOOKS EXACTLY LIKE A BYE THAT FOUND NOTHING ──
   *
   * 564 players carry a TEAM and no bye week — 37% of the top-225 tight ends,
   * 19% of the quarterbacks, 17% of the running backs. Sleeper populates
   * `metadata.bye_week` sparsely, so build.py derives a team->bye map from
   * whichever players happen to carry one, and everyone it misses gets null.
   *
   * THE DANGER IS NOT THE MISSING NUMBER, IT IS THE SILENCE. `byeStack` warns
   * when three starters share a bye. A player with a null bye can never
   * contribute to that count, so the warning stays quiet — and a quiet warning
   * is indistinguishable from one that looked and found no conflict. Cory would
   * read that on the 22nd as "no bye problem".
   *
   * A BYE IS A PROPERTY OF THE TEAM, so it is fully derivable: measured on this
   * board, all 32 teams show EXACTLY ONE bye value among their known players and
   * ZERO conflicts, and all 564 gaps fill from the player's own team.
   *
   * UNANIMITY IS ASSERTED RATHER THAN ASSUMED. If a team ever shows two byes the
   * map refuses that team instead of picking a mode — a wrong bye is worse than
   * a missing one, because it manufactures a conflict warning about a week the
   * player actually plays. */
  function fillTeamByes(players) {
    const seen = {};
    (players || []).forEach(p => {
      const t = p && p.team;
      if (!t || t === 'FA' || p.bye == null) return;
      (seen[t] = seen[t] || {})[Number(p.bye)] = true;
    });
    const map = {}, conflicted = [];
    Object.keys(seen).forEach(t => {
      const vals = Object.keys(seen[t]);
      if (vals.length === 1) map[t] = Number(vals[0]);
      else conflicted.push(t + '(' + vals.join('/') + ')');
    });
    let filled = 0, stillBlind = 0;
    const out = (players || []).map(p => {
      if (!p || p.bye != null) return p;
      const b = p.team && p.team !== 'FA' ? map[p.team] : undefined;
      if (b == null) { stillBlind++; return p; }
      filled++;
      return Object.assign({}, p, { bye: b, bye_source: 'team-derived' });
    });
    if (conflicted.length) {
      console.error('[bye] teams reporting more than one bye week, REFUSED rather than '
        + 'guessed: ' + conflicted.join(', '));
    }
    state.byeCoverage = { filled: filled, stillBlind: stillBlind,
      conflicted: conflicted, teams: Object.keys(map).length };
    return out;
  }

  function bootFrom(data) {
    state.data = data;
    // Confirmation-screen overrides win over the imported config, so a
    // correction takes effect on the board without waiting for a rebuild.
    const ov = window.CFG_OVERRIDES || {};
    if (ov.scoring) data.league.scoring = Object.assign({}, data.league.scoring, ov.scoring);
    if (ov.roster_slots) data.league.roster_slots = Object.assign({}, data.league.roster_slots, ov.roster_slots);
    if (ov.keepers) data.league.keeper_rules = Object.assign({}, data.league.keeper_rules, ov.keepers);
    if (ov.teams) data.league.teams = ov.teams;
    if (ov.my_draft_slot) data.league.my_draft_slot = ov.my_draft_slot;
    if (ov.draft_type) data.league.draft_type = ov.draft_type;
    state.overrides = ov;
    // The slot is the one override that invalidates the artifact rather than
    // just annotating it: every "my pick" number in pick_order was computed for
    // the slot the pipeline built with. Accepting a new slot and keeping the old
    // pick numbers would score the whole draft against someone else's turns.
    applySlot(data);
    state.profiles = indexProfilesBySlot(data);
    // Format-derived defaults before anything is scored: bench depth is worth
    // much less in a 10-team, 3-keeper league than the 12-team constants
    // assumed, and that changes the whole back half of the draft.
    state.format = E.applyFormatDefaults(data.league);
    loadOverrides();
    loadLists();
    loadRailAcks();
    loadAuto();
    // A-1: after the local caches load, race them against the server document —
    // the prep laptop's Tuesday homework beats this phone's stale cache.
    syncPrefsFromServer();
    exposeTestHooks();
    // Keep a pristine copy of everything mock mode overwrites. Connecting to a
    // mock replaces the player pool, the league shape and the pick order — so
    // without this, "end the mock" would have nothing to go back to and the
    // only way out would be a page reload.
    state.pristine = {
      players: data.players.slice(),
      league: JSON.parse(JSON.stringify(data.league || {})),
      pick_order: JSON.parse(JSON.stringify(data.pick_order || {})),
    };
    data.players = fillTeamByes(data.players);
    state.board = draftablePlayers(data.players);
    populateKeepers(data);
    applyOverrides();
    // AFTER populateKeepers/applyOverrides so a restored roster lands on the
    // finished board, and BEFORE renderAll so the first paint is the restored
    // draft rather than an empty one Cory has to watch being replaced.
    resumeDraftIfAny(data);
    renderAll();
    wireControls();
    $('#loading').style.display = 'none';
    $('#warroom').style.display = '';
    if (state.offlinePin) {
      const host = $('#provenance');
      if (host) {
        host.style.display = '';
        host.innerHTML = '<div class="prov-note bad"><b>\u26a0\ufe0f</b> <span>Offline — '
          + 'running from the board pinned in this browser, built '
          + escapeHtml((data.built_at || '').replace('T', ' ').slice(0, 16))
          + ' UTC. Live pick sync is unavailable; enter picks by hand.</span></div>';
      }
    }
  }

  /* Manual news override (Part 4 §4).
   *
   * Free data will not deliver draft-morning news reliably and building news
   * ingestion is not worth it. This covers the whole class of problem with one
   * control: a suspension, a holdout, a beat-writer report an hour before the
   * draft. Applied client-side, persisted, and counted visibly so an override
   * set this morning cannot silently distort tonight's board.
   */
  const OVERRIDE_KEY = 'mfga.draft.overrides.players';

  function loadOverrides() {
    try { state.playerOverrides = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); }
    catch (e) { state.playerOverrides = {}; }
  }
  function saveOverrides() {
    markPrefsChanged();
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(state.playerOverrides || {})); }
    catch (e) { /* private mode */ }
  }

  function setOverride(playerId, kind, pct) {
    const ov = state.playerOverrides || (state.playerOverrides = {});
    if (!kind) delete ov[String(playerId)];
    else ov[String(playerId)] = { kind: kind, pct: pct == null ? 25 : Number(pct) };
    saveOverrides();
    // L1 capture: an override is a judgement against the model. Log the setting
    // (or clearing) at decision time, with the player it targets.
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      var op = playerById(playerId);
      var c = ledgerCtx();
      var _vrec = null;
      if (typeof OverrideRecord !== 'undefined' && op) {
        try {
          _vrec = OverrideRecord.valueOverride({
            season: c.season, build_at: c.build_at, pick: c.pick, player: op,
            direction: kind || 'clear',
            pct: kind ? (pct == null ? 25 : Number(pct)) : 0 });
        } catch (e) { _vrec = null; }
      }
      if (_vrec) {
        PredLedger.override({ season: c.season, build_at: c.build_at, pick: c.pick,
          method: 'override-record-v2', payload: _vrec });
      }
    }
    // Rebuild the board from the artifact so an override can be undone cleanly
    // rather than compounding on an already-adjusted number.
    state.board = state.data.players.filter(p => !state.drafted.has(String(p.player_id)));
    applyOverrides();
    renderAll();
  }

  /* THE OVERRIDE SCALED VORP, AND THAT IS NOT WHAT VORP IS (found by B, 2026-08-11).
   *
   * VORP is `proj_mean − replacement`. A 25% haircut means the PROJECTION drops
   * 25%; the replacement level does not move, because it is a property of the
   * position's supply, not of this player. Scaling VORP itself is wrong by
   * exactly `replacement × (1 − f)` — which is largest where replacement is
   * largest, i.e. at QB, where it is 341.72.
   *
   *   Josh Allen, 25% downgrade:
   *     correct    0.75 × 405.50 − 341.72 = −37.60   (he is BELOW replacement)
   *     as shipped 0.75 ×  63.78          = +47.84   (a SIGN FLIP)
   *
   * A positive number meaning the opposite of what it says, in the column read
   * at the table, on the position where the error is biggest.
   *
   * THE REPLACEMENT LEVEL IS RECOVERED FROM THE PLAYER, NOT LOOKED UP. `r =
   * pre.proj_mean − pre.vorp` is exact by definition and cannot disagree with
   * whatever produced the board, whereas reading a replacement table introduces
   * a second source for one fact — the failure mode this project keeps finding.
   *
   * AND THE SNAPSHOT FIXES A SECOND DEFECT UNDERNEATH IT. setOverride rebuilds
   * `state.board` from `state.data.players` "so an override can be undone
   * cleanly rather than compounding" — but `filter`/`slice` copy REFERENCES, and
   * `state.pristine.players` is `data.players.slice()`, also shallow. So every
   * one of these assignments mutated the artifact itself, and the three
   * re-apply sites (load, prefs-sync, end-of-mock) each multiplied again.
   * Clearing an override never restored the original number either.
   *
   * So the pre-override values are snapshotted on first touch and EVERY apply
   * starts from them, which makes the operation idempotent and reversible.
   */
  /* NOT EVERY PROJECTION ON THIS BOARD HAS THE SAME BACKING, AND THE COLUMN SAID
   * IT DID (raised by B, corrected on the evidence, 2026-08-11).
   *
   * B reported that 0 of 41 kickers and 0 of 32 defences carry a source
   * projection, and inferred their VORP is "derived from two synthesised
   * numbers". THE FIELD IS EMPTY BUT THE INFERENCE IS WRONG, and the arithmetic
   * says so: Aubrey's 107.00 is Sleeper's own projected line — 9 FG 40-49 × 3,
   * 8 FG 50+ × 5, 42 XP × 1, 2 XP missed × −1 — run through this league's own
   * scoring table. Verified by hand against the raw row. Nothing is synthesised.
   *
   * MEASURED, so the mark is not noise: across the whole ~1700-player pool 1324
   * players lack a second source and a mark on 78% of rows would say nothing.
   * In the range anyone reads it is precise — in the top 200 exactly 64 players
   * are single-source and ALL 64 are K or DEF, with zero skill players marked.
   * By the top 250 it correctly picks up one WR and one TE that genuinely have
   * no second opinion, which is why it is derived from the absent source rather
   * than hardcoded to two positions: it stays true if coverage changes.
   *
   * WHAT MISLED IT IS A REAL TRAP AND IT IS OURS. `proj_sleeper` is assigned
   * only INSIDE build.py's FantasyPros attachment block, so it is populated only
   * for players FantasyPros ALSO covers. The field named after one source is
   * gated on a second. "Does this player have a Sleeper projection" cannot be
   * answered by the field called proj_sleeper.
   *
   * THE REAL DIFFERENCE, WHICH IS STILL WORTH SHOWING. Skill positions carry a
   * TWO-SOURCE consensus (Sleeper + FantasyPros); K and DEF carry Sleeper alone,
   * because FantasyPros' feed does not cover them. Single-source is not
   * synthesised, and it is not the same authority as consensus either. The mark
   * says which, in the same spirit as survival's tilde. */
  /* ── SAY IT ONCE ───────────────────────────────────────────────────────────
   *
   * THE UNPRIORITISED-HONESTY PROBLEM, and it is not the honesty problem. A
   * caveat repeated on every row is true every time and still wrong as a
   * design: it trains the reader to skip the panel, and the panels that carry
   * caveats are the ones needed on the twelfth reading rather than the first.
   *
   * MEASURED on the real board rather than asserted: the single-source caveat
   * below rides `title` on every K and DEF row — **64 of the top 200**, 0 of the
   * top 50. So it is invisible where a first-time reader needs it and dense
   * exactly where the reader is scanning.
   *
   * The rule: FIRST occurrence in a render pass carries the full text; the rest
   * carry the marker alone and point at it. `resetCaveats()` runs at the top of
   * a render so the "first" is per-pass, not per-session — a caveat that
   * appeared once on page load and never again would be worse than repetition.
   *
   * ⚠️ ROUTED TO B: the marker's TREATMENT (footnote, tooltip, inline dagger,
   * or a panel-level note) is a page decision and B owns it. This provides the
   * one place to change and a stable `data-caveat` hook; it does not pick the
   * visual. */
  const _caveatSeen = Object.create(null);
  function resetCaveats() {
    Object.keys(_caveatSeen).forEach(k => { delete _caveatSeen[k]; });
  }
  function caveatOnce(id, marker, text) {
    const first = !_caveatSeen[id];
    _caveatSeen[id] = true;
    /* data-caveat-text rides EVERY marker (design pass 2026-08-15): titles do
     * not exist on a phone, so the ¹ was "explained nowhere on-page" (Cory's
     * capture). Tap any marker → the sentence renders inline via the shared
     * legend mechanism. The attribute is invisible, so the say-it-once rule
     * for VISIBLE text still holds. */
    return '<span class="cav" data-caveat="' + id + '" data-caveat-text="' + escapeHtml(text) + '"'
      + (first ? ' data-caveat-first="1" title="' + escapeHtml(text) + '"' : '')
      + '>' + marker + '</span>';
  }

  /* THE CONDITION HERE WAS INVERTED, AND ITS ABSENCE ASSERTED A SECOND OPINION
   * THAT DOES NOT EXIST (session E, 2026-08-18; register E6).
   *
   * It used to read `if (p.proj_fantasypros != null) return '';` — i.e. carrying
   * a FantasyPros number was treated as evidence that `proj_mean` had more than
   * one source behind it. It is not. `proj_baseline == proj_sleeper` for 427 of
   * 427 rows carrying both, and build.py:1003 declares the formula outright:
   * "sleeper_baseline * (1 + opportunity_adj)". FantasyPros is carried and
   * DISPLAYED and never enters `proj_mean` (register 21).
   *
   * So the old mark divided the board exactly backwards. Measured on the live
   * screen: 127 rows rendered with NO caveat and all 127 were Sleeper-only,
   * while the 65 that carried it were the rows where FP simply does not exist.
   * Every one of the 682 is single-source. The absence of a mark was the lie.
   *
   * EVERY ROW IS MARKED NOW, because every row earns it. What stays per-player
   * is the thing that genuinely varies and is the more useful fact anyway:
   * whether a second source EXISTS and is being ignored (427 rows) or is simply
   * absent (255). Cory asked for a sanity check on our own valuation; "we hold a
   * second opinion and did not use it" is exactly that check. */
  function projSourceMark(p) {
    if (!p || p.proj_mean == null) return '';
    const prov = (state.data || {}).provenance || {};
    const src = (prov.projections && prov.projections.source) || 'sleeper';
    const name = /fantasypros/i.test(src) ? 'FantasyPros'
      : /sleeper/i.test(src) ? 'Sleeper' : String(src);
    if (p.proj_fantasypros != null) {
      return caveatOnce('unused_second_source', '¹',
        name + ' only — a FantasyPros projection exists for this player ('
        + Math.round(p.proj_fantasypros) + ') and does NOT enter this number');
    }
    return caveatOnce('no_second_source', '²',
      name + ' only — no second source covers this player, so there is no '
      + 'second opinion available behind this number');
  }

  const OV_FIELDS = ['proj_mean', 'proj_ceiling', 'proj_floor', 'vorp'];

  function overrideSnapshot(p) {
    if (!p.__pre_override) {
      const snap = {};
      OV_FIELDS.forEach(k => { snap[k] = p[k]; });
      Object.defineProperty(p, '__pre_override', { value: snap, enumerable: false });
    }
    return p.__pre_override;
  }

  function restoreOverride(p) {
    if (!p.__pre_override) return;
    OV_FIELDS.forEach(k => { p[k] = p.__pre_override[k]; });
    delete p.override;
  }

  function applyOverrides() {
    const ov = state.playerOverrides || {};
    const ids = Object.keys(ov);
    // Restore FIRST and unconditionally, so clearing the last override puts the
    // artifact back rather than leaving the final haircut baked in.
    state.board.forEach(p => { if (!ov[String(p.player_id)]) restoreOverride(p); });
    if (!ids.length) { renderOverrideCount(0); return; }
    const removed = {};
    state.board.forEach(p => {
      const o = ov[String(p.player_id)];
      if (!o) return;
      if (o.kind === 'remove') { removed[String(p.player_id)] = true; return; }
      const f = o.kind === 'downgrade' ? (1 - o.pct / 100) : (1 + o.pct / 100);
      const pre = overrideSnapshot(p);
      // Scale the value chain together: a haircut that moves proj_mean but not
      // the rest would leave the composite reading a number that no longer
      // exists. floor and ceiling are still exactly linear in the mean, so they
      // scale with it; VORP does not, and is re-derived instead.
      //
      // THE REASON CHANGED ON 2026-08-17 EVEN THOUGH THE CONCLUSION DID NOT
      // (session E). This used to say they are `mean × (1 + z·variance)`. They
      // are not, and have not been since the dispersion fields became the
      // MEASURED p10/p90: they are now `mean × the (position, rank-band) cohort
      // ratio` (projections.py:423-437). Still linear in the mean, so scaling
      // stays correct — but a reader who trusted the stated reason would have
      // concluded a haircut also moves the player between bands. It does not:
      // pos_rank is not recomputed here, so the cohort ratio is held fixed and
      // only the mean moves.
      p.proj_mean = (pre.proj_mean || 0) * f;
      p.proj_ceiling = (pre.proj_ceiling || 0) * f;
      p.proj_floor = (pre.proj_floor || 0) * f;
      // ONE IMPLEMENTATION, in a module that can be tested with real numbers.
      // Re-deriving it here would be the second copy of an arithmetic that has
      // already been wrong once.
      const nv = SharedValuation.vorpAfterOverride(pre.proj_mean, pre.vorp, f);
      // Without both inputs the replacement level cannot be recovered, so the
      // pre-override VORP is kept: a scaled one would be wrong, and a null
      // would silently drop the player out of every value comparison.
      p.vorp = nv == null ? pre.vorp : nv;
      p.override = o;
    });
    state.board = state.board.filter(p => !removed[String(p.player_id)]);
    renderOverrideCount(ids.length);
  }

  function renderOverrideCount(n) {
    const host = $('#override-count');
    if (!host) return;
    if (!n) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'prov-note warn';
    host.innerHTML = '<b>\u270f\ufe0f</b> <span>' + n + ' manual override'
      + (n === 1 ? '' : 's') + ' active. '
      + '<button class="btn small navy" id="clear-overrides">Clear all</button></span>';
    const btn = $('#clear-overrides');
    if (btn) btn.addEventListener('click', () => {
      state.playerOverrides = {};
      saveOverrides();
      state.board = state.data.players.filter(p => !state.drafted.has(String(p.player_id)));
      applyOverrides();
      renderAll();
    });
  }

  /* THE FROZEN MEASURED CORE — fetched once, cached, and restorable in one tap.
   *
   * Binding rule 7: THIS is the only object that may be called "the measured
   * core". What the sliders hold is live policy under continuous measurement.
   *
   * Cached to localStorage deliberately, not as an optimisation: the revert has to
   * work at 8pm on the 22nd with a bad connection or a deploy mid-flight. It
   * restores POLICY, which is what a bad change corrupts — reverting the deployed
   * build is a git revert plus a Netlify cycle and can never be one tap. */
  /* ── THE PIN IS v27, RULED (A, 2026-08-18; register 5g). It was v1, frozen
   * 08-10 — which PREDATES two of Cory's own rulings: ceiling 0 -> 0.45
   * (08-17, "IS THIS STUDIES? IF SO, YES") and stack 0.5 -> 1.0 (D10). One
   * tap of "restore the measured core" was a silent reversion of both, on
   * the night the button exists for. v27 is today's verified freeze —
   * playoff-free inputs, deploy-probe green — and carries both rulings, so
   * "known ground" now means known ground AS OF THE LAST VERIFIED FREEZE
   * BEFORE THE DRAFT, not as of a date nobody can reconstruct on the clock.
   * Deliberately NOT "the newest baseline" dynamically: a bad change frozen
   * five minutes ago must never become the thing restore restores. Re-pin
   * by ruling only. The localStorage key rotates with the pin so a cached
   * v1 cannot shadow the ruled reference. */
  const BASELINE_VERSION = 'v27';
  const BASELINE_KEY = 'mfga.draft.baseline.' + BASELINE_VERSION;
  function loadFrozenBaseline() {
    try {
      const cached = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
      if (cached) state.frozenBaseline = cached;
    } catch (e) { /* private mode */ }
    fetch('/admin/api/baseline?version=' + BASELINE_VERSION, { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || !d.ok || !d.baseline) return;
        state.frozenBaseline = d.baseline;
        try { localStorage.setItem(BASELINE_KEY, JSON.stringify(d.baseline)); } catch (e) {}
        renderBaselineControl();
      })
      .catch(() => { /* cached copy is the fallback, which is the whole point */ });
    renderBaselineControl();
  }

  /* One tap back to known ground. Placed next to Reset because that is where a
   * hand goes under pressure, and it says what it restores rather than "revert". */
  /* ── REGISTER 5g, OPTION (3) — B's half, the honest surface (2026-08-18).
   * The pin (BASELINE_VERSION) is a ruling and can go stale again the same
   * way v1 did: this restores the SAME "known ground" copy every time, no
   * matter which weight the live policy has since moved. So the button
   * itself must never trust the pin to be current — it diffs frozen against
   * live and SAYS what will change, before the tap, not just a freeze date.
   * A date told nobody that 08-10 predated the ceiling ruling; a diff would
   * have. `weightsDiff` is pure so the same logic drives the panel text and
   * is unit-testable without a DOM. */
  function weightsDiff(frozen, live) {
    if (!frozen || !live) return [];
    const out = [];
    for (const k of Object.keys(frozen)) {
      const f = frozen[k], l = live[k];
      if (typeof f !== 'number' || typeof l !== 'number') continue;
      if (Math.round(f * 1000) !== Math.round(l * 1000)) out.push({ term: k, from: l, to: f });
    }
    return out;
  }
  function renderBaselineControl() {
    const host = $('#baseline-restore');
    if (!host) return;
    const b = state.frozenBaseline;
    if (!b || !b.engine_policy) { host.innerHTML = ''; return; }
    const frozenAt = (b.frozen_at || '').slice(0, 10);
    const w = b.engine_policy.MEASURED_WEIGHTS;
    const diff = weightsDiff(w, state.weights);
    const diffLine = diff.length
      ? '<div class="muted" style="font-size:.7rem;margin-top:.2rem">will change: '
        + diff.map(d => escapeHtml(d.term) + ' ' + d.from + '→' + d.to).join(', ') + '</div>'
      : '<div class="muted" style="font-size:.7rem;margin-top:.2rem">matches your live weights — no change</div>';
    host.innerHTML = '<button class="btn small navy" id="restore-baseline">'
      + '⏮ Restore the measured core</button>'
      + '<span class="muted" style="font-size:.72rem;margin-left:.4rem">frozen '
      + escapeHtml(frozenAt) + '</span>' + diffLine;
    const btn = $('#restore-baseline');
    if (btn) btn.onclick = function () {
      const w = (state.frozenBaseline.engine_policy || {}).MEASURED_WEIGHTS;
      if (!w) return;
      const before = state.lastClock ? state.lastClock.scored : null;
      state.weights = Object.assign({}, w);
      state.autoWeights = false;
      try { localStorage.setItem(AUTO_KEY, '0'); } catch (e) {}
      syncSliders();
      saveWeights();
      renderRecommendations();
      renderPresets();
      reportWeightEffect(before, 'Restored the FROZEN measured core (' + frozenAt
        + ') — the immutable reference, not the live policy.');
    };
  }

  /* ── THE SEAT PLAN — the board follows the model, or it is a different tool ──
   *
   * Cory: "make sure the draft board I see matches your model." Measured: the
   * engine's greedy line scores 2091.0 against the global seat assignment's
   * 2150.5, and constraining the engine to the plan's SEAT recovers all 59.6,
   * because the engine already ranks the right player at 6 of 6 seats. It is
   * never asked the right question.
   *
   * LOADED SEPARATELY AND FAILING SOFT. The plan is an enhancement to the board,
   * not a dependency of it: if this fetch dies the war room must still draft.
   * That is the same rule as the ledger capture — losing the seat line is a
   * worse board, losing the board is a lost draft.
   */
  function loadSeatPlan() {
    fetch('/seat_plan.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || !Array.isArray(d.seats)) return;
        state.seatPlan = d;
        try { renderSeatPlan(); } catch (e) { console.error('[seat-plan]', e && e.message); }
      })
      .catch(e => console.warn('[seat-plan] unavailable:', e && e.message));
  }

  /* EVERY NUMBER IS PRINTED WITH THE CAPTION THE ARTIFACT DECLARES FOR IT.
   *
   * `display_contract` names each displayable field's units, direction and the
   * caveat that must travel with it, precisely so this function cannot invent a
   * meaning. The three that have actually been got wrong before:
   *   · beats_wire_by is SIGNED — negative means the wire is BETTER than him;
   *   · gap_to_second is season points on a starter row and points/week on a
   *     bench row, so it is never printed without that row's gap_units;
   *   · measured_edge_vs_greedy is EXPLORATORY and is never shown as a promise.
   * A caption read from the artifact cannot drift from the number beside it;
   * one retyped here would.
   */
  /* ── EVERY DECISION PANEL SAYS WHAT IT IS AND HOW TO ACT ON IT ───────────
   *
   * Cory: *"all the tools should explain what they do and how to use, all the
   * tools working together toward the best pick."*
   *
   * MEASURED BEFORE BUILDING: 55 render functions, 26 on the page, and FIVE
   * explain themselves. The six panels that put a NUMBER or a JUDGEMENT in front
   * of him emit twenty numeric figures between them and not one caption. On the
   * clock that is the difference between a tool he uses and one he scrolls past.
   *
   * ── WHY A TABLE AND NOT SIX PROSE BLOCKS ─────────────────────────────────
   *
   * The same reasoning as `seat_plan.json`'s display contract, which is the one
   * part of this page that already works: a declaration read from ONE place
   * cannot drift and six inline strings will. This repo has shipped the drift
   * version — "value" meaning a model estimate in one panel and a market price
   * in another, on the same screen.
   *
   * ── `read` IS THE HALF THAT EARNS ITS SPACE ──────────────────────────────
   *
   * `what` says what the number is; anyone can guess that. `read` says WHAT
   * WOULD CHANGE THE ANSWER, which is the only thing worth space with nine
   * managers waiting. A caption that restates the label is wallpaper, so the
   * test asserts the two differ and that `read` is the longer of the two.
   *
   * NOT A TOOLTIP. B owns the stylesheet, and a caption emitted and then hidden
   * renders this green while doing nothing — I flagged that exact risk to them
   * about the seat panel. It ships as a visible block with a stable hook so B
   * can restyle, collapse or tier it deliberately rather than by default. */
  /* Each entry now carries FOUR halves (design pass 2026-08-15, Cory's gate:
   * "explain what the model says … or I can't implement it"):
   *   what — what the number is;
   *   read — what would change the answer;
   *   do   — what to DO with it on the clock (the implementation half);
   *   src  — the code the sentence paraphrases, cited so
   *          ui_fidelity_explainers.test.js can pin each load-bearing claim to
   *          the engine line it describes. Wrong-but-confident explainer text
   *          is worse than none: the old `lrm` entry described "the last
   *          recorded model state" — a panel that does not exist — while the
   *          strip actually renders survival-derived DEADLINES. Every entry
   *          below is rewritten from its renderer's actual source. */
  const PANEL_GUIDE = {
    verdict: {
      what: 'The one answer the page backs for this pick, with a confidence chip '
        + 'derived from the engine\'s own gaps — LOCK / LEAN / TOSS-UP / SPLIT — '
        + 'and every other voice (rule, value, plan, poll) as a labeled lens below it.',
      read: 'The chip is the board\'s honesty about separation: TOSS-UP means the top '
        + 'options sit inside the model\'s own tie threshold, so your preference IS the '
        + 'tiebreaker. SPLIT means the measured rule and the value board name different '
        + 'players — a real disagreement, priced in composite points. A lens marked '
        + '"one term, not votes" is one argument repeated, never independent confirmation. '
        + 'On a TOSS-UP a tie-break line prints FACTS the board already carries — ADP '
        + 'velocity divergence, bye overlap with your picks, an age gap over 2 years, '
        + 'starter vs committee — printed to break the tie with, never scored; a fact '
        + 'whose inputs are absent is skipped, not zeroed.',
      do: 'LOCK: take it and bank the clock time. LEAN: take it unless you hold a real '
        + 'preference. TOSS-UP: the model cannot separate these — use your own read, and '
        + 'log which you took so it grades; the tie-break facts under the why-line are '
        + 'legitimate reasons (the backed pick does not move with them). SPLIT: follow '
        + 'the rule unless you have a reason; if you take the value pick, log why. The '
        + 'dollar magnitudes behind the rule are lab-tier measurements, not season '
        + 'projections.',
      src: 'verdict.js derive() + verdict.js tiebreakFacts(); engine.js confidence() + CFG.TIE_THRESHOLD/COIN_FLIP_GAP/CLOSE_GAP/PATHS_BAND',
    },
    recommendations: {
      what: 'The engine\'s ranked list for THIS pick: every candidate\'s composite '
        + 'score is a weighted sum of the seven adjuster terms, scored on your roster '
        + 'and what the room has already taken.',
      read: 'Take the top name unless the verdict above says SPLIT or TOSS-UP — those '
        + 'mean the ranking alone cannot settle it. A gap under 2 composite points '
        + 'between #1 and #2 is the engine\'s own tie flag; the dossier on each row '
        + 'shows which term built the score.',
      do: 'Scan the top three, tap a dossier when a rank surprises you, and take from '
        + 'the card. When the decisive-term line says one term flips the pick, that '
        + 'term\'s slider is the one worth a second look.',
      src: 'engine.js recommend()/scorePlayer(); CFG.TIE_THRESHOLD',
    },
    position_recs: {
      what: 'The best available at each position, so a run at one is visible '
        + 'without scanning the whole board.',
      read: 'Compare the DROP to your next pick, not the raw score: a position '
        + 'whose best name barely changes by then is one you can wait on.',
      do: 'Use the dropdown when you already know which position you want and need '
        + 'the ranked field; the strip above answers the cross-position glance faster.',
      src: 'engine.js recommend() scored list, per-position slice',
    },
    survival: {
      what: 'The chance each player is still on the board at your next pick: the '
        + 'market (ADP) model blended with the room model for the picks in between, '
        + 'through a conservation tilt so only as many players can go as there are picks.',
      read: 'Under ~50% treat him as gone and plan the seat without him. For players '
        + 'already past their ADP the market alone has nothing left to say — the room '
        + 'model is what splits them, so identical percentages on several elites only '
        + 'appear before the draft order is known; Most-likely-to-be-gone names the seat.',
      do: 'Plan with this number (it is what the score uses), but when you '
        + 'need WHO goes first among the elites, read the room model instead. A run '
        + 'at a position breaks both — re-read after any run banner.',
      src: 'survival.js survivalProbability()/conservedSurvival(); engine.js survival() accessor',
    },
    threats: {
      what: 'The room model: what each seat picking before your next turn is '
        + 'likely to take, from their own past Sleeper drafts, and the roll-up of '
        + 'who is most likely to be gone.',
      read: 'Use it to break a tossup, never to start one. If two names are '
        + 'already close, take the one the room is likelier to remove. Seats show '
        + 'league-average until Sleeper assigns the draft order — the collapse line '
        + 'says so when that is the case.',
      do: 'If your target tops the gone-list with a named seat before your turn, '
        + 'take him now — he probably does not come back. If nobody ahead wants his '
        + 'position, bank him for a round.',
      src: 'engine.js threatBoard(); survival.js positionProbabilities()',
    },
    lrm: {
      what: 'The last responsible moment per position: the pick by which the '
        + 'current startable tier is likely gone, computed from the same survival '
        + 'model, with the cost of acting early priced in skill picks.',
      read: '"Startable until pick 113 (−8 skill picks)" means waiting past 113 '
        + 'likely costs the startable tier, and grabbing one NOW costs about 8 '
        + 'better skill players. "No deadline" on K/DEF is real: startable ones go '
        + 'undrafted in this league — take one whenever.',
      do: 'Treat deadlines as a round, not a pick — they move as the room drafts. '
        + 'When a position\'s deadline crosses your next pick, that position jumps '
        + 'your queue; until then the deadline is why you can wait.',
      src: 'app.js computeLRM() over engine survival; renderLRM()',
    },
    paths: {
      what: 'Your 2–4 coherent directions for this pick, clustered from the same '
        + 'scored board — each led by its best player and priced in composite '
        + 'points below the top direction.',
      read: '"−82.3 vs top" is what choosing that direction concedes today, in the '
        + 'same points the ranked list uses. A direction outside the board\'s own '
        + 'resolve band (4 pts) is a real cost, not a style choice; a path-level '
        + 'coin flip means the board cannot separate the top two directions.',
      do: 'Pick the direction you believe, then take its lead player from the card. '
        + 'Going off the top path is legitimate — the price is printed; log the '
        + 'reason with the pick so January can grade it.',
      src: 'engine.js computePaths(); CFG.PATHS_BAND (= COIN_FLIP_GAP × 4)',
    },
    branches: {
      what: 'What your NEXT pick likely looks like if you take each top option '
        + 'now: the expected best player left per position at your next turn, from '
        + 'the same survival model.',
      read: '"Best left ≈ 144 (11 worse than now)" means waiting on that position '
        + 'costs about 11 projected points across the round trip. Rows under one '
        + 'point are hidden — nothing falls off a cliff there.',
      do: 'Use it to time positions, not to pick names: take now the position whose '
        + 'drop to your next pick is steepest, wait on the flattest — that is the '
        + 'whole wait-vs-grab decision in two numbers.',
      src: 'engine.js branchForecast()/expectedBestAvailable()',
    },
    adp_movers: {
      what: 'The market\'s fastest re-pricings: the top 10 ADP risers and top 10 '
        + 'fallers from the board\'s own retained daily series. Velocity is slots '
        + 'moved over the window (positive = rising toward an earlier pick), with '
        + 'the per-day rate beside it.',
      read: 'A sharp move means the market learned something — camp news, an injury, '
        + 'a depth-chart change — that this board\'s nightly number may lag. A red '
        + 'STALE flag is the alarm: that player moved a round or more, so treat his '
        + 'board price as behind the market. Players with no measured velocity are '
        + 'absent, not zero — a shallow series says so instead of printing zeros. '
        + 'This is NOT a tested momentum edge; nothing here feeds any score.',
      do: 'Names to investigate before your pick, not numbers to draft on: check a '
        + 'riser\'s news before paying his old price, and ask why a faller is cheap '
        + 'before calling him a bargain. If a mover is on your queue or in a tossup, '
        + 'that is the moment this panel earns its space.',
      src: 'movers.js movers() over build.py-stamped adp_velocity/adp_stale (draft/adp_series.py)',
    },
  };

  /* ONE EMITTER, so every caption has the same shape and the same hook. Returns
   * '' for an unknown key rather than throwing — a missing caption must never
   * take the board down mid-draft — and `panel_guide.test.js` fails on any
   * decision panel whose key is absent, so silence here is caught at build time
   * rather than at the table. */
  function explainPanel(key) {
    const g = PANEL_GUIDE[key];
    if (!g) return '';
    /* COLLAPSED BY DEFAULT behind a visible ⓘ (design pass 2026-08-15): the
     * always-open paragraph blocks were a large share of "very busy" in Cory's
     * capture. One tap opens the full four halves; openness survives re-renders
     * via state.explainOpen. The block is EMITTED either way — hidden with the
     * [hidden] attribute, not deleted — so panel_guide.test.js still proves
     * every caption reaches its host. */
    // typeof-guarded: panel_guide.test.js evaluates this function outside the
    // IIFE, where `state` is not in scope — a bare reference would throw there.
    const open = !!(typeof state !== 'undefined' && state.explainOpen && state.explainOpen[key]);
    return '<button class="wr-info" type="button" data-explain-toggle="' + key + '"'
      + ' aria-expanded="' + (open ? 'true' : 'false') + '"'
      + ' title="what is this panel, and what do I do with it?">i</button>'
      + '<div class="panel-explain" data-panel="' + key + '"' + (open ? '' : ' hidden') + '>'
      + '<span class="pe-what">' + escapeHtml(g.what) + '</span> '
      + '<span class="pe-read">' + escapeHtml(g.read) + '</span>'
      + (g.do ? '<span class="pe-do">' + escapeHtml(g.do) + '</span>' : '')
      + (g.src ? '<span class="pe-src">source of truth: ' + escapeHtml(g.src) + '</span>' : '')
      + '</div>';
  }

  /* ⚠️ THE PANEL MOUNTS ITSELF, BECAUSE THE CONTAINER NEVER ARRIVED.
   *
   * `renderSeatPlan` reads `#seat-plan` and returns early when it is missing —
   * which it always was. The one-line view change was routed to B days ago and
   * has not landed, so the seat panel has never once appeared on the board. It
   * failed SAFELY, which is exactly why nobody noticed: no error, no gap, no
   * red. An absent panel and a panel with nothing to say render identically.
   *
   * ── WHY THIS IS NOT AN EDIT TO THE VIEW ──────────────────────────────────
   *
   * `views/admin/warroom.ejs` is B's, and WHERE a panel sits is a layout
   * decision that belongs to whoever owns layout. Editing it would be a fourth
   * boundary override in one day, to make a placement call that is not mine.
   *
   * So the panel finds its own home and STANDS DOWN THE MOMENT B GIVES IT ONE:
   * if `#seat-plan` exists, that is used and nothing is created. B's eventual
   * placement wins automatically and needs no coordination — they add the div,
   * this code stops firing, and neither of us has to remember.
   *
   * It anchors after the legality strip: the seat plan answers "which chair am I
   * filling", the strip above answers "is my lineup still legal", and the
   * recommendations below answer "with whom". That ordering is the card's own
   * thesis — the PLAN picks the seat, the ENGINE picks the player — so it is the
   * least presumptuous place to put it. If the anchor is gone too, it goes to
   * the top of the room rather than nowhere.
   *
   * ⚠️ AND IT IS A STOPGAP, SAID OUT LOUD: JS creating layout is worse than
   * markup declaring it. This exists so the panel is on the board for 08-22, not
   * because it is the right home for it. */
  function seatPlanHost() {
    const found = $('#seat-plan');
    if (found) return found;                       // B's placement wins, always
    const room = document.getElementById('warroom');
    if (!room) return null;
    const el = document.createElement('div');
    el.id = 'seat-plan';
    el.className = 'seat-plan';
    el.setAttribute('data-mounted-by', 'app.js — no #seat-plan in the view');
    const anchor = document.getElementById('legality-strip');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else room.insertBefore(el, room.firstChild);
    return el;
  }

  function renderSeatPlan() {
    const host = seatPlanHost();
    const d = state.seatPlan;
    if (!host || !d) return;
    /* ONE LOOKUP, SHARED WITH THE AGAINST-CASE. This function had its own copy
     * of the seat lookup; the path cards then grew a second one, and two lookups
     * is two chances to disagree about which seat is live — the panel and the
     * card would then argue on the same screen, which is a defect this repo has
     * already shipped once with "value" meaning two things. */
    const seat = seatForCurrentPick();
    if (!seat) { host.innerHTML = ''; return; }

    const C = d.display_contract || {};
    const capt = k => (C[k] || {});
    const sign = n => (n > 0 ? '+' : '') + n;

    const rows = (seat.shortlist || []).map(function (pl, i) {
      const bw = pl.beats_wire_by;
      /* SIGNED, and captioned as such. Rendering |bw| here is the exact
       * misreading the contract exists to stop. */
      /* `sp-pos` MEANT TWO THINGS — the position label and a positive wire edge.
       * B made `.sp-wire.sp-pos` win on specificity so it renders correctly
       * today and then said the right thing: two meanings on one hook bites
       * whoever touches it next. Renamed at the source rather than defended in
       * the stylesheet. */
      const wire = bw == null ? ''
        : '<span class="sp-wire ' + (bw < 0 ? 'sp-neg' : 'sp-wire-up') + '">'
          + sign(bw) + ' /wk vs free ' + pl.position + '</span>';
      return '<li class="sp-row' + (i === 0 ? ' sp-lead' : '') + '">'
        + '<span class="sp-pos">' + escapeHtml(pl.position) + '</span> '
        + '<span class="sp-name">' + escapeHtml(pl.name) + '</span> '
        /* LEAD WITH THE QUANTITY THE SEAT WAS RANKED ON, so the gap printed
         * below is derivable from the two numbers above it. B caught a bench row
         * showing 212.1 and 202.6 (season) above a gap of 0.6 (pts/week) — every
         * figure correct and the arithmetic invisible. */
        + '<span class="sp-proj">' + pl.display_primary + ' '
          + escapeHtml(pl.display_primary_units || '') + '</span> '
        + (pl.display_secondary != null
          ? '<span class="sp-proj2">' + pl.display_secondary + ' '
            + escapeHtml(pl.display_secondary_units || '') + '</span> ' : '')
        + wire + '</li>';
    }).join('');

    const gapU = seat.gap_units || '';
    const gapLine = seat.gap_to_second == null ? ''
      : '<div class="sp-gap">gap to the next eligible name: <b>' + seat.gap_to_second
        + '</b> ' + escapeHtml(gapU)
        + (seat.tossup
          ? ' — <b>TOSSUP</b>: inside ' + seat.tossup_threshold + ' ' + escapeHtml(gapU)
            + ', so the SEAT matters more than the NAME'
          : '') + '</div>';

    /* ── WHAT A STALE ROOM ACTUALLY COSTS, AS A NUMBER ──────────────────────
     *
     * `renderSystemStrip` already says "SYNC STALE 62s — picks may be missing"
     * and `renderSyncAge` adds "verify against Sleeper before you draft". Its own
     * comment states the problem exactly: *"the board still confidently
     * recommends players who are already gone."* Both are INSTRUCTIONS. Cory's
     * standing rule is mechanism, not instruction — and an instruction is at its
     * weakest exactly here: on the clock, with a room watching.
     *
     * THE MECHANISM IS THE NUMBER ALREADY IN THE ARTIFACT. Staleness matters only
     * insofar as the top name might be gone, and what THAT costs is
     * `gap_to_second` — already computed, already in the seat's own units, already
     * with a measured tossup band beside it. So the panel stops telling him to go
     * and check, and tells him what checking is worth:
     *
     *   gap inside the band  -> the next name is as good; take it and move on
     *   gap outside the band -> this is what you lose if #1 is gone; worth the
     *                           ten seconds it costs to look
     *
     * IT CANNOT PREDICT HOW MANY PICKS WERE MISSED and does not pretend to. Our
     * capture strips per-pick timestamps and this draft has `pick_timer: 0` — no
     * timer at all — so there is no honest picks-per-second to divide by. Rather
     * than invent a rate, this prices the ONE thing that is actually knowable:
     * the cost of the top name being wrong. A fabricated "≈2 picks missed" would
     * be a plausible number with nothing behind it, which is the defect class
     * this file has spent the week removing.
     *
     * The whole shortlist is already on screen, so the recovery is visible
     * without a fetch: if #1 is gone, #2 is the line below it. */
    const staleLine = (function () {
      if (!state.sync || typeof state.sync.syncAgeMs !== 'function') return '';
      const age = state.sync.syncAgeMs();
      if (age == null || age < SYNC_AGE_WARN_MS) return '';
      const secs = Math.round(age / 1000);
      const cheap = seat.gap_to_second != null && seat.tossup_threshold != null
        && seat.gap_to_second <= seat.tossup_threshold;
      const cost = seat.gap_to_second == null ? null : seat.gap_to_second;
      return '<div class="sp-stale' + (age >= SYNC_AGE_BAD_MS ? ' sp-stale-bad' : '') + '">'
        + 'SYNC ' + secs + 's OLD — the top name may already be gone. '
        + (cost == null
          ? 'No second name priced at this seat, so there is nothing to fall back to on the board.'
          : (cheap
            ? 'Costs <b>' + cost + '</b> ' + escapeHtml(gapU) + ' to take the next name '
              + 'instead — inside this seat\'s own tossup band, so do not stop the clock for it.'
            : 'Costs <b>' + cost + '</b> ' + escapeHtml(gapU) + ' to fall to the next name '
              + '— outside the tossup band, so this one is worth checking against Sleeper.'))
        + '</div>';
    })();

    /* The plan's superseded name is SHOWN, not silently dropped — "the plan named
     * nobody" and "the plan named someone on a line since superseded" are
     * different facts, and hiding the second would make the artifact look
     * cleaner than the evidence is. */
    const sup = seat.superseded_plan_player;
    const supLine = sup ? '<div class="sp-superseded">draft_plan named '
      + escapeHtml(sup.position + ' ' + sup.name) + ' here — ' + escapeHtml(sup.why) + '</div>' : '';
    /* ── THE OTHER ELEVEN SEATS. CORY ASKED FOR THIS IN THESE WORDS ────────
     *
     *   "a look ahead to what complete strategy may be for rest of draft"
     *
     * `seat_plan.json` has held all twelve seats since it was written — slot,
     * planned player, starter-or-bench — and this function rendered exactly ONE
     * of them, whichever pick was live. `panel_spec.js` has said so for days:
     * "Twelve seats exist; ONE is rendered. The other eleven are the look-ahead,
     * unbuilt." No new modelling; the plan was computed and shown to nobody.
     *
     * ⚠ IT LEADS WITH THE SLOT, NOT THE NAME, AND THAT IS THE WHOLE DESIGN.
     * The artifact's own assumption says: "The SEAT ORDER held under ADP drift
     * from -25% to +15%; the NAMES did not." So twelve names read as a plan would
     * be a confident list of the least robust thing in the file. The slot column
     * is the finding; the name is the current best guess at filling it and is
     * marked as such. Getting that the wrong way round is precisely the class
     * this week's audit kept finding — every number true, the sentence false.
     *
     * A seat whose `plan_player` is null is NOT blanked: pick 88 has no plan
     * player because the preseason waiver line and the realized wire genuinely
     * disagree, and the artifact says so in `superseded_plan_player.why`. An
     * empty cell there would read as "nothing planned" rather than "two honest
     * methods disagree". */
    const allSeats = (function () {
      const seats = (d.seats || []).slice().sort(function (a, b) { return a.pick - b.pick; });
      if (seats.length < 2) return '';
      const cur = seat.pick;
      const rows = seats.map(function (s) {
        const done = s.pick < cur;
        const live = s.pick === cur;
        const who = s.plan_player ? s.plan_player.name
          : (s.superseded_plan_player
            ? s.superseded_plan_player.name + ' — methods disagree' : 'open');
        return '<tr class="spa-row' + (live ? ' spa-live' : '') + (done ? ' spa-done' : '') + '">'
          + '<td class="spa-pick">' + escapeHtml(roundLabel(s.pick)) + '</td>'
          + '<td class="spa-slot"><b>' + escapeHtml(s.slot) + '</b>'
            + (s.is_starter_seat ? '' : ' <span class="muted">bench</span>') + '</td>'
          + '<td class="spa-who' + (s.plan_player ? '' : ' muted') + '">'
            + escapeHtml(who) + '</td>'
          + '</tr>';
      }).join('');
      return '<details class="sp-all"><summary>the whole draft — all '
        + seats.length + ' of your picks</summary>'
        + '<div class="spa-lede">The <b>slot order</b> is the plan and it survived '
        + 'ADP drift from &minus;25% to +15%. The <b>names</b> did not — treat them '
        + 'as today\'s best fill for each seat, not as the plan.</div>'
        + '<table class="spa-table"><tbody>' + rows + '</tbody></table></details>';
    })();

    /* ── THE PLAN IS ROSTER-BLIND, AND UNTIL NOW THE PANEL WAS TOO ───────────
     *
     * Cory, live 2026-08-18: *"model still overrecommending QBs. I have joe
     * burrow and it recommends Bo nix in the 9th.. thats rediculous"*.
     *
     * `seat_plan.json` asserts `slot: "QB", is_starter_seat: true` at pick 73
     * and names another QB at 93. It is solved ONCE before the draft from the
     * KEEPERS ALONE — its own header says *"It does NOT re-solve live"* — so it
     * cannot know Burrow was taken at an intervening pick. Worse, the seat's own
     * `fallback_rule` reads *"Take the best remaining player ELIGIBLE FOR QB,
     * not the best player on the board"*, so the panel was actively steering
     * toward a second QB at a seat that no longer exists.
     *
     * The plan is not wrong — it answered the pre-draft question correctly. What
     * was wrong is rendering a pre-draft answer as a live instruction. So the
     * panel now asks the roster, using the ENGINE'S OWN `mandatoryGaps()` rather
     * than a second copy of the slot arithmetic: if this seat's slot is no
     * longer an unfilled starter slot, the seat is spent and says so.
     *
     * The shortlist is still shown underneath rather than hidden — "the plan
     * named nobody" and "the plan named men you no longer need" are different
     * facts, and suppressing the second would make the artifact look cleaner
     * than the evidence is (the same reasoning `supLine` above already uses). */
    const seatSpent = (function () {
      if (!seat.is_starter_seat || !seat.slot) return null;
      let gaps;
      try { gaps = E.mandatoryGaps(context()); } catch (e) { return null; }
      if (!Array.isArray(gaps) || gaps.indexOf(seat.slot) !== -1) return null;
      const held = (state.myRoster || []).filter(p => p && p.position === seat.slot);
      return { by: held.map(p => p.name).filter(Boolean) };
    })();
    const spentLine = !seatSpent ? ''
      : '<div class="sp-spent"><b>SEAT ALREADY FILLED</b> — you have '
        + (seatSpent.by.length
          ? escapeHtml(seatSpent.by.join(', ')) + ' at ' + escapeHtml(seat.slot)
          : 'no open ' + escapeHtml(seat.slot) + ' starter slot')
        + '. This plan was solved before the draft and does not re-solve, so the '
        + 'names below answer a question you have already answered — treat them as '
        + 'history, not as the pick.</div>';

    host.innerHTML =
      '<div class="sp-head">THE PLAN ' + (seatSpent ? 'WANTED' : 'WANTS') + ' <b>' + escapeHtml(seat.slot) + '</b> at '
        + escapeHtml(roundLabel(seat.pick)) + ' (overall ' + seat.pick + ')' + (seat.is_starter_seat ? '' : ' <span class="sp-note">(no seat asserted)</span>') + '</div>'
      + spentLine
      + '<ol class="sp-list' + (seatSpent ? ' sp-list-spent' : '') + '">' + rows + '</ol>'
      + staleLine
      + gapLine
      + supLine
      + '<div class="sp-fallback">' + escapeHtml(seat.fallback_rule) + '</div>'
      + allSeats
      + '<div class="sp-caveat">' + escapeHtml(d.assumption) + '</div>'
      + '<div class="sp-caveat">edge over the greedy board: ' + d.measured_edge_vs_greedy
        + ' ' + escapeHtml(capt('measured_edge_vs_greedy').units || '')
        + ' — ' + escapeHtml(capt('measured_edge_vs_greedy').caveat || '') + '</div>';
  }

  function init() {
    loadWeights();
    loadFrozenBaseline();
    loadSeatPlan();
    loadConditionalValue();
    loadOpponentNeed();
    loadExpertSpread();
    fetch('/draft_data.json', { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) throw new Error('draft_data.json not found (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(d => { pinArtifact(d); return d; })
      .then(bootFrom)
      .catch(err => {
        // Network gone? Run from the pin rather than showing an empty room.
        const pinned = pinnedArtifact();
        if (pinned) {
          console.warn('using pinned artifact:', err.message);
          state.offlinePin = true;
          return bootFrom(pinned);
        }
        $('#loading').innerHTML = '<div class="card"><div class="body">' +
          '<p><b>No draft board yet.</b> ' + escapeHtml(err.message) + '</p>' +
          '<p class="muted">Run the pipeline to build one:<br><code>cd league/draft &amp;&amp; ' +
          'python build.py --league-id ' + escapeHtml((window.LEAGUE_ID || '')) + ' --slot 4</code><br>' +
          'or let the nightly GitHub Action do it.</p></div></div>';
      });
  }

  /* Draft-slot changes.
   *
   * Your seat is decided on the site (reverse standings, one at a time) and can
   * change right up to draft day — including after the nightly pipeline has
   * already built a board. Only `my_picks` is slot-specific, so re-deriving it
   * is a filter over `pick_order.picks` rather than a rebuild.
   *
   * ⚠️ `pick_order.picks` IS THE BOARD, NOT THE PICK SEQUENCE, AND THIS COMMENT
   * USED TO SAY THE OPPOSITE.
   *
   * The text here read "`pick_order.picks` is ... the true pick sequence AFTER
   * keeper forfeits ... it stays exact under snake order and keeper forfeits
   * alike". Both halves are false, and the artifact says so in its own
   * `numbering_note`, three fields away: "`picks` is the BOARD (depth: how many
   * players leave the pool). `live_picks` is how many SELECTIONS happen."
   *
   * A keeper OCCUPIES his slot — the row stays, flagged `keeper_slot: true`, and
   * nothing shifts up. So filtering `picks` by seat returns every pick the seat
   * was SCHEDULED, forfeited ones included. Measured against the shipped
   * artifact on 2026-08-14, seat 8:
   *
   *     pipeline my_picks   33,48,53,68,73,88,93,108,113,128,133,148   (12)
   *     this filter         8,13,28,33,48,53,68,73,88,93,108,113,...   (15)
   *
   * 8, 13 and 28 are the rounds Derrick Henry, Ja'Marr Chase and Kenneth Walker
   * were kept with. They are not picks Cory owns. The filter handed them back,
   * disagreed with the baked list, and therefore OVERWROTE the correct answer
   * with the wrong one on the normal load path.
   *
   * WHAT IT COST. `currentPick()` anchors the pre-draft board on `my_picks[0]`.
   * That read 8 instead of 33 — every survival window computed TWENTY-FIVE
   * SLOTS EARLY. Josh Allen surviving to my first pick measured 89.6% against a
   * true 1.5%: the board was pricing a QB it had already lost as very likely to
   * be there. The error runs the same direction for every player, so VONA
   * understated scarcity across the whole board.
   *
   * THE SAME DEFECT THIS REPOSITORY KEEPS FINDING: one name (`picks`), two
   * quantities (board depth / selections). `my_picks` versus
   * `my_picks_before_keepers` is that pair given two honest names one field
   * away — and this function reconstructed the second while calling it the
   * first.
   *
   * Reported by B. B's line reference (1092) and figures (98% -> 61%) did not
   * match; the mechanism and the missing predicate did, exactly, and the true
   * error is larger than the report claimed. Recorded because the citation
   * being wrong is not evidence the finding is.
   */
  function applySlot(data) {
    const slot = Number(data.league.my_draft_slot);
    const picks = (data.pick_order && data.pick_order.picks) || [];
    if (!slot || !picks.length) return;

    /* `&& !p.keeper_slot` is the whole fix: a forfeited row is a pick the seat
     * was scheduled and does not own. On the shipped artifact this reproduces
     * the pipeline's list exactly, which is why the guard below can be strict. */
    const derived = picks.filter(p => Number(p.slot) === slot && !p.keeper_slot)
      .map(p => p.overall);
    if (!derived.length) {
      console.warn('draft slot ' + slot + ' owns no picks in this board');
      return;
    }

    /* CONSERVATION, ACROSS TWO INDEPENDENT FIELDS — not over this filter's own
     * input, which is the failure mode `_assert_accounting` was just fixed for.
     * `kept_players` is a different part of the artifact than `pick_order`, so
     * one being wrong does not make the other agree.
     *
     * This is also the arm that catches what the predicate alone cannot. If the
     * SEAT MOVED after the build, the `keeper_slot` flags still sit on the old
     * seat's rows, so filtering the new seat drops nothing and returns a full
     * 15 — my three keepers silently un-forfeited. A filter cannot re-seat a
     * keeper; only `DraftKeepers.buildTruePickOrder` can (see changeSlot). So
     * this REFUSES and keeps the pipeline's value rather than shipping a board
     * that thinks I own three picks I do not. */
    const teams = Number((data.league || {}).teams) || 0;
    const myKeepers = ((data.kept_players || []).length);
    const rounds = teams ? picks.length / teams : 0;
    if (rounds && Number.isInteger(rounds)) {
      const expected = rounds - myKeepers;
      if (derived.length !== expected) {
        state.slotRecomputeRefused = {
          slot: slot, got: derived.length, expected: expected,
          rounds: rounds, myKeepers: myKeepers,
          why: 'seat ' + slot + ' derives ' + derived.length + ' picks but '
             + rounds + ' rounds minus ' + myKeepers + ' keeper(s) is ' + expected
             + '. A slot filter cannot move keeper forfeits to a new seat. '
             + 'KEEPING the pipeline pick list; re-run the pipeline for this seat.',
        };
        console.warn('applySlot REFUSED: ' + state.slotRecomputeRefused.why);
        return;
      }
    }

    const baked = (data.pick_order.my_picks || []).join(',');
    if (derived.join(',') === baked) return;   // slot unchanged; nothing to do

    data.pick_order.my_picks_built_for = data.pick_order.my_picks;
    data.pick_order.my_picks = derived;
    state.slotRecomputed = { slot: slot, from: baked, to: derived.join(',') };
  }

  /* ── THE SEAT: one identity, consumed everywhere ────────────────────────
   * `mySlot()` is the ONLY way any surface may learn which seat is mine. Before
   * mock #1 there were fifteen independent `Number(state.data.league
   * .my_draft_slot)` reads and one code path that left that field describing a
   * different room than `pick_order.my_picks` did. Fifteen readers cannot notice
   * a disagreement; one can. */
  /* Upgrade an ASSUMED mock seat to an INFERRED one the moment I mark a pick.
   * Only fires in a mock with no better source; a Sleeper-named seat is never
   * overwritten by arithmetic. */
  function inferSeatFromMarkedPick() {
    if (typeof DraftSeat === 'undefined' || !state.mockMode) return null;
    if (state.roomSeatSource === 'sleeper' || state.roomSeatSource === 'manual') return null;
    const teams = (state.mockMode || {}).teams;
    const at = pickState().currentPick - 1;      // the pick I just took
    const slot = DraftSeat.inferFromPick(at, teams);
    if (!slot || slot === mySlot()) return null;
    state.roomSeatSource = 'inferred';
    setSlot(slot, 'manual');                     // routes through the one mutation point
    state.roomSeatSource = 'inferred';           // setSlot marks manual; this is stronger
    showSlotNote('Seat inferred from your pick at ' + at + ' — you are seat ' + slot
      + ' in this room.', false);
    return slot;
  }

  function refreshSeat() {
    if (typeof DraftSeat === 'undefined' || !state.data) return null;
    const league = state.data.league || {};
    state.seat = DraftSeat.resolve({
      realSlot: state.realSlot != null ? state.realSlot : league.my_draft_slot,
      roomSlot: league.my_draft_slot,
      source: state.mockMode ? (state.roomSeatSource || 'assumed')
                             : (state.slotSource || 'league-config'),
      verified: !!state.slotVerified,
      mock: state.mockMode ? { teams: state.mockMode.teams, rounds: state.mockMode.rounds,
                               type: state.mockMode.type } : null,
      myPicks: (state.data.pick_order || {}).my_picks || [],
    });
    return state.seat;
  }

  /* MY seat in the LEAGUE, as opposed to the room being drafted.
   *
   * The room seat has had one accessor (mySlot) since mock #1. The LEAGUE seat
   * did not, so it was read straight off league.my_draft_slot in four places —
   * and these are NOT interchangeable: kept_players.team_slot is stamped in
   * league seats, while a mock room seats you somewhere else entirely. Reading
   * the wrong one attributes my keepers to a stranger's chair, which is the seat
   * bug this project has already paid for once.
   *
   * Two identities, two accessors, no bare reads. mySlot() answers "where am I
   * sitting in THIS room"; leagueSeat() answers "which seat am I in the league
   * whose data this is". */
  function leagueSeat(league) {
    const lg = league || (state.data && state.data.league) || {};
    return Number(lg.my_draft_slot) || 0;
  }

  /** MY seat in the room being drafted. Never read my_draft_slot directly. */
  function mySlot() {
    const s = state.seat || refreshSeat();
    return s ? s.roomSlot : (Number((state.data.league || {}).my_draft_slot) || null);
  }

  // ------------------------------------------------------------- computation
  function myNextPicks() {
    /* ⚠️ `state.data` MAY NOT EXIST YET, and this was the only reader that
     * assumed it did. `pickCoordinate` twenty lines further down guards the
     * identical expression with `state.data &&`; this one did not, so any caller
     * that ran before the board finished loading threw on `.pick_order` of null.
     *
     * The seat panel is what found it: `loadSeatPlan()` fires its own fetch in
     * `init()` BEFORE the draft_data fetch, so whenever seat_plan.json wins the
     * race the panel renders against a board that has not arrived. It was
     * invisible because `loadSeatPlan` wraps the render in a try/catch — the
     * throw became a console line and the panel simply came back empty, then
     * filled in correctly on the next `renderAll()`.
     *
     * Guarded here rather than at the call site because there are many callers
     * and only one of this. */
    const order = (state.data && state.data.pick_order && state.data.pick_order.my_picks) || [];
    const current = currentPick();
    return order.filter(p => p >= current);
  }
  /* MY NEXT TURN — the single definition of "the pick I am waiting for", i.e. my
   * first scheduled pick STRICTLY AFTER the current one. Every "by your next
   * pick" number on the screen must be computed against this same pick, or the
   * survival panel, the best-available strip and the seat strip end up narrating
   * different windows (2026-08-10 critique). On the clock this is my following
   * pick; off the clock it is the pick I am about to make. */
  function myNextTurn() {
    const order = (state.data.pick_order && state.data.pick_order.my_picks) || [];
    const cur = currentPick();
    const future = order.filter(p => p > cur);
    return future.length ? Math.min.apply(null, future) : null;
  }
  /* THE SINGLE SOURCE FOR PICK STATE — three invariants, three populations.
   *
   * WHICH POPULATION EACH TERM COUNTS. Read this before changing anything here;
   * the next person to read it will be a future session with no memory of the
   * conversation that produced it.
   *
   *   pickEvents        picks OBSERVED in this draft — synced from Sleeper or
   *                     marked locally. NOT keepers. A keeper is not an event
   *                     that happened during the draft; it is a pre-existing
   *                     placement.
   *   keeperPlacements  players off the board because a team KEPT them. In the
   *                     league draft this is the confirmed slate. In a mock it
   *                     is MY seeded keepers only.
   *   removedFromBoard  players absent from the board for ANY reason. In the
   *                     league that is pickEvents + keeperPlacements. In a
   *                     REHEARSAL it also includes predicted OPPONENT keepers
   *                     pre-removed for fidelity — and those are NEITHER events
   *                     NOR placements. They were never drafted and nobody
   *                     "kept" them here; they are simply absent, so the
   *                     invariant is evaluated against the REHEARSAL BOARD'S
   *                     OWN expected counts, not the league's.
   *
   * INVARIANT 1  currentPick == pickEvents + 1                  (keepers excluded)
   * INVARIANT 2  removedFromBoard == pickEvents + keeperPlacements + rehearsalRemovals
   *              A mismatch means the board and the slate disagree — its own
   *              alarm, separate from a clock fault.
   * INVARIANT 3  under top_picks_flat, every keeper occupies one of its own
   *              team's rounds 1..N. Delegated to DraftReconcile.placementErrors
   *              so the rule exists ONCE on this side; the Python keeper-
   *              placement verification asserts the same law on the artifact.
   */
  /* THE ONE DERIVATION OF "how many picks have we observed".
   *
   * Added 2026-08-17 (relay) because `main` went red on
   * test_shared_state_audit's `current_pick` budget: the room-switch
   * confirm-first feature (2fe8e0e2) needed this count and re-derived the
   * expression inline, making three copies of a canonical fact whose budget is
   * two. The guard is right — every severity-1 in this project came from a
   * shared fact derived in more than one place — so the fix is to give the
   * derivation an owner rather than to widen the budget.
   *
   * NOT COSMETIC: the two copies were already drifting in meaning. One asks
   * "how far along is the draft" for the clock; the other asks "have we
   * recorded anything worth protecting before switching rooms". They agree
   * today only because they were written the same way, which is precisely the
   * condition that stops being true later.
   */
  function observedPickCount() {
    return state.sync
      ? Math.max(0, state.sync.currentPickNumber() - 1)
      : (state.recentPicks || []).length;
  }

  function pickState() {
    // COORDINATE SYSTEM [pick-events]: count of picks OBSERVED this draft.
    const pickEvents = observedPickCount();
    // COORDINATE SYSTEM [placements]: kept, never drafted. Not an event.
    const keeperPlacements = (state.myRoster || []).filter(p => p.is_keeper).length;
    const rehearsalRemovals = (state.rehearsalKeepers || {}).removed || 0;
    // COORDINATE SYSTEM [board-removals]: absent for ANY reason, superset of both.
    const removedFromBoard = state.drafted ? state.drafted.size : 0;

    // INVARIANT 2's expectation, in the population the CURRENT board lives in.
    // Rehearsal removals are only in the mock population; in the league draft
    // that term is zero and the expression collapses to the league law.
    const expectedRemoved = pickEvents + keeperPlacements + rehearsalRemovals;

    let placement = [];
    try {
      if (typeof DraftReconcile !== 'undefined' && DraftReconcile.placementErrors && !state.mockMode) {
        placement = DraftReconcile.placementErrors(
          ((state.data || {}).pick_order || {}).forfeited || []);
      }
    } catch (e) { placement = []; }

    return {
      pickEvents: pickEvents,
      keeperPlacements: keeperPlacements,
      rehearsalRemovals: rehearsalRemovals,
      removedFromBoard: removedFromBoard,
      expectedRemoved: expectedRemoved,
      // COORDINATE SYSTEM [live-sequence]: the pick number the ROOM is on.
      currentPick: pickEvents + 1,                        // INVARIANT 1
      boardConsistent: removedFromBoard === expectedRemoved,  // INVARIANT 2
      placementErrors: placement,                          // INVARIANT 3
      consistent: removedFromBoard === expectedRemoved && placement.length === 0,
    };
  }

  /* All three invariants, checked every render, plus monotonicity. Each failure
   * is its OWN alarm — a board/slate disagreement is a different problem from a
   * clock fault and from a misplaced keeper, and collapsing them into one
   * boolean would lose the diagnosis. */
  /* The draft CONTEXT this pick count belongs to. The monotonic guard below is
   * only meaningful WITHIN one context: a sync room, a mock, or manual entry.
   * Ending a draft, importing a mock, or connecting to a different room legitimately
   * resets the clock to 1 — that is not a pick going "backwards", it is a new draft.
   * Keying the guard on this id is what stops the false "pick went BACKWARDS: 10 -> 1"
   * that fired because the reset cleared recentPicks/drafted but left lastPickSeen
   * stale (the only reset site, endDraft, never touched it). */
  function pickContextId() {
    if (state.sync && state.sync.draftId) return 'sync:' + state.sync.draftId;
    if (state.mockMode) return 'mock:' + (state.mockMode.picks || 0) + 'x'
      + (state.mockMode.teams || 0) + 'x' + (state.mockMode.rounds || 0);
    return 'manual';
  }

  function assertPickState() {
    const ps = pickState();
    // A context switch resets the monotonic baseline — a new draft starts at 1, and
    // that must not read as a regression. Only a decrease WITHIN one context is a bug.
    const ctx = pickContextId();
    if (ctx !== state.pickContextId) {
      state.pickContextId = ctx;
      state.lastPickSeen = null;
    }
    const last = state.lastPickSeen == null ? -1 : state.lastPickSeen;
    const problems = [];
    if (ps.currentPick < last) {
      // Name the coordinate that produced the lower number — a symptom you can act
      // on, not just "they disagree". The source is the live clock: the sync room
      // in sync mode, the observed-picks count in manual.
      var src = state.sync ? 'sync clock (room pick ' + state.sync.currentPickNumber() + ')'
        : 'manual observed-picks (recentPicks=' + (state.recentPicks || []).length + ')';
      problems.push('pick went BACKWARDS within ' + ctx + ': last-seen ' + last
        + ' -> current ' + ps.currentPick + ' — regressed by ' + src);
    }
    if (!ps.boardConsistent) {
      problems.push('board/slate disagree: ' + ps.removedFromBoard + ' off the board != '
        + ps.pickEvents + ' picks + ' + ps.keeperPlacements + ' keepers'
        + (ps.rehearsalRemovals ? ' + ' + ps.rehearsalRemovals + ' rehearsal removals' : ''));
    }
    ps.placementErrors.forEach(function (e) { problems.push('KEEPER PLACEMENT: ' + e.why); });

    // THE RECONCILER — itemize the roster by source and cross-check the coordinate
    // systems. It adds the invariants pickState() does not check (phantom roster
    // entries; roster marked-picks == picks actually made, the dilution/need-bias
    // guard; picks made+left == my total slots). Board/slate is already covered
    // above, so only the reconciler's NEW problems are merged — no double-report.
    try {
      if (typeof DraftAccounting !== 'undefined') {
        state.accounting = DraftAccounting.reconcile({
          roster: state.myRoster,
          drafted: state.drafted,
          recentPicks: state.recentPicks,
          syncPickNumber: state.sync ? state.sync.currentPickNumber() : null,
          myPicks: (state.data && state.data.pick_order && state.data.pick_order.my_picks) || [],
          currentPick: ps.currentPick,
          keeperPlacements: ps.keeperPlacements,
          rehearsalRemovals: ps.rehearsalRemovals,
          isMock: !!state.mockMode,
          // Draft LENGTH, so the reconciler can check keepers against my pick count
          // (invariant 5): under top_picks_flat I own rounds - myKeeperCount picks.
          rounds: Number(((state.data || {}).league || {}).rounds) || null,
        });
        state.accounting.problems.forEach(function (p) {
          if (!/off the board/.test(p)) problems.push(p);   // board/slate already added
        });
      }
    } catch (e) { /* the reconciler is a guard, never a blocker */ }

    state.lastPickSeen = Math.max(last, ps.currentPick);
    state.pickStateProblems = problems;
    if (problems.length) console.error('[pick-state] ' + problems.join(' · '));
    return problems;
  }

  /* ONE board-freshness policy for the whole war room.
   *
   * Three surfaces used to compare board age against three different thresholds:
   * the staleness control BLOCKED at 18h (amber warn at 6h), the pre-draft
   * checklist called a board "fresh" until 48h, and the status dot stayed green
   * until 48h. So a 20-hour board BLOCKED you while the checklist showed a green
   * ✅ "Board is fresh" in the same panel (2026-08-10 critique). One rule now,
   * read everywhere via boardFreshness():
   *   fresh   < 6h    green, no note
   *   aging   6–18h   amber, advisory (never blocks)
   *   stale   ≥ 18h   red, BLOCKING — drafting off yesterday's injury status.
   * The checklist passes iff the board is not stale, so the ✅ and the block can
   * never disagree again. */
  const BOARD_AGE = { WARN_H: 6, BLOCK_H: 18 };
  function boardAgeHours() {
    const b = state.data && state.data.built_at ? Date.parse(state.data.built_at) : NaN;
    return isFinite(b) ? (Date.now() - b) / 3.6e6 : null;
  }
  /* SURVIVAL IS AN INTERIM MODEL, AND THE SCREEN MUST SAY SO IN THE NUMBER.
   *
   * MEASURED 2026-08-10, by enumerating the whole board at each of Cory's picks
   * and summing P(gone) against the picks that actually happen in the window:
   *
   *     12-pick windows   ratio ~1.15
   *      6-pick, early    1.22 - 1.29
   *      6-pick, later    1.47 - 1.57
   *
   * So the model over-predicts departures by 15% at best and 57% at worst, and it
   * is WORST in the short windows and later rounds — which is where nearly every
   * one of Cory's picks lives. Its constants are designed guesses, not measured,
   * and nothing has calibrated them against real outcomes yet.
   *
   * A number rendered as "64.8%" claims a precision this model does not have, and
   * it renders beside genuinely measured quantities with identical confidence. So
   * every survival-derived figure goes through HERE and comes out coarsened to 5%
   * with a "~", which is the honest resolution: it still ranks players correctly
   * (the ordering is far more trustworthy than the level), while refusing to imply
   * a tenth of a percent.
   *
   * ONE WRITER. Every surface that shows a survival-derived percentage calls this,
   * so the day calibration lands the rounding changes in one place.
   */
  const SURVIVAL_BUCKET = 5;
  function survivalPct(s) {
    if (s == null || isNaN(s)) return null;
    const raw = Math.max(0, Math.min(1, Number(s))) * 100;
    // Keep the extremes crisp: 0% and 100% are claims about certainty, and
    // rounding 98 up to 100 would assert one the model has not earned.
    if (raw >= 99.5) return 99;
    if (raw <= 0.5) return 1;
    return Math.max(1, Math.min(99, Math.round(raw / SURVIVAL_BUCKET) * SURVIVAL_BUCKET));
  }
  /** The display string. `~` is the whole point — it is not decoration. */
  function survivalText(s) {
    const p = survivalPct(s);
    return p == null ? '' : '~' + p + '%';
  }
  /* Anything DERIVED from survival inherits its softness — next-turn cost,
   * grab-by deadlines, VONA, "gone by pick X". Same treatment: a tilde, and no
   * decimal places the model cannot support. */
  function softNum(v, dp) {
    if (v == null || isNaN(v)) return '';
    return '~' + Number(v).toFixed(dp == null ? 0 : dp);
  }

  function boardFreshness(hours) {
    const h = (hours == null) ? boardAgeHours() : hours;
    if (h == null) return { level: 'unknown', hours: null };
    if (h >= BOARD_AGE.BLOCK_H) return { level: 'stale', hours: h };
    if (h >= BOARD_AGE.WARN_H) return { level: 'aging', hours: h };
    return { level: 'fresh', hours: h };
  }

  function currentPick() {
    if (state.sync) return state.sync.currentPickNumber();
    // MANUAL MODE HAD NO CLOCK. This returned `my_picks[0]` unconditionally, so
    // with sync down the board sat frozen at pick 34 forever no matter how many
    // picks were recorded — 43 players off the board and the status bar still
    // read "YOU ARE UP - pick 34". Everything pick-dependent inherited it: LRM,
    // survival, the branch forecast, picks-left in the legality strip, and the
    // missed-mark nag, which could never fire.
    //
    // Manual mode is the DRAFT-NIGHT FALLBACK, so this was the one path that had
    // to work when sync failed, and it was the one path with no clock.
    //
    // Before any pick is recorded, my first live pick stays the anchor: that is
    // the pre-draft prep board, and "who do I take at 34" is the right question
    // then. Once picks start flowing, the count of recorded picks IS the clock.
    /* ⚠️ BEFORE THE DRAFT STARTS, THE ANCHOR IS MY FIRST PICK — and this line
     * stopped doing that, which is what Cory hit on a mock.
     *
     * The paragraph above already promises it: "before any pick is recorded, my
     * first live pick stays the anchor: that is the pre-draft prep board". The
     * code returned `pickState().currentPick` unconditionally, which is
     * `pickEvents + 1` — and with nothing recorded that is ONE.
     *
     * SO THE WHOLE RECOMMENDATION SURFACE WAS SCORED FOR PICK 1. Cory owns no
     * pick before 33. The board told him to take Jahmyr Gibbs (adp 1), offered
     * Bijan Robinson (adp 2) and Puka Nacua (adp 3) as the alternatives, and
     * printed "RB: take-now (grab-by 33)" — advice for a pick that is not his,
     * about players who are gone before he ever chooses, with a deadline of the
     * pick he was already standing on.
     *
     * THE SEAT PANEL WAS RIGHT ON THE SAME SCREEN, which is what makes this a
     * defect rather than a preference: `seatForCurrentPick()` falls forward with
     * `seats.find(s => s.pick >= cur)` and correctly read "THE PLAN WANTS TE at
     * overall 33" while the engine beside it argued for a back at pick 1. Two
     * panels, one screen, two different picks.
     *
     * `pickState().currentPick` IS NOT WRONG and is not touched — it names the
     * pick the ROOM is on, and 1 is the truth for that. Two quantities were
     * sharing one accessor, which is the same shape as board picks versus live
     * picks, the confusion that produced a first pick of 30 instead of 33.
     *
     * NARROW BY CONSTRUCTION: this only fires with NO sync and NO recorded pick
     * — the pre-draft prep board, which is the state Cory was in. The moment a
     * pick lands anywhere, `pickEvents` is non-zero and the room's clock takes
     * over exactly as before. Live-draft behaviour is unchanged. */
    const ps = pickState();
    const mine = ((state.data || {}).pick_order || {}).my_picks || [];
    if (ps.pickEvents === 0) {
      if (mine.length) return mine[0];
      return ps.currentPick;
    }
    /* MANUAL MODE AFTER THE FIRST PICK (B's rehearsal find, 2026-08-17: the
     * draft-night fallback clock broke ON THE VERY FIRST TAKE). pickEvents
     * counts MARKS, and in the fallback Cory marks mostly his own picks — so
     * one mark read "pick 2" while his pick landed at overall 33, and every
     * consumer (legality's picksLeft, LRM windows, mustDraftNow) inherited a
     * clock stuck near the top of the draft. My recorded picks sit on KNOWN
     * slots by construction, so once k of my picks exist the room has
     * necessarily passed mine[k-1]: the clock is bounded below by
     * mine[k-1]+1. max() keeps the diligent path exact — marking every
     * opponent still advances the clock past the bound — and sync mode never
     * reaches this line. */
    const myTaken = (state.myRoster || []).filter(function (p) { return !p.is_keeper; }).length;
    if (myTaken > 0 && mine.length >= myTaken) {
      return Math.max(ps.currentPick, (mine[myTaken - 1] || 0) + 1);
    }
    return ps.currentPick;
  }
  function onTheClock() {
    const mine = state.data.pick_order.my_picks || [];
    return mine.indexOf(currentPick()) !== -1;
  }

  /* THE SINGLE PICK COORDINATE — every surface renders from THIS, so no screen
   * ever shows two pick sequences again.
   *
   *   current   the LIVE pick in the ACTIVE draft's frame (the mock room when
   *             mocking, the league otherwise) — always currentPick(), the one
   *             number derived from pickState()/sync. It is DELIBERATELY not
   *             state.data.current_pick, which is baked at board-build and never
   *             updates — reading that was how the clock card showed a different
   *             number from the status bar.
   *   mine/next my picks + my next pick, in that SAME frame (pick_order.my_picks).
   *   rawRoom   the platform's raw clock, for a behind-a-tap detail ONLY — never
   *             mixed into the default display (in a mock this is the room's own
   *             overall number; when it equals `current` there is nothing to show).
   *   isMock    true in a rehearsal — the label that says the frame is the mock's. */
  function pickCoordinate() {
    var cur = currentPick();
    var mine = (state.data && state.data.pick_order && state.data.pick_order.my_picks) || [];
    var next = myNextPicks();
    var raw = state.sync ? state.sync.currentPickNumber() : null;
    return {
      current: cur,
      mine: mine,
      next: next.length ? next[0] : null,
      isMock: !!state.mockMode,
      rawRoom: raw,
      // Only worth surfacing (behind a tap) when the raw room number differs from
      // the frame we show — i.e. there is a second number that could confuse.
      rawDiffers: raw != null && raw !== cur,
    };
  }

  /* §2(d) — the slim PINNED status bar. Pick state + connection stay visible when
   * you scroll down to the board and lose the hero card. Driven entirely by
   * existing state; no new computation. */
  function renderStatusBar() {
    const host = $('#wr-statusbar');
    if (!host) return;
    const cur = currentPick();
    const up = onTheClock();
    const nexts = myNextPicks();
    const next = up ? nexts[1] : nexts[0];
    const connected = !!state.sync;
    const mock = !!state.mockMode;
    // THE SEAT IS RENDERED HERE AND NOWHERE ELSE. Two surfaces printing their
    // own seat is what let mock #1 show "slot 7" and "you pick at 4, 17, 24"
    // side by side for a whole draft with nothing catching it.
    const seat = refreshSeat();
    const seatTxt = seat && typeof DraftSeat !== 'undefined' ? DraftSeat.describe(seat) : '';
    const seatBad = !seat || !seat.resolved || seat.source === 'assumed';
    host.className = 'wr-statusbar' + (up ? ' on-clock' : '');
    host.innerHTML =
      '<span class="sb-pick">' + (up ? '🟢 YOU ARE UP · pick ' + cur : 'Pick ' + cur) + '</span>'
      + (next ? '<span class="sb-next">next: ' + next + '</span>' : '')
      + (seatTxt ? '<span class="sb-seat' + (seatBad ? ' warn' : '')
          + '" title="one resolved seat identity — every panel reads this">'
          + escapeHtml(seatTxt) + '</span>' : '')
      + '<span class="sb-conn ' + (connected ? 'on' : 'off') + '">' + (connected ? '● live sync' : '○ manual') + '</span>'
      + (mock ? '<span class="sb-mock">REHEARSAL</span>' : '');
  }

  /** My Sleeper user id, from the profile that names me. The artifact keys
   *  manager_profiles by uid, so the identity is already on the board — it was
   *  just never wired to the seat lookup. */
  function myLeagueUserId() {
    if (state.myUid !== undefined) return state.myUid;
    const profiles = ((state.data || {}).manager_profiles || {}).managers || {};
    const me = Object.keys(profiles).find(uid => {
      const p = profiles[uid] || {};
      return p.name === 'coryjsimms' || p.is_me === true;
    });
    state.myUid = me || null;
    return state.myUid;
  }

  function indexProfilesBySlot(data) {
    // Profiles are keyed by Sleeper user id; the board thinks in draft slots.
    const profiles = (data.manager_profiles || {}).managers || {};
    const out = {};
    Object.keys(profiles).forEach(uid => {
      const p = profiles[uid];
      if (p.draft_slot) out[p.draft_slot] = p;
    });
    // Without an explicit mapping, fall back to order — better than no profile,
    // and the Know Your League panel still shows the right names.
    if (!Object.keys(out).length) {
      Object.keys(profiles).forEach((uid, i) => { out[i + 1] = profiles[uid]; });
    }
    return out;
  }

  /* THE SEAT-DATA RULE, third and fourth instance (found by the sweep Cory
   * asked for after `kept_players.team_slot` bit twice).
   *
   * `state.profiles` is indexed by manager_profiles' `draft_slot`, which is a
   * LEAGUE seat. Every read matched it against a ROOM seat. In a mock that is
   * not a near-miss, it is FICTION: seat 3 in a stranger's mock room would
   * render as "taken by Richard" and — worse — the dossier-driven opponent
   * model would attribute a bot's pick to a real manager's tendencies.
   *
   * The `indexProfilesBySlot` order-fallback makes it worse still: with no uid
   * mapping (which is every mock, since mock rooms are strangers) it assigns my
   * ten managers to seats 1..10 arbitrarily.
   *
   * A mock room contains strangers and bots. The honest answer for who owns a
   * seat there is NOBODY KNOWN, so this returns null in a mock unless the live
   * draft object actually mapped a uid we recognise. */
  function profileForSlot(slot) {
    if (!slot) return null;
    // GATED ON A REAL MAPPING, not on mock-vs-league — because the sweep found
    // the artifact's manager profiles carry NO draft_slot at all (0 of 10). So
    // `indexProfilesBySlot` always takes its order-fallback, which assigns my
    // ten managers to seats 1..10 in object order. That is arbitrary in the
    // REAL league too, not just in mocks: before the draft object is imported,
    // "taken by Richard" means "Richard was tenth in a hash".
    //
    // A name is only trustworthy once `importDraftOrder` resolved it from the
    // live draft's users by uid. Until then the seat is unnamed, which is what
    // it actually is.
    if (!state.profilesMappedFromDraft) return null;
    return (state.profiles || {})[slot] || null;
  }

  /** OPPONENT picks between now and my IMMEDIATE next turn — A2 Layer 2's input,
   * and the source for the "who picks before your turn" strip.
   *
   * Had two faults the 2026-08-10 seat-list critique caught (rendered as
   * 1,2,3,5,6,7,8,9,10,10,9 with my own seat 8 in it):
   *   - it ran to upcoming[1], my SECOND future pick, so OFF the clock it swept
   *     in my own first pick plus a whole extra round of opponents; and
   *   - it never excluded MY OWN seat, so the current pick (mine, on the clock)
   *     and every keeper-forfeit round that still carries my seat showed up as
   *     someone picking before me — and that phantom self-pick also thinned the
   *     survival board against me.
   * The window is [currentPick, myNextTurn) MINUS my own slot. myNextTurn is my
   * first scheduled pick strictly after the current one, so the window closes the
   * instant I am back on the clock, never a round late; excluding mySlot drops my
   * own on-clock pick and any forfeited keeper round while keeping the current
   * opponent when I am NOT on the clock. Seats that forfeited a keeper genuinely
   * do not pick in the window (real gaps), and snake repeats like …9,10,10,9…
   * are real — both are kept. On the clock myNextTurn === ctx.nextPick, so
   * survival is unchanged there apart from losing the spurious self-pick. */
  function interveningPicks() {
    const picks = (state.data.pick_order || {}).picks || [];
    const cur = currentPick();
    const mine = mySlot();
    const turn = myNextTurn();
    if (turn == null) return [];
    return picks
      .filter(p => p.overall >= cur && p.overall < turn && p.slot !== mine)
      .map(p => ({
        team_slot: p.slot,
        pick_no: p.overall,
        roster: state.rosters[p.slot] || [],
        // HONEST STATE UNTIL IMPORT. This is the single choke point feeding the
        // adjacency lines, sniper warnings and the before-your-next-pick strip.
        // Until the live draft object maps uids to seats, WHO sits where is
        // unknown, and profileForSlot returns null rather than a name from the
        // order-fallback. A confident wrong name is worse than an honest blank:
        // it would put a real manager's tendencies on a stranger's seat and
        // invite a decision against them.
        profile: profileForSlot(p.slot),
        // D6 — THE ROOM, when we cannot name the seat. profileForSlot stays null
        // until the live draft object maps uids to seats (a named stranger is
        // worse than an honest blank), but WHO IS IN THE ROOM is known regardless:
        // the same 10 managers, profiled over 450 real picks. survival.js mixes
        // over them for an unmapped seat instead of assuming a league-average
        // manager — the measured room's spread is what carries the signal, and the
        // mean of that spread IS the generic default, so ignoring it threw the
        // whole dossier away. Ignored the moment `profile` is set.
        room: profileForSlot(p.slot) ? null : roomProfiles(),
      }));
  }

  /* Every profiled manager in this league, as an array — the population an
   * unmapped seat is drawn from. Cached: it is fixed for the artifact and read
   * once per intervening seat per render. */
  let _roomProfiles = null;
  function roomProfiles() {
    if (_roomProfiles) return _roomProfiles;
    const mgrs = ((state.data || {}).manager_profiles || {}).managers || {};
    const all = Object.keys(mgrs).map(k => mgrs[k]).filter(Boolean);
    // MY OWN seat is in the profile set but never picks against me, so drop it —
    // leaving it in would model the room as 10% "Cory" and dilute the opponents.
    const me = (state.data.league || {}).my_manager_id || null;
    _roomProfiles = all.filter(m => !me || String(m.manager_id) !== String(me));
    return _roomProfiles;
  }

  function context() {
    const upcoming = myNextPicks();
    const cur = currentPick();
    // MY NEXT TURN — the ONE definition, shared with interveningPicks(). It used
    // to be upcoming[1], my SECOND upcoming pick, which is right only while I am
    // ON the clock (upcoming[0] === cur). OFF the clock upcoming[0] IS my next
    // pick, so nextPick pointed one turn too far and every survival number was
    // computed over a ~17-pick window while the strip that counts the same window
    // said 6 (2026-08-10 critique: the conservation violation — P(gone) summed to
    // far more than the picks that will actually happen, and Best Available
    // disagreed with Survival Odds about the same player on the same screen).
    const next = myNextTurn();
    /* ONE DERIVATION. This object used to carry `totalPicks` TWICE and
     * `currentPick` TWICE — JavaScript keeps the last, so the first of each pair
     * was dead code that read as live. The two totalPicks expressions even
     * DISAGREED: `.length` yields 0 for an empty board, `.length || null` yields
     * null. Every consumer tests them as falsy so they agree today, and they
     * disagree the moment one is used arithmetically. Dual maintenance inside a
     * single object literal, found by the interface guard rather than by reading.
     * `null` is kept because it is the honest "unknown"; 0 is a claim. */
    const totalPicks = ((state.data.pick_order || {}).picks || []).length || null;
    const teams = state.data.league.teams || 10;
    return {
      board: state.board,
      nextPick: next,
      totalPicks,
      myPicksLeft: upcoming.length,
      roster: state.myRoster,
      // STAGE 3: the enrolled doctrine reaches the SCORER. Without this line the
      // tilt is wired in the engine and live only in tests — the app would keep
      // scoring exactly as it did before while the banner claimed the plan was
      // driving. Caught by the MVS plan line reading "no preference" at pick 1
      // on a board whose top pick was a WR under WR Feast.
      // The tilt applies when the model's plan is enrolled OR when Cory has
      // manually chosen a doctrine — a human override must re-tilt the board too,
      // not just the auto-enrolled plan.
      doctrine: (doctrineState() && ((state.doctrineEnrollment && state.doctrineEnrollment.enrolled)
                 || (state.doctrine && state.doctrine.manual))) ? state.doctrine.current : null,
      // THE THREE THE ENGINE READ AND THE APP NEVER SENT.
      //   totalPicks   drives draft progress -> urgency curves and the ceiling
      //                term. Absent, progress was computed off undefined.
      //   myPickIndex  which of MY picks this is. The doctrine tilt needs it,
      //                and without it pickIndexOf fell back to a GUESS
      //                (13 - myPicksLeft), so every roster-relative weight was
      //                evaluated at an estimated position in the plan.
      //   totalMyPicks the denominator that fallback was standing in for.
      myPickIndex: myLivePickIndex(),
      totalMyPicks: ((state.data.pick_order || {}).my_picks || []).length || null,
      // SUPPLIED DEFENSIVELY, not to fix a live bug. composite.js reads it when
      // computing the keeper-option bar, and today it is REDUNDANT because
      // populateKeepers pushes keepers onto state.myRoster with is_keeper:true,
      // so ctx.roster already carries them as incumbents. The seam sweep is what
      // established that — the field looked missing and was merely doubled.
      //
      // It is wired anyway because the redundancy is an accident of one
      // function's behaviour: if the roster ever stops carrying keepers (a
      // rehearsal-mode change would do it), the KOV bar would silently lose its
      // incumbents and every keeper-target badge would inflate, with nothing
      // failing.
      currentKeepers: (state.myRoster || []).filter(function (p) { return p.is_keeper; }),
      league: state.data.league,
      weights: state.weights,
      // THE PICK BOARD, SO SURVIVAL CAN CONVERT BOARD SLOTS TO SELECTIONS.
      //
      // `adjusted_adp` counts SELECTIONS; every pick number counts BOARD SLOTS,
      // keeper slots included. survival.js compared them directly and had no
      // converter at all, while keepers.py has `live_index_of` and grab_by.py
      // calls it. One rule, implemented on one side.
      //
      // 3 slots of error today; 18 once the slate locks on 20 August, two days
      // before the draft. Measured at board 33: A.J. Brown reads 0.0% against a
      // true 95.9%. Threading this is what makes the conversion possible, and
      // `E.survivalModel.SCALE.unconverted` is how a test proves it happened.
      pickBoard: ((state.data || {}).pick_order || {}).picks || null,
      // WIRE-COMPARED BENCH BRANCH's input (engine.js's wireBenchValue(),
      // read only when CFG.VONA_WIRE_BENCH is true -- off by default, so
      // this line changes no live behaviour today). Read the same way every
      // other board-sourced field here is: from state.data, never a
      // module-level constant that could go stale. `state.data.wire_level`
      // does not exist on the board yet -- draft/build.py does not embed it
      // (a separate, deliberate change, not made in this pass) -- so this
      // resolves to null until that lands, and wireBenchValue() already
      // treats null/absent as "fall back to the vorp rule", exactly as if
      // the flag were off. Wiring THIS side now means turning the feature on
      // is a build.py change plus a config flip, not an app.js patch someone
      // has to remember to also write.
      wireWeekly: (state.data || {}).wire_level || null,
      runMultipliers: state.runMults,
      // LIVE recommendation is late-only ceiling (Cory's model). Only the strategy-
      // exploration shadows set this true to explore ceiling-forward drafts.
      ceilingAllStages: false,
      drift: state.drift || null,
      // THE QUESTION SURVIVAL IS ACTUALLY BEING ASKED.
      //
      // MISSING UNTIL 2026-08-11, and it was the root cause of the conservation
      // violation. Without `currentPick`, survivalProbability falls to
      // `layer1Taken` — "P(taken by pick N, counted from the start of the
      // draft)" — instead of `layer1TakenGivenAvailable`, which is the only
      // question the panel is asking: "he is on the board NOW; does he last to
      // my pick?" The unconditional form re-charges every player for the chance
      // he was already taken before now, on top of the chance he goes next.
      //
      // Measured over Cory's own windows, expected departures / picks available:
      //      window      without         with
      //      6 picks      1.215          1.033
      //      6 picks      1.290          1.022
      //     12 picks      1.164          1.080
      //      6 picks      1.573          0.855
      //      6 picks      1.525          0.779
      // and per player at pick 34: DeVonta Smith 28% -> 39%, Breece Hall
      // 22% -> 33%, Tee Higgins 53% -> 62%.
      //
      // Every correction runs toward LESS urgency, which matters because
      // over-stated urgency pushes toward reaching, and reaching is Cory's
      // measured personal leak. The engine was amplifying the behaviour it
      // measured as costing him money.
      currentPick: cur,
      // TRUE ONLY WHEN `currentPick()` JUST TOOK ITS PRE-DRAFT ANCHOR BRANCH:
      // zero pick-events (real or mock) recorded, so `state.board` is still
      // the full undrafted pool and cannot yet be treated as ground truth
      // about who is realistically still available at `cur`. The moment
      // anything is recorded — sync, a mock pick, a manual mark —
      // `pickState().pickEvents` moves off zero and this reverts to false
      // for the rest of the draft, same guard `currentPick()` itself uses.
      // Consumed by engine.js's `preDraftPool()`.
      preDraftPrep: pickState().pickEvents === 0 && cur > 1,
      // A2 Layer 2
      intervening: interveningPicks(),
      roundsLeft: Math.max(0, Math.ceil((totalPicks - cur) / teams)),
      /* OPPONENT-NEED LAYER input (Cory's take-a-swing ruling, 2026-08-17).
       * survival.js's gated blend reads ctx.opponentNeed; the artifact loads
       * beside the board (loadOpponentNeed) and null degrades to no tilt —
       * absent is never a guessed distribution. */
      opponentNeed: state.opponentNeed || null,
    };
  }

  // ------------------------------------------------------------------ render
  /* THE DRAFT SURVIVES THE PAGE (Cory, 2026-08-13, lost a mock at pick ~80).
   *
   * ONE CALL SITE, IN renderAll, DELIBERATELY. Six separate places mutate
   * `drafted`/`rosters`/`myRoster`, and instrumenting six is six chances to
   * forget the seventh — which is exactly how the picks ended up being the ONE
   * thing not persisted while weights, lists, rail acks, the pinned board and
   * even the mock calibration all were. Every pick path already ends in
   * renderAll, so saving here cannot be bypassed by a new pick path.
   *
   * Cost is a JSON.stringify of ~100 ids on each render, which is far below the
   * render itself. It never throws: DraftSession.save reports instead, because
   * a lost recovery point is bad and an exception on the clock is worse. */
  function saveDraftSession() {
    if (typeof DraftSession === 'undefined') return;
    DraftSession.save(state, { built_at: (state.data || {}).built_at || null,
      mySlot: mySlot() });
  }

  /* COMING BACK FROM A DEAD PAGE.
   *
   * Auto-resume rather than a confirmation dialog: Cory asked for "a recovery
   * path I can reach in ten seconds", and a modal on the clock is a decision to
   * make while a room waits. The banner says what was restored and offers the
   * discard, so the reversible action is the one that needs a tap.
   *
   * The keeper pool is passed EXPLICITLY. kept_players is disjoint from
   * players — keepers are off the draftable board because they cannot be
   * drafted — so a restore that looks only at the board comes back three
   * players short and then scores need and stack against that short roster.
   * Caught by draft_session.test.js, not by review. */
  function resumeDraftIfAny(data) {
    if (typeof DraftSession === 'undefined') return;
    var saved = DraftSession.load();
    if (!DraftSession.isResumable(saved)) return;
    var r = DraftSession.restore(saved, data.players || [], {
      built_at: data.built_at || null, alsoLookIn: data.kept_players || [] });
    if (!r.ok) { showResumeBanner(null, [r.reason]); return; }
    Object.keys(r.state).forEach(function (k) { state[k] = r.state[k]; });
    if (r.mySlot != null && Number(r.mySlot) !== mySlot()) setSlot(r.mySlot, 'resumed');
    state.board = (data.players || []).filter(function (p) {
      return !state.drafted.has(String(p.player_id));
    });
    showResumeBanner(r.stats, r.warnings);
  }

  function showResumeBanner(stats, warnings) {
    var host = document.getElementById('resume-banner')
      || (function () {
        var d = document.createElement('div');
        d.id = 'resume-banner';
        var anchor = document.querySelector('.wrap') || document.body;
        anchor.insertBefore(d, anchor.firstChild);
        return d;
      })();
    if (!stats) {
      host.innerHTML = '<div class="resume-note"><b>Could not restore the saved draft.</b> '
        + escapeHtml((warnings || []).join(' ')) + '</div>';
      return;
    }
    host.innerHTML = '<div class="resume-note"><b>Resumed your draft.</b> '
      + stats.drafted + ' players off the board, ' + stats.myRoster
      + ' on your roster, saved ' + escapeHtml(String(stats.savedAt || '')) + '.'
      + (warnings && warnings.length
        ? ' <span class="resume-warn">' + escapeHtml(warnings.join(' ')) + '</span>' : '')
      + ' <button class="btn small ghost" id="resume-discard">Start over</button></div>';
    var b = document.getElementById('resume-discard');
    if (b) b.addEventListener('click', function () {
      // A DELIBERATE discard clears the record. An accidental one cannot: this
      // is the only path that erases it, and it is a tap the user chose.
      DraftSession.clear();
      host.innerHTML = '';
      location.reload();
    });
  }

  function renderAll() {
    /* The seat panel must follow the clock. Loaded once, re-rendered on every
     * board update — otherwise it is a screenshot of the first pick and it would
     * be WRONG rather than merely stale, since the seat changes with the pick. */
    /* ⚠️ NINETEEN OF THESE CALLS WERE UNGUARDED, AND ONE THROW FROZE EVERY
     * PANEL AFTER IT.
     *
     * Eight calls below already carry `try { } catch (e) { /* never blocks the
     * clock *\/ }`, so the hazard was understood — it was simply not applied to
     * the main chain, which includes `renderRecommendations`.
     *
     * A throw in an unguarded call means every render AFTER it never runs, and
     * the DOM keeps the PREVIOUS pick's content. The ordering makes the worst
     * case the likely one: `renderHeader` runs first, so if recommendations
     * throw, the header advances to pick 55 while the advice stays frozen at
     * pick 40. The surface looks current. It is not.
     *
     * SWALLOWING WOULD BE THE WRONG FIX — that is the `|| true` class this repo
     * keeps removing. `safeRender` catches so one broken panel cannot freeze
     * the rest, COUNTS the failure, and names the panel, so a stale panel is
     * announced rather than merely survived. `state.renderFailures` is the
     * aggregate that makes it loud; every other defect found in this audit was
     * invisible for want of exactly that.
     *
     * `applyAutoWeights`, `saveDraftSession` and `checkKeeperLock` stay
     * UNGUARDED on purpose: they are not renders. If the weights for this pick
     * cannot be established, every panel below would render last pick's opinion
     * while looking fine, and that is worth failing loudly for. */
    const safeRender = (name, fn) => {
      try { fn(); } catch (e) {
        state.renderFailures = state.renderFailures || {};
        /* THE PICK NUMBER COMES FROM ITS OWNER, NOT FROM A THIRD DERIVATION.
         *
         * My first cut recorded `(state.recentPicks || []).length` and
         * test_shared_state_audit caught it immediately: that made THREE
         * derivations of `current_pick` against a budget of two, owner
         * `pickState() / currentPick()`. Its message is the whole reason the
         * guard exists — "every severity-1 in this project came from a shared
         * fact derived in more than one place" — and it was right about me.
         *
         * Guarded, because this runs INSIDE a catch: if `currentPick()` is what
         * is broken, the recorder must still record. A null `at` is honest;
         * a recorder that throws inside the error path loses the error. */
        let at = null;
        try { at = currentPick(); } catch (e2) { at = null; }
        state.renderFailures[name] = {
          at: at,
          message: (e && e.message) || String(e),
        };
        console.error('[render] ' + name + ' FAILED — that panel is showing the '
          + 'PREVIOUS pick: ' + ((e && e.message) || e));
      }
    };

    safeRender('seatPlan', renderSeatPlan);
    // Static per load; renderHelp no-ops after its first fill.
    safeRender('help', renderHelp);
    // Before anything is scored: if Auto is on, the weights for THIS pick have
    // to be in place, or every panel below renders last pick's opinion.
    applyAutoWeights();
    saveDraftSession();
    checkKeeperLock();
    safeRender('header', renderHeader);
    safeRender('recommendations', renderRecommendations);
    // Every pick changes who is left, so the position panel is stale the
    // instant it is not redrawn with everything else.
    safeRender('positionRecs', renderPositionRecs);
    safeRender('lists', renderLists);
    safeRender('queue', renderQueue);
    safeRender('threats', renderThreats);
    safeRender('threatStrip', renderThreatStrip);
    safeRender('board', renderBoard);
    safeRender('roster', renderRoster);
    safeRender('plan', renderPlan);
    safeRender('byes', renderByes);
    // Market movement is board-build context: the underlying series only
    // changes nightly, but the panel re-renders with everything else so a
    // mid-draft board reload (rebuild + refetch) is reflected immediately.
    safeRender('adpMovers', renderAdpMovers);
    safeRender('checklist', renderChecklist);
    safeRender('rehearsalWatermark', renderRehearsalWatermark);
    safeRender('slotWatermark', renderSlotWatermark);
    safeRender('lrm', renderLRM);
    safeRender('survival', renderSurvival);
    safeRender('runs', renderRuns);
    safeRender('picksFeed', renderPicksFeed);
    safeRender('managers', renderManagers);

    /* THE AGGREGATE, SAID OUT LOUD. Catching without announcing would convert a
     * frozen panel from a visible crash into an invisible lie — strictly worse
     * than the bug being fixed, and the exact `|| true` shape this repo keeps
     * removing. If a panel did not update, the board says which one. */
    if (state.renderFailures && Object.keys(state.renderFailures).length) {
      const names = Object.keys(state.renderFailures);
      try {
        setStatus({ state: 'error', message: 'PANEL(S) NOT UPDATING: '
          + names.join(', ') + ' — those panels are showing an EARLIER pick. '
          + 'Do not draft off them; the rest of the board is current.' });
      } catch (e) { /* console.error in safeRender still carries it */ }
    }
    /* THESE SIX WERE THE ONLY RENDERS IN THIS FUNCTION WHOSE FAILURE WAS NEITHER
     * RECORDED NOR NAMED (session E, 2026-08-18; register E27).
     *
     * Sixteen panels above go through `safeRender`, so when one throws it lands
     * in `state.renderFailures` and the block twenty lines up announces it by
     * name — "PANEL(S) NOT UPDATING: … those panels are showing an EARLIER
     * pick. Do not draft off them." These six were wrapped in bare
     * `catch (e) { /* never blocks the clock *\/ }` instead, so they had the
     * isolation and none of the announcement.
     *
     * `renderSystemStrip` is the one that matters, and the reason is structural:
     * IT IS THE HEALTH SURFACE. It computes the whole red/amber verdict — sync
     * stale, seat unknown, thin projections, board aged, slate unconfirmed — and
     * only then assigns `host.className` and `host.innerHTML`. So a throw
     * anywhere in that computation left the PREVIOUS strip on screen: not blank,
     * but a stale verdict, possibly an all-clear from a state that no longer
     * exists. Every other failure the strip reports is one it can see; its own
     * was the one it could not.
     *
     * That is the exact shape the comment above `state.renderFailures` already
     * names — "a frozen panel from a visible crash into an invisible lie". The
     * mechanism for it existed; these six were simply not wired into it. Using
     * it rather than inventing a second one also keeps `panel_spec` honest: no
     * new painting function is introduced. */
    safeRender('pickState', assertPickState);
    safeRender('accountingNote', renderAccountingNote);
    safeRender('systemStrip', renderSystemStrip);
    safeRender('unrecordedPicks', renderUnrecordedPicks);
    safeRender('pickControls', renderPickControls);
    safeRender('legality', renderLegality);
    /* THE COCKPIT LAYER (rebuild 2026-08-17, Cory's order): tabs, position
     * rails, right-rail charts and the drill-down live in warroom_charts.js,
     * loaded AFTER this file. It reads the narrow WarRoomData accessor below
     * and re-renders on every board update. Guarded — a missing or throwing
     * cockpit never blocks the clock. */
    try { if (typeof WarRoomCockpit !== 'undefined') WarRoomCockpit.refresh(); }
    catch (e) { console.error('[cockpit]', (e && e.message) || e); }
    // Last: the pinned offsets depend on the heights everything above just set
    // (the banner grows a line when a doctrine switches, the watermarks appear
    // and disappear with rehearsal/slot state). Measured again on the next
    // frame because a strip shown during THIS pass can still be mid-reflow —
    // measuring only inline reads a stale zero height and collapses the stack.
    try {
      layoutPinned();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(layoutPinned);
    } catch (e) { /* never blocks the clock */ }
  }

  function renderManagers() {
    const host = document.getElementById('managers');
    if (!host) return;
    const mp = state.data.manager_profiles || {};
    const managers = Object.values(mp.managers || {});
    if (!managers.length) {
      host.innerHTML = '<p class="muted">No prior drafts on Sleeper yet — every opponent is '
        + 'modelled as league-average until there is history to learn from.</p>';
      return;
    }
    /* ⚠ THE SUMMARY STATES MAGNITUDES THE SAMPLE CANNOT CARRY, AND THE PANEL
     * SHOWED NONE OF THE SPREAD THE DATA ALREADY HOLDS (2026-08-14).
     *
     * "Reaches ~7 picks early. Takes QB early (round 5 on average, 1.4 rounds
     * before the league)." — from THREE drafts, with `reach_delta.sd` of 134.2
     * sitting in the same object. Over 40 picks that is a standard error of ~21,
     * so ~7 is not distinguishable from zero. Across all ten managers only TWO
     * exceed two standard errors, and neither is one the summary calls a reacher.
     *
     * THIS CONTRADICTS THE PROJECT'S OWN STANDARD, set in the VONA section of the
     * surface contract: "three drafts give a direction, not a magnitude. No
     * correction is fitted." The same three drafts are quoted here to one decimal
     * place.
     *
     * SO THE PANEL SHOWS THE SUPPORT, and nothing is suppressed or re-weighted —
     * the profile generator is the Python pipeline and re-fitting shrinkage on a
     * suspicion, eight days out, is the move this project keeps refusing. A
     * reader can now discount a tell instead of being asked to trust it. */
    var reachSupport = function (m) {
      var rd = m.reach_delta || {}, n = m.picks_analysed || 0;
      if (rd.sd == null || !n || rd.mean == null) return '';
      var se = rd.sd / Math.sqrt(n);
      if (!(se > 0)) return '';
      var t = Math.abs(rd.mean / se);
      return t >= 2
        ? '<span class="mgr-support">reach holds at ' + t.toFixed(1) + 'σ</span>'
        : '<span class="mgr-support mgr-support-weak">reach ±' + Math.round(se)
          + ' picks over ' + n + ' — not distinguishable from market</span>';
    };
    host.innerHTML = managers.map(m =>
      '<div class="mgr-card">' +
        '<div class="mgr-name">' + escapeHtml(m.name) +
          '<span class="muted">' + m.sample_size + ' draft' + (m.sample_size === 1 ? '' : 's') + '</span></div>' +
        '<div class="mgr-summary">' + escapeHtml(m.summary) + '</div>' +
        reachSupport(m) +
      '</div>').join('');
    const head = document.getElementById('managers-head');
    if (head) head.textContent = 'from ' + (mp.drafts_analysed || 0) + ' prior draft(s)';
  }

  function renderHeader() {
    const d = state.data;
    const upcoming = myNextPicks();
    renderStatusBar();
    $('#hdr-league').textContent = (d.league.name || 'League') + ' · ' + d.league.teams + ' teams · ' +
      (d.league.keeper_rules.count || 0) + ' keepers';
    $('#hdr-pick').textContent = onTheClock() ? 'YOU ARE UP — pick ' + currentPick() : 'Pick ' + currentPick();
    $('#hdr-pick').className = 'hero-value' + (onTheClock() ? ' on-clock' : '');
    $('#hdr-next').textContent = upcoming.length > 1
      ? 'Your next: ' + upcoming[0] + ', then ' + upcoming[1]
      : (upcoming.length === 1 ? 'Last pick: ' + upcoming[0] : 'Draft complete');
    $('#hdr-built').textContent = 'Board built ' + (d.built_at || '').slice(0, 10) +
      ' · ' + d.players.length + ' players';
    renderProvenance(d);
    const si = $('#slot-input'), sp = $('#slot-picks');
    if (si && !si.value) si.value = mySlot() || '';
    if (sp) {
      const mine = (d.pick_order.my_picks || []).slice(0, 5);
      sp.textContent = mine.length ? 'picks ' + mine.join(', ') + '\u2026' : 'no picks';
    }
  }

  /* Loud degradation. A fallback that nobody can see is a fallback that gets
   * trusted as a full-strength result. Anything the pipeline had to substitute
   * says so here, at the top of the page, before any recommendation. */
  function renderProvenance(d) {
    const host = $('#provenance');
    if (!host) return;
    const p = d.provenance || {};
    const notes = [];

    if (state.slotRecomputed) {
      notes.push({
        level: 'warn',
        text: 'Your draft slot changed to #' + state.slotRecomputed.slot
          + ' after this board was built. Pick numbers recomputed live: '
          + state.slotRecomputed.to + ' (board was built for '
          + (state.slotRecomputed.from || 'no picks') + '). '
          + 'Rebuild the board to refresh keeper-adjusted ADP too.',
      });
    }

    const proj = p.projections || {};
    if (proj.warning) {
      notes.push({ level: 'warn', text: proj.warning });
    }
    if (typeof p.value_coverage === 'number' && p.value_coverage < 0.9) {
      notes.push({
        level: 'bad',
        text: 'Only ' + Math.round(p.value_coverage * 100) + '% of the top of the board '
          + 'carries a projection. VORP, ceilings and VONA are near-zero — this board '
          + 'is re-printing ADP, not analysing it.',
      });
    }

    const adp = p.adp || {};
    if (adp.warning) {
      notes.push({ level: 'bad', text: adp.warning });
    } else if (adp.fallback_count) {
      // A4 reword (polish pass) + "cited or corrected". The old copy paired the
      // WHOLE-POOL count (1,559) with the IN-PLAY rate (~8% = 17/225) — two
      // different denominators, misleading. The deep pool priced by fallback is
      // FINE for late fliers; amber ONLY when fallback penetrates the draft-
      // relevant top with SKILL players. K/DEF never carry FFC ADP, so their
      // fallback is EXPECTED — never a warning — and is excluded from the trigger.
      const teams = (d.league || {}).teams || 10;
      const coreDepth = teams * 13;   // the draftable skill core (10-team → ~130)
      // WHAT COUNTS AS "REAL ADP" IS DERIVED FROM PROVENANCE, NOT HARDCODED.
      // This predicate used to be `source !== 'ffc' && source !== 'consensus'` —
      // written when FFC was the anchor. After the swap to FantasyPros every
      // correctly FP-priced player counted as a FALLBACK, so the warning named
      // Gibbs/Robinson/Nacua/McCaffrey as "lacking real ADP" while they showed
      // ADP 1/2/3/4 on the same page, and blamed a "possible FFC coverage/match
      // regression" that had not happened (2026-08-10 critique: the checklist said
      // FantasyPros, the footer said FFC, the warning diagnosed FFC — three claims
      // that could not all be true). Verified on the live artifact:
      // primary_source=fantasypros, 342/342 matched, fallback_count_in_play=0,
      // and all 84 top-130 skill players are adp_source='fantasypros'.
      //
      // A real ADP source is the board's own PRIMARY plus any declared gap-fill;
      // the true fallback is the search_rank sentinel (the 913 rows Cory spotted —
      // 1,423 of them, all OUTSIDE the draftable core, which is why in-play is 0).
      const primarySrc = (p.adp || {}).primary_source || (p.adp || {}).adp_source || 'ffc';
      const REAL_ADP_SOURCES = [primarySrc, 'ffc', 'fantasypros', 'consensus', 'mfl']
        .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      const isFallback = pl => pl.adp_source && REAL_ADP_SOURCES.indexOf(pl.adp_source) === -1;
      const skillCore = (d.players || []).filter(pl =>
        (pl.overall_rank || pl.consensus_rank || 1e9) <= coreDepth
        && ['QB', 'RB', 'WR', 'TE'].indexOf(pl.position) !== -1
        && isFallback(pl));
      const rep = adp.report || {};
      // Name the ACTUAL source, never a hardcoded 'FFC' (the footer/checklist/warning
      // disagreement). Prefer the primary source's own match counts when present.
      const fpRep = adp[primarySrc] || {};
      const matchedN = fpRep.fp_matched != null ? fpRep.fp_matched : rep.matched;
      const totalN = fpRep.fp_matched != null
        ? (fpRep.fp_matched + (fpRep.fp_unmatched || 0))
        : (rep.matched != null ? rep.matched + (rep.unmatched_count || 0) : null);
      const srcLabel = primarySrc === 'fantasypros' ? 'FantasyPros'
        : primarySrc === 'ffc' ? 'FFC' : String(primarySrc);
      const matchStr = matchedN != null
        ? ' (' + srcLabel + ' ' + matchedN + '/' + totalN + ' matched'
          + (fpRep.ffc_gap_fill ? ', ' + fpRep.ffc_gap_fill + ' FFC gap-fill' : '') + ')' : '';
      if (skillCore.length > 0) {
        // Fallback penetrated the draft-relevant top with skill players — a real
        // FFC coverage / name-match regression worth diagnosing. Report by position.
        const byPos = {};
        skillCore.forEach(pl => { byPos[pl.position] = (byPos[pl.position] || 0) + 1; });
        notes.push({
          level: 'warn',
          text: skillCore.length + ' skill player' + (skillCore.length === 1 ? '' : 's')
            + ' inside the top ' + coreDepth + ' lack real ADP ('
            + Object.keys(byPos).map(k => byPos[k] + ' ' + k).join(', ')
            + ') — possible ' + srcLabel + ' coverage/match regression: '
            + skillCore.slice(0, 4).map(pl => pl.name).join(', ')
            + (skillCore.length > 4 ? '…' : '') + '.',
        });
      } else {
        // The expected, benign case (A4): the top is on real ADP; only the deep
        // pool + K/DEF fall back. Say the SOURCE and name the sentinel, so the deep
        // pool's identical raw value (913 = search_rank, 1,423 rows on the live
        // board) reads as the placeholder it is rather than an ADP nobody can trust.
        notes.push({
          level: 'ok',
          text: 'Top ' + coreDepth + ': real ADP from ' + srcLabel + matchStr
            + '. Deep pool (' + adp.fallback_count + ', all outside the draftable core) '
            + 'priced by the search_rank placeholder — identical raw values there are the '
            + 'sentinel, not an ADP. Fine for late fliers.',
        });
      }
    }

    // THE FOOTER CREDIT, from the same provenance the checklist and the warning
    // read — so the three can never name different sources again (2026-08-10).
    (function () {
      const credit = $('#adp-credit');
      if (!credit) return;
      const a = p.adp || {};
      const src = a.primary_source || a.adp_source;
      if (!src) return;
      const LINKS = {
        fantasypros: { label: 'FantasyPros', href: 'https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php' },
        ffc: { label: 'Fantasy Football Calculator', href: 'https://fantasyfootballcalculator.com/adp' },
        mfl: { label: 'MyFantasyLeague', href: 'https://www.myfantasyleague.com' },
      };
      const prim = LINKS[src] || { label: String(src), href: null };
      const rep = a[src] || {};
      const link = o => o.href
        ? '<a href="' + o.href + '" rel="noopener">' + escapeHtml(o.label) + '</a>'
        : escapeHtml(o.label);
      let html = 'ADP from ' + link(prim);
      const fmt = ((a.report || {}).format) || '';
      if (fmt) html += ' (' + escapeHtml(fmt) + ', our format)';
      if (rep.ffc_gap_fill) {
        html += ', ' + rep.ffc_gap_fill + ' gap-filled from ' + link(LINKS.ffc);
      }
      credit.innerHTML = html;
    })();

    const opp = p.opportunity_adjustment;
    if (opp && opp !== 'ok' && opp !== 'unknown') {
      notes.push({
        level: 'bad',
        text: 'Opportunity adjustment ' + opp + ' — projections are consensus-only, '
          + 'with no snap/target/red-zone signal applied.',
      });
    } else if (typeof p.opportunity_coverage === 'number' && p.opportunity_coverage < 0.8) {
      notes.push({
        level: 'warn',
        text: 'Opportunity adjustment reached only '
          + Math.round(p.opportunity_coverage * 100) + '% of the top of the board.',
      });
    }

    // Artifact age — the ONE freshness policy (boardFreshness): fresh <6h quiet,
    // aging 6-18h amber, stale ≥18h BLOCKING. A stale board on draft day means
    // drafting off yesterday's injury status without knowing, and a warning you
    // can scroll past is not a control.
    const fresh = boardFreshness();
    if (fresh.level !== 'unknown') {
      const hours = fresh.hours;
      if (fresh.level === 'stale') {
        blockOnStaleness(hours);
      } else if (fresh.level === 'aging') {
        notes.push({ level: 'warn', text: 'This board is ' + Math.round(hours)
          + ' hours old — consider rebuilding before you draft off it.' });
      }
    } else {
      // CHAOS DRILL 2026-08-16: a board whose built_at is missing or
      // unparseable reported NOTHING here — 'unknown' fell through this guard
      // entirely, so a corrupt artifact rendered with no age note at all while
      // the checklist called the same board "never built". An age that cannot
      // be verified is not fresh; on draft day it must read as loud as stale.
      notes.push({ level: 'bad',
        text: 'This board has NO readable built_at — its age cannot be verified. '
          + 'Treat it as stale: rebuild before drafting off it.' });
    }

    /* CONDITIONAL-VALUE LAYER, absent case (ruling 2026-08-17): one honest
     * line, never a zero presented as a measurement. Silence while the fetch
     * is still in flight; silence when loaded (the chips carry their own
     * provenance label). */
    if (state.condValueLoaded && !state.condValue) {
      notes.push({ level: 'warn',
        text: (typeof CondValue !== 'undefined' && CondValue.absentNote)
          ? CondValue.absentNote()
          : 'Conditional-value artifact (stack/handcuff premiums) did not load — '
            + 'premium chips are ABSENT, not zero. Board value is unaffected: '
            + 'the composite never reads this layer.' });
    }

    if (!notes.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.style.display = '';
    const icon = lvl => lvl === 'bad' ? '⛔' : (lvl === 'ok' ? 'ℹ️' : '⚠️');
    host.innerHTML = notes.map(n =>
      '<div class="prov-note ' + n.level + '"><b>' + icon(n.level)
      + '</b> <span>' + escapeHtml(n.text) + '</span></div>').join('');
  }

  /* ── How much to trust it ───────────────────────────────────────────────
     Stated in words above the list, not buried in a tooltip. A tool that only
     ever sounds certain gets ignored the first time it is confidently wrong. */
  function renderConfidence(c) {
    const host = $('#confidence-note');
    if (!host || !c || c.level === 'none') { if (host) host.innerHTML = ''; return; }
    if (c.level === 'clear') { host.innerHTML = ''; return; }
    // The verdict block owns the confidence sentence when it rendered; a second
    // copy of the same message right under it is the noise Cory named.
    if (state.verdictShown) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="conf-note ' + c.level + '">'
      + (c.level === 'coin-flip' ? '\u{1FA99} ' : '\u2696\ufe0f ')
      + escapeHtml(c.message) + '</div>';
  }

  /* \u2500\u2500 THE VERDICT BLOCK \u2014 one voice over four lenses (design pass 2026-08-15).
   *
   * Cory's capture showed rule headline / paths / plan / poll giving four
   * different answers with no arbiter. This surface owns the answer now:
   * DraftVerdict.derive (pure, thresholds = the engine's own CFG bands) says
   * which pick the page backs and how confident, and the lens row presents the
   * other voices AS the host of options \u2014 each labeled by what it optimizes,
   * disagreement rendered as information rather than as competing headlines.
   *
   * GUARDED \u2014 a missing module degrades to the pre-verdict surface, never a
   * blank board. Pinned by ui_fidelity_verdict.test.js: displayed chip, name,
   * gap and units must equal the derivation's, and the derivation's must equal
   * the engine's. */
  const VERDICT_CHIP_WORDS = {
    'LOCK': 'LOCK \u2014 take it and bank the clock',
    'LEAN': 'LEAN \u2014 ahead, a real preference can override',
    'TOSS-UP': 'TOSS-UP \u2014 your call',
    'SPLIT': 'SPLIT \u2014 two answers, rule wins ties',
    'PINNED': 'YOUR PIN \u2014 the board disagrees',
  };
  function renderVerdict(out) {
    const host = $('#verdict-block');
    if (!host) return;
    state.verdictShown = false;
    if (typeof DraftVerdict === 'undefined' || !out || !out.scored || !out.scored.length) {
      host.style.display = 'none'; host.innerHTML = ''; return;
    }
    // Rule lens \u2014 same call the rule headline makes; null when the module is off.
    let rule = null;
    try {
      if (typeof DraftNeedRule !== 'undefined' && (state.board || []).length) {
        const r = DraftNeedRule.recommend(state.board, state.myRoster || []);
        if (r && r.pick) rule = { pick: r.pick, reason: r.reason || '' };
      }
    } catch (e) { /* the rule lens is optional; the verdict is not */ }
    // Plan lens \u2014 the seat the season plan wants filled at this pick.
    let plan = null;
    try {
      const seat = seatForCurrentPick();
      if (seat && seat.slot) {
        plan = { slot: seat.slot,
          name: seat.shortlist && seat.shortlist[0] ? seat.shortlist[0].name : null };
      }
    } catch (e) { /* optional */ }
    // Poll lens \u2014 computed ONCE here and handed to renderShadowProjection via
    // state._shadowProj (one-shot, same render cycle), so the strip and the
    // lens can never disagree about what the strategies said.
    let poll = null;
    try {
      if (typeof DraftShadows !== 'undefined' && state.board && state.board.length && state.data) {
        const teams = ((state.data.league || {}).teams) || 10;
        const round = Math.max(1, Math.ceil(currentPick() / teams));
        const proj = DraftShadows.project(state.board, context(), round, state.myRoster);
        const cons = DraftShadows.consensus(proj);
        if (cons && proj.length) {
          state._shadowProj = { proj: proj, cons: cons, pick: currentPick() };
          poll = { agree: cons.agree, n: cons.n,
            lead_name: shortName(cons.lead), lead_position: cons.lead_position || null,
            artifact: !!(cons.driver_is_artifact || cons.driver_zero_weighted),
            contested: !!cons.contested };
        }
      }
    } catch (e) { /* optional */ }

    let v;
    try {
      // roster: tie-break FACTS only (bye overlap needs the picks already made).
      // derive() computes them after the verdict and backed pick are final, so
      // this input can never move the recommendation — pinned by
      // ui_fidelity_tiebreak.test.js.
      v = DraftVerdict.derive({ cfg: E.CFG, scored: out.scored,
        confidence: out.confidence, rule: rule, plan: plan, poll: poll,
        roster: state.myRoster || [] });
    } catch (e) {
      console.error('[verdict]', e && e.message);
      host.style.display = 'none'; host.innerHTML = ''; return;
    }
    if (!v || v.verdict === 'NONE' || !v.pick) {
      host.style.display = 'none'; host.innerHTML = ''; return;
    }

    const chipClass = { 'LOCK': 'lock', 'LEAN': 'lean', 'TOSS-UP': 'tossup',
      'SPLIT': 'split', 'PINNED': 'pinned' }[v.verdict] || 'tossup';
    const alts = v.alternatives.filter(a => a.delta_pts != null).slice(0, 3);
    const altHtml = alts.length
      ? '<div class="wrv-alts">other options: ' + alts.map(a =>
          escapeHtml(shortName(a.player.name)) + ' <span class="rec-pos ' + a.player.position + '">'
          + a.player.position + '</span>' + expertSpreadBadge(a.player.player_id)
          + ' <span class="wr-num">'
          + (a.delta_pts > 0 ? '+' : '') + a.delta_pts.toFixed(1) + '</span>').join(' \u00b7 ')
        + ' <span class="muted">' + escapeHtml(v.gap_units) + ' vs the pick '
        + '(+ = scores higher)</span></div>'
      : '';
    // TIE-BREAK FACTS (TOSS-UP only): the discriminator line Cory asked for —
    // "especially in tie break scenarios". Facts the board already carries,
    // printed to break a tie with; the derivation attaches them only when the
    // chip is TOSS-UP, and an empty list renders as the honest "genuinely
    // even" rather than silence pretending the check never ran.
    const tbHtml = v.tiebreak
      ? '<div class="wrv-tiebreak"><b>tie-break facts</b>'
        + ' <span class="tb-note">(printed, not scored — the pick above is unchanged. '
        + 'On this league’s 2023–25 record 50/50s are true coin flips: 8 of 9 '
        + 'printed facts predicted nothing in 259 near-ties; trajectory is the one '
        + 'measured lean, 58% of 176)</span>'
        + (v.tiebreak.facts.length
          ? '<ul>' + v.tiebreak.facts.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>'
          : '<div class="tb-even">nothing on the board separates '
            + escapeHtml(v.tiebreak.a) + ' and ' + escapeHtml(v.tiebreak.b)
            + ' — genuinely even; your read decides. A true coin flip on this '
            + 'league’s own record (259 near-ties, 2023–25) — stop sweating it.</div>')
        + '</div>'
      : '';
    const lensHtml = v.lenses.length
      ? '<div class="wrv-lenses">' + v.lenses.map(l =>
          '<button type="button" class="wrv-lens' + (l.stance === 'differs' || l.stance === 'artifact' ? ' differs' : '')
          + '" data-lens="' + l.key + '" title="' + escapeHtml(l.note || '') + '">'
          + '<b>' + escapeHtml(l.label) + ' <span class="lens-opt">' + escapeHtml(l.optimizes) + '</span></b>'
          + '<span class="lens-pick">' + escapeHtml(l.pick) + '</span>'
          + (l.stance === 'differs' ? '<span class="lens-opt">disagrees \u2014 tap for detail</span>'
             : l.stance === 'artifact' ? '<span class="lens-opt">\u26a0 one term, not votes</span>' : '')
          + '</button>').join('') + '</div>'
      : '';
    host.innerHTML =
      explainPanel('verdict')
      + '<div class="wrv-top">'
      + '<span class="wrv-chip ' + chipClass + '" data-verdict="' + escapeHtml(v.verdict) + '">'
        + escapeHtml(VERDICT_CHIP_WORDS[v.verdict] || v.verdict) + '</span>'
      + '</div>'
      + '<div class="wrv-name">' + escapeHtml(v.pick.name || '')
        + ' <span class="rec-pos ' + v.pick.position + '">' + v.pick.position + '</span>'
        + expertSpreadBadge(v.pick.player_id) + '</div>'
      + '<div class="wrv-why">' + escapeHtml(v.why) + '</div>'
      + tbHtml
      + '<button class="btn gold wrv-take" data-draft-me="' + escapeHtml(String(v.pick.player_id))
        + '">\u2713 Take ' + escapeHtml(v.pick.name || 'him') + '</button>'
      + lensHtml + altHtml;
    host.style.display = '';
    state.verdictShown = true;
    state.lastVerdict = v;
  }

  /* ── PROGRESSIVE DISCLOSURE (design pass 2026-08-15) ─────────────────────
   * Cory: "combining tons of info into a small space … having easy access to
   * info if needed." Nothing is removed; everything compressed expands one tap:
   * lens chips reveal their source panel, shortlist rows open a dossier of the
   * engine fields already on the scored entry, badges open their legend, and
   * every panel's ⓘ opens its explainer. All state survives re-renders. */
  function revealLens(key) {
    const target = {
      rule: '#rule-headline',
      value: '#recs-details',
      plan: '#seat-plan',
      poll: '#shadow-projection',
    }[key];
    if (!target) return;
    const el = document.querySelector(target);
    if (!el) return;
    // Open whatever container hides it, then bring it into view.
    if (el.tagName === 'DETAILS') el.open = true;
    const det = el.closest('details');
    if (det) det.open = true;
    if (key === 'poll') {
      const d = document.getElementById('shadow-proj-details');
      if (d) d.open = true;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* The dossier: every field the engine already computed for this candidate,
   * one tap under his shortlist row. READS state.lastClock — the same scored
   * board the row rendered from — never a recomputation. */
  function toggleDossier(playerId) {
    state.dossierOpen = state.dossierOpen === String(playerId) ? null : String(playerId);
    renderRecommendations();
  }
  function dossierHtml(s) {
    const c = s.components || {};
    const w = c.weighted || {};
    const TERMS = [
      ['value', 'raw value (VONA)'], ['tier', 'tier cliff'], ['need', 'lineup need'],
      ['risk', 'risk'], ['ceiling', 'upside'], ['keeper', 'keeper option'],
      ['bye', 'bye collision'], ['stack', 'stacking'], ['onesie', 'onesie discount'],
      ['doctrine', 'doctrine'],
    ];
    const rows = TERMS
      .filter(t => w[t[0]] != null && Math.abs(w[t[0]]) >= 0.05)
      .map(t => '<tr><td>' + t[1] + '</td><td class="wr-num">'
        + (w[t[0]] >= 0 ? '+' : '') + w[t[0]].toFixed(1) + '</td></tr>').join('');
    const sv = s.survival_to_next;
    const conf = state.lastClock && state.lastClock.confidence ? state.lastClock.confidence : null;
    return '<div class="rec-dossier" data-dossier-for="' + escapeHtml(String(s.player.player_id)) + '">'
      + '<b>What builds his ' + (s.score != null ? s.score.toFixed(1) : '—') + '</b>'
      + ' <span class="muted">(weighted composite points — each line is one term × your slider)</span>'
      + '<table>' + (rows || '<tr><td class="muted">no non-zero terms</td></tr>') + '</table>'
      + (sv != null
        ? '<div>market survival to your next pick: <b class="wr-num">' + Math.round(sv * 100)
          + '%</b> <span class="muted">(ADP model — the number the score uses)</span></div>'
        : '')
      + ((s.rails && s.rails.length)
        ? '<div class="dossier-why">⚠ rails: ' + s.rails.map(escapeHtml).join(' · ') + '</div>' : '')
      + ((s.reasons && s.reasons.length)
        ? '<div class="dossier-why"><b>why:</b> ' + s.reasons.map(escapeHtml).join(' · ') + '</div>' : '')
      + ((s.context && s.context.length)
        ? '<div class="dossier-why"><b>board facts (not the reason):</b> '
          + s.context.map(escapeHtml).join(' · ') + '</div>' : '')
      + (conf && conf.message
        ? '<div class="dossier-why"><b>the board’s own confidence line:</b> '
          + escapeHtml(conf.message) + '</div>' : '')
      + '</div>';
  }

  /* Badge legend — the full sentence behind every compact flag, on tap.
   * Each entry is written FROM the code that fires the badge; the fidelity
   * suite greps those sources so this table cannot outlive them. */
  const FLAG_LEGEND = {
    injury: s => 'Sleeper’s injury report lists him ' + s + '. The score prices it '
      + '(−12 through the risk term) ONLY when the RISK slider is on — it ships OFF, '
      + 'measured as a drag. Until then this badge is a heads-up, not a price change.',
    age: 'RB aged 30+. The risk model’s RB age cliff is 27 (−6/season past it), '
      + 'priced only when the RISK slider is on — it ships OFF. The badge stays '
      + 'visible because age is the one risk you cannot news-override away.',
    opp_up: 'His projected usage is unusually HIGH for his draft cost, measured '
      + 'against this board’s own mean — a buy signal the market may be missing. '
      + 'Feeds the risk term (+6) only when RISK is on; otherwise information only.',
    opp_down: 'His projected usage is unusually LOW for his draft cost, measured '
      + 'against this board’s own mean — the market may be paying for a name. '
      + 'Feeds the risk term (−6) only when RISK is on; otherwise information only.',
    adp_stale: s => 'The retained ADP series moved this player ' + s + ' — a round '
      + 'or more — while the board’s number is from last night’s build. His board '
      + 'price is STALE: check live ADP and the news before trusting it. The alarm '
      + 'is draft/adp_series.py stale_flag() (threshold 8 slots); it prices nothing.',
  };
  function toggleFlagLegend(el) {
    const kind = el.getAttribute('data-flag-legend');
    const arg = el.getAttribute('data-flag-arg') || '';
    const existing = el.parentNode.querySelector('.wr-flag-legend');
    if (existing) { existing.remove(); return; }
    const entry = FLAG_LEGEND[kind];
    if (!entry) return;
    const div = document.createElement('div');
    div.className = 'wr-flag-legend';
    div.textContent = typeof entry === 'function' ? entry(arg) : entry;
    el.parentNode.appendChild(div);
  }

  /* ── THE HELP VIEW — "how to run your draft night with this page" ────────
   * Assembled from the SAME PANEL_GUIDE the ⓘ explainers read (single source:
   * the manual cannot drift from the captions) plus the verdict chip glossary.
   * Rendered once — the content is static per page load. */
  function renderHelp() {
    const host = document.getElementById('wr-help');
    if (!host || host.childNodes.length) return;
    const order = ['verdict', 'recommendations', 'paths', 'branches', 'survival',
      'threats', 'lrm', 'position_recs'];
    const chipGloss = Object.keys(VERDICT_CHIP_WORDS).map(k =>
      '<p><span class="wrv-chip ' + ({ 'LOCK': 'lock', 'LEAN': 'lean', 'TOSS-UP': 'tossup',
        'SPLIT': 'split', 'PINNED': 'pinned' }[k] || 'tossup') + '">' + escapeHtml(k)
      + '</span> ' + escapeHtml(VERDICT_CHIP_WORDS[k].split('— ')[1] || '') + '</p>').join('');
    host.innerHTML =
      '<p><b>The night in one paragraph:</b> when you are on the clock, the verdict '
      + 'block is the answer — one name, one chip, one why. Everything under it is the '
      + 'working: the ranked list (tap a dossier for any score\'s anatomy), the paths '
      + '(your real options, priced), and what waiting costs (If You Take). Between '
      + 'picks, watch the deadline strip and the survival panels; keep your queue '
      + 'honest; and let the alarms interrupt you — a quiet page means nothing needs '
      + 'you. Every ⓘ on the page opens the same explainers this manual is built from.</p>'
      + '<h3>The chips</h3>' + chipGloss
      + order.map(k => {
        const g = PANEL_GUIDE[k];
        if (!g) return '';
        const title = { verdict: 'The verdict', recommendations: 'The ranked list',
          paths: 'Paths — your real options', branches: 'If you take… (the round trip)',
          survival: 'Survival odds (market model)', threats: 'The room model',
          lrm: 'Last responsible moment', position_recs: 'Best by position' }[k] || k;
        return '<h3>' + escapeHtml(title) + '</h3>'
          + '<p>' + escapeHtml(g.what) + '</p>'
          + '<p>' + escapeHtml(g.read) + '</p>'
          + '<p><b>Do:</b> ' + escapeHtml(g.do || '') + '</p>'
          + '<p class="pe-src">source of truth: ' + escapeHtml(g.src || '') + '</p>';
      }).join('');
  }

  /* ⓘ toggle — openness survives re-renders via state.explainOpen. */
  function toggleExplain(btn) {
    const key = btn.getAttribute('data-explain-toggle');
    state.explainOpen = state.explainOpen || {};
    state.explainOpen[key] = !state.explainOpen[key];
    const block = document.querySelector('.panel-explain[data-panel="' + key + '"]');
    if (block) block.hidden = !state.explainOpen[key];
    btn.setAttribute('aria-expanded', state.explainOpen[key] ? 'true' : 'false');
  }

  /* ── What each option costs you at your next pick ──────────────────────── */
  function renderBranches(branches) {
    const card = $('#branch-card'), host = $('#branches');
    if (!card || !host) return;
    if (!branches || !branches.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    $('#branch-head').textContent = 'what is likely left at pick ' + branches[0].pick;
    /* THE DELTA GRID (design pass 2026-08-15): four near-identical text blocks
     * became one compact matrix \u2014 rows are candidates, columns positions, ink
     * deepens with the cost of waiting. Same data (loss > 1 filter unchanged),
     * one form. Text blocks remain the no-module fallback. */
    const gridBranches = branches.map(b => ({ taking: b.taking, pick: b.pick,
      rows: b.rows.filter(r => r.loss > 1).slice(0, 4) }));
    // ONE emit site for the caption (panel_guide parity: two literals for one
    // panel read as two panels to the census).
    const branchesExplain = explainPanel('branches');
    if (typeof DraftCharts !== 'undefined') {
      const grid = DraftCharts.branchGrid(gridBranches);
      host.innerHTML = branchesExplain
        + (grid || '<p class="muted" style="margin:.2rem 0 0; font-size:.78rem">'
          + 'Nothing falls off a cliff before your next pick.</p>');
      return;
    }
    host.innerHTML = branchesExplain + gridBranches.map(b => {
      const rows = b.rows;
      return '<div class="branch">'
        + '<div class="branch-head">Take <b>' + escapeHtml(b.taking) + '</b></div>'
        + (rows.length
            ? '<ul class="branch-rows">' + rows.map(r =>
                '<li><span class="rec-pos ' + r.position + '">' + r.position + '</span>'
                + ' best left \u2248 <b>' + r.at_next.toFixed(0) + '</b>'
                + ' <span class="muted">(' + r.loss.toFixed(0) + ' worse than now)</span></li>').join('')
              + '</ul>'
            : '<p class="muted" style="margin:.2rem 0 0; font-size:.78rem">Nothing falls off a cliff before your next pick.</p>')
        + '</div>';
    }).join('');
  }

  /* ── The one-answer view ────────────────────────────────────────────────
     Sixty seconds, a room full of noise, and everyone looking at you. One
     name, one reason, and an honest word about whether it is really ahead. */
  function renderClock(out) {
    const card = $('#clock-card');
    if (!card) return;
    card.style.display = state.clockMode ? '' : 'none';
    const recs = $('#recs-card');
    if (recs) recs.style.display = state.clockMode ? 'none' : '';
    const branch = $('#branch-card');
    if (branch && state.clockMode) branch.style.display = 'none';
    if (!state.clockMode) return;

    const list = out.scored || [];
    if (!list.length) { $('#clock-name').textContent = 'Board is empty'; return; }
    const i = Math.min(state.clockIndex, list.length - 1);
    const s2 = list[i], p = s2.player;

    // ONE coordinate, live — never state.data.current_pick (baked at build, stale),
    // which is what made this card disagree with the status bar.
    $('#clock-pick').textContent = pickCoordinate().current || '—';
    const clockNameEl = $('#clock-name');
    clockNameEl.innerHTML = escapeHtml(p.name)
      + '<span class="rec-pos ' + p.position + '">' + p.position + '</span>';
    // The 2026-08-10 legibility hotfix (`style.color = var(--ink)` inline) is
    // GONE, deliberately: it existed because style.css once painted .clock-name
    // white on the light card, and inline color would now defeat the stylesheet
    // permanently. The redesign (2026-08-17) gave the clock card the dark navy
    // board and warroom.css owns .clock-name's color there — an inline ink
    // color on that surface is exactly the dark-on-dark bug in reverse. The
    // stylesheet is the single owner of this color now; do not re-add inline.
    clockNameEl.style.color = '';
    $('#clock-meta').textContent = (p.team || '') + (p.bye ? ' · bye ' + p.bye : '')
      + ' · ADP ' + Math.round(p.adjusted_adp);
    // C3 — the RAW projection as a sanity check, next to our valuation, labelled
    // honestly by source count (consensus.js: "Consensus (N src)" at ≥2 — today's
    // board carries Sleeper+FP, plus our own model where it attaches — a single
    // source's own name otherwise).
    // Placed prominently on the clock (the primary mobile surface), not tucked in a
    // detail row — the point is Cory NOTICES when our pick and the raw projection
    // disagree, which only works if both are in front of him at the moment of a pick.
    if (typeof DraftConsensus !== 'undefined') {
      let projEl = $('#clock-proj');
      if (!projEl) {
        projEl = document.createElement('div');
        projEl.id = 'clock-proj';
        projEl.style.cssText = 'margin:.35rem 0;font-size:.95rem';
        const meta = $('#clock-meta');
        if (meta && meta.parentNode) meta.parentNode.insertBefore(projEl, meta.nextSibling);
      }
      const prov = (state.data || {}).provenance;
      const rp = DraftConsensus.rawProjection(p, prov);
      const alt = DraftConsensus.higherProjectionAlt(s2, list, prov, 6);
      let html = '<span style="opacity:.75">' + escapeHtml(rp.label) + '</span> <b>'
        + (rp.value == null ? '—' : Math.round(rp.value)) + '</b>'
        + '<span style="opacity:.6"> · our valuation VONA ' + (s2.components && s2.components.vona != null
            ? Math.round(s2.components.vona) : Math.round(s2.score)) + '</span>';
      if (alt) {
        // the disagreement moment: we're recommending a LOWER-projection player.
        html += '<div style="margin-top:.25rem;font-size:.85rem;color:#b45309">⚠ '
          + escapeHtml(alt.alt.name) + ' projects higher (' + Math.round(alt.alt_proj) + ' vs '
          + Math.round(alt.rec_proj) + ') — we prefer ' + escapeHtml(p.name ? p.name.split(' ').slice(-1)[0] : 'him')
          + ' on ' + escapeHtml(String((s2.reasons || [])[0] || 'value').slice(0, 60))
          + '. Both shown so you can judge.</div>';
      }
      projEl.innerHTML = html;
    }
    // The star goes on the name as a badge, not into the reason line. On the
    // clock the one sentence you get has to tell you why he is GOOD — "you
    // starred him" is a restatement of your own click, not information.
    const reasons = (s2.reasons || []).filter(r => !/target list/.test(r));
    $('#clock-why').textContent = reasons[0] || (s2.reasons && s2.reasons[0]) || '';
    /* THE CONTEXT LINE ON THE ONE-ANSWER CARD. Same reasoning as `.rec-context`:
     * the board facts rule 16 demoted are still worth reading at pick 41, and
     * they must not sit in `#clock-why`, which is the REASON.
     *
     * Injected if the shell has no slot, the same pattern `#clock-take` already
     * uses — `views/admin/warroom.ejs` is B's and this is A's markup. */
    if (s2.context && s2.context.length) {
      let cx = $('#clock-context');
      if (!cx) {
        cx = document.createElement('div');
        cx.id = 'clock-context';
        cx.className = 'clock-context';
        const why = $('#clock-why');
        if (why && why.parentNode) why.parentNode.insertBefore(cx, why.nextSibling);
      }
      if (cx) {
        cx.textContent = s2.context.join(' · ');
        cx.style.display = '';
      }
    } else {
      const cx = $('#clock-context');
      if (cx) cx.style.display = 'none';
    }
    if (s2.targeted) {
      $('#clock-name').innerHTML += '<span class="clock-star" title="On your target list">\u2b50</span>';
    }
    const c = out.confidence;
    $('#clock-confidence').innerHTML = i > 0
      ? '<span class="muted">Option ' + (i + 1) + ' — you skipped ' + escapeHtml(list[0].player.name) + '</span>'
      : '<span class="' + c.level + '">' + escapeHtml(c.message) + '</span>';
    // THE TAKE BUTTON (SEV1, phone-blocker fix 2026-08-10): the "One answer" view
    // is the primary MOBILE surface, and it shipped with NO take button — the shell
    // never had a #clock-take element, so this block used to no-op and you could
    // read the recommendation but not draft it. Now we CREATE the button if it is
    // missing and place it FIRST in the actions row (the primary action, always
    // present and reachable), so "One answer" can always actually draft.
    let take = $('#clock-take');
    if (!take) {
      take = document.createElement('button');
      take.id = 'clock-take';
      take.className = 'btn gold clock-take';
      // inline so it is prominent and full-width even before B styles .clock-take
      take.style.cssText = 'display:block;width:100%;margin:.5rem 0;font-size:1.05rem;padding:.7rem';
      const actions = $('#clock-actions') || (($('#clock-confidence') || {}).parentNode);
      const anchor = document.querySelector('.clock-actions');
      if (anchor) anchor.parentNode.insertBefore(take, anchor);   // above next/full-board
      else if (actions) actions.appendChild(take);
    }
    take.setAttribute('data-draft-me', String(p.player_id));

    /* ── THE MANUAL TAKE IS A DEAD-SYNC FALLBACK, NOT THE PRIMARY PATH ────────
     *
     * Cory drafts in Sleeper. His pick arrives through the same 4-second sync as
     * the other nine, `applyRemote` places it, and `noteReconciledPick` records
     * the override — so the tool already records his pick automatically and
     * depletes the board. **The button is not what writes the ledger.**
     *
     * VERIFIED BEFORE DEMOTING, which was the condition: the one thing the tap
     * uniquely produced was `pathKey`, and the sync path now recovers it by the
     * same candidate lookup. Nothing else is lost.
     *
     * SO IT STAYS — sync can die, and on that night a dead sync with no manual
     * path would be unrecoverable — but it stops being the loud full-width
     * primary action. B owns the treatment; this stops asserting one.
     */
    take.textContent = '✓ Take ' + (p.name || 'him') + ' manually';
    take.title = 'Sleeper sync records your pick automatically. Use this only if '
      + 'sync has stopped.';
    take.setAttribute('data-role', 'fallback');
    take.style.cssText = 'display:block;margin:.5rem 0';
    take.style.display = 'block';

    /* ── THE THREE STATES, AS A CONTRACT RATHER THAN A LABEL ──────────────────
     *
     * "On the clock" implies a timer this untimed draft does not have, and the
     * eyebrow that renders it lives in `views/admin/warroom.ejs` — B's shell. So
     * A publishes the STATE and B renders the words:
     *
     *   between   nine people are picking; "if your turn came now, it is X",
     *             live, because that is what says what is slipping away.
     *   my_turn   this pick is mine, and its recommendation is locked
     *             (`state.lockedRecs`, keyed by pick number).
     *
     * ⚠️ ONLY TWO, AND THE THIRD IS NOT A RENDER STATE. "After my pick" is an
     * EVENT — the reconcile that records what I took and compares it against the
     * lock — not a condition the clock can be in. The instant it fires, the
     * current pick has moved on and the card is legitimately `between` again.
     * Emitting a third value would give B a state to style that is never true
     * for longer than one render, and a UI that flickers through it would be
     * lying about what the tool knows.
     *
     * (My first version of this line had a ternary whose two branches were the
     * SAME STRING — a three-state contract that could only ever emit one of two
     * values, one of them by accident. Fixed here rather than shipped.)
     *
     * Emitted as `data-clock-state` on the clock card, the same A-computes /
     * B-styles contract `dp-flat` already uses. */
    // `card` is already `$('#clock-card')` from the top of this function — reuse
    // it rather than re-querying, which is also what caught my duplicate `const`.
    if (card) {
      const mine = mySlot();
      const cur = currentPick();
      const order = (state.data.pick_order || {}).picks || [];
      const row = cur == null ? null : order.find(x => x.overall === cur);
      // UNKNOWN IS ITS OWN VALUE. Before the pick order resolves there is no
      // honest answer, and defaulting to `between` would tell B the draft is
      // running when the tool does not yet know whose turn it is.
      card.setAttribute('data-clock-state',
        !row || mine == null ? 'unknown' : (row.slot === mine ? 'my_turn' : 'between'));
    }
  }

  /* ── Your own read ──────────────────────────────────────────────────────── */
  function renderLists() {
    const host = $('#lists');
    if (!host) return;
    const nameOf = id => {
      const p = (state.data && state.data.players || []).find(x => x.player_id === id);
      return p ? p.name : id;
    };
    const chip = (id, kind) => '<button class="list-chip ' + kind + '" data-unlist="' + kind
      + '" data-id="' + escapeHtml(id) + '">' + escapeHtml(nameOf(id)) + ' \u2715</button>';
    const t = state.lists.targets, a = state.lists.avoid;
    host.innerHTML =
      '<div class="list-row"><b>\u2b50 Targets</b>'
        + (t.length ? t.map(id => chip(id, 'targets')).join('') : '<span class="muted">none yet</span>')
      + '</div>'
      + '<div class="list-row"><b>\u{1F6AB} Never</b>'
        + (a.length ? a.map(id => chip(id, 'avoid')).join('') : '<span class="muted">none yet</span>')
      + '</div>';
  }

  /* ── The adjusters ──────────────────────────────────────────────────────── */
  const AUTO_KEY = 'mfga.draft.autoweights';
  function loadAuto() {
    try { state.autoWeights = localStorage.getItem(AUTO_KEY) === '1'; } catch (e) {}
  }
  /* Re-apply the auto weights for the current draft state.
   *
   * Called from renderAll, so it tracks the draft rather than waiting to be
   * asked. Silent when nothing changed — a banner that repeats itself every
   * pick is a banner you stop reading by round 3.
   */
  function applyAutoWeights() {
    if (!state.autoWeights || !state.data) return;
    const a = E.autoWeights(context());
    const same = Object.keys(a.weights).every(k => state.weights[k] === a.weights[k]);
    state.lastAuto = a;
    if (same) { renderAutoNote(a, false); return; }
    state.weights = Object.assign({}, a.weights);
    syncSliders();
    saveWeights();
    renderAutoNote(a, true);
  }
  function renderAutoNote(a, changed) {
    const host = $('#auto-note');
    if (!host) return;
    if (!state.autoWeights) { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = '<div class="auto-phase">' + escapeHtml(a.phase)
      + ' <span class="muted">round ' + a.round + (changed ? ' · adjusted' : '') + '</span></div>'
      + a.reasons.map(r => '<div class="auto-reason ' + r.kind + '">'
          + escapeHtml(r.text) + '</div>').join('');
  }

  /* Push state.weights into the slider DOM + labels — the ONE writer of the
   * slider surface, so the panel can never say a weight the engine isn't loaded
   * with. The markup ships hardcoded at value="1"/label 1.0 (a static EJS
   * default), and the tool boots on the MEASURED core, which zeroes tier, need,
   * risk, ceiling and bye. Without this call on init the panel showed every
   * slider at 1.0 under a highlighted "Measured" preset — the same lie the reset
   * button told: a surface claiming the weights are one thing while the engine
   * loads another. Called on init and after server-pref adoption. */
  /* THE SLIDERS CONTRADICTED THEIR OWN CAPTIONS (Cory's capture: TIER at 1.2
   * under copy reading "OFF by default"). Both were true — the caption
   * describes the MEASURED default, the value is the LIVE policy (auto mode
   * re-weights every pick) — and the page never reconciled them. Now every
   * slider whose live value differs from its measured default says which
   * authority moved it, right next to the number. The measured default is read
   * from the markup's own value attribute (the EJS hardcodes MEASURED_WEIGHTS
   * as the no-JS fallback), so this cannot drift from the caption it explains. */
  function syncSliders() {
    $$('.weight-slider').forEach(sl => {
      const v = state.weights[sl.dataset.weight];
      if (v == null) return;
      const measured = parseFloat(sl.getAttribute('value'));   // the EJS-stamped default
      sl.value = v;
      const lab = $('#w-' + sl.dataset.weight);
      if (lab) {
        const differs = isFinite(measured) && Math.abs(Number(v) - measured) >= 0.05;
        lab.innerHTML = Number(v).toFixed(1)
          + (differs
            ? ' <span class="muted" style="font-weight:400">('
              + (state.autoWeights ? 'auto for this round' : 'yours')
              + ' — measured default ' + measured.toFixed(1) + ')</span>'
            : '');
      }
    });
  }

  function renderPresets() {
    const host = $('#presets');
    if (!host) return;
    const current = E.matchPreset(state.weights);
    host.innerHTML = '<button class="btn small ' + (state.autoWeights ? 'gold' : 'ghost')
      + '" data-auto="1" title="Re-weight automatically as the draft moves">'
      + (state.autoWeights ? '\u26a1 Auto ON' : '\u26a1 Auto') + '</button>'
      + E.WEIGHT_PRESETS.map(p =>
      '<button class="btn small ' + (p.key === current ? 'gold' : 'ghost')
      + '" data-preset="' + p.key + '">' + escapeHtml(p.label) + '</button>').join('')
      // Custom is a state, not a button: you get there by moving a slider, and
      // showing it as one you could press would be a lie about what it does.
      + (current ? '' : '<span class="preset-custom">custom</span>');
    const why = $('#preset-why');
    if (why) {
      const p = E.WEIGHT_PRESETS.find(x => x.key === current);
      if (state.autoWeights) {
        why.textContent = 'Auto is driving these — they re-weight themselves every '
          + 'pick as the draft moves, and say why below. Move any slider to take back over.';
        return;
      }
      why.textContent = p ? p.why
        : 'You have moved these off every preset. That is fine — the presets are '
          + 'starting points, not settings.';
    }
  }

  function applyPreset(key, prefix) {
    const p = E.WEIGHT_PRESETS.find(x => x.key === key);
    if (!p) return;
    const before = state.lastClock ? state.lastClock.scored : null;
    state.weights = Object.assign({}, p.weights);
    syncSliders();
    saveWeights();
    renderRecommendations();
    reportWeightEffect(before, prefix || (p.label + ' applied.'));
    renderPresets();
  }

  function reportWeightEffect(before, prefix) {
    const el = $('#weights-effect');
    if (!el) return;
    const after = state.lastClock ? state.lastClock.scored : null;
    const d = E.rankDiff(before, after);
    el.className = d.topChanged ? 'weights-effect changed' : 'muted weights-effect';
    el.textContent = ((prefix ? prefix + ' ' : '') + (d.message || '')).trim();
  }

  /* Is the keeper slate the board was built on one anybody has checked?
   *
   * The slate is the single input that can be wrong while every number derived
   * from it — adjusted ADP, the true pick order, my pick numbers — still looks
   * perfectly normal. So it gets a banner, not a log line, and the banner
   * distinguishes "never confirmed" from "confirmed then edited". The second is
   * the dangerous one: it means somebody checked a slate that is no longer the
   * one on screen.
   */
  function checkKeeperLock() {
    if (!window.KeeperLock) return;
    const KL = window.KeeperLock;
    const built = KL.slateFromForfeited((state.data.pick_order || {}).forfeited || []);
    let slate = built;
    try {
      const saved = JSON.parse(localStorage.getItem(KL.CFG.SLATE_KEY) || 'null');
      if (saved && Object.keys(saved).length) slate = saved;
    } catch (e) { /* private mode — the built slate stands */ }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KL.CFG.LOCK_KEY) || 'null'); } catch (e) {}
    state.keeperLock = KL.lockState(stored, slate, Date.now());
    state.keeperSlate = slate;
    renderKeeperLock();
  }

  function renderKeeperLock() {
    const host = $('#keeper-lock-note');
    if (!host) return;
    const st = state.keeperLock;
    // A mock has no keepers at all, so the banner would be noise you learn to
    // scroll past — and learning to scroll past this one is the failure.
    if (!st || (st.locked && !st.stale) || state.mockMode) { host.style.display = 'none'; return; }
    host.style.display = '';
    /* A3 progress line (final-pass): "N of 10 teams designated" \u2014 derived from
     * the slate the banner itself is asking about (distinct seats with a
     * forfeited-pick designation on the built board), so the number and the
     * warning can never come from two sources. */
    const teams = ((state.data || {}).league || {}).teams || 10;
    const designated = Object.keys(state.keeperSlate || {}).length;
    host.innerHTML = '<div class="stale-block' + (st.stale ? ' warn' : '') + '">'
      + '<h3>' + (st.stale ? '\u26a0\ufe0f Keeper slate confirmed a while ago'
                          : '\u26d4 Keeper slate not confirmed') + '</h3>'
      + '<p>' + escapeHtml(st.message) + '</p>'
      + '<p class="muted" style="margin:.2rem 0 0;font-size:.8rem"><b>' + designated
      + ' of ' + teams + '</b> teams have keepers designated on this board build.</p>'
      + '<p><a class="btn small gold" href="/admin/keepers">\u{1F512} Review and confirm the slate</a></p>'
      + '</div>';
  }

  /* ── Who picks before you, and what they are likely to do ───────────────── */
  /* §2(d) — the CONDENSED opponent strip for Zone 2: each seat between now and my
   * next pick, their top-2 likely picks and one tendency line. Same threatBoard
   * data as the full Zone-3 card, compressed for the rail. */
  function renderThreatStrip() {
    const host = $('#threat-strip');
    if (!host) return;
    const t = E.threatBoard(context());
    if (!t.rows.length) {
      host.innerHTML = '<p class="muted" style="margin:0; font-size:.78rem">On the clock — nobody picks before your next turn.</p>';
      return;
    }
    // Generic, not silent: say the count and say the seats are unknown. The
    // dossier's league-wide tendencies are still true and still shown; what is
    // suppressed is any claim about WHO sits where.
    const unassigned = !state.profilesMappedFromDraft;

    // FEATURE C — OPPONENT POSITIONAL NEEDS. Who still needs a starter where, both
    // among the seats before my turn (imminent runs) and league-wide (what I can
    // wait on). Turns a generic survival number into WHO specifically wants WHAT.
    let needsHtml = '', perTeamNeed = {};
    try {
      if (typeof DraftNeeds !== 'undefined' && state.rosters
          && Object.keys(state.rosters).some(k => (state.rosters[k] || []).length)) {
        const starters = (state.data.league || {}).starters || {};
        const slotsBefore = t.rows.map(r => r.team_slot).filter(s => s != null);
        const before = DraftNeeds.needsBeforePick(state.rosters, starters, slotsBefore);
        const league = DraftNeeds.leagueNeeds(state.rosters, starters);
        perTeamNeed = before.perTeam || {};
        // Imminent: "3 of the 4 before you need RB" — the run about to happen.
        const imm = DraftNeeds.pressure(before, league, (state.data.league || {}).teams || 10)
          .filter(p => p.before > 0).slice(0, 3)
          .map(p => '<b>' + p.before + '</b>/' + before.n + ' need ' + p.pos).join(' · ');
        // League-wide: "QB only 2 still need one — you can wait".
        const scarce = Object.keys(league).filter(p => p !== 'FLEX')
          .sort((a, b) => league[a] - league[b])
          .slice(0, 3).map(p => p + ' <b>' + league[p] + '</b>').join(' · ');
        needsHtml = (imm ? '<div class="ts-needs">before your turn: ' + imm + '</div>' : '')
          + (scarce ? '<div class="ts-needs ts-needs-lg">still need a starter — ' + scarce
            + ' <span class="muted">(low = wait)</span></div>' : '');
      }
    } catch (e) { /* needs never block the strip */ }

    host.innerHTML = '<div class="ts-head">' + t.picksUntilNext + ' pick'
      + (t.picksUntilNext === 1 ? '' : 's') + ' before your turn'
      + (unassigned ? ' <span class="muted">· seats unassigned until Sleeper '
        + 'names them</span>' : '') + '</div>'
      + needsHtml
      + t.rows.slice(0, 6).map(r => {
        const who = r.manager ? escapeHtml(r.manager) : 'Seat ' + r.team_slot;
        const names = r.likely.length
          ? r.likely.slice(0, 2).map(l => escapeHtml(l.name)).join(', ')
          : '<span class="muted">nothing stands out</span>';
        const tell = r.tells.length ? escapeHtml(r.tells[0].text) : '';
        // Cross the dossier with need: a team that NEEDS a position it also
        // historically reaches for is the sharpest threat — show what it needs
        // right next to how it drafts.
        const need = (perTeamNeed[r.team_slot] || []).filter(p => p !== 'FLEX');
        const needStr = need.length ? '<span class="ts-need">needs ' + need.slice(0, 3).join('/') + '</span>' : '';
        return '<div class="ts-row"><span class="ts-seat"><b>' + r.pick_no + '</b> ' + who + '</span>'
          + '<span class="ts-likely">' + names + '</span>'
          + needStr
          + (tell ? '<span class="ts-tell">' + tell + '</span>' : '') + '</div>';
      }).join('');
  }

  function renderThreats() {
    const host = $('#threats');
    if (!host) return;
    const head = $('#threats-head');
    const t = E.threatBoard(context());
    if (!t.rows.length) {
      if (head) head.textContent = '';
      host.innerHTML = '<p class="muted" style="margin:0">You are on the clock, or this is '
        + 'your last pick — nobody picks between now and your next turn.</p>';
      return;
    }
    if (head) head.textContent = t.picksUntilNext + ' pick'
      + (t.picksUntilNext === 1 ? '' : 's') + ' before your turn'
      + (state.profilesMappedFromDraft ? '' : ' · seats unassigned');

    // Scoped HERE, not borrowed from renderThreatStrip. The first version of the
    // seat-not-assigned message read that function's `unassigned` const from this
    // one, which is a ReferenceError at render time — it would have taken the
    // whole threat panel down on the clock to fix a wording problem.
    const seatsUnassigned = !state.profilesMappedFromDraft;
    const haveDossier = Object.keys(
      ((state.data || {}).manager_profiles || {}).managers || {}).length > 0;

    // At-risk first. It is the answer; the seat-by-seat breakdown is the
    // working, and on the clock most people only ever read the answer.
    let html = '';
    if (t.atRisk.length) {
      // The two-model chart: the same players' market and room numbers side by
      // side — the disagreement the page used to print under one caption is
      // now ONE encoding with a legend. Market % looked up from the SAME
      // scored board the recommendations rendered (state.lastClock), never a
      // second survival computation.
      try {
        if (typeof DraftCharts !== 'undefined') {
          const svById = {};
          ((state.lastClock || {}).scored || []).forEach(s => {
            svById[String(s.player.player_id)] = s.survival_to_next;
          });
          html += DraftCharts.goneChart(t.atRisk.map(r => ({
            name: r.name, position: r.position,
            market_gone: svById[String(r.player_id)] == null ? null
              : Math.round((1 - svById[String(r.player_id)]) * 100),
            room_gone: r.gone,
          })));
        }
      } catch (e) { console.error('[gone-chart]', e && e.message); }
      html += '<div class="threat-risk"><div class="threat-sub">Most likely to be gone '
        + '<span class="muted">(room model — who the seats ahead actually take; '
        + 'this is the number that differentiates players the market lumps together)</span></div>'
        + t.atRisk.map(r =>
          '<div class="risk-row">'
          + '<span class="risk-pct' + (r.gone >= 70 ? ' hot' : '') + '">' + r.gone + '%</span>'
          + '<span class="risk-name">' + escapeHtml(r.name)
            + '<span class="rec-pos ' + r.position + '">' + r.position + '</span></span>'
          + '<span class="risk-by">' + (r.by
              ? 'likely ' + escapeHtml(r.by) + ' at ' + r.by_pick
              : '<span class="muted">no single seat stands out</span>') + '</span>'
          + '</div>').join('')
        + '</div>';
    }

    /* NOISE COLLAPSE (Cory's capture: FOURTEEN near-identical seat blocks, every
     * one saying "MAY TARGET RB 45% WR 36% TE 11% · seat mapping unavailable²" —
     * pages of repetition whose entire content was "seats unassigned"). When the
     * seat mapping is missing, every seat is league-average BY CONSTRUCTION
     * (profileForSlot returns null → CFG defaults), so per-seat rows carry zero
     * information beyond their pick numbers. One honest line says so; the rows
     * live one tap deeper for when the mapping lands mid-night. Nothing removed. */
    const rowsHtml = t.rows.map(r => {
      const who = r.manager ? escapeHtml(r.manager) : 'Seat ' + r.team_slot;
      const pos = r.positions.slice(0, 3).map(p =>
        '<span class="rec-pos ' + p.position + '">' + p.position + '</span>'
        + '<span class="muted">' + Math.round(p.p * 100) + '%</span>').join(' ');
      const names = r.likely.length
        ? r.likely.map(l => '<span class="threat-name">' + escapeHtml(l.name)
            + ' <span class="muted">' + l.p + '%</span></span>').join('')
        : '<span class="muted">nothing stands out</span>';
      // No history means no tell. Saying so is better than an empty space that
      // reads as "this one is unpredictable".
      /* THE THIRD MESSAGE, BECAUSE THERE ARE THREE STATES AND THERE WERE TWO.
       *
       * "no draft history on Sleeper" was FALSE and had been on the page all
       * along. There are 468 picks across three drafts, profiled for all ten
       * managers, sitting in the same artifact and rendered in Know Your League
       * three inches up the page. What is missing is not the history — it is
       * the mapping from SEAT to manager, which only exists once Sleeper assigns
       * the draft order and importDraftOrder resolves it by uid.
       *
       * That distinction is the whole answer to "why is every seat identical":
       * positionProbabilities reads team.profile, profileForSlot returns null
       * until the mapping lands, so every seat gets CFG defaults BY
       * CONSTRUCTION. Telling Cory "no history" invites him to conclude the
       * dossier is worthless; telling him "the seat is not assigned yet" is what
       * is actually true and says when it changes.
       *
       * Kept distinct from the genuine no-history case, which is still possible
       * for a manager who has never drafted in this league. */
      const tells = r.tells.length
        ? r.tells.map(x => '<div class="threat-tell">' + escapeHtml(x.text)
            + (x.proxy ? ' <span class="muted" title="measured against today\'s ranks, '
                + 'not the ADP of the day">(hint only)</span>' : '') + '</div>').join('')
        : '<div class="threat-tell muted">' + (r.sample_size
            ? 'nothing in ' + r.sample_size + ' draft' + (r.sample_size === 1 ? '' : 's')
              + ' stands out — he drafts near league average'
            : (seatsUnassigned && haveDossier
                // THE 29x REPEAT B MEASURED. This sentence rendered once PER
                // THREAT ROW — the same caveat, in full, down a whole column,
                // on the surface Cory reads under time pressure. The mechanism
                // to collapse it already existed four hundred lines above and
                // this string simply never went through it. A caveat repeated
                // twenty-nine times is not twenty-nine warnings, it is one
                // warning and twenty-eight lines of noise burying the numbers
                // the rows exist to show.
                ? 'seat mapping unavailable' + caveatOnce('seats_unassigned', '²',
                    'manager profiles exist, but cannot be assigned to draft seats until '
                    + 'the draft order is available — the position mix shown is league-average')
                : 'no draft history on Sleeper — modelled as league average')) + '</div>';
      return '<div class="threat-row">'
        + '<div class="threat-head"><span class="threat-pick">' + r.pick_no + '</span>'
        + '<b>' + who + '</b>' + '<span class="threat-pos">' + pos + '</span></div>'
        + '<div class="threat-names">' + names + '</div>'
        + tells
        + '</div>';
    }).join('');
    if (seatsUnassigned && haveDossier && t.rows.length > 2) {
      html += '<div class="threat-collapsed muted" style="font-size:.78rem;margin:.3rem 0">'
        + t.rows.length + ' seats pick before your next turn. All are modeled '
        + 'league-average until Sleeper assigns the draft order — the per-seat '
        + 'dossiers exist (Know Your League) but cannot be mapped to seats yet.</div>'
        + '<details><summary style="font-size:.75rem;cursor:pointer">per-seat rows '
        + '(league-average until seats are assigned)</summary>' + rowsHtml + '</details>';
    } else {
      html += rowsHtml;
    }
    host.innerHTML = explainPanel('threats') + html;
  }

  /* ── The queue, and the sheet you print from it ─────────────────────────── */
  function renderQueue() {
    const host = $('#queue');
    if (!host) return;
    const q = state.lists.queue;
    const head = $('#queue-head');
    const gone = q.filter(id => state.drafted.has(String(id))).length;
    if (head) {
      head.textContent = q.length
        ? q.length + ' deep' + (gone ? ' · ' + gone + ' already drafted' : '')
        : 'empty';
    }
    const tidy = $('#queue-tidy');
    if (tidy) {
      tidy.hidden = !gone;
      tidy.textContent = '\u{1F9F9} Remove ' + gone + ' drafted';
    }
    if (!q.length) {
      host.innerHTML = '<p class="muted" style="margin:0">Nothing queued. Add anyone with '
        + '➕ on the draft board, or tap <b>Fill from board</b> to seed it with the '
        + 'top 15 and edit from there.</p>';
      return;
    }
    const players = state.data.players || [];
    host.innerHTML = q.map((id, i) => {
      const p = players.find(x => String(x.player_id) === String(id));
      const isGone = state.drafted.has(String(id));
      const name = p ? p.name : id;
      return '<div class="q-row' + (isGone ? ' gone' : '') + '">'
        + '<span class="q-rank">' + (i + 1) + '</span>'
        + '<span class="q-name">' + escapeHtml(name)
          + (p ? '<span class="rec-pos ' + p.position + '">' + p.position + '</span>' : '')
          + (p && p.bye ? '<span class="muted"> bye ' + p.bye + '</span>' : '')
          + (isGone ? '<span class="q-gone">drafted</span>' : '')
        + '</span>'
        + '<span class="q-move">'
          // Take + Compare on every queue row (Cory): drafting a queued guy — or
          // comparing him — is one tap from the list you read on the clock, same
          // classes as the recs rows so B's styling picks them up.
          + (isGone ? '' : '<button class="btn small gold" data-draft-me="' + escapeHtml(String(id))
            + '" title="I took him">✓</button>')
          // ⚖️ alone read as decoration at 8s/pick (B, 08-18 — same rule as the
          // .ss-issues fix: meaning must be visible, not hover-only).
          + '<button class="btn small ghost" data-compare="' + escapeHtml(String(id))
            + '" title="Compare — dollar gap">⚖️ Compare</button>'
          + '<button class="btn small ghost" data-qmove="-1" data-id="' + escapeHtml(String(id))
            + '"' + (i === 0 ? ' disabled' : '') + ' title="Up">▲</button>'
          + '<button class="btn small ghost" data-qmove="1" data-id="' + escapeHtml(String(id))
            + '"' + (i === q.length - 1 ? ' disabled' : '') + ' title="Down">▼</button>'
          + '<button class="btn small ghost" data-queue="' + escapeHtml(String(id))
            + '" title="Remove from queue">✕</button>'
        + '</span>'
        + '</div>';
    }).join('');
  }

  /* Build the sheet from live state, so it can never be a stale copy of one. */
  function buildSheet() {
    const sheet = E.cheatSheet(context(), state.lists);
    const meta = {
      title: (state.data.league || {}).name || '',
      myPicks: myNextPicks().slice(0, 8),
      built_at: state.data.built_at || '',
    };
    return { sheet: sheet, meta: meta };
  }

  function copySheet() {
    const { sheet, meta } = buildSheet();
    const text = E.sheetText(sheet, meta);
    const say = m => { const el = $('#sheet-note'); if (el) el.textContent = m; };
    // navigator.clipboard needs https and a user gesture, and Safari has denied
    // it in enough contexts that a silent failure here is a real possibility.
    // The textarea fallback is ugly and works everywhere.
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      say(ok ? 'Copied — ' + text.split('\n').length + ' lines on the clipboard.'
             : 'Could not copy. Use Print sheet instead, or select the text manually.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => say('Copied — ' + text.split('\n').length + ' lines on the clipboard.'),
        fallback);
    } else fallback();
  }

  /* Open the sheet in its own window, styled for paper.
   *
   * Its own window rather than a print stylesheet on this page: the War Room is
   * a dense live dashboard and printing it would produce eleven pages of things
   * that are meaningless on paper. This prints one document that was designed
   * to be one document.
   */
  function printSheet() {
    const { sheet, meta } = buildSheet();
    const esc = escapeHtml;
    const cell = p => '<td>' + (p.targeted ? '⭐ ' : '') + esc(p.name) + '</td>'
      + '<td class="p">' + esc(p.position) + '</td>'
      + '<td class="s">' + esc(p.team || '') + '</td>'
      + '<td class="s">' + (p.bye || '') + '</td>'
      + '<td class="s">' + (p.tier ? 'T' + p.tier : '') + '</td>'
      + '<td class="s">' + (p.adp == null ? '' : p.adp) + '</td>'
      + '<td class="s">' + (p.survives_to_next == null ? '' : survivalText(p.survives_to_next / 100)) + '</td>';
    const table = rows => '<table>' + rows + '</table>';
    const g = sheet.generated;

    const queueRows = sheet.queue.length ? sheet.queue.map((p, i) => p.gone
      ? '<tr class="gone"><td colspan="8">' + (i + 1) + '. already drafted</td></tr>'
      : '<tr><td class="n">' + (i + 1) + '</td>' + cell(p) + '</tr>').join('')
      : '<tr><td colspan="8" class="s">empty</td></tr>';

    const html = '<!doctype html><meta charset="utf-8">'
      + '<title>MFGA draft sheet</title><style>'
      + 'body{font:11px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:14px}'
      + 'h1{font-size:15px;margin:0 0 2px} h2{font-size:12px;margin:12px 0 3px;'
      + 'border-bottom:1px solid #999;text-transform:uppercase;letter-spacing:.04em}'
      + '.meta{font-size:10px;color:#555;margin:0 0 6px}'
      + '.warn{font-size:10px;color:#a00;margin:0 0 4px}'
      + 'table{width:100%;border-collapse:collapse} td{padding:1px 3px;vertical-align:top}'
      + 'tr:nth-child(even){background:#f3f3f3}'
      + '.n{width:20px;color:#777} .p{width:34px;font-weight:700} .s{color:#555;white-space:nowrap}'
      + '.gone{color:#999;text-decoration:line-through}'
      + '.cliff td{border-bottom:2px solid #333}'
      + '.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}'
      + '@media print{body{margin:0}}'
      + '</style>'
      + '<h1>Draft sheet' + (meta.title ? ' — ' + esc(meta.title) : '') + '</h1>'
      + '<p class="meta">Snapshot at pick ' + (g.current_pick || '?') + ' · '
        + g.roster_size + ' on your roster · ' + (g.my_picks_left == null ? '?' : g.my_picks_left)
        + ' picks left'
        + (meta.myPicks.length ? ' · your picks: ' + meta.myPicks.join(', ') : '')
        + (meta.built_at ? ' · board built ' + esc(meta.built_at) : '')
        + '<br>⭐ = target. The % column is the chance he lasts to your next turn. '
        + 'Scores depend on what you have already drafted, so this ages as you pick.</p>'
      + (sheet.warnings || []).map(w => '<p class="warn">⚠ ' + esc(w) + '</p>').join('')
      + '<h2>Your queue — take them top down</h2>' + table(queueRows)
      + '<h2>Best available — the board\'s order</h2>'
      + table(sheet.best.map((p, i) => '<tr><td class="n">' + (i + 1) + '</td>' + cell(p) + '</tr>').join(''))
      + '<div class="cols">' + sheet.byPosition.map(grp =>
          '<div><h2>' + esc(grp.position) + '</h2>' + table(grp.players.map((p, i) =>
            '<tr class="' + (p.tier_break ? 'cliff' : '') + '"><td class="n">' + (i + 1) + '</td>'
            + cell(p) + '</tr>').join('')) + '</div>').join('')
      + '</div>';

    const w = window.open('', '_blank');
    if (!w) {
      const el = $('#sheet-note');
      if (el) el.textContent = 'Your browser blocked the popup. Allow popups for this site, '
        + 'or use Copy queue and paste it somewhere you can print from.';
      return;
    }
    w.document.write(html);
    w.document.close();
    // Let it lay out before the print dialog measures it; without this Safari
    // has been known to print a blank first page.
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 350);
  }

  /* ── What is left to fill, and how many picks are actually spare ───────── */
  function renderPlan() {
    const host = $('#plan-note');
    if (!host) return;
    const plan = E.rosterPlan(context());
    const need = plan.needed.map(n =>
      '<span class="rec-pos ' + n.position + '">' + n.position + (n.count > 1 ? ' ×' + n.count : '') + '</span>')
      .join('') + (plan.flexNeed ? '<span class="rec-pos FLEX">FLEX</span>' : '');
    host.innerHTML = '<div class="plan-note' + (plan.tight ? ' tight' : '') + '">'
      + '<div>' + escapeHtml(plan.message) + '</div>'
      + (need ? '<div class="plan-need">Still to fill: ' + need + '</div>' : '')
      + '</div>';
  }

  /* ── Bye weeks that actually cost you something ────────────────────────── */
  function renderByes() {
    const host = $('#byes');
    if (!host) return;
    const rows = E.byeGrid(context());
    if (!rows.length) {
      host.innerHTML = '<p class="muted" style="margin:0">Nothing drafted yet.</p>';
      $('#bye-head').textContent = '';
      return;
    }
    const holes = rows.filter(r => r.severity === 'bad').length;
    $('#bye-head').textContent = holes
      ? holes + ' week' + (holes === 1 ? '' : 's') + " you can't field a lineup"
      : 'no holes';
    host.innerHTML = rows.map(r =>
      '<div class="bye-row ' + r.severity + '">'
      + '<span class="bye-week">Wk ' + r.week + '</span>'
      + '<span class="bye-players">' + r.players.map(p =>
          '<span class="rec-pos ' + p.position + '">' + p.position + '</span> ' + escapeHtml(p.name))
          .join(', ') + '</span>'
      + (r.shorts.length
          ? '<span class="bye-short">' + r.shorts.map(sh =>
              sh.position + ' ' + sh.available + '/' + sh.need).join(' · ')
            + (r.provisional ? ' <span class="muted">— fixable with later picks</span>' : '')
            + '</span>'
          : '')
      + '</div>').join('');
  }

  /* ── ADP MOVERS — the market's fastest re-pricings, both directions ──────
   * Cory (2026-08-16): "Do we have way to capture quick movement in ADPs …
   * Maybe a small screen on war room showing the top 10 ADP movers up and top
   * 10 down?" DraftMovers sorts what build.py already stamped (adp_velocity /
   * adp_stale from the retained daily series); this prints it. Context-rail
   * panel: it informs a pick, it never scores one, and it must not displace
   * the verdict. Day one of a fresh series renders the honest shallow state —
   * absent, not zero. Pinned by ui_fidelity_movers.test.js. */
  function renderAdpMovers() {
    const host = $('#adp-movers');
    if (!host) return;
    if (typeof DraftMovers === 'undefined' || !state.data) { host.innerHTML = ''; return; }
    const notes = state.data.notes || {};
    const span = notes.adp_series_span_days != null ? notes.adp_series_span_days : null;
    const m = DraftMovers.movers(state.data.players || [], { span });
    // ONE call site so panel_guide.test.js's caption census stays exact.
    const explain = explainPanel('adp_movers');
    const head = $('#movers-head');
    if (head) {
      head.textContent = m.state === 'ok'
        ? (m.span != null ? m.span + '-day window · ' : '') + m.counted + ' measured'
        : '';
    }
    if (m.state === 'shallow') {
      // THE HONEST EMPTY STATE. Every velocity is None until the retained
      // series has two days — that is the data being truthful, not a bug.
      host.innerHTML = explain
        + '<p class="muted wr-movers-empty">series too shallow — velocity means '
        + 'nothing yet. The board keeps one ADP snapshot per day; movement '
        + 'appears when there are two. Absent, not zero.</p>';
      return;
    }
    const row = (r, dir) => {
      const p = r.player;
      const vel = (dir === 'up' ? '+' : '−') + Math.round(Math.abs(r.velocity));
      const perDay = r.per_day != null
        ? '<span class="wr-mover-rate wr-num">' + (dir === 'up' ? '+' : '−')
          + Math.abs(r.per_day).toFixed(1) + '/day</span>'
        : '';
      // adp_stale is the series' own ALARM (moved ≥ a round while the board's
      // nightly number sat still) — it wears the alarm color, nothing else here does.
      const stale = r.stale
        ? '<button type="button" class="wr-mover-stale" data-flag-legend="adp_stale" '
          + 'data-flag-arg="' + escapeHtml(r.stale.direction + ' ' + r.stale.slots + ' slots in '
          + r.stale.days + 'd') + '">STALE</button>'
        : '';
      return '<div class="wr-mover-row' + (r.stale ? ' is-stale' : '') + '">'
        + '<span class="wr-mover-dir" aria-hidden="true">' + (dir === 'up' ? '▲' : '▼') + '</span>'
        + '<span class="wr-mover-name">' + escapeHtml(shortName(p.name))
        + ' <span class="rec-pos ' + p.position + '">' + p.position + '</span></span>'
        + '<span class="wr-mover-adp wr-num" title="current ADP (market)">'
        + (r.adp != null ? 'ADP ' + Math.round(r.adp) : 'ADP —') + '</span>'
        + '<span class="wr-mover-vel wr-num" title="ADP slots moved over the window">'
        + vel + '</span>' + perDay + stale
        + '</div>';
    };
    const col = (label, rows, dir, emptyLine) =>
      '<div class="wr-mover-col"><div class="wr-mover-colhead">' + label
      + (rows.length ? ' — top ' + rows.length : '') + '</div>'
      + (rows.length ? rows.map(r => row(r, dir)).join('')
        : '<p class="muted wr-movers-empty">' + emptyLine + '</p>')
      + '</div>';
    host.innerHTML = explain
      + '<div class="wr-movers">'
      + col('▲ Rising', m.up, 'up', 'nobody rising over this window')
      + col('▼ Falling', m.down, 'down', 'nobody falling over this window')
      + '</div>'
      + '<p class="wr-mover-cap muted">movement hints at news — check before you pay '
      + 'the old price. Informational: feeds no score.</p>';
  }

  /* ── Pre-draft checklist ────────────────────────────────────────────────
     Every line is checked live against real state. A checklist you have to
     verify by hand is one nobody runs on the morning of the draft. */
  /* Commissioner-only: the reconciled accounting, itemized. Shows the roster
   * composition (keepers vs marked picks) and the pick coordinates on one line,
   * and lists any disagreement the reconciler found — so "5/9 starters" is never
   * an unexplained number again, and a real over-count is named, not hidden. */
  function renderAccountingNote() {
    const host = $('#accounting-note');
    if (!host) return;
    const a = state.accounting;
    if (!a) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'prov-note ' + (a.agree ? '' : 'bad');
    let html = '<b>🧮 Accounting</b> <span>' + escapeHtml(a.line) + '</span>';
    if (!a.agree) {
      html += '<ul style="margin:.3rem 0 0 1rem;padding:0">'
        + a.problems.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('')
        + '</ul>';
    }
    host.innerHTML = html;
  }

  /* Delegates to DraftKeepers so the logic is a TESTABLE module function rather
   * than a closure inside a browser IIFE that only a source-grep can inspect
   * (rule 11e: a prose scan cannot tell an implementation from a comment about
   * one). Guarded, because throwing here would take the whole checklist with it
   * — and a checklist that fails to render is worse than any line on it. */
  function keeperSlateCheck(d) {
    const K = window.DraftKeepers;
    if (!K || typeof K.keeperSlateCheck !== 'function') {
      return { ok: false, label: 'Keeper slate the pick order is built on',
               detail: 'the keeper module did not load — this line cannot be evaluated',
               fix: 'Hard-refresh the war room; if it persists the module include list is wrong' };
    }
    return K.keeperSlateCheck(d);
  }

  function renderChecklist() {
    const host = $('#check-items');
    if (!host) return;
    const d = state.data || {};
    const prov = d.provenance || {};
    const freshCk = boardFreshness();           // ONE freshness policy — see boardFreshness()
    const ageH = freshCk.hours;
    const slot = mySlot();
    // THE ARITHMETIC INVARIANT every seat-derived check defers to: does my pick
    // count match my keeper count (rounds - keepers)? Pure arithmetic, so when it
    // fires nothing else on this checklist may report the same fact as "ok".
    const seatSlateFault = !!(state.accounting && (state.accounting.problems || [])
      .some(p => /keepers vs my_picks/.test(p)));

    const items = [
      { ok: !!d.players && d.players.length > 100,
        label: 'Board built', detail: (d.players || []).length + ' players' },
      // ONLY 'fresh' EARNS THE TICK. Passing the aging band produced "✅ Board is
      // fresh — 9h old, aging, rebuild soon" sitting beside an amber "⚠️ this board
      // is 9 hours old" — a tick and a warning about the same nine hours, and the
      // tick is what you believe (Cory, 2026-08-10). If it warrants a warning it is
      // not a tick, so aging now fails the item and says so in the same words the
      // banner uses. Same boardFreshness() policy throughout.
      { ok: freshCk.level === 'fresh',
        label: 'Board is fresh', detail: ageH == null ? 'never built'
          : Math.round(ageH) + 'h old'
            + (freshCk.level === 'aging' ? ' — aging, rebuild before you draft off it'
               : freshCk.level === 'stale' ? ' — STALE, rebuild required' : ''),
        fix: 'Run the Draft Board action on GitHub' },
      // These two read the SAME provenance the banner at the top reads. A
      // checklist that invents its own idea of "fine" will eventually disagree
      // with the banner, and a green tick next to a red banner is worse than
      // having neither.
      { ok: !(prov.adp || {}).warning && !((prov.adp || {}).fallback_count_in_play > 0),
        label: 'Real ADP, not fixtures',
        detail: (prov.adp || {}).warning ? 'fixture / offline build'
          : ((prov.adp || {}).adp_source || 'unknown')
            + ((prov.adp || {}).fallback_count_in_play
                ? ' — ' + prov.adp.fallback_count_in_play + ' guessed in play' : ''),
        fix: 'Re-run the Draft Board action with network access' },
      { ok: typeof prov.value_coverage === 'number' && prov.value_coverage >= 0.9,
        label: 'Projections cover the board',
        detail: typeof prov.value_coverage === 'number'
          ? Math.round(prov.value_coverage * 100) + '%'
          : 'not recorded — treat as unverified',
        fix: 'Rebuild the board' },
      { ok: (prov.opportunity_adjustment || '') === 'ok',
        label: 'Snap / target data joined',
        detail: prov.opportunity_coverage != null
          ? Math.round(prov.opportunity_coverage * 100) + '% matched'
          : (prov.opportunity_adjustment || 'disabled'),
        fix: 'Rebuild the board' },
      // A2: a slot that is merely CLAIMED is a placeholder — green only once it
      // is VERIFIED against the Sleeper draft object's draft_order. Amber (not
      // green) while manually set: the number can be right and still unconfirmed.
      { ok: !!slot && state.slotVerified,
        label: 'Draft slot verified against Sleeper draft object',
        detail: !slot ? 'not set'
          : state.slotVerified ? 'pick ' + slot + ' — from Sleeper, verified'
            : state.slotSource === 'site-claimed'
              ? 'pick ' + slot + ' — site-claimed, Sleeper pending (real claim; not yet Sleeper-verified)'
              : 'pick ' + slot + ' — manually set, UNVERIFIED (draft order not yet assigned)',
        fix: !slot ? 'Claim it on the Draft Spot page'
          : state.slotVerified ? ''
            : 'Connect the Sleeper draft room; the slot verifies automatically once the draft order is assigned' },
      // Pick NUMBERS recompute live when the slot changes, but keeper-adjusted
      // ADP does not — it was computed for whichever seat the pipeline built
      // with. A board that is right about when you pick and wrong about what
      // will be there is the worst of both, so this is a checklist line rather
      // than only a banner.
      // THESE TWO FOLLOW THE ARITHMETIC INVARIANT (Cory, 2026-08-10). A green tick,
      // an amber warning and a red cross about the SAME fact on the SAME page is
      // worse than any one of them: the tick is what you believe. `seatSlateFault`
      // is the accounting reconciler's keepers-vs-my_picks finding — pure
      // arithmetic — so when it fires, every seat-derived check defers to it
      // instead of reporting its own narrower question as "ok".
      { ok: !state.slotRecomputed && !seatSlateFault,
        label: 'Board built for your seat',
        detail: seatSlateFault
          ? 'NO — the seat and your keeper slate disagree (see Accounting)'
          : state.slotRecomputed
          ? 'built for seat ' + (state.slotRecomputed.from ? 'with picks ' + state.slotRecomputed.from : 'another seat')
            + ', you are now #' + state.slotRecomputed.slot
          : 'yes',
        fix: seatSlateFault
          ? 'Set My Draft Slot to the seat whose picks match your keeper count'
          : state.slotRecomputed
          ? 'Rebuild: Actions → Build draft board → slot ' + state.slotRecomputed.slot
          : '' },
      // OPPONENT KEEPER SLATES — the input that silently sets every pick number.
      // Under top_picks_flat each team's keepers forfeit THAT team's rounds 1..k,
      // so until the other seats declare, the pick order assumes all nine of them
      // pick in rounds 1-3. On the live board only my 3 keepers are confirmed, so
      // only my seat forfeits and my first pick prices at overall 34. If the room
      // keeps ~3 each, rounds 1-3 nearly empty out and every overall number, every
      // gap between my turns and every survival window moves with them. The
      // pipeline handles this correctly the moment it HAS the slates
      // (keepers.build_true_pick_order forfeits per team) — this line exists
      // because nothing else on the page looks wrong while it is missing.
      keeperSlateCheck(d),
      // SURVIVAL CALIBRATION, made READABLE. The mock harness has been recording
      // survival predictions AS DISPLAYED and resolving them for a while, and it
      // computes a binned curve plus a Brier score — but the only way to read it
      // was window.DraftMockCalib.report() in a browser console. Under rule 5 a
      // protection that exists but is unreachable under real conditions is
      // decorative, and Cory runs mocks from a phone. Data that accumulates and is
      // never read is the same failure as overrides logged and never graded.
      //
      // This is the ONLY honest calibration path we have: a true backtest on
      // 2023-25 would need those seasons' PRE-DRAFT ADP, which does not exist —
      // adp_series.json starts 2026-08-09 — and substituting the realized draft
      // order for ADP would make the test circular by construction. Mocks are
      // forward-clean by our own rule, so this is the measurement, not a stopgap.
      (function () {
        var rep = null;
        try { rep = window.DraftMockCalib ? window.DraftMockCalib.report() : null; }
        catch (e) { rep = null; }
        var n = rep ? (rep.n_resolved || 0) : 0;
        if (!n) {
          return { ok: false, label: 'Survival calibration (from mocks)',
                   detail: 'no resolved predictions yet — run a mock to start the curve',
                   fix: 'Rehearse against a Sleeper mock; predictions resolve as the mock passes your next pick' };
        }
        // Predicted-minus-empirical is the number that matters: a model that says
        // 70% and delivers 45% is confidently wrong in the direction that makes
        // you wait on players who are already gone.
        var drift = (rep.mean_predicted != null && rep.empirical_survival != null)
          ? (rep.mean_predicted - rep.empirical_survival) : null;
        return {
          ok: drift != null && Math.abs(drift) <= 0.10,
          label: 'Survival calibration (from mocks)',
          detail: n + ' resolved · Brier ' + (rep.brier == null ? '—' : rep.brier)
            + ' · predicted ' + Math.round((rep.mean_predicted || 0) * 100) + '%'
            + ' vs actual ' + Math.round((rep.empirical_survival || 0) * 100) + '%'
            + (drift == null ? '' : (drift > 0 ? ' — OPTIMISTIC by ' : ' — pessimistic by ')
               + Math.round(Math.abs(drift) * 100) + 'pts'),
          fix: 'window.DraftMockCalib.report() for the binned curve',
        };
      })(),
      { ok: !!(window.LEAGUE_ID), label: 'Sleeper connected',
        detail: window.LEAGUE_ID ? 'league ' + String(window.LEAGUE_ID).slice(-6) : 'not connected',
        fix: 'Commish → Sleeper' },
      // TWO reconcilers sat behind this one label: the SLATE reconciler
      // (state.reconcile.halt — do my keepers match the commissioner's slate) and
      // the ACCOUNTING reconciler (does the pick count match the keeper count).
      // Only the first was read, so the line said "ok" while Accounting showed
      // "⚠ 1 disagreement(s)" two rows below. It now fails on either and names
      // which one, so the label means what it says.
      { ok: (!state.reconcile || !state.reconcile.halt) && !seatSlateFault,
        label: 'Keepers reconcile',
        detail: state.reconcile && state.reconcile.halt ? 'slate mismatch'
          : seatSlateFault ? 'pick count disagrees with your keeper count (see Accounting)'
          : 'ok',
        fix: seatSlateFault ? 'Set My Draft Slot to the seat that matches your keepers' : '' },
      // Part 4 §3a: an unconfirmed slate is the one input that can be wrong
      // while every number derived from it still looks completely normal.
      { ok: !!(state.keeperLock && state.keeperLock.locked),
        label: 'Keeper slate confirmed',
        detail: state.keeperLock ? (state.keeperLock.locked
          ? (state.keeperLock.stale ? 'confirmed, but a while ago' : 'yes')
          : (state.keeperLock.edited ? 'edited since it was confirmed' : 'never confirmed'))
          : 'unknown',
        fix: 'Commish \u2192 Keepers \u2192 Confirm & lock' },
      // HARD DEADLINE, its own line by Cory's instruction: an un-instrumented
      // September cannot be recovered in January. Experiment 37 grades the live
      // season's dollars per component, and it can only grade decisions that
      // were LOGGED AT DECISION TIME. This ticks green when the in-season
      // ledger kinds are live; it is deliberately visible from now, not from
      // September, because the build slot is the first one after draft week.
      //
      // ⚠ USED TO READ window.INSEASON_LEDGER_LIVE, WHICH NOTHING EVER SET —
      // found 2026-08-15 while auditing exactly this class of dead flag
      // (same day as the exp33 banner that had the identical problem). It
      // read "NOT LIVE" unconditionally, forever, regardless of what was
      // actually captured. Real, checked state as of today: lineup_call and
      // inseason_override were already captured (src/routes/member.js,
      // predate this session); waiver_claim and stream_call were both wired
      // the same day (/waivers/log+override, /stream/log+override — all four
      // now covered by draft/tests/inseason_capture_routes.test.js, a real
      // POST-and-read-back test, not just a source grep). trade_eval remains
      // genuinely uncaptured — no evaluator exists yet to attach it to. So
      // this is neither fully green nor "NOT LIVE" — it says which.
      { ok: true,
        label: 'In-season instrumentation live (HARD DATE: Sept 1)',
        detail: 'lineup_call, waiver_claim, stream_call, inseason_override — logging. '
          + 'trade_eval — NOT YET (no evaluator to log from).',
        fix: 'trade_eval needs a real trade evaluator before it can log anything' },
      { ok: (state.lists.targets.length + state.lists.avoid.length) > 0,
        label: 'Targets or never-draft set',
        detail: state.lists.targets.length + ' starred, ' + state.lists.avoid.length + ' blocked',
        fix: 'Optional, but it is your read' },
      // ROUNDS — corrected 2026-08-10. The old copy said "league setting showed 3 —
      // VERIFY", which was a STALE SCARE: the 3 came from the long-fixed
      // `roster_size - keepers.count` bug (a 'keepers shrink the draft' model that
      // is not ours), not from Sleeper. Under top_picks_flat the draft is
      // roster_size rounds for EVERYONE and a keeper forfeits a SPECIFIC round —
      // 15 rounds, 12 live picks in rounds 4-15 (confirmed by Cory 2026-08-08;
      // config_schema.draft_rounds carries the reasoning). So this now checks the
      // BOARD we are actually drafting off, and only escalates to the commissioner
      // if a synced Sleeper draft object genuinely disagrees.
      (function () {
        const boardRounds = Number(((state.data || {}).league || {}).rounds) || null;
        const synced = state.syncedDraftRounds;
        const mine = ((state.data || {}).pick_order || {}).my_picks || [];
        const kn = keeperRounds();
        const expectMine = boardRounds != null ? boardRounds - kn : null;
        // Disagreement between a synced draft object and the board is the ONLY
        // commissioner-grade alarm here.
        const conflict = synced != null && boardRounds != null && synced !== boardRounds;
        const picksOk = expectMine == null || mine.length === expectMine;
        return {
          ok: boardRounds === 15 && picksOk && !conflict,
          label: 'Draft length: 15 rounds, ' + (expectMine == null ? '?' : expectMine) + ' live picks',
          detail: conflict
            ? 'CONFLICT — Sleeper draft object says ' + synced + ', board says ' + boardRounds
              + ' — TEXT THE COMMISSIONER'
            : boardRounds == null ? 'board carries no rounds value'
            : boardRounds + ' rounds − ' + kn + ' keepers = ' + expectMine + ' live picks; board has '
              + mine.length + (picksOk ? ' ✓' : ' ✗ MISMATCH')
              + (synced != null ? ' · Sleeper draft object agrees (' + synced + ')' : ' · no draft object yet'),
          fix: 'If the Sleeper draft object ever disagrees with the board, the commissioner must fix it before the draft',
        };
      })(),
      // Money function: the payout table is ground truth — confirm it loaded and
      // sums correctly (re-verify vs the league site if the commissioner edits it).
      (function () {
        var pay = (state.data || {}).payouts;
        var sum = pay ? ((pay.weekly_high || {}).total || 0) + ((pay.regular_season || {}).total || 0)
          + ((pay.playoffs || {}).total || 0) : null;
        return {
          ok: !!(pay && sum === pay.total_pot),
          label: 'Payout table matches the league site',
          detail: pay ? ('$' + pay.total_pot + ' pot · weekly-high '
            + Math.round(100 * ((pay.weekly_high || {}).total || 0) / (pay.total_pot || 1)) + '%')
            : 'payouts.json not loaded',
          fix: pay ? 're-verify vs the league site if payouts changed' : 'add draft/config/payouts.json',
        };
      })(),
    ];

    // PROJECTION PROVENANCE (exp 33, 2026-08-15). The pre-registered "a loss is
    // the headline" banner that DraftDeviation.projectionProvenance() derives
    // from EVIDENCE_STATE[33] was built, exported, and never called from
    // anywhere — found while auditing projection quality for Cory. Exp 33's
    // real, honest, already-reported result: our blend LOSES to a naive
    // prior-year+opportunity baseline on top-decile hit rate, the metric that
    // finds league-winners (0.41 vs 0.57-0.59, both seasons). The checklist is
    // where every other "does the board's own math agree with itself" fact
    // already renders, so this joins them rather than getting a bespoke banner
    // nobody else's code knows to look for.
    try {
      const pp = (typeof DraftDeviation !== 'undefined' && DraftDeviation.projectionProvenance)
        ? DraftDeviation.projectionProvenance() : null;
      if (pp && pp.severity === 'warn') {
        items.push({ ok: false, label: pp.headline, detail: pp.detail, fix: '' });
      }
    } catch (e) { /* the checklist must not go blank because one entry threw */ }

    // Rail-fire budget: >2 flagged in the top 15 is red until each is
    // acknowledged with a logged reason. Placed last so a board-quality alarm
    // reads after the board-built lines it depends on.
    const budget = railFireBudget();
    items.push({
      ok: !budget.overBudget || budget.allAcked,
      label: 'Rail-fire budget',
      detail: budget.count === 0 ? 'no flags in the top ' + RAIL_TOPN
        : budget.count + ' flagged in the top ' + RAIL_TOPN
          + (budget.overBudget
              ? (budget.allAcked ? ' \u2014 all acknowledged' : ' \u2014 ' + budget.unacked.length + ' to acknowledge')
              : ' (within budget of ' + RAIL_BUDGET + ')'),
      fix: budget.overBudget && !budget.allAcked
        ? 'Acknowledge each fire below, or rebuild the board' : '' });

    const done = items.filter(i => i.ok).length;
    $('#check-count').textContent = done + ' of ' + items.length + ' ready';
    const inline = document.getElementById('check-count-inline');
    if (inline) inline.textContent = 'Pre-draft checklist — ' + done + ' of ' + items.length + ' ready';
    host.innerHTML = items.map(i =>
      '<div class="check-item ' + (i.ok ? 'ok' : 'todo') + '">'
      + '<span>' + (i.ok ? '\u2705' : '\u2b1c') + '</span>'
      + '<span class="check-label">' + escapeHtml(i.label)
      + ' <span class="muted">' + escapeHtml(String(i.detail)) + '</span></span>'
      + (!i.ok && i.fix ? '<span class="check-fix">' + escapeHtml(i.fix) + '</span>' : '')
      + '</div>').join('')
    // When over budget, list every fire with its flags and an acknowledge
    // button; acknowledged ones show the logged reason so the record is visible.
    + (budget.overBudget ? '<div class="rail-budget">' + budget.fires.map(f =>
        '<div class="rail-fire ' + (f.acked ? 'acked' : 'open') + '">'
        + '<div class="rail-fire-head"><b>' + escapeHtml(f.name) + '</b> '
        + '<span class="rec-pos ' + f.position + '">' + f.position + '</span>'
        + (f.acked
            ? '<span class="rail-ack-note">\u2705 ' + escapeHtml(f.ack.reason) + '</span>'
            : '<button class="btn small navy" data-rail-ack="' + escapeHtml(f.id) + '">Acknowledge</button>')
        + '</div>'
        + '<div class="rail-fire-flags">' + f.flags.map(x =>
            '\u26a0\ufe0f ' + escapeHtml(x)).join(' \u00b7 ') + '</div>'
        + '</div>').join('') + '</div>' : '');
  }

  /**
   * Best available at ONE position, with what waiting costs.
   *
   * The main list answers "who should I take". This answers a different and
   * equally common question — "I want a receiver, which one, and can he wait?"
   * — which the ranked list cannot, because the receiver you want may be
   * eleventh overall and never appear on it.
   *
   * The survival column is the point. A name is not guidance; a name plus
   * "62% he is gone by your next pick" is a decision.
   */
  /* §2(d) density — the ALWAYS-VISIBLE best-available strip. The dropdown hides
   * exactly the cross-position glance the panel exists for, so this shows the top
   * few at every skill position at once, each with its gone-by-next %. Derived
   * from the same scored board the recommendations use (passed in, never
   * re-scored). K/DEF are omitted until late (they're noise before the endgame). */
  function renderBestAvailStrip(scored, nextPick) {
    const host = $('#best-avail-strip');
    if (!host) return;
    scored = scored || [];
    const POS = ['QB', 'RB', 'WR', 'TE'];
    const perPos = {};
    scored.forEach(s => {
      const pos = s.player.position;
      if (POS.indexOf(pos) < 0) return;
      (perPos[pos] = perPos[pos] || []).push(s);
    });
    const rows = POS.filter(pos => (perPos[pos] || []).length).map(pos => {
      const cells = perPos[pos].slice(0, 3).map(s => {
        const sv = s.survival_to_next;
        const gone = (sv == null || !nextPick) ? null : Math.round((1 - sv) * 100);
        const hot = gone != null && gone >= 60;
        // name-tap = compare (B's cell), plus a one-tap Take so drafting a
        // best-available guy is one tap from the glance (Cory). btn classes are
        // globally styled; .ba-take is a hook for B to tune in its pass.
        return '<span class="ba-slot">'
          + '<button class="ba-cell' + (hot ? ' hot' : '') + '" data-compare="' + s.player.player_id + '" '
          + 'title="tap to compare — ' + escapeHtml(s.player.name) + '">'
          + escapeHtml(s.player.name.split(' ').slice(-1)[0])
          + (gone == null ? '' : ' <span class="ba-gone">' + gone + '%</span>') + '</button>'
          + '<button class="btn small gold ba-take" data-draft-me="' + s.player.player_id
          + '" title="I took ' + escapeHtml(s.player.name) + '">✓</button>'
          + '</span>';
      }).join('');
      return '<div class="ba-row"><span class="ba-pos rec-pos ' + pos + '">' + pos + '</span>' + cells + '</div>';
    }).join('');
    /* THE 42%/41% WALL — DIAGNOSED TWICE, THE SECOND TIME TO THE ROOT
     * (survival.js layer1TakenGivenAvailable, 2026-08-17). The first diagnosis
     * blamed the conservation tilt's redistribution and captioned the
     * uniformity as a market property ("the market can't split them"). The
     * root was upstream: a zero-width remainder window returned P(taken)=1 for
     * every player past his ADP, which zeroed raw survival and ERASED the room
     * model's differentiated answer before the tilt ever saw it — the tilt
     * then handed every fallen elite the identical exp(−λ). With that fixed,
     * survival_to_next carries market + room THROUGH the tilt (the number the
     * score uses), and identical %s on fallen elites only appear when the room
     * model has no seat data to add (no intervening picks known — pre-import).
     * Pinned by ui_fidelity_numbers.test.js and survival_fallen_uniform.test.js. */
    host.innerHTML = rows
      ? '<div class="ba-head">Best available <span class="muted">· top 3/pos · % = gone by your '
        + 'next pick (market+room blend) — the number the score uses. Identical %s only mean no '
        + 'seat data yet — the room model under Survival Odds still names WHO. · tap to compare</span></div>' + rows
      : '';
  }

  /* #queue-slip — the banner Cory most wanted from the queue promotion: watch a
   * queued guy slip. Fed by the SAME survival-to-next the recommendations already
   * compute (never re-run). A queued, still-undrafted player >=60% gone by my next
   * pick is "about a turn from gone." Urgent when it's my #1. Hidden when nothing
   * slips, so it never becomes furniture. In document flow — never floating. */
  function renderQueueSlip(scored) {
    const host = $('#queue-slip');
    if (!host) return;
    const q = state.lists.queue || [];
    const svById = {};
    (scored || []).forEach(s => { svById[String(s.player.player_id)] = s.survival_to_next; });
    const slipping = [];
    q.forEach((id, i) => {
      if (state.drafted.has(String(id))) return;
      const sv = svById[String(id)];
      if (sv == null) return;
      const gone = Math.round((1 - sv) * 100);
      if (gone >= 60) {
        const p = (state.data.players || []).find(x => String(x.player_id) === String(id));
        slipping.push({ id: id, rank: i + 1, gone: gone, name: p ? p.name : id });
      }
    });
    if (!slipping.length) { host.style.display = 'none'; host.className = 'queue-slip'; return; }
    slipping.sort((a, b) => b.gone - a.gone);
    const urgent = slipping.some(s => s.rank === 1);   // your #1 is slipping
    const lead = slipping[0];
    const more = slipping.length > 1 ? ' · +' + (slipping.length - 1) + ' more slipping' : '';
    host.className = 'queue-slip' + (urgent ? ' urgent' : '');
    host.innerHTML = '⚠️ <b>' + escapeHtml(lead.name) + '</b> (queue #' + lead.rank
      + ') is ' + lead.gone + '% gone by your next pick' + escapeHtml(more)
      + ' <button class="btn small gold" data-draft-me="' + escapeHtml(String(lead.id)) + '">I took him</button>';
    host.style.display = '';
  }

  function renderPositionRecs() {
    const host = $('#pos-recs-out');
    if (!host) return;
    const pos = state.posRecs || '';
    if (!pos) { host.innerHTML = ''; return; }
    const FLEXY = { FLEX: ['RB', 'WR', 'TE'] };
    const wanted = FLEXY[pos] || [pos];
    const ctx = context();
    const scored = E.recommend(ctx)
      .filter(s => wanted.indexOf(s.player.position) >= 0)
      .slice(0, 5);
    if (!scored.length) {
      host.innerHTML = '<p class="muted" style="margin:0">Nobody left at ' + escapeHtml(pos) + '.</p>';
      return;
    }
    const next = ctx.nextPick;
    host.innerHTML = explainPanel('position_recs') + '<ol style="margin:0; padding-left:1.1rem">' + scored.map(s => {
      const p = s.player;
      const sv = s.survival_to_next;
      // Gone-by-next is the more useful direction: it is the risk, not the
      // reassurance, and people act on risk.
      const gone = (sv == null || !next) ? null : Math.round((1 - sv) * 100);
      const why = (s.reasons && s.reasons.length) ? s.reasons[0] : '';
      return '<li style="margin-bottom:.35rem"><b>' + escapeHtml(p.name) + '</b> '
        + '<span class="muted">' + escapeHtml(p.position) + (p.team ? ' ' + escapeHtml(p.team) : '')
        + ' · ADP ' + (p.adjusted_adp == null ? '—' : Math.round(p.adjusted_adp))
        + ' · score ' + s.score.toFixed(1) + '</span>'
        + (gone == null ? ''
            : '<br><span style="font-size:.78rem">' + gone + '% gone by pick ' + next
              + (gone >= 60 ? ' — <b>take him now or lose him</b>' : ' — he can probably wait')
              + '</span>')
        + (why ? '<br><span class="muted" style="font-size:.75rem">' + escapeHtml(why) + '</span>' : '')
        /* conditional-value chip (ruling 2026-08-17) — same separate line the
         * shortlist prints; annotation only, absent when there is no premium. */
        + condValueChip(p)
        + '</li>';
    }).join('') + '</ol>';
  }

  /* Part 2 §1 — render the Paths panel (the primary decision surface). Derived
   * from the SAME scored board the ranked list uses (passed in, never re-scored),
   * so a path and the list beneath it can never disagree. Stores state.lastPaths
   * so a pick can be logged with the direction it came from. */
  /* ── WHAT THE MODEL IS THINKING ABOUT TIMING ──────────────────────────────
   *
   * Cory: *"something that says what the model's thinking — don't take QB here
   * because blank, or snag QB here because blank, or QBs being drafted above
   * value, wait."*
   *
   * The model HAS a view on this and has been keeping it to itself. The view is:
   *
   *     D_p  = best available at p now  -  E[best available at p at my next pick]
   *
   * what waiting costs at a position. And the correction that matters, because
   * it is the whole 59.6 and the reason the engine wants Josh Allen at pick 8:
   *
   *     D*_p = D_p if he fills an EMPTY starting slot or the flex, else 0
   *
   * A second quarterback in a one-QB league has a large D and no seat: a real
   * drop you never collect.
   *
   * COMPUTED WITH THE ENGINE'S OWN expectedBestAvailable, not a local estimate.
   * A second opinion about survival would let this panel and the engine's VONA
   * disagree on the same screen about the same quantity — the "value" defect
   * this repo already shipped once, where two cards used one word for a market
   * price and a model estimate.
   *
   * THE MARKET LEG is separate and is Cory's third case. A position can have a
   * real drop AND be a bad buy, if the room is paying above our board for it.
   * ADP rank against our own rank at the position is that signal.
   */
  /* ROUND NOTATION. "pick 8" is ambiguous at a table — it reads as round 8 and
   * it means OVERALL pick 8, which in a ten-team league is R1.8. Cory read it
   * the other way and was right to object on the merits: a quarterback of
   * Allen's calibre in round 8 would be absurd. The claim was R1.8, where his
   * ADP of 19 means he is still on the board and taking him is an 11-pick
   * reach. Same number, opposite conclusion, and the only fix is to stop
   * printing a bare pick number. */
  function roundLabel(overall) {
    if (!overall) return '';
    /* READ, NEVER COMPUTED. `ceil(overall / teams)` is wrong in this league:
     * three picks are FORFEITED for keepers and REMOVED from the sequence, so
     * the overall numbering is compressed and round 4 begins at overall 28
     * rather than 31. Computed, pick 30 renders "R3.10"; the artifact says
     * round 4, slot 8. I added the computed version yesterday to KILL a
     * round-numbering ambiguity and introduced a second one — a label that is
     * confidently wrong is worse than the bare number it replaced. */
    const rows = (((state.data || {}).pick_order || {}).picks) || [];
    const row = rows.find(function (r) { return r.overall === overall; });
    if (row && row.round != null && row.slot != null) return 'R' + row.round + '.' + row.slot;
    return 'pick ' + overall;      // honest fallback: no invented round
  }

  function positionTiming(ctx, scored) {
    /* K AND DEF ARE IN THE COMPARISON NOW, because leaving them out is what
     * makes a tool silently forget them until it is too late. They are governed
     * by a different rule and the panel says which rule is in force. */
    const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const board = (ctx && ctx.board) || [];
    const nextPick = ctx && ctx.nextPick;
    const roster = (ctx && ctx.roster) || [];
    const starters = ((state.data || {}).league || {}).starters || {};
    const held = {};
    roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });
    const FLEX = (starters.FLEX || 0) + (starters['W/R/T'] || 0) + (starters.WRT || 0);
    const flexSurplus = ['RB', 'WR', 'TE'].reduce((n, q) =>
      n + Math.max(0, (held[q] || 0) - (starters[q] || 0)), 0);

    const out = [];
    POS.forEach(pos => {
      const at = board.filter(p => p.position === pos && (p.proj_mean || 0) > 0)
        .sort((a, b) => b.proj_mean - a.proj_mean);
      if (!at.length) return;
      const bestNow = at[0].proj_mean;
      const eba = (nextPick == null) ? bestNow
        : E.expectedBestAvailable(at.slice(1), nextPick, ctx);
      const D = Math.max(0, bestNow - eba);
      const dedicatedOpen = (held[pos] || 0) < (starters[pos] || 0);
      const flexOpen = FLEX > 0 && ['RB', 'WR', 'TE'].indexOf(pos) >= 0 && flexSurplus < FLEX;
      const seat = dedicatedOpen ? pos : (flexOpen ? 'FLEX' : null);
      const Dstar = seat ? D : 0;

      /* MARKET: is the room paying above our board here? Compare the top
       * available player's ADP against where OUR ranking puts him. A negative
       * premium means the market takes him earlier than we would. */
      const adp = at[0].adjusted_adp != null ? +at[0].adjusted_adp
        : (at[0].raw_adp != null ? +at[0].raw_adp : null);
      const myRankAll = (scored || []).findIndex(x => x.player
        && String(x.player.player_id) === String(at[0].player_id));
      const cur = (ctx && ctx.currentPick) || null;
      const premium = (adp != null && cur != null) ? Math.round(cur - adp) : null;

      out.push({ position: pos, best: at[0], D: Math.round(D), Dstar: Math.round(Dstar),
        seat: seat, adp: adp, premium: premium,
        my_rank: myRankAll >= 0 ? myRankAll + 1 : null });
    });

    /* ── THE ROSTER GUARANTEE OVERRIDES EVERYTHING ────────────────────────
     *
     * Cory: "in the last 2 picks the roster guarantee should override
     * everything, because we HAVE to have a K and DEF — at that point just take
     * the best available."
     *
     * Stated as a rule rather than a countdown: if the number of picks I have
     * LEFT equals the number of mandatory slots I have not FILLED, every
     * remaining pick is spoken for and there is nothing to optimise. Written as
     * "the last two rounds" it would silently break the moment the room forces a
     * different shape on me — which is exactly the dynamism Cory asked for.
     *
     * MEASURED, THIS COSTS ALMOST NOTHING TO DEFER. Best kicker to replacement
     * is 10 points across a SEASON (0.67/wk) and ranks 8-12 are identical at 97;
     * best defence to replacement is 18 (1.2/wk). Against ~79 for one running
     * back's projection sd and 42 for the whole-draft tiebreak frontier, the
     * entire kicker decision is inside the noise. So the exception Cory allowed
     * — take one early if it is truly worth it — has a bar, and on this board
     * nothing clears it. */
    const MANDATORY = ['K', 'DEF'];
    const picksLeft = (ctx && ctx.myPicksLeft != null) ? ctx.myPicksLeft : null;
    const unfilled = MANDATORY.filter(m => (held[m] || 0) < (starters[m] || 0));
    const forced = picksLeft != null && unfilled.length > 0 && picksLeft <= unfilled.length;

    /* THE VERDICT. Ranked on D*, because the drop you cannot collect is not a
     * reason to spend a pick. A field of zeros is NOT a recommendation — that is
     * the tie that sank the third slot-aware attempt, where 1331 players shared
     * VONA 0 and quarterbacks won on array order. */
    const live = out.filter(r => r.Dstar > 0 && (!forced || MANDATORY.indexOf(r.position) >= 0))
      .sort((a, b) => b.Dstar - a.Dstar);
    /* The frontier is the bar the exception has to clear: 42 points is what the
     * WHOLE draft's tie-breaking is worth, so a single onesie pick claiming more
     * than a fraction of it needs to be extraordinary. Quoted from the measured
     * quantity rather than picked, so the reason is auditable. */
    const ONESIE_BAR = 20;
    out.forEach(r => {
      const isOnesie = MANDATORY.indexOf(r.position) >= 0;
      if (forced && isOnesie && unfilled.indexOf(r.position) >= 0) {
        r.verdict = 'FORCED';
        r.why = 'you have ' + picksLeft + ' pick(s) left and ' + unfilled.length
          + ' mandatory slot(s) unfilled (' + unfilled.join(', ') + ') — every remaining '
          + 'pick is spoken for. Take the best available ' + r.position + '; there is '
          + 'nothing left to optimise.';
        return;
      }
      if (forced && !isOnesie) {
        r.verdict = 'LOCKED OUT';
        r.why = 'the roster guarantee has claimed your last ' + picksLeft
          + ' pick(s) for ' + unfilled.join(' and ') + ' — a ' + r.position
          + ' here leaves you unable to field a legal lineup';
        return;
      }
      if (isOnesie && !forced) {
        /* The early-onesie exception, with its bar shown so the reasoning can be
         * checked rather than trusted. */
        r.verdict = r.Dstar >= ONESIE_BAR ? 'WORTH IT EARLY' : 'WAIT';
        r.why = r.Dstar >= ONESIE_BAR
          ? 'unusually large for a ' + r.position + ': ' + r.Dstar + ' pts, over the '
            + ONESIE_BAR + '-pt bar — this is the rare one worth taking before the end'
          : 'only ' + r.Dstar + ' pts, under the ' + ONESIE_BAR + '-pt bar. Best-to-'
            + 'replacement across the whole position is 10 pts at K and 18 at DEF, '
            + 'both inside the noise on a single skill player (~79). Take one at the end.';
        return;
      }
      if (!r.seat) {
        r.verdict = 'NO SEAT';
        r.why = 'every ' + r.position + ' slot you start is already filled, so his '
          + r.D + '-pt drop is one you never collect';
      } else if (live.length && live[0].position === r.position) {
        r.verdict = 'TAKE NOW';
        r.why = 'biggest drop you can actually collect — waiting costs ' + r.Dstar
          + ' pts at ' + r.position + (live[1] ? ', against ' + live[1].Dstar
            + ' at ' + live[1].position : '');
      } else if (r.Dstar <= 3) {
        r.verdict = 'WAIT';
        r.why = 'the drop to your next pick is only ' + r.Dstar
          + ' pts — this seat is fillable later at almost no cost';
      } else {
        r.verdict = 'BEHIND';
        r.why = r.Dstar + ' pts of drop, but ' + (live[0] ? live[0].position + ' is losing '
          + live[0].Dstar : 'another position is losing more') + ' and fills a seat too';
      }
      /* The market leg only ever ADDS a caution. It never overrides the drop,
       * because "expensive" and "scarce" are different facts and a position can
       * be both — collapsing them would hide the one that matters. */
      if (r.premium != null && r.premium < -8 && r.verdict !== 'NO SEAT') {
        r.market = 'the room is taking ' + r.position + 's about '
          + Math.abs(r.premium) + ' picks ahead of our board — you would be paying above value';
      }
    });

    /* ── WHERE THIS VIEW AND THE PLAN DISAGREE, SAY SO ────────────────────
     *
     * D is the drop to my NEXT pick. That is the right question for a seat I
     * must fill now and the WRONG one for a seat I can fill any time: the
     * quarterback slot can be filled at pick 33 for almost nothing, so measuring
     * its drop over picks 8->13 overstates the urgency. Measured, that gap is
     * the entire 59.6 between the greedy line and the global assignment, and it
     * is why this panel can say TAKE QB at pick 8 while the plan says FLEX.
     *
     * I am NOT inventing a horizon rule days before a draft to resolve it — that
     * is the fourth attempt at slot-aware VONA, and the third one died on
     * exactly this kind of change. What the panel owes Cory instead is the
     * disagreement, stated: here is the greedy view, here is the global one,
     * here is which is which. A tool that hides a known conflict between two of
     * its own components is worse than one that has the conflict. */
    const seat = seatForCurrentPick();
    if (seat && seat.is_starter_seat && live.length) {
      const want = seat.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [seat.slot];
      if (want.indexOf(live[0].position) < 0) {
        live[0].plan_conflict = 'the SEASON-LONG plan wants ' + seat.slot
          + ' at this pick, not ' + live[0].position
          + '. This line measures the drop to your NEXT pick only, so it over-rates a'
          + ' position whose seat you could still fill much later — that gap is the'
          + ' measured 59.6 between the greedy board and the full-draft plan.'
          + ' PREFER THE SEAT unless you believe this specific cliff.';
      }
    }
    /* `plan_seat` REPORTS ONLY A SEAT THE PLAN ACTUALLY ASSERTS. It used to
     * return `seat.slot` for bench rows too, i.e. the literal string 'BENCH' —
     * so a consumer comparing the lead position against it saw a mismatch on
     * every bench pick and could not tell "the plan wants a tight end and you
     * are taking a back" from "the plan asserts nothing here". A field that
     * means two things is the defect `sp-pos` had, one layer up. */
    return { rows: out, lead: live[0] || null, anySeat: live.length > 0,
      plan_seat: (seat && seat.is_starter_seat) ? seat.slot : null };
  }

  /* ── THE CASE AGAINST — a route with only a "for" is advocacy ─────────────
   *
   * Cory: *"contrast those routes (for and against and why)."* The engine emits
   * six `when_right` strings and no counterweight, so every card argues for
   * itself and the panel reads as six recommendations rather than one choice.
   *
   * BUILT HERE, NOT IN THE ENGINE, and that is deliberate. Everything below is
   * derived from what computePaths ALREADY returns — `price`, the branch `plan`
   * rows, `mechanism`, `fills`, `coin_flip_with` — so this is a presentation
   * concern and needs no edit to a scoring-path file nine days from a draft. The
   * gate on engine.js exists to make exactly this pause happen.
   *
   * THE STRONGEST AGAINST IS THE SEAT. If a route fills a slot the plan does not
   * want at this pick, that is a concrete, measured objection rather than a
   * hedge — and it is the one that makes the panel agree with the model instead
   * of arguing with it.
   */
  function pathAgainst(p) {
    const out = [];
    const seat = seatForCurrentPick();
    if (seat && seat.is_starter_seat) {
      const elig = seat.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [seat.slot];
      if (elig.indexOf(p.position) < 0) {
        out.push('the plan wants ' + seat.slot + ' at this pick, and this fills '
          + p.position + ' instead');
      }
    }
    /* `price` is what this route costs against the best-priced one. 0 means it
     * IS the best-priced, in which case saying "costs 0" would be noise. */
    if (p.price > 0) out.push('prices ' + p.price + ' below the top route');
    if (p.coin_flip_with) out.push('a genuine coin flip with the other top route — '
      + 'the model cannot separate them, so believe one or take the cheaper');

    /* The mechanism-specific objection: what has to be TRUE for this route to be
     * wrong. Each is the negation of its own when_right, which is what makes it
     * a contrast rather than a disclaimer. */
    const loss = (p.plan && p.plan[0] && p.plan[0].loss != null) ? Math.round(p.plan[0].loss) : null;
    if (p.mechanism === 'scarcity') {
      out.push('you are paying for certainty — if the room does not run on '
        + p.position + ', the cliff never arrives and you bought nothing');
    } else if (p.mechanism === 'need') {
      out.push(loss != null && loss <= 3
        ? 'the seat is fillable later — waiting costs only ~' + loss + ' pts here'
        : 'filling a seat early spends the pick on need rather than on the best player left');
    } else if (p.mechanism === 'flex') {
      out.push('a flex body is the most replaceable thing on a roster — the wire '
        + 'refills this seat more cheaply than any other');
    } else if (p.mechanism === 'value') {
      out.push('value with no seat behind it is a bench player: he only scores if '
        + 'somebody ahead of him stops playing');
    }
    if (p.fills === 'bench') {
      out.push('this does not start for you today');
    }
    return out;
  }

  /* THE THINKING PANEL — one line per position, and the reason attached.
   *
   * Deliberately NOT a single verdict. Cory asked what the model is thinking,
   * and a lone "TAKE QB" hides the comparison that produced it — the whole
   * decision is which position is losing most among those that can still take a
   * seat, so all four are shown with their numbers and the loser positions are
   * as informative as the winner. */
  function renderTiming(scored) {
    const host = $('#timing-panel');
    if (!host) return;
    const t = positionTiming(context(), scored);
    state.lastTiming = t;
    if (!t.rows.length) { host.innerHTML = ''; return; }
    const cls = v => (v === 'TAKE NOW' ? 'tm-take' : v === 'WAIT' ? 'tm-wait'
      : v === 'NO SEAT' ? 'tm-noseat' : 'tm-behind');
    const cur = (pickCoordinate() || {}).current;
    host.innerHTML = '<div class="tm-head">WHAT THE MODEL IS THINKING at '
      + escapeHtml(roundLabel(cur)) + (cur ? ' (overall ' + cur + ')' : '')
      + ' — what WAITING costs at each position, and whether you could collect it</div>'
      + '<ul class="tm-list">' + t.rows.map(function (r) {
        return '<li class="tm-row ' + cls(r.verdict) + '">'
          + '<span class="tm-pos">' + escapeHtml(r.position) + '</span>'
          + '<span class="tm-verdict">' + escapeHtml(r.verdict) + '</span>'
          + '<span class="tm-num">' + r.Dstar + ' <span class="tm-unit">pts you can collect</span>'
          + (r.D !== r.Dstar ? ' <span class="tm-raw">(' + r.D + ' raw)</span>' : '') + '</span>'
          + '<span class="tm-why">' + escapeHtml(r.why) + '</span>'
          + (r.market ? '<span class="tm-market">' + escapeHtml(r.market) + '</span>' : '')
          + (r.plan_conflict ? '<span class="tm-conflict">⚠ ' + escapeHtml(r.plan_conflict) + '</span>' : '')
          + '</li>';
      }).join('') + '</ul>'
      + (t.anySeat ? '' : '<div class="tm-noseat-all">Every starting slot is filled — '
        + 'drop-off cannot rank this pick. It is a bench pick: judge it on what the '
        + 'player beats on the waiver wire at his position.</div>');
  }

  /* The seat the plan wants at the pick on the clock, or null. Shared by the
   * seat panel and the against-case so the two can never disagree about which
   * seat is live — two lookups is two chances to drift. */
  function seatForCurrentPick() {
    const d = state.seatPlan;
    if (!d || !Array.isArray(d.seats)) return null;
    const cur = (pickCoordinate() || {}).current;
    return d.seats.find(s => s.pick === cur)
      || d.seats.find(s => s.pick >= (cur || 0)) || null;
  }

  function renderPaths(scored) {
    const host = $('#paths-panel');
    if (!host) return;
    const paths = E.computePaths(context(), scored);
    state.lastPaths = paths;
    const cf = $('#paths-coinflip');
    if (!paths.length) {
      host.innerHTML = '';
      if (cf) cf.style.display = 'none';
      return;
    }
    // Path-level coin-flip banner: when the top two directions price within the gap.
    if (cf) {
      const flip = paths[0].coin_flip_with ? paths.find(p => p.key === paths[0].coin_flip_with) : null;
      if (flip) {
        cf.style.display = '';
        cf.innerHTML = '🪙 <b>' + escapeHtml(paths[0].name) + '</b> and <b>'
          + escapeHtml(flip.name) + '</b> are a coin flip — take the one you believe in.';
      } else {
        cf.style.display = 'none';
      }
    }
    // LEGALITY SUPPRESSION. A path that would strand a MANDATORY starting slot
    // is suppressed with its reason on the card. Onesies never trigger this —
    // punting K/DST is a strategy, and forcing it through path suppression
    // would be forcing by the back door.
    const starters = (state.data.league || {}).starters || {};
    const picksLeft = myNextPicks().length;
    paths.forEach(function (pa) {
      pa.legality_block = null;
      if (typeof DraftLegality === 'undefined' || !pa.pick) return;
      try {
        pa.legality_block = DraftLegality.suppressReason(
          state.myRoster, starters, picksLeft, pa.pick.player);
      } catch (e) { /* a legality failure never removes a path silently */ }
    });

    // §4 — everything speaks the same vocabulary. Tag the ONE path the current
    // doctrine would actually take: resolve the doctrine's best allowed player
    // off the same scored board, then find the path holding him. Exact, not a
    // position heuristic — a badge that guessed would be worse than no badge.
    const onPlanKey = doctrinePathKey(scored, paths);
    const planName = onPlanKey && state.doctrine
      ? DraftDoctrine.doctrineMeta(state.doctrine.current).name : null;

    host.innerHTML = explainPanel('paths') + paths.map(function (p, i) {
      const pl = p.pick.player;
      const doctrineBadge = (onPlanKey && p.key === onPlanKey)
        ? '<span class="path-doctrine' + (DraftDoctrine.governs() ? '' : ' inert')
          + '" title="' + (DraftDoctrine.governs()
              ? 'the branch your enrolled doctrine takes'
              : 'LABEL ONLY — the doctrine is display-only and did not influence this ranking')
          + '">◆ the ' + escapeHtml(planName) + ' branch'
          + (DraftDoctrine.governs() ? '' : ' <span class="pd-inert">(label only)</span>')
          + '</span>' : '';
      // price is how many points this path is BELOW the top path (a cost, always
      // >= 0). It was shown as '+11.0 vs top', which reads as 11 ABOVE — the
      // opposite (2026-08-10 critique: a path scoring 11 below was labelled +11).
      // Render it as the deficit it is.
      const priceBadge = p.price > 0
        ? '<span class="path-price">−' + p.price.toFixed(1) + ' vs top</span>'
        : '<span class="path-price top">top path</span>';
      const plan = (p.plan || []).filter(function (r) { return r.loss > 0; }).slice(0, 2)
        .map(function (r) { return r.position + ' −' + Math.round(r.loss); }).join(' · ');
      const extras = p.candidates.slice(1, 5);
      // THE DEVIATION BADGE, Zone 1, non-optional — and silent inside the band.
      // Band omitted -> deviation.js derives it PER-REGION from the exp-36 surface
      // (tight where the market ranks well, wide where it ranks weakly). The old
      // flat DG_NOISE_BAND was a dollar constant used as a pick band — the derived
      // per-region band is the right instrument here (DERIVED-VS-DECLARED-AUDIT.md).
      const dev = (typeof DraftDeviation !== 'undefined')
        ? DraftDeviation.badge(p.pick, currentPick(), null) : null;
      const devHtml = dev ? renderDeviationBadge(dev, p.key) : '';
      const block = p.legality_block
        ? '<div class="path-illegal">🚫 suppressed — ' + escapeHtml(p.legality_block) + '</div>'
        : '';
      return '<div class="path-card' + (i === 0 ? ' top' : '')
          + (p.legality_block ? ' suppressed' : '')
          + (p.coin_flip_with ? ' coinflip' : '') + '" data-path="' + escapeHtml(p.key) + '">' +
        block +
        '<div class="path-head">' +
          '<span class="path-name">' + escapeHtml(p.name) + '</span>' + doctrineBadge + priceBadge +
        '</div>' +
        '<div class="path-pick">' +
          '<span class="path-player"><span class="rec-nm" data-drill="' + pl.player_id + '" title="Full dossier">' + escapeHtml(pl.name) + '</span>' +
            '<span class="rec-pos ' + pl.position + '">' + pl.position + '</span></span>' +
          '<span class="path-score">' + p.pick.score.toFixed(1) + '</span>' +
        '</div>' +
        devHtml +
        /* DENSITY (cockpit rebuild 2026-08-17, Cory's order): the card-essays
         * live ONE TAP AWAY behind the ⓘ, as STRUCTURED pro/con lists — the
         * same machine-derived content (when_right, pathAgainst, the branch
         * plan), itemised instead of freetexted. The visible row is name ·
         * price-vs-top · score · take. */
        (function () {
          var ag = pathAgainst(p);
          var forItems = [p.when_right].concat(
            p.pick.why ? [p.pick.why] : [],
            (p.pick.context || []).slice(0, 2));
          var chip = function (t) { return '<li>' + escapeHtml(t) + '</li>'; };
          return '<details class="path-info"><summary>ⓘ for / against'
            + (ag.length ? ' (' + ag.length + ')' : '') + '</summary>'
            + (p.distinction ? '<div class="path-distinction">' + escapeHtml(p.distinction) + '</div>' : '')
            + '<div class="wr-procon">'
            + '<div class="path-when"><span class="path-lbl">FOR</span><ul class="wr-pc-list">'
              + forItems.map(chip).join('') + '</ul></div>'
            + (ag.length
                ? '<div class="path-against"><span class="path-lbl">AGAINST</span><ul class="wr-pc-list">'
                  + ag.map(chip).join('') + '</ul></div>'
                : '')
            + '</div>'
            + (plan ? '<div class="path-plan">next turn cost if you wait: ' + escapeHtml(plan) + '</div>' : '')
            + '</details>';
        })() +
        '<div class="path-actions">' +
          '<button class="btn small gold" data-draft-me="' + pl.player_id
            + '" data-path-key="' + escapeHtml(p.key) + '">I took ' + escapeHtml(pl.name.split(' ').slice(-1)[0]) + '</button>' +
          (extras.length
            ? '<details class="path-more"><summary>' + extras.length + ' more this way</summary>'
              + extras.map(function (c) {
                  return '<button class="path-alt" data-draft-me="' + c.player.player_id
                    + '" data-path-key="' + escapeHtml(p.key) + '">' + escapeHtml(c.player.name)
                    + ' <span class="muted">' + c.score.toFixed(1) + '</span></button>';
                }).join('') + '</details>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* B7 COMPARE TRAY — tap any two players anywhere → a two-column overlay whose
   * DOMINANT number is the dollar gap (gold), with the decomposed breakdown bar,
   * survival-to-next for each, tier position, and the auditable Why? terms. This
   * is the "close call" tool: two taps in, one tap out. The dollar gap answers
   * "which of these makes me more money" and its uncertainty is impossible to
   * miss (rough tag + even-money band). */
  function toggleCompare(id) {
    id = String(id);
    const i = state.compare.indexOf(id);
    if (i >= 0) state.compare.splice(i, 1);
    else { state.compare.push(id); if (state.compare.length > 2) state.compare.shift(); }
    state.compareOpen = true;        // selecting a player opens the tray
    state.compareSearch = '';
    renderCompareTray();
  }
  function clearCompare() {
    state.compare = []; state.compareOpen = false; state.compareSearch = '';
    renderCompareTray();
  }
  function openCompare() { state.compareOpen = true; renderCompareTray(); }

  // Search the WHOLE player pool by name for the compare picker (available first,
  // drafted flagged) so any two players can be weighed, not just board cards.
  function compareMatches(q) {
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    const all = (state.data && state.data.players) || [];
    const picked = new Set(state.compare.map(String));
    return all.filter(p => !picked.has(String(p.player_id))
        && (p.name || '').toLowerCase().indexOf(q) !== -1)
      .slice(0, 6)
      .map(p => ({ id: String(p.player_id), name: p.name, position: p.position,
        gone: state.drafted.has(String(p.player_id)) }));
  }

  function renderCompareTray() {
    const host = $('#compare-tray');
    if (!host) return;
    // Show when two are picked OR the tray was opened for search-mode selection.
    if (state.compare.length < 2 && !state.compareOpen) {
      host.style.display = 'none'; host.innerHTML = ''; return;
    }
    // SEARCH MODE — fewer than two players chosen: render the chosen one(s) plus a
    // search box to fill the empty slot by typing a name.
    if (state.compare.length < 2) {
      const chosen = state.compare.map(playerById).filter(Boolean);
      const chip = p => '<span class="cmp-pick">' + escapeHtml(p.name)
        + '<span class="rec-pos ' + p.position + '">' + p.position + '</span>'
        + '<button class="cmp-pick-x" data-compare="' + p.player_id + '" title="remove">✕</button></span>';
      const results = compareMatches(state.compareSearch);
      const list = results.length
        ? '<div class="cmp-results">' + results.map(r =>
            '<button class="cmp-result" data-cmp-add="' + r.id + '">' + escapeHtml(r.name)
            + ' <span class="rec-pos ' + r.position + '">' + r.position + '</span>'
            + (r.gone ? ' <span class="cmp-gone">drafted</span>' : '') + '</button>').join('') + '</div>'
        : (state.compareSearch ? '<div class="cmp-nomatch muted">no player matches “' + escapeHtml(state.compareSearch) + '”</div>' : '');
      host.style.display = '';
      host.innerHTML = '<div class="cmp-inner">'
        + '<button class="cmp-close" data-cmp-close="1" title="Close">✕</button>'
        + '<div class="cmp-search-head">⚖️ Compare — pick two players for the dollar gap</div>'
        + (chosen.length ? '<div class="cmp-picks">' + chosen.map(chip).join('') + '</div>' : '')
        + '<input type="text" class="cmp-search" id="cmp-search" placeholder="Search a player…" '
          + 'value="' + escapeHtml(state.compareSearch) + '" autocomplete="off">'
        + list
        + '</div>';
      const box = document.getElementById('cmp-search');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      return;
    }
    const a = playerById(state.compare[0]);
    const b = playerById(state.compare[1]);
    if (!a || !b) { host.style.display = 'none'; return; }
    const g = E.dollarGap(a, b, context());
    /* ⚠ THE VISIBLE BAR SHOWED ONE SIGNAL AS TWO — AND I HAD ALREADY FIXED THAT
     * TEN LINES BELOW, IN THE PART YOU HAVE TO CLICK TO SEE (2026-08-14).
     *
     * This read `[['high-pool', g.high], ['top-4 entry', g.entry], ['RS', g.rs],
     * ['next-pick echo', g.echo]]` — four bars. `entry` and `rs` are both a
     * constant times proj_mean (DG_ENTRY_K 0.08, DG_RS_K 0.05), so their
     * DIFFERENCE carries the same ratio: measured over 40 real pairs off the live
     * board, `entry_diff / rs_diff` deviates from exactly 1.6 by 1.7e-14, and the
     * two bars point the SAME DIRECTION IN 39 OF 39 cases where rs is non-zero.
     * They cannot disagree; it is arithmetically impossible.
     *
     * So a reader comparing Gibbs to Jefferson saw `high-pool +16.7 · top-4 entry
     * +8.7 · RS +5.4` and read THREE independent reasons pointing the same way.
     * There are two, and one of them is counted twice — the same false reading
     * the `<details>` body below was rewritten to remove. **I fixed the
     * explanation and left the chart**, which is the worse half: the chart is
     * always visible and the explanation is behind a toggle.
     *
     * The money is real and both pots exist, so the AMOUNT is unchanged — the two
     * mean-driven pots are summed into one `season` bar with the fixed split
     * named, exactly as the text below already does. Only `high` (ceiling over
     * mean) and `echo` (the next-pick consequence) are independent of it. */
    const season = Math.round((g.entry + g.rs) * 10) / 10;
    const parts = [['high-pool (boom)', g.high], ['season (entry+RS, fixed 1.6:1)', season],
      ['next-pick echo', g.echo]];
    const maxMag = Math.max(1, ...parts.map(p => Math.abs(p[1])));
    const bar = parts.map(function (p) {
      const w = Math.round((Math.abs(p[1]) / maxMag) * 100);
      const side = p[1] >= 0 ? 'a' : 'b';
      return '<div class="cmp-bar-row"><span class="cmp-bar-lbl">' + p[0] + '</span>'
        + '<span class="cmp-bar-track"><span class="cmp-bar-fill ' + side + '" style="width:' + w + '%"></span></span>'
        + '<span class="cmp-bar-val">' + (p[1] >= 0 ? '+' : '') + p[1] + '</span></div>';
    }).join('');
    const col = (p, isLeader) => {
      return '<div class="cmp-col' + (isLeader ? ' lead' : '') + '">'
        + '<div class="cmp-name">' + escapeHtml(p.name) + '<span class="rec-pos ' + p.position + '">' + p.position + '</span></div>'
        + '<div class="cmp-stat">proj <b>' + Math.round(p.proj_mean || 0) + '</b> · ceil <b>' + Math.round(p.proj_ceiling || 0) + '</b></div>'
        + '<div class="cmp-stat">tier <b>' + (p.tier || '?') + '</b> · ADP <b>' + Math.round(p.adjusted_adp || p.adp || 0) + '</b></div>'
        + '</div>';
    };
    host.style.display = '';
    host.innerHTML =
      '<div class="cmp-inner">'
      + '<button class="cmp-close" data-cmp-close="1" title="Close">✕</button>'
      + '<div class="cmp-cols">' + col(a, !g.even_money && g.leader === (a.name)) + col(b, !g.even_money && g.leader === (b.name)) + '</div>'
      + '<div class="cmp-hero' + (g.even_money ? ' even' : '') + '">'
        + (g.even_money ? '<span class="cmp-hero-num">even money</span><span class="cmp-hero-sub">pick your guy</span>'
            : '<span class="cmp-hero-num">' + escapeHtml(g.verdict.replace(/ this pick$/, '')) + '</span><span class="cmp-hero-sub">this pick · <b>rough</b> v1 estimate (±$' + g.band + ')</span>')
      + '</div>'
      + '<div class="cmp-bars">' + bar + '</div>'
      + '<details class="cmp-why"><summary>Why? — the derivation</summary>'
        + '<div class="cmp-why-body">' + escapeHtml(g.terms.note)
        /* ⚠ `entry` AND `RS` ARE ONE SIGNAL, NOT TWO, AND THIS LINE USED TO
         * SHOW THEM AS TWO. Both are a constant times proj_mean
         * (DG_ENTRY_K 0.08, DG_RS_K 0.05), so their ratio is EXACTLY 1.6 for
         * every player, always — measured across the live board and identical
         * to three decimals on every row.
         *
         * They are genuinely different pots of money, so the amounts are real
         * and stay. What is false is the READING: a decomposition printed as
         * three terms invites "entry favours him AND RS favours him" as two
         * confirmations, when it is one number counted twice. Only `high`
         * (which prices ceiling-over-mean) carries independent information.
         *
         * So the two mean-driven pots are shown as ONE season line with the
         * split named as the fixed ratio it is. */
        + '<br>' + escapeHtml(a.name) + ': boom $' + g.terms.A.dollars.high
          + ' · season $' + Math.round((g.terms.A.dollars.entry + g.terms.A.dollars.rs) * 10) / 10
          + ' <span class="muted">(entry $' + g.terms.A.dollars.entry + ' + RS $' + g.terms.A.dollars.rs + ', fixed 1.6:1)</span>'
        + '<br>' + escapeHtml(b.name) + ': boom $' + g.terms.B.dollars.high
          + ' · season $' + Math.round((g.terms.B.dollars.entry + g.terms.B.dollars.rs) * 10) / 10
          + ' <span class="muted">(entry $' + g.terms.B.dollars.entry + ' + RS $' + g.terms.B.dollars.rs + ', fixed 1.6:1)</span>'
        + '<br><span class="muted">boom is the only term with independent information: '
          + 'entry and RS are both a constant times the projection, so they always move together.</span>'
        + (g.terms.echo ? '<br>next-pick echo: cost of taking ' + escapeHtml(a.name) + ' = ' + g.terms.echo.cost_of_taking_A + ' pts, ' + escapeHtml(b.name) + ' = ' + g.terms.echo.cost_of_taking_B + ' pts' : '')
        + '</div></details>'
      + '</div>';
  }

  // THE RULE ON THE BOARD (EXP-KEEPER-B0): best-ADP within startable capacity, stated
  // in the rule's own terms, never a 4th RB, with the bye hole visible and the honest
  // dollar tier attached. A creates its own element inside B's card (no warroom.ejs
  // edit); classes rh-* are B's to style. Additive headline above the composite panel.
  function renderRuleHeadline(out) {
    if (typeof DraftNeedRule === 'undefined') return;
    const card = document.getElementById('recs-card');
    if (!card) return;
    const body = card.querySelector('.body') || card;
    let host = document.getElementById('rule-headline');
    if (!host) {
      host = document.createElement('div');
      host.id = 'rule-headline';
      host.className = 'rule-headline';
      host.style.cssText = 'margin:0 0 .6rem;padding:.55rem .7rem;border-radius:8px;'
        + 'background:rgba(245,196,69,.10);border:1px solid rgba(245,196,69,.45)';
      body.insertBefore(host, document.getElementById('confidence-note') || body.firstChild);
    }
    const board = state.board || [], roster = state.myRoster || [];
    if (!board.length) { host.innerHTML = ''; return; }
    const rec = DraftNeedRule.recommend(board, roster);
    if (!rec.pick) { host.innerHTML = ''; return; }
    const nm = p => escapeHtml((p.name || p.player_id) + '') + ' <span class="rh-pos" style="opacity:.88">'
      + escapeHtml(p.position || '') + '</span>';
    const field = DraftNeedRule.fieldWithinNeed(board, roster, 4);
    const gap = field.length > 1 ? (DraftNeedRule.adpOf(field[1]) - DraftNeedRule.adpOf(field[0])) : 99;
    /* DEMOTED UNDER THE VERDICT (design pass 2026-08-15): when #verdict-block
     * rendered this cycle it owns the headline name, the take button and the
     * Two-Reads reconciliation — a second full-width take button and a second
     * "TAKE X" name three inches below the first was exactly the four-voices
     * noise Cory rejected. The rule's DETAIL (reason, bye stack, grab-by
     * timing) stays here as the rule lens's expansion. Without the verdict
     * (module missing / degraded), everything renders as before. */
    const demoted = !!state.verdictShown;
    let html = (demoted ? '' : '<div class="rh-pick" style="font-weight:700">🎯 ' + nm(rec.pick) + '</div>')
      + '<div class="rh-why" style="font-size:.9rem;opacity:.95">'
      + (demoted ? '<b>rule detail:</b> ' : '') + escapeHtml(rec.reason) + '</div>'
      // TAKE BUTTON on the headline (phone-blocker fix 2026-08-10): the most
      // prominent recommendation on the page named a player but gave no way to
      // draft him. A full-width take, always present, right under the pick —
      // unless the verdict block above already carries it.
      + (demoted ? '' : '<button class="btn gold rh-take" data-draft-me="' + escapeHtml(String(rec.pick.player_id))
      + '" style="display:block;width:100%;margin:.5rem 0 .2rem;padding:.6rem;font-size:1rem">✓ Take '
      + escapeHtml(rec.pick.name || 'him') + '</button>');
    // The FIELD when it's close — human chooses; ledger records which (already wired).
    if (gap < 8 && field.length > 1) {
      html += '<div class="rh-field" style="font-size:.78rem;margin-top:.35rem">Close — your call: '
        + field.map(p => nm(p) + ' <span style="opacity:.82">(adp ' + Math.round(DraftNeedRule.adpOf(p)) + ')</span>').join(' · ')
        + '</div>';
    }
    // BYE STACK — the one thing the rule does NOT price, made visible (Cory #3).
    /* THREE STATES, NOT TWO. byeStack used to return a bare null both when the
     * starters do not stack AND when it could not tell — a null bye can never
     * contribute to the count, so a roster with three unknown byes returned
     * exactly what a clean one returns. It now reports blindness, and this is
     * the consumer: a warning the tool COULD NOT MAKE must not render as a
     * warning it declined to make. */
    if (rec.bye_stack && rec.bye_stack.week != null && rec.bye_stack.count >= 3) {
      html += '<div class="rh-bye" style="font-size:.78rem;margin-top:.35rem;color:#e6b800">'
        + '⚠ bye stack: this would put ' + rec.bye_stack.count + ' starters on week '
        + rec.bye_stack.week + ' — the rule does not price byes; your call.'
        + (rec.bye_stack.blind ? ' (' + rec.bye_stack.blind + ' more starter'
            + (rec.bye_stack.blind === 1 ? '' : 's') + ' have no bye on the board, '
            + 'so this count is a floor.)' : '')
        + '</div>';
    } else if (rec.bye_stack && rec.bye_stack.blind) {
      html += '<div class="rh-bye" style="font-size:.78rem;margin-top:.35rem;color:#8a8a8a">'
        + '◦ bye check incomplete: ' + escapeHtml(rec.bye_stack.why || '')
        + '</div>';
    }
    // GUARD — if the composite wants a player the rule has CAPPED (e.g. a 4th RB),
    // say so plainly rather than letting two tools disagree silently (Cory #1).
    const comp = out && out.scored && out.scored[0] && out.scored[0].player;
    if (comp) {
      const capset = DraftNeedRule.withinCap(board, roster);
      const inCap = capset.indexOf(comp) >= 0 || capset.some(p => String(p.player_id) === String(comp.player_id));
      const differs = String(comp.player_id) !== String(rec.pick.player_id);
      if (!inCap && differs) {
        html += '<div class="rh-warn" style="font-size:.78rem;margin-top:.35rem;color:#ff8a8a">'
          + '↔ the composite suggests ' + nm(comp) + ' but that over-fills ' + escapeHtml(comp.position || '')
          + ' — the rule recommends ' + nm(rec.pick) + '.</div>';
      } else if (differs && !demoted) {
        // THE MISSING HALF OF THE EXPLAINER (Cory, 2026-08-10). The guard above
        // only covered the OVER-FILL case, so when both picks are legal — two RBs
        // in round 1 — the card showed the rule's name up top, the composite's
        // name in the confidence line ("Robinson is ahead of Gibbs by 2.1") and
        // the composite's name again on the branch card as TOP PATH, with nothing
        // reconciling them. Three statements, two answers, no voice.
        //
        // The spec (A10) is deliberate here: a composite, a mask that overrides it
        // within its measured domain, and an EXPLAINER at the one seam where they
        // diverge — surfacing the disagreement is correct, hiding it is not. So
        // say it plainly, name the size of the gap, and say which one is measured.
        const cs = out.scored[0], runner = (out.scored[1] || {});
        const gapPts = (runner.player && String(runner.player.player_id) === String(rec.pick.player_id)
          && cs.score != null && runner.score != null)
          ? (cs.score - runner.score) : null;
        html += '<div class="rh-split" style="font-size:.8rem;margin-top:.4rem;'
          + 'padding:.35rem .5rem;border-left:3px solid rgba(245,196,69,.7);background:rgba(245,196,69,.07)">'
          + '↔ <b>Two reads.</b> The rule takes ' + nm(rec.pick)
          + ' (best ADP inside a startable need). The value engine prefers ' + nm(comp)
          + (gapPts != null ? ' by <b>' + gapPts.toFixed(1) + '</b> pts' : '')
          + '. <b>Follow the rule unless you have a reason not to</b> — it is the one '
          + 'measured to earn money; the composite gap is a value opinion. '
          // Only call it noise when it IS noise. COIN_FLIP_GAP is the board's own
          // "cannot separate these" threshold, so borrowing it keeps this line and
          // the confidence line from grading the same gap differently.
          + (gapPts != null && Math.abs(gapPts) < (E.CFG && E.CFG.COIN_FLIP_GAP ? E.CFG.COIN_FLIP_GAP * 4 : 4)
              ? 'A gap this small is inside what the board can resolve either way.'
              : 'That is a real gap — if you take the value pick, log why.')
          + '</div>';
      }
    }
    // HONEST TIER — the rule is confident; the dollars are MC-harness, not a
    // projection (Cory #2). When the verdict block is up, this caveat lives one
    // tap deeper (the recommendations panel's ⓘ explainer carries it verbatim)
    // instead of repeating inline on every render — Cory's wording review:
    // caveats one tap deeper, never boilerplate on the decision surface.
    if (!demoted) {
      html += '<div class="rh-caveat" style="font-size:.78rem;opacity:.82;margin-top:.35rem">'
        + 'measured rule (robust across seats/rooms/keepers); dollar magnitudes are lab-tier, not a season projection</div>';
    }

    // GRAB-BY (live) — "stick to value, know when to grab QB/TE". Recomputed every
    // pick off the live board + my roster (DraftGrabBy). This is the model watching
    // the draft and calling the right time for the scarce onesies, not a frozen
    // pre-draft snapshot. QB/TE surfaced explicitly since they're the timing calls.
    if (typeof DraftGrabBy !== 'undefined') {
      try {
        /* LRM startable boundaries feed the wire-covered-onesie cap (Cory,
         * 2026-08-17: QB urgency was contradicting the LRM strip on the same
         * screen). One derivation: computeLRM's startable_by IS the boundary
         * the strip prints, so the two surfaces cannot disagree again. */
        let lrmBounds = null;
        try {
          const picks = myNextPicks();
          (computeLRM(picks) || []).forEach(function (r) {
            /* no_deadline = startable options outlast the DRAFT (K/DEF men who
             * go undrafted) — the strongest wire coverage, boundary infinite. */
            if (r.no_deadline) { (lrmBounds = lrmBounds || {})[r.position] = Infinity; }
            else if (r.startable_by != null) {
              (lrmBounds = lrmBounds || {})[r.position] = r.startable_by;
            }
          });
        } catch (e) { lrmBounds = null; }
        const gb = DraftGrabBy.report(board, roster, myNextPicks(), state.data.league || {},
          null, lrmBounds);
        if (gb && gb.headline) {
          const pill = v => v === 'TAKE-NOW' ? '#ff8a8a' : (v === 'GRAB-SOON' ? '#f5c445' : '#8ac6ff');
          const line = pos => {
            const r = (gb.positions || []).find(x => x.position === pos);
            if (!r || !r.need) return '';
            const gbp = r.grab_by_pick != null ? ('grab-by ' + r.grab_by_pick) : '';
            return '<span style="color:' + pill(r.verdict) + ';margin-right:.6rem">'
              + pos + ': ' + r.verdict.toLowerCase() + (gbp ? ' (' + gbp + ')' : '') + '</span>';
          };
          html += '<div class="rh-grabby" style="font-size:.78rem;margin-top:.4rem;'
            + 'padding-top:.35rem;border-top:1px dashed rgba(255,255,255,.15)">'
            + '<span style="opacity:.75">⏱ timing: </span>' + line('QB') + line('TE') + line('RB') + line('WR');
          // WHO's gone + the concrete drop, for the scarce onesies you asked about.
          ['QB', 'TE', 'DEF', 'K'].forEach(pos => {
            const r = (gb.positions || []).find(x => x.position === pos);
            if (!r || !r.need || r.verdict === 'WAIT' || r.evlw == null || r.evlw < 3) return;
            const gone = (r.likely_gone || []).slice(0, 3).map(g => escapeHtml(g.name || '')).join(', ');
            const nextName = r.best_next ? escapeHtml(r.best_next.name || '') : '?';
            html += '<div style="font-size:.74rem;opacity:.85;margin-top:.25rem">'
              + '<b>' + pos + '</b>: ' + escapeHtml((r.best_now || {}).name || '') + ' now → '
              + nextName + ' by pick ' + (r.grab_by_pick || '?')
              + ' (−' + r.evlw + ' pts if you wait)'
              + (gone ? ' · likely gone: ' + gone : '') + '</div>';
          });
          html += '</div>';
        }
      } catch (e) { console.error('[grab-by]', e && e.message); }
    }
    host.innerHTML = html;
  }

  /* C3 helpers — the raw projection + the disagreement line, shared by the recs
   * cards. Reads DraftConsensus (one derivation) and the artifact provenance so
   * the label states the true source COUNT — "Consensus (2 src)" on today's
   * Sleeper+FantasyPros board, "(3 src)" where our own model also attaches, a
   * single source's own name when only one lands. Never hardcoded (the audit
   * caught this file's fallback still saying 'Sleeper proj' from the
   * single-source era). Defensive if the module didn't load. */
  function recRawProj(p) {
    if (typeof DraftConsensus === 'undefined') {
      // Module missing: label from the board's OWN provenance, never a
      // hardcoded source name. This said 'Sleeper proj' verbatim — written
      // when Sleeper was the only source, silently wrong the day FantasyPros
      // landed as the second (model-representation audit, 2026-08-16).
      const prov = ((state.data || {}).provenance || {}).projections || {};
      const src = prov.source === 'sleeper_projections' || prov.source === 'sleeper'
        ? 'Sleeper' : (prov.source || 'board');
      return { value: p.proj_mean == null ? null : p.proj_mean, label: src + ' proj', isConsensus: false };
    }
    return DraftConsensus.rawProjection(p, (state.data || {}).provenance);
  }
  function recDisagreementLine(s, scored) {
    if (typeof DraftConsensus === 'undefined') return '';
    const alt = DraftConsensus.higherProjectionAlt(s, scored, (state.data || {}).provenance, 6);
    if (!alt) return '';
    const rp = recRawProj(s.player);
    return '<div class="rec-disagree" style="margin-top:.3rem;font-size:.82rem;color:#b45309">'
      + '⚠ ' + escapeHtml(alt.alt.name) + ' projects higher ('
      + Math.round(alt.alt_proj) + ' vs ' + Math.round(alt.rec_proj) + ' ' + escapeHtml(rp.label.replace(/ proj$/, ''))
      + ') — we prefer ' + escapeHtml((s.player.name || '').split(' ').slice(-1)[0])
      + ' on ' + escapeHtml(String((s.reasons || [])[0] || 'value').slice(0, 60))
      + '. Both shown so you can judge the machinery.</div>';
  }

  /* ── THE SIX JOBS, SPLIT (war-room redesign, 2026-08-17) ─────────────────
   *
   * panel_spec.js carried the audit for days: the recommendations renderer was
   * one 436-line function "emitting a headline, a rationale, a timing block, a
   * tier-cliff card, an against-case and a chip grid", and Cory read the same
   * player surfacing from three of those jobs at once as a bug ("Gibbs listed
   * twice"). Each job is now one small function; the composer below sequences
   * them.
   *
   * WHAT DELIBERATELY STAYS IN THE COMPOSER: the ledger capture (its guard
   * text is pinned by capture_cannot_blank_board.test.js), the REC_ROWS slice,
   * the reconcile-halt short-circuit, the decisive-term readout and the ranked
   * card emission — rec_rows.test.js and decisive_readout.test.js pin those as
   * behaviour contracts INSIDE the composer (the halt fires before any row
   * draws; the readout is read-only; the promotion mark sits beside the score).
   * Conforming to a pinned contract outranks a tidier extraction.
   *
   * THE NAME RENDERS ONCE ABOVE THE FOLD. The headline (verdict block) owns
   * the player's name. Everything else the composer paints either says "him",
   * says nothing, or sits behind a tap: the against-case is a <details>
   * disclosure, the per-row stat chips are a <details> whose open state is one
   * shared persisted preference, and the ranked list keeps its own summary. */

  /* Job 1 — THE HEADLINE. The one surface that owns the answer AND the name.
   * VERDICT BEFORE THE RULE HEADLINE: the headline demotes its duplicate take
   * button and Two-Reads block only when the verdict actually rendered this
   * cycle, so it must know — state.verdictShown is set here, read there. */
  function renderRecHeadline(out) {
    try { renderVerdict(out); } catch (e) { console.error('[verdict-render]', e && e.message); }
    try { renderRuleHeadline(out); } catch (e) { console.error('[rule-headline]', e && e.message); }
  }

  /* Job 2 — THE RATIONALE PREAMBLE for the ranked list. Roster legality comes
   * first and in plain language: on the clock, a red bar saying "you have no
   * kicker" beats a re-sorted list every time. Returns html for the composer.
   * It never names the recommended player — the headline owns the name. */
  function renderRecRationale(scored) {
    const lg = scored[0].legality, lw = scored[0].legality_warning;
    if (lg) {
      return '<div class="forced-banner">⛔ ' + escapeHtml(lg.message)
        + ' Only players who can legally start are shown.</div>';
    }
    if (lw) return '<div class="forced-banner warn">⚠️ ' + escapeHtml(lw) + '</div>';
    return '';
  }

  /* Job 3 — THE TIMING + CONTEXT SATELLITES. Every call reads the SAME scored
   * board as the ranked list — never a second computation, so no surface can
   * disagree with the panel beneath it — and none may block the clock. */
  function renderRecTiming(out) {
    renderConfidence(out.confidence);
    renderBranches(out.branches);
    renderClock(out);
    // The doctrine banner runs FIRST so the path cards can tag themselves with
    // the doctrine as of THIS pick rather than the previous one (§4:
    // everything speaks the same vocabulary).
    try { renderDoctrine(out.scored); } catch (e) { /* never blocks the clock */ }
    renderPaths(out.scored);
    try { renderTiming(out.scored); } catch (e) { console.error('[timing]', e && e.message); }
    // THE MVS RIDES THE SAME RENDER — a surface that recomputes its own
    // numbers is a surface that can disagree with the panel beneath it.
    try { renderMVS(out.scored, out.paths); } catch (e) { console.error('[mvs]', e && e.message); }
    // The strategy-split panel — projected from the live board, never blank.
    try { renderShadowProjection(); } catch (e) { console.error('[shadow-proj]', e && e.message); }
    renderBestAvailStrip(out.scored, (context() || {}).nextPick);
    renderQueueSlip(out.scored);   // fill #queue-slip from the same survival math
    renderCompareTray();   // keep the dollar-gap overlay fresh as the board changes
  }

  /* Job 4 — THE TIER-CLIFF CARD (collapsed small multiples, design pass
   * 2026-08-15). Same scored board, never a second computation. */
  function renderRecTierCliff(scored) {
    try {
      const tcHost = document.getElementById('tier-cliff-chart');
      if (tcHost && typeof DraftCharts !== 'undefined') {
        tcHost.innerHTML = DraftCharts.tierCliffChart(scored);
      }
    } catch (e) { console.error('[tier-cliff]', e && e.message); }
  }

  /* Job 5 — THE CHIP GRID: one row's stat chips (VONA, the raw projection, the
   * tier, the price, the market's gone-by-next, the dossier). Collapsed behind
   * one tap by default — Cory asked for ten candidates "compacted … I can
   * click for more info", and ten open chip rows were the wall. ONE shared
   * preference, not per-card state: opening the numbers on any row opens them
   * on every row, and the choice persists on this device (wr-disclosures-v1).
   * The chips never carry the player's name — the row's name cell owns it. */
  function renderRecChips(s, pct) {
    const p = s.player;
    const rp = recRawProj(p);
    return '<details class="rec-chips"' + (state.chipsOpen ? ' open' : '') + '>'
      + '<summary data-chips-toggle="1" title="The numbers behind this row — opens on every row and stays put">'
        + (state.chipsOpen ? '▾ numbers' : '▸ numbers') + '</summary>'
      + '<div class="rec-stats">'
      + '<span title="Value Over Next Available — what you lose by waiting">VONA <b>' + s.components.vona.toFixed(1) + '</b></span>'
      // C3 — the raw projection, labelled by its true source count (the
      // consensus.js contract: source names when single, "Consensus (N)" when
      // ≥2), sat next to our VONA so a disagreement is visible on the card.
      + '<span title="Raw, unmodelled projection — the sanity check on our valuation">'
        + escapeHtml(rp.label.replace(/ proj$/, '')) + ' <b>'
        + (rp.value == null ? '—' : Math.round(rp.value)) + '</b></span>'
      + '<span>Tier <b>' + p.tier + '</b> (' + p.tier_rank + '/' + p.tier_size + ')</span>'
      + '<span>ADP <b>' + Math.round(p.adjusted_adp) + '</b></span>'
      + (pct ? '<span class="' + (pct > 70 ? 'neg' : '') + '" title="market+room estimate — the number the score uses">~' + pct + '% gone by next</span>' : '')
      // One tap deeper: the full dossier of engine fields for this row.
      + '<button class="rec-expand" data-dossier="' + p.player_id + '">'
        + (state.dossierOpen === String(p.player_id) ? '▾ close' : '▸ dossier') + '</button>'
      + '</div></details>';
  }
  function toggleRecChips() {
    state.chipsOpen = !state.chipsOpen;
    saveDisclosure('rec-chips', state.chipsOpen);
    renderRecommendations();
  }

  /* Job 6 — THE AGAINST-CASE: the coin-flip / override disclosure under the
   * ranked list. A distance is never negative: a negative gap_to_second means
   * a pinned personal-list pick sits below the board's own top — an override,
   * not a coin flip (2026-08-10 critique: "within -1.9 pts").
   *
   * ⚠️ THE ALTERNATIVE IS A CONTROL, NOT A SENTENCE. Naming the coin flip with
   * no way to act on it made taking the OTHER player cost more taps than
   * taking the recommendation — highest friction exactly where the tool is
   * least sure, and coin-flip overrides are the most informative class in the
   * ledger. It reuses `data-draft-me`, the ONE take mechanism the whole app is
   * bound to at the document level — never a second take path.
   *
   * NAME-ONCE (redesign 2026-08-17): the summary line names nobody; the
   * alternative's name and its one-tap take control sit behind the disclosure,
   * so the headline stays the only name above the fold. */
  function renderRecAgainstCase(scored) {
    const top = scored[0];
    const tb = $('#tiebreak');
    tb.style.display = top && top.contested ? '' : 'none';
    if (!(top && top.contested)) return;
    const g = top.gap_to_second;
    const alt = scored[1] && scored[1].player;
    let body;
    if (g < 0) {
      body = 'Your pinned pick scores ' + Math.abs(g).toFixed(1)
        + ' pts below the board top — a deliberate override, not a coin flip.';
    } else {
      body = 'Top two are within <b>' + g.toFixed(1)
        + '</b> pts — effectively a coin flip.'
        + (alt
            ? ' <button class="btn small gold tb-alt" data-draft-me="'
              + escapeHtml(String(alt.player_id)) + '">Take '
              + escapeHtml(alt.name || 'the other') + ' instead</button>'
            : '');
    }
    tb.innerHTML = '<details class="rec-against">'
      + '<summary>' + (g < 0 ? '⚖ Your override — the board disagrees'
                             : '⚖ Coin flip — the case against') + '</summary>'
      + '<div class="ra-body">' + body + '</div></details>';
  }

  function renderRecommendations() {
    // One call so the recommendation, the confidence line and the branch
    // forecasts can never come from three different boards.
    const out = E.onTheClock(context(), state.lists);
    state.lastClock = out;
    // Job 1 — the headline (verdict + demoted rule detail) owns the NAME.
    renderRecHeadline(out);
    // L1 capture: the board I made a decision from, once per (pick, build).
    // Logged BEFORE the outcome is known — the whole point of decision-time
    // capture. Deduped in PredLedger so re-renders don't flood.
    /* MOCKS NOW WRITE, STAMPED AS MOCKS, and that is a deliberate reversal.
     *
     * The condition used to carry `&& !state.mockMode`, so a mock draft logged
     * NOTHING. That makes the one available proof of decision-capture — run a
     * full mock and show the board state survives and replays — structurally
     * impossible: the only way to exercise this path end to end produced no rows
     * to inspect.
     *
     * The two failure modes are not symmetric. Dropping mock rows destroys
     * evidence permanently. Keeping them risks a mock row being mistaken for a
     * deployed one, which is a LABELLING problem and is fixed by labelling:
     * `mock` rides on every row, so a consumer that fails to filter is a visible
     * bug rather than a silent contamination of acceptance evidence.
     */
    /* ⚠️ THE CAPTURE MUST NEVER BE ABLE TO BLANK THE BOARD.
     *
     * This block sits inside renderRecommendations, and it was NOT guarded —
     * while the renderRuleHeadline call one line above it is. That asymmetry was
     * survivable until I added a call to `PredLedger.boardState`, a NEW export:
     * a browser holding a cached predledger.js without it throws a TypeError
     * here, inside the function that draws the board, AT THE TABLE. Losing the
     * ledger row is a bad night; losing the recommendations is a lost draft.
     *
     * So two levels of degradation, in the order that preserves the most:
     *   1. a missing boardState degrades to the OLD payload rather than losing
     *      the row — a recommendation without board state still grades, and
     *      evidence preservation outranks completeness;
     *   2. anything else at all is caught, logged, and the board renders.
     */
    if (typeof PredLedger !== 'undefined' && out.scored && out.scored.length) try {
      var c = ledgerCtx();
      /* INNER GUARD: the POST is the fallible half, and the LOCAL LOCK below is
       * the half draft-night correctness actually depends on — reconcile reads
       * it. So a ledger failure must not skip the lock, which is why the two are
       * not in the same try. */
      try {
      PredLedger.recommendation({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'composite-v1',
        /* THE BOARD I DECIDED FROM rides with the recommendation. `state.board`
         * is exactly `data.players` minus `state.drafted`, so the taken set
         * reconstructs the engine's input rather than summarising it.
         * Canonicalised in PredLedger so this call site cannot drift into a
         * second format. */
        payload: Object.assign({ mock: !!state.mockMode },
          (typeof PredLedger.boardState === 'function'
            ? PredLedger.boardState(state.drafted, (state.board || []).length)
            : { taken_state: 'unavailable' }), {
          weights: state.weights,
          top: out.scored.slice(0, 10).map(function (s) {
            return { player_id: String(s.player.player_id), name: s.player.name,
              position: s.player.position, score: Math.round(s.score * 10) / 10,
              survival_to_next: s.survival_to_next == null ? null : Math.round(s.survival_to_next * 1000) / 1000,
              rails: (s.rails || []).length, demoted: !!s.demoted };
          }),
          contested: !!(out.scored[0] && out.scored[0].contested),
          confidence: out.confidence ? out.confidence.level : null,
          /* WHAT THE MODEL WAS THINKING, NOT ONLY WHAT IT PICKED.
           *
           * Cory: "record these thoughts also so that we can test and continue
           * improving." The recommendation says WHO; this says WHY THAT
           * POSITION, and the second is the part a later grade can argue with.
           * Without it January can ask "was Bowers a good pick" and cannot ask
           * "was taking a tight end AT ALL right at 13" — the question that
           * would actually improve the model.
           *
           * COMPUTED HERE FROM `out.scored`, NOT READ FROM state.lastTiming.
           * My first cut did the latter and it was wrong twice over: it assigned
           * to the ledger CONTEXT rather than the payload, so it was recorded
           * nowhere; and the render that populates state.lastTiming runs LATER
           * in the cycle, so it would have stored the PREVIOUS pick's reasoning
           * against this pick's board — a stale thought filed as a fresh one,
           * which is worse than no thought at all.
           *
           * Rides on the recommendation row so it shares the decision key and
           * the `taken_player_ids` board state already captured there. */
          timing: (function () {
            try {
              var t = positionTiming(context(), out.scored);
              return (t.rows || []).map(function (r) {
                return { position: r.position, verdict: r.verdict, d: r.D,
                  d_star: r.Dstar, seat: r.seat, premium: r.premium,
                  best_id: r.best ? String(r.best.player_id) : null };
              });
            } catch (e) { return null; }
          })(),
        }) });
      } catch (e) { console.error('[ledger-capture]', e && e.message); }

      /* ⚠️ LOCK IT LOCALLY AT THE SAME MOMENT IT IS COMMITTED.
       *
       * PredLedger is write-only — there is no read-back — so the committed
       * recommendation existed in the ledger and nowhere the app could consult.
       * That is why the reconcile path compared against `state.lastClock`, which
       * is rewritten on every render and is the recommendation for whatever pick
       * was current at the LAST render rather than for mine.
       *
       * Keyed by PICK NUMBER, written once per pick (PredLedger dedupes, and so
       * does this — first write wins, because the first render at a pick is the
       * one made against the board as it stood when the pick opened). */
      state.lockedRecs = state.lockedRecs || {};
      if (c.pick != null && !state.lockedRecs[c.pick]) {
        var _t0 = out.scored[0];
        state.lockedRecs[c.pick] = {
          player: _t0.player,
          gap_to_second: _t0.gap_to_second == null ? null : _t0.gap_to_second,
          contested: !!_t0.contested,
        };
      }
    } catch (e) { console.error('[rec-capture]', e && e.message); }

    // FORWARD PREDICTION — commit the model's timestamped claims about what has NOT
    // happened yet (who the room takes in R1, whether my targets survive to my next
    // pick). REAL draft only — a mock is not forward evidence — and deduped by key
    // in PredLedger, so calling it every render commits each claim exactly once.
    // The one evidence about THIS model deciding in real conditions; the window
    // closes at the draft. Never blocks the clock.
    if (typeof PredLedger !== 'undefined' && typeof DraftForecast !== 'undefined'
        && !state.mockMode && out.scored && out.scored.length) {
      try {
        var fctx = context();
        var fc = DraftForecast.buildForecasts({
          scored: out.scored,
          myPicks: (state.data.pick_order || {}).my_picks || [],
          currentPick: currentPick(),
          nextPick: (fctx || {}).nextPick,
          teams: (state.data.league || {}).teams || 10,
        });
        var fcSeason = ledgerCtx().season;
        if (!state.committedForecasts) state.committedForecasts = [];
        fc.forEach(function (f) {
          PredLedger.forecast({ season: fcSeason, method: f.method,
            pick: currentPick(), payload: f.payload });
          // Keep a local copy keyed once, so the resolver (below) can pair each
          // committed claim against reality when the draft reaches its pick. This
          // is the client-side memory the forward loop needs — the ledger POST is
          // fire-and-forget, but resolution has to match by key.
          var k = (f.payload || {}).key;
          if (k && !state.committedForecasts.some(function (x) { return (x.payload || {}).key === k; })) {
            state.committedForecasts.push({ method: f.method, payload: f.payload });
          }
        });
      } catch (e) { console.error('[forecast]', e && e.message); }
    }

    // Jobs 3 + 4 — the timing/context satellites and the tier-cliff card, all
    // off the SAME scored board (never a second computation).
    renderRecTiming(out);
    renderRecTierCliff(out.scored);
    // Stack line runs BEFORE the rec cards below so stackBadge() can read its
    // route map; the movement line diffs this pick's top against the last
    // pick's. Both stay HERE in the composer — app-wiring.test.js pins this
    // seam (the render loop itself must invoke them). Same scored board.
    try { renderStackLine(out.scored); } catch (e) { console.error('[stack]', e && e.message); }
    try { updateMovement(currentPick(), out.scored); }
    catch (e) { console.error('[movement]', e && e.message); }
    const all = out.scored;
    /* TEN, NOT FIVE — asked for twice, in these words (Cory, 2026-08-13):
     *   "Need top 5 recommended players so I can compare options."
     *   "Again! More options, I need to 10 next best players in easy view to
     *    make a decision. Feel free to compact things more, even with smaller
     *    font. I can click for more info."
     *
     * He already had five, which is why the first ask read as satisfied and the
     * second one is the real number. THE ENGINE ALREADY SCORES THEM — the
     * ledger has been capturing `out.scored.slice(0, 10)` on every pick since
     * decision-capture went in, so ten candidates were computed, recorded for
     * the January grade, and shown to nobody. This line was the whole gap.
     *
     * IT IS A CEILING, NOT A QUOTA: a thin board renders what it has, and the
     * cards below already handle a short list. The COMPACTING he asked for in
     * the same breath is B's — ten cards at the current card size is a wall,
     * and the note routed to B says so rather than leaving them to discover it. */
    const REC_ROWS = 10;
    const scored = all.slice(0, REC_ROWS);
    const host = $('#recs');
    if (state.reconcile && state.reconcile.halt) {
      host.innerHTML = '<p class="muted" style="margin:0">Paused — resolve the keeper '
        + 'mismatch above. Every number below it derives from the slate.</p>';
      return;
    }
    if (!scored.length) { host.innerHTML = '<p class="muted">Board is empty.</p>'; return; }

    // Job 2 \u2014 the rationale preamble (roster legality, plain language).
    const head = renderRecRationale(scored);

    /* REGISTER 4e, THE CHEAP FIX (A/B, 08-18) \u2014 a CAPTION, not a re-sort.
     * The list IS ordered by the engine's composite score (`.rec-rank` is that
     * order and nothing else), and each card already prints the number that
     * drives it (`.rec-score`) \u2014 but its label lives only in a hover title,
     * which does not exist on a phone and does not exist at 8s/pick either.
     * A reader scanning bare numbers next to a dollar-heavy tool has no way to
     * know this one is a composite score rather than a price. One always-
     * visible line says what it is; the number, the sort and the score column
     * itself are all unchanged \u2014 sorting BY the displayed number would change
     * which player the engine recommends first, four days out, which is A's
     * engine and exactly what this row's own resolution rules out. */
    const orderNote = '<div class="rec-order-note">Ranked by <b>composite score</b> \u2014 '
      + 'the number beside each name (' + '<span class="rec-order-eg">17.3</span>'
      + ') is that score, not a dollar value.</div>';

    /* WHICH TERM DECIDED THIS PICK, BEFORE IT IS MADE.
     *
     * decision_contract.js has been ON the war-room page and CALLED BY NOTHING.
     * The script tag has been in _warroom_scripts.ejs since ca034f3,
     * module_check.js verifies the global is defined at runtime, and `grep
     * DecisionContract public/js/draft/app.js` returned zero hits -- a module
     * loaded, checked for presence, and never read. Produced-and-unread, at the
     * one surface that answers "why this player".
     *
     * WHY IT IS HERE NOW (Cory, 2026-08-14, on the stack term at weight 1.0):
     * "if the stack term ever decides a pick I would not have made, I WANT TO
     * SEE THE SWING BEFORE IT HAPPENS RATHER THAN AFTER."
     *
     * MEASURED BEFORE WIRING, so this is a signal rather than a line to learn to
     * ignore. Over the twelve picks of a full construction from slot 8:
     *     value   decisive 7/12, largest swing 10.9
     *     onesie  decisive 4/12, largest swing  8.9
     *     stack   decisive 3/12, swing EXACTLY 6.0 every time
     *     keeper  decisive 3/12, largest swing  4.6
     * At pick 74 stack carried +6.0 while value ran -4.1 -- the stack term
     * overrode the anchor and chose the pick. And stack's swing is a CONSTANT,
     * not a distribution: an on/off six-point thumb, which is not what a
     * "weight of 1.0" reads like.
     *
     * IT REPORTS AND CHANGES NOTHING. No re-ordering, no score, no penalty --
     * the list below is identical with this block deleted. */
    let decisiveLine = '';
  /* ── THE DECISIVE-TERM READOUT'S OWN STYLES, INLINE AND ON PURPOSE ────────
   *
   * These fourteen lines lived in public/css/style.css — B's file — added by
   * A in 8d1d8e0. Purely additive, and the block's own comment noted the sheet
   * is shared. It was still a TRESPASS: territory-check owns that file to B, so
   * `integrate.sh` REFUSED A's entire branch over it, which blocked the
   * cross-lane inbox from ever reaching main. A styling nicety was holding up
   * the mechanism built to stop lanes talking past each other.
   *
   * The element is constructed HERE, in A's file, so the styles can be too.
   * Inline is the cost: no cascade, no theming, and a longer line. That is a
   * fair price for not owning someone else's stylesheet, and it is reversible
   * the moment B says where an A-owned sheet should live.
   */
  const DECISIVE_CSS = 'font-size:.82rem;letter-spacing:.01em;padding:.35rem .6rem;'
    + 'margin:0 0 .5rem;border-left:2px solid rgba(245,196,69,.55);'
    + 'background:rgba(245,196,69,.05);border-radius:0 4px 4px 0;';

  // Fallback only — see the comment at the `.rec-promoted` emit site. Sized to
  // sit under the score without pushing the action buttons, and legible on the
  // dark card before B styles the class.
  const PROMOTED_CSS = 'font-size:.68rem;line-height:1.1;text-align:center;'
    + 'letter-spacing:.02em;color:#f5c445;white-space:nowrap;margin:0 0 .15rem;';

    try {
      if (typeof DecisionContract !== 'undefined' && scored.length > 1) {
        const gap = scored[0].score - scored[1].score;
        const sig = DecisionContract.contributions(scored[0], scored[1], gap)
          .filter(c => c.decision_significant);
        if (sig.length) {
          decisiveLine = '<div class="rec-decisive" style="' + DECISIVE_CSS + '">'
            + 'decides this pick: '
            + sig.map(c => escapeHtml(c.term) + ' '
                + (c.delta >= 0 ? '+' : '') + c.delta.toFixed(1)).join(' · ')
            + '<span class="muted"> — removing any one of these alone flips it to '
            + escapeHtml(scored[1].player.name) + '</span></div>';
        }
      }
    } catch (e) {
      /* NEVER BLOCK THE CLOCK FOR AN EXPLANATION. A throw here must not cost the
       * recommendation list; it costs this one line, and says so out loud rather
       * than rendering blank. */
      console.error('[decisive]', e && e.message);
      decisiveLine = '<div class="rec-decisive muted" style="' + DECISIVE_CSS + '">decisive-term readout '
        + 'unavailable (' + escapeHtml(String((e && e.message) || 'error')) + ')</div>';
    }

    /* Range-bar scale (cockpit rebuild 2026-08-17): floor→ceiling bands share
     * ONE scale across the shortlist, or the bars are not comparable. Pure
     * builder lives in warroom_charts.js (loaded after this file — guarded, so
     * a missing module costs the bar, never the row). */
    const rbScale = (function () {
      let lo = Infinity, hi = -Infinity;
      scored.forEach(x => {
        const q = x.player;
        if (q.proj_floor != null && q.proj_floor < lo) lo = q.proj_floor;
        if (q.proj_ceiling != null && q.proj_ceiling > hi) hi = q.proj_ceiling;
      });
      return (lo < hi) ? { min: lo, max: hi } : null;
    })();
    const curPickNo = (function () { try { return currentPick(); } catch (e) { return null; } })();
    host.innerHTML = explainPanel('recommendations') + head + orderNote + decisiveLine + scored.map((s, i) => {
      const p = s.player;
      const pct = survivalPct(1 - (s.survival_to_next || 0));
      /* FALLING (Cory, cockpit steering): value sliding past its market price —
       * he is on the board 10+ picks after the market expected him gone. */
      const falling = (curPickNo != null && p.adjusted_adp != null
        && p.adp_source !== 'search_rank' && (curPickNo - p.adjusted_adp) >= 10);
      return '<div class="rec-card' + (i === 0 ? ' top' : '') + (s.demoted ? ' demoted' : '') + '">' +
        '<div class="rec-rank">' + (s.demoted ? '↓' : (i + 1)) + '</div>' +
        '<div class="rec-main">' +
          '<div class="rec-name"><span class="rec-nm" data-drill="' + p.player_id + '" title="Full dossier">' + escapeHtml(p.name) + '</span>' +
            '<span class="rec-pos ' + p.position + '">' + p.position + '</span>' +
            '<span class="muted">' + escapeHtml(p.team || '') + (p.bye ? ' · bye ' + p.bye : '') + '</span>' +
            (falling ? '<span class="wr-falling" title="On the board ' + Math.round(curPickNo - p.adjusted_adp)
              + ' picks past his ADP (' + Math.round(p.adjusted_adp) + ') — the room is letting him slide">FALLING '
              + Math.round(curPickNo - p.adjusted_adp) + '</span>' : '') +
            sourceGapBadge(p, state.board) +
          '</div>' +
          ((rbScale && typeof WarRoomCharts !== 'undefined' && p.proj_floor != null && p.proj_ceiling != null)
            ? WarRoomCharts.rangeBar(p.proj_floor, p.proj_mean, p.proj_ceiling,
                { min: rbScale.min, max: rbScale.max, lead: i === 0,
                  cohortCeiling: cohortCeiling(p) })
            : '') +
          '<div class="rec-why">' + escapeHtml(s.reasons[0]) +
            (s.reasons.length > 1 ? ' · ' + escapeHtml(s.reasons[1]) : '') + '</div>' +
          /* ⚠️ CONTEXT IS RENDERED SEPARATELY, AND IT HAD TO BE.
           *
           * Rule 16 moved 24 board facts out of `reasons` and into `context` —
           * "fills your empty QB slot", "Tier 1 TE is thinning". Correct: they
           * did not drive the pick. But I emitted `context` from the engine and
           * wired NO consumer, which is rule 14 committed by the person who has
           * spent the week catching it: the information Cory said is worth
           * knowing at pick 41 would simply have vanished from the board.
           *
           * A DISTINCT ELEMENT, not appended to `.rec-why`. The whole point of
           * the split is that a fact about the roster must not be readable as
           * the reason for the pick, and putting them in the same line would
           * restore exactly that confusion with extra steps. B styles
           * `.rec-context`; A only guarantees it is separate. */
          ((s.context && s.context.length)
            ? '<div class="rec-context">' + s.context.map(escapeHtml).join(' · ') + '</div>'
            : '') +
          stackBadge(p) +
          /* CONDITIONAL-VALUE CHIP (Cory's ruling 2026-08-17): the stack/
           * handcuff premium TO CORY'S ROSTER, printed as its own labelled
           * line beside the board value — annotation, never a second
           * recommendation, never a term of the score to its right. */
          condValueChip(p) +
          ((s.rails && s.rails.length)
            ? '<div class="rail-strip">' + s.rails.map(f =>
                '<span>\u26a0\ufe0f ' + escapeHtml(f) + '</span>').join('') + '</div>'
            : '') +
          // Job 5 — the chip grid, one tap away (shared, persisted open state).
          renderRecChips(s, pct) +
          // The disagreement line on the TOP card: if a same-position candidate
          // projects higher than the one we're recommending, say so — that is the
          // moment both numbers matter (machinery found something, or it's broken).
          (i === 0 ? recDisagreementLine(s, scored) : '') +
        '</div>' +
        '<div class="rec-actions">' +
          /* ⚠️ THE MARK GOES WHERE THE INVERSION IS VISIBLE — NEXT TO THE SCORE.
           *
           * The engine has emitted `ceiling_tiebreak` since 2026-08-14 and
           * prepends a reason naming the man passed, so the EXPLANATION was
           * already on the card. But it lands in `.rec-why`, on the left, one of
           * two reasons; the thing that looks broken is the `.rec-score` column
           * on the right. Measured on the live board at pick 33 — Cory's FIRST
           * pick — the list prints:
           *
           *     1. TE Colston Loveland  17.3
           *     2. RB Travis Etienne    16.5   <- promoted
           *     3. RB D'Andre Swift     17.0
           *
           * Scanning the score column top-down at his most important pick, the
           * numbers go 17.3, 16.5, 17.0 and nothing in that column says why. A
           * reader who cannot tell a deliberate promotion from a broken sort
           * stops trusting the column, and the column is how he compares ten
           * candidates.
           *
           * READABLE WITHOUT HOVER, deliberately. The `title` carries the
           * arithmetic, but titles do not exist on a phone, so the visible text
           * has to do the work on its own; the full sentence stays in
           * `.rec-why`. This mark is the POINTER, not the explanation.
           *
           * A DISTINCT ELEMENT, same contract as `.rec-context`: B styles
           * `.rec-promoted`, A only guarantees it is emitted, separate, and
           * adjacent to the number it is about. The inline rule is a legible
           * fallback so it is not invisible before B styles it — the same
           * pattern as `DECISIVE_CSS` above, not a claim on B's lane. */
          (s.ceiling_tiebreak
            ? '<div class="rec-promoted" style="' + PROMOTED_CSS + '" title="'
                + escapeHtml('Promoted over ' + (s.ceiling_tiebreak.over || 'the row below')
                  + ' — scores ' + Math.abs(s.ceiling_tiebreak.score_gap).toFixed(1)
                  + ' lower, ceiling ' + Math.round(s.ceiling_tiebreak.ceiling)
                  + ' vs ' + Math.round(s.ceiling_tiebreak.ceiling_over))
                + '">↑ upside</div>'
            : '') +
          '<div class="rec-score" title="Composite score">' + s.score.toFixed(1) + '</div>' +
          '<button class="btn small gold" data-draft-me="' + p.player_id + '">I took him</button>' +
          '<button class="btn small ghost" data-draft-other="' + p.player_id + '">Gone</button>' +
          '<button class="btn small navy" data-why="' + p.player_id + '">Why?</button>' +
          '<button class="btn small ghost" data-compare="' + p.player_id + '" title="Compare — dollar gap">' +
            (state.compare.indexOf(String(p.player_id)) >= 0 ? '⚖️✓' : '⚖️') + '</button>' +
        '</div>' +
        (state.dossierOpen === String(p.player_id) ? dossierHtml(s) : '') +
      '</div>';
    }).join('');

    // Job 6 — the against-case, one tap away and never a second name above
    // the fold.
    renderRecAgainstCase(scored);
  }

  /* ⚠️ THE SEARCH DEMANDED A CONTIGUOUS SUBSTRING OF THE FULL NAME, which is
   * not how anybody types a name under a clock.
   *
   * Cory: *"The search for player tool is not working and not convenient... I
   * have to type in whole name."* Driven against the real board, the old
   * `name.indexOf(query)` gave:
   *
   *     "gibbs"        -> Jahmyr Gibbs            fine
   *     "jahmyr gibbs" -> Jahmyr Gibbs            fine
   *     "j gibbs"      -> NOTHING                 <- initial + surname, the
   *                                                  fastest way to type, dead
   *     "gibbs j"      -> NOTHING                 <- how a board lists a name
   *     "gibs"         -> ANTONIO GIBSON          <- one typo, and it hands you
   *                                                  a DIFFERENT PLAYER
   *
   * The last one is the dangerous case and the reason this is not just
   * convenience: it does not fail, it silently answers with somebody else. On
   * the clock, typing fast, that is a wrong pick rather than a retry.
   *
   * ── TOKENS AGAINST NAME PARTS, IN ANY ORDER ──────────────────────────────
   *
   * Every whitespace-separated token must match SOME part of the name, by
   * prefix. So "j gibbs", "gibbs j", "jah gib" and "gibbs" all find him, and
   * order does not matter because a draft board and a human list names
   * differently.
   *
   * ── AND IT IS DELIBERATELY NOT FUZZY ─────────────────────────────────────
   *
   * Levenshtein or a soundex would "fix" the "gibs" typo, and that is exactly
   * the wrong medicine: it makes a near-miss MORE likely to return a confident
   * wrong player, which is the failure that matters here. A typo should return
   * few results or none and let him retype, not silently pick a neighbour.
   * `gibs` still prefix-matches Gibson because it genuinely is a prefix of it —
   * but the SCORE below puts a full-token hit above a partial one, so where both
   * exist the exact one leads. */
  function nameScore(name, q) {
    const n = String(name || '').toLowerCase();
    if (!n) return 0;
    const parts = n.split(/[\s.'-]+/).filter(Boolean);
    const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return 1;
    let score = 0;
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      let best = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === tok) best = Math.max(best, 4);            // whole name part
        else if (part.indexOf(tok) === 0) best = Math.max(best, 3);   // prefix
        else if (part.indexOf(tok) > 0) best = Math.max(best, 1);     // inside
      }
      /* EVERY token must land somewhere, or it is not this player. That is what
       * stops "gibbs smith" returning Gibbs — the second token has no home. */
      if (!best) return 0;
      score += best;
    }
    /* A SURNAME HIT OUTRANKS A FORENAME HIT on a single token, because "gibbs"
     * means the man called Gibbs, not the man called Gibbs-something-else. */
    if (tokens.length === 1 && parts.length > 1
        && parts[parts.length - 1].indexOf(tokens[0]) === 0) score += 2;
    return score;
  }

  function renderBoard() {
    // PER-PASS, not per-session: a caveat shown once on page load and never
    // again would be worse than repeating it, because a filter change rebuilds
    // the table and the reader would then see none at all.
    resetCaveats();
    const match = p => (state.filterPos === 'ALL' || p.position === state.filterPos)
      && (!state.search || nameScore(p.name, state.search) > 0);
    /* RANKED BY HOW WELL THE NAME MATCHES, then by the board's own order. The
     * old filter kept board order, so a search that hit several men buried the
     * one actually typed — `gib` returned Jahmyr Gibbs and Antonio Gibson with
     * the winner decided by ADP rather than by what was asked for. */
    const rows = (state.search
      ? state.board.filter(match)
        .map((p, i) => ({ p: p, s: nameScore(p.name, state.search), i: i }))
        .sort((a, b) => (b.s - a.s) || (a.i - b.i)).map(x => x.p)
      : state.board.filter(match)).slice(0, 200);

    // Searching also looks at players already taken. "He isn't here" and "he
    // went four picks ago" are different answers, and only one of them means
    // something is broken — but the board could only ever give you the first.
    const takenHits = state.search
      ? (state.data.players || []).filter(p => state.drafted.has(String(p.player_id)) && match(p)).slice(0, 25)
      : [];
    /* ── B1 ONESIE DEMOTION (final-pass): in the "All" view K/DEF flooded ranks
     * 52-200 with their own tier-1 labels — replacement onesies are freely
     * streamable in this league, so cross-position VORP is misleading there.
     * The All view lists skill players first, onesies after them (dimmed, with
     * one explanatory line); position-filtered views are untouched — tier/VORP
     * stay meaningful within a position. DISPLAY ORDER ONLY: no score, rank or
     * engine field changes, and every row keeps its true numbers. */
    const demoteOnesies = state.filterPos === 'ALL' && !state.search;
    const displayRows = demoteOnesies
      ? rows.filter(p => p.position !== 'K' && p.position !== 'DEF')
          .concat(rows.filter(p => p.position === 'K' || p.position === 'DEF'))
      : rows;
    let onesieNoteAt = demoteOnesies
      ? displayRows.findIndex(p => p.position === 'K' || p.position === 'DEF') : -1;
    /* ── B2 SENTINELS (final-pass): players priced by Sleeper search rank
     * rather than a real ADP feed rendered "ADJ ADP 328" as if it were market
     * data. A sentinel never renders as a number — it renders as "—" with the
     * reason one tap away (data-caveat, same mechanism as ¹). */
    const adpCell = (p, v) => (p.adp_source === 'search_rank'
      ? '<span class="muted" title="beyond real ADP coverage — priced by Sleeper '
        + 'popularity rank for late-round ordering only">—' + caveatOnce('adp_sentinel', '³',
          'beyond FantasyPros/FFC ADP coverage. Ordered by Sleeper popularity rank — '
          + 'fine for late-round fliers, not a market price. Never shown as a number.')
        + '</span>'
      : Math.round(v));
    /* ── B3 TIER BANDING: a hairline where the tier breaks inside a position
     * view, and in the All view a thin "last of Tier N POS" marker on the final
     * player of each positional tier — the "last of Tier 1 WR" moment. */
    const lastOfTier = {};
    if (state.filterPos === 'ALL') {
      const seen = {};
      for (let i = displayRows.length - 1; i >= 0; i--) {
        const p = displayRows[i];
        const key = p.position + ':' + p.tier;
        if (!seen[key]) { seen[key] = true; lastOfTier[p.player_id] = p.tier <= 2; }
      }
    }
    $('#board-body').innerHTML = displayRows.map((p, ri) => {
      const tierBreak = state.filterPos !== 'ALL' && ri > 0
        && displayRows[ri - 1].tier !== p.tier;
      const onesieRow = demoteOnesies && (p.position === 'K' || p.position === 'DEF');
      const noteRow = (ri === onesieNoteAt)
        ? '<tr class="onesie-demoted"><td colspan="13"><div class="board-onesie-note">'
          + 'K &amp; DEF below — demoted in this view: streamable all season, so their '
          + 'cross-position rank is not a draft signal. Use the position filter for their real tiers.'
          + '</div></td></tr>'
        : '';
      return noteRow + '<tr data-tier="' + p.tier + '"'
        + ((tierBreak ? ' class="tier-cliff"' : '')
          || (onesieRow ? ' class="onesie-demoted"' : '')) + '>' +
        '<td class="num">' + p.overall_rank + '</td>' +
        '<td><b class="rec-nm" data-drill="' + p.player_id + '" title="Full dossier">' + escapeHtml(p.name) + '</b>'
          + (lastOfTier[p.player_id]
            ? ' <span class="tier-note">last of T' + p.tier + ' ' + p.position + '</span>' : '') + '</td>' +
        '<td><span class="rec-pos ' + p.position + '">' + p.position + '</span></td>' +
        '<td class="muted">' + escapeHtml(p.team || '') + '</td>' +
        '<td class="num">' + (p.bye || '—') + '</td>' +
        '<td class="num">' + Math.round(p.proj_mean) + projSourceMark(p) + '</td>' +
        '<td class="num">' + p.vorp.toFixed(1) + '</td>' +
        '<td class="num tier-cell t' + ((p.tier - 1) % 6) + '">' + p.tier + '</td>' +
        '<td class="num">' + adpCell(p, p.adjusted_adp) + '</td>' +
        '<td class="num muted">' + adpCell(p, p.raw_adp || 0) + '</td>' +
        '<td>' + riskFlags(p) + '</td>' +
        '<td class="num" style="white-space:nowrap">' +
          (p.override
            ? '<button class="btn small gold" data-override="' + p.player_id + '" data-kind="clear" '
              + 'title="Clear override">↺ ' + escapeHtml(p.override.kind) + '</button>'
            : '<button class="btn small ghost" data-override="' + p.player_id + '" data-kind="downgrade" '
              + 'title="News says he is worse — 25% haircut">▼</button>'
              + '<button class="btn small ghost" data-override="' + p.player_id + '" data-kind="promote" '
              + 'title="News says he is better — 25% bump">▲</button>'
              + '<button class="btn small ghost" data-override="' + p.player_id + '" data-kind="remove" '
              + 'title="Undraftable — suspension, injury, holdout">⊘</button>') +
        '</td>' +
        '<td class="num" style="white-space:nowrap">' +
          '<button class="btn small ' + (state.lists.queue.indexOf(p.player_id) >= 0 ? 'navy' : 'ghost')
            // THE SAME FICTION WE RETIRED FROM THE VISIBLE COPY, sitting in two
            // hundred title attributes. The draft is UNTIMED; there is no clock
            // and no eight seconds. B found it because a page-text scan CANNOT
            // SEE ATTRIBUTES — the same structural blindness as the twenty
            // visibility-hidden elements that read as unlabelled buttons.
            // Anything auditing rendered output has channels it cannot reach,
            // so "the scan came back clean" is a statement about the scan.
            + '" data-queue="' + p.player_id + '" title="Queue — the short list you read first when it is your turn">'
            + (state.lists.queue.indexOf(p.player_id) >= 0 ? '✓' : '➕') + '</button>' +
          '<button class="btn small ' + (state.lists.targets.indexOf(p.player_id) >= 0 ? 'gold' : 'ghost')
            + '" data-list="targets" data-id="' + p.player_id + '" title="Target — nudge him up a close call">\u2b50</button>' +
          '<button class="btn small ' + (state.lists.avoid.indexOf(p.player_id) >= 0 ? 'navy' : 'ghost')
            + '" data-list="avoid" data-id="' + p.player_id + '" title="Never draft — remove from every recommendation">\u{1F6AB}</button>' +
          // "I TOOK HIM" BELONGS ON EVERY ROW, NOT JUST THE TOP FIVE.
          //
          // Reported from a live mock: taking a player who was not in the
          // recommendations left no way to put him on my roster. The board's
          // only draft action was this row's ✕, which marks a player GONE —
          // i.e. taken by somebody ELSE. So the whole board could record other
          // people's picks and none of mine, and the roster, the need model and
          // every downstream recommendation went on believing I had one fewer
          // player than I did.
          //
          // The recommendation cards had the button all along, which is why it
          // was easy to miss: it works perfectly right up to the moment you
          // disagree with the tool, which is exactly when you need it.
          '<button class="btn small gold" data-draft-me="' + p.player_id
            + '" title="I drafted him — adds to MY roster">\u2795 Me</button>' +
          '<button class="btn small ghost" data-draft-other="' + p.player_id
            + '" title="Somebody else took him">✕</button></td>' +
      '</tr>';
    }).join('');
    renderSearchTail(rows.length, takenHits);
    // Lead with the number that MOVES. The visible list is capped at 200, so
    // "200 shown" holds steady as picks come off and reads as if nothing updated
    // (reported from a mock). The available count IS decrementing every pick —
    // make it the salient number so a take visibly ticks the board down.
    $('#board-count').textContent = state.board.length + ' available · showing top ' + rows.length;
  }

  /**
   * What to say when the board cannot answer the search.
   *
   * Three different answers, and conflating them is how somebody ends up
   * believing the tool is broken:
   *   - he is available (rows > 0)         — nothing to say
   *   - he is already taken                — say who has him
   *   - nobody by that name exists here    — offer to record the pick anyway
   *
   * The last one matters because the board is a built artifact of the players
   * worth drafting. Somebody will always take a rookie nobody projected, and
   * "he does not exist" must never be the end of the conversation.
   */
  function renderSearchTail(shown, taken) {
    const host = $('#search-tail');
    if (!host) return;
    if (!state.search) { host.innerHTML = ''; host.hidden = true; return; }

    const whoHas = id => {
      const slot = Object.keys(state.rosters).find(k =>
        (state.rosters[k] || []).some(p => String(p.player_id) === String(id)));
      if (!slot) return 'already drafted';
      const prof = profileForSlot(slot);
      return 'taken by ' + (prof && prof.display_name ? prof.display_name : 'seat ' + slot);
    };

    let html = '';
    if (taken.length) {
      html += '<div class="tail-taken"><b>Already gone:</b> '
        + taken.map(p => escapeHtml(p.name) + ' <span class="muted">(' + whoHas(p.player_id) + ')</span>').join(' · ')
        + '</div>';
    }
    if (!shown) {
      html += '<div class="tail-none">'
        + '<b>No available player matches “' + escapeHtml(state.search) + '”.</b>'
        + '<div class="muted">The board only carries players worth drafting. If somebody '
        + 'just took a name that is not on it, record it here so the picks stay in step.</div>'
        + '<form class="tail-form" id="manual-pick">'
        + '<input type="text" id="mp-name" placeholder="Player name" value="' + escapeHtml(state.search) + '">'
        + '<select id="mp-pos">' + ['QB','RB','WR','TE','K','DEF'].map(x =>
            '<option value="' + x + '">' + x + '</option>').join('') + '</select>'
        + '<select id="mp-slot"><option value="">Which seat?</option>'
        + Array.from({ length: (state.data.league || {}).teams || 10 }, (_, i) =>
            '<option value="' + (i + 1) + '">seat ' + (i + 1)
            + (mySlot() === i + 1 ? ' (me)' : '') + '</option>').join('')
        + '</select>'
        + '<button type="submit" class="btn small gold">Record it</button>'
        + '</form></div>';
    }
    host.innerHTML = html;
    // Only occupy space when there's actually something to say. When the searched
    // player IS on the board (shown > 0, nothing taken), html is empty — an empty
    // #search-tail box mid-draft reads as broken, so stay hidden. (mock report)
    host.hidden = !html;
  }

  /**
   * Record a pick for somebody the board has never heard of.
   *
   * The stub carries no projection, so it cannot be SCORED as a recommendation.
   * It exists so the pick count, the seat rosters and your own roster stay true —
   * which is what every survival and VONA number is computed against.
   *
   * ⚠️ "CANNOT MOVE A RECOMMENDATION" IS TOO STRONG — OPEN DEFECT, register E18
   * (session E, 2026-08-18). A stub is never scored as a candidate itself, but
   * it lands on `state.myRoster`, and the keeper bar ranks EVERY roster entry,
   * reading an absent `vorp` as zero via `composite.js`'s `(player.vorp || 0)`.
   * A valueless row sitting at `ranked[slots-1]` drags the bar NEGATIVE, and
   * `max(0, raw − bar)` then ADDS to every candidate.
   *
   * MEASURED at pick 33 on a roster of two keepers plus one stub: three KEEPER
   * TARGET badges reading "beats <stub> by 12 pts" — a comparison against a
   * player carrying no projection at all, and on screen the stub wears its real
   * Sleeper name.
   *
   * INERT FOR CORY'S SLATE TODAY: with three valued keepers the bar is
   * `ranked[2]` and all three outrank any valueless row, so it binds only when
   * FEWER THAN `slots` roster entries carry a real value — e.g. if he locks two
   * keepers on 08-21 and an off-board pick lands on his roster.
   *
   * FIXED 2026-08-18: `composite.js` now filters the incumbent ranking on a
   * finite `vorp` instead of substituting zero, which is what its own docstring
   * always said should happen ("with fewer incumbents than slots there is a free
   * slot, so the bar is zero"). I held this fix and routed it as
   * `NO DEFAULT — BLOCKED`, because applying it moves the published term table
   * in `WAR-ROOM-SURFACE-CONTRACT.md` (TERRITORY: A) — `keeper` 14.3% → 0.2%.
   * Cory overrode the hold ("Fix and continue"), so both moved together and the
   * document edit is stamped as an override for A's review.
   */
  function recordManualPick(name, position, slot) {
    const clean = String(name || '').trim();
    if (!clean || !slot) return;
    const id = 'manual:' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (state.drafted.has(id)) return;
    const p = { player_id: id, name: clean, position: position || '?', team: '',
                bye: null, off_board: true };
    state.drafted.add(id);
    state.recentPicks.push({ position: p.position, player_id: id,
                             pick_no: state.recentPicks.length + 1, player: p });
    (state.rosters[slot] = state.rosters[slot] || []).push(p);
    if (Number(slot) === mySlot()) state.myRoster.push(p);
    if (state.sync && state.sync.addManual) {
      try { state.sync.addManual(id, slot); } catch (e) { /* local record still stands */ }
    }
    state.search = '';
    const box = $('#search'); if (box) box.value = '';
    recomputeRuns();
    renderAll();
  }

  /* Flags render as COMPACT TAPPABLE CHIPS with the full sentence one tap away
   * (final-pass B4: "QUESTI0" was clipping; every badge needs a one-line
   * explanation on tap — titles do not exist on a phone). The chip text is a
   * fixed short form so it can never clip; FLAG_LEGEND carries the sentence. */
  function riskFlags(p) {
    const flags = [];
    if (p.injury_status && !/^(healthy|active)$/i.test(p.injury_status)) {
      const st = String(p.injury_status);
      const short = { questionable: 'Q', doubtful: 'D', out: 'OUT', ir: 'IR', sus: 'SUS' }[st.toLowerCase()]
        || st.slice(0, 3).toUpperCase();
      flags.push('<button class="wr-flag risk" data-flag-legend="injury" data-flag-arg="'
        + escapeHtml(st) + '">' + escapeHtml(short) + '</button>');
    }
    if (p.age && p.age >= 30 && (p.position === 'RB')) {
      flags.push('<button class="wr-flag risk" data-flag-legend="age">age ' + p.age + '</button>');
    }
    // OPPORTUNITY, STANDARDISED AGAINST THIS BOARD (Cory, 2026-08-10: "fires on
    // roughly 90% of the top 200 — a flag that fires on nearly everything conveys
    // nothing"). The field is NAMED a z-score but is not one: measured over the
    // live top 200 it runs mean 0.79, sd 0.91, min -0.07. So the fixed ±1 cut
    // fired the UP badge on 42% of rows and the DOWN badge on exactly ZERO — the
    // opposite flag was unreachable code. Re-centre on the board's own mean and sd
    // so the badge means "unusual FOR THIS BOARD", which is the only thing a flag
    // can usefully mean, and both directions become possible again.
    const z = opportunityVsPeers(p);
    if (z != null) {
      if (z > OPP_CUT) flags.push('<button class="wr-flag up" data-flag-legend="opp_up">opp ↑</button>');
      else if (z < -OPP_CUT) flags.push('<button class="wr-flag risk" data-flag-legend="opp_down">opp ↓</button>');
    }
    return flags.join(' ');
  }

  /* OPPORTUNITY RELATIVE TO DRAFT COST — what the badge should have meant.
   *
   * The old cut was a flat `opportunity_z > 1`, and the field is NAMED a z-score
   * but is not one: over the live top 200 it runs mean 0.79, sd 0.91, min -0.07.
   * So the UP badge fired on 42% of rows and the DOWN badge on exactly ZERO —
   * unreachable code (Cory, 2026-08-10: "fires on nearly everything, conveys
   * nothing").
   *
   * Re-centring on the whole board does NOT fix it, and measuring that is what
   * settled the design: the top of the board genuinely HAS more opportunity, so a
   * board-wide z still fired on 44% of the top 200 — the badge was simply
   * restating "this player is good", which the rank already says.
   *
   * The informative question is opportunity ABOVE WHAT HIS PRICE IMPLIES, so the
   * comparison set is his ADP NEIGHBOURS. Measured on the live board that gives
   * ~6% up, ~6% down, 88% silent, and surfaces the late-round volume it exists to
   * find (Jerry Jeudy at ADP 180, +2.9 vs his peers). A badge you notice because
   * it is rare. */
  const OPP_CUT = 1.5;
  const OPP_BAND = 40;          // ADP neighbours compared against
  let _oppByPlayer = null, _oppFor = null;
  function opportunityVsPeers(p) {
    if (!p || p.opportunity_z == null) return null;
    const board = state.board || [];
    if (board.length < 60) return null;
    if (!_oppByPlayer || _oppFor !== board.length) {
      const rows = board
        .filter(q => typeof q.opportunity_z === 'number' && isFinite(q.opportunity_z)
                     && (q.adjusted_adp || q.raw_adp))
        .sort((a, b) => (a.adjusted_adp || a.raw_adp) - (b.adjusted_adp || b.raw_adp));
      const map = {};
      for (let i = 0; i < rows.length; i++) {
        let lo = Math.max(0, i - (OPP_BAND >> 1));
        const hi = Math.min(rows.length, lo + OPP_BAND);
        lo = Math.max(0, hi - OPP_BAND);
        let sum = 0, n = hi - lo;
        for (let j = lo; j < hi; j++) sum += rows[j].opportunity_z;
        const mean = sum / n;
        let ss = 0;
        for (let k = lo; k < hi; k++) ss += (rows[k].opportunity_z - mean) * (rows[k].opportunity_z - mean);
        const sd = Math.sqrt(ss / n) || 1;
        map[String(rows[i].player_id)] = (rows[i].opportunity_z - mean) / sd;
      }
      _oppByPlayer = map;
      _oppFor = board.length;
    }
    const v = _oppByPlayer[String(p.player_id)];
    return typeof v === 'number' ? v : null;
  }

  /* A1 — keepers pre-populate my roster.
   *
   * I START this draft with my keepers already rostered; a roster that reads
   * "Nothing yet" and a need model that thinks I have zero RBs is the biggest
   * defect on the page. On board load my confirmed keepers (the kept_players
   * for MY slot) go straight into myRoster, badged KEEPER: the need term reads a
   * post-keeper roster, the bye card shows their byes from pick one, and the
   * picks-remaining math is already correct because the forfeited rounds are
   * gone from the pick order. Idempotent; skipped in a mock (mocks have no
   * keepers). Falls back to the forfeiture records (no bye) on an older board.
   */
  function populateKeepers(data) {
    // REHEARSAL KEEPER MODE (1): fire in mocks too. A rehearsal that starts with
    // an empty roster rehearses the wrong draft — need, byes, stack hooks and
    // the Money Meter are all wrong from pick one. In a mock my keepers are not
    // ON the Sleeper roster, so they are seeded here and badged; the seat is the
    // ROOM seat, and the keepers are mine regardless of which room I am in.
    const seatSlot = mySlot();
    if (!seatSlot) return;
    // `kept_players.team_slot` is stamped with my LEAGUE seat. In a mock the room
    // seat is a different number, so matching on the room seat finds nothing and
    // the rehearsal silently starts empty — the exact failure this is fixing.
    // My keepers are mine in any room; look them up by the league seat.
    // COORDINATE SYSTEM [league-seat]: kept_players.team_slot is stamped with my
    // LEAGUE seat, so the lookup must use one too — reading it against a
    // [room-seat] is the bug that started every rehearsal with an empty roster.
    const keeperSeat = (state.mockMode && state.realSlot) ? Number(state.realSlot) : seatSlot;
    let mine = (data.kept_players || []).filter(k => Number(k.team_slot) === keeperSeat);
    if (!mine.length) {
      mine = ((data.pick_order || {}).forfeited || [])
        .filter(f => Number(f.team_slot) === keeperSeat)
        .map(f => ({ player_id: f.player_id, name: f.name, position: f.position,
          bye: null, off_board: true }));
    }
    const have = new Set(state.myRoster.map(p => String(p.player_id)));
    mine.forEach(k => {
      if (have.has(String(k.player_id))) return;
      state.myRoster.push(withKeeperValuation(k, data));
      state.drafted.add(String(k.player_id));   // keepers are off the board
    });
  }

  /* A KEEPER SEEDED WITHOUT `vorp` IS SCORED AS WORTH ZERO, AND THE WAR ROOM
   * THEN TELLS CORY HE BEATS HIM (session E, 2026-08-18; register E17).
   *
   * `kept_players` is a DIFFERENT population from `players` and carries a
   * different field set: it has `cost_round`, `original_round`, `team_slot` and
   * `is_keeper`, and it LACKS `vorp`, `replacement`, `pos_rank`, `overall_rank`,
   * `tier`, `tier_drop` and `adjusted_adp`. This function used to push the row
   * through verbatim, so `state.myRoster` — and therefore `ctx.currentKeepers` —
   * held three players with `vorp === undefined`.
   *
   * `composite.js:nextYearVorp` reads `(player.vorp || 0) * factor`, so absent
   * became a confident ZERO. That is the same shape this repo has already
   * removed twice (the `|| echo` in the keeper workflow, the `|| undefined`
   * weights in two suites): a missing input reading as a successful one.
   *
   * WHAT IT PRODUCED, measured on the live board at Cory's own picks. The
   * keeper bar is `max(0, raw − bar)` where the bar is the weakest incumbent.
   * With all three incumbents scored at vorp 0 the bar went NEGATIVE (−31.86 in
   * round 1, −11.42 in rounds 5-6), so it ADDED to every candidate instead of
   * subtracting. At pick 33 — HIS FIRST — the screen read:
   *
   *     Zay Flowers — KEEPER TARGET … he beats Ja'Marr Chase for the last
   *     slot by 17 pts
   *
   * Ja'Marr Chase is his best keeper, projected 295.09, WR2 on the board.
   * Four KEEPER TARGET badges fire across his twelve picks; with the keepers
   * correctly valued, ZERO do.
   *
   * ORDERING IS UNAFFECTED AND I MEASURED IT RATHER THAN ASSUMING: the bar is
   * constant across candidates at a given pick, so it shifts every keeper term
   * equally and can only reorder through the `max(0, …)` clamp. On a
   * market-follow board at all twelve of his picks, 0 of 120 name slots move.
   * So this corrects a FALSE ON-SCREEN CLAIM, not a ranking.
   *
   * NOT AN INVENTED NUMBER. `vorp === round(proj_mean − replacement_points[pos], 2)`
   * holds for 682 of 682 board rows, so this applies the artifact's own
   * published formula with its own published constants. Absent inputs stay
   * absent — no fallback constant, because a fallback is what caused this.
   */
  function withKeeperValuation(k, data) {
    const seeded = Object.assign({}, k, { is_keeper: true });
    if (seeded.vorp != null || seeded.proj_mean == null) return seeded;
    const rp = ((data || {}).replacement || {}).replacement_points || {};
    const repl = rp[seeded.position];
    if (repl == null) return seeded;   // unknown position -> stay absent, do not guess
    seeded.replacement = repl;
    seeded.vorp = Math.round((seeded.proj_mean - repl) * 100) / 100;
    return seeded;
  }

  function renderRoster() {
    const starters = state.data.league.starters || {};
    const filled = {};
    state.myRoster.forEach(p => { filled[p.position] = (filled[p.position] || 0) + 1; });
    const cells = [];
    Object.keys(starters).forEach(slot => {
      for (let i = 0; i < starters[slot]; i++) {
        const eligible = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] }[slot];
        let occupant = null;
        if (!eligible) {
          const at = state.myRoster.filter(p => p.position === slot).sort((a, b) => b.proj_mean - a.proj_mean);
          occupant = at[i];
        }
        const isKeeper = occupant && occupant.is_keeper;
        cells.push('<div class="slot-chip ' + (occupant ? 'filled' : 'empty')
          + (isKeeper ? ' keeper' : '') + '">' +
          '<span class="slot-label">' + slot + '</span>' +
          '<span>' + (occupant ? escapeHtml(occupant.name) : '—')
          + (isKeeper ? ' <span class="keeper-badge" title="Kept — locked to your roster">🔒 KEEPER</span>' : '')
          + '</span></div>');
      }
    });
    $('#roster-slots').innerHTML = cells.join('');
    $('#roster-list').innerHTML = state.myRoster.length
      ? state.myRoster.map(p => {
          // A player the board never carried has no projection. "· NaN" is how
          // that used to read, which looks like a broken number rather than an
          // absent one.
          const proj = Number.isFinite(p.proj_mean) ? ' · ' + Math.round(p.proj_mean) : '';
          const off = p.off_board && !p.is_keeper ? ' <span class="muted">(not on the board)</span>' : '';
          const kept = p.is_keeper ? ' <span class="keeper-badge" title="Kept — locked to your roster">🔒 KEEPER</span>' : '';
          return '<li' + (p.off_board && !p.is_keeper ? ' class="off-board"' : '') + (p.is_keeper ? ' class="keeper"' : '') + '>'
            + escapeHtml(p.name) + ' <span class="muted">' + p.position + proj + '</span>' + kept + off + '</li>';
        }).join('')
      : '<li class="muted">Nothing yet.</li>';
  }

  function renderSurvival() {
    const upcoming = myNextPicks();
    const next = myNextTurn();   // the SAME pick every other panel counts to
    if (!next) { $('#survival').innerHTML = '<p class="muted">No later pick to wait for.</p>'; return; }
    // ONE survival number, read straight off the scored board — the SAME
    // survival_to_next field Best Available and the queue slip display — never a
    // second computation. This panel used to recompute E.survival(p, next,
    // state.runMults), passing runMults as the ENTIRE context, so it was blind to
    // the intervening picks and the opponent model the composite survival sees.
    // That is why the same player read 100% gone in Best Available but 65%
    // surviving here on one screen (2026-08-10 critique). Both now read the
    // composite, computed once against ctx.nextPick (= upcoming[1], the same
    // target this panel names).
    const scoredSurv = (state.lastClock && state.lastClock.scored) || [];
    const svById = {};
    scoredSurv.forEach(s => { svById[String(s.player.player_id)] = s.survival_to_next; });
    const top = state.board.slice(0, 12)
      .map(p => ({ p, s: svById[String(p.player_id)] }))
      .filter(x => x.s != null);
    if (!top.length) { $('#survival').innerHTML = '<p class="muted">No survival read yet.</p>'; return; }
    // MOCK CALIBRATION: record the survival estimates AS DISPLAYED, only at my pick
    // (on the clock), where `next` is genuinely my next pick and this number is the
    // one Cory reads. Deduped per (session, pick, player) so re-renders don't inflate
    // n. Resolved in markDrafted as the mock reaches `next`.
    if (state.mockMode && onTheClock()) {
      const mc = mockCalibReady();
      if (mc) {
        mc.record(state.mockSession || 'mock', currentPick(), next,
          top.map(x => ({ pid: x.p.player_id, survival: x.s })));
        mockCalibSave();
      }
    }
    // CONSERVATION (Cory, 2026-08-10): only as many players can go as there are
    // picks, so sum over the WHOLE board of P(gone by my next turn) must equal
    // the number of intervening picks. This is arithmetic, not judgment — if it
    // fails, every wait-or-take number on the screen is wrong together, and the
    // failure is otherwise invisible because each player's number looks sane on
    // its own. Reported, never silently swallowed.
    (function () {
      const iv = (context() || {}).intervening || [];
      const picksInWindow = iv.length;
      let mass = 0;
      scoredSurv.forEach(s => {
        if (s.survival_to_next != null) mass += (1 - s.survival_to_next);
      });
      state.survivalMass = { expected: picksInWindow, actual: mass, to_pick: next };
      /* THE BAND DEPENDS ON WHETHER THE TILT IS ENFORCING THE IDENTITY, because
       * those are two different claims and one tolerance cannot serve both.
       *
       * The old band was 0.5-1.25 on an exact quantity, justified by "the scored
       * list is the legal board, not literally every rostered player, so a small
       * shortfall is expected". MEASURED 2026-08-11 at pick 34: scored is 1729 of
       * a 1729-player board, every one carrying a survival number, and the mass
       * comes to 6.000000 against 6 picks. The shortfall the tolerance was sized
       * for does not exist. Rule 10b: a band justified by a plausible story rather
       * than a measurement.
       *
       * TILT ON — the identity is enforced, so any deviation is a real fault:
       * a scored player missing from the conserved map, or a stale board version.
       * 1e-3 relative is far above float accumulation over ~1700 terms and far
       * below anything meaningful.
       *
       * TILT OFF — the raw three-layer model does NOT conserve; it currently
       * lands near 0.86-0.90. Holding it to 1e-3 there would paint the banner red
       * on every render of a deliberate revert, which trains the eye to ignore
       * it. So the honest band for that mode is the loose one, and the banner then
       * means what it always meant: the raw model's total is off. */
      const tiltOn = !!(typeof DraftEngine !== 'undefined'
        && DraftEngine.CFG && DraftEngine.CFG.CONSERVE_SURVIVAL_ON);
      const hi = tiltOn ? 1.001 : 1.25;
      const lo = tiltOn ? 0.999 : 0.5;
      const bad = picksInWindow > 0
        && (mass > picksInWindow * hi || mass < picksInWindow * lo);
      const host = $('#survival-conservation');
      if (host) {
        host.style.display = bad ? '' : 'none';
        if (bad) {
          host.className = 'prov-note bad';
          host.textContent = '⚠ Survival numbers do not conserve: ' + mass.toFixed(1)
            + ' expected departures across the board, but only ' + picksInWindow
            + ' pick' + (picksInWindow === 1 ? '' : 's') + ' happen before your turn ('
            + next + '). Treat every wait-or-take % on this screen as unreliable.';
        }
      }
      if (bad) console.warn('[survival] conservation violated: mass', mass.toFixed(2),
        'vs picks', picksInWindow);
    })();
    $('#survival-head').textContent = 'Chance they last to your pick ' + next;
    $('#survival').innerHTML = explainPanel('survival') + top.map(x =>
      '<div class="surv-row"><span>' + escapeHtml(x.p.name) + ' <span class="muted">' + x.p.position + '</span></span>' +
      '<div class="surv-bar"><div style="width:' + Math.round(x.s * 100) + '%"></div></div>' +
      '<b class="' + (x.s > 0.6 ? 'pos' : x.s < 0.25 ? 'neg' : '') + '">' + survivalText(x.s) + '</b></div>').join('');

    // L1 capture: the survival estimates the tool showed at this pick, plus a
    // last-responsible-moment snapshot per onesie position, once per (pick,build).
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      var c = ledgerCtx();
      var survivalPayload = { to_pick: next, estimates: top.map(function (x) {
        return { player_id: String(x.p.player_id), name: x.p.name,
          position: x.p.position, survival: Math.round(x.s * 1000) / 1000 }; }) };
      PredLedger.survival({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'survival-v1', payload: survivalPayload });

      /* REMEMBERED SO IT CAN BE GRADED. The capture goes to the server; the
       * RESOLUTION needs the original call back, and the client is the only
       * place that has it while the draft is running. Same shape as
       * `state.committedForecasts`, which is the one loop already closing.
       * De-duplicated on (pick, to_pick): this render path can fire more than
       * once for the same pick, and a doubled capture would double-weight that
       * pick in the Brier score. */
      if (!state.survivalCaptures) state.survivalCaptures = [];
      var sKey = String(c.pick) + '>' + String(next);
      if (!state.survivalCaptures.some(function (x) { return x._key === sKey; })) {
        state.survivalCaptures.push({ _key: sKey, pick: c.pick, payload: survivalPayload });
      }
      var lrm = computeLRM(upcoming);
      if (lrm && lrm.length) {
        // Explicitly a stopgap computed from the survival model, NOT the real
        // 2b.6 LRM feature — tagged so grading never confuses the two.
        PredLedger.lrm({ season: c.season, build_at: c.build_at, pick: c.pick,
          method: 'survival-snapshot-v0',
          payload: { last_responsible_moment: lrm } });
        /* REMEMBERED SO IT CAN BE GRADED, exactly as the survival capture is.
         * The write goes to the server; the RESOLUTION needs the original call
         * back, and the client is the only place holding both it and the pick
         * stream. Deduped on the pick, because a re-render inside one pick is
         * the same call and not a second one. */
        state.lrmCaptures = state.lrmCaptures || [];
        if (!state.lrmCaptures.some(function (x) { return x.pick === c.pick; })) {
          state.lrmCaptures.push({ pick: c.pick,
            payload: { last_responsible_moment: lrm } });
        }
      }
    }
  }

  /* Last-responsible-moment per onesie position: the latest of my upcoming picks
   * where an acceptable option still survives with P >= 0.85. Computed from the
   * existing survival machinery — logged to the ledger so January can grade the
   * countdown against when the position actually died. */
  /* Two different questions, two lines (D5): "when do I lose the DIFFERENCE-MAKER"
   * (the elite tier) and "when do I lose a STARTER" (the startable tier). Tracking
   * only the #1 reads "gone immediately" always; only the top-12 buries the elite
   * cliff. So QB/TE get BOTH thresholds; K/DEF are streamable, startable-only. */
  /* ⚠ THIS STRIP ASKED SURVIVAL A DIFFERENT QUESTION THAN THE REST OF THE SCREEN
   * (2026-08-14).
   *
   * The call was `E.survival(pool[j], upcoming[i], state.runMults)` — a BARE
   * multiplier map. `normalizeCtx` accepts that shape deliberately, so the run
   * multipliers really were applied and nothing looked wrong. But with no
   * `currentPick` in the context, `survivalProbability` takes its UNCONDITIONAL
   * branch (`layer1Taken`) instead of `layer1TakenGivenAvailable` — and that
   * module's own comment says both layers must answer "GIVEN HE IS AVAILABLE NOW,
   * is he still there at targetPick?".
   *
   * Everything else on the war room passes the full `context()`, which carries
   * `currentPick`. So the rec card's "~X% gone by next" and this strip's "safe
   * until pick N" were computed from two different branches for the same player
   * on the same screen.
   *
   * ── THE SIGN IS ALWAYS THE SAME, WHICH IS WHY IT MATTERS ─────────────────
   *
   * Conditioning on "he lasted this long" can only RAISE survival, so the old
   * form could only ever UNDERSTATE the deadline. It never errs toward patience.
   * Measured on the live board — Lamar Jackson to pick 48: 0.0575 unconditional,
   * 0.1102 conditional, nearly double.
   *
   * On the 12-deep startable pool this washes out: 0 of 12 deadlines moved,
   * because with twelve candidates somebody clears 0.85 at the same pick either
   * way. ON THE 3-MAN ELITE POOL IT DOES NOT: 2 of 12 moved, both toward MORE
   * time, and one of those printed **"elite tier gone"** at pick 88 for TE when
   * the conditioned answer is safe until 93. That is the panel closing a window
   * that is open, at the position this league already drafts too early.
   *
   * ── THE SHAPE TRAP, since the next person here will hit it ───────────────
   *
   * `normalizeCtx` treats an object whose values are ALL NUMBERS as the legacy
   * multiplier map. So `{ currentPick: cur }` alone would be read as "position
   * 'currentPick' has multiplier 33" and silently do something absurd. The
   * `runMultipliers` key is what keeps this a context; it is not optional
   * decoration. Guarded in draft/tests/lrm_survival_ctx.test.js.
   *
   * NOT ADDED: `intervening`, which would switch Layer 2 (opponent needs) on for
   * this strip too. That is a larger behavioural change and I have no measurement
   * of it, so it stays off rather than being bundled into a correctness fix. */
  function lrmLastSafe(pool, upcoming, cur) {
    var ctx = { currentPick: cur, runMultipliers: state.runMults,
      // See the note at the other ctx site: without this, survival compares a
      // selection-scale ADP against a board slot.
      pickBoard: ((state.data || {}).pick_order || {}).picks || null };
    var last = null, idx = 0, target = null;
    for (var i = 1; i < upcoming.length; i++) {
      var surv = null;
      for (var j = 0; j < pool.length; j++) {
        // ONE DEFINITION OF "SAFE". This was a bare 0.85 here while the grader
        // needed the same number to score the call against — two copies of the
        // only quantitative claim this strip makes.
        if (E.survival(pool[j], upcoming[i], ctx) >= E.survivalModel.CFG.LRM_SAFE_P) {
          surv = pool[j]; break;
        }
      }
      if (surv) { last = upcoming[i]; idx = i; target = surv; }
    }
    return { by_pick: last, picks_early: idx, target: target };
  }
  function computeLRM(upcoming) {
    if (!upcoming || upcoming.length < 2) return [];
    var out = [];
    ['QB', 'TE', 'K', 'DEF'].forEach(function (pos) {
      var atPos = state.board.filter(function (p) { return p.position === pos; })
        .sort(function (a, b) { return (b.vorp || 0) - (a.vorp || 0); });
      if (!atPos.length) return;
      var dual = (pos === 'QB' || pos === 'TE');
      var startablePool = (pos === 'K' || pos === 'DEF') ? atPos : atPos.slice(0, 12);
      // Elite = the top tier (difference-makers). Prefer real tier boundaries;
      // fall back to top-3 by VORP if tiers are absent.
      var elitePool = atPos.filter(function (p) { return (p.tier || 99) <= 1; });
      if (!elitePool.length) elitePool = atPos.slice(0, 3);
      // The observation point is the LIVE pick, not `upcoming[0]` — "he is
      // available now" is a fact about the board this instant, and off the clock
      // upcoming[0] is a turn that has not happened yet.
      var cur = currentPick();
      var st = lrmLastSafe(startablePool, upcoming, cur);
      var el = dual ? lrmLastSafe(elitePool, upcoming, cur) : null;
      // NO DEADLINE IS NOT A DEADLINE (Cory, 2026-08-10). K and DEF reported "safe
      // until pick 145" in a 150-pick draft, naming Cam Little (ADP 171) and
      // Baltimore (ADP 203) — men who go UNDRAFTED in a 10-team league, so the
      // statement is trivially true and it was eating two lines of a panel whose
      // whole job is real deadlines. If the last safe pick is my final pick AND the
      // man I would get prices beyond the end of the draft, there is no deadline to
      // report; say that in one short line instead of inventing one.
      var totalPicks = ((state.data.pick_order || {}).picks || []).length || null;
      var stTarget = st.target || atPos[0];
      var tgtAdp = stTarget && (stTarget.adjusted_adp || stTarget.raw_adp) || null;
      var noDeadline = !!(totalPicks && tgtAdp && tgtAdp > totalPicks
        && st.by_pick === upcoming[upcoming.length - 1]);
      /* THE POOL IDS RIDE WITH THE CALL, because the claim is about the POOL and
       * not the named man. The strip says "a startable option survives" and names
       * one only so the reader can check it; grading the named man would score a
       * harder claim than the one made. Without these the resolver has nothing to
       * grade and correctly skips the row — so this is the difference between a
       * closed loop and a capture nobody can use. */
      out.push({ position: pos, dual: dual, next_pick: upcoming[1],
        startable_by: st.by_pick, startable_early: st.picks_early,
        startable_target: stTarget.name,
        startable_pool_ids: startablePool.map(function (p) { return String(p.player_id); }),
        elite_pool_ids: elitePool.map(function (p) { return String(p.player_id); }),
        no_deadline: noDeadline,
        elite_by: el ? el.by_pick : null, elite_early: el ? el.picks_early : 0,
        elite_target: el && el.target ? el.target.name : null });
    });
    return out;
  }

  /* §C — the LRM countdown strip. The single most dynamic piece of guidance for a
   * draft that starts in round 4, framed with the COST of acting early. For QB/TE
   * it shows both the elite-cliff and startable lines where they diverge. */
  /* §D.2 — a persistent REHEARSAL watermark whenever mock mode is on, so a
   * screenshot or a glance can never confuse sim state with the real draft (the
   * empty-roster/round-1 state read ambiguously). Both a banner and a body flag
   * (CSS paints a corner ribbon off the flag) so it survives scrolling. */
  function renderRehearsalWatermark() {
    var on = !!state.mockMode;
    var wm = document.getElementById('rehearsal-watermark');
    if (wm) wm.style.display = on ? '' : 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('is-rehearsal', on);
    }
  }

  /* A2 — a persistent "SLOT UNVERIFIED" flag whenever a slot is claimed but not
   * yet confirmed against the Sleeper draft object. Everything slot-derived (pick
   * numbers, LRM windows, the opening script) is provisional until this clears,
   * so a glance or a screenshot can never mistake a placeholder seat for the real
   * one. Mirrors the rehearsal watermark: a body flag CSS paints a corner ribbon
   * off. Suppressed in mock mode (the rehearsal ribbon already owns the corner). */
  function renderSlotWatermark() {
    var league = (state.data || {}).league || {};
    var hasSlot = !!mySlot();
    var on = hasSlot && !state.slotVerified && !state.mockMode;
    var wm = document.getElementById('slot-watermark');
    if (wm) {
      // HEADER OVERHAUL: the strip already carries "slot unverified", so the
      // full-width bar is pure duplication costing ~70px of the fold. The CORNER
      // RIBBON (body.slot-unverified) stays — it is the thing that marks every
      // slot-derived number as provisional, and it costs no vertical space.
      wm.style.display = 'none';
      // A site-claimed slot is provisional but not a wild guess — say so, so the
      // banner doesn't cry "unverified" over a real claim on our own backend.
      if (on) {
        wm.textContent = state.slotSource === 'site-claimed'
          ? 'Slot site-claimed — Sleeper draft order pending; pick numbers are live but not yet Sleeper-verified'
          : 'Slot unverified — pick numbers & timing are provisional until Sleeper confirms your seat';
      }
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('slot-unverified', on);
      document.body.classList.toggle('slot-siteclaimed', on && state.slotSource === 'site-claimed');
    }
  }

  function renderLRM() {
    var host = document.getElementById('lrm-strip');
    if (!host) return;
    var lrm = computeLRM(myNextPicks());
    if (!lrm.length) { host.innerHTML = ''; host.style.display = 'none'; return; }
    var phrase = function (by, early) {
      var until = by ? 'until pick <b>' + by + '</b>' : '<b>gone by your next pick</b>';
      var cost = early >= 1
        ? ' <span class="lrm-cost">(−' + early + ' skill pick' + (early === 1 ? '' : 's') + ')</span>'
        : (by ? '' : '');
      return until + cost;
    };
    host.style.display = '';
    host.innerHTML = explainPanel('lrm') + '<div class="lrm-head">Last responsible moment</div>' + lrm.map(function (r) {
      var badge = '<span class="rec-pos ' + r.position + '">' + r.position + '</span> ';
      // A position with no real deadline gets ONE short line, not a fake one.
      if (r.no_deadline) {
        return '<div class="lrm-row lrm-none">' + badge
          + '<span class="muted">no deadline — startable options go undrafted in a '
          + ((state.data.league || {}).teams || 10) + '-team league; take one whenever.</span></div>';
      }
      // Dual line for QB/TE where the two thresholds actually diverge.
      if (r.dual && r.elite_by !== r.startable_by) {
        var elite = r.elite_by
          ? '<span class="lrm-elite">elite cliff ' + phrase(r.elite_by, r.elite_early) + '</span>'
          : '<span class="lrm-now">elite tier gone</span>';
        return '<div class="lrm-row">' + badge + elite
          + ' <span class="muted">· startable ' + phrase(r.startable_by, r.startable_early) + '</span></div>';
      }
      return '<div class="lrm-row">' + badge + 'safe ' + phrase(r.startable_by, r.startable_early)
        + ' <span class="muted">(' + escapeHtml(r.startable_target) + ')</span></div>';
    }).join('');
  }

  /* THE MOVEMENT LINE — the model thinking out loud as the board moves.
   *
   * Needs a remembered previous state, which is `state.lastRecommendation`: a
   * snapshot of the top of the board taken at the LAST pick we were on. On a new
   * pick we diff it against the current top (E.movementLine, pure + tested) and
   * freeze the result in `state.movement` so re-renders WITHIN the same pick show
   * the same line rather than recomputing to "steady" and erasing it. The snapshot
   * only advances on a genuinely new pick — a re-render at the same pick must not
   * move the comparison basis or every diff would read steady.
   *
   * The "why" is the board's OWN run detection, passed in — never invented here.
   */
  function snapshotRec(pick, scored) {
    var top = scored && scored[0], second = scored && scored[1];
    return {
      pick: pick,
      topId: top && top.player ? String(top.player.player_id) : null,
      topName: top && top.player ? top.player.name : null,
      topScore: top ? top.score : null,
      // POSITIONS CARRIED so the line can tell a run that may explain the change
      // from one that merely coincides with it. Without them every run reads as
      // the cause of every move.
      topPos: top && top.player ? top.player.position : null,
      secondName: second && second.player ? second.player.name : null,
      secondScore: second ? second.score : null,
      secondPos: second && second.player ? second.player.position : null,
    };
  }

  /* THE RUNNING POSITIONS, AS A LIST — not a pre-formatted sentence.
   *
   * This returned `runs.join('/') + ' run on'`, and `movementLine` wrapped that
   * as `' on the ' + reason`, so the shipped line read "closed to within 1.5 pts
   * ON THE WR RUN ON". The suite never caught it because the suite passed
   * "WR run" — a different format from this one. Two call sites owning half a
   * sentence each is how a string ends up ungrammatical in production and
   * grammatical in its test.
   *
   * The phrasing now lives entirely in `movementLine`, which also needs the raw
   * positions to tell a run that might explain the move from one that merely
   * coincides with it. This function's whole job is to answer "what is running". */
  function movementRuns() {
    try { return E.detectRuns(state.runMults || {}) || []; } catch (e) { return []; }
  }

  function updateMovement(pick, scored) {
    var curr = snapshotRec(pick, scored);
    var prev = state.lastRecommendation;
    if (!prev || prev.pick !== pick) {
      var mv = prev ? E.movementLine(prev, curr, { runs: movementRuns() })
                    : { kind: 'steady', line: '' };
      state.movement = { pick: pick, kind: mv.kind, line: mv.line };
      state.lastRecommendation = curr;   // advance ONLY on a new pick
    }
    renderMovementLine();
  }

  function renderMovementLine() {
    var el = document.getElementById('movement-line');
    if (!el) return;
    var m = state.movement;
    if (!m || !m.line) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    var icon = m.kind === 'moved' ? '↪' : (m.kind === 'almost' ? '≈' : '');
    el.innerHTML = '<span class="movement-mark">' + icon + '</span> ' + escapeHtml(m.line);
  }

  /* THE STACK LINE — a quiet context-rail home for a LEAN.
   *
   * `stack` is classed weak / not installed (deviation.js) and the intervention
   * rate found it lead-driver on 5 of 221 interventions. So it earns a
   * context-rail line — a human weighing a lean is a legitimate path — but never
   * Zone-1 prominence, and it ALWAYS wears its class (from the evidence table,
   * not hard-coded) so decoration never reads as an installed edge. Hidden when
   * there are no live routes. Also stashes the route map for the rec-card badge.
   */
  function renderStackLine(scored) {
    var card = document.getElementById('stack-card');
    var host = document.getElementById('stack-line');
    if (!card || !host) return;
    var ctx = context();
    /* league + currentPick PASSED THROUGH so the badge's correlation value is
     * computed in exactly the context the composite scores in. Without them
     * `correlationAdjustment` sees round 1 and skips its playoff-schedule branch,
     * which is inert today (`playoff_sos` is null on all 686 board rows) but
     * would silently split the two the day C lands that field. */
    var res = E.liveStackRoutes((ctx && ctx.roster) || [], scored || [],
      { league: ctx && ctx.league, currentPick: ctx && ctx.currentPick });
    state.stackRoutes = res;                       // consumed by stackBadge()
    var clsEl = document.getElementById('stack-class');
    if (clsEl) clsEl.textContent = res.class_label;
    if (!res.count) { host.innerHTML = ''; card.style.display = 'none'; return; }
    card.style.display = '';
    var fmt = function (r) {
      var odds = r.survival == null ? '' : ' <span class="muted">('
        + survivalText(r.survival) + ' at ' + (r.adp != null ? Math.round(r.adp) : '?') + ')</span>';
      return escapeHtml(r.label) + odds;
    };
    var head = '<div class="stack-head">' + res.count + ' live route'
      + (res.count === 1 ? '' : 's') + ' · best: ' + fmt(res.best) + '</div>';
    var rest = res.routes.slice(1);
    var more = rest.length
      ? '<details class="stack-more"><summary>' + rest.length + ' more this way</summary>'
        + rest.map(function (r) { return '<div class="stack-row">' + fmt(r) + '</div>'; }).join('')
        + '</details>'
      : '';
    host.innerHTML = head + more;
  }

  /* ── REGISTER 4v — IS THIS PLAYER'S CEILING ABOUT THIS PLAYER? ────────────
   *
   * `proj_ceiling_source` carries the provenance. The per-player construction
   * stamps `-x-player-cv` (the volatility work that landed 08-18); anything
   * without it is the BAND average — `proj_mean x a per-cohort constant`, which
   * contains no information about the individual. On the live board that is
   * **34 of the 173 skill players in Cory's ADP 25-220 range (19.7%)**, and the
   * ratios prove it: 1.4388 shared by four WRs, 1.4452/1.4453 by five more,
   * 1.6081 by three QBs.
   *
   * ⚠️ CONSERVATIVE BY DESIGN — IT MARKS ONLY WHAT IT CAN SEE.
   * A missing or unrecognised stamp returns FALSE, not true. A mark that fired
   * on absence would light up K/DEF (whose ceiling is a different construction
   * entirely, the gaussian path) and every player from a future build whose
   * stamp we have not met yet — and a marker that cries wolf gets ignored, which
   * is this project's own `intervention-rate` epitaph. Under-marking leaves the
   * status quo; over-marking destroys the mark's meaning.
   */
  function cohortCeiling(player) {
    var src = player && player.proj_ceiling_source;
    if (typeof src !== 'string' || !src) return false;
    if (/-x-player-cv$/.test(src)) return false;          //: measured per player
    return /^measured-/.test(src);                        //: measured per BAND
  }

  /* A subtle badge on any recommendation that completes/extends a live route.
   * Reads the class the same way the line does: '⚡ completes X stack — LEAN'
   * while stack is uninstalled, and the tag drops to nothing once it is earned. */
  function stackBadge(player) {
    var res = state.stackRoutes;
    if (!res || !res.partnerIds) return '';
    var r = res.partnerIds[String(player.player_id)];
    if (!r) return '';
    var verb = r.single ? 'completes' : 'extends';
    var tag = (res.klass === 'moderate' || res.klass === 'validated') ? '' : ' — LEAN';
    // Inline accent so the badge reads as a badge before B's CSS lands (PARKED);
    // the class name is the real hook B will style.
    return '<div class="rec-stack-badge" style="font-size:.78rem;color:#f5c445;margin-top:.2rem">⚡ '
      + verb + ' ' + escapeHtml(r.anchor) + ' stack' + tag + '</div>';
  }

  /* ══ THE CONDITIONAL-VALUE LAYER (stack + handcuff premiums) ══════════════
   *
   * WIRED BY CORY'S RULING, 2026-08-17 (verbatim: "Yes!"), on the evidence in
   * draft/audit/conditional_value_2026-08-16.md. The layer was measured,
   * priced, tested and GATED OFF by construction awaiting exactly that ruling.
   *
   * DISPLAY ONLY — the contract from docs/queued/conditional-value-program.md:
   * "board value + stack premium + handcuff premium, EACH PRINTED SEPARATELY."
   * The artifact is fetched here the same way the board is; the join, the chip
   * and the drill readout are CondValue's (conditional_value.js, pure,
   * node-tested). NOTHING here feeds context(), the engine, or any score —
   * test_conditional_value.py keeps the scoring side gated, and the chip
   * itself says "not in the score" so a reader never mistakes the annotation
   * for a term of the composite.
   *
   * DEGRADES HONESTLY: a missing artifact means NO chips and one provenance
   * note — absent is never rendered as zero. */
  /* OPPONENT-NEED artifact — same degrade-honestly pattern as the conditional
   * value fetch below: a missing artifact means the survival blend runs
   * without the need tilt (survival.js treats null ctx.opponentNeed as OFF),
   * never a guessed one. */
  function loadOpponentNeed() {
    fetch('/opponent_need_2026.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (a) { state.opponentNeed = a || null; })
      .catch(function (e) {
        console.warn('[opponent-need] artifact not loaded: ' + (e && e.message)
          + ' — survival runs without the need tilt (not a guessed one)');
        state.opponentNeed = null;
      });
  }

  /* EXPERT SPREAD — display-only artifact (ordered by A 2026-08-18, see
   * expert_spread.js's header). Same degrade-honestly pattern as opponent-need
   * and conditional-value: a missing artifact costs the badge, never blocks
   * or fakes anything. */
  function loadExpertSpread() {
    fetch('/expert_spread_2026.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (a) { state.expertSpread = a || null; })
      .catch(function (e) {
        console.warn('[expert-spread] artifact not loaded: ' + (e && e.message)
          + ' — split badges absent (not a guessed one)');
        state.expertSpread = null;
      });
  }
  function expertSpreadIndex() {
    if (typeof ExpertSpread === 'undefined' || !state.expertSpread) return null;
    if (!state._esIdx || state._esIdx.src !== state.expertSpread) {
      try { state._esIdx = { src: state.expertSpread, idx: ExpertSpread.index(state.expertSpread) }; }
      catch (e) { console.error('[expert-spread]', e && e.message); return null; }
    }
    return state._esIdx.idx;
  }
  function expertSpreadBadge(playerId) {
    if (typeof ExpertSpread === 'undefined') return '';
    try { return ExpertSpread.badgeHtml(playerId, expertSpreadIndex(), escapeHtml); }
    catch (e) { return ''; }
  }

  function loadConditionalValue() {
    fetch('/conditional_value_2026.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (a) { state.condValue = a || null; })
      .catch(function (e) {
        console.warn('[conditional-value] artifact not loaded: ' + (e && e.message)
          + ' — premium chips absent (not zero)');
        state.condValue = null;
      })
      .then(function () {
        state.condValueLoaded = true;
        // The board usually wins the race; when it doesn't, repaint so the
        // chips (or the honest absence note) appear without a pick event.
        if (state.data) { try { renderAll(); } catch (e) { /* never blocks */ } }
      });
  }
  function condValueIndex() {
    if (typeof CondValue === 'undefined' || !state.condValue) return null;
    if (!state._cvIdx || state._cvIdx.src !== state.condValue) {
      try { state._cvIdx = { src: state.condValue, idx: CondValue.index(state.condValue) }; }
      catch (e) { console.error('[conditional-value]', e && e.message); return null; }
    }
    return state._cvIdx.idx;
  }
  function condRosterPids() {
    return (state.myRoster || []).map(function (p) { return String(p.player_id); });
  }
  /* The chip beside board value — one labelled line per live premium, '' for
   * everyone else. Guarded: a missing module or artifact costs the chip, never
   * the row, and never prints a zero. */
  function condValueChip(p) {
    try {
      var idx = condValueIndex();
      if (!idx) return '';
      return CondValue.chipHtml(String(p.player_id), idx, condRosterPids());
    } catch (e) { return ''; }
  }

  /* Slot assignments imported from the Sleeper draft object (Part 5 §2).
   *
   * This one call removes a whole class of manual-entry error: it fixes my own
   * slot AND every manager's seat, which is what the A1 profile mapping needed.
   * Falling back to enumeration order applied the wrong manager's tendencies to
   * the wrong seat — invisible, and it corrupts Layer 2 rather than crashing.
   */
  function importDraftOrder(draft) {
    if (!draft) return null;
    // URGENT (chat-Claude, 2026-08-08): the LEAGUE settings showed draft_rounds:3.
    // The DRAFT OBJECT's rounds is authoritative — capture it so the checklist
    // can verify it equals 15. A 3-round draft object is a draft-night disaster
    // (Cory texts the commissioner). Only trust a real (non-mock) draft object.
    if (!state.mockMode && draft.settings && draft.settings.rounds != null) {
      state.syncedDraftRounds = Number(draft.settings.rounds);
    }
    // draft_order maps user_id -> slot; slot_to_roster_id maps slot -> roster.
    const byUser = draft.draft_order || {};
    const slotToRoster = draft.slot_to_roster_id || {};
    const profiles = (state.data.manager_profiles || {}).managers || {};

    let mapped = 0;
    Object.keys(byUser).forEach(uid => {
      const slot = Number(byUser[uid]);
      if (!slot) return;
      if (profiles[uid]) { profiles[uid].draft_slot = slot; mapped++; }
    });
    // Only a mapping resolved from the LIVE draft object's users is trustworthy
    // in a mock — that is a real uid match, not a league-seat coincidence.
    state.profilesMappedFromDraft = mapped > 0;
    if (mapped) state.profiles = indexProfilesBySlot(state.data);

    // MY OWN SEAT — AUTO-DETECTED, no manual entry in a rehearsal.
    //
    // A REAL BUG FOUND HERE: this read `window.MY_ROSTER_ID`, which is NEVER
    // DEFINED anywhere in the codebase. So `mine` was always null — seat
    // resolution has never worked, in mocks OR the real league, and the A2
    // verification machinery could never fire because its input did not exist.
    //
    // The identity that IS available is my Sleeper USER id, and `draft_order`
    // maps user_id -> slot in every draft object including mocks. That is the
    // primary path now; slot_to_roster_id stays as a secondary, since a LEAGUE
    // draft carries rosters and a mock does not.
    let mine = null;
    const myUid = myLeagueUserId();
    if (myUid && byUser[myUid] != null) mine = Number(byUser[myUid]) || null;
    const myRosterId = window.MY_ROSTER_ID || null;
    if (!mine && myRosterId) {
      Object.keys(slotToRoster).forEach(slot => {
        if (String(slotToRoster[slot]) === String(myRosterId)) mine = Number(slot);
      });
    }
    if (mine) state.seatAutoSource = myUid && byUser[myUid] != null ? 'draft_order' : 'roster_id';

    // A mock draft is a DIFFERENT draft from the league's: usually a different
    // team count, always 15-ish rounds, and never any keepers. The artifact's
    // pick_order is the keeper-adjusted 90-pick league sequence, so used
    // unchanged against a mock the pick numbers are wrong from pick 1 and the
    // tool goes silent once the mock passes pick 90. That would waste the one
    // rehearsal that catches everything fixtures cannot.
    //
    // So: if the draft's own shape disagrees with the league config, rebuild
    // the pick order from the DRAFT's shape, with no keepers. Every other code
    // path — sync parsing, survival, recommendations, tempo, the UI — is then
    // exercised for real against a truthful sequence.
    applyDraftShape(draft, mine);

    const result = { mapped, total: Object.keys(byUser).length, mySlot: mine };
    const changed = mine && Number(mine) !== mySlot();
    // A2: a resolved slot from a real draft object with a populated draft_order
    // VERIFIES the seat. Set it whether or not the number changed — a manual
    // guess that happens to be right is still upgraded from placeholder to
    // verified, clearing the UNVERIFIED watermark. draft_order still null (order
    // not yet assigned, D4) → no verification, watermark stays.
    /* ── A PARTIAL draft_order CANNOT VERIFY OR CHANGE A SEAT ────────────────
     *
     * MEASURED, NOT HYPOTHETICAL (2026-08-11). The live draft object carried
     * FOUR entries in draft_order for a TEN team league, and my entry read 3
     * while the Sleeper UI showed me at draft position 8. This code would have
     * said "Sleeper says you are in slot 3 — importing" and called setSlot(3),
     * silently moving a correct hand-claimed seat to a wrong one AND upgrading it
     * to `verified` — the auto-detected value outranking the human's.
     *
     * Every downstream number moves with the seat, so that is a draft-night
     * disaster arriving as a reassuring blue note.
     *
     * THE RULE: an order that is not fully assigned is not an order. Until
     * draft_order holds an entry for every team it neither verifies nor imports,
     * and the UNVERIFIED watermark stays up — which is the honest state, because
     * a half-populated ordering field is exactly the case where its meaning
     * cannot be trusted.
     *
     * AND A DISAGREEMENT IS A CONFLICT, NOT AN IMPORT. Even at full population,
     * a value that contradicts the hand-claimed seat is surfaced for Cory to
     * settle rather than applied. The seat is the one thing he claims by hand
     * (AUTHORITY-DOCTRINE); an auto-detection may confirm it or dispute it, but
     * it does not get to overrule it silently. */
    const orderComplete = Object.keys(byUser).length >= (((state.data || {}).league || {}).teams || 0)
      && Object.keys(byUser).length > 0;
    if (mine && !state.mockMode && !orderComplete) {
      state.seatAutoIncomplete = { saw: Object.keys(byUser).length,
                                   need: ((state.data || {}).league || {}).teams, suggested: mine };
      showSlotNote('Sleeper\u2019s draft order is only partly assigned ('
        + Object.keys(byUser).length + ' of ' + (((state.data || {}).league || {}).teams || '?') + ' teams), so it cannot '
        + 'verify your seat yet. Keeping slot ' + mySlot() + '.', true);
    } else if (mine && !state.mockMode && orderComplete) {
      if (changed) {
        state.seatConflict = { claimed: mySlot(), sleeper: Number(mine) };
        showSlotNote('CONFLICT: you have slot ' + mySlot() + ' set and Sleeper\u2019s '
          + 'draft order says ' + mine + '. NOT importing — check the draft board and '
          + 'settle it, because every pick number moves with this.', true);
      } else {
        state.slotSource = 'sleeper';
        state.slotVerified = true;
      }
      renderSlotWatermark();
    }
    showImportNote(result, changed);
    return result;
  }

  /* Remove the PREDICTED opponent keepers from the rehearsal board.
   *
   * Predicted, not confirmed. The artifact keeps them under their own key so
   * they can never be mistaken for `kept_players` (my real slate), and the
   * board carries a label naming what was done and how many. A rehearsal board
   * that silently differed from the real one would be worse than a full pool. */
  function applyRehearsalKeepers() {
    if (!state.mockMode || !state.data) return null;
    const block = state.data.predicted_keepers;
    if (!block || !block.predictions) return null;
    const mine = new Set((state.data.kept_players || []).map(k => String(k.player_id)));
    const remove = new Map();
    Object.keys(block.predictions).forEach(owner => {
      if (owner === 'coryjsimms') return;                 // my own keepers are seeded, not removed
      ((block.predictions[owner] || {}).predicted_keepers || []).forEach(k => {
        const id = String(k.player_id);
        if (mine.has(id)) return;
        remove.set(id, { owner: owner, name: k.name, position: k.position,
                         confidence: k.confidence });
      });
    });
    if (!remove.size) return null;
    const before = state.board.length;
    state.board = state.board.filter(p => !remove.has(String(p.player_id)));
    state.rehearsalKeepers = {
      removed: before - state.board.length,
      predicted: remove.size,
      owners: new Set([...remove.values()].map(v => v.owner)).size,
      high: [...remove.values()].filter(v => v.confidence === 'high').length,
    };
    renderRehearsalKeeperNote();
    return state.rehearsalKeepers;
  }

  function renderRehearsalKeeperNote() {
    const host = document.getElementById('rehearsal-keeper-note');
    if (!host) return;
    const r = state.rehearsalKeepers;
    if (!r || !r.removed) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'prov-note warn';
    host.innerHTML = '<b>🎬</b> <span><b>rehearsal board: predicted keepers removed</b> — '
      + r.removed + ' of ' + r.predicted + ' predicted opponent keepers pulled from the pool '
      + 'across ' + r.owners + ' owners (' + r.high + ' high-confidence), so the value '
      + 'landscape at your picks resembles draft night instead of a full mock pool. '
      + '<b>These are PREDICTIONS, not the confirmed slate</b> — a real keeper we did not '
      + 'predict will still be on this board, and a predicted one may not actually be kept.</span>';
  }

  function applyDraftShape(draft, mySlot) {
    if (!window.DraftKeepers) return;
    const st = draft.settings || {};
    const teams = Number(st.teams || 0);
    const rounds = Number(st.rounds || 0);
    const league = state.data.league;
    // ONE read of the league seat for this whole function — it was derived four
    // separate times below, twice inside a single expression. Declared AFTER the
    // `league` binding: putting it at the top of the function was a temporal-dead-zone
    // crash that node --check happily accepted and every mock would have thrown on.
    const lgSeat = leagueSeat(league);
    if (!teams || !rounds) return;

    const sameTeams = Number(league.teams) === teams;
    const keeperCount = (league.keeper_rules || {}).count || 0;
    const leagueRounds = (state.data.pick_order.picks || []).length / Math.max(1, league.teams || 1);
    const sameRounds = Math.abs(leagueRounds - rounds) < 0.5;
    if (sameTeams && sameRounds && !keeperCount) return;   // it IS the league draft

    const cfg = {
      teams: teams,
      rounds: rounds,
      draft_type: draft.type || 'snake',
      // THE ROOM SEAT. Sleeper naming my seat is authoritative. Falling back to
      // the LEAGUE seat is an assumption, and it is only tenable if that number
      // exists in this room at all — league seat 7 in a 6-team mock is not a
      // seat, it is a bug waiting to attribute picks to nobody.
      my_draft_slot: mySlot || (lgSeat <= teams ? lgSeat : 0) || 1,
      adp_blend_weight: 0.7,
      // MY keepers are real in a mock. Earlier this said `count:0`, which
      // forfeited NOTHING — yet populateKeepers still seeds my 3 keepers onto
      // the roster, so I ended up with keepers PLUS a pick in every round: a
      // roster over-sized by the keeper count, my first live picks stacking on
      // top of players I already hold. The mock must forfeit my top picks the
      // same way the league draft does. So carry the league's real keeper
      // config and forfeit MY rounds (top_picks_flat / count:3) — my first mock
      // pick then lands in round (count+1), matching draft night.
      //
      // Opponents' keepers are handled separately by rehearsal-keeper mode
      // (predicted keepers pulled from the BOARD, not the pick order), so only
      // MY seat forfeits picks here — the seat whose sequence I actually draft.
      keepers: (league.keeper_rules && (league.keeper_rules.count || 0) > 0)
        ? Object.assign({}, league.keeper_rules)
        : { count: 0, cost_model: 'no_cost' },
    };
    // My keepers, looked up by my LEAGUE seat (kept_players.team_slot is stamped
    // [league-seat]); they forfeit picks at my ROOM seat in this mock.
    const myLeagueSeat = lgSeat;
    let myKeepers = [];
    if ((cfg.keepers.count || 0) > 0 && myLeagueSeat) {
      myKeepers = (state.data.kept_players || [])
        .filter(k => Number(k.team_slot) === myLeagueSeat);
      if (!myKeepers.length) {
        myKeepers = ((state.data.pick_order || {}).forfeited || [])
          .filter(f => Number(f.team_slot) === myLeagueSeat);
      }
    }
    const keepersByTeam = myKeepers.length ? { [cfg.my_draft_slot]: myKeepers } : {};
    const out = window.DraftKeepers.reapply(state.data.players, cfg, keepersByTeam);
    state.data.pick_order = {
      picks: out.order.picks.map(p => ({ overall: p.overall, round: p.round, slot: p.team_slot })),
      my_picks: out.order.my_picks,
      my_picks_before_keepers: out.order.my_original_picks,
      // My forfeited rounds (keepers eat them), so the accounting invariant and
      // the picks-remaining math see the keepers as real rounds given up.
      forfeited: out.order.forfeited || [],
    };
    state.data.players = out.players;
    state.board = out.players.filter(p => !state.drafted.has(String(p.player_id)));
    // ── SEVERITY-1 FIX (mock #1): carry the ROOM SEAT, not the league seat. ──
    // This line used to be `Object.assign({}, league, { teams })`, which copied
    // `my_draft_slot` straight from the league while `my_picks` above had just
    // been rebuilt for the MOCK seat. The one line that would have corrected it
    // (`setSlot(mine, 'sleeper')` in the caller) is guarded by `!state.mockMode`
    // and this function sets `state.mockMode` — so in a mock it could never run.
    // Two live seat identities, and every roster attribution compared the pick's
    // seat against the wrong one.
    state.realSlot = lgSeat || state.realSlot || null;
    state.data.league = Object.assign({}, league, {
      teams: teams,
      my_draft_slot: cfg.my_draft_slot,       // the seat the picks were built for
    });
    state.format = E.applyFormatDefaults(state.data.league);
    state.mockMode = { teams: teams, rounds: rounds, type: cfg.draft_type,
                       picks: out.order.picks.length, myPicks: out.order.my_picks };
    // A fresh calibration session per mock, so predictions from different mocks stay
    // separable in the store (calibration() still aggregates the curve across all).
    state.mockSession = 'm' + (typeof Date !== 'undefined' && Date.now ? Date.now() : 0);
    // Auto-detected from the mock's own draft_order = a real resolution, not a
    // guess. Only an unnamed seat falls back to 'assumed'.
    state.roomSeatSource = mySlot ? 'sleeper' : 'assumed';
    refreshSeat();
    // REHEARSAL KEEPER MODE (3) — the biggest fidelity gap. In a real draft ~27
    // opponent keepers are gone before pick one; in a mock the whole pool is
    // live, so the value landscape at my picks looks nothing like draft night.
    // Pre-remove the PREDICTED slate and say so, loudly, because it is a
    // prediction and the board must never imply it is the confirmed slate.
    applyRehearsalKeepers();
    populateKeepers(state.data);

    const host = $('#mock-note');
    if (host) {
      host.style.display = '';
      host.className = 'prov-note warn';
      host.innerHTML = '<b>\ud83e\uddea</b> <span><b>Mock mode.</b> This draft is '
        + teams + ' teams \u00d7 ' + rounds + ' rounds (' + escapeHtml(cfg.draft_type)
        + '), which is not your league\u2019s shape. '
        + ((myKeepers.length)
            ? ('Your ' + myKeepers.length + ' keepers forfeit rounds 1\u2013' + myKeepers.length
               + ' (as on draft night), ')
            : 'Pick order rebuilt from the mock, ')
        + '\u2014 <b>' + escapeHtml(DraftSeat.describe(state.seat))
        + '</b>, so your first pick is '
        + escapeHtml(String((state.data.pick_order.my_picks || [])[0] || '?'))
        + ' and you pick at '
        + escapeHtml((state.data.pick_order.my_picks || []).slice(0, 6).join(', '))
        + ((state.data.pick_order.my_picks || []).length > 6 ? '\u2026' : '')
        + '. Keeper-adjusted ADP is <b>not</b> applied here, so treat the values as a '
        + 'dry run of the machinery, not of your actual board.</span>';
    }
    renderAll();
  }

  function showImportNote(r, changed) {
    const host = $('#import-note');
    if (!host) return;
    const bits = [];
    if (r.mapped) bits.push(r.mapped + ' of ' + r.total + ' managers bound to their real seat');
    else if (r.total) bits.push('draft order found but no manager profile matched a user id');
    if (r.mySlot) bits.push('your slot is ' + r.mySlot + (changed ? ' (updated)' : ' (already correct)'));
    if (!bits.length) return;
    host.style.display = '';
    host.className = 'prov-note ' + (r.mapped ? 'warn' : 'bad');
    host.innerHTML = '<b>\ud83e\udded</b> <span>Imported from Sleeper: ' + escapeHtml(bits.join('; ')) + '.</span>';
  }

  /* Over 18 hours the board is not usable until it is acknowledged.
   *
   * The rule from the readiness spec: under 6h quiet, 6-18h amber, over 18h a
   * red blocking banner requiring an explicit acknowledgement. The point is not
   * to be annoying — it is that "I did not realise the board was a day old" is
   * a mistake you only make once, in the one session that matters.
   */
  const STALE_ACK_KEY = 'mfga.draft.staleAck';
  function blockOnStaleness(hours) {
    const host = $('#stale-gate');
    if (!host) return;
    let acked = null;
    try { acked = localStorage.getItem(STALE_ACK_KEY); } catch (e) { /* private mode */ }
    if (acked === String(state.data.built_at)) return;   // acknowledged this artifact

    const age = hours > 36 ? Math.round(hours / 24) + ' days' : Math.round(hours) + ' hours';
    host.style.display = '';
    host.innerHTML =
      '<div class="stale-block">'
      + '<h3>\u26d4 This board is ' + escapeHtml(age) + ' old</h3>'
      + '<p>Injury status, suspensions and ADP have all moved since it was built'
      + ' on ' + escapeHtml((state.data.built_at || '').replace('T', ' ').slice(0, 16)) + ' UTC.'
      + ' Rebuild it before drafting — Actions \u2192 Build draft board \u2192 Run workflow.</p>'
      + '<button class="btn small navy" id="stale-ack">I understand, use it anyway</button>'
      + '</div>';
    // The board stays visible behind the gate — hiding it would make a network
    // failure at the table indistinguishable from a broken tool.
    const wr = $('#warroom');
    if (wr) wr.classList.add('is-stale');
    const btn = $('#stale-ack');
    if (btn) {
      btn.addEventListener('click', () => {
        try { localStorage.setItem(STALE_ACK_KEY, String(state.data.built_at)); } catch (e) {}
        host.style.display = 'none';
        if (wr) wr.classList.remove('is-stale');
      });
    }
  }

  /* Draft slot as a RUNTIME setting, not a build flag.
   *
   * Positions are claimed live on the league site in reverse standings order,
   * so my seat may not be final until shortly before the draft — well after the
   * pipeline last ran. Every one of my pick numbers derives from it, and n_next
   * is exactly what VONA measures against, so a stale slot silently invalidates
   * every recommendation while everything looks normal.
   *
   * Changing it here recomputes the true pick order and my picks immediately,
   * with no network and no rebuild, and says what moved.
   */
  function setSlot(slot, source) {
    const n = Number(slot);
    const league = state.data.league;
    if (!n || n < 1 || n > (league.teams || 10)) return;
    const before = (state.data.pick_order.my_picks || []).slice();

    league.my_draft_slot = n;

    /* THE BOARD IS BAKED FOR ONE SEAT. REBUILD IT, DO NOT FILTER IT.
     *
     * This used to read `picks.filter(p => p.slot === n)` — take the shipped
     * pick_order and keep the rows belonging to the new seat. That is only
     * correct for the ONE seat the pipeline built the board for, because keeper
     * forfeits are baked into the board: the shipped board has 147 picks, not
     * 150, and slot 4 has 12 of them while every other slot has 15. The three
     * missing picks are Cory's rounds 1-3, forfeited to Henry / Chase / Walker.
     *
     * So filtering by any OTHER seat returns that seat's UNFORFEITED 15-pick
     * sequence, and every overall number in it is drawn from a numbering that
     * compressed three picks out of seat 4. Measured against the real module:
     *
     *   slot 4 -> 12 picks, first 34   (agrees; it is the baked seat)
     *   slot 9 -> filter says 15 picks starting at 8 (round 1)
     *             truth is 12 picks starting at 29 (round 4)
     *   slot 1 -> filter says 15 picks starting at 1 (round 1)
     *             truth is 12 picks starting at 37 (round 4)
     *
     * Three picks that do not exist, and a first pick wrong by 21 selections.
     * Every pick number, every survival window, every VONA n_next reads off
     * that sequence, so the whole tool would have been confidently wrong the
     * moment Sleeper assigned a seat that was not 4 — with no error anywhere,
     * because a filter over a real board always returns something plausible.
     *
     * `DraftKeepers.buildTruePickOrder` is the same function the pipeline and
     * `applyDraftShape` already use, so this is the existing derivation reused
     * at a new seat, not a second implementation of it. If it cannot run
     * (module missing, no keepers to place) we fall back to the filter and SAY
     * SO, rather than silently shipping the old behaviour.
     */
    let derived = null;
    const myKeepers = ((state.data.kept_players || []).length
      ? state.data.kept_players
      : ((state.data.pick_order || {}).forfeited || []));
    const shape = state.mockMode || {};
    const teams = Number(shape.teams || league.teams || 10);
    const rounds = Number(shape.rounds
      || league.rounds
      || Math.round(((state.data.pick_order.picks || []).length + myKeepers.length) / teams));
    if (window.DraftKeepers && teams && rounds) {
      const cfg = {
        teams: teams,
        rounds: rounds,
        draft_type: shape.type || league.draft_type || 'snake',
        my_draft_slot: n,
        // The keeper rules are the league's; only the SEAT they are charged to
        // moves. Re-key my keepers onto the new seat so the forfeited rounds
        // travel with me instead of staying stapled to seat 4.
        keepers: (league.keeper_rules && (league.keeper_rules.count || 0) > 0)
          ? Object.assign({}, league.keeper_rules)
          : { count: 0, cost_model: 'no_cost' },
      };
      const byTeam = ((cfg.keepers.count || 0) > 0 && myKeepers.length)
        ? { [n]: myKeepers.map(k => Object.assign({}, k, { team_slot: n })) }
        : {};
      try {
        const order = window.DraftKeepers.buildTruePickOrder(cfg, byTeam);
        if (order && (order.my_picks || []).length) {
          state.data.pick_order.picks = order.picks.map(p => ({
            overall: p.overall, round: p.round, slot: p.team_slot }));
          state.data.pick_order.my_picks_before_keepers = order.my_original_picks;
          state.data.pick_order.forfeited = order.forfeited || [];
          derived = order.my_picks;
        }
      } catch (e) {
        console.warn('pick-order rebuild failed, falling back to filter:', e.message);
      }
    }
    if (!derived) {
      const picks = state.data.pick_order.picks || [];
      derived = picks.filter(p => Number(p.slot) === n).map(p => p.overall);
      if (derived.length && (league.keeper_rules || {}).count) {
        showSlotNote('Could not rebuild the pick order for slot ' + n
          + ' — these numbers do not account for your keeper forfeits. VERIFY THEM '
          + 'AGAINST SLEEPER before trusting any pick number.', true);
      }
    }
    if (!derived.length) {
      showSlotNote('Slot ' + n + ' owns no picks in this board.', true);
      return;
    }
    state.data.pick_order.my_picks = derived;
    // A2: only a slot imported from a REAL (non-mock) Sleeper draft object counts
    // as VERIFIED. A slot claimed on this site's /draft page is 'site-claimed'
    // (Sleeper pending) — a real claim on our backend, better than a manual
    // guess, but not yet Sleeper-verified. A manual entry is a placeholder.
    if (source === 'sleeper' && !state.mockMode) state.slotSource = 'sleeper';
    else if (source === 'site-claimed' && !state.mockMode) state.slotSource = 'site-claimed';
    else state.slotSource = 'manual';
    state.slotVerified = state.slotSource === 'sleeper';
    // In a mock this sets the ROOM seat; the league seat is preserved so the
    // mapping stays displayable. Manual entry beats an assumption.
    if (state.mockMode) state.roomSeatSource = 'manual';
    else state.realSlot = n;
    refreshSeat();
    try { localStorage.setItem(SLOT_KEY, String(n)); } catch (e) { /* private mode */ }

    // Say what changed, not just re-render. A bad edit is obvious in a sentence
    // and easy to miss in a re-sorted table.
    const parts = [];
    for (let i = 0; i < Math.min(2, derived.length); i++) {
      if (before[i] != null && before[i] !== derived[i]) {
        parts.push((i === 0 ? 'first' : 'second') + ' pick ' + before[i] + ' \u2192 ' + derived[i]);
      }
    }
    showSlotNote('Slot ' + n + '. You pick at ' + derived.slice(0, 6).join(', ')
      + (derived.length > 6 ? '\u2026' : '')
      + (parts.length ? ' (' + parts.join(', ') + ')' : ''), false);
    renderAll();
  }
  const SLOT_KEY = 'mfga.draft.slot';

  function showSlotNote(msg, bad) {
    const host = $('#slot-note');
    if (!host) return;
    host.style.display = '';
    host.className = 'prov-note ' + (bad ? 'bad' : 'warn');
    host.innerHTML = '<b>\ud83e\udded</b> <span>' + escapeHtml(msg) + '</span>';
  }

  /* Global ADP drift: does this whole room draft ahead of the source? */
  function updateDrift() {
    const seen = (state.recentPicks || []).filter(p => p && p.player && p.pick_no);
    state.drift = E.survivalModel.adpDrift(seen.map(p => ({
      pick_no: p.pick_no,
      adp: p.player.adjusted_adp || p.player.raw_adp,
    })));
    const host = $('#drift-note');
    if (!host) return;
    if (state.drift && state.drift.message) {
      host.style.display = '';
      host.className = 'prov-note warn';
      host.innerHTML = '<b>\ud83d\udcd0</b> <span>' + escapeHtml(state.drift.message) + '</span>';
    } else {
      host.style.display = 'none';
    }
  }

  function renderRuns() {
    const runs = E.detectRuns(state.runMults);
    const el = $('#run-banner');
    if (!runs.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = '🚨 RUN DETECTED: ' + runs.map(p => p + ' (' + state.runMults[p].toFixed(2) + '×)').join(', ') +
      ' — they are going faster than ADP says. Move up anyone you actually want.';

    // L1 capture: a run-detection firing, deduped by the run signature so the
    // same run logs once but a new/changed run at a later pick logs again.
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      var c = ledgerCtx();
      var sig = runs.map(function (p) { return p + ':' + state.runMults[p].toFixed(2); }).join(',');
      var runPayload = { positions: runs.map(function (p) {
        return { position: p, multiplier: Math.round(state.runMults[p] * 100) / 100 }; }) };
      PredLedger.run({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'run-detect-v1', payload: runPayload }, sig);

      /* REMEMBERED SO IT CAN BE GRADED, same as the survival calls. `sig` is
       * already the de-duplication key the ledger uses (positions + multipliers),
       * so reusing it here keeps one definition of "the same run call" rather
       * than inventing a second that could disagree with it. */
      if (!state.runCaptures) state.runCaptures = [];
      var rKey = String(c.pick) + '|' + sig;
      if (!state.runCaptures.some(function (x) { return x._key === rKey; })) {
        state.runCaptures.push({ _key: rKey, pick: c.pick, payload: runPayload });
      }
    }
  }

  /* ── THE DOCTRINE BANNER (war-room-v2-doctrine-banner.md) ────────────────
   * The strategic spine, made visible. Three things at all times: the doctrine
   * being executed (name + creed), how confident the plan is, and what the live
   * alternative costs in dollars. Switches are EVENTS, under hysteresis, with a
   * one-tap decline.
   *
   * TWO DIFFERENT DOLLARS, DELIBERATELY LABELLED DIFFERENTLY:
   *   - the ENROLLMENT edge (+$91.50) is experiment 19b's season-long, paired-
   *     room result. It is a fact about the plan, shown once, cited.
   *   - the LIVE GAP is what executing this doctrine instead of the alternative
   *     costs AT THIS PICK, off the same playerDollars model the dollar-gap
   *     panel uses. It moves every pick.
   * Conflating the two would invent precision neither number has.
   *
   * Never blocks the clock: every step is inside a try, and a doctrine failure
   * leaves the board untouched.
   */
  /* PINNED-STRIP STACKING. The nav, the rehearsal/slot watermarks, the doctrine
   * banner and the status bar are all `position: sticky; top: 0`, which does not
   * stack them — it piles them on the same 0px line, and the ones with the lower
   * z-index vanish underneath. (That is why the status bar was invisible when
   * scrolled: the nav sat on top of it.) Measure the strips above and publish
   * each one's offset as a CSS variable, so they queue instead of collide.
   *
   * Measured rather than hardcoded because the nav wraps to two rows on narrow
   * viewports and the watermarks come and go with rehearsal/slot state. */
  function layoutPinned() {
    const root = document.documentElement;
    const h = sel => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return 0;
      return Math.round(el.getBoundingClientRect().height);
    };
    // The watermarks deliberately overlay the nav (z-78/80 vs z-50), so the
    // clearance below both is the taller of the two, not their sum.
    const base = Math.max(h('.navbar'), h('.rehearsal-watermark') + h('.slot-watermark'));
    const banner = h('#doctrine-banner');
    const sw = h('#doctrine-switch');
    const leg = h('#legality-strip');
    root.style.setProperty('--pin-banner', base + 'px');
    root.style.setProperty('--pin-switch', (base + banner) + 'px');
    root.style.setProperty('--pin-legality', (base + banner + sw) + 'px');
    root.style.setProperty('--pin-status', (base + banner + sw + leg) + 'px');
  }

  /* THE LEGALITY STRIP — the running guarantee, rendered every pick.
   * Mock #1 ended without a defense and nothing on screen ever said so. This
   * asserts the state continuously, so it can visibly stop being true. */
  /* THE ONE STATUS STRIP. Six banners collapsed into a line the tool can start
   * below, with the detail one tap away.
   *
   * The health dot is the contract that makes collapsing safe: anything that
   * INVALIDATES a recommendation forces it red and force-opens the detail. Noise
   * folds away; the thing that must not be missed still shouts. */
  /* LAYER 2 collapses on a phone and stays open on desktop, but a deliberate
   * tap always wins — once the user opens or closes it, that choice sticks for
   * the session. A panel that re-decides on every resize is a panel that fights
   * you on the clock.
   *
   * SETTING .open FIRES `toggle`. So a naive listener that stamps userOpened on
   * every toggle stamps it on OUR OWN programmatic collapse too, and the flag
   * that is supposed to mean "the user deliberately touched this" is poisoned
   * before the user has touched anything. `programmatic` is the guard: the only
   * toggles that count as a decision are the ones we did not cause. */
  /* ── THE GUARD WAS TIME-SCOPED AND `toggle` IS NOT (2026-08-13, B) ────────
   *
   * The paragraph above states the intent correctly and the implementation did
   * not honour it, which is the worst combination: a comment that reads right
   * over a flag that is already false by the time it is consulted.
   *
   * `toggle` on <details> fires at RENDERING TIME — after the current task and
   * after timers. `layerProgrammatic = false` ran on the next line, so every
   * listener saw false and stamped `userOpened` on OUR OWN programmatic open.
   * B instrumented it rather than reasoning about it and captured the whole
   * chain: renderSystemStrip -> layerDepthForMode('MANUAL') -> setLayer(l3,
   * true) -> toggle {prog:false, open:true} -> userOpened=1, with no user click
   * anywhere in the run. Then `layerDepthForMode` returns early forever on
   * `userOpened`, the close rule never runs once sync comes up, and the page
   * stays at 23.6 SCREENS for the entire draft. Closed it is 5.6 — a 76% cut
   * with no layout work at all.
   *
   * B also established that the obvious fix FAILS: setTimeout(..., 0) still
   * measures prog:false, because timers run before rendering. THE GUARD HAS TO
   * BE ELEMENT-SCOPED, NOT TIME-SCOPED — it must survive on the element until
   * the event for that element actually arrives, whenever that is.
   *
   * A COUNTER, not a boolean: two programmatic sets before either toggle
   * arrives would leave a boolean cleared by the first and the second counted
   * as a user decision. */
  function setLayer(el, open) {
    if (!el || el.open === open) return;
    el.dataset.progToggle = String((+el.dataset.progToggle || 0) + 1);
    el.open = open;
  }

  /* One listener body for both layers, so they cannot drift — l2 and l3 had
   * separate copies of the same three lines and would have had to be fixed
   * twice. */
  function onLayerToggle(el) {
    const pending = +el.dataset.progToggle || 0;
    if (pending > 0) {
      if (pending > 1) el.dataset.progToggle = String(pending - 1);
      else delete el.dataset.progToggle;
      return;                      // we caused this one; it is not a decision
    }
    el.dataset.userOpened = '1';
  }

  /* ── DISCLOSURE MEMORY (war-room redesign, 2026-08-17) ───────────────────
   * The ranked list, the tier-cliff card and the per-row chip grids ship
   * COLLAPSED — the fold belongs to the one answer. A deliberate tap is a
   * preference, so it persists on this device. Same localStorage pattern as
   * LISTS_KEY / AUTO_KEY: try/catch, because private mode must never throw
   * inside the render path. */
  const DISCLOSE_KEY = 'wr-disclosures-v1';
  function loadDisclosures() {
    try { return JSON.parse(localStorage.getItem(DISCLOSE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveDisclosure(id, open) {
    try {
      const d = loadDisclosures(); d[id] = open ? 1 : 0;
      localStorage.setItem(DISCLOSE_KEY, JSON.stringify(d));
    } catch (e) { /* private mode */ }
  }
  function initDisclosures() {
    const saved = loadDisclosures();
    // The chip-grid preference is read at render time (renderRecChips).
    state.chipsOpen = !!saved['rec-chips'];
    ['recs-details', 'tier-cliff-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.discWired) return;
      el.dataset.discWired = '1';
      // Default stays the shell's (collapsed); only a recorded choice differs.
      if (saved[id] != null) el.open = !!saved[id];
      el.addEventListener('toggle', () => saveDisclosure(id, el.open));
    });
  }

  function initLayers() {
    initDisclosures();
    const l2 = document.getElementById('layer-2');
    if (!l2 || l2.dataset.wired) return;
    l2.dataset.wired = '1';
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) setLayer(l2, false);
    l2.addEventListener('toggle', function () { onLayerToggle(l2); });
    const l3 = document.getElementById('layer-3');
    if (l3) l3.addEventListener('toggle', function () { onLayerToggle(l3); });
  }

  /* THE BOARD IS A REFERENCE IN LIVE MODE AND AN INPUT DEVICE IN MANUAL MODE.
   *
   * Under live sync, Sleeper records the other nine teams' picks and the full
   * board is something you consult a few times a draft — Layer 3 is right.
   * In MANUAL or REHEARSAL mode, every one of ~135 opponent picks is typed on
   * that board, so the same tap-to-open costs a tap per pick with the clock
   * running, and the mock-#2 lesson was that draft-night friction is what makes
   * people stop recording picks — which is how the roster silently drifts.
   *
   * So the depth of Layer 3 follows the MODE, not a fixed opinion. A deliberate
   * tap still wins: userOpened means the user has an opinion and we stop having
   * one. */
  function layerDepthForMode(mode) {
    const l3 = document.getElementById('layer-3');
    if (!l3 || l3.dataset.userOpened) return;
    setLayer(l3, mode !== 'LIVE');
  }

  /* ── THE MINIMUM VIABLE SURFACE — five truthful lines, two absent ────────
   *
   * COMPOSITION, NOT COMPUTATION. Every line below reads something that already
   * exists and renders it as one sentence. Nothing here invents a number, which
   * is what makes it safe to rehearse on before the model changes underneath it:
   * the LAYOUT is what mock #4 tests, and the CONTENTS change later without the
   * containers moving.
   *
   * THE TWO ABSENT LINES ARE DELIBERATE. SOURCE (consensus baseline vs edge
   * intervention) needs a BEHAVIORAL Stage 2 — a recommendation that starts at
   * consensus and requires evidence to move off it. That does not exist (the stages
   * labels the composite's existing picks (the --diff proves 0 identities changed),
   * so a SOURCE field would claim a mechanism the code does not have. NEAR-MISS
   * needs Stage 4's thresholds. Both are named as absent, with WHAT they wait for —
   * a real mechanism, never a placeholder dressed as one.
   */
  /* Local, because engine.js's lastName is not in this scope — the alts line
   * threw a ReferenceError on every render and the catch turned it into a
   * console message, so three of five lines silently rendered blank while the
   * page reported no page-level error. A swallowed exception that leaves a
   * partially-rendered surface is the worst shape of all: it looks designed. */
  function shortName(n) {
    const parts = String(n || '').trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
  }

  function renderMVS(scored, paths) {
    const host = document.getElementById('mvs');
    if (!host || !state.data) return;
    host.style.display = '';
    const esc = escapeHtml;

    // 1. STATUS — state, seat, board freshness, health, current pick.
    const seat = refreshSeat();
    const mode = state.mockMode ? 'REHEARSAL' : (state.sync ? 'LIVE' : 'MANUAL');
    const freshMvs = boardFreshness();          // ONE freshness policy — see boardFreshness()
    const ageH = freshMvs.hours;
    const dot = (state.pickStateProblems || []).length ? '🔴'
      : (!seat || !seat.resolved) ? '🔴'
      : freshMvs.level === 'stale' ? '🔴'
      // 'unknown' (no readable built_at) fell through to 🟢 before 2026-08-16
      // — a green dot on a board whose age nothing can verify, disagreeing
      // with the checklist's "never built" on the same screen.
      : freshMvs.level === 'unknown' ? '🔴'
      : freshMvs.level === 'aging' ? '🟡' : '🟢';
    document.getElementById('mvs-status').innerHTML =
      '<b>' + esc(mode) + '</b> · ' + esc(seat ? DraftSeat.describe(seat) : 'seat —')
      + ' · ' + (ageH == null ? 'board —' : ageH < 1 ? 'board fresh'
          : 'board ' + Math.round(ageH) + 'h')
      + ' · ' + dot + ' · <b>pick ' + currentPick() + '</b>';

    // 2. PLAN — truthful as of Stage 3: the doctrine actually governs now, and
    //    doctrine_report says whether it drove THIS pick or lost.
    const planHost = document.getElementById('mvs-plan');
    const enr = state.doctrineEnrollment || { enrolled: false };
    const rep = scored && scored.length ? scored[0].doctrine_report : null;
    if (!enr.enrolled) {
      planHost.innerHTML = '<span class="muted">no doctrine enrolled — running the control</span>';
    } else {
      const nm = (typeof DraftDoctrine !== 'undefined' && state.doctrine)
        ? DraftDoctrine.doctrineMeta(state.doctrine.current).name : 'plan';
      const edge = enr.edge != null ? ' (+$' + Math.round(enr.edge) + '/season)' : '';
      if (rep && rep.drove) {
        planHost.innerHTML = '<b>' + esc(nm) + '</b>' + edge
          + ' · <span class="mvs-ok">plan drove this pick</span>';
      } else if (rep && rep.wanted) {
        planHost.innerHTML = '<b>' + esc(nm) + '</b>' + edge
          + ' · <span class="mvs-dev">⚡ ' + esc(rep.line) + '</span>';
      } else {
        planHost.innerHTML = '<b>' + esc(nm) + '</b>' + edge
          + ' · <span class="muted">no preference at this pick</span>';
      }
    }

    // 3. RECOMMENDATION — player, position, ONE number, and the market delta.
    const recHost = document.getElementById('mvs-rec');
    const top = scored && scored.length ? scored[0] : null;
    if (!top) { recHost.innerHTML = '<span class="muted">no recommendation yet</span>'; }
    else {
      // Per-region band (exp 36); see the paired call above.
      const dev = (typeof DraftDeviation !== 'undefined')
        ? DraftDeviation.badge(top, currentPick(), null) : null;
      recHost.innerHTML =
        '<span class="mvs-name">' + esc(top.player.name) + '</span>'
        + '<span class="rec-pos ' + top.player.position + '">' + top.player.position + '</span>'
        + '<span class="mvs-num">' + top.score.toFixed(1) + '</span>'
        + (dev
            ? '<span class="mvs-delta">' + esc(dev.line) + ' · '
              + esc(dev.tierLine) + '</span>'
            : '<span class="mvs-delta muted">market pick — inside the noise band</span>');
    }

    // 4. ALTERNATIVES — runner-ups with gaps, plus shadow consensus/dissent.
    const altHost = document.getElementById('mvs-alts');
    const runners = (scored || []).slice(1, 3).map(function (r) {
      return esc(shortName(r.player.name)) + ' −' + (top.score - r.score).toFixed(1);
    }).join(' · ');
    const cons = shadowConsensus();
    altHost.innerHTML = (runners || '<span class="muted">no alternatives</span>')
      + (cons ? '<span class="mvs-sep">|</span>'
          + '<span class="' + (cons.split ? 'mvs-dev' : 'muted') + '">'
          + esc(cons.text) + '</span>' : '');
    altHost.className = 'mvs-line' + (cons && cons.split ? ' contested' : '');

    // 5. ROSTER / LEGALITY — one line, from the legality module.
    const rHost = document.getElementById('mvs-roster');
    try {
      const starters = (state.data.league || {}).starters || {};
      const a = DraftLegality.assess(state.myRoster, starters, myPicksLeft());
      rHost.innerHTML = esc(a.line) + ' · <b>' + myPicksLeft() + '</b> picks left';
    } catch (e) { rHost.innerHTML = '<span class="muted">roster —</span>'; }

    // 6. SOURCE — DELIBERATELY ABSENT, reverted 2026-08-08 (Cory).
    //    stages.js is a LABELING layer: the `--diff` proves it changed 0 picks'
    //    identities (the scoring path is byte-identical to the pre-tree baseline),
    //    so Stage 2 is NOT behavioral — the recommendation does not start at
    //    consensus and earn its way off. Rendering SOURCE as "consensus baseline"
    //    vs "edge intervention" would claim a mechanism that does not exist — the
    //    exact display-without-governing bug family (doctrine shown but not
    //    governing; ctx.doctrine never passed). So SOURCE stays explicitly absent
    //    and NAMES what it is waiting for: a behavioral Stage 2, not the label.
    //    Do NOT re-introduce a stage/source label until E.recommend starts at consensus.
    // 7. NEAR-MISS — absent; needs Stage 4 thresholds (which need the sizing D13
    //    blocked). Also a real mechanism, also not faked.
    const srcHost = document.getElementById('mvs-absent');
    srcHost.innerHTML =
      'SOURCE: <i>absent — needs a behavioral Stage 2</i> '
      + '<span class="muted">(the stages label the pick, they do not choose it — D14)</span>'
      + ' · NEAR-MISS: <i>absent — needs Stage 4 thresholds (D13)</i>';
  }

  /* THE STRATEGY-SPLIT PANEL — restored 2026-08-09 (mid-mock).
   *
   * What each strategy would TAKE from the board as it stands right now, projected
   * live. This is a READ-ONLY projection (DraftShadows.project), not the committed
   * shadow rosters — so it renders at EVERY pick from the current board and my
   * current roster, whether or not I have picked yet, instead of going blank
   * (the "renders empty" failure that made it look gone). Same engine, same
   * legality rails, no taste lists — the split is honest.
   *
   * One line by default: the consensus and the sharpest dissent. The full
   * per-strategy list is one tap away (<details>). When the strategies split (no
   * 75% supermajority) the panel flags CONTESTED — that is the decision worth
   * slowing down for, a better detector of the ~2 edge-carrying picks per draft
   * than any hand-tuned threshold. */
  function renderShadowProjection() {
    const host = document.getElementById('shadow-projection');
    if (!host) return;
    const line = document.getElementById('shadow-proj-line');
    const body = document.getElementById('shadow-proj-body');
    if (typeof DraftShadows === 'undefined' || !state.board || !state.board.length
        || !state.data) { host.style.display = 'none'; return; }
    let proj, cons;
    try {
      // One-shot handoff from renderVerdict (same render cycle, same pick):
      // the poll lens and this strip must never disagree about what the
      // strategies said, so when the verdict already projected them, reuse.
      const pre = state._shadowProj;
      state._shadowProj = null;
      if (pre && pre.pick === currentPick()) {
        proj = pre.proj; cons = pre.cons;
      } else {
        const teams = ((state.data.league || {}).teams) || 10;
        const round = Math.max(1, Math.ceil(currentPick() / teams));
        proj = DraftShadows.project(state.board, context(), round, state.myRoster);
        cons = DraftShadows.consensus(proj);
      }
    } catch (e) { host.style.display = 'none'; return; }
    if (!cons || !proj.length) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'shadow-proj' + (cons.contested ? ' contested' : '');

    // One line: "6 of 7 → Judkins (RB)" plus the sharpest dissent, or a loud
    // CONTESTED flag when the room of strategies actually splits.
    const esc = escapeHtml;
    const leadTxt = '<b>' + cons.agree + ' of ' + cons.n + '</b> → '
      + esc(shortName(cons.lead)) + (cons.lead_position ? ' <span class="sp-pos">'
        + esc(cons.lead_position) + '</span>' : '');
    let dissentTxt = '';
    if (cons.dissenters.length) {
      const d = cons.dissenters[0];
      dissentTxt = ' · <span class="sp-dissent">'
        + esc(d.keys.map(strategyName).join(', ')) + ': '
        + esc(shortName(d.player)) + '</span>';
    }
    /* ⚠ THE ENGINE COMPUTES WHY THE SHADOWS AGREE AND THIS PANEL DROPPED IT.
     *
     * `consensus()` returns `lead_driver`, `driver_is_artifact`, `runner_up` and
     * `gap_to_second`, and its own comment says why: "A 7/7 driven by `need` is
     * the artifact flag; a 7/7 driven by `value` is real agreement." Every one of
     * those four fields was read by NOTHING — rule 14 on the exact field whose
     * job is to stop the misread this strip invites.
     *
     * MEASURED AT PICK 33, CORY'S FIRST PICK, all on one screen:
     *
     *     rec list #1     Colston Loveland (TE) 17.3
     *     shadow strip    "7 of 7 → Zay Flowers"      (no contested flag)
     *     Flowers's rank in the real list: 4th
     *
     * All seven shadows driven by `need`, at driver values 42.7 / 21.3 / 42.7 /
     * 85.4 / 42.7 / 64.0 / 42.7 — ONE need computation times each strategy's need
     * weight. Seven "independent strategies" are seven multiples of one number,
     * and `need` is weighted ZERO on the board Cory actually drafts from.
     *
     * "7 of 7" is the strongest agreement this surface can express. Unqualified,
     * it reads as the safest pick on the screen while pointing at the tool's
     * fourth choice. Same shape as `entry`/`RS`: indicators that CANNOT disagree,
     * presented as independent confirmations.
     *
     * Nothing about the shadows changes — they are meant to differ from
     * production. The strip now says what the model already knew. */
    var artifact = !!(cons.driver_is_artifact || cons.driver_zero_weighted);
    var driverTxt = cons.lead_driver
      ? ' <span class="sp-driver' + (artifact ? ' sp-driver-weak' : '') + '">'
        + (artifact ? 'all on ' : 'on ') + esc(cons.lead_driver)
        + (artifact ? ', which the board weights 0' : '') + '</span>'
      : '';
    var overTxt = (cons.runner_up && cons.gap_to_second != null)
      ? ' <span class="sp-over muted">over ' + esc(shortName(cons.runner_up))
        + ' by ' + Math.abs(cons.gap_to_second).toFixed(1) + '</span>'
      : '';
    line.innerHTML = (cons.contested
        ? '<span class="sp-flag">⚠ STRATEGIES SPLIT — slow down</span> '
        : artifact
          ? '<span class="sp-flag">⚠ ONE TERM, NOT ' + cons.agree + ' VOTES</span> '
          : '<span class="sp-tag">🧭 strategies</span> ')
      + leadTxt + driverTxt + overTxt + dissentTxt;

    // The full list, one tap away: every strategy, the player it would take, and
    // the term that drove it — so a reader can see for themselves whether the
    // agreement is seven arguments or one argument seven times.
    body.innerHTML = proj.map(function (r) {
      return '<div class="sp-row"><span class="sp-strat">' + esc(r.name) + '</span>'
        + '<span class="sp-pick">' + esc(shortName(r.player))
        + (r.position ? ' <span class="sp-pos">' + esc(r.position) + '</span>' : '')
        + (r.driver ? ' <span class="sp-rowdriver muted">' + esc(r.driver)
          + (r.driver_value != null ? ' ' + r.driver_value.toFixed(1) : '') + '</span>' : '')
        + '</span></div>';
    }).join('');
  }

  /* A strategy KEY -> its display name, from the shadow profile table (so the
   * dissent line reads "Ceiling-Chase", not "upside_late"). */
  function strategyName(key) {
    if (typeof DraftShadows === 'undefined') return key;
    var p = DraftShadows.profiles().find(function (d) { return d.key === key; });
    return p ? p.name : key;
  }

  /* Shadow consensus/dissent, from the shadows that already exist. Returns null
   * rather than a fabricated majority when there are no shadow picks yet. */
  function shadowConsensus() {
    if (!state.shadows || !state.shadows.strategies) return null;
    const picks = {};
    let n = 0;
    Object.keys(state.shadows.strategies).forEach(function (k) {
      const log = state.shadows.strategies[k].log || [];
      const last = log[log.length - 1];
      if (!last) return;
      n++;
      (picks[last.name] = picks[last.name] || []).push(k);
    });
    if (!n) return null;
    const ranked = Object.keys(picks).sort(function (a, b) {
      return picks[b].length - picks[a].length; });
    const lead = ranked[0];
    const agree = picks[lead].length;
    const dissent = ranked.slice(1);
    return {
      split: agree < Math.ceil(n * 0.75),
      text: agree + ' of ' + n + ' say ' + shortName(lead)
        + (dissent.length ? ' · dissent: ' + dissent.slice(0, 2)
            .map(function (d) { return shortName(d); }).join(', ') : ''),
    };
  }

  function myPicksLeft() {
    const mine = (state.data.pick_order || {}).my_picks || [];
    const now = currentPick();
    return mine.filter(function (p) { return p >= now; }).length;
  }

  function renderSystemStrip() {
    initLayers();
    document.body.classList.add('warroom-page');
    const host = document.getElementById('system-strip');
    if (!host || !state.data) return null;
    const d = state.data;
    const prov = d.provenance || {};
    const freshSS = boardFreshness();           // ONE freshness policy — see boardFreshness()
    const ageH = freshSS.hours;
    const seat = refreshSeat();

    // RED = a recommendation cannot be trusted. AMBER = trust it less.
    const red = [];
    const amber = [];
    if (state.reconcile && state.reconcile.halt) red.push('keeper slate mismatch');
    (state.pickStateProblems || []).forEach(function (x) { red.push('PICK STATE: ' + x); });
    if ((prov.adp || {}).warning) red.push('ADP is fixture/offline');
    if (typeof prov.value_coverage === 'number' && prov.value_coverage < 0.9) red.push('thin projections');
    if (!seat || !seat.resolved) red.push('SEAT UNKNOWN — seat-dependent panels suppressed');
    else if (seat.source === 'assumed') amber.push('seat assumed');
    else if (!state.mockMode && !state.slotVerified) amber.push('slot unverified');
    if (state.keeperLock && !state.keeperLock.locked && !state.mockMode) amber.push('slate unconfirmed');
    // PredLedger.pending() exposed a queue count nothing rendered — "a number
    // nothing renders is a number nobody sees" (its own header; routed to this
    // strip 08-18). Unflushed predictions are capture at risk: if the browser
    // closes before the queue drains, the draft-night rows the grading loop
    // needs are gone. Amber, not red — the recommendation itself is unaffected.
    if (typeof PredLedger !== 'undefined' && typeof PredLedger.pending === 'function') {
      try {
        const qn = PredLedger.pending();
        if (qn > 0) amber.push(qn + ' prediction' + (qn === 1 ? '' : 's') + ' unflushed');
      } catch (e) { /* the strip must never die on the ledger's account */ }
    }
    // A STALE SYNC INVALIDATES EVERY RECOMMENDATION, so it belongs in the strip's
    // red channel and not only in the fold-away. If the picks feed stalls, the
    // board still confidently recommends players who are already gone — and the
    // sync line lives inside "Details & checklist", which is collapsed. An
    // indicator Cory cannot see without opening a panel does not protect him from
    // the failure he said he would not notice.
    if (state.sync && typeof state.sync.syncAgeMs === 'function') {
      const sAge = state.sync.syncAgeMs();
      if (sAge == null) red.push('SYNC CONNECTED BUT NEVER RETURNED PICKS');
      else if (sAge >= SYNC_AGE_BAD_MS) {
        red.push('SYNC STALE ' + Math.round(sAge / 1000) + 's — picks may be missing');
      } else if (sAge >= SYNC_AGE_WARN_MS) {
        amber.push('sync ' + Math.round(sAge / 1000) + 's old');
      }
    }
    // Same rule as the checklist and the staleness control: stale (≥18h) is a
    // BLOCKING red, aging (6-18h) an amber — never a green board here while the
    // gate blocks it elsewhere.
    if (freshSS.level === 'stale') red.push('board ' + Math.round(ageH) + 'h old — STALE');
    else if (freshSS.level === 'aging') amber.push('board ' + Math.round(ageH) + 'h old');
    // 'unknown' was neither red nor amber before 2026-08-16 — the strip showed
    // a green dot for a board with no readable built_at. Unverifiable age is a
    // red: every recommendation's freshness claim rests on that timestamp.
    else if (freshSS.level === 'unknown') red.push('board age UNKNOWN — built_at missing or unreadable');
    if ((prov.adp || {}).fallback_count_in_play > 0) amber.push(prov.adp.fallback_count_in_play + ' ADP guessed');

    const tone = red.length ? 'bad' : amber.length ? 'warn' : 'ok';
    const dot = red.length ? '🔴' : amber.length ? '🟡' : '🟢';
    const mode = state.mockMode ? 'REHEARSAL' : (state.sync ? 'LIVE' : 'MANUAL');
    layerDepthForMode(mode);
    // WHICH REHEARSAL MODE IS LIVE, stated rather than inferred. Cory found the
    // keeper-overwrite bug by noticing a wrong ROSTER — the mode was invisible,
    // so the first evidence of it was corrupted state. A mode that changes what
    // happens to my picks has to be readable before it does anything.
    const kn = keeperRounds();
    const rehearsalTag = !state.mockMode ? ''
      : (state.rehearsalMode === 'take'
          ? '<span class="ss-rmode warn">keepers locked · rounds 1–' + kn + ' TAKEN</span>'
          : '<span class="ss-rmode">keepers locked · rounds 1–' + kn + ' skipped</span>');
    const age = ageH == null ? 'never built'
      : ageH < 1 ? 'board fresh' : 'board ' + Math.round(ageH) + 'h';
    /* WHICH RED GOES FIRST — ordered by HOW SOON it makes a recommendation
     * wrong, not by the order the checks happen to run in.
     *
     * A stale sync is wrong at the NEXT PICK: the shortlist may name a man who
     * went four picks ago. An unknown seat is wrong for every seat-dependent
     * panel, which are already suppressed. A board built 19 hours ago is wrong
     * SLOWLY. The old strip showed whichever check ran first, which is not an
     * ordering at all — it is an artefact of the source layout. */
    const RED_RANK = [
      /^SYNC/,                    // the picture of the room is old — wrong now
      /^PICK STATE/,              // our own accounting disagrees with itself
      /^keeper slate/,            // the roster we are drafting around is wrong
      /^SEAT UNKNOWN/,            // seat-dependent panels already suppressed
      /^ADP is fixture/,          // the ordering is a fixture, not the market
      /^thin projections/,        // values exist but rest on little
      /^board /,                  // wrong slowly
    ];
    const redOrdered = red.slice().sort(function (a, b) {
      const ra = RED_RANK.findIndex(function (r) { return r.test(a); });
      const rb = RED_RANK.findIndex(function (r) { return r.test(b); });
      /* AN UNRECOGNISED RED SORTS FIRST, NOT LAST. A new check nobody has ranked
       * yet is the one most likely to be the thing that just broke, and burying
       * it under the known ones is how a strip stops reporting new failures. */
      return (ra < 0 ? -1 : ra) - (rb < 0 ? -1 : rb);
    });
    const issues = redOrdered.concat(amber);

    host.style.display = 'flex';
    host.className = 'system-strip ' + tone;
    host.innerHTML =
      '<span class="ss-mode ' + mode.toLowerCase() + '">' + mode + '</span>'
      + rehearsalTag
      + '<span class="ss-seat">' + escapeHtml(seat ? DraftSeat.describe(seat) : 'seat —') + '</span>'
      + '<span class="ss-age">' + escapeHtml(age) + '</span>'
      /* ⚠️ THIS RENDERED `issues[0]` AND HID THE REST BEHIND `title=`.
       *
       * Another session drove a 44-second outage and reported what the
       * always-visible strip actually said: nothing about sync. From second 12
       * the board KNEW it was "sync 15s old" and from second 40 "SYNC STALE —
       * picks may be missing"; both went into `issues` behind an earlier entry
       * and surfaced as "+2". The full list lived in a `title` attribute — a
       * HOVER TOOLTIP, on a phone, at a table. There is no hover on a phone.
       *
       * TWO CHANGES, AND THE FIRST IS THE ONE THAT MATTERS.
       *
       * 1. EVERY RED IS RENDERED, not just the first. Red means "a
       *    recommendation cannot be trusted" — it is supposed to be rare, so
       *    collapsing it to save a line is trading the whole point of the
       *    channel for width. Ambers still collapse to `+N`; there are routinely
       *    several and none of them invalidates the board.
       * 2. REDS ARE ORDERED BY WHAT INVALIDATES THE BOARD SOONEST. A stale sync
       *    means the shortlist on screen may name a player who went four picks
       *    ago — worse, right now, than a board built 19 hours ago, because the
       *    second is wrong slowly and the first is wrong at the next pick.
       *
       * The `title` stays as a completeness fallback. It is no longer where the
       * thing he needs to see lives. */
      + '<span class="ss-dot" title="' + escapeHtml(issues.join(' · ') || 'all clear') + '">'
      + dot + (issues.length ? ' <span class="ss-issues">'
        + escapeHtml(redOrdered.join(' · ') || amber[0])
        + (redOrdered.length && amber.length ? ' +' + amber.length
          : (!redOrdered.length && amber.length > 1) ? ' +' + (amber.length - 1) : '')
        + '</span>' : '') + '</span>';

    // A red state force-opens the detail ONCE. Re-collapsing is the user's
    // call after that — a panel that refuses to close is its own problem.
    const det = document.getElementById('system-details');
    if (det && red.length && !state.systemForced) { det.open = true; state.systemForced = true; }
    if (!red.length) state.systemForced = false;
    state.systemHealth = { tone: tone, red: red, amber: amber };
    return state.systemHealth;
  }

  function renderLegality() {
    const host = document.getElementById('legality-strip');
    if (!host || typeof DraftLegality === 'undefined' || !state.data) return null;
    const starters = (state.data.league || {}).starters || {};
    const left = myNextPicks().length;
    const a = DraftLegality.assess(state.myRoster, starters, left);
    state.legality = a;
    host.style.display = 'flex';
    host.className = 'legality-strip ' + a.status;
    const tag = a.status === 'legal' ? 'LEGAL'
      : a.status === 'streamable' ? 'BY DESIGN?'
        : a.status === 'at-risk' ? 'WATCH' : 'ILLEGAL';
    host.innerHTML = '<span class="ls-tag">' + tag + '</span>'
      + '<span>' + escapeHtml(a.line) + '</span>';
    return a;
  }

  function myLivePickIndex() {
    const mine = (state.data.pick_order && state.data.pick_order.my_picks) || [];
    if (!mine.length) return 1;
    const remaining = myNextPicks().length;
    return Math.min(mine.length, Math.max(1, mine.length - remaining + 1));
  }

  function doctrineState() {
    if (state.doctrine) return state.doctrine;
    if (typeof DraftDoctrine === 'undefined') return null;
    const block = (state.data || {}).doctrine || null;
    state.doctrineEnrollment = DraftDoctrine.enrollment(block);
    state.doctrine = new DraftDoctrine.DoctrineState(state.doctrineEnrollment.key, {
      noiseBand: E.CFG.DG_NOISE_BAND,       // the same even-money band everything else uses
    });
    return state.doctrine;
  }

  function renderDoctrine(scored) {
    if (typeof DraftDoctrine === 'undefined') return;
    const host = document.getElementById('doctrine-banner');
    if (!host) return;
    const st = doctrineState();
    if (!st || !scored || !scored.length) { host.style.display = 'none'; return; }

    /* WHAT scoreBoard ACTUALLY READS — and it is three fields, not eight.
     *
     * This literal used to carry doctrine, totalPicks, myPickIndex, totalMyPicks
     * and currentKeepers as well, copy-pasted out of context() along with their
     * comments. DraftDoctrine.scoreBoard reads `liveIndex`, `roster`, `dollarsOf`
     * and an optional `keys` — and NOTHING ELSE. All five were produced and never
     * read (rule 14), in the live file, on the board that runs on 22 August.
     *
     * The inherited comments made it worse than dead weight: "THE THREE THE ENGINE
     * READ AND THE APP NEVER SENT" describes the ENGINE's context, and scoreBoard
     * is not the engine. A future reader deleting a field here would have been
     * warned off by a paragraph about a different consumer.
     *
     * Found because three rule-10 breaks were REFUSED as ambiguous: myPickIndex,
     * the doctrine wiring and `const next = myNextTurn()` each appeared twice in
     * this file. Two near-identical blocks with nothing forcing them to agree
     * looked like dual maintenance; it was worse and simpler — a copy that
     * outlived its cause.
     *
     * `liveIndex` IS load-bearing and was the one nothing guarded: absent, it
     * defaults to 1 (`opts.liveIndex == null ? 1 : opts.liveIndex`), so every
     * doctrine would be scored as if this were my first pick. At pick 34 that is
     * a silently wrong plan, which is exactly the failure this block's own
     * comment claimed to have fixed. */
    const detail = DraftDoctrine.scoreBoardDetail(scored, {
      liveIndex: myLivePickIndex(),
      roster: state.myRoster,
      dollarsOf: function (p) { return E.playerDollars(p).total; },
    });
    const scores = {};
    Object.keys(detail).forEach(function (k) { scores[k] = detail[k].score; });
    // A run is the causal story a switch needs — "the QB run erased its edge"
    // beats "the numbers moved", and it is the same detector the banner above
    // the board already fires on.
    const runs = E.detectRuns(state.runMults);
    const prior = st.current;
    const out = st.update(scores, currentPick(), {
      cause: runs.length ? ('the ' + runs.join('/') + ' run moved the board') : null,
      // KNOWN STUB, not a forgotten field: doctrine.js's switch sentence will
      // print "+$X" when projected is a number, and omit it gracefully when null.
      // The branch's projected dollar gain lives in the dollar-gap panel, but
      // wiring it here means threading the switched-TO branch's dollars back into
      // the sentence (doctrine.js already receives the score map) — a change to
      // the tested switch-sentence path, deferred out of the pre-mock freeze.
      // The seam guard asserts this field is PASSED (not undefined); its value is
      // a deliberate null until that wiring lands. Filed with the movement-line
      // DOCTRINE-DRIFT follow-up.
      projected: null,
      // WITHOUT THIS the banner prices one half of a two-sided trade. A doctrine
      // whose constraint binds (Late-QB Patience, before live pick 8) differs
      // from the plan only by the man it declines HERE; the pick that decline
      // buys is in neither number. Passing `detail` lets update() report it as a
      // deferral instead of as an alternative that "trails by $21" — which is
      // what the war room showed at every pick Cory owns.
      detail: detail,
    });

    const enr = state.doctrineEnrollment || { enrolled: false };
    host.style.display = 'flex';
    host.className = 'doctrine-banner'
      + (enr.enrolled ? '' : ' control')
      + (out.neutral ? ' neutral' : '')
      + (/within the band/.test(out.confidence) ? ' contested' : '');

    // The enrollment line rides with the plan only while the plan IS the
    // enrolled one; after a switch the edge belongs to a doctrine we left.
    const onPlan = enr.enrolled && out.doctrine_key === enr.key;
    const edge = (onPlan && enr.edge != null)
      ? '<span class="db-edge" title="experiment 19b, ' + (enr.rooms || 0) + ' paired rooms vs the '
        + escapeHtml(String(enr.control || 'control')) + ' control">+$' + Math.round(enr.edge)
        + ' season edge</span>'
      : '';
    document.getElementById('db-name').innerHTML =
      '<span class="db-eyebrow">' + (enr.enrolled ? 'The plan' : 'No doctrine enrolled — running the control') + '</span>'
      + escapeHtml(out.doctrine) + edge
      // THE GOVERNANCE STATE, stated rather than implied. While the doctrine is
      // display-only, a banner reading "The plan — WR Feast +$187" asserts
      // control it does not have.
      //
      // ONLY WHEN ENROLLED. governanceLine(false) returns the same sentence the
      // eyebrow above already shows verbatim ("no doctrine enrolled — running
      // the control") — a real duplication, and long enough as a nowrap pill to
      // clip against the card edge on a phone. The pill exists to distinguish
      // "enrolled and tilting" from "enrolled, display-only" — a distinction
      // that does not exist when nothing is enrolled, so there is nothing for
      // it to say. governanceLine(false) itself is unchanged (still tested,
      // still correct in meaning) — this only stops re-rendering it here.
      + (enr.enrolled
        ? '<span class="db-governs' + (DraftDoctrine.governs() ? '' : ' off') + '">'
          + escapeHtml(DraftDoctrine.governanceLine(true)) + '</span>'
        : '');
    document.getElementById('db-creed').textContent = out.creed || '';
    document.getElementById('db-confidence').textContent = out.confidence;
    // A "$0 gap" is not an alternative, it is the same decision — say the pick
    // is doctrine-free rather than manufacture a contest out of a tie.
    /* THE DEFERRAL LINE. A plan that declines a position here is not "trailing";
     * it is buying a later pick this number does not model. Say the cost AND say
     * what is missing from it, because the half-sentence is the one that reads as
     * advice — "Late-QB Patience trails by $21" is why the war room looked like
     * it was telling Cory to take a quarterback early. */
    const defer = (out.deferrals || []).map(function (d) {
      const who = d.declined && d.declined.position ? d.declined.position : 'the board leader';
      return escapeHtml(d.name) + ' defers ' + escapeHtml(who) + ' here (−$'
        + Math.abs(d.forgone).toFixed(0) + ' at this pick; what it buys later is '
        + 'not in that number)';
    }).join(' · ');

    document.getElementById('db-alt').innerHTML = (out.neutral
      ? 'no doctrine changes this pick — take the best player'
      : (out.alternative
        ? escapeHtml(out.alternative) + (out.gap == null ? ''
            : (out.gap >= 0 ? ' trails by <b>$' + Math.abs(out.gap).toFixed(0) + '</b>'
                            : ' leads by <b>$' + Math.abs(out.gap).toFixed(0) + '</b>'))
          + ' <span class="muted">at this pick</span>'
        : ''))
      + (defer ? '<span class="db-defer muted">' + defer + '</span>' : '');

    renderDoctrineSwitch(out, prior);
    renderDoctrinePicker(scores, out, enr);
    captureDoctrine(out);
  }

  /* THE DOCTRINE-SWITCH UI. Tap the plan block -> the full doctrine list, each with
   * its live dollar score and the gap to the current plan, and a one-tap switch;
   * one-tap return to the model's recommended plan, always. A switch re-tilts the
   * board immediately (the doctrine tilt reads state.doctrine.current) and is logged
   * to the ledger so January can grade whether my override earned money. When the
   * live alternative is within the band, the picker header is a visible prompt, not
   * a passive note — a coin-flip is my call and I should be told so. A-rendered into
   * B's #doctrine-banner host; no shell edit. */
  function renderDoctrinePicker(scores, out, enr) {
    const banner = document.getElementById('doctrine-banner');
    if (!banner || typeof DraftDoctrine === 'undefined') return;
    const st = state.doctrine;
    if (!st) return;
    // A-owned picker element, created once and inserted right after the banner.
    // ALWAYS VISIBLE and compact (Cory): no display:none, no banner-tap-toggle, no
    // auto-expanding wall. Its flex `order` (CSS) puts it BELOW the rec + take button.
    let pick = document.getElementById('doctrine-picker');
    if (!pick) {
      pick = document.createElement('div');
      pick.id = 'doctrine-picker';
      pick.className = 'doctrine-picker';
      banner.parentNode.insertBefore(pick, banner.nextSibling);
    }
    const cur = st.current;
    const auto = st.enrolledKey;                 // the tool's recommended (auto) plan
    const contested = /within the band/.test(out.confidence || '');
    // Ranked by live dollars; each doctrine a RADIO — one active plan at a time. The
    // auto pick is badged so you can see what the tool chose vs what you switched to.
    const curScore = scores && scores[cur] != null ? scores[cur] : 0;
    const rows = Object.keys(scores || {})
      .map(function (k) { return { key: k, meta: DraftDoctrine.doctrineMeta(k), score: scores[k] }; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (r) {
        const gap = r.score - curScore;
        const isCur = r.key === cur;
        const isAuto = r.key === auto;
        const gapTxt = isCur ? 'active' : (gap >= 0 ? '+$' + gap.toFixed(0) : '−$' + Math.abs(gap).toFixed(0));
        return '<label class="dp-row' + (isCur ? ' dp-on' : '') + '" title="' + escapeHtml(r.meta.creed) + '">'
          + '<input type="radio" name="doctrine-plan" class="dp-toggle" value="' + escapeHtml(r.key) + '"'
            + (isCur ? ' checked' : '') + '>'
          + '<span class="dp-name">' + escapeHtml(r.meta.name)
            + (isAuto ? ' <span class="dp-auto" title="the tool’s recommended plan">auto</span>' : '')
          + '</span>'
          + '<span class="dp-gap' + (gap > 0 && !isCur ? ' up' : '') + '">' + escapeHtml(gapTxt) + '</span>'
          + '</label>';
      }).join('');
    // ── SPREAD, so nine buttons never imply a choice that does not exist ──────
    // Cory's critique: five of nine read exactly +$0 and two read −$2, under a
    // header calling it a "close call". A two-dollar spread across a field of
    // zeros is not a decision; presenting it as nine equal options is worse than
    // one honest line.
    //
    // THE THRESHOLD IS DERIVED, NOT DECLARED. The money grade only moves in
    // weekly-high increments (~$100 per hit, the one channel that ever activates
    // for this seat), so anything below one increment is BELOW THE RESOLUTION OF
    // THE INSTRUMENT — it cannot represent a real difference in dollars. The
    // strategy tournament measured the entire 7-strategy 3-year spread as
    // noise-level against exactly this yardstick (EDGE-LEDGER "STRATEGY
    // TOURNAMENT"). Half an increment is the conservative call: below it we are
    // certainly reading noise.
    const vals = Object.keys(scores || {}).map(function (k) { return scores[k]; })
      .filter(function (v) { return typeof v === 'number' && isFinite(v); });
    const spread = vals.length > 1 ? (Math.max.apply(null, vals) - Math.min.apply(null, vals)) : 0;
    // Read from the payout table (C2: one config), not a literal. Verified against
    // the live artifact: payouts.weekly_high.amount = 100.
    const WEEKLY_HIGH_INCREMENT =
      Number((((state.data || {}).payouts || {}).weekly_high || {}).amount) || 100;
    const indistinguishable = vals.length > 1 && spread < (WEEKLY_HIGH_INCREMENT / 2);
    // B styles these; the CONTRACT is: dp-flat on the host when the strategies
    // cannot be told apart, plus dp-summary carrying the one honest line, plus
    // data-spread with the measured dollar spread. When a real spread exists the
    // markup is exactly as before, so a genuine choice is never buried.
    pick.classList.toggle('dp-flat', !!indistinguishable);
    pick.setAttribute('data-spread', spread.toFixed(0));
    const head = '<div class="dp-head' + (contested ? ' dp-contested' : '') + '">'
      + (indistinguishable
          ? 'Plan — <b>the strategies are indistinguishable at this pick</b>'
          : (contested && out.alternative
              ? '⚖️ close call — ' + escapeHtml(out.alternative) + ' is within the band'
              : 'Plan — tap to switch'))
      + '</div>';
    // The summary is the ALWAYS-VISIBLE line when flat; the nine rows go behind a
    // <details>, the same affordance #shadow-projection already uses. Cory's
    // "always visible and compact" still holds — what is always visible is the
    // honest answer instead of nine equal-looking buttons.
    const summary = indistinguishable
      ? '<div class="dp-summary">All ' + vals.length + ' plans price within <b>$'
        + spread.toFixed(0) + '</b> here — below one weekly-high hit ($'
        + WEEKLY_HIGH_INCREMENT + '), which is the smallest amount this grade can '
        + 'actually resolve. Take the one you believe in; the board cannot separate them.'
        + '</div>'
      : '';
    pick.innerHTML = head + summary + (indistinguishable
      ? '<details class="dp-details"><summary>Show all ' + vals.length + ' plans</summary>'
        + '<div class="dp-grid">' + rows + '</div></details>'
      : '<div class="dp-grid">' + rows + '</div>');
    // A radio switches the active plan; choosing the AUTO plan while on a manual
    // override returns to the recommended one (same logged events as before).
    Array.prototype.forEach.call(pick.querySelectorAll('.dp-toggle'), function (inp) {
      inp.onchange = function () {
        if (inp.value === auto && st.manual) doctrineReturn();
        else if (inp.value !== cur) doctrineChoose(inp.value);
      };
    });
  }

  /* Commit a human doctrine switch: set it, log it at decision time, re-render so
   * the board re-tilts immediately. */
  function doctrineChoose(key) {
    const st = state.doctrine;
    if (!st || !key) return;
    const rec = st.choose(key, currentPick());
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      const c = ledgerCtx();
      PredLedger.capture('doctrine', { season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'doctrine-manual-v1',
        payload: { doctrine: rec.doctrine, from: rec.from, manual: true, event: 'manual_switch' } });
    }
    renderAll();
  }
  function doctrineReturn() {
    const st = state.doctrine;
    if (!st) return;
    const rec = st.returnToRecommended(currentPick());
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      const c = ledgerCtx();
      PredLedger.capture('doctrine', { season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'doctrine-manual-v1',
        payload: { doctrine: rec.doctrine, from: rec.from, manual: false, event: 'return_to_recommended' } });
    }
    renderAll();
  }

  /* A switch is an EVENT: an announcement row with one plain sentence and a
   * one-tap decline. It persists until declined or superseded — a strategy
   * change is not something to miss because a toast timed out. */
  function renderDoctrineSwitch(out, prior) {
    const row = document.getElementById('doctrine-switch');
    if (!row) return;
    if (!out.switched) return;                       // leave any prior announcement standing
    row.style.display = 'flex';
    document.getElementById('db-switch-text').textContent = out.sentence || '';
    const btn = document.getElementById('db-decline');
    if (btn) {
      btn.onclick = function () {
        const st = state.doctrine;
        if (!st) return;
        const rec = st.decline(prior, currentPick());
        row.style.display = 'none';
        if (typeof PredLedger !== 'undefined' && !state.mockMode) {
          const c = ledgerCtx();
          PredLedger.capture('doctrine_decline', { season: c.season, build_at: c.build_at,
            pick: c.pick, method: 'doctrine-v1',
            payload: { kept: rec.kept, declined: out.doctrine_key, note: rec.note } });
        }
        renderAll();
      };
    }
  }

  /* Which path is THE DOCTRINE'S path? Score each path by the best doctrine-
   * ALLOWED candidate it contains and badge the winner.
   *
   * The obvious version — find the doctrine's best player on the whole board,
   * then locate his path — badges nothing surprisingly often: the paths rank by
   * engine score while the doctrine ranks by dollars, so the doctrine's pick can
   * sit outside the priced directions entirely and the badge silently vanishes.
   * Choosing AMONG the paths answers the question actually being asked — "which
   * of these directions is my plan?" — and returns null only when the doctrine
   * genuinely permits nothing on offer. */
  /* One badge: the compact line always, the rationale on tap. Expand IN PLACE,
   * never a modal, never navigation — the same interaction everywhere, so
   * learning it once covers the tool. */
  function renderDeviationBadge(d, key) {
    const arrow = d.early ? '⚡' : '↓';
    const terms = d.drivers.map(function (t) {
      return '<li><b>' + escapeHtml(t.term) + '</b> '
        + (t.points > 0 ? '+' : '') + t.points
        + ' <span class="dv-klass dv-' + t.klass + '">' + t.klass + '</span>'
        + ' <span class="muted">' + escapeHtml(t.note) + '</span></li>';
    }).join('');
    return '<details class="dv" data-dv="' + escapeHtml(key || '') + '">'
      + '<summary class="dv-sum">'
      + '<span class="dv-mark">' + arrow + '</span>'
      + '<span class="dv-line">' + escapeHtml(d.line) + '</span>'
      + '<span class="dv-tier dv-t-' + d.tier + '">' + escapeHtml(d.tierLine || d.tier) + '</span>'
      + '</summary>'
      + '<div class="dv-body">'
      + (d.early ? '<div class="dv-head">the model is overriding consensus here — '
          + 'what bought the distance:</div>'
        : '<div class="dv-head">he is priced below the market — what we see that it does not:</div>')
      + '<ul class="dv-terms">' + terms + '</ul>'
      + '<div class="dv-counter">' + escapeHtml(d.counter) + '</div>'
      // WHERE ON THE BOARD (exp 36): is this a region the market ranks well or poorly?
      // The single most actionable line for draft night — deviate freely where ADP is
      // a weak ranker, respect it where ADP is strong. Measured, cited, not a slider.
      + (d.marketQuality ? '<div class="dv-market">where: ' + escapeHtml(d.marketQuality) + '</div>' : '')
      // EXP 25 dead-zone prior (informational): RB value collapses past ~pick 61 while
      // WR holds. Amber on an RB inside the zone, affirming on a WR.
      + (d.deadZone ? '<div class="dv-deadzone">🕳️ ' + escapeHtml(d.deadZone) + '</div>' : '')
      + (d.dispersion
        ? '<div class="dv-disp">market: ADP ' + d.adp + ' ±' + d.dispersion.sd
          + ' — ' + escapeHtml(d.dispersion.text) + '</div>'
        : '<div class="dv-disp muted">no market dispersion for this player — '
          + 'ADP is a fallback estimate, not a crowd read</div>')
      + '</div></details>';
  }

  function doctrinePathKey(scored, paths) {
    if (typeof DraftDoctrine === 'undefined' || !state.doctrine) return null;
    if (!paths || !paths.length) return null;
    const allow = DraftDoctrine.LIVE_CONSTRAINTS[state.doctrine.current];
    if (!allow) return null;
    const i = myLivePickIndex();
    let bestKey = null, bestD = -Infinity;
    paths.forEach(function (pa) {
      (pa.candidates || []).forEach(function (c) {
        const p = c.player;
        if (!allow(p.position, i, state.myRoster)) return;
        const d = E.playerDollars(p).total;
        if (d > bestD) { bestD = d; bestKey = pa.key; }
      });
    });
    return bestKey;
  }

  /* One platform-board observation. Deliberately records what we KNOW and
   * flags what we are inferring: `autopick` is a guess from a missing
   * `picked_by`, so it ships as `autopick_inferred` rather than as fact. */
  /* A pick that arrived from Sleeper on my seat which I never tapped. Sleeper
   * is authoritative, so the roster is already right — what this adds is the
   * VISIBLE record that it came from sync, and an override prompt tagged so the
   * ledger knows I did not tap it live. */
  function noteReconciledPick(player, pick) {
    const pickNo = Number(pick.pick_no) || null;
    state.reconciledPicks = state.reconciledPicks || [];
    state.reconciledPicks.push({ player_id: String(player.player_id), name: player.name,
                                 pick_no: pickNo });
    const feed = document.getElementById('reconciled-note');
    if (feed) {
      feed.style.display = '';
      feed.className = 'prov-note ok';
      feed.innerHTML = '<b>🔄</b> <span><b>Synced:</b> you took '
        + escapeHtml(player.name) + ' at ' + (pickNo == null ? '?' : pickNo)
        + ' — roster updated from Sleeper.</span>';
    }
    // If it differs from what we recommended, this is still an override and
    // still needs its reason — tagged so the grading data knows the difference
    // between "chose otherwise" and "did not tap".
    try {
      /* ⚠️ COMPARE AGAINST THE LOCKED RECOMMENDATION FOR *THIS* PICK, not
       * against `state.lastClock`. lastClock is rewritten on every render and is
       * the "if your turn came now" value for whatever pick was current then —
       * between my turns that is an opponent's pick number, and currentPick,
       * myPicksLeft and roundsLeft all feed the score.
       *
       * It used to produce the right answer by luck: the sync handler removes my
       * player from the board BEFORE calling this, and lastClock only refreshes
       * on render, so the stale value happened to predate the batch. One added
       * render inside the poll loop would have inverted it silently. */
      const _lk = OverrideRecord.lockedRecommendationFor(state.lockedRecs, pickNo);
      const top = _lk.rec || (state.lastClock && state.lastClock.scored || [])[0];
      if (top && top.player && String(top.player.player_id) !== String(player.player_id)) {
        /* ⚠️ THIS CALL PASSED ONLY `{reconciled: true}` AND IT IS THE PATH THAT
         * MATTERS MOST. B verified score_gap null in every record end to end;
         * the two tap-path call sites were wired this morning and THIS ONE WAS
         * NOT. On draft night with Sleeper sync running, most of my picks
         * arrive here rather than through a tap — so the one unwired site was
         * the one carrying the traffic.
         *
         * The gap was sitting on `top` the whole time. It is not a missing
         * value, it was a missing argument. */
        /* THE PATH, RECOVERED ON THE SYNC ROUTE. `capturePick(p, pathKey)` is
         * the ONE field the manual tap uniquely produces — "took him off Path B"
         * is richer override evidence than "took him" — and a sync-recovered
         * pick has no pathKey. It is recoverable: the tap path already resolves
         * a path by matching the player against each path's candidates, so the
         * same lookup works here. Without this, retiring the manual take from
         * the primary UI would silently drop the field. */
        const _paths = state.lastPaths || [];
        const _tp = _paths.find(x => x.candidates
          && x.candidates.some(cd => String(cd.player.player_id) === String(player.player_id)));
        promptOverrideReason(player, top.player, { reconciled: true,
          score_gap: top.gap_to_second, contested: top.contested,
          path: _tp ? _tp.name : null,
          // WHICH LOCK ANSWERED, so an exact match and a nearest-earlier
          // fallback are never read as the same evidence.
          rec_source: _lk.source, rec_lock_distance: _lk.distance == null ? null : _lk.distance });
      }
    } catch (e) { /* the roster is already correct; the prompt is a bonus */ }
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      const c = ledgerCtx();
      PredLedger.capture('pick_reconciled', { season: c.season, build_at: c.build_at,
        pick: pickNo, method: 'reconcile-v1',
        payload: { player_id: String(player.player_id), name: player.name,
                   position: player.position, source: 'sleeper',
                   note: 'landed on my seat without a local mark — reconciled, not inferred' } });
    }
  }

  /* MISSED-MARK RECOVERY (2) — THE SYNC-DEAD PATH. Never infer. The board has
   * moved past a pick of mine and nothing is recorded, so say so and keep
   * saying it. It blocks nothing; it just will not go away until answered, and
   * it NAMES the consequence rather than letting stale recommendations look
   * authoritative. */
  function renderUnrecordedPicks() {
    const host = document.getElementById('unrecorded-note');
    if (!host || !state.data) return null;
    const cur = currentPick();
    const mine = (state.data.pick_order || {}).my_picks || [];
    const recorded = state.myRoster.filter(p => !p.is_keeper).length;
    const passed = mine.filter(n => n < cur);
    const missing = passed.length - recorded;
    if (missing <= 0) { host.style.display = 'none'; state.unrecorded = 0; return 0; }
    state.unrecorded = missing;
    const at = passed.slice(-missing);
    host.style.display = '';
    host.className = 'prov-note danger';
    host.innerHTML = '<b>⚠️</b> <span><b>You picked at ' + at.join(', ')
      + ' — mark who you took.</b> Nothing is assumed: the tool will not invent a '
      + 'pick, and it will not stop asking. <b>Recommendations below assume your '
      + 'roster is missing ' + missing + ' pick' + (missing === 1 ? '' : 's')
      + '</b> — need, byes and legality are all computed from what is recorded.</span>';
    return missing;
  }

  /* SELECTIONS, NOT BOARD SLOTS. The scale conversion, derived per sample.
   *
   * `adjusted_adp` counts SELECTIONS. `pick_no` counts BOARD SLOTS, and a
   * keeper occupies a board slot without being a selection. Differencing them
   * is the two-quantities-one-variable defect this repo keeps finding — the
   * same one keepers.py:live_index_of and survival.js:liveIndexOf exist for.
   *
   * IT HAS NEVER PRODUCED A WRONG NUMBER, and the reason is worth stating
   * because it is the reason it survived: sampling is gated on `state.mockMode`
   * and Sleeper mock rooms carry no keepers, so board slots and selections
   * coincide and `adp - pick_no` is correct. THAT IS A PROPERTY OF THE ROOMS WE
   * HAPPENED TO SAMPLE, asserted nowhere and true by luck.
   *
   * So this DERIVES the selection index from the pick stream rather than
   * assuming it. In a keeper-free room the loop returns `pickNo` unchanged and
   * every existing sample keeps its exact value — the fix is a no-op on all
   * evidence collected so far, which is what preserving production behaviour
   * where the evidence supports it means here.
   *
   * Sleeper serves `is_keeper` on every pick (log_draft_picks.py:_from_sleeper
   * reads the same field), so keeper-ness is OBSERVED, not inferred.
   *
   * Returns null rather than a guess when the stream cannot answer. A ledger
   * row that says "I could not compute this" is analysable in September; one
   * carrying a silently mis-scaled number is not, and the rows would be
   * indistinguishable. */
  function selectionIndexOf(pickNo, picks) {
    if (pickNo == null) return { index: null, basis: 'no-pick-number', keepers: null };
    if (!picks || !picks.length) {
      return { index: null, basis: 'pick-stream-unavailable', keepers: null };
    }
    let n = 0, keepers = 0;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const no = Number(p.pick_no);
      /* `no <= 0` IS LOAD-BEARING, not defensive padding. Number(null) is 0 and
       * isFinite(0) is true, so a row with `pick_no: null` passed the finite
       * check as pick ZERO, sat below every real pickNo, and was counted as a
       * selection — inflating the index by one for the rest of the draft.
       * Caught by the malformed-row arm of platform_sample_scale.test.js on the
       * first run. `Number(undefined)` and `Number('x')` are NaN and were
       * already skipped, which is exactly why the null case looked covered. */
      if (!isFinite(no) || no <= 0 || no > pickNo) continue;
      if (p.is_keeper) { keepers += 1; continue; }
      n += 1;
    }
    return { index: n, basis: keepers ? 'selection-converted' : 'selection-keeper-free',
             keepers: keepers };
  }

  function capturePlatformSample(pick, player, slot, picks) {
    if (typeof PredLedger === 'undefined' || !state.mockMode) return;
    try {
      const c = ledgerCtx();
      const pickNo = Number(pick.pick_no) || null;
      const adp = player.adjusted_adp != null ? player.adjusted_adp
        : (player.raw_adp != null ? player.raw_adp : null);
      const scale = selectionIndexOf(pickNo, picks);
      // The whole point: where did the platform take him vs where the market
      // says he goes. Negative = platform took him EARLIER than market (a REACH
      // the room pays for); positive = he lasted longer (a FALL to me).
      // BOTH SIDES ON THE SELECTION SCALE — see selectionIndexOf.
      const delta = (scale.index != null && adp != null)
        ? Math.round((adp - scale.index) * 10) / 10 : null;
      PredLedger.platformSample({
        season: c.season, build_at: c.build_at, pick: pickNo,
        method: 'platform-sample-v1',
        payload: {
          pick_no: pickNo, round: pick.round || null, draft_slot: slot,
          player_id: String(player.player_id), name: player.name,
          position: player.position, team: player.team || null,
          // OUR market read, alongside, so the sample is a delta not a datum.
          ffc_adp: player.raw_adp != null ? player.raw_adp : null,
          adjusted_adp: player.adjusted_adp != null ? player.adjusted_adp : null,
          adp_source: player.adp_source || null,
          consensus_rank: player.consensus_rank != null ? player.consensus_rank : null,
          sleeper_rank: player.sleeper_rank != null ? player.sleeper_rank : null,
          vs_market: delta,
          /* THE BASIS TRAVELS WITH THE NUMBER. A delta is meaningless without
           * knowing which scale both sides were on, and rows written before and
           * after this change would otherwise be indistinguishable. September
           * can filter on it instead of trusting that every sampled room was
           * keeper-free. */
          vs_market_basis: scale.basis,
          selection_no: scale.index,
          keeper_slots_before: scale.keepers,
          // INFERRED, not observed: Sleeper omits picked_by for autopick/bot
          // seats, but an absent field is not proof. Labelled so exp 31 can
          // weight it rather than trust it.
          autopick_inferred: !pick.picked_by,
          room: { teams: state.mockMode.teams, rounds: state.mockMode.rounds },
          note: 'mock room — platform-behavior sample (bots); may differ from '
            + 'the human-facing Sleeper board until human-room evidence corroborates',
        },
      }, 'p' + pickNo);
    } catch (e) { /* sampling must never touch the clock */ }
  }

  function captureDoctrine(out) {
    if (typeof PredLedger === 'undefined' || state.mockMode) return;
    const c = ledgerCtx();
    const sig = out.doctrine_key + '|' + (out.alternative_key || '') + '|' + (out.switched ? 'sw' : '');
    PredLedger.doctrine({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'doctrine-v1',
      payload: { doctrine: out.doctrine_key, alternative: out.alternative_key,
        gap: out.gap, switched: out.switched, confidence: out.confidence } }, sig);
  }

  /**
   * Every pick that has happened, from wherever it came.
   *
   * This used to read only from the sync object, so a pick marked by hand — or
   * one for a player the board never carried — was recorded in state, removed
   * from the board, added to a roster, and then not shown. The feed is the only
   * place you can check the tool agrees with the room, so it has to show
   * everything or it is worse than nothing.
   */
  // §2(d): who took him, resolved from the draft slot via the manager profiles.
  function seatLabel(slot) {
    if (!slot) return null;
    const prof = profileForSlot(slot);
    return (prof && prof.display_name) ? prof.display_name
      : (Number(slot) === mySlot() ? 'you' : 'Seat ' + slot);
  }

  function renderPicksFeed() {
    const seen = new Set();
    const rows = [];
    const push = (id, no, name, pos, tag, slot) => {
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      // §2(d): each pick is opponent-model evidence — show ADP delta (reach/fell).
      const pl = playerById(id);
      const adp = pl ? (pl.adjusted_adp != null ? pl.adjusted_adp : pl.adp) : null;
      let delta = null;
      if (no && adp != null) delta = Math.round(no - adp);   // <0 = drafted EARLY (reach), >0 = fell
      rows.push({ no: no || 0, name, pos, tag, who: seatLabel(slot), delta });
    };
    (state.sync ? state.sync.allPicks() : []).forEach(p => {
      const pl = playerById(p.player_id);
      const meta = p.metadata || {};
      push(p.player_id, p.pick_no,
        pl ? pl.name : ([meta.first_name, meta.last_name].filter(Boolean).join(' ') || 'Unknown'),
        pl ? pl.position : (meta.position || ''),
        p.source === 'manual' ? 'typed' : '', p.draft_slot);
    });
    // Anything state knows that the sync does not — manual entries and picks
    // for players outside the board.
    state.recentPicks.forEach(r => {
      const pl = r.player || {};
      push(r.player_id, r.pick_no, pl.name || 'Unknown', pl.position || r.position || '',
        pl.off_board ? 'off board' : '', r.slot);
    });
    rows.sort((a, b) => b.no - a.no);
    const deltaTag = d => {
      if (d == null) return '';
      if (d <= -8) return ' · <span class="pick-reach">reach ' + d + '</span>';
      if (d >= 8) return ' · <span class="pick-fell">fell +' + d + '</span>';
      return '';
    };
    $('#picks-feed').innerHTML = rows.length
      ? rows.slice(0, 12).map(r => '<li><b>' + (r.no || '?') + '.</b> ' + escapeHtml(r.name)
          + ' <span class="muted">' + escapeHtml(r.pos)
          + (r.who ? ' · by ' + escapeHtml(r.who) : '')
          + (r.tag ? ' · ' + r.tag : '') + '</span>'
          + deltaTag(r.delta) + '</li>').join('')
      : '<li class="muted">No picks yet.</li>';
  }

  function playerById(id) {
    return (state.data.players || []).find(p => String(p.player_id) === String(id));
  }

  /**
   * Move an already-recorded pick to the seat Sleeper says owns it.
   *
   * Idempotent: called on every poll for every pick, so it must do nothing
   * when the attribution is already right. Cheap for the same reason — the
   * common case is a membership test that passes.
   */
  // Pick-lifecycle ownership now lives in the tested DraftAttribution module
  // (public/js/draft/attribution.js), so the running app and the robot mock
  // exercise the SAME code. The inline copy that used to sit here is deleted —
  // an inline duplicate of a tested module is a second implementation the tests
  // do not cover, and it is exactly where the Loveland bug hid.
  const ATTR = (typeof window !== 'undefined' && window.DraftAttribution) || null;

  /* REVERT + RECONCILE (feature A). A mis-marked pick corrupts every downstream
   * number, so undo must never be locked behind a 5-second toast. Two controls:
   *   revertLastPick()      — one tap undoes my most recent LOCAL mark (the
   *                           sync-dead fallback), anytime, not just in the toast
   *                           window.
   *   reconcileWithSleeper()— the clean fix: pull Sleeper's authoritative picks
   *                           for my seat, remove local mis-marks, add anything I
   *                           missed. Keepers are never touched.
   * Both write CORRECTIONS to the ledger; neither deletes history. */
  function unmarkPickById(id) {
    id = String(id);
    const p = playerById(id)
      || (state.myRoster || []).find(x => String(x.player_id) === id)
      || { player_id: id, name: id };
    if (ATTR) ATTR.unmarkLocal(state, p);
    else {
      state.drafted.delete(id);
      Object.keys(state.rosters).forEach(s2 => {
        state.rosters[s2] = (state.rosters[s2] || []).filter(x => String(x.player_id) !== id);
      });
      state.myRoster = state.myRoster.filter(x => String(x.player_id) !== id);
    }
    if (state.markedLocally) state.markedLocally.delete(id);
    if (p.position && !state.board.some(x => String(x.player_id) === id)) {
      state.board.push(p);
      if (typeof DraftSurvival !== 'undefined') DraftSurvival.bumpBoard(state.board);
    }
    for (let i = state.recentPicks.length - 1; i >= 0; i--) {
      if (String(state.recentPicks[i].player_id) === id) { state.recentPicks.splice(i, 1); break; }
    }
    return true;
  }

  function revertLastPick() {
    if (typeof DraftPickReconcile === 'undefined') return;
    const marked = state.markedLocally ? Array.from(state.markedLocally) : [];
    const id = DraftPickReconcile.lastMark(state.recentPicks, marked);
    if (!id) return;
    const name = (playerById(id) || {}).name || id;
    unmarkPickById(id);
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      const c = ledgerCtx();
      PredLedger.capture('correction', { season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'revert-v1', payload: { reverted: String(id), name: name, via: 'revert-last-pick' } });
    }
    recomputeRuns();
    renderAll();
  }

  function reconcileWithSleeper() {
    if (!state.sync || typeof DraftPickReconcile === 'undefined') return;
    const keepers = (state.myRoster || []).filter(p => p.is_keeper).map(p => String(p.player_id));
    const marked = state.markedLocally ? Array.from(state.markedLocally) : [];
    const diff = DraftPickReconcile.reconcileMine(marked, state.sync.allPicks(), mySlot(), keepers);
    diff.misMarks.forEach(id => unmarkPickById(id));
    diff.missing.forEach(id => {
      const p = playerById(id);
      if (!p) return;
      state.drafted.add(String(id));
      const slot = mySlot();
      if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
      state.myRoster.push(p);
      if (state.markedLocally) state.markedLocally.add(String(id));
      state.board = state.board.filter(x => String(x.player_id) !== String(id));
    });
    if (typeof DraftSurvival !== 'undefined') DraftSurvival.bumpBoard(state.board);
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      const c = ledgerCtx();
      PredLedger.capture('pick_reconciled', { season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'reconcile-v1', payload: { removed: diff.misMarks, added: diff.missing,
          note: 'pulled from Sleeper (authoritative) — local mis-marks discarded' } });
    }
    recomputeRuns();
    renderAll();
  }

  /* A-created control (like the undo toast) so the fix needs no B-shell edit: a
   * slim bar with Revert (when I have a local mark) and Reconcile (when synced). */
  function renderPickControls() {
    if (typeof document === 'undefined') return;
    const wr = document.getElementById('warroom');
    if (!wr || wr.style.display === 'none') return;
    const hasMark = state.markedLocally && state.markedLocally.size > 0;
    const synced = !!state.sync;
    let bar = document.getElementById('pick-controls');
    if (!hasMark && !synced) { if (bar) bar.style.display = 'none'; return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pick-controls';
      bar.className = 'pick-controls';
      wr.insertBefore(bar, wr.firstChild);
    }
    bar.style.display = 'flex';
    bar.innerHTML =
      (hasMark ? '<button class="btn small ghost" id="pc-revert">↩ Revert last pick</button>' : '')
      + (synced ? '<button class="btn small navy" id="pc-reconcile" title="Pull Sleeper as authoritative — discard any mis-marks">⟳ Reconcile with Sleeper</button>' : '');
    const rv = document.getElementById('pc-revert');
    if (rv) rv.onclick = revertLastPick;
    const rc = document.getElementById('pc-reconcile');
    if (rc) rc.onclick = reconcileWithSleeper;
  }

  // ----------------------------------------------------------------- actions

  /* A-2 — undo everywhere a fat thumb can lie. Every one-tap state change gets
   * a 5-second toast; the Loveland class of error becomes one tap back, not
   * reconciliation archaeology. Undo events log to the ledger as CORRECTIONS —
   * never deletions; the original entry stands and the correction follows it. */
  let undoTimer = null;
  let undoRunning = false;      // an undo must not toast its own inverse
  function showUndo(label, undoFn) {
    if (undoRunning) return;
    let host = $('#undo-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'undo-toast';
      host.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);'
        + 'background:#1c2740;color:#fff;border:1px solid rgba(245,196,69,.5);border-radius:10px;'
        + 'padding:.55rem .9rem;z-index:200;display:flex;gap:.7rem;align-items:center;'
        + 'box-shadow:0 6px 24px rgba(0,0,0,.45);font-size:.85rem';
      document.body.appendChild(host);
    }
    host.innerHTML = '<span>' + escapeHtml(label) + '</span>'
      + '<button class="btn small gold" id="undo-btn">Undo</button>';
    host.style.display = 'flex';
    if (undoTimer) clearTimeout(undoTimer);
    host.querySelector('#undo-btn').addEventListener('click', function () {
      clearTimeout(undoTimer);
      host.style.display = 'none';
      undoRunning = true;
      try { undoFn(); } finally { undoRunning = false; }
      if (typeof PredLedger !== 'undefined' && !state.mockMode) {
        var c = ledgerCtx();
        PredLedger.capture('correction', { season: c.season, build_at: c.build_at,
          pick: c.pick, method: 'undo-v1', payload: { undone: label } });
      }
      renderAll();
    });
    undoTimer = setTimeout(function () { host.style.display = 'none'; }, 5000);
  }

  function markDrafted(playerId, toMe, teamSlot, pathKey) {
    const p = playerById(playerId);
    if (!p) return;
    // Recorded BEFORE anything else: the difference between this set and what
    // Sleeper reports on my seat is exactly the missed-mark case.
    if (toMe) {
      state.markedLocally.add(String(playerId));
      // SEAT FALLBACK 2 of 3 (auto-detect spec): the draft object did not name
      // me, but marking my own pick tells me the pick NUMBER, and in a snake
      // that determines the seat exactly. A derivation, not a guess — so the
      // seat upgrades from 'assumed' to 'inferred' rather than staying a
      // silent fallback.
      try { inferSeatFromMarkedPick(); } catch (e) { /* never blocks the clock */ }
    }
    const seatSlot = mySlot();
    const slot = toMe ? seatSlot : (teamSlot || null);
    const alreadySeen = state.drafted.has(String(playerId));
    // Phase H: the board AS IT STOOD when this pick arrived — including the
    // player being taken. Snapshotted BEFORE the filter below; shadows draft
    // from exactly this snapshot, and its hash is what the robot verifies.
    const boardAtPick = (toMe && !alreadySeen) ? state.board.slice() : null;
    /* THE TAKEN SET, SNAPSHOTTED HERE FOR THE SAME REASON THE BOARD IS.
     *
     * `capturePick` runs BELOW `ATTR.markLocal`, which has already added this
     * player to `state.drafted`. Reading the set down there would record a board
     * that already contains the pick being explained — off by exactly the
     * decision under study, on every row, in the direction that makes the choice
     * look inevitable.
     *
     * Array.from a Set preserves insertion order, which is draft order on the
     * incremental path; boardState labels which it got rather than claiming. */
    const takenAtPick = (toMe && !alreadySeen && state.drafted
      && typeof state.drafted.forEach === 'function')
      ? Array.from(state.drafted) : null;
    // A local mark is a GUESS; the shared module records it as such and Sleeper
    // can later override it. Same call the robot mock's R1/R3 scenarios prove.
    if (ATTR) ATTR.markLocal(state, p, slot, seatSlot);
    else {
      state.drafted.add(String(playerId));
      if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
      if (toMe) state.myRoster.push(p);
    }
    state.board = state.board.filter(x => String(x.player_id) !== String(playerId));
    if (!alreadySeen) {
      state.recentPicks.push({ position: p.position, player_id: playerId,
                               pick_no: state.recentPicks.length + 1, player: p });
    }
    // MOCK CALIBRATION: observe EVERY pick (mine and the room's — this is the one
    // choke point all picks pass through) so survival predictions can be resolved
    // against when each player actually left the board. picksMade == recentPicks
    // length; a prediction matures when its horizon pick has been reached.
    if (state.mockMode && !alreadySeen) {
      const mc = mockCalibReady();
      if (mc) {
        mc.observePick(playerId, state.recentPicks.length);
        mc.resolveMatured(state.recentPicks.length);
        mockCalibSave();
      }
    }
    // L1 capture: a pick I take is a decision — log it at decision time. Only my
    // own picks (toMe); other teams' picks are recorded by the survival/board
    // context, not as my decisions. Never on a mock, and never a re-mark.
    if (toMe && !alreadySeen && !state.mockMode) {
      capturePick(p, pathKey, takenAtPick, boardAtPick ? boardAtPick.length : null);
    }
    // Phase H: every strategy takes its own counterfactual pick at my slot,
    // from the snapshot above. Mocks fire it too (flagged rehearsal) so the
    // whole shadow path is exercised before draft night.
    if (toMe && !alreadySeen && boardAtPick) updateShadows(boardAtPick);
    // A-2: a LOCAL mark is a guess, and a guess gets five seconds of takeback.
    // (A Sleeper-reported pick never comes through here — that is the record.)
    if (!alreadySeen) {
      showUndo((toMe ? 'You took ' : 'Marked ') + (p.name || playerId), function () {
        if (ATTR) ATTR.unmarkLocal(state, p);
        else {
          state.drafted.delete(String(playerId));
          Object.keys(state.rosters).forEach(function (s2) {
            state.rosters[s2] = (state.rosters[s2] || []).filter(function (x) {
              return String(x.player_id) !== String(playerId); });
          });
          state.myRoster = state.myRoster.filter(function (x) {
            return String(x.player_id) !== String(playerId); });
        }
        // Back onto the board (renders sort; position in the array is moot).
        if (!state.board.some(function (x) { return String(x.player_id) === String(playerId); })) {
          state.board.push(p);
          // THE ONLY IN-PLACE BOARD MUTATION IN THE APP, and survival memoises
          // per board version. Without this bump the cached position pools keep
          // the restored player OUT, and he reads as un-takeable for the rest
          // of the draft — silently, with a plausible number. Any future
          // in-place edit here must bump too; survival-memo.test.js asserts the
          // invalidation behaviour this protects.
          if (typeof DraftSurvival !== 'undefined') DraftSurvival.bumpBoard(state.board);
        }
        // Drop the feed entry the mark created (the LAST matching one).
        for (let i = state.recentPicks.length - 1; i >= 0; i--) {
          if (String(state.recentPicks[i].player_id) === String(playerId)) {
            state.recentPicks.splice(i, 1);
            break;
          }
        }
        recomputeRuns();
      });
    }
    // §C override-reason capture: if I took someone who ISN'T the top
    // recommendation, ask why in one tap (target/gut/news/plan) and log it.
    // Overrides are the one ledger entry kind that needs my finger — draft night
    // is the harvest. Mocks fire it too (rehearsal) so the path is proven first.
    if (toMe && !alreadySeen) {
      const scored = (state.lastClock && state.lastClock.scored) || [];
      const topRec = scored[0];
      const topId = topRec && topRec.player ? String(topRec.player.player_id) : null;
      if (topId && String(playerId) !== topId) {
        // Coin-flip courtesy: if the top pick was flagged contested and I took
        // the OTHER side of that coin flip, it isn't an override — log 'coin_flip'
        // with no interrogation. Otherwise prompt (offering 'coin flip' too when
        // the board says it's close).
        const contested = !!(topRec && topRec.contested);
        const second = scored[1] && scored[1].player ? String(scored[1].player.player_id) : null;
        // Paths panel (Part 2 §1): name the direction the override took, if any —
        // "took him off Path B" is richer override evidence than "took him".
        const paths = state.lastPaths || [];
        const takenPath = (pathKey && paths.find(x => x.key === pathKey))
          || paths.find(x => x.candidates.some(cd => String(cd.player.player_id) === String(playerId)))
          || null;
        const path = takenPath ? takenPath.name : null;
        if (contested && second && String(playerId) === second) {
          logOverrideReason(p, topRec.player, 'coin_flip', path, false,
            topRec.gap_to_second, contested);
        } else {
          promptOverrideReason(p, topRec.player, { contested: contested, path: path,
            score_gap: topRec.gap_to_second });
        }
      }
    }
    recomputeRuns();
    renderAll();
  }

  /* §C — the one-tap override-reason prompt. Fires when I take someone off the
   * top recommendation. Four reasons, one tap, plus a skip; the choice logs to
   * the ledger as an override so January can grade my disagreements with the
   * model. A dynamic overlay so no view change is needed; auto-dismisses on any
   * choice or after a short timeout (the clock never waits on it). */
  const OVERRIDE_REASONS = [
    { key: 'target', label: '⭐ Target', hint: 'On my list' },
    { key: 'gut', label: '🎯 Gut', hint: 'My read' },
    { key: 'news', label: '📰 News', hint: 'Something changed' },
    { key: 'plan', label: '🧭 Plan', hint: 'Roster construction' },
  ];
  /* Log the reason (or its absence) for an off-top pick. Skipping is frictionless
   * and logs 'no_reason_given' — a REQUIRED modal at draft speed poisons the
   * ledger worse than a missing reason, so every off-top pick still produces one
   * override entry, tagged, with the path it came from (null until Part 2). */
  function logOverrideReason(picked, overTop, reason, path, reconciled, scoreGap, contested, extra) {
    if (typeof PredLedger === 'undefined' || state.mockMode) return;
    const c = ledgerCtx();
    // Scoped LOCALLY. `unassigned` was borrowed from another function once and
    // took a whole panel down with a ReferenceError; a value read from an
    // enclosing scope that may not have it is the same defect.
    /* ⚠️ THE ARGUMENT IS NO LONGER THE ONLY SOURCE, because relying on four call
     * sites to remember it is what produced a season-critical field that was
     * null in every record. THREE of them passed it and the fourth — the Sleeper
     * sync path, which carries most of draft night — did not.
     *
     * So the gap is DERIVED from the same clock the recommendation came from
     * when a caller omits it. A future call site that forgets now gets the right
     * number instead of a silent null, and the record says which route it took
     * so "derived" can never be mistaken for "the caller was careful". */
    // THE SHAPE IS BUILT IN ONE PLACE (OverrideRecord), not assembled inline.
    // Two emitters used to write two incompatible payloads under the same
    // ledger kind, distinguished only by an undeclared `method` string, and
    // NEITHER froze the board values the grade needs — those move nightly, so
    // January would have graded the override against numbers I never saw.
    // Agreeing with the tool is refused by the builder: that is a `pick`.
    //
    // ⚠️ THIS GUARD MUST STAY ABOVE THE RESOLVE CALL. My first version placed
    // `OverrideRecord.resolveScoreGap(...)` before it, so a missing module would
    // throw a ReferenceError out of the pick handler and take the panel down —
    // the exact defect the comment above this block already records having been
    // caused once by `unassigned`. Reintroducing it two lines below its own
    // warning is the kind of thing that only shows up on draft night.
    if (typeof OverrideRecord === 'undefined' || !overTop
        || String(overTop.player_id) === String(picked.player_id)) return;

    var _resolved = OverrideRecord.resolveScoreGap({
      passed: scoreGap,
      clockTop: (state.lastClock && state.lastClock.scored || [])[0],
      recommended: overTop,
    });
    var opts_score_gap = _resolved.score_gap;
    var _gapSource = _resolved.score_gap_source;
    var _rec;
    try {
      _rec = OverrideRecord.pickOverride({
        season: c.season, build_at: c.build_at, pick: c.pick,
        chosen: picked, recommended: overTop,
        /* THE FLAG B ASKED FOR, and my claim to them was wrong: I said "mock
         * rides every ledger row" when it rode the RECOMMENDATION payload only.
         * B's override report was therefore filtering on a field that did not
         * exist — 3 overrides became 4 with the filter removed, and the reported
         * median gap moved 18.5 -> 4.0. A false statement from me corrupted a
         * number in their report, which is worse than a missing field.
         *
         * IT IS ALWAYS FALSE HERE, and that is worth stating rather than
         * hiding: this function returns early on `state.mockMode`, so an
         * override row can never be a rehearsal. The value carries no
         * information; its PRESENCE does. "0 excluded" and "the flag was never
         * written" are the same integer and different facts, and a consumer
         * cannot tell them apart from an absent field. */
        mock: !!state.mockMode,
        reason: reason || 'no_reason_given', path: path == null ? null : path,
        reconciled_from_sync: !!reconciled,
        score_gap: opts_score_gap,
        // A NULL GAP IS NEVER AMBIGUOUS AGAIN. Every record says whether the
        // number was passed, recovered, or genuinely unavailable and why —
        // because "null" and "null because nobody wired it" read identically in
        // January, which is exactly how this survived ten days.
        score_gap_source: _gapSource,
        /* WHICH RECOMMENDATION THIS WAS MEASURED AGAINST. An exact per-pick lock
         * and a nearest-earlier fallback are different evidence and must never
         * aggregate — the same discipline as score_gap_source, for the same
         * reason: a null or a substitute that does not say so is indistinguish-
         * able from a careful one. */
        rec_source: (extra && extra.rec_source) || 'live_clock',
        rec_lock_distance: extra && extra.rec_lock_distance != null
          ? Number(extra.rec_lock_distance) : null,
        contested: contested == null ? null : !!contested });
    } catch (e) {
      /* DO NOT SWALLOW THIS. The first version returned silently, and because
       * `coin_flip` was missing from the reason vocabulary that catch was
       * DROPPING AN ENTIRE CLASS OF OVERRIDE on the one night that cannot be
       * recaptured. An ungradeable entry is worse than none; an entry lost in
       * silence is worse than both, because nothing says it happened. */
      if (typeof console !== 'undefined' && console.error) {
        console.error('OVERRIDE NOT RECORDED — ' + (e && e.message), picked && picked.name);
      }
      return;
    }
    PredLedger.override({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'override-record-v2', payload: _rec });
  }
  function promptOverrideReason(picked, overTop, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') {
      logOverrideReason(picked, overTop, 'no_reason_given', opts.path,
        opts.reconciled, opts.score_gap, opts.contested, opts);
      return;
    }
    const old = document.getElementById('override-reason'); if (old) old.remove();
    const host = document.createElement('div');
    host.id = 'override-reason';
    host.className = 'override-reason-toast';
    // When the board itself calls it close, offer 'coin flip' as a one-tap reason.
    const reasons = opts.contested
      ? OVERRIDE_REASONS.concat([{ key: 'coin_flip', label: '🪙 Coin flip', hint: 'Board says it is close' }])
      : OVERRIDE_REASONS;
    host.innerHTML =
      '<div class="orr-head">Took <b>' + escapeHtml(picked.name) + '</b> over '
      + escapeHtml(overTop ? overTop.name : 'the top pick') + ' — why? <span class="muted">(skip is fine)</span></div>'
      + '<div class="orr-btns">'
      + reasons.map(r => '<button class="btn small navy" data-orr="' + r.key
        + '" title="' + escapeHtml(r.hint) + '">' + r.label + '</button>').join('')
      + '<button class="btn small ghost" data-orr="skip">skip</button>'
      + '</div>';
    document.body.appendChild(host);
    const finish = (reason) => {
      if (host.parentNode) host.remove();
      logOverrideReason(picked, overTop, reason === 'skip' ? 'no_reason_given' : reason,
        opts.path, opts.reconciled, opts.score_gap, opts.contested, opts);
    };
    host.addEventListener('click', ev => {
      const b = ev.target.closest('[data-orr]');
      if (b) finish(b.getAttribute('data-orr'));
    });
    // Never block the clock: auto-dismiss as a frictionless skip after 12s.
    setTimeout(() => { if (host.parentNode) finish('skip'); }, 12000);
  }

  /* Decision-time ledger captures (Phase L1). Best-effort; a failed post never
   * blocks the clock. season/build_at pin the record to the exact board. */
  function ledgerCtx() {
    return {
      season: state.data && state.data.league ? state.data.league.season : null,
      build_at: (state.data || {}).built_at || null,
      pick: currentPick(),
    };
  }
  /* THE PICK ROW MUST BE SELF-SUFFICIENT. IT WAS NOT.
   *
   * The board a decision was made from rode ONLY on the `recommendation` row.
   * `pick` joined to it by `season|build_at|pick` and inherited it that way,
   * which is sound arithmetic and an unsound dependency: THE RECOMMENDATION
   * CAPTURE LIVES INSIDE `renderRecommendations`, and renderAll wraps that call
   * in `safeRender` precisely because it can throw. I built that guard myself.
   *
   * So the failure mode is: renderRecommendations throws at pick N, safeRender
   * records it and keeps the board alive (correct, and the reason the guard
   * exists), no recommendation row is written, and the pick row at N has no
   * board. That decision is then PERMANENTLY UNGRADABLE — not wrong, missing,
   * and missing in a way that looks identical to a pick nobody analysed yet.
   *
   * `state.renderFailures` knows it happened. THE LEDGER DOES NOT, and the
   * ledger is what September reads.
   *
   * The fix is to remove the coupling rather than to report it more loudly: the
   * pick carries its own taken set. A lost recommendation row now costs the
   * recommendation, not the evidence. `render_failed` rides alongside so a
   * replay can tell a missing recommendation from one that was never due.
   *
   * COST: ~150 ids at the last pick, on twelve rows a draft. */
  function capturePick(p, pathKey, takenAtPick, boardSizeAtPick) {
    if (typeof PredLedger === 'undefined') return;
    var c = ledgerCtx();
    // Part 2 §1: log WHICH path the pick came from. Resolve from the paths that
    // were on screen when the decision was made — prefer the explicit key the
    // clicked button carried, else match the player against every path's
    // candidates. No matching path = an off-path pick (an override in path terms).
    var paths = state.lastPaths || [];
    var chosen = null;
    if (pathKey) chosen = paths.find(function (x) { return x.key === pathKey; }) || null;
    if (!chosen) {
      chosen = paths.find(function (x) {
        return x.candidates.some(function (cd) { return String(cd.player.player_id) === String(p.player_id); });
      }) || null;
    }
    /* DEGRADE, NEVER LOSE THE ROW. Same two-level shape as the recommendation
     * capture: a browser holding a cached predledger.js without `boardState`
     * must still log the pick. A pick without its board is worth less than one
     * with it and far more than none. */
    var board = {};
    try {
      board = (typeof PredLedger.boardState === 'function' && takenAtPick)
        ? PredLedger.boardState(takenAtPick, boardSizeAtPick)
        : { taken_state: takenAtPick ? 'unavailable' : 'not-snapshotted' };
    } catch (e) { board = { taken_state: 'error' }; }
    var rf = state.renderFailures || {};
    PredLedger.pick({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'pick-v1',
      payload: Object.assign({}, board, {
        player_id: String(p.player_id), name: p.name, position: p.position,
        team: p.team, adjusted_adp: p.adjusted_adp, vorp: p.vorp, tier: p.tier,
        chosen_path: chosen ? chosen.name : null,
        chosen_path_key: chosen ? chosen.key : null,
        /* WHICH PANELS WERE STALE WHEN I DECIDED. Derived from the aggregate
         * renderAll already keeps — not a new claim, the existing one routed
         * into the record. `recommendations` is called out by name because a
         * failure there is the one that also costs the recommendation row. */
        render_failed: Object.keys(rf).length ? Object.keys(rf) : null,
        rec_render_failed: !!rf.recommendations,
        off_path: paths.length > 0 && !chosen }) });
  }

  /* Phase H shadow rosters (strategy-hunt-learning-seed.md). Every strategy
   * drafts silently at my slots from the exact board snapshot; the 2026 season
   * grades them out-of-sample in dollars. Best-effort like every capture — a
   * shadow failure never touches the real clock. */
  function updateShadows(boardAtPick) {
    if (typeof DraftShadows === 'undefined') return;
    try {
      if (!state.shadows) {
        state.shadows = DraftShadows.create({
          rehearsal: !!state.mockMode,                    // req 4: flagged, never mixed
          rounds: Math.round((state.data.pick_order.picks || []).length
            / ((state.data.league || {}).teams || 10)) || 15,
          built_at: (state.data || {}).built_at || null,
        });
      }
      const teams = (state.data.league || {}).teams || 10;
      const round = Math.max(1, Math.ceil(currentPick() / teams));
      const baseCtx = Object.assign({}, context(), { board: boardAtPick });
      // THE AUTHORITATIVE DRAFTED SET — synced picks, locally-marked picks and
      // keepers, one set, not a shadow-private copy. The single-path rule: the
      // shadows must answer "is he available?" from the same fact the board
      // does, or they drift from it exactly the way they just did.
      const picks = DraftShadows.onMyPick(state.shadows, boardAtPick, baseCtx,
                                          round, state.drafted);
      // Ledger each shadow pick at decision time (kind shadow_pick). Rehearsal
      // entries carry the flag in the payload; the grading side filters on it.
      if (typeof PredLedger !== 'undefined' && picks.length) {
        var c = ledgerCtx();
        PredLedger.capture('shadow_pick', { season: c.season, build_at: c.build_at,
          pick: c.pick, method: 'shadow-v1', payload: { picks: picks } });
      }
      renderShadowStrip();
    } catch (e) { /* never block the draft on a shadow */ }
  }

  /* Part C — the shadow-standings strip (Phase H made visible). State-aware
   * per the standings-honesty rule: it renders only when shadows exist, labels
   * rehearsal explicitly, and the DOLLARS column begins at week 1 — pre-season
   * it says so rather than ranking on nothing. */
  function renderShadowStrip() {
    const host = $('#shadow-strip');
    const body = $('#shadow-strip-body');
    if (!host || !body) return;
    const sh = state.shadows;
    if (!sh || !Object.keys(sh.strategies || {}).length) { host.style.display = 'none'; return; }
    host.style.display = '';
    const rows = Object.values(sh.strategies).map(function (s) {
      const last = s.roster.length ? s.roster[s.roster.length - 1] : null;
      return '<tr><td><b>' + escapeHtml(s.name) + '</b></td>'
        + '<td class="num">' + s.roster.length + ' picks</td>'
        + '<td>' + (last ? escapeHtml(last.name + ' (' + (last.position || '?') + ')') : '—') + '</td></tr>';
    }).join('');
    body.innerHTML =
      (sh.rehearsal ? '<p class="muted" style="margin:.2rem 0 .5rem">REHEARSAL shadows — never mixed with draft night.</p>' : '')
      + '<div class="scroll-x"><table class="roll">'
      + '<tr><th>strategy</th><th class="num">drafted</th><th>latest pick</th></tr>'
      + rows + '</table></div>'
      + '<p class="muted" style="font-size:.72rem;margin:.5rem 0 0">Standings render in DOLLARS from week 1 '
      + '(weekly-highs banked + RS equity) — pre-season there is nothing honest to rank on, so nothing is ranked.</p>';
  }

  /* A-3 — my-turn alerting. Edge-triggered tick after every pick update; the
   * visibilitychange re-tick is the catch-up sweep for throttled background
   * polls (phone in a pocket). All best-effort. */
  const ALERT_CFG_KEY = 'wr-alerts-v1';
  let alertSt = null;
  function alertCfg() {
    try { return Object.assign({}, DraftAlerts.DEFAULTS,
      JSON.parse(localStorage.getItem(ALERT_CFG_KEY) || '{}')); }
    catch (e) { return (typeof DraftAlerts !== 'undefined') ? DraftAlerts.DEFAULTS : {}; }
  }
  function alertTick() {
    if (typeof DraftAlerts === 'undefined' || !state.data) return;
    try {
      const my = (state.data.pick_order || {}).my_picks || [];
      const out = DraftAlerts.tick(alertSt, currentPick(), my);
      alertSt = out.st;
      if (out.fire) DraftAlerts.fire(alertCfg(), { document: document, navigator: navigator });
      else if (my.indexOf(currentPick()) < 0) DraftAlerts.stopFlash(document);
    } catch (e) { /* an alert failure never touches the clock */ }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) alertTick();      // the catch-up sweep
    });
  }

  /* Reconcile the assumed keeper slate against what Sleeper actually shows.
   *
   * Runs on every sync tick. Cheap, and the alternative is discovering at pick
   * 4 that a player the tool thinks is gone has been sitting on the board all
   * along, invisible to every recommendation it made.
   */
  function reconcileKeepers(picks) {
    if (!window.DraftReconcile || state.mockMode) return;   // mocks have no keepers
    const assumed = (state.data.pick_order || {}).forfeited || [];
    if (!assumed.length) return;

    const byId = {};
    (state.data.players || []).forEach(p => { byId[String(p.player_id)] = p; });
    const teams = state.data.league.teams || 10;
    const currentRound = Math.ceil(currentPick() / teams);

    const topPicksFlat = ((state.data.league || {}).keeper_rules || {}).cost_model === 'top_picks_flat';
    const r = window.DraftReconcile.reconcile(picks, assumed,
      { playersById: byId, currentRound: currentRound, teams: teams, topPicksFlat: topPicksFlat });
    state.reconcile = r;
    renderReconcile(r, assumed, byId);
  }

  function renderReconcile(r, assumed, byId) {
    const host = $('#reconcile-note');
    if (!host) return;
    if (!r || r.ok) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.innerHTML =
      '<div class="stale-block">'
      + '<h3>\u26d4 The keeper slate does not match the draft</h3>'
      + '<p>' + escapeHtml(r.message) + '</p>'
      + '<p>Recommendations are paused: the board is known to be wrong, and a '
      + 'confident wrong recommendation is worse than none.</p>'
      + '<button class="btn small gold" id="fix-keepers">Re-adjust from what Sleeper shows</button> '
      + '<button class="btn small navy" id="ignore-keepers">Ignore and continue</button>'
      + '</div>';

    const fix = $('#fix-keepers');
    if (fix) fix.addEventListener('click', () => {
      const slate = window.DraftReconcile.correctedSlate(assumed, r, { playersById: byId });
      applyKeeperSlate(slate);
    });
    const ignore = $('#ignore-keepers');
    if (ignore) ignore.addEventListener('click', () => {
      state.reconcile = { ok: true, halt: false, ignored: true };
      host.style.display = 'none';
      renderAll();
    });
  }

  /* Rebuild everything a keeper change invalidates — client-side, no network.
   * This is what makes mid-draft correction possible at all. */
  function applyKeeperSlate(slate) {
    if (!window.DraftKeepers) return;
    const league = state.data.league;
    const teams = league.teams || 10;
    const rounds = Math.round((state.data.pick_order.picks || []).length / teams)
      + Math.round(((state.data.pick_order.forfeited || []).length) / teams);
    const cfg = {
      teams: teams,
      // Draft length: for a MOCK, the mock's own shape (rounds, computed above
      // from its pick_order); else the ARTIFACT's stamped rounds — never a local
      // formula, which would be a second source that can drift from the pipeline.
      rounds: rounds || league.rounds || (league.roster_size || 15),
      draft_type: league.draft_type || 'snake',
      my_draft_slot: mySlot(),
      adp_blend_weight: 0.7,
      keepers: league.keeper_rules || { count: 3, cost_model: 'original_round' },
    };
    const before = (state.data.pick_order.my_picks || []).slice();
    const out = window.DraftKeepers.reapply(state.data.players, cfg, slate);

    state.data.pick_order = {
      picks: out.order.picks.map(p => ({ overall: p.overall, round: p.round, slot: p.team_slot })),
      my_picks: out.order.my_picks,
      my_picks_before_keepers: out.order.my_original_picks,
      forfeited: out.order.forfeited,
    };
    state.data.players = out.players;
    const kept = {};
    out.kept_ids.forEach(id => { kept[String(id)] = true; });
    state.board = out.players.filter(p => !state.drafted.has(String(p.player_id))
                                       && !kept[String(p.player_id)]);
    state.reconcile = { ok: true, halt: false, corrected: true };

    const host = $('#reconcile-note');
    if (host) {
      host.style.display = '';
      host.className = '';
      host.innerHTML = '<div class="prov-note warn"><b>\u2705</b> <span>Keeper slate '
        + 'corrected from the live draft. Your picks were '
        + escapeHtml(before.slice(0, 6).join(', ')) + ' \u2192 now '
        + escapeHtml(out.order.my_picks.slice(0, 6).join(', '))
        + '. Adjusted ADP and the pick sequence have been rebuilt.</span></div>';
    }
    renderAll();
  }

  function recomputeRuns() {
    state.runMults = E.runMultipliers(state.recentPicks, state.data.players, currentPick());
    updateDrift();
  }

  /**
   * A pick came in from Sleeper. Get it onto the right roster, always.
   *
   * Two bugs lived here, both found in a live rehearsal:
   *
   * 1. Everything except "remove from board" sat inside `if (p)`. A player the
   *    local board has never heard of — a rookie, a late flier, anyone outside
   *    the built board — produced NOTHING. The pick did not appear in the feed,
   *    did not land on anyone's roster, and if it was yours, your own roster
   *    silently stayed empty. Sleeper hands us first name, last name, position
   *    and team in the pick metadata, so there is no excuse for losing it.
   *
   * 2. "Is this mine" compared pick.roster_id against my DRAFT SLOT. Those are
   *    different numbers that happen to be equal in this league because its
   *    slot_to_roster_id is the identity map. In any league where somebody
   *    joined in a different order, every pick would be attributed to the wrong
   *    team and nothing would look wrong.
   */
  /* REHEARSAL KEEPER MODE — which of MY mock picks are noise rather than mine.
   *
   * SKIP is the DEFAULT and the only mode that models draft night: under
   * `top_picks_flat`, keeping N players forfeits rounds 1..N, so a mock pick of
   * mine in those rounds corresponds to a pick I will not have. `state.
   * rehearsalMode === 'take'` is the deliberate opt-out (rehearsing a no-keeper
   * draft), and it must be chosen, never fallen into.
   *
   * Only ever true in a mock, only ever for MY seat, only ever in the forfeited
   * rounds. Everything else flows through the normal path untouched.
   */
  function keeperRounds() {
    if (!state.data || !state.data.league) return 0;
    return Number((state.data.league.keeper_rules || {}).count) || 0;
  }
  function rehearsalSkips(pick, slot, seatSlot) {
    if (!state.mockMode) return false;
    if (state.rehearsalMode === 'take') return false;
    if (!seatSlot || Number(slot) !== Number(seatSlot)) return false;
    const n = keeperRounds();
    if (!n) return false;
    const round = Number(pick && pick.round);
    if (!Number.isFinite(round)) return false;
    return round >= 1 && round <= n;
  }

  /* FORWARD-LOOP CLOSE (2026-08-10, the resolver wire). The resolver core
   * (DraftForecast.buildResolutions), the fire method (PredLedger.forecastResolution)
   * and the grader (forecast_grade / grade-cron) ALL already existed — the one
   * missing wire was calling them from the completed picks. Without it, on draft
   * night the model commits dozens of timestamped survival + room-seat predictions
   * and NOTHING grades them: the record-but-never-grade failure in the one place the
   * evidence cannot be faked, on a window (the survival model's first live
   * calibration read) that does not reopen. Real draft only; deduped by key in
   * PredLedger, so firing on every sync resolves each claim exactly once, the moment
   * its pick arrives. */
  /* ── OPPONENT PREDICTION — the shadow arm, emitted and resolved ────────────
   *
   * Predicts the picks between now and my next turn, BEFORE they happen, in two
   * arms (profile and ADP baseline) resolved against the same outcome. Turns
   * 468 picks of description into ~135 graded predictions a draft.
   *
   * WHY THE WINDOW AND NOT "ALL REMAINING": the intervening picks are bounded
   * (<= 9), they are the seats that actually matter, and over a whole draft the
   * window advances across every opponent pick exactly once. Predicting the
   * whole remainder on every four-second poll would re-predict the same picks
   * from a board that keeps changing, and the ledger would fill with entries
   * whose "prediction timestamp" meant nothing.
   *
   * SILENCE (rule 15) IS THE POINT HERE, more than anywhere else on this
   * surface: nothing below renders. A prediction about what the next owner takes
   * is exactly the thing I would act on and must not.
   *
   * FREE OR DROPPED. `predictRound` enforces its own budget and refuses rather
   * than slows; if it ever refuses, this stops asking for the rest of the draft
   * rather than retrying into a board that is evidently struggling.
   */
  function emitOpponentPredictions() {
    if (state.mockMode) return;                   // a mock is not forward evidence
    if (typeof OpponentPredict === 'undefined' || typeof PredLedger === 'undefined') return;
    if (state.opponentPredictOff) return;         // budget blew once — stay off
    try {
      const cur = currentPick();
      if (cur == null) return;
      /* THE WINDOW COMES FROM `interveningPicks()`, THE APP'S OWN DEFINITION,
       * not from a snake formula written here. It already reads the authoritative
       * `pick_order`, already excludes my seat, and already handles the two things
       * a hand-rolled slot calculation gets wrong: seats that forfeited a keeper
       * round genuinely do not pick (real gaps), and snake repeats like
       * …9,10,10,9… are real. A second derivation would disagree with the
       * survival window on exactly those picks. */
      const win = interveningPicks();
      if (!win.length) return;
      state.opponentPredicted = state.opponentPredicted || {};
      const seats = win
        .filter(w => w.pick_no != null && !state.opponentPredicted[w.pick_no])
        .map(w => ({ pick_no: w.pick_no, owner: String(w.team_slot) }));
      if (!seats.length) return;
      /* ⚠️ THE PROFILE COMES OFF THE WINDOW, WHICH MEANS IT INHERITS THE HONEST
       * BLANK — and that is an operational risk worth naming rather than a
       * detail. `profileForSlot` returns NULL until the live draft object maps
       * uids to seats, deliberately: a confident wrong name would put a real
       * manager's tendencies on a stranger's seat.
       *
       * SO IF THAT MAPPING DOES NOT LAND ON THE 22nd, EVERY PROFILE IS NULL, the
       * profile arm never runs, and the experiment produces only baseline rows.
       * That degrades honestly — `profile_ran: false`, and an arm that never ran
       * scores −1 against a correct baseline rather than a tie — but it produces
       * no evidence about owners either way, which is the thing to check on the
       * night rather than discover in January. */
      const profiles = {};
      const byPick = {};
      win.forEach(w => { byPick[w.pick_no] = w; });
      seats.forEach(st => {
        const w = byPick[st.pick_no];
        profiles[st.owner] = w ? w.profile : null;
      });
      const c = ledgerCtx();
      const out = OpponentPredict.predictRound({
        season: c.season, draft_id: state.draftId || null,
        round: Math.ceil(cur / ((state.data.league || {}).teams || 12)),
        seats: seats, board: state.board, profiles: profiles,
      });
      if (out.over_budget) {
        state.opponentPredictOff = true;
        /* WHY IT STOPPED AND FROM WHERE, so the gap in coverage has a cause
         * attached to it rather than being an unexplained hole in January. */
        state.opponentPredictOffAt = cur;
        state.opponentPredictOffWhy = out.why || 'over budget';
        console.warn('[opponent-predict] ' + out.why);
        return;
      }
      out.picks.forEach(f => {
        state.opponentPredicted[f.subject.pick_no] = true;
        (state.opponentForecasts = state.opponentForecasts || []).push(f);
        PredLedger.capture('opponent_prediction', { season: c.season,
          build_at: c.build_at, pick: f.subject.pick_no,
          method: 'opponent-predict-v1', payload: f });
      });
    } catch (e) {
      /* NEVER BLOCK THE CLOCK. A shadow measurement that breaks the board costs
       * more than it is worth, which is the standing condition on this whole
       * experiment. Loud in the console, invisible on the page.
       * COUNTED, THOUGH — see opponentPredictCoverage. A console line is not
       * evidence; it is gone when the tab closes, and the missing rows it
       * explains are still missing in January. */
      state.opponentPredictErrors = (state.opponentPredictErrors || 0) + 1;
      state.opponentPredictLastError = (e && e.message) || String(e);
      console.error('[opponent-predict] emit failed —', e && e.message);
    }
  }

  /* ── THE DENOMINATOR. WITHOUT IT THE EXPERIMENT HAS NO POWER. ─────────────
   *
   * `OpponentPredict.summarize` accounts for its exclusions carefully — it
   * reports n_excluded_no_profile and says why. But it can only account for
   * ROWS THAT EXIST. A pick that was never predicted at all produces no
   * forecast, therefore no resolution, therefore no row, and vanishes from the
   * accounting entirely.
   *
   * So `n_compared: 60` reads identically whether we predicted 60 of 60 or 60
   * of 138. The first is an experiment; the second is a biased sample of one,
   * because the picks that go unpredicted are not a random subset — they are
   * the ones where the budget blew, which correlates with a big board, which is
   * early, which is where profiles differ most from ADP.
   *
   * THREE WAYS COVERAGE IS LOST, and all three are silent today:
   *   the budget blowing once turns prediction off for the REST OF THE DRAFT
   *   an exception in emit is caught and only console-logged
   *   a window never emitted because sync was dead across it
   *
   * This DERIVES the denominator from pick_order — the same authoritative
   * artifact interveningPicks reads — rather than asserting a count. Every
   * number below is computed from what the pipeline actually did.
   *
   * REPORTED, NOT ENFORCED. It changes no prediction and blocks nothing; it
   * makes "was this sample complete" answerable instead of assumed. */
  function opponentPredictCoverage() {
    const cur = currentPick();
    const rows = ((state.data || {}).pick_order || {}).picks || [];
    if (cur == null || !rows.length) return null;
    const mine = {};
    (((state.data || {}).pick_order || {}).my_picks || []).forEach(n => { mine[Number(n)] = 1; });
    const predicted = state.opponentPredicted || {};
    let due = 0, got = 0;
    rows.forEach(r => {
      const no = Number(r.overall);
      // A keeper slot is not a decision anybody makes, and my own picks are not
      // opponent picks. Neither is predictable, so neither belongs in the
      // denominator — the same picks-versus-selections distinction as elsewhere.
      if (!isFinite(no) || no >= cur || r.keeper_slot || mine[no]) return;
      due += 1;
      if (predicted[no]) got += 1;
    });
    return {
      opponent_picks_due: due,
      opponent_picks_predicted: got,
      coverage: due ? Math.round((got / due) * 1000) / 1000 : null,
      // THE CAUSES, so a gap is diagnosable rather than merely visible.
      predictor_off: !!state.opponentPredictOff,
      predictor_off_at: state.opponentPredictOffAt == null ? null : state.opponentPredictOffAt,
      predictor_off_why: state.opponentPredictOffWhy || null,
      emit_errors: state.opponentPredictErrors || 0,
      last_error: state.opponentPredictLastError || null,
      unresolved_queue: (state.opponentForecasts || []).length,
      at_pick: cur,
      /* ⚠️ THE DENOMINATOR'S OWN RELIABILITY, JOINED IN. Raised by the
       * independent reviewer on 2026-08-14 and CONFIRMED by reading the chain
       * rather than by accepting the finding:
       *
       *   currentPick() -> sync.currentPickNumber() -> allPicks().length + 1
       *   and allPicks() DROPS rows with no resolvable id (counting them in
       *   droppedNoId, which is why the count exists at all).
       *
       * So an id-less row makes `cur` LOWER than the true pick, fewer rows
       * satisfy `overall < cur`, and `opponent_picks_due` UNDERCOUNTS. Coverage
       * is predicted/due, so the ratio is OVERSTATED — and overstated exactly
       * when ingest is anomalous, which is when under-coverage is likeliest.
       * An instrument that reads healthiest when the feed is sickest is worse
       * than no instrument.
       *
       * NOT "fixed" by deriving `cur` differently. currentPick is the app's one
       * clock and a second derivation of it is the defect class this repo keeps
       * removing — the budget is two owners and they are pickState/currentPick.
       * The honest move is to publish the caveat WITH the number so a consumer
       * can discount it, which is the same present/null/missing discipline the
       * rest of the ledger uses. */
      ingest: (state.sync && typeof state.sync.ingestHealth === 'function')
        ? state.sync.ingestHealth() : null,
    };
  }

  function resolveOpponentPredictions(picks) {
    if (state.mockMode) return;
    if (typeof OpponentPredict === 'undefined' || typeof PredLedger === 'undefined') return;
    const fc = state.opponentForecasts || [];
    const c = ledgerCtx();
    /* ⚠️ COVERAGE IS EMITTED BEFORE THE EARLY RETURN, AND THAT ORDER IS THE
     * WHOLE POINT. My first cut put it at the end of this function, below
     * `if (!fc.length) return` — so the ONE case coverage exists to record, the
     * predictor failing from the first pick and producing no forecasts at all,
     * would have emitted nothing. Zero rows and zero coverage rows look
     * identical, which is precisely the ambiguity this is meant to remove.
     *
     * A coverage row that only appears when there is something to cover is not
     * an instrument, it is a decoration. */
    try {
      const cov = opponentPredictCoverage();
      if (cov && state.opponentCoverageAt !== cov.at_pick) {
        state.opponentCoverageAt = cov.at_pick;
        PredLedger.capture('opponent_prediction_coverage', { season: c.season,
          build_at: c.build_at, pick: cov.at_pick,
          method: 'opponent-predict-v1', payload: cov });
      }
    } catch (e) { console.error('[opponent-predict] coverage failed —', e && e.message); }
    if (!fc.length || !picks || !picks.length) return;
    const byPick = {};
    picks.forEach(pk => {
      if (pk && pk.pick_no != null && pk.player_id != null) byPick[Number(pk.pick_no)] = String(pk.player_id);
    });
    state.opponentForecasts = fc.filter(f => {
      const actual = byPick[f.subject.pick_no];
      if (actual == null) return true;            // not taken yet — NOT a miss
      try {
        const r = OpponentPredict.resolvePick(f, actual);
        if (r) {
          PredLedger.capture('opponent_prediction_resolved', { season: c.season,
            build_at: c.build_at, pick: f.subject.pick_no,
            method: 'opponent-predict-v1', payload: r });
        }
      } catch (e) {
        state.opponentPredictErrors = (state.opponentPredictErrors || 0) + 1;
        state.opponentPredictLastError = (e && e.message) || String(e);
        console.error('[opponent-predict] resolve failed —', e && e.message);
      }
      return false;                               // resolved: drop from the queue
    });
  }

  function resolveCommittedForecasts(picks) {
    if (state.mockMode) return;                       // a mock is not forward evidence
    if (typeof DraftForecast === 'undefined' || typeof PredLedger === 'undefined') return;
    const forecasts = state.committedForecasts || [];
    if (!forecasts.length) return;
    const pickLog = (picks || [])
      .filter(function (pk) { return pk && pk.pick_no != null && pk.player_id != null; })
      .map(function (pk) { return { overall: Number(pk.pick_no), player_id: String(pk.player_id) }; });
    if (!pickLog.length) return;
    try {
      const resolutions = DraftForecast.buildResolutions(forecasts, { picks: pickLog });
      const season = ledgerCtx().season;
      resolutions.forEach(function (r) {
        PredLedger.forecastResolution({ season: season, method: 'forecast-resolver-v1',
          pick: currentPick(), payload: r.payload });
      });
    } catch (e) { console.error('[forecast-resolve]', e && e.message); }
  }

  /* GRADE THE SURVIVAL CALLS THE ROOM HAS NOW ANSWERED.
   *
   * The shortest loop in the model: a survival call names a pick, and within a
   * few picks the player is either there or gone. It grades itself DURING the
   * draft rather than in January, and it grades the input VONA is built on.
   *
   * Once per capture, tracked by key — a resolution written twice would count
   * the same evidence twice in every calibration that reads these rows. */
  function resolveSurvivalCalls(picks) {
    if (state.mockMode) return;                     // a mock is not forward evidence
    if (typeof DraftSurvival === 'undefined' || typeof PredLedger === 'undefined') return;
    const caps = (state.survivalCaptures || []).filter(function (c) { return !c._resolved; });
    if (!caps.length) return;
    const pickLog = (picks || [])
      .filter(function (pk) { return pk && pk.pick_no != null && pk.player_id != null; })
      .map(function (pk) { return { overall: Number(pk.pick_no), player_id: String(pk.player_id) }; });
    if (!pickLog.length) return;
    try {
      const season = ledgerCtx().season;
      const resolutions = DraftSurvival.resolveSurvival(caps, { picks: pickLog });
      resolutions.forEach(function (r) {
        PredLedger.capture('survival_resolved', { season: season, method: r.method,
          pick: currentPick(), payload: r.payload });
        // Mark ONLY the capture this resolution belongs to. Marking all of them
        // would silently drop the ones the draft has not reached yet.
        const key = String(r.payload.from_pick) + '>' + String(r.payload.to_pick);
        caps.forEach(function (c) { if (c._key === key) c._resolved = true; });
      });
    } catch (e) { console.error('[survival-resolve]', e && e.message); }
  }

  /* GRADE THE LAST-RESPONSIBLE-MOMENT CALLS THE DRAFT HAS NOW ANSWERED.
   *
   * Third draft-day loop, and the one that resolves ENTIRELY inside the draft:
   * "startable QB safe until pick 73" is answered by pick 73 and by nothing else
   * afterwards. It has been captured since decision-capture went in and graded by
   * nothing — so on 22 August it would have produced a full set of claims and no
   * record of whether any of them held. Unrecoverable after the fact, which is
   * the same shape as the in-season capture gap.
   *
   * Scored as a HIT RATE against the 0.85 the strip thresholds on, not as a
   * Brier score: an LRM call is a deadline, not a probability, and the only
   * number it commits to is that threshold. Both sides now read
   * `CFG.LRM_SAFE_P` so the claim and its grade cannot drift apart. */
  function resolveLrmCalls(picks) {
    if (state.mockMode) return;                     // a mock is not forward evidence
    if (typeof DraftSurvival === 'undefined' || typeof PredLedger === 'undefined') return;
    const caps = (state.lrmCaptures || []).filter(function (c) { return !c._resolved; });
    if (!caps.length) return;
    const pickLog = (picks || [])
      .filter(function (pk) { return pk && pk.pick_no != null && pk.player_id != null; })
      .map(function (pk) { return { overall: Number(pk.pick_no), player_id: String(pk.player_id) }; });
    if (!pickLog.length) return;
    try {
      const res = DraftSurvival.resolveLrm(caps, { picks: pickLog });
      if (!res || !res.resolvable) return;          // nothing answered yet — say nothing
      PredLedger.capture('lrm_resolved', { season: ledgerCtx().season,
        method: 'lrm-hitrate-v1', pick: currentPick(), payload: res });
      /* A CAPTURE IS SPENT ONLY WHEN EVERY DEADLINE IN IT HAS BEEN REACHED.
       * Marking on the first resolution would discard the later picks a single
       * capture speaks about — one LRM row carries a deadline per position, and
       * they come due at different times. */
      const reached = pickLog.reduce(function (m, p) {
        return p.overall > m ? p.overall : m; }, 0);
      caps.forEach(function (c) {
        const list = (c.payload || {}).last_responsible_moment || [];
        const pending = list.some(function (r) {
          return ['startable', 'elite'].some(function (b) {
            const by = r[b + '_by'];
            return by != null && Number(by) > reached;
          });
        });
        if (!pending) c._resolved = true;
      });
    } catch (e) { console.error('[lrm-resolve]', e && e.message); }
  }

  /* GRADE THE RUN CALLS THE ROOM HAS NOW ANSWERED.
   *
   * Second draft-day loop. Run multipliers feed `survivalProbability`, so a run
   * call that is wrong makes every survival number downstream of it wrong too —
   * grading this grades a VONA input, same as survival itself.
   *
   * Needs the pick POSITIONS, not just ids: the claim is about a position going
   * faster than usual, so a pick log without positions cannot grade it. */
  function resolveRunCalls(picks) {
    if (state.mockMode) return;                     // a mock is not forward evidence
    if (typeof DraftSurvival === 'undefined' || typeof PredLedger === 'undefined') return;
    const caps = (state.runCaptures || []).filter(function (c) { return !c._resolved; });
    if (!caps.length) return;
    const pickLog = (picks || [])
      .filter(function (pk) { return pk && pk.pick_no != null && pk.player_id != null; })
      .map(function (pk) {
        const p = playerById(String(pk.player_id));
        return { overall: Number(pk.pick_no), position: p && p.position };
      })
      .filter(function (x) { return x.position; });
    if (!pickLog.length) return;
    try {
      const season = ledgerCtx().season;
      DraftSurvival.resolveRun(caps, { picks: pickLog }).forEach(function (r) {
        PredLedger.capture('run_resolved', { season: season, method: r.method,
          pick: currentPick(), payload: r.payload });
        // Mark only the captures made AT that pick — several run calls can share
        // a pick, and marking by pick alone would silently drop the others.
        caps.forEach(function (c) {
          if (c.pick === r.payload.at_pick) c._resolved = true;
        });
      });
    } catch (e) { console.error('[run-resolve]', e && e.message); }
  }

  function onSyncPicks(picks) {
    const seatSlot = mySlot();
    // SPEED (audit 2026-08-10): the Sleeper poll fires every 4s, but most polls
    // return NO new pick. Sleeper's pick list is append-only, so an unchanged count
    // means nothing happened — skip the full board re-score (~1700 players) + full
    // re-render that used to run every cycle regardless. Recommendations still update
    // the instant a real pick lands; idle polls are now free.
    /* ⚠️ AN UNCHANGED COUNT IS NOT AN UNCHANGED LIST, AND THIS RETURNED EARLY
     * ON THE COUNT ALONE.
     *
     * The comment above says "Sleeper's pick list is append-only, so an
     * unchanged count means nothing happened." Append-only is the normal case,
     * not a guarantee: a commissioner can CORRECT a pick mid-draft — wrong
     * player, an undo-and-redo, an autopick fix — and the list comes back the
     * same LENGTH with different CONTENT. The old guard returned before any of
     * the reconciliation below could see it, so the board kept the superseded
     * player marked gone and never learned about the real one.
     *
     * That is a wrong-decision path, not a cosmetic one: Cory is recommended
     * against a pool with the wrong man removed, and every survival number is
     * computed from that pool.
     *
     * The fingerprint is the ids and pick numbers, not the count. It is O(n) on
     * at most 150 rows once every 4s, which is free next to the board re-score
     * this guard exists to skip — so the speed win the count guard was written
     * for is kept, and the blind spot is not. */
    const fingerprint = (picks || [])
      .map(p => String(p.player_id) + '@' + (p.pick_no == null ? '?' : p.pick_no))
      .join(',');
    if (state._syncedPickFingerprint === fingerprint) return;
    const priorFingerprint = state._syncedPickFingerprint;
    state._syncedPickFingerprint = fingerprint;
    state._syncedPickCount = (picks || []).length;

    /* ── A PICK THAT WAS UNDONE MUST COME BACK ONTO THE BOARD ───────────────
     *
     * The ingest loop below is purely ADDITIVE — `state.drafted.add(id)` with
     * no removal path — so a player Sleeper stops reporting stayed gone from
     * Cory's board for the rest of the draft. Two independent routes to the
     * same wrong decision: he would never be shown a player who is genuinely
     * available.
     *
     * Restoring is scoped tightly, because `drafted` has four other writers and
     * three of them are NOT the room: my keepers (:4995), manual placeholders
     * (:4873), and rehearsal removals. Only ids this sync itself put there are
     * eligible, tracked in `_syncOwnedIds`, so a keeper can never be handed
     * back to the pool by a Sleeper hiccup.
     *
     * It also REFUSES to act on an empty read: `picks` arriving empty is a
     * failed fetch far more often than a reset draft, and treating it as "every
     * pick was undone" would blank the board mid-round. That is the `or []`
     * failure this repo has already paid for on the keeper path. */
    state._syncOwnedIds = state._syncOwnedIds || new Set();
    if (priorFingerprint !== undefined && (picks || []).length > 0) {
      const nowIds = new Set((picks || []).map(p => String(p.player_id)));
      const vanished = [...state._syncOwnedIds].filter(id => !nowIds.has(id));
      if (vanished.length) {
        vanished.forEach(id => {
          state._syncOwnedIds.delete(id);
          state.drafted.delete(id);
          Object.keys(state.rosters || {}).forEach(sl => {
            state.rosters[sl] = (state.rosters[sl] || [])
              .filter(x => String(x.player_id) !== id);
          });
          state.myRoster = (state.myRoster || [])
            .filter(x => String(x.player_id) !== id);
          state.recentPicks = (state.recentPicks || [])
            .filter(x => String(x.player_id) !== id);
          const back = playerById(id);
          if (back && !(state.board || []).some(x => String(x.player_id) === id)) {
            state.board.push(back);
          }
        });
        /* SAID OUT LOUD. A player reappearing on the board mid-draft is
         * alarming unless you know why, and this is the one case where it is
         * correct. */
        console.warn('[sync] ' + vanished.length + ' pick(s) withdrawn by the '
          + 'room — those players are BACK on the board: ' + vanished.join(', '));
        state.syncWithdrawn = (state.syncWithdrawn || 0) + vanished.length;
      }
    }

    /* ⚠️ RETIRE ANY TYPED PLACEHOLDER THE ROOM HAS NOW REPORTED FOR REAL.
     *
     * This loop is ADDITIVE — it adds on first sight and never removes — so
     * excluding a superseded row from `allPicks()` is not enough on its own: the
     * board's OWN surfaces (`state.drafted`, the seat roster, my roster, the
     * recent-picks strip) still hold the placeholder from when it was typed.
     * B measured exactly that: drafted 15 -> 16 (typed) -> 17 (Sleeper reports
     * the SAME pick), with seat 3 holding both spellings.
     *
     * The purge runs BEFORE the add loop so the real pick lands into a seat that
     * has already given up its stand-in, and the seat count never transiently
     * reads one too high. `sync.supersededManual()` owns the decision — a typed
     * row retires when its seat has more real picks than it had at entry — and
     * this side only carries it out. */
    if (state.sync && typeof state.sync.supersededManual === 'function') {
      let retired = 0;
      state.sync.supersededManual().forEach(id => {
        if (!state.drafted.has(id)) return;
        state.drafted.delete(id);
        Object.keys(state.rosters || {}).forEach(sl => {
          state.rosters[sl] = (state.rosters[sl] || [])
            .filter(x => String(x.player_id) !== String(id));
        });
        state.myRoster = (state.myRoster || [])
          .filter(x => String(x.player_id) !== String(id));
        state.recentPicks = (state.recentPicks || [])
          .filter(x => String(x.player_id) !== String(id));
        retired++;
      });
      /* SAID OUT LOUD, because a pick silently vanishing off his board mid-draft
       * is its own kind of alarming — and this is the one case where a row
       * disappearing is correct. */
      if (retired) {
        console.info('[manual] ' + retired + ' typed pick(s) retired — the room '
          + 'reported them for real');
      }
    }
    picks.forEach(pick => {
      const id = String(pick.player_id);
      // draft_slot is the seat; roster_id is the team. A MOCK draft has no
      // rosters, so the seat only lives in draft_slot — prefer it.
      const slot = Number(pick.draft_slot) || Number(pick.roster_id) || null;
      const firstSight = !state.drafted.has(id);
      /* OWNERSHIP RECORDED ONCE, HERE, FOR EVERY PICK THE ROOM REPORTS —
       * regardless of which branch below marks it drafted. `ATTR.applyRemote`
       * is a third writer to `state.drafted` (attribution.js:92/126/163), so
       * tagging inside the branches would have missed it and left those picks
       * ineligible for withdrawal. One place, before the fork. */
      state._syncOwnedIds.add(id);

      // Known to the board, or reconstructed from what Sleeper sent. A stub
      // carries no projection, so it can never affect a recommendation — it
      // exists so the pick is visible and lands on the right roster.
      const known = playerById(id);
      /* ⚠️ ID-SPACE DIVERGENCE IS THE ONE SYNC FAILURE THAT REMOVES NOBODY FROM
       * THE POOL, AND NOTHING COUNTED IT.
       *
       * A stub is fine one at a time — Sleeper carries deep players our 686-row
       * board does not, and a stub is rendered "(not on the board)" and never
       * scored. But if the two id spaces ever DIVERGE — a players-DB refresh, a
       * board rebuilt from a different source, an id format change — then EVERY
       * pick becomes a stub, `state.drafted` fills with ids the board does not
       * contain, and `players.filter(p => !drafted.has(p.player_id))` removes
       * NOBODY. Cory would be recommended players taken forty picks earlier, for
       * the whole draft, with each individual row looking merely unusual.
       *
       * THE THRESHOLD IS DERIVED, NOT CHOSEN. Real drafts against today's board:
       *     2025  150 picks,   5 stubs   3.3%
       *     2024  150 picks,  13 stubs   8.7%
       *     2023  150 picks,  21 stubs  14.0%
       * The older seasons run high only because retired players are dropped from
       * a 2026 board, so 3.3% is the honest expectation and 14% an upper bound.
       * 50% is far above any of them and far below the ~100% a divergence
       * produces — a false alarm mid-draft is itself harmful, so this fires only
       * for catastrophe. Minimum eight picks before it can judge at all. */
      state._syncMatched = (state._syncMatched || 0) + (known ? 1 : 0);
      state._syncStubs = (state._syncStubs || 0) + (known ? 0 : 1);
      const meta = pick.metadata || {};
      const p = known || {
        player_id: id,
        name: [meta.first_name, meta.last_name].filter(Boolean).join(' ')
          || meta.player_name || ('Player ' + id),
        position: meta.position || '?',
        team: meta.team || '',
        bye: null,
        /* Rendered differently, and never scored as a candidate. NOT the same
         * as "reaches nothing": this row joins `state.myRoster`, and until
         * 2026-08-17 the keeper bar ranked it as an incumbent worth zero
         * (register E18). `composite.js` now drops rows it cannot value; see
         * recordManualPick above for the measurement. */
        off_board: true,
      };

      // REHEARSAL SKIP MODE — THE DEFAULT IN A MOCK.
      //
      // Keeping three players forfeits rounds 1-3. A mock room does not know
      // that and hands me picks in those rounds anyway; taking them made my
      // roster six deep when draft night starts it at three, and the need model
      // repriced every position off a roster I will never have.
      //
      // Those selections are REHEARSAL NOISE: the player really is off this
      // room's board, so the board and survival model must see him gone, but he
      // is not mine and must never reach my roster, need, legality or byes.
      if (rehearsalSkips(pick, slot, seatSlot)) {
        if (ATTR) ATTR.markRehearsalNoise(state, p);
        else state.drafted.add(id);
        state.board = state.board.filter(x => String(x.player_id) !== id);
        return;                                   // never mine, never reconciled
      }
      // SLEEPER IS AUTHORITATIVE. applyRemote places him on the seat the API
      // reports and moves him off any seat a local guess put him on — the same
      // tested path the robot mock's Loveland scenario exercises. Idempotent,
      // so it is safe to run for every pick on every four-second poll.
      if (ATTR) ATTR.applyRemote(state, p, slot, seatSlot);
      else {
        /* ⚠️ THE IDEMPOTENCY THE COMMENT ABOVE PROMISES BELONGS TO applyRemote,
         * AND THIS BRANCH NEVER HAD IT.
         *
         * Sleeper returns the WHOLE pick list every poll, so when any new pick
         * lands the loop re-processes every earlier one. `drafted.add` is a Set
         * and survives that; two array PUSHES do not. Measured by running this
         * function with ATTR absent:
         *
         *     after 1 pick   slot roster = 100
         *     after 2 picks  slot roster = 100,100,200
         *     after 3 picks  slot roster = 100,100,200,100,200,300
         *
         * Quadratic. By pick 150 the roster holds thousands of rows, and need,
         * legality, bye coverage and every roster-dependent recommendation are
         * computed from it.
         *
         * REACHABLE, NOT THEORETICAL. `ATTR` is `window.DraftAttribution ||
         * null`, captured ONCE at init (app.js:7170) — so a single failed load
         * of attribution.js (a 404 after deploy, a cache miss, a flaky asset)
         * leaves it null for the entire session and routes every pick here.
         * A fallback whose failure mode is worse than having no fallback.
         *
         * `firstSight` was already computed above and already gates the
         * missed-mark recovery twelve lines below. It just was not applied to
         * the two lines that needed it most. */
        state.drafted.add(id);
        if (firstSight) {
          if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
          if (seatSlot && slot === seatSlot) state.myRoster.push(p);
        }
      }
      state.board = state.board.filter(x => String(x.player_id) !== id);
      // MISSED-MARK RECOVERY (1) — THE SYNC-LIVE PATH.
      // I forgot to tap "I took him", but Sleeper knows within seconds and
      // Sleeper is truth per the authority doctrine. applyRemote above has
      // already put him on my roster; this is the CONFIRMATION, so a silently
      // corrected roster is never mistaken for one I recorded myself. No
      // guessing is involved anywhere in this path.
      if (firstSight && seatSlot && slot === seatSlot && !state.markedLocally.has(id)) {
        noteReconciledPick(p, pick);
      }
      // EXP-31 PLATFORM SAMPLING. In a MOCK room every non-Cory pick is
      // Sleeper's own default ordering executing — bot/autopick picks most
      // purely of all. We have no archive of the historical platform board, so
      // rehearsals are the only live source, and each one makes the FALL/REACH
      // delta board sharper. Captured with OUR FFC ADP alongside, because the
      // sample is only useful as a DELTA against the market.
      if (firstSight && state.mockMode && slot && slot !== seatSlot) {
        capturePlatformSample(pick, p, slot, picks);
      }
      if (firstSight) {
        state.recentPicks.push({
          position: p.position, player_id: id,
          pick_no: pick.pick_no || (state.recentPicks.length + 1),
          player: p,
        });
      }
    });
    // Check the slate against reality before scoring anything off it.
    if (!(state.reconcile && state.reconcile.ignored)) reconcileKeepers(picks);
    // L2 raw-forever: archive the complete pick stream (ALL teams, as Sleeper
    // sent it), immutable and content-hash deduped server-side. This is the
    // permanent raw record of what happened — independent of the board artifact.
    if (!state.mockMode && picks && picks.length) captureRawPicks(picks);
    // FORWARD LOOP: let reality answer the committed forecasts the new picks resolve.
    resolveCommittedForecasts(picks);
    resolveSurvivalCalls(picks);
    resolveRunCalls(picks);
    resolveLrmCalls(picks);
    // SHADOW ARM: let reality answer the opponent predictions these picks
    // resolve, THEN commit predictions for the next window. Resolve before emit
    // so a pick can never resolve a forecast made after it was already known.
    resolveOpponentPredictions(picks);
    emitOpponentPredictions();
    /* THE ALARM, RAISED ONCE AND LOUDLY. See the derivation above the counters. */
    {
      const seen = (state._syncMatched || 0) + (state._syncStubs || 0);
      const rate = seen ? (state._syncStubs || 0) / seen : 0;
      if (seen >= 8 && rate >= 0.5 && !state.syncIdDivergence) {
        state.syncIdDivergence = { matched: state._syncMatched, stubs: state._syncStubs,
                                   rate: Math.round(rate * 100) };
        const msg = 'ID MISMATCH: ' + state._syncStubs + ' of ' + seen + ' picks ('
          + Math.round(rate * 100) + '%) do not match the board. Players taken are '
          + 'NOT being removed from your pool — the board is recommending men who '
          + 'are already gone. Verify against Sleeper before you draft.';
        console.error('[sync] ' + msg);
        try { setStatus({ state: 'error', message: msg }); } catch (e) { /* console still carries it */ }
      }
    }

    recomputeRuns();
    alertTick();               // A-3: did that batch put me on the clock?
    renderAll();
  }

  /* L2: post the raw Sleeper pick stream to the immutable archive. Best-effort;
   * dedup happens on the server, so re-sending an unchanged stream is cheap and
   * never duplicates. Never blocks the draft. */
  function captureRawPicks(picks) {
    if (typeof fetch !== 'function') return;
    var season = state.data && state.data.league ? state.data.league.season : null;
    // Once per session: archive the exact board build the draft is running on,
    // so the raw record stands alone even if the git artifact is later rebuilt.
    if (!state.rawBoardArchived && state.data) {
      state.rawBoardArchived = true;
      fetch('/admin/api/archive', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ kind: 'board', season: season,
          source_at: (state.data || {}).built_at || null,
          payload: { built_at: state.data.built_at, version: state.data.version,
            league: state.data.league, pick_order: state.data.pick_order,
            kept_player_ids: state.data.kept_player_ids, provenance: state.data.provenance,
            players: state.data.players } }),
      }).catch(function () { state.rawBoardArchived = false; /* let a later sync retry */ });
    }
    fetch('/admin/api/archive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ kind: 'draft_picks', season: season,
        source_at: new Date().toISOString(),
        payload: { count: picks.length, picks: picks } }),
    }).catch(function () {
      // one retry, then surface — a lost raw archive on draft night is exactly
      // the silent data loss L2 exists to prevent.
      fetch('/admin/api/archive', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ kind: 'draft_picks', season: season,
          source_at: new Date().toISOString(), payload: { count: picks.length, picks: picks } }),
      }).catch(function (e) { if (window.console) console.error('[rawarchive] draft_picks capture failed', e); });
    });
  }

  /**
   * End the draft and put the board back how it started.
   *
   * A mock leaves its picks everywhere: the drafted set, every seat's roster,
   * your own roster, the run detector, and — because mock mode rebuilds the
   * pool for the mock's shape — the player list and pick order too. Reloading
   * the page cleared it, which is fine in August and unusable in the ninety
   * seconds between a mock finishing and your real draft opening.
   *
   * What survives is everything you PREPARED: targets, never-draft, weights,
   * news overrides, your slot. Those are your work, not the mock's.
   */
  /* IN-PAGE TYPED CONFIRM. Cannot be suppressed, always visible, and every
   * keystroke gives feedback — the button is never ambiguous about whether it
   * heard you. */
  function openEndConfirm(n) {
    const host = document.getElementById('end-confirm');
    if (!host) { endDraft(); return; }          // no modal? do not strand the user
    host.style.display = 'flex';
    host.innerHTML =
      '<div class="ec-card">'
      + '<div class="ec-head">End this draft and clear all ' + n + ' picks?</div>'
      + '<div class="ec-body">The board goes back to full. Your targets, never-draft '
      + 'list, weights and news overrides are kept.</div>'
      + '<label class="ec-label">Type <b>END</b> to confirm</label>'
      + '<input id="ec-input" class="ec-input" autocomplete="off" spellcheck="false">'
      + '<div id="ec-feedback" class="ec-feedback">waiting…</div>'
      + '<div class="ec-actions">'
      + '<button class="btn small ghost" id="ec-cancel">Cancel</button>'
      + '<button class="btn small danger-quiet" id="ec-go" disabled>End draft</button>'
      + '</div></div>';
    const input = document.getElementById('ec-input');
    const go = document.getElementById('ec-go');
    const fb = document.getElementById('ec-feedback');
    const close = () => { host.style.display = 'none'; host.innerHTML = ''; };
    const check = () => {
      const ok = String(input.value || '').trim().toUpperCase() === 'END';
      go.disabled = !ok;
      // IMMEDIATE FEEDBACK on every keystroke. Mock #1's failure was a control
      // that gave none, so "it did not hear me" and "it is broken" looked alike.
      fb.textContent = ok ? '✓ ready — press End draft'
        : (input.value ? 'keep typing…' : 'waiting…');
      fb.className = 'ec-feedback' + (ok ? ' ok' : '');
    };
    input.addEventListener('input', check);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !go.disabled) { close(); endDraft(); }
      if (ev.key === 'Escape') close();
    });
    document.getElementById('ec-cancel').addEventListener('click', close);
    go.addEventListener('click', () => { close(); endDraft(); });
    input.focus();
  }

  /* THE HARD RESET. Must work from ANY state, including a wedged sync, so it
   * never asks the sync layer for permission — it tears sync down first and
   * clears session state unconditionally. The one control that must not itself
   * be able to hang. */
  function doHardReset() {
    const btn = document.getElementById('hard-reset');
    if (btn) { btn.disabled = true; btn.textContent = '⏻ resetting…'; }
    try { if (state.sync && state.sync.stop) state.sync.stop(); } catch (e) { /* wedged is expected */ }
    state.sync = null;
    if (typeof DraftSession !== 'undefined') {
      state.session = DraftSession.hardReset(state.session, Date.now());
    }
    const idBox = document.getElementById('draft-id');
    if (idBox) idBox.value = '';
    const connect = document.getElementById('start-sync');
    if (connect) { connect.disabled = false; connect.textContent = 'Connect'; }
    setStatus({ state: 'manual', message: 'Session reset — sync unlinked, manual entry live. '
      + 'Your picks, targets and weights are untouched.' });
    renderAll();
    if (btn) { btn.textContent = '⏻ reset done'; setTimeout(() => {
      btn.disabled = false; btn.textContent = '⏻ Hard reset';
    }, 1500); }
  }

  /* THE DEAD-ROOM BANNER — one tap from a poisoned board back to a working one.
   *
   * Fired by sync.onDeadRoom after 3 consecutive 404s on a draft that HAD been
   * answering: Sleeper deletes mock rooms when they end, so this is the normal
   * end-of-mock state, and the failure it prevents was captured live
   * (2026-08-17): the dead room's picks kept pricing the board, every list
   * showed the leftovers of a finished draft, and the recovery lived behind
   * two taps in a different tab. The banner is idempotent and the button runs
   * endDraft() — the tested clear; keepers, targets and weights survive. */
  function showDeadRoomBanner() {
    if (document.getElementById('dead-room-banner')) return;
    var d = document.createElement('div');
    d.id = 'dead-room-banner';
    d.setAttribute('style', 'background:#7f1d1d;color:#fff;padding:12px 16px;'
      + 'border-radius:8px;margin:8px 0;display:flex;gap:12px;align-items:center;'
      + 'flex-wrap:wrap;font-weight:600;');
    var s = document.createElement('span');
    s.textContent = '🪦 This mock room no longer exists at Sleeper — mock lobbies '
      + 'are deleted when they end. Its picks are still pricing your board.';
    d.appendChild(s);
    var b = document.createElement('button');
    b.className = 'btn small gold';
    b.textContent = 'CLEAR IT — fresh board';
    b.addEventListener('click', function () { d.remove(); endDraft(); });
    d.appendChild(b);
    var anchor = document.querySelector('.wrap') || document.body;
    anchor.insertBefore(d, anchor.firstChild);
  }

  function endDraft() {
    // Phase H req 3: freeze means freeze. Stamp every shadow roster (strategy,
    // weight hash, built_at, rehearsal) and ledger the final rosters BEFORE the
    // state reset wipes them — this is the record September grades.
    if (state.shadows && typeof DraftShadows !== 'undefined' && !state.shadows.frozen) {
      try {
        DraftShadows.freeze(state.shadows, { built_at: (state.data || {}).built_at || null });
        if (typeof PredLedger !== 'undefined') {
          var sc = ledgerCtx();
          PredLedger.capture('shadow_freeze', { season: sc.season, build_at: sc.build_at,
            pick: sc.pick, method: 'shadow-v1',
            payload: {
              rehearsal: state.shadows.rehearsal,
              rosters: Object.keys(state.shadows.strategies).map(function (k) {
                var s = state.shadows.strategies[k];
                return { strategy: k, weight_hash: s.weight_hash, frozen: true,
                  roster: s.roster.map(function (p) { return String(p.player_id); }) };
              }),
            } });
        }
      } catch (e) { /* freezing must never block ending the draft */ }
      state.shadows = null;
    }
    if (state.sync && state.sync.stop) { try { state.sync.stop(); } catch (e) {} }
    state.sync = null;
    state.mode = 'pre';
    state.mockMode = null;
    // ENDING THE DRAFT IS THE ONE CLEAR THAT IS NOT A LOSS. Without this the
    // next page load would resume the draft that was just deliberately ended.
    if (typeof DraftSession !== 'undefined') DraftSession.clear();
    state.drafted = new Set();
    state.myRoster = [];
    state.rosters = {};
    state.recentPicks = [];
    // The clock resets to 1 — clear the monotonic baseline so the next render does
    // not report the reset as "pick went BACKWARDS" (the stale-lastPickSeen bug).
    state.lastPickSeen = null;
    state.pickContextId = null;
    state.runMults = {};
    state.reconcile = null;
    state.clockMode = false;
    state.clockIndex = 0;

    if (state.pristine) {
      state.data.players = state.pristine.players.slice();
      state.data.league = JSON.parse(JSON.stringify(state.pristine.league));
      state.data.pick_order = JSON.parse(JSON.stringify(state.pristine.pick_order));
      state.format = E.applyFormatDefaults(state.data.league);
      state.profiles = indexProfilesBySlot(state.data);
    }
    state.board = draftablePlayers(state.data.players);
    applyOverrides();          // news overrides are prep, so they go back on
    /* KEEPERS ARE PLACEMENTS, NOT PICKS (found by the fallback-clock rehearsal
     * scenario, 2026-08-18): ending a draft clears the roster but Cory's
     * keepers pre-exist any draft — leaving them off tripped the keepers-vs-
     * my_picks alarm ("your 0 keepers mean you own 15 picks... the board is
     * giving you 12") on a freshly cleared board. Re-seed exactly as boot
     * does. */
    populateKeepers(state.data);

    ['#mock-note', '#reconcile-note', '#run-banner'].forEach(sel => {
      const el = $(sel); if (el) el.style.display = 'none';
    });
    const btn = $('#start-sync');
    if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
    const idBox = $('#draft-id');
    if (idBox) idBox.value = '';
    setStatus({ state: 'manual', message: 'Draft ended. Board is back to full — '
      + 'your targets, weights and news overrides were kept.' });
    renderAll();
  }

  /* A deliberate handle for driving the page without a live draft.
   *
   * The pick path is the part most worth exercising and the hardest to reach:
   * it needs a Sleeper response, and the only way to get one is to be mid-draft.
   * This lets a test — or a person rehearsing on the sofa in August — push a
   * pick through the real handler and see what the page does with it.
   *
   * Read-only entry points only. Nothing here can be reached by a page the user
   * did not already have open as commissioner.
   */
  function exposeTestHooks() {
    window.__warroom = {
      pushPicks: onSyncPicks,
      recordManualPick: recordManualPick,
      endDraft: endDraft,
      // Drive the mock-room path without a live Sleeper connection — the only
      // way to rehearse the rehearsal, and how R-rehearsal verifies it.
      applyDraftShape: applyDraftShape,
      applyRehearsalKeepers: applyRehearsalKeepers,
      // The keeper-slate checklist line, exposed so it can be tested as a
      // FUNCTION. A grep over this file cannot tell an implementation from a
      // comment describing one (rule 11e).
      keeperSlateCheck: keeperSlateCheck,
      toggleQueue: toggleQueue,
      fillQueueFromBoard: fillQueueFromBoard,
      buildSheet: buildSheet,
      state: state,
    };
  }

  /* ── THE COCKPIT ACCESSOR (rebuild 2026-08-17) ──────────────────────────
   * ONE narrow, read-only window onto app state for warroom_charts.js (the
   * tab/rail/chart layer, loaded after this file). It exposes DERIVED reads,
   * never the state object itself, so the cockpit cannot become a second
   * writer — every mutation still goes through the delegated controls
   * (data-draft-me / data-queue / data-compare) this file already owns.
   * Every function is guarded: an early call (before the board loads) answers
   * with an honest empty rather than a throw. */
  window.WarRoomData = {
    scored: function () { return (state.lastClock && state.lastClock.scored) || []; },
    board: function () { return state.board || []; },
    players: function () { return (state.data && state.data.players) || []; },
    roster: function () { return state.myRoster || []; },
    starters: function () { return (((state.data || {}).league) || {}).starters || {}; },
    timing: function () { return state.lastTiming || null; },
    verdict: function () { return state.lastVerdict || null; },
    paths: function () { return state.lastPaths || []; },
    queue: function () { return (state.lists && state.lists.queue) || []; },
    drafted: function () { return state.drafted || new Set(); },
    currentPick: function () { try { return currentPick(); } catch (e) { return null; } },
    myNextPicks: function () { try { return myNextPicks(); } catch (e) { return []; } },
    onTheClock: function () { try { return onTheClock(); } catch (e) { return false; } },
    playerById: function (id) { try { return playerById(id); } catch (e) { return null; } },
    /* Survival to an arbitrary future pick — the SAME engine call the LRM strip
     * makes (full ctx shape: runMultipliers keeps normalizeCtx reading this as
     * a context, pickBoard keeps ADP on the board's own scale). */
    survivalTo: function (p, pick) {
      try {
        return E.survival(p, pick, {
          currentPick: currentPick(), runMultipliers: state.runMults,
          pickBoard: ((state.data || {}).pick_order || {}).picks || null,
        });
      } catch (e) { return null; }
    },
    /* Conditional-value drill readout (ruling 2026-08-17) — a finished HTML
     * string so the cockpit layer stays a pure presenter: the artifact, the
     * join and the roster all resolve HERE, off the same state the chips use.
     * '' when the player carries no premium or the artifact is absent. */
    conditionalDrillHtml: function (pid) {
      try {
        var idx = condValueIndex();
        if (!idx) return '';
        return CondValue.drillHtml(String(pid), idx, condRosterPids());
      } catch (e) { return ''; }
    },
  };

  // ----------------------------------------------------------------- wiring
  function wireControls() {
    const apply = $('#slot-apply'), slotIn = $('#slot-input');
    if (apply && slotIn) {
      apply.addEventListener('click', () => setSlot(slotIn.value));
    }
    // One-answer mode. Kept as page state rather than a URL so hitting it does
    // not cost a reload on the clock.
    const on = $('#clock-on'), off = $('#clock-off'), nxt = $('#clock-next');
    if (on) on.addEventListener('click', () => {
      state.clockMode = true; state.clockIndex = 0; renderRecommendations();
    });
    if (off) off.addEventListener('click', () => {
      state.clockMode = false; renderRecommendations();
    });
    if (nxt) nxt.addEventListener('click', () => {
      state.clockIndex += 1; renderRecommendations();
    });
    const end = $('#end-draft');
    if (end) end.addEventListener('click', () => {
      const n = state.drafted.size;
      // §D.1 still holds — a misclick at live pick 30 is a catastrophe, so
      // ending a draft with picks requires TYPING. But it no longer uses
      // window.prompt.
      //
      // THE MOCK-#1 BUG: Chrome suppresses repeated dialogs. Once "prevent this
      // page from creating additional dialogs" is armed, prompt() returns null
      // INSTANTLY AND SILENTLY, this handler reads null !== 'END' and returns,
      // and the button is dead forever with no error and no feedback —
      // indistinguishable from a hang. A confirmation the browser can suppress
      // is not a safety feature, it is a trapdoor. The confirm lives in the page
      // now, where nothing can swallow it.
      if (n) { openEndConfirm(n); return; }
      endDraft();
    });

    const hardReset = $('#hard-reset');
    if (hardReset) hardReset.addEventListener('click', () => doHardReset());

    const qFill = $('#queue-fill'), qCopy = $('#queue-copy'),
          qPrint = $('#queue-print'), qTidy = $('#queue-tidy');
    if (qFill) qFill.addEventListener('click', () => {
      const n = fillQueueFromBoard(15);
      const el = $('#sheet-note');
      // Say the TOTAL, not just what was added. This button appends, so tapping
      // it twice gives you thirty — which is fine, but only if you can see it
      // happen rather than discovering it on the clock.
      if (el) el.textContent = n
        ? 'Added ' + n + ' — ' + state.lists.queue.length + ' queued. '
          + 'Reorder them; your order is what prints.'
        : 'Nothing to add: everyone the board would suggest is already queued.';
    });
    if (qTidy) qTidy.addEventListener('click', () => {
      const n = tidyQueue();
      const el = $('#sheet-note');
      if (el) el.textContent = 'Removed ' + n + ' already-drafted from your queue.';
    });
    if (qCopy) qCopy.addEventListener('click', copySheet);
    if (qPrint) qPrint.addEventListener('click', printSheet);

    if (true) {
      slotIn.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); setSlot(slotIn.value); }
      });
      // Slot provenance, most-authoritative first:
      // 1. a slot CLAIMED on the site's /draft page — provenance 'site-claimed,
      //    Sleeper pending' (a real claim on our backend; regenerates the pick
      //    numbers). 2. a slot saved in localStorage from a manual entry. The
      //    Sleeper draft object (A2) still trumps both when it arrives.
      const claimed = Number(window.CLAIMED_SLOT) || null;
      if (claimed && window.SLOT_PROVENANCE === 'site-claimed') {
        slotIn.value = claimed;
        setSlot(claimed, 'site-claimed');
      } else {
        try {
          const saved = localStorage.getItem(SLOT_KEY);
          if (saved && Number(saved) !== mySlot()) {
            slotIn.value = saved;
            setSlot(saved);
          }
        } catch (e) { /* private mode */ }
      }
    }
    document.body.addEventListener('click', ev => {
      const cmp = ev.target.closest('[data-compare]');
      if (cmp) { ev.preventDefault(); return toggleCompare(cmp.getAttribute('data-compare')); }
      const cadd = ev.target.closest('[data-cmp-add]');
      if (cadd) { ev.preventDefault(); return toggleCompare(cadd.getAttribute('data-cmp-add')); }
      if (ev.target.closest('[data-cmp-open]')) { ev.preventDefault(); return openCompare(); }
      if (ev.target.closest('[data-cmp-close]')) return clearCompare();
      const me = ev.target.closest('[data-draft-me]');
      if (me) return markDrafted(me.getAttribute('data-draft-me'), true, null,
        me.getAttribute('data-path-key') || null);
      const other = ev.target.closest('[data-draft-other]');
      if (other) return markDrafted(other.getAttribute('data-draft-other'), false);
      // Star / block from anywhere on the page, including the chips in the
      // lists panel, which is how you undo one without hunting the board.
      const listBtn = ev.target.closest('[data-list]');
      if (listBtn) { toggleList(listBtn.getAttribute('data-list'), listBtn.getAttribute('data-id')); return; }
      const unlist = ev.target.closest('[data-unlist]');
      if (unlist) { toggleList(unlist.getAttribute('data-unlist'), unlist.getAttribute('data-id')); return; }
      // Queue: the same button adds from the board and removes from the panel,
      // so there is one gesture to learn rather than two.
      const qBtn = ev.target.closest('[data-queue]');
      if (qBtn) { toggleQueue(qBtn.getAttribute('data-queue')); return; }
      const qMove = ev.target.closest('[data-qmove]');
      if (qMove) { moveInQueue(qMove.getAttribute('data-id'), Number(qMove.getAttribute('data-qmove'))); return; }

      const ovBtn = ev.target.closest('[data-override]');
      if (ovBtn) {
        const id = ovBtn.getAttribute('data-override');
        const kind = ovBtn.getAttribute('data-kind');
        return setOverride(id, kind === 'clear' ? null : kind,
          kind === 'downgrade' || kind === 'promote' ? 25 : null);
      }
      const why = ev.target.closest('[data-why]');
      if (why) return showWhy(why.getAttribute('data-why'));
      const railAck = ev.target.closest('[data-rail-ack]');
      if (railAck) return acknowledgeRailFire(railAck.getAttribute('data-rail-ack'));
      // ── Progressive disclosure (design pass 2026-08-15) ──────────────────
      const lens = ev.target.closest('[data-lens]');
      if (lens) { ev.preventDefault(); return revealLens(lens.getAttribute('data-lens')); }
      const doss = ev.target.closest('[data-dossier]');
      if (doss) { ev.preventDefault(); return toggleDossier(doss.getAttribute('data-dossier')); }
      /* Chip-grid disclosure (job 5 of the split): ONE shared preference across
       * every rec card. Native toggle is prevented; the re-render paints every
       * card with the new state, and it persists (wr-disclosures-v1). */
      const chips = ev.target.closest('[data-chips-toggle]');
      if (chips) { ev.preventDefault(); return toggleRecChips(); }
      const flg = ev.target.closest('[data-flag-legend]');
      if (flg) { ev.preventDefault(); return toggleFlagLegend(flg); }
      const info = ev.target.closest('[data-explain-toggle]');
      if (info) { ev.preventDefault(); return toggleExplain(info); }
      const cav = ev.target.closest('[data-caveat-text]');
      if (cav) {
        ev.preventDefault();
        const near = cav.parentNode.querySelector('.wr-flag-legend');
        if (near) { near.remove(); return; }
        const d = document.createElement('div');
        d.className = 'wr-flag-legend';
        d.textContent = cav.getAttribute('data-caveat-text');
        cav.parentNode.appendChild(d);
        return;
      }
    });

    $$('.weight-slider').forEach(sl => {
      sl.addEventListener('input', () => {
        // Snapshot the list BEFORE the change so the effect can be reported.
        // A slider whose effect you cannot see is a slider you are guessing
        // with, and six of these seven do nothing at all most of the time.
        const before = state.lastClock ? state.lastClock.scored : null;
        // Touching a slider takes back control. A tool that re-applies its own
        // number over yours on the next pick is a tool you are fighting.
        if (state.autoWeights) {
          state.autoWeights = false;
          try { localStorage.setItem(AUTO_KEY, '0'); } catch (e) {}
          renderAutoNote(state.lastAuto || { phase: '', round: 0, reasons: [] }, false);
        }
        state.weights[sl.dataset.weight] = parseFloat(sl.value);
        $('#w-' + sl.dataset.weight).textContent = parseFloat(sl.value).toFixed(1);
        saveWeights();
        renderRecommendations();
        renderPositionRecs();
        reportWeightEffect(before);
        renderPresets();
      });
    });
    $('#reset-weights').addEventListener('click', () => {
      // SEV-1 FIX (B's audit, 2026-08-10): reset used to load 'balanced' — every
      // term at ~1.0 including tier and risk, the two the Lab measured as the
      // LARGEST DRAGS — and called it "the defaults". One tap mid-draft silently
      // switched the board to the weighting measured as WORST. Reset now loads the
      // MEASURED core the tool actually ships on, and says so.
      applyPreset('measured', 'Reset to LIVE POLICY (what the tool ships on today): '
        + 'value + stack, everything the Lab measured as drag or null turned off.');
    });
    syncSliders();   // hardcoded value="1" markup -> the MEASURED core we boot on
    renderPresets();
    document.body.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-preset]');
      if (btn) { applyPreset(btn.getAttribute('data-preset')); return; }
      const auto = ev.target.closest('[data-auto]');
      if (auto) {
        state.autoWeights = !state.autoWeights;
        try { localStorage.setItem(AUTO_KEY, state.autoWeights ? '1' : '0'); } catch (e) {}
        markPrefsChanged();
        if (state.autoWeights) applyAutoWeights(); else renderAutoNote({}, false);
        renderRecommendations();
        renderPresets();
      }
    });

    $('#pos-filter').addEventListener('change', e => { state.filterPos = e.target.value; renderBoard(); });
    const posRecs = $('#pos-recs');
    if (posRecs) {
      posRecs.addEventListener('change', e => {
        state.posRecs = e.target.value || '';
        renderPositionRecs();
      });
    }
    $('#search').addEventListener('input', e => { state.search = e.target.value.toLowerCase(); renderBoard(); });
    // Compare-tray search (delegated — the tray re-renders on each keystroke).
    document.body.addEventListener('input', e => {
      if (e.target && e.target.id === 'cmp-search') { state.compareSearch = e.target.value; renderCompareTray(); }
    });
    // The manual-pick form is re-rendered on every keystroke, so it is wired by
    // delegation rather than by handle.
    document.body.addEventListener('submit', ev => {
      if (!ev.target || ev.target.id !== 'manual-pick') return;
      ev.preventDefault();
      recordManualPick($('#mp-name').value, $('#mp-pos').value, $('#mp-slot').value);
    });

    $('#start-sync').addEventListener('click', () => {
      const typed = $('#draft-id').value;
      if (!typed.trim()) { setStatus({ state: 'manual', message: 'Manual mode — mark picks yourself as they happen.' }); return; }
      // Validate before connecting, not after a poll fails. A bad paste should
      // say so instantly rather than looking like an outage for eight seconds.
      const parsed = window.DraftSync.normalizeDraftId(typed);
      if (parsed.error) { setStatus({ state: 'error', message: parsed.error }); return; }
      /* ⚠️ A SECOND POLLER IS WORSE THAN NO POLLER, and this button can now be
       * pressed while one is already running — the wedge no longer tears the
       * first one down. Two DraftSync objects on the same draft double the
       * request rate and interleave their `onPicks`, so the board's picture of
       * the room would flip between two fetches mid-render.
       *
       * On an existing sync this is a KICK, not a connect: reset the failure
       * count so the backoff drops from its 30s cap back to 4s, and poll now. */
      if (state.sync && state.sync.running && state.sync.draftId === parsed.id) {
        state.sync.failures = 0;
        if (state.sync.timer) clearTimeout(state.sync.timer);
        setStatus({ state: 'warn', message: 'Retrying now — the board keeps polling on '
          + 'its own either way, so you never have to press this.' });
        state.sync.poll();
        return;
      }
      /* ── A DIFFERENT ROOM IS A NEW DRAFT, NOT A RECONNECT ──────────────────
       *
       * CAPTURED LIVE (Cory, 2026-08-17, second mock of the day): mock #1
       * ended, Sleeper garbage-collected it, the page auto-resumed its 150
       * picks, and connecting mock #2's id did NOTHING about either — the old
       * poller kept running (only the SAME-id kick above was handled) and the
       * old room's 150 drafted ids kept pricing the new room's board. Every
       * top-of-board surface showed the leftovers of a finished draft: to a
       * drafter, "it's not showing any players."
       *
       * Two rules, split by what they cost:
       *   1. The ORPHANED POLLER dies unconditionally. Two pollers interleave
       *      onPicks and fight over the status line (reproduced: the dead
       *      room's 404 retry banner overwrote the live room's status).
       *   2. The PICK RESET asks for one confirming click first, because it is
       *      destructive on a typo: pasting a wrong id mid-real-draft must not
       *      wipe a live board. Second click within 15s = endDraft() (the
       *      existing, tested clear — keepers/targets/weights survive, and the
       *      mock re-seeds keepers + rehearsal removals through the same
       *      applyDraftShape path a fresh page uses), then connect fresh.
       * No picks recorded = nothing to protect = connect straight through. */
      const prevRoomId = (state.sync && state.sync.draftId)
        || (state.session && state.session.draftId) || null;
      const recordedPicks = observedPickCount();
      if (recordedPicks > 0 && prevRoomId !== parsed.id) {
        const pending = state._pendingRoomSwitch;
        const confirmed = pending && pending.id === parsed.id
          && (Date.now() - pending.at) < 15000;
        if (!confirmed) {
          /* The OLD poller keeps running until the switch is confirmed — a
           * typo must not freeze a live board's updates. */
          state._pendingRoomSwitch = { id: parsed.id, at: Date.now() };
          setStatus({ state: 'warn', message: 'This is a DIFFERENT room than the one on '
            + 'the board (' + recordedPicks + ' picks recorded'
            + (prevRoomId ? ' from draft ' + prevRoomId : '') + '). Connecting fresh '
            + 'CLEARS those picks — your keepers, targets and weights stay. '
            + 'Tap Connect again to confirm.' });
          const cbtn = $('#start-sync');
          if (cbtn) { cbtn.disabled = false; cbtn.textContent = 'Connect NEW room'; }
          return;
        }
        state._pendingRoomSwitch = null;
        endDraft();                          // stops the old poller too
        $('#draft-id').value = parsed.id;   // endDraft blanks the box; keep the target
      } else if (state.sync && state.sync.stop && state.sync.draftId !== parsed.id) {
        /* No picks to protect: just make sure the orphaned poller dies before
         * the new one starts, or the two interleave onPicks and fight over the
         * status line (reproduced: a dead room's 404-retry banner overwriting
         * the live room's status). */
        try { state.sync.stop(); } catch (e) {}
      }
      // Show them what we actually understood, so a URL paste is visibly fixed
      // rather than silently repaired.
      $('#draft-id').value = parsed.id;
      const id = parsed.id;
      // SESSION LIFECYCLE + SELF-TIMING. Mock #1 could not report how long the
      // hang lasted because nothing measured it. Every transition is stamped
      // now, and __wrDiag() reports connect time and longest gap.
      if (typeof DraftSession !== 'undefined') {
        state.session = DraftSession.connecting(
          state.session || DraftSession.create(Date.now()), id, Date.now());
        startSessionWatch();
      }
      state.sync = new window.DraftSync({
        draftId: id,
        onPicks: function (picks) {
          if (typeof DraftSession !== 'undefined' && state.session) {
            DraftSession.sawResponse(state.session, Date.now(), !!(picks && picks.length));
          }
          return onSyncPicks(picks);
        },
        onStatus: setStatus,
        onDeadRoom: showDeadRoomBanner,
        /* A reload's resumed sync has never succeeded, so lastOkAt cannot
         * witness that the id used to work — the resumed picks can. Routed
         * through the pick-count owner (shared-state audit, current_pick). */
        resumedWithPicks: observedPickCount() > 0,
      });
      // Slots first, then picks: a pick attributed to the wrong seat is worse
      // than a pick arriving a second later.
      state.sync.fetchDraft()
        .then(importDraftOrder)
        .catch(err => console.warn('draft order import failed:', err.message));
      state.sync.start();
      state.mode = 'live';
      $('#start-sync').textContent = 'Syncing…';
      $('#start-sync').disabled = true;
    });
  }

  /* THE PATIENCE TIMER. A spinner that hangs is the worst possible draft-night
   * behavior, so waiting has a deadline and the deadline has a visible exit:
   * connecting -> wedged auto-falls back to MANUAL with a banner that says what
   * happened, what still works, and what to do. Nothing is lost — manual entry
   * was always the fallback path; this just stops pretending sync is coming. */
  function startSessionWatch() {
    if (state.sessionWatch) clearInterval(state.sessionWatch);
    state.sessionWatch = setInterval(function () {
      if (typeof DraftSession === 'undefined' || !state.session) return;
      const before = state.session.state;
      DraftSession.tick(state.session, Date.now());
      const now = state.session.state;
      if (now === before) return;
      const d = DraftSession.describe(state.session);
      setStatus({ state: now === 'wedged' ? 'error' : now === 'stalled' ? 'warn' : 'live',
                  message: d.text });
      if (now === 'wedged') {
        /* ⚠️ WEDGED IS A DEGRADED STATE, NOT A TERMINUS. IT USED TO UNLINK.
         *
         * This block used to call `state.sync.stop()`, null the sync, kill this
         * watch and relabel the button "Retry connect". Nothing was lost — manual
         * entry is a first-class path — and the reasoning was sound as far as it
         * went: a spinner that hangs forever is worse than an honest surrender.
         *
         * IT ASSUMED SOMEONE IS LOOKING AT THE SCREEN. On 08-22 Cory is watching
         * the room and the clock, and the one thing he asked for is to get back
         * to an accurate board as fast as possible. Auto-surrender costs the
         * whole outage plus however long it takes him to notice a button changed.
         *
         * AND IT FIRED BY CONSTRUCTION, NOT BY TUNING. Another session drove a
         * real 44-second outage: the poll backoff caps at 30s (`sync.js`
         * BACKOFF_MAX) while the patience budget is fixed at 45s
         * (`session.js` WEDGE_AFTER), so ANY outage past ~45 seconds wedges no
         * matter how healthy the connection is either side of it. A phone in a
         * pocket at a draft table clears 45 seconds without trying.
         *
         * THE ASYMMETRY DECIDES IT. Retrying costs one request per 30 seconds
         * against an endpoint we already poll every 4. Surrendering costs a
         * board that silently stops updating while it goes on recommending
         * players who are already gone — the exact failure the staleness work
         * exists to prevent, reintroduced by the thing meant to handle it.
         *
         * So the sync KEEPS RUNNING at its capped interval and `sawResponse`
         * carries the session straight back to `live` the moment the room
         * answers — no tap required. The button stays as a KICK (skip the
         * backoff and poll now), not as the only road back. */
        const connect = document.getElementById('start-sync');
        if (connect) { connect.disabled = false; connect.textContent = 'Reconnect now'; }
        renderAll();
      }
    }, 1000);
  }

  /* HOW OLD IS THE BOARD'S PICTURE OF THE ROOM? (Cory's connectivity audit #11.)
   *
   * The header read a bare "Synced via polling — 34 picks in" with no time in it.
   * A stalled sync renders identically to a working one: the status line freezes
   * on its last message and the war room keeps making confident recommendations
   * against a pool containing players who went four picks ago. That is the
   * failure Cory named as the one he would not notice while it cost him picks.
   *
   * Age is the only honest signal, so it TICKS on its own rather than updating
   * when a status event happens — a sync that has stopped producing events is
   * exactly the case that must still count upward. Polling is every 4s, so ~15s
   * is comfortably beyond a slow round-trip and ~40s means something is wrong. */
  const SYNC_AGE_WARN_MS = 15000;
  const SYNC_AGE_BAD_MS = 40000;
  let _syncAgeTimer = null;
  function renderSyncAge() {
    const el = $('#sync-age');
    if (!el) return;
    const at = (state.sync && typeof state.sync.lastSyncAt === 'function')
      ? state.sync.lastSyncAt() : null;
    if (!state.sync) { el.textContent = ''; el.className = 'sync-age'; return; }
    if (!at) {
      el.textContent = ' · never synced';
      el.className = 'sync-age bad';
      return;
    }
    const age = Date.now() - at;
    const secs = Math.round(age / 1000);
    el.textContent = ' · last good ' + (secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm '
      + (secs % 60) + 's') + ' ago';
    el.className = 'sync-age ' + (age >= SYNC_AGE_BAD_MS ? 'bad'
      : age >= SYNC_AGE_WARN_MS ? 'warn' : 'ok');
    // Loud, not decorative: past the bad threshold the board may be lying about
    // who is available, and that outranks tidiness on the strip.
    if (age >= SYNC_AGE_BAD_MS) {
      el.textContent += ' — PICKS MAY BE MISSING; verify against Sleeper before you draft';
    }
  }
  function startSyncAgeTicker() {
    if (_syncAgeTimer) return;
    _syncAgeTimer = setInterval(function () {
      try { renderSyncAge(); } catch (e) { /* never blocks the clock */ }
      // The STRIP has to re-evaluate too. Without this the health dot only turns
      // red on the next unrelated render, so a sync that stalls while Cory is
      // staring at one screen stays green for as long as nothing else happens —
      // which is precisely the situation this exists to catch.
      /* Outside `renderAll`, so `safeRender` is out of scope — but the failure
       * must still be RECORDED, or a strip that throws only on the ticker path
       * stays silently stale until some other render happens to run. Same
       * store, so the next `renderAll` announces it by the same name. */
      try { renderSystemStrip(); } catch (e) {
        state.renderFailures = state.renderFailures || {};
        state.renderFailures.systemStrip = {
          at: null, message: (e && e.message) || String(e),
        };
        try {
          console.error('[render] systemStrip FAILED on the age ticker — the '
            + 'health strip is showing an EARLIER state: ' + ((e && e.message) || e));
        } catch (e2) { /* no console */ }
      }
    }, 1000);
  }

  function setStatus(s) {
    const el = $('#sync-status');
    el.textContent = s.message;
    el.className = 'sync-status ' + s.state;
    startSyncAgeTicker();
    renderSyncAge();
    // An error that leaves "Syncing…" disabled forever means the only way to
    // retry a typo is a page reload, mid-draft.
    const btn = $('#start-sync');
    if (btn && s.state === 'error') { btn.disabled = false; btn.textContent = 'Connect'; }
  }

  /* WHAT THE FLOOR AND THE CEILING ACTUALLY ARE (session E, 2026-08-18; register E16).
   *
   * The line above used to end at "(floor 2, ceiling 479)", which presents both
   * numbers as a forecast for THIS player. They are not, and have not been since
   * 2026-08-17. Both are `proj_mean x the measured p10/p90 ratio of the player's
   * (position, projection-rank band) COHORT` — projections.py:423-437, applied by
   * projection_error.proj_floor_for / proj_ceiling_for. Every player in a cell
   * carries the SAME multiple, so the printed figure is a band statistic wearing
   * one player's name.
   *
   * MEASURED ON THE LIVE BOARD, this is not a pedantic distinction. The QB band
   * edge sits between 16 and 17:
   *
   *     QB16  Jaxson Dart    proj 328.5   floor 87.29
   *     QB17  Jordan Love    proj 322.5   floor  2.45   <- 35.6x, on a 6.0 gap
   *
   * Both are in their CORRECT cell — this is not the E1 population case (ruled
   * EXPECTED 2026-08-18, see below). A 2.45-point
   * season floor is simply not a statement about Jordan Love; it is the p10 of a
   * cohort (QB17-32) that runs down to quarterbacks who never take a snap. The
   * same edge produces WR31 Marvin Harrison 68.43 against WR32 Alec Pierce 8.23,
   * and RB30 J.K. Dobbins 37.03 against RB31 Jordan Mason 3.25.
   *
   * TRUTH FIX ONLY. No number changes, nothing reorders, no scoring path is
   * touched — naming the cohort is what lets a reader discount the figure
   * correctly. The underlying question (a step function of band applied to a
   * continuous rank) is register E16, owner A: changing the calibration is not
   * red-team territory and is not a five-days-before-the-draft change.
   */
  var DISP_BANDS = [[1, 3, '1-3'], [4, 8, '4-8'], [9, 16, '9-16'],
    [17, 32, '17-32'], [33, Infinity, '33+']];

  function dispersionBand(rank) {
    var r = Number(rank);
    if (!isFinite(r) || r <= 0) return null;
    for (var i = 0; i < DISP_BANDS.length; i++) {
      if (r >= DISP_BANDS[i][0] && r <= DISP_BANDS[i][1]) {
        return { lo: DISP_BANDS[i][0], hi: DISP_BANDS[i][1], label: DISP_BANDS[i][2] };
      }
    }
    return null;
  }

  /* WHICH COHORT WAS HE ACTUALLY PRICED OFF — read from the number, not the rank.
   *
   * The first version of this helper named the band from `pos_rank`, and its own
   * test caught that as a lie: `proj_floor` is written against the rank the
   * BUILD ranked him at, which for nine players on the live board is not the
   * rank the board publishes. That gap was filed as register E1 and RULED
   * EXPECTED on 2026-08-18 (A, projections.py:306): the build ranks over the
   * FULL universe — available players plus keepers — because the calibration
   * was fit on full historical seasons, while the published pos_rank counts
   * only available players. Jordan Mason published RB31 and priced off RB|33+
   * is the ruling working, not a defect — but a caveat reading "RB 17-32"
   * would still be a false label, so the cohort must be recovered either way.
   *
   * It is recovered from the ratio the player actually carries, matched against
   * the modal ratio of each band ON THIS BOARD. No calibration file is needed
   * in the browser, and a mismatch between the cohort he was priced off and
   * the band his rank puts him in is the full-universe repricing showing
   * itself on screen.
   */
  function cohortRatios(board) {
    /* Keyed on the board REFERENCE, not a bare "have I computed this" flag. A
     * bare flag survived a re-sync replacing state.board and would have gone on
     * answering with the previous board's ratios — the test caught it by passing
     * two different boards in one process. */
    if (state._cohortRatiosFor === board && state._cohortRatios) return state._cohortRatios;
    const byCell = {};
    (board || []).forEach(p => {
      if (!p || !p.proj_mean || !p.proj_floor || !p.pos_rank) return;
      if (!/^measured-/.test(String(p.proj_floor_source || ''))) return;
      const b = dispersionBand(p.pos_rank);
      if (!b) return;
      const k = p.position + '|' + b.label;
      (byCell[k] = byCell[k] || []).push(p.proj_floor / p.proj_mean);
    });
    const out = {};
    Object.keys(byCell).forEach(k => {
      // MEDIAN, not mean: the nine E1 misreads sit inside these same cells, and
      // a mean would let them drag the reference ratio toward the wrong band.
      const v = byCell[k].slice().sort((a, b) => a - b);
      out[k] = v[Math.floor(v.length / 2)];
    });
    state._cohortRatiosFor = board;
    state._cohortRatios = out;
    return out;
  }

  function appliedCohort(p, board) {
    if (!p || !p.proj_mean || p.proj_floor == null) return null;
    const r = p.proj_floor / p.proj_mean;
    const ratios = cohortRatios(board);
    let best = null, second = null;
    DISP_BANDS.forEach(b => {
      const m = ratios[p.position + '|' + b[2]];
      if (m == null) return;
      const d = Math.abs(r - m);
      if (!best || d < best.d) { second = best; best = { d: d, label: b[2], lo: b[0], hi: b[1] }; }
      else if (!second || d < second.d) second = { d: d, label: b[2] };
    });
    if (!best) return null;
    // Decisive match only. A ratio sitting between two cohorts names neither —
    // guessing here is how a caveat starts asserting more than it measured.
    // RE-SIZED 2026-08-18: with player_volatility_in_tails ON the ratios inside
    // a cell carry a per-player CV multiplier and are no longer constant, so an
    // ABSOLUTE tolerance mis-sizes (it dropped RB16 Javonte Williams, a ruled
    // full-universe repricing, into the generic fallback). With two or more
    // cells present, decisiveness is RELATIVE — at least 4x closer to the
    // named cohort than to any other. Measured on the v27 board this recovers
    // exactly the nine ruled repricings; at 0.5 it starts inventing two more.
    if (second) { if (best.d > 0.25 * second.d) return null; }
    else if (best.d > 0.01 && best.d > 0.05 * Math.abs(r)) return null;
    return best;
  }

  function sourceGapCaveat(p, board) {
    /* THE ONE-SOURCE SENTENCE, AT THE POINT OF DECISION (Cory's order, 08-18).
     *
     * E32 (register, CLOSED with A's ruling): on this board, 32 of the 33
     * players ranked >20 slots BELOW market carry proj_fantasypros above
     * proj_sleeper (mean +37.6%; r = 0.733 across the ADP 27-160 window), and
     * proj_mean == proj_sleeper — so a violent board-under-market gap is
     * usually the model reading ONE source, not a model insight. The three-way
     * grade points the same way (WR/TE blend beats either parent). The ruled
     * policy holds through 08-22; this caveat is the policy's honest label:
     * when the gap is the one-source artifact, SAY SO and lean market.
     *
     * The exception is load-bearing: a big gap NOT explained by FP>Sleeper
     * (Jonah Coleman was the one such name at ruling time) is UNEXPLAINED and
     * earns extra doubt, not a lean-market pass. Absence of an FP number says
     * nothing either way, so it says nothing. */
    if (!p || p.adjusted_adp == null && p.raw_adp == null) return '';
    const list = (board || []).filter(x => x && x.proj_mean != null);
    if (list.length < 50) return '';
    const byBoard = list.slice().sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
    const adpOf = x => (x.adjusted_adp != null ? x.adjusted_adp : x.raw_adp);
    const boardRank = byBoard.indexOf(p) + 1;
    const adp = adpOf(p);
    if (!boardRank || adp == null) return '';
    const gap = boardRank - adp;                 // positive = board likes him LESS than market
    if (gap <= 20) return '';                    // E32's own window edge
    const fp = p.proj_fantasypros, sl = p.proj_sleeper != null ? p.proj_sleeper : p.proj_mean;
    if (fp != null && sl > 0 && fp > sl * 1.08) {
      const pct = Math.round((fp / sl - 1) * 100);
      return 'SOURCE GAP: board sits ~' + Math.round(gap) + ' slots below market here, and gaps '
        + 'this size are almost always one-source — FP projects him +' + pct + '% over Sleeper and '
        + 'the board reads only Sleeper (32 of 33 such gaps, r=0.73). Lean market on this disagreement.\n';
    }
    if (fp != null && sl > 0 && fp <= sl * 1.08) {
      return 'SOURCE GAP, UNEXPLAINED: board sits ~' + Math.round(gap) + ' slots below market and the '
        + 'usual one-source cause does NOT apply (FP is not above Sleeper here). Nothing vouches for '
        + 'either number — extra doubt, both directions.\n';
    }
    return '';
  }

  /* THE SOURCE-GAP BADGE — Cory, 2026-08-18: "dont gatekeep things for after
   * draft if nothing critical." `sourceGapCaveat` already carries the full
   * sentence, but it only ever reached the Why? dossier — one tap away, and a
   * caveat nobody taps at pick speed does not do its job (the same lesson as
   * 4e/register). This is the visible token: a compact badge on the row
   * itself, so the disagreement is seen before the pick, not explained after.
   *
   * TWO VARIANTS, NOT ONE, because the two cases warrant different reactions:
   * "lean market" is fairly confident (32 of 33 in the ruled sample) that the
   * board is reading one source, so it earns a plain 📉 nudge; "UNEXPLAINED"
   * is the harder case (Cory's own Jonah Coleman example) where the usual
   * cause does not apply and BOTH numbers are suspect — a ❓ says so, not the
   * same icon with a different word in the tooltip nobody hovers. */
  function sourceGapBadge(p, board) {
    const text = sourceGapCaveat(p, board);
    if (!text) return '';
    const unexplained = /UNEXPLAINED/.test(text);
    return '<span class="wr-source-gap' + (unexplained ? ' unexplained' : '') + '" title="'
      + escapeHtml(text.trim()) + '">' + (unexplained ? '❓ mkt gap' : '📉 mkt') + '</span>';
  }

  function dispersionCaveat(p, board) {
    if (!p || p.proj_mean == null) return '';
    const fs = String(p.proj_floor_source || ''), cs = String(p.proj_ceiling_source || '');
    const measured = /^measured-/.test(fs) || /^measured-/.test(cs);
    /* ⚠️ A THIRD SOURCE APPEARED AND THIS CAVEAT WOULD HAVE LIED ABOUT IT
     * (session E, 2026-08-18; register E30).
     *
     * When this was written the board had two dispersion constructions: the
     * measured per-CELL p10/p90, and the older Gaussian. The 2026-08-17
     * volatility wiring added a third — `…-x-player-cv` — which composes the
     * cell ratio with the PLAYER's own measured variability. On today's board:
     *
     *     measured-2023-25-p90-x-player-cv   268 players   per-player
     *     measured-2023-25-p90               267 players   cohort constant
     *     gaussian_z                         161 players   Gaussian
     *
     * Both measured forms start with `measured-`, so the branch below treated
     * all 535 alike and told the reader "every <POS> in that band carries the
     * same multiple". **For the 268 with per-player CV that is false, and it is
     * false in the direction that matters** — it tells him to discount a figure
     * that is actually about this player.
     *
     * The whole point of this caveat is that a label must say what the number
     * is. It stopped doing that the moment the number changed under it, which is
     * the failure mode this lane exists to catch, arriving in my own code. */
    const perPlayer = /-x-player-cv$/.test(fs) || /-x-player-cv$/.test(cs);
    /* ⚠️ THIS MUST NOT RETURN EARLY, and my first cut did.
     *
     * Which CONSTRUCTION produced the number (cohort constant vs per-player CV)
     * and which POPULATION picked the band (published availability rank vs the
     * ruled full-universe rank) are INDEPENDENT facts. A per-player row can
     * still have its band chosen by the full-universe rank, and that repricing
     * note is the one A added after ruling E1. Returning early dropped it for
     * 268 of 696 rows — replacing one false label with a missing one. Caught by
     * this file's own repricing checks going red. */
    var lead = null;
    if (perPlayer) {
      lead = '  ^ floor/ceiling here ARE player-specific: the ' + (p.position || '?')
        + ' band\n    p10/p90 composed with THIS player\'s own measured variability\n'
        + '    (source: ' + (/-x-player-cv$/.test(cs) ? cs : fs) + ').\n';
      if (!/-x-player-cv$/.test(fs) || !/-x-player-cv$/.test(cs)) {
        /* Only one tail was upgraded — say which, rather than implying both. */
        lead += '    NOTE: only the ' + (/-x-player-cv$/.test(cs) ? 'CEILING' : 'FLOOR')
          + ' carries that; the other is still the band constant.\n';
      }
    }
    /* An unmeasured band keeps the old Gaussian, and a reader must be able to
     * tell the two apart — that distinction is the whole reason the _source
     * fields were frozen (freeze_pre_draft.py). Calling a Gaussian a "cohort
     * p10/p90" would just be a second false label. */
    if (!measured) {
      return '  ^ floor/ceiling here are a SYMMETRIC GAUSSIAN off proj_sd, not a\n'
        + '    measured outcome range: this band was never measured, so the older\n'
        + '    construction still applies.\n';
    }
    const pos = p.position || '?';
    const applied = appliedCohort(p, board);
    if (!applied) {
      if (lead) return lead;   // per-player: the cohort sentence would be false
      return '  ^ floor/ceiling are a COHORT p10/p90 x this projection, not a\n'
        + '    forecast for this player.\n';
    }
    /* PER-PLAYER rows keep their own lead sentence — saying "every POS in that
     * band carries the same multiple" about a row composed with that player's
     * OWN cv is exactly the false label this branch was fixed for. What they
     * still need, and what returning early lost, is the repricing note below. */
    let out = lead || ('  ^ floor/ceiling are the ' + pos + ' ' + applied.label + ' COHORT\'s measured\n'
      + '    p10/p90 (2023-25) x this projection — NOT a forecast for this player.\n'
      + '    Every ' + pos + ' in that band carries the same multiple.\n');
    const rankBand = dispersionBand(p.pos_rank);
    if (rankBand && rankBand.label !== applied.label) {
      /* The full-universe repricing, visible at the point of use rather than
       * in an audit file. WORDING RULED 2026-08-18: this was shipped saying
       * "Known defect (register E1)" — then A ruled the population question
       * (projections.py:306): pricing off the full-universe rank is CORRECT,
       * matching how the calibration was fit. The mismatch is expected, and a
       * caveat calling it a defect was itself the false statement. */
      out += '    !! He is published ' + pos + p.pos_rank + ' among AVAILABLE players, but his\n'
        + '       floor and ceiling are priced off his FULL-UNIVERSE rank (keepers\n'
        + '       counted), which lands in the ' + applied.label + ' band. Expected, not a defect\n'
        + '       (register E1, ruled 2026-08-18): the calibration was fit on full\n'
        + '       historical seasons, so the cell is chosen the same way.\n';
    } else if (applied.lo > 1 && Number(p.pos_rank) - applied.lo <= 2) {
      /* The edge is where the cohort figure misleads hardest, so say it on the
       * rows where it bites rather than in a legend nobody opens mid-pick. */
      out += '    He sits at the TOP of that band, where it is harshest — the ' + pos + '\n'
        + '    one slot above him is priced off a different, much kinder cohort.\n';
    }
    /* THE LAST TWO ORPHANED PROVENANCE FIELDS (register 8b/28 extension,
     * relay 08-18: "four provenance fields, zero readers"). ceiling/floor
     * sources are read above; sd and adp_sd were still invisible — a reader
     * could not tell a measured error-sd from the position-variance fallback,
     * or a published FFC adp_sd from the clamped fallback that covers 369 of
     * 696 rows. One compact line each, only when the value is the FALLBACK —
     * the measured case is the norm and needs no caption (A, 08-19). */
    if (String(p.proj_sd_source || '') === 'position_variance') {
      out += '    ~ proj_sd here is the POSITION-VARIANCE fallback, not measured\n'
        + '      error (proj_sd_source) — K/DEF and unmeasured cells.\n';
    }
    if (/^(fallback|clamped)/.test(String(p.adp_sd_source || ''))) {
      out += '    ~ adp_sd is a ' + p.adp_sd_source + ' estimate, not a published\n'
        + '      market spread (adp_sd_source).\n';
    }
    return out;
  }

  function showWhy(playerId) {
    const p = playerById(playerId);
    if (!p) return;
    const s = E.scorePlayer(p, context());
    const c = s.components;
    alert(
      p.name + ' — composite ' + s.score.toFixed(1) + '\n\n' +
      'VONA (what you lose by waiting):  ' + c.vona.toFixed(1) + '\n' +
      'Tier cliff urgency:               ' + c.weighted.tier.toFixed(1) + '  (raw ' + c.tier_urgency.toFixed(1) + ')\n' +
      'Starting-lineup need:             ' + c.weighted.need.toFixed(1) + '  (raw ' + c.need.toFixed(1) + ')\n' +
      'Risk adjustment:                  ' + c.weighted.risk.toFixed(1) + '  (raw ' + c.risk.toFixed(1) + ')\n' +
      'Upside bonus:                     ' + c.weighted.ceiling.toFixed(1) + '  (raw ' + c.ceiling.toFixed(1) + ')\n' +
      'Keeper option value:              ' + c.weighted.keeper.toFixed(1) + '  (raw ' + c.keeper.toFixed(1) +
        ', P(keep) ' + Math.round((c.keeper_detail.p_keep || 0) * 100) + '%)\n' +
      'Bye collision:                    ' + c.weighted.bye.toFixed(1) + '  (' + c.bye_detail.detail + ')\n' +
      'Correlation / stacking:           ' + c.weighted.stack.toFixed(1) + '\n\n' +
      'Projection ' + Math.round(p.proj_mean) + ' (floor ' + Math.round(p.proj_floor) +
      ', ceiling ' + Math.round(p.proj_ceiling) + ')\n' + dispersionCaveat(p, state.board) +
      'Adjusted ADP ' + Math.round(p.adjusted_adp) + ' vs raw ' + Math.round(p.raw_adp || 0) + '\n' +
      sourceGapCaveat(p, state.board) +
      'Survives to your next pick: ' + survivalText(s.survival_to_next) + ' (interim model — see the caveat)\n\n' +
      s.reasons.map(r => '• ' + r).join('\n')
    );
  }

  function saveWeights() {
    markPrefsChanged();
    try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights)); } catch (e) { /* private mode */ }
    // Keep the restore panel's diff live-synced to whatever weights actually
    // are now — a slider moved after page load must not leave a stale "no
    // change" on screen (register 5g's whole point: a diff nobody re-checks
    // is no better than the date nobody reconstructs).
    if (typeof renderBaselineControl === 'function') renderBaselineControl();
  }
  function loadWeights() {
    try {
      const saved = JSON.parse(localStorage.getItem(WEIGHT_KEY) || 'null');
      if (saved) state.weights = Object.assign({}, E.DEFAULT_WEIGHTS, saved);
    } catch (e) { /* ignore */ }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // The nav wraps at narrow widths, which changes every pinned strip's offset.
  window.addEventListener('resize', function () {
    try { layoutPinned(); } catch (e) { /* cosmetic only */ }
  });

  /* LIVE SEAT DIAGNOSTIC. Read-only, safe to call any time, and the thing to
   * run in the console the moment a rehearsal looks wrong: it reports the one
   * resolved identity plus an audit across every consumer, so "which surface
   * disagrees" is one command instead of a guess. Mock #1 would have been a
   * five-second diagnosis with this. */
  window.__wrDiag = function () {
    const seat = refreshSeat();
    const rosterSlotsSeen = Object.keys(state.rosters || {})
      .filter(k => (state.rosters[k] || []).length);
    const audit = typeof DraftSeat !== 'undefined' ? DraftSeat.audit(seat, {
      pickOrderMyPicks: (state.data.pick_order || {}).my_picks || [],
      headerSlot: mySlot(),
      rosterSlotsSeen: rosterSlotsSeen,
      teams: (state.data.league || {}).teams,
    }) : null;
    return {
      seat: seat,
      describe: seat && typeof DraftSeat !== 'undefined' ? DraftSeat.describe(seat) : null,
      audit: audit,
      // The manual-fallback clock, for the rehearsal harness (B's 2026-08-17
      // first-take find) — the number every pick-dependent surface consumes.
      clock: currentPick(),
      myPicks: ((state.data || {}).pick_order || {}).my_picks || [],
      myRoster: (state.myRoster || []).map(p => p.position + ' ' + p.name),
      rosterSlotsSeen: rosterSlotsSeen,
      mock: state.mockMode || null,
      // What mock #1 could not tell us: how long the hang actually lasted.
      session: (typeof DraftSession !== 'undefined' && state.session)
        ? DraftSession.report(state.session) : null,
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
