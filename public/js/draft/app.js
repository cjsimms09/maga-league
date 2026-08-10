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
    state.board = data.players.slice();
    populateKeepers(data);
    applyOverrides();
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
      PredLedger.override({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'override-v1',
        payload: { player_id: String(playerId), name: op ? op.name : null,
          kind: kind || 'clear', pct: kind ? (pct == null ? 25 : Number(pct)) : null } });
    }
    // Rebuild the board from the artifact so an override can be undone cleanly
    // rather than compounding on an already-adjusted number.
    state.board = state.data.players.filter(p => !state.drafted.has(String(p.player_id)));
    applyOverrides();
    renderAll();
  }

  function applyOverrides() {
    const ov = state.playerOverrides || {};
    const ids = Object.keys(ov);
    if (!ids.length) { renderOverrideCount(0); return; }
    const removed = {};
    state.board.forEach(p => {
      const o = ov[String(p.player_id)];
      if (!o) return;
      if (o.kind === 'remove') { removed[String(p.player_id)] = true; return; }
      const f = o.kind === 'downgrade' ? (1 - o.pct / 100) : (1 + o.pct / 100);
      // Scale the value chain together: a haircut that moves proj_mean but not
      // VORP would leave the composite reading a number that no longer exists.
      p.proj_mean = (p.proj_mean || 0) * f;
      p.proj_ceiling = (p.proj_ceiling || 0) * f;
      p.proj_floor = (p.proj_floor || 0) * f;
      p.vorp = (p.vorp || 0) * f;
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
  const BASELINE_KEY = 'mfga.draft.baseline.v1';
  function loadFrozenBaseline() {
    try {
      const cached = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
      if (cached) state.frozenBaseline = cached;
    } catch (e) { /* private mode */ }
    fetch('/admin/api/baseline?version=v1', { cache: 'no-cache' })
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
  function renderBaselineControl() {
    const host = $('#baseline-restore');
    if (!host) return;
    const b = state.frozenBaseline;
    if (!b || !b.engine_policy) { host.innerHTML = ''; return; }
    const frozenAt = (b.frozen_at || '').slice(0, 10);
    host.innerHTML = '<button class="btn small navy" id="restore-baseline">'
      + '⏮ Restore the measured core</button>'
      + '<span class="muted" style="font-size:.72rem;margin-left:.4rem">frozen '
      + escapeHtml(frozenAt) + '</span>';
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

  function init() {
    loadWeights();
    loadFrozenBaseline();
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
   * already built a board. `pick_order.picks` is slot-independent: it is the
   * true pick sequence after keeper forfeits, with each entry carrying the slot
   * that owns it. Only `my_picks` is slot-specific, so re-deriving it is a
   * filter, not a rebuild, and it stays exact under snake order and keeper
   * forfeits alike because it reuses the sequence the pipeline already solved.
   */
  function applySlot(data) {
    const slot = Number(data.league.my_draft_slot);
    const picks = (data.pick_order && data.pick_order.picks) || [];
    if (!slot || !picks.length) return;

    const derived = picks.filter(p => Number(p.slot) === slot).map(p => p.overall);
    if (!derived.length) {
      console.warn('draft slot ' + slot + ' owns no picks in this board');
      return;
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

  /** MY seat in the room being drafted. Never read my_draft_slot directly. */
  function mySlot() {
    const s = state.seat || refreshSeat();
    return s ? s.roomSlot : (Number((state.data.league || {}).my_draft_slot) || null);
  }

  // ------------------------------------------------------------- computation
  function myNextPicks() {
    const order = (state.data.pick_order && state.data.pick_order.my_picks) || [];
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
  function pickState() {
    // COORDINATE SYSTEM [pick-events]: count of picks OBSERVED this draft.
    const pickEvents = state.sync
      ? Math.max(0, state.sync.currentPickNumber() - 1)
      : (state.recentPicks || []).length;
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
    return pickState().currentPick;
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
    const totalPicks = (state.data.pick_order.picks || []).length;
    const teams = state.data.league.teams || 10;
    return {
      board: state.board,
      nextPick: next,
      currentPick: cur,
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
      totalPicks: ((state.data.pick_order || {}).picks || []).length || null,
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
      runMultipliers: state.runMults,
      // LIVE recommendation is late-only ceiling (Cory's model). Only the strategy-
      // exploration shadows set this true to explore ceiling-forward drafts.
      ceilingAllStages: false,
      drift: state.drift || null,
      // A2 Layer 2
      intervening: interveningPicks(),
      roundsLeft: Math.max(0, Math.ceil((totalPicks - cur) / teams)),
    };
  }

  // ------------------------------------------------------------------ render
  function renderAll() {
    // Before anything is scored: if Auto is on, the weights for THIS pick have
    // to be in place, or every panel below renders last pick's opinion.
    applyAutoWeights();
    checkKeeperLock();
    renderHeader();
    renderRecommendations();
    // Every pick changes who is left, so the position panel is stale the
    // instant it is not redrawn with everything else.
    renderPositionRecs();
    renderLists();
    renderQueue();
    renderThreats();
    renderThreatStrip();
    renderBoard();
    renderRoster();
    renderPlan();
    renderByes();
    renderChecklist();
    renderRehearsalWatermark();
    renderSlotWatermark();
    renderLRM();
    renderSurvival();
    renderRuns();
    renderPicksFeed();
    renderManagers();
    try { assertPickState(); } catch (e) { /* never blocks the clock */ }
    try { renderAccountingNote(); } catch (e) { /* never blocks the clock */ }
    try { renderSystemStrip(); } catch (e) { /* never blocks the clock */ }
    try { renderUnrecordedPicks(); } catch (e) { /* never blocks the clock */ }
    try { renderPickControls(); } catch (e) { /* never blocks the clock */ }
    try { renderLegality(); } catch (e) { /* never blocks the clock */ }
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
    host.innerHTML = managers.map(m =>
      '<div class="mgr-card">' +
        '<div class="mgr-name">' + escapeHtml(m.name) +
          '<span class="muted">' + m.sample_size + ' draft' + (m.sample_size === 1 ? '' : 's') + '</span></div>' +
        '<div class="mgr-summary">' + escapeHtml(m.summary) + '</div>' +
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
    host.innerHTML = '<div class="conf-note ' + c.level + '">'
      + (c.level === 'coin-flip' ? '\u{1FA99} ' : '\u2696\ufe0f ')
      + escapeHtml(c.message) + '</div>';
  }

  /* ── What each option costs you at your next pick ──────────────────────── */
  function renderBranches(branches) {
    const card = $('#branch-card'), host = $('#branches');
    if (!card || !host) return;
    if (!branches || !branches.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    $('#branch-head').textContent = 'what is likely left at pick ' + branches[0].pick;
    host.innerHTML = branches.map(b => {
      // Only the positions where waiting actually costs something. A row
      // saying "you lose 0.2 points" is noise on the clock.
      const rows = b.rows.filter(r => r.loss > 1).slice(0, 4);
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
    // LEGIBILITY HOTFIX (phone, 2026-08-10): style.css sets .clock-name to #fff
    // (white) — a dark-theme leftover — but the clock-card renders on a light,
    // gold-tinted PAPER background, so the player's name was white-on-white and
    // unreadable (the "text I could not read"). Force the theme ink inline so it
    // is legible now; this overrides the bug without touching B's stylesheet.
    // B: the real fix is `.clock-name { color: var(--ink); }` in style.css.
    clockNameEl.style.color = 'var(--ink, #17263a)';
    $('#clock-meta').textContent = (p.team || '') + (p.bye ? ' · bye ' + p.bye : '')
      + ' · ADP ' + Math.round(p.adjusted_adp);
    // C3 — the RAW projection as a sanity check, next to our valuation, labelled
    // honestly by source (Sleeper-only today, so "Sleeper proj", never "consensus").
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
    take.textContent = '✓ Take ' + (p.name || 'him');
    take.style.display = 'block';
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
  function syncSliders() {
    $$('.weight-slider').forEach(sl => {
      const v = state.weights[sl.dataset.weight];
      if (v == null) return;
      sl.value = v;
      const lab = $('#w-' + sl.dataset.weight);
      if (lab) lab.textContent = Number(v).toFixed(1);
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
    host.innerHTML = '<div class="stale-block' + (st.stale ? ' warn' : '') + '">'
      + '<h3>' + (st.stale ? '\u26a0\ufe0f Keeper slate confirmed a while ago'
                          : '\u26d4 Keeper slate not confirmed') + '</h3>'
      + '<p>' + escapeHtml(st.message) + '</p>'
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

    // At-risk first. It is the answer; the seat-by-seat breakdown is the
    // working, and on the clock most people only ever read the answer.
    let html = '';
    if (t.atRisk.length) {
      html += '<div class="threat-risk"><div class="threat-sub">Most likely to be gone</div>'
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

    html += t.rows.map(r => {
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
      const tells = r.tells.length
        ? r.tells.map(x => '<div class="threat-tell">' + escapeHtml(x.text)
            + (x.proxy ? ' <span class="muted" title="measured against today\'s ranks, '
                + 'not the ADP of the day">(hint only)</span>' : '') + '</div>').join('')
        : '<div class="threat-tell muted">' + (r.sample_size
            ? 'nothing in ' + r.sample_size + ' draft' + (r.sample_size === 1 ? '' : 's')
              + ' stands out — he drafts near league average'
            : 'no draft history on Sleeper — modelled as league average') + '</div>';
      return '<div class="threat-row">'
        + '<div class="threat-head"><span class="threat-pick">' + r.pick_no + '</span>'
        + '<b>' + who + '</b>' + '<span class="threat-pos">' + pos + '</span></div>'
        + '<div class="threat-names">' + names + '</div>'
        + tells
        + '</div>';
    }).join('');
    host.innerHTML = html;
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
          + '<button class="btn small ghost" data-compare="' + escapeHtml(String(id))
            + '" title="Compare — dollar gap">⚖️</button>'
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
      + '<td class="s">' + (p.survives_to_next == null ? '' : p.survives_to_next + '%') + '</td>';
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
      (function () {
        const teams = (d.league || {}).teams || 10;
        const kept = d.kept_players || [];
        const slotsWithKeepers = {};
        kept.forEach(k => { if (k.team_slot != null) slotsWithKeepers[k.team_slot] = 1; });
        const known = Object.keys(slotsWithKeepers).length;
        return {
          ok: known >= teams,
          label: 'Opponent keeper slates in the pick order',
          detail: known >= teams ? 'all ' + teams + ' seats declared'
            : known + ' of ' + teams + ' seats — pick numbers assume the other '
              + (teams - known) + ' draft in rounds 1-3',
          fix: 'Rebuild the board once the commissioner locks every keeper slate; '
            + 'until then treat overall pick numbers as provisional',
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
      { ok: !!(window.INSEASON_LEDGER_LIVE),
        label: 'In-season instrumentation live (HARD DATE: Sept 1)',
        detail: window.INSEASON_LEDGER_LIVE
          ? 'logging lineup / waiver / trade / doctrine decisions'
          : 'NOT LIVE — exp 37 can only grade what was logged at decision time; '
            + 'September cannot be reconstructed in January',
        fix: 'First post-draft build item: extend PredLedger to the in-season kinds' },
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
    host.innerHTML = rows
      ? '<div class="ba-head">Best available <span class="muted">· top 3/pos · % = gone by your next pick · tap to compare</span></div>' + rows
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
    host.innerHTML = '<ol style="margin:0; padding-left:1.1rem">' + scored.map(s => {
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
        + '</li>';
    }).join('') + '</ol>';
  }

  /* Part 2 §1 — render the Paths panel (the primary decision surface). Derived
   * from the SAME scored board the ranked list uses (passed in, never re-scored),
   * so a path and the list beneath it can never disagree. Stores state.lastPaths
   * so a pick can be logged with the direction it came from. */
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

    host.innerHTML = paths.map(function (p, i) {
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
          '<span class="path-player">' + escapeHtml(pl.name) +
            '<span class="rec-pos ' + pl.position + '">' + pl.position + '</span></span>' +
          '<span class="path-score">' + p.pick.score.toFixed(1) + '</span>' +
        '</div>' +
        (p.distinction ? '<div class="path-distinction">' + escapeHtml(p.distinction) + '</div>' : '') +
        devHtml +
        (p.pick.why ? '<div class="path-why">' + escapeHtml(p.pick.why) + '</div>' : '') +
        '<div class="path-when">' + escapeHtml(p.when_right) + '</div>' +
        (plan ? '<div class="path-plan">next turn cost if you wait: ' + escapeHtml(plan) + '</div>' : '') +
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
    // The breakdown bar: signed contributions, gold for money.
    const parts = [['high-pool', g.high], ['top-4 entry', g.entry], ['RS', g.rs], ['next-pick echo', g.echo]];
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
        + '<br>' + escapeHtml(a.name) + ': high $' + g.terms.A.dollars.high + ' · entry $' + g.terms.A.dollars.entry + ' · RS $' + g.terms.A.dollars.rs
        + '<br>' + escapeHtml(b.name) + ': high $' + g.terms.B.dollars.high + ' · entry $' + g.terms.B.dollars.entry + ' · RS $' + g.terms.B.dollars.rs
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
    let html = '<div class="rh-pick" style="font-weight:700">🎯 ' + nm(rec.pick) + '</div>'
      + '<div class="rh-why" style="font-size:.9rem;opacity:.95">' + escapeHtml(rec.reason) + '</div>'
      // TAKE BUTTON on the headline (phone-blocker fix 2026-08-10): the most
      // prominent recommendation on the page named a player but gave no way to
      // draft him. A full-width take, always present, right under the pick.
      + '<button class="btn gold rh-take" data-draft-me="' + escapeHtml(String(rec.pick.player_id))
      + '" style="display:block;width:100%;margin:.5rem 0 .2rem;padding:.6rem;font-size:1rem">✓ Take '
      + escapeHtml(rec.pick.name || 'him') + '</button>';
    // The FIELD when it's close — human chooses; ledger records which (already wired).
    if (gap < 8 && field.length > 1) {
      html += '<div class="rh-field" style="font-size:.78rem;margin-top:.35rem">Close — your call: '
        + field.map(p => nm(p) + ' <span style="opacity:.82">(adp ' + Math.round(DraftNeedRule.adpOf(p)) + ')</span>').join(' · ')
        + '</div>';
    }
    // BYE STACK — the one thing the rule does NOT price, made visible (Cory #3).
    if (rec.bye_stack) {
      html += '<div class="rh-bye" style="font-size:.78rem;margin-top:.35rem;color:#e6b800">'
        + '⚠ bye stack: this would put ' + rec.bye_stack.count + ' starters on week '
        + rec.bye_stack.week + ' — the rule does not price byes; your call.</div>';
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
      } else if (differs) {
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
    // HONEST TIER — the rule is confident; the dollars are MC-harness, not a projection (Cory #2).
    html += '<div class="rh-caveat" style="font-size:.78rem;opacity:.82;margin-top:.35rem">'
      + 'measured rule (robust across seats/rooms/keepers); dollar magnitudes are lab-tier, not a season projection</div>';

    // GRAB-BY (live) — "stick to value, know when to grab QB/TE". Recomputed every
    // pick off the live board + my roster (DraftGrabBy). This is the model watching
    // the draft and calling the right time for the scarce onesies, not a frozen
    // pre-draft snapshot. QB/TE surfaced explicitly since they're the timing calls.
    if (typeof DraftGrabBy !== 'undefined') {
      try {
        const gb = DraftGrabBy.report(board, roster, myNextPicks(), state.data.league || {});
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
   * cards. Reads DraftConsensus (one derivation) and the artifact provenance so the
   * label states the true source (Sleeper today; "Consensus (N)" only when >=2
   * real sources land). Defensive if the module didn't load. */
  function recRawProj(p) {
    if (typeof DraftConsensus === 'undefined') {
      return { value: p.proj_mean == null ? null : p.proj_mean, label: 'Sleeper proj', isConsensus: false };
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

  function renderRecommendations() {
    // One call so the recommendation, the confidence line and the branch
    // forecasts can never come from three different boards.
    const out = E.onTheClock(context(), state.lists);
    state.lastClock = out;
    try { renderRuleHeadline(out); } catch (e) { console.error('[rule-headline]', e && e.message); }
    // L1 capture: the board I made a decision from, once per (pick, build).
    // Logged BEFORE the outcome is known — the whole point of decision-time
    // capture. Not on mocks. Deduped in PredLedger so re-renders don't flood.
    if (typeof PredLedger !== 'undefined' && !state.mockMode && out.scored && out.scored.length) {
      var c = ledgerCtx();
      PredLedger.recommendation({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'composite-v1',
        payload: {
          weights: state.weights,
          top: out.scored.slice(0, 10).map(function (s) {
            return { player_id: String(s.player.player_id), name: s.player.name,
              position: s.player.position, score: Math.round(s.score * 10) / 10,
              survival_to_next: s.survival_to_next == null ? null : Math.round(s.survival_to_next * 1000) / 1000,
              rails: (s.rails || []).length, demoted: !!s.demoted };
          }),
          contested: !!(out.scored[0] && out.scored[0].contested),
          confidence: out.confidence ? out.confidence.level : null,
        } });
    }

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

    renderConfidence(out.confidence);
    renderBranches(out.branches);
    renderClock(out);
    // The doctrine banner reads the SAME scored board — the plan and the paths
    // must never be arguing from two different boards. It runs FIRST so the
    // path cards can tag themselves with the doctrine as of THIS pick rather
    // than the previous one (§4: everything speaks the same vocabulary).
    try { renderDoctrine(out.scored); } catch (e) { /* never blocks the clock */ }
    // Paths panel derives from the same scored board the list uses.
    renderPaths(out.scored);
    // THE MVS RIDES THE SAME RENDER, never a second computation — a surface
    // that recomputes its own numbers is a surface that can disagree with the
    // panel beneath it.
    try { renderMVS(out.scored, out.paths); }
    catch (e) { console.error('[mvs]', e && e.message); }
    // The strategy-split panel rides the same render — projected from the live
    // board, so it is populated at every pick and never blank.
    try { renderShadowProjection(); }
    catch (e) { console.error('[shadow-proj]', e && e.message); }
    renderBestAvailStrip(out.scored, (context() || {}).nextPick);
    renderQueueSlip(out.scored);   // fill #queue-slip from the same survival math
    // Stack line runs BEFORE the rec cards below so stackBadge() can read its
    // route map. Same scored board — never a second computation.
    try { renderStackLine(out.scored); } catch (e) { console.error('[stack]', e && e.message); }
    // The movement line diffs this pick's top against the last pick's. Same
    // scored board; never blocks the clock.
    try { updateMovement(currentPick(), out.scored); }
    catch (e) { console.error('[movement]', e && e.message); }
    renderCompareTray();   // keep the dollar-gap overlay fresh as the board changes
    const all = out.scored;
    const scored = all.slice(0, 5);
    const host = $('#recs');
    if (state.reconcile && state.reconcile.halt) {
      host.innerHTML = '<p class="muted" style="margin:0">Paused — resolve the keeper '
        + 'mismatch above. Every number below it derives from the slate.</p>';
      return;
    }
    if (!scored.length) { host.innerHTML = '<p class="muted">Board is empty.</p>'; return; }

    // Roster legality comes first and in plain language: on the clock, a red bar
    // saying "you have no kicker" beats a re-sorted list every time.
    let head = '';
    const lg = scored[0].legality, lw = scored[0].legality_warning;
    if (lg) {
      head = '<div class="forced-banner">\u26d4 ' + escapeHtml(lg.message)
        + ' Only players who can legally start are shown.</div>';
    } else if (lw) {
      head = '<div class="forced-banner warn">\u26a0\ufe0f ' + escapeHtml(lw) + '</div>';
    }

    host.innerHTML = head + scored.map((s, i) => {
      const p = s.player;
      const pct = Math.round((1 - (s.survival_to_next || 0)) * 100);
      return '<div class="rec-card' + (i === 0 ? ' top' : '') + (s.demoted ? ' demoted' : '') + '">' +
        '<div class="rec-rank">' + (s.demoted ? '↓' : (i + 1)) + '</div>' +
        '<div class="rec-main">' +
          '<div class="rec-name">' + escapeHtml(p.name) +
            '<span class="rec-pos ' + p.position + '">' + p.position + '</span>' +
            '<span class="muted">' + escapeHtml(p.team || '') + (p.bye ? ' · bye ' + p.bye : '') + '</span>' +
          '</div>' +
          '<div class="rec-why">' + escapeHtml(s.reasons[0]) +
            (s.reasons.length > 1 ? ' · ' + escapeHtml(s.reasons[1]) : '') + '</div>' +
          stackBadge(p) +
          ((s.rails && s.rails.length)
            ? '<div class="rail-strip">' + s.rails.map(f =>
                '<span>\u26a0\ufe0f ' + escapeHtml(f) + '</span>').join('') + '</div>'
            : '') +
          '<div class="rec-stats">' +
            '<span title="Value Over Next Available — what you lose by waiting">VONA <b>' + s.components.vona.toFixed(1) + '</b></span>' +
            // C3 — the raw projection, labelled by its true source (Sleeper today,
            // never "consensus" until a 2nd source lands), sat next to our VONA so a
            // disagreement is visible on the card, not buried.
            '<span title="Raw, unmodelled projection — the sanity check on our valuation">'
              + escapeHtml(recRawProj(p).label.replace(/ proj$/, '')) + ' <b>'
              + (recRawProj(p).value == null ? '—' : Math.round(recRawProj(p).value)) + '</b></span>' +
            '<span>Tier <b>' + p.tier + '</b> (' + p.tier_rank + '/' + p.tier_size + ')</span>' +
            '<span>ADP <b>' + Math.round(p.adjusted_adp) + '</b></span>' +
            (pct ? '<span class="' + (pct > 70 ? 'neg' : '') + '">' + pct + '% gone by next</span>' : '') +
          '</div>' +
          // The disagreement line on the TOP card: if a same-position candidate
          // projects higher than the one we're recommending, say so — that is the
          // moment both numbers matter (machinery found something, or it's broken).
          (i === 0 ? recDisagreementLine(s, scored) : '') +
        '</div>' +
        '<div class="rec-actions">' +
          '<div class="rec-score" title="Composite score">' + s.score.toFixed(1) + '</div>' +
          '<button class="btn small gold" data-draft-me="' + p.player_id + '">I took him</button>' +
          '<button class="btn small ghost" data-draft-other="' + p.player_id + '">Gone</button>' +
          '<button class="btn small navy" data-why="' + p.player_id + '">Why?</button>' +
          '<button class="btn small ghost" data-compare="' + p.player_id + '" title="Compare — dollar gap">' +
            (state.compare.indexOf(String(p.player_id)) >= 0 ? '⚖️✓' : '⚖️') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const top = scored[0];
    $('#tiebreak').style.display = top && top.contested ? '' : 'none';
    if (top && top.contested) {
      // A distance is never negative: a negative gap_to_second means a pinned
      // personal-list pick sits below the board's own top — an override, not a
      // coin flip (2026-08-10 critique: "within -1.9 pts").
      const g = top.gap_to_second;
      $('#tiebreak').textContent = g < 0
        ? 'Your pinned pick scores ' + Math.abs(g).toFixed(1) + ' pts below the board top — '
          + 'a deliberate override, not a coin flip.'
        : 'Top two are within ' + g.toFixed(1) + ' pts — effectively a coin flip. '
          + 'Monte Carlo tiebreaker lands in the next build.';
    }
  }

  function renderBoard() {
    const match = p => (state.filterPos === 'ALL' || p.position === state.filterPos)
      && (!state.search || (p.name || '').toLowerCase().indexOf(state.search) !== -1);
    const rows = state.board.filter(match).slice(0, 200);

    // Searching also looks at players already taken. "He isn't here" and "he
    // went four picks ago" are different answers, and only one of them means
    // something is broken — but the board could only ever give you the first.
    const takenHits = state.search
      ? (state.data.players || []).filter(p => state.drafted.has(String(p.player_id)) && match(p)).slice(0, 25)
      : [];
    $('#board-body').innerHTML = rows.map(p =>
      '<tr data-tier="' + p.tier + '">' +
        '<td>' + p.overall_rank + '</td>' +
        '<td><b>' + escapeHtml(p.name) + '</b></td>' +
        '<td><span class="rec-pos ' + p.position + '">' + p.position + '</span></td>' +
        '<td class="muted">' + escapeHtml(p.team || '') + '</td>' +
        '<td class="num">' + (p.bye || '—') + '</td>' +
        '<td class="num">' + Math.round(p.proj_mean) + '</td>' +
        '<td class="num">' + p.vorp.toFixed(1) + '</td>' +
        '<td class="num tier-cell t' + ((p.tier - 1) % 6) + '">' + p.tier + '</td>' +
        '<td class="num">' + Math.round(p.adjusted_adp) + '</td>' +
        '<td class="num muted">' + Math.round(p.raw_adp || 0) + '</td>' +
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
            + '" data-queue="' + p.player_id + '" title="Queue — the list you read when the clock is at 8 seconds">'
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
      '</tr>').join('');
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
   * The stub carries no projection, so it can never move a recommendation. It
   * exists so the pick count, the seat rosters and your own roster stay true —
   * which is what every survival and VONA number is computed against.
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

  function riskFlags(p) {
    const flags = [];
    if (p.injury_status && !/^(healthy|active)$/i.test(p.injury_status)) flags.push('<span class="badge owes">' + escapeHtml(p.injury_status) + '</span>');
    if (p.age && p.age >= 30 && (p.position === 'RB')) flags.push('<span class="badge owes">age ' + p.age + '</span>');
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
      if (z > OPP_CUT) flags.push('<span class="badge open" title="unusually high opportunity for his draft cost">opp ↑</span>');
      else if (z < -OPP_CUT) flags.push('<span class="badge owes" title="unusually low opportunity for his draft cost">opp ↓</span>');
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
      state.myRoster.push(Object.assign({}, k, { is_keeper: true }));
      state.drafted.add(String(k.player_id));   // keepers are off the board
    });
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
      // Tolerance is generous: the scored list is the legal board, not literally
      // every rostered player, so a small shortfall is expected. A 25% relative
      // error (or more expected departures than picks available) is a real fault.
      const bad = picksInWindow > 0
        && (mass > picksInWindow * 1.25 || mass < picksInWindow * 0.5);
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
    $('#survival').innerHTML = top.map(x =>
      '<div class="surv-row"><span>' + escapeHtml(x.p.name) + ' <span class="muted">' + x.p.position + '</span></span>' +
      '<div class="surv-bar"><div style="width:' + Math.round(x.s * 100) + '%"></div></div>' +
      '<b class="' + (x.s > 0.6 ? 'pos' : x.s < 0.25 ? 'neg' : '') + '">' + Math.round(x.s * 100) + '%</b></div>').join('');

    // L1 capture: the survival estimates the tool showed at this pick, plus a
    // last-responsible-moment snapshot per onesie position, once per (pick,build).
    if (typeof PredLedger !== 'undefined' && !state.mockMode) {
      var c = ledgerCtx();
      PredLedger.survival({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'survival-v1',
        payload: { to_pick: next, estimates: top.map(function (x) {
          return { player_id: String(x.p.player_id), name: x.p.name,
            position: x.p.position, survival: Math.round(x.s * 1000) / 1000 }; }) } });
      var lrm = computeLRM(upcoming);
      if (lrm && lrm.length) {
        // Explicitly a stopgap computed from the survival model, NOT the real
        // 2b.6 LRM feature — tagged so grading never confuses the two.
        PredLedger.lrm({ season: c.season, build_at: c.build_at, pick: c.pick,
          method: 'survival-snapshot-v0',
          payload: { last_responsible_moment: lrm } });
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
  function lrmLastSafe(pool, upcoming) {
    var last = null, idx = 0, target = null;
    for (var i = 1; i < upcoming.length; i++) {
      var surv = null;
      for (var j = 0; j < pool.length; j++) {
        if (E.survival(pool[j], upcoming[i], state.runMults) >= 0.85) { surv = pool[j]; break; }
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
      var st = lrmLastSafe(startablePool, upcoming);
      var el = dual ? lrmLastSafe(elitePool, upcoming) : null;
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
      out.push({ position: pos, dual: dual, next_pick: upcoming[1],
        startable_by: st.by_pick, startable_early: st.picks_early,
        startable_target: stTarget.name,
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
    host.innerHTML = '<div class="lrm-head">Last responsible moment</div>' + lrm.map(function (r) {
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
      secondName: second && second.player ? second.player.name : null,
      secondScore: second ? second.score : null,
    };
  }

  function movementReason() {
    // Factual co-occurrence, not a causal claim: name any position currently
    // running. Empty when nothing is running, so the line stays bare.
    try {
      var runs = E.detectRuns(state.runMults || {});
      return runs.length ? runs.join('/') + ' run on' : '';
    } catch (e) { return ''; }
  }

  function updateMovement(pick, scored) {
    var curr = snapshotRec(pick, scored);
    var prev = state.lastRecommendation;
    if (!prev || prev.pick !== pick) {
      var mv = prev ? E.movementLine(prev, curr, { reason: movementReason() })
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
    var res = E.liveStackRoutes((ctx && ctx.roster) || [], scored || []);
    state.stackRoutes = res;                       // consumed by stackBadge()
    var clsEl = document.getElementById('stack-class');
    if (clsEl) clsEl.textContent = res.class_label;
    if (!res.count) { host.innerHTML = ''; card.style.display = 'none'; return; }
    card.style.display = '';
    var fmt = function (r) {
      var odds = r.survival == null ? '' : ' <span class="muted">('
        + Math.round(r.survival * 100) + '% at ' + (r.adp != null ? Math.round(r.adp) : '?') + ')</span>';
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
    if (mine && !state.mockMode && Object.keys(byUser).length > 0) {
      if (changed) {
        showSlotNote('Sleeper says you are in slot ' + mine + ' — importing.', false);
        setSlot(mine, 'sleeper');
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
      my_draft_slot: mySlot || (Number(league.my_draft_slot) <= teams
        ? Number(league.my_draft_slot) : 0) || 1,
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
    const myLeagueSeat = Number(league.my_draft_slot) || 0;
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
    state.realSlot = Number(league.my_draft_slot) || state.realSlot || null;
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
    const picks = state.data.pick_order.picks || [];
    const derived = picks.filter(p => Number(p.slot) === n).map(p => p.overall);
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
      PredLedger.run({ season: c.season, build_at: c.build_at, pick: c.pick,
        method: 'run-detect-v1',
        payload: { positions: runs.map(function (p) {
          return { position: p, multiplier: Math.round(state.runMults[p] * 100) / 100 }; }) } }, sig);
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
  var layerProgrammatic = false;
  function setLayer(el, open) {
    if (!el || el.open === open) return;
    layerProgrammatic = true;
    el.open = open;
    layerProgrammatic = false;
  }

  function initLayers() {
    const l2 = document.getElementById('layer-2');
    if (!l2 || l2.dataset.wired) return;
    l2.dataset.wired = '1';
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) setLayer(l2, false);
    l2.addEventListener('toggle', function () {
      if (!layerProgrammatic) l2.dataset.userOpened = '1';
    });
    const l3 = document.getElementById('layer-3');
    if (l3) l3.addEventListener('toggle', function () {
      if (!layerProgrammatic) l3.dataset.userOpened = '1';
    });
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
      const teams = ((state.data.league || {}).teams) || 10;
      const round = Math.max(1, Math.ceil(currentPick() / teams));
      proj = DraftShadows.project(state.board, context(), round, state.myRoster);
      cons = DraftShadows.consensus(proj);
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
    line.innerHTML = (cons.contested
        ? '<span class="sp-flag">⚠ STRATEGIES SPLIT — slow down</span> '
        : '<span class="sp-tag">🧭 strategies</span> ')
      + leadTxt + dissentTxt;

    // The full list, one tap away: every strategy and the player it would take.
    body.innerHTML = proj.map(function (r) {
      return '<div class="sp-row"><span class="sp-strat">' + esc(r.name) + '</span>'
        + '<span class="sp-pick">' + esc(shortName(r.player))
        + (r.position ? ' <span class="sp-pos">' + esc(r.position) + '</span>' : '')
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
    // Same rule as the checklist and the staleness control: stale (≥18h) is a
    // BLOCKING red, aging (6-18h) an amber — never a green board here while the
    // gate blocks it elsewhere.
    if (freshSS.level === 'stale') red.push('board ' + Math.round(ageH) + 'h old — STALE');
    else if (freshSS.level === 'aging') amber.push('board ' + Math.round(ageH) + 'h old');
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
    const issues = red.concat(amber);

    host.style.display = 'flex';
    host.className = 'system-strip ' + tone;
    host.innerHTML =
      '<span class="ss-mode ' + mode.toLowerCase() + '">' + mode + '</span>'
      + rehearsalTag
      + '<span class="ss-seat">' + escapeHtml(seat ? DraftSeat.describe(seat) : 'seat —') + '</span>'
      + '<span class="ss-age">' + escapeHtml(age) + '</span>'
      + '<span class="ss-dot" title="' + escapeHtml(issues.join(' · ') || 'all clear') + '">'
      + dot + (issues.length ? ' <span class="ss-issues">' + escapeHtml(issues[0])
        + (issues.length > 1 ? ' +' + (issues.length - 1) : '') + '</span>' : '') + '</span>';

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

    const scores = DraftDoctrine.scoreBoard(scored, {
      liveIndex: myLivePickIndex(),
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
      totalPicks: ((state.data.pick_order || {}).picks || []).length || null,
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
      dollarsOf: function (p) { return E.playerDollars(p).total; },
    });
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
      + '<span class="db-governs' + (DraftDoctrine.governs() ? '' : ' off') + '">'
      + escapeHtml(DraftDoctrine.governanceLine(enr.enrolled)) + '</span>';
    document.getElementById('db-creed').textContent = out.creed || '';
    document.getElementById('db-confidence').textContent = out.confidence;
    // A "$0 gap" is not an alternative, it is the same decision — say the pick
    // is doctrine-free rather than manufacture a contest out of a tie.
    document.getElementById('db-alt').innerHTML = out.neutral
      ? 'no doctrine changes this pick — take the best player'
      : (out.alternative
        ? escapeHtml(out.alternative) + (out.gap == null ? ''
            : (out.gap >= 0 ? ' trails by <b>$' + Math.abs(out.gap).toFixed(0) + '</b>'
                            : ' leads by <b>$' + Math.abs(out.gap).toFixed(0) + '</b>'))
          + ' <span class="muted">at this pick</span>'
        : '');

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
      const top = (state.lastClock && state.lastClock.scored || [])[0];
      if (top && String(top.player.player_id) !== String(player.player_id)) {
        promptOverrideReason(player, top.player, { reconciled: true });
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

  function capturePlatformSample(pick, player, slot) {
    if (typeof PredLedger === 'undefined' || !state.mockMode) return;
    try {
      const c = ledgerCtx();
      const pickNo = Number(pick.pick_no) || null;
      const adp = player.adjusted_adp != null ? player.adjusted_adp
        : (player.raw_adp != null ? player.raw_adp : null);
      // The whole point: where did the platform take him vs where the market
      // says he goes. Negative = platform took him EARLIER than market (a REACH
      // the room pays for); positive = he lasted longer (a FALL to me).
      const delta = (pickNo != null && adp != null) ? Math.round((adp - pickNo) * 10) / 10 : null;
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
    if (toMe && !alreadySeen && !state.mockMode) capturePick(p, pathKey);
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
          logOverrideReason(p, topRec.player, 'coin_flip', path);
        } else {
          promptOverrideReason(p, topRec.player, { contested: contested, path: path });
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
  function logOverrideReason(picked, overTop, reason, path, reconciled) {
    if (typeof PredLedger === 'undefined' || state.mockMode) return;
    const c = ledgerCtx();
    PredLedger.override({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'override-reason-v1',
      payload: { player_id: String(picked.player_id), name: picked.name,
        over_player_id: overTop ? String(overTop.player_id) : null,
        over_name: overTop ? overTop.name : null,
        reason: reason || 'no_reason_given', path: path == null ? null : path,
        // The ledger must know I did not tap this live — a reconciled override
        // is a different kind of evidence from a deliberate one, and January
        // grades them differently.
        reconciled_from_sync: !!reconciled,
        off_top_rec: true } });
  }
  function promptOverrideReason(picked, overTop, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') { logOverrideReason(picked, overTop, 'no_reason_given', opts.path, opts.reconciled); return; }
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
      logOverrideReason(picked, overTop, reason === 'skip' ? 'no_reason_given' : reason, opts.path, opts.reconciled);
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
  function capturePick(p, pathKey) {
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
    PredLedger.pick({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'pick-v1',
      payload: { player_id: String(p.player_id), name: p.name, position: p.position,
        team: p.team, adjusted_adp: p.adjusted_adp, vorp: p.vorp, tier: p.tier,
        chosen_path: chosen ? chosen.name : null,
        chosen_path_key: chosen ? chosen.key : null,
        off_path: paths.length > 0 && !chosen } });
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

    const r = window.DraftReconcile.reconcile(picks, assumed,
      { playersById: byId, currentRound: currentRound, teams: teams });
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

  function onSyncPicks(picks) {
    const seatSlot = mySlot();
    // SPEED (audit 2026-08-10): the Sleeper poll fires every 4s, but most polls
    // return NO new pick. Sleeper's pick list is append-only, so an unchanged count
    // means nothing happened — skip the full board re-score (~1700 players) + full
    // re-render that used to run every cycle regardless. Recommendations still update
    // the instant a real pick lands; idle polls are now free.
    const nPicks = (picks || []).length;
    if (state._syncedPickCount === nPicks) return;
    state._syncedPickCount = nPicks;
    picks.forEach(pick => {
      const id = String(pick.player_id);
      // draft_slot is the seat; roster_id is the team. A MOCK draft has no
      // rosters, so the seat only lives in draft_slot — prefer it.
      const slot = Number(pick.draft_slot) || Number(pick.roster_id) || null;
      const firstSight = !state.drafted.has(id);

      // Known to the board, or reconstructed from what Sleeper sent. A stub
      // carries no projection, so it can never affect a recommendation — it
      // exists so the pick is visible and lands on the right roster.
      const known = playerById(id);
      const meta = pick.metadata || {};
      const p = known || {
        player_id: id,
        name: [meta.first_name, meta.last_name].filter(Boolean).join(' ')
          || meta.player_name || ('Player ' + id),
        position: meta.position || '?',
        team: meta.team || '',
        bye: null,
        off_board: true,          // rendered differently; never scored
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
        state.drafted.add(id);
        if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
        if (seatSlot && slot === seatSlot) state.myRoster.push(p);
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
        capturePlatformSample(pick, p, slot);
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
    state.board = (state.data.players || []).slice();
    applyOverrides();          // news overrides are prep, so they go back on

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
      toggleQueue: toggleQueue,
      fillQueueFromBoard: fillQueueFromBoard,
      buildSheet: buildSheet,
      state: state,
    };
  }

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
        // AUTO-FALLBACK. Stop polling, unlink, and say so loudly. The manual
        // path is the draft-night fallback anyway, so exercising it is free.
        try { if (state.sync && state.sync.stop) state.sync.stop(); } catch (e) { /* expected */ }
        state.sync = null;
        const connect = document.getElementById('start-sync');
        if (connect) { connect.disabled = false; connect.textContent = 'Retry connect'; }
        clearInterval(state.sessionWatch);
        state.sessionWatch = null;
        renderAll();
      }
    }, 1000);
  }

  function setStatus(s) {
    const el = $('#sync-status');
    el.textContent = s.message;
    el.className = 'sync-status ' + s.state;
    // An error that leaves "Syncing…" disabled forever means the only way to
    // retry a typo is a page reload, mid-draft.
    const btn = $('#start-sync');
    if (btn && s.state === 'error') { btn.disabled = false; btn.textContent = 'Connect'; }
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
      ', ceiling ' + Math.round(p.proj_ceiling) + ')\n' +
      'Adjusted ADP ' + Math.round(p.adjusted_adp) + ' vs raw ' + Math.round(p.raw_adp || 0) + '\n' +
      'Survives to your next pick: ' + Math.round((s.survival_to_next || 0) * 100) + '%\n\n' +
      s.reasons.map(r => '• ' + r).join('\n')
    );
  }

  function saveWeights() {
    markPrefsChanged();
    try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights)); } catch (e) { /* private mode */ }
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
