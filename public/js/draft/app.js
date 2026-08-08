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

  const state = {
    data: null,
    board: [],            // available players
    drafted: new Set(),
    myRoster: [],
    weights: Object.assign({}, E.DEFAULT_WEIGHTS),
    runMults: {},
    recentPicks: [],
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
  }
  function toggleList(which, id) {
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

  function init() {
    loadWeights();
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

  // ------------------------------------------------------------- computation
  function myNextPicks() {
    const order = (state.data.pick_order && state.data.pick_order.my_picks) || [];
    const current = currentPick();
    return order.filter(p => p >= current);
  }
  function currentPick() {
    return state.sync ? state.sync.currentPickNumber() : (state.data.pick_order.my_picks[0] || 1);
  }
  function onTheClock() {
    const mine = state.data.pick_order.my_picks || [];
    return mine.indexOf(currentPick()) !== -1;
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

  /** Teams picking between my current pick and my next — A2 Layer 2's input. */
  function interveningPicks(from, to) {
    const picks = (state.data.pick_order || {}).picks || [];
    return picks
      .filter(p => p.overall >= from && p.overall < to)
      .map(p => ({
        team_slot: p.slot,
        pick_no: p.overall,
        roster: state.rosters[p.slot] || [],
        profile: state.profiles[p.slot] || null,
      }));
  }

  function context() {
    const upcoming = myNextPicks();
    const cur = currentPick();
    const next = upcoming.length > 1 ? upcoming[1] : null;
    const totalPicks = (state.data.pick_order.picks || []).length;
    const teams = state.data.league.teams || 10;
    return {
      board: state.board,
      nextPick: next,
      currentPick: cur,
      totalPicks,
      myPicksLeft: upcoming.length,
      roster: state.myRoster,
      league: state.data.league,
      weights: state.weights,
      runMultipliers: state.runMults,
      drift: state.drift || null,
      // A2 Layer 2
      intervening: next ? interveningPicks(cur, next) : [],
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
    if (si && !si.value) si.value = d.league.my_draft_slot || '';
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
      notes.push({
        level: 'warn',
        text: adp.fallback_count + ' player' + (adp.fallback_count === 1 ? '' : 's')
          + ' priced by Sleeper popularity rank instead of real ADP ('
          + Math.round((adp.fallback_rate || 0) * 100) + '% of the board).',
      });
    }

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

    // Artifact age. Under 6h quiet, 6-18h amber, over 18h BLOCKING — a stale
    // board on draft day means drafting off yesterday's injury status without
    // knowing, and a warning you can scroll past is not a control.
    const built = Date.parse(d.built_at || '');
    if (built) {
      const hours = (Date.now() - built) / 3.6e6;
      if (hours > 18) {
        blockOnStaleness(hours);
      } else if (hours > 6) {
        notes.push({ level: 'warn', text: 'This board is ' + Math.round(hours)
          + ' hours old — consider rebuilding before you draft off it.' });
      }
    }

    if (!notes.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.style.display = '';
    host.innerHTML = notes.map(n =>
      '<div class="prov-note ' + n.level + '"><b>' + (n.level === 'bad' ? '⛔' : '⚠️')
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

    $('#clock-pick').textContent = state.data && state.data.current_pick
      ? state.data.current_pick : (context().currentPick || '—');
    $('#clock-name').innerHTML = escapeHtml(p.name)
      + '<span class="rec-pos ' + p.position + '">' + p.position + '</span>';
    $('#clock-meta').textContent = (p.team || '') + (p.bye ? ' · bye ' + p.bye : '')
      + ' · ADP ' + Math.round(p.adjusted_adp) + ' · proj ' + Math.round(p.proj_mean);
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
    $$('.weight-slider').forEach(sl => {
      const v = state.weights[sl.dataset.weight];
      sl.value = v;
      const lab = $('#w-' + sl.dataset.weight);
      if (lab) lab.textContent = v.toFixed(1);
    });
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
    $$('.weight-slider').forEach(sl => {
      const v = state.weights[sl.dataset.weight];
      sl.value = v;
      $('#w-' + sl.dataset.weight).textContent = v.toFixed(1);
    });
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
      + (t.picksUntilNext === 1 ? '' : 's') + ' before your turn';

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
          + '<button class="btn small ghost" data-qmove="-1" data-id="' + escapeHtml(String(id))
            + '"' + (i === 0 ? ' disabled' : '') + ' title="Up">▲</button>'
          + '<button class="btn small ghost" data-qmove="1" data-id="' + escapeHtml(String(id))
            + '"' + (i === q.length - 1 ? ' disabled' : '') + ' title="Down">▼</button>'
          + '<button class="btn small ghost" data-queue="' + escapeHtml(String(id))
            + '" title="Remove">✕</button>'
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
  function renderChecklist() {
    const host = $('#check-items');
    if (!host) return;
    const d = state.data || {};
    const prov = d.provenance || {};
    const ageH = d.built_at ? (Date.now() - new Date(d.built_at)) / 3600000 : null;
    const slot = state.data && state.data.league ? Number(state.data.league.my_draft_slot) || null : null;

    const items = [
      { ok: !!d.players && d.players.length > 100,
        label: 'Board built', detail: (d.players || []).length + ' players' },
      { ok: ageH != null && ageH < 48,
        label: 'Board is fresh', detail: ageH == null ? 'never built' : Math.round(ageH) + 'h old',
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
            : 'pick ' + slot + ' — manually set, UNVERIFIED (draft order not yet assigned)',
        fix: !slot ? 'Claim it on the Draft Spot page'
          : state.slotVerified ? ''
            : 'Connect the Sleeper draft room; the slot verifies automatically once the draft order is assigned' },
      // Pick NUMBERS recompute live when the slot changes, but keeper-adjusted
      // ADP does not — it was computed for whichever seat the pipeline built
      // with. A board that is right about when you pick and wrong about what
      // will be there is the worst of both, so this is a checklist line rather
      // than only a banner.
      { ok: !state.slotRecomputed,
        label: 'Board built for your seat',
        detail: state.slotRecomputed
          ? 'built for seat ' + (state.slotRecomputed.from ? 'with picks ' + state.slotRecomputed.from : 'another seat')
            + ', you are now #' + state.slotRecomputed.slot
          : 'yes',
        fix: state.slotRecomputed
          ? 'Rebuild: Actions → Build draft board → slot ' + state.slotRecomputed.slot
          : '' },
      { ok: !!(window.LEAGUE_ID), label: 'Sleeper connected',
        detail: window.LEAGUE_ID ? 'league ' + String(window.LEAGUE_ID).slice(-6) : 'not connected',
        fix: 'Commish → Sleeper' },
      { ok: !state.reconcile || !state.reconcile.halt,
        label: 'Keepers reconcile', detail: state.reconcile && state.reconcile.halt ? 'mismatch' : 'ok' },
      // Part 4 §3a: an unconfirmed slate is the one input that can be wrong
      // while every number derived from it still looks completely normal.
      { ok: !!(state.keeperLock && state.keeperLock.locked),
        label: 'Keeper slate confirmed',
        detail: state.keeperLock ? (state.keeperLock.locked
          ? (state.keeperLock.stale ? 'confirmed, but a while ago' : 'yes')
          : (state.keeperLock.edited ? 'edited since it was confirmed' : 'never confirmed'))
          : 'unknown',
        fix: 'Commish \u2192 Keepers \u2192 Confirm & lock' },
      { ok: (state.lists.targets.length + state.lists.avoid.length) > 0,
        label: 'Targets or never-draft set',
        detail: state.lists.targets.length + ' starred, ' + state.lists.avoid.length + ' blocked',
        fix: 'Optional, but it is your read' },
      // URGENT — the league settings showed draft_rounds:3. Verify the DRAFT
      // OBJECT reports 15 once it exists; a 3-round draft is a catastrophe.
      { ok: state.syncedDraftRounds === 15,
        label: 'Draft object rounds == 15',
        detail: state.syncedDraftRounds == null ? 'no draft object synced yet (league setting showed 3 — VERIFY)'
          : (state.syncedDraftRounds === 15 ? 'yes — from Sleeper draft object'
            : 'DRAFT OBJECT SAYS ' + state.syncedDraftRounds + ' — TEXT THE COMMISSIONER'),
        fix: 'Connect the Sleeper draft room; if not 15, the commissioner must fix it before the draft' },
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

  function renderRecommendations() {
    // One call so the recommendation, the confidence line and the branch
    // forecasts can never come from three different boards.
    const out = E.onTheClock(context(), state.lists);
    state.lastClock = out;
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
    renderConfidence(out.confidence);
    renderBranches(out.branches);
    renderClock(out);
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
          ((s.rails && s.rails.length)
            ? '<div class="rail-strip">' + s.rails.map(f =>
                '<span>\u26a0\ufe0f ' + escapeHtml(f) + '</span>').join('') + '</div>'
            : '') +
          '<div class="rec-stats">' +
            '<span title="Value Over Next Available — what you lose by waiting">VONA <b>' + s.components.vona.toFixed(1) + '</b></span>' +
            '<span>Proj <b>' + Math.round(p.proj_mean) + '</b></span>' +
            '<span>Tier <b>' + p.tier + '</b> (' + p.tier_rank + '/' + p.tier_size + ')</span>' +
            '<span>ADP <b>' + Math.round(p.adjusted_adp) + '</b></span>' +
            (pct ? '<span class="' + (pct > 70 ? 'neg' : '') + '">' + pct + '% gone by next</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="rec-actions">' +
          '<div class="rec-score" title="Composite score">' + s.score.toFixed(1) + '</div>' +
          '<button class="btn small gold" data-draft-me="' + p.player_id + '">I took him</button>' +
          '<button class="btn small ghost" data-draft-other="' + p.player_id + '">Gone</button>' +
          '<button class="btn small navy" data-why="' + p.player_id + '">Why?</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const top = scored[0];
    $('#tiebreak').style.display = top && top.contested ? '' : 'none';
    if (top && top.contested) {
      $('#tiebreak').textContent = 'Top two are within ' + top.gap_to_second.toFixed(1) +
        ' pts — effectively a coin flip. Monte Carlo tiebreaker lands in the next build.';
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
    $('#board-count').textContent = rows.length + ' shown of ' + state.board.length + ' available';
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
    host.hidden = false;

    const whoHas = id => {
      const slot = Object.keys(state.rosters).find(k =>
        (state.rosters[k] || []).some(p => String(p.player_id) === String(id)));
      if (!slot) return 'already drafted';
      const prof = Object.values(state.profiles || {}).find(x => Number(x.draft_slot) === Number(slot));
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
            + (Number(state.data.league.my_draft_slot) === i + 1 ? ' (me)' : '') + '</option>').join('')
        + '</select>'
        + '<button type="submit" class="btn small gold">Record it</button>'
        + '</form></div>';
    }
    host.innerHTML = html;
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
    if (Number(slot) === Number(state.data.league.my_draft_slot)) state.myRoster.push(p);
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
    if (p.opportunity_z > 1) flags.push('<span class="badge open">opp ↑</span>');
    if (p.opportunity_z < -1) flags.push('<span class="badge owes">opp ↓</span>');
    return flags.join(' ');
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
    if (state.mockMode) return;
    const mySlot = Number(data.league.my_draft_slot) || null;
    if (!mySlot) return;
    let mine = (data.kept_players || []).filter(k => Number(k.team_slot) === mySlot);
    if (!mine.length) {
      mine = ((data.pick_order || {}).forfeited || [])
        .filter(f => Number(f.team_slot) === mySlot)
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
    const next = upcoming.length > 1 ? upcoming[1] : null;
    if (!next) { $('#survival').innerHTML = '<p class="muted">No later pick to wait for.</p>'; return; }
    const top = state.board.slice(0, 12).map(p => ({
      p, s: E.survival(p, next, state.runMults),
    }));
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
      out.push({ position: pos, dual: dual, next_pick: upcoming[1],
        startable_by: st.by_pick, startable_early: st.picks_early,
        startable_target: (st.target || atPos[0]).name,
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
    var hasSlot = !!Number(league.my_draft_slot);
    var on = hasSlot && !state.slotVerified && !state.mockMode;
    var wm = document.getElementById('slot-watermark');
    if (wm) wm.style.display = on ? '' : 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('slot-unverified', on);
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
    if (mapped) state.profiles = indexProfilesBySlot(state.data);

    // My own seat: match on the roster id the site already knows, else the
    // user id if the draft object carries it.
    let mine = null;
    const myRosterId = window.MY_ROSTER_ID || null;
    if (myRosterId) {
      Object.keys(slotToRoster).forEach(slot => {
        if (String(slotToRoster[slot]) === String(myRosterId)) mine = Number(slot);
      });
    }

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
    const changed = mine && Number(mine) !== Number(state.data.league.my_draft_slot);
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
      my_draft_slot: mySlot || league.my_draft_slot || 1,
      adp_blend_weight: 0.7,
      // Mocks have no keepers. Saying count:0 is not a guess — it is what makes
      // the rebuilt sequence match what the mock will actually do.
      keepers: { count: 0, cost_model: 'no_cost' },
    };
    const out = window.DraftKeepers.reapply(state.data.players, cfg, {});
    state.data.pick_order = {
      picks: out.order.picks.map(p => ({ overall: p.overall, round: p.round, slot: p.team_slot })),
      my_picks: out.order.my_picks,
      my_picks_before_keepers: out.order.my_original_picks,
      forfeited: [],
    };
    state.data.players = out.players;
    state.board = out.players.filter(p => !state.drafted.has(String(p.player_id)));
    state.data.league = Object.assign({}, league, { teams: teams });
    state.format = E.applyFormatDefaults(state.data.league);
    state.mockMode = { teams: teams, rounds: rounds, type: cfg.draft_type,
                       picks: out.order.picks.length, myPicks: out.order.my_picks };

    const host = $('#mock-note');
    if (host) {
      host.style.display = '';
      host.className = 'prov-note warn';
      host.innerHTML = '<b>\ud83e\uddea</b> <span><b>Mock mode.</b> This draft is '
        + teams + ' teams \u00d7 ' + rounds + ' rounds (' + escapeHtml(cfg.draft_type)
        + '), which is not your league\u2019s shape. Pick order rebuilt from the mock '
        + 'with no keepers \u2014 you pick at '
        + escapeHtml(out.order.my_picks.slice(0, 6).join(', '))
        + (out.order.my_picks.length > 6 ? '\u2026' : '')
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
    // as verified. A manual entry is a placeholder until Sleeper confirms it.
    state.slotSource = (source === 'sleeper' && !state.mockMode) ? 'sleeper' : 'manual';
    state.slotVerified = state.slotSource === 'sleeper';
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

  /**
   * Every pick that has happened, from wherever it came.
   *
   * This used to read only from the sync object, so a pick marked by hand — or
   * one for a player the board never carried — was recorded in state, removed
   * from the board, added to a roster, and then not shown. The feed is the only
   * place you can check the tool agrees with the room, so it has to show
   * everything or it is worse than nothing.
   */
  function renderPicksFeed() {
    const seen = new Set();
    const rows = [];
    const push = (id, no, name, pos, tag) => {
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ no: no || 0, name, pos, tag });
    };
    (state.sync ? state.sync.allPicks() : []).forEach(p => {
      const pl = playerById(p.player_id);
      const meta = p.metadata || {};
      push(p.player_id, p.pick_no,
        pl ? pl.name : ([meta.first_name, meta.last_name].filter(Boolean).join(' ') || 'Unknown'),
        pl ? pl.position : (meta.position || ''),
        p.source === 'manual' ? 'typed' : '');
    });
    // Anything state knows that the sync does not — manual entries and picks
    // for players outside the board.
    state.recentPicks.forEach(r => {
      const pl = r.player || {};
      push(r.player_id, r.pick_no, pl.name || 'Unknown', pl.position || r.position || '',
        pl.off_board ? 'off board' : '');
    });
    rows.sort((a, b) => b.no - a.no);
    $('#picks-feed').innerHTML = rows.length
      ? rows.slice(0, 12).map(r => '<li><b>' + (r.no || '?') + '.</b> ' + escapeHtml(r.name)
          + ' <span class="muted">' + escapeHtml(r.pos)
          + (r.tag ? ' · ' + r.tag : '') + '</span></li>').join('')
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

  // ----------------------------------------------------------------- actions
  function markDrafted(playerId, toMe, teamSlot) {
    const p = playerById(playerId);
    if (!p) return;
    const mySlot = Number(state.data.league.my_draft_slot) || null;
    const slot = toMe ? mySlot : (teamSlot || null);
    const alreadySeen = state.drafted.has(String(playerId));
    // A local mark is a GUESS; the shared module records it as such and Sleeper
    // can later override it. Same call the robot mock's R1/R3 scenarios prove.
    if (ATTR) ATTR.markLocal(state, p, slot, mySlot);
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
    // L1 capture: a pick I take is a decision — log it at decision time. Only my
    // own picks (toMe); other teams' picks are recorded by the survival/board
    // context, not as my decisions. Never on a mock, and never a re-mark.
    if (toMe && !alreadySeen && !state.mockMode) capturePick(p);
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
        const path = null;   // Paths panel (Part 2) not built yet; field reserved.
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
  function logOverrideReason(picked, overTop, reason, path) {
    if (typeof PredLedger === 'undefined' || state.mockMode) return;
    const c = ledgerCtx();
    PredLedger.override({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'override-reason-v1',
      payload: { player_id: String(picked.player_id), name: picked.name,
        over_player_id: overTop ? String(overTop.player_id) : null,
        over_name: overTop ? overTop.name : null,
        reason: reason || 'no_reason_given', path: path == null ? null : path,
        off_top_rec: true } });
  }
  function promptOverrideReason(picked, overTop, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') { logOverrideReason(picked, overTop, 'no_reason_given', opts.path); return; }
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
      logOverrideReason(picked, overTop, reason === 'skip' ? 'no_reason_given' : reason, opts.path);
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
  function capturePick(p) {
    if (typeof PredLedger === 'undefined') return;
    var c = ledgerCtx();
    PredLedger.pick({ season: c.season, build_at: c.build_at, pick: c.pick,
      method: 'pick-v1',
      payload: { player_id: String(p.player_id), name: p.name, position: p.position,
        team: p.team, adjusted_adp: p.adjusted_adp, vorp: p.vorp, tier: p.tier } });
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
      { playersById: byId, currentRound: currentRound });
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
      my_draft_slot: league.my_draft_slot,
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
  function onSyncPicks(picks) {
    const mySlot = Number(state.data.league.my_draft_slot) || null;
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

      // SLEEPER IS AUTHORITATIVE. applyRemote places him on the seat the API
      // reports and moves him off any seat a local guess put him on — the same
      // tested path the robot mock's Loveland scenario exercises. Idempotent,
      // so it is safe to run for every pick on every four-second poll.
      if (ATTR) ATTR.applyRemote(state, p, slot, mySlot);
      else {
        state.drafted.add(id);
        if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
        if (mySlot && slot === mySlot) state.myRoster.push(p);
      }
      state.board = state.board.filter(x => String(x.player_id) !== id);
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
    recomputeRuns();
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
  function endDraft() {
    if (state.sync && state.sync.stop) { try { state.sync.stop(); } catch (e) {} }
    state.sync = null;
    state.mode = 'pre';
    state.mockMode = null;
    state.drafted = new Set();
    state.myRoster = [];
    state.rosters = {};
    state.recentPicks = [];
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
      // §D.1 — a misclick at live pick 30 is a catastrophe. A one-click confirm
      // is not enough next to CONNECT: require TYPING to end a draft with picks.
      if (n) {
        const typed = window.prompt('End this draft and clear all ' + n + ' picks?\n'
          + 'The board goes back to full; your targets, never-draft list, weights and '
          + 'news overrides are kept.\n\nType END to confirm:');
        if (String(typed || '').trim().toUpperCase() !== 'END') return;
      }
      endDraft();
    });

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
      // A slot set here survives a reload mid-draft; the artifact's value is
      // only a seed.
      try {
        const saved = localStorage.getItem(SLOT_KEY);
        if (saved && Number(saved) !== Number(state.data.league.my_draft_slot)) {
          slotIn.value = saved;
          setSlot(saved);
        }
      } catch (e) { /* private mode */ }
    }
    document.body.addEventListener('click', ev => {
      const me = ev.target.closest('[data-draft-me]');
      if (me) return markDrafted(me.getAttribute('data-draft-me'), true);
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
      applyPreset('balanced', 'Back to the defaults.');
    });
    renderPresets();
    document.body.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-preset]');
      if (btn) { applyPreset(btn.getAttribute('data-preset')); return; }
      const auto = ev.target.closest('[data-auto]');
      if (auto) {
        state.autoWeights = !state.autoWeights;
        try { localStorage.setItem(AUTO_KEY, state.autoWeights ? '1' : '0'); } catch (e) {}
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
      state.sync = new window.DraftSync({ draftId: id, onPicks: onSyncPicks, onStatus: setStatus });
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
