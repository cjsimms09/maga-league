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
  };

  // ---------------------------------------------------------------- bootstrap
  function init() {
    loadWeights();
    fetch('/draft_data.json', { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) throw new Error('draft_data.json not found (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(data => {
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
        // The slot is the one override that invalidates the artifact rather
        // than just annotating it: every "my pick" number in pick_order was
        // computed for the slot the pipeline built with. Accepting a new slot
        // and keeping the old pick numbers would score the whole draft against
        // someone else's turns. Recompute instead.
        applySlot(data);
        state.profiles = indexProfilesBySlot(data);
        // Format-derived defaults before anything is scored: bench depth is
        // worth much less in a 10-team, 3-keeper league than the 12-team
        // constants assumed, and that changes the whole back half of the draft.
        state.format = E.applyFormatDefaults(data.league);
        state.board = data.players.slice();
        renderAll();
        wireControls();
        $('#loading').style.display = 'none';
        $('#warroom').style.display = '';
      })
      .catch(err => {
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
    renderHeader();
    renderRecommendations();
    renderBoard();
    renderRoster();
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

    // Artifact age. Stale on draft day is the expensive kind of stale.
    const built = Date.parse(d.built_at || '');
    if (built) {
      const hours = (Date.now() - built) / 3.6e6;
      if (hours > 36) {
        notes.push({ level: 'bad', text: 'This board is ' + Math.round(hours / 24)
          + ' days old. Injury status and projections have moved since it was built.' });
      } else if (hours > 12) {
        notes.push({ level: 'warn', text: 'This board is ' + Math.round(hours)
          + ' hours old — rebuild before you draft off it.' });
      }
    }

    if (!notes.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.style.display = '';
    host.innerHTML = notes.map(n =>
      '<div class="prov-note ' + n.level + '"><b>' + (n.level === 'bad' ? '⛔' : '⚠️')
      + '</b> <span>' + escapeHtml(n.text) + '</span></div>').join('');
  }

  function renderRecommendations() {
    const all = E.recommend(context());
    const scored = all.slice(0, 5);
    const host = $('#recs');
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
      return '<div class="rec-card' + (i === 0 ? ' top' : '') + '">' +
        '<div class="rec-rank">' + (i + 1) + '</div>' +
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
    const rows = state.board
      .filter(p => state.filterPos === 'ALL' || p.position === state.filterPos)
      .filter(p => !state.search || p.name.toLowerCase().indexOf(state.search) !== -1)
      .slice(0, 200);
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
        '<td class="num"><button class="btn small ghost" data-draft-other="' + p.player_id + '">✕</button></td>' +
      '</tr>').join('');
    $('#board-count').textContent = rows.length + ' shown of ' + state.board.length + ' available';
  }

  function riskFlags(p) {
    const flags = [];
    if (p.injury_status && !/^(healthy|active)$/i.test(p.injury_status)) flags.push('<span class="badge owes">' + escapeHtml(p.injury_status) + '</span>');
    if (p.age && p.age >= 30 && (p.position === 'RB')) flags.push('<span class="badge owes">age ' + p.age + '</span>');
    if (p.opportunity_z > 1) flags.push('<span class="badge open">opp ↑</span>');
    if (p.opportunity_z < -1) flags.push('<span class="badge owes">opp ↓</span>');
    return flags.join(' ');
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
        cells.push('<div class="slot-chip ' + (occupant ? 'filled' : 'empty') + '">' +
          '<span class="slot-label">' + slot + '</span>' +
          '<span>' + (occupant ? escapeHtml(occupant.name) : '—') + '</span></div>');
      }
    });
    $('#roster-slots').innerHTML = cells.join('');
    $('#roster-list').innerHTML = state.myRoster.length
      ? state.myRoster.map(p => '<li>' + escapeHtml(p.name) + ' <span class="muted">' + p.position + ' · ' + Math.round(p.proj_mean) + '</span></li>').join('')
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
  }

  function renderPicksFeed() {
    const picks = state.sync ? state.sync.allPicks().slice(-12).reverse() : [];
    $('#picks-feed').innerHTML = picks.length
      ? picks.map(p => {
          const pl = playerById(p.player_id);
          return '<li><b>' + (p.pick_no || '?') + '.</b> ' +
            escapeHtml(pl ? pl.name : (p.metadata.first_name || '') + ' ' + (p.metadata.last_name || '')) +
            ' <span class="muted">' + (pl ? pl.position : (p.metadata.position || '')) +
            (p.source === 'manual' ? ' · typed' : '') + '</span></li>';
        }).join('')
      : '<li class="muted">No picks yet.</li>';
  }

  function playerById(id) {
    return (state.data.players || []).find(p => String(p.player_id) === String(id));
  }

  // ----------------------------------------------------------------- actions
  function markDrafted(playerId, toMe, teamSlot) {
    const p = playerById(playerId);
    if (!p) return;
    state.drafted.add(String(playerId));
    state.board = state.board.filter(x => String(x.player_id) !== String(playerId));
    state.recentPicks.push({ position: p.position, player_id: playerId,
                             pick_no: state.recentPicks.length + 1, player: p });
    const slot = toMe ? state.data.league.my_draft_slot : teamSlot;
    if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
    if (toMe) state.myRoster.push(p);
    recomputeRuns();
    renderAll();
  }

  function recomputeRuns() {
    state.runMults = E.runMultipliers(state.recentPicks, state.data.players, currentPick());
    updateDrift();
  }

  function onSyncPicks(picks) {
    // Reconcile the API's view with ours: anything it knows that we don't.
    const mySlot = state.data.league.my_draft_slot;
    picks.forEach(pick => {
      const id = String(pick.player_id);
      if (state.drafted.has(id)) return;
      const p = playerById(id);
      state.drafted.add(id);
      state.board = state.board.filter(x => String(x.player_id) !== id);
      if (p) {
        state.recentPicks.push({ position: p.position, player_id: id,
                                 pick_no: pick.pick_no || (state.recentPicks.length + 1),
                                 player: p });
        const slot = pick.draft_slot || pick.roster_id;
        if (slot) (state.rosters[slot] = state.rosters[slot] || []).push(p);
        if (pick.roster_id && mySlot && Number(pick.roster_id) === Number(mySlot)) state.myRoster.push(p);
      }
    });
    recomputeRuns();
    renderAll();
  }

  // ----------------------------------------------------------------- wiring
  function wireControls() {
    document.body.addEventListener('click', ev => {
      const me = ev.target.closest('[data-draft-me]');
      if (me) return markDrafted(me.getAttribute('data-draft-me'), true);
      const other = ev.target.closest('[data-draft-other]');
      if (other) return markDrafted(other.getAttribute('data-draft-other'), false);
      const why = ev.target.closest('[data-why]');
      if (why) return showWhy(why.getAttribute('data-why'));
    });

    $$('.weight-slider').forEach(sl => {
      sl.addEventListener('input', () => {
        state.weights[sl.dataset.weight] = parseFloat(sl.value);
        $('#w-' + sl.dataset.weight).textContent = parseFloat(sl.value).toFixed(1);
        saveWeights();
        renderRecommendations();
      });
    });
    $('#reset-weights').addEventListener('click', () => {
      state.weights = Object.assign({}, E.DEFAULT_WEIGHTS);
      $$('.weight-slider').forEach(sl => {
        sl.value = state.weights[sl.dataset.weight];
        $('#w-' + sl.dataset.weight).textContent = state.weights[sl.dataset.weight].toFixed(1);
      });
      saveWeights();
      renderRecommendations();
    });

    $('#pos-filter').addEventListener('change', e => { state.filterPos = e.target.value; renderBoard(); });
    $('#search').addEventListener('input', e => { state.search = e.target.value.toLowerCase(); renderBoard(); });

    $('#start-sync').addEventListener('click', () => {
      const id = $('#draft-id').value.trim();
      if (!id) { setStatus({ state: 'manual', message: 'Manual mode — mark picks yourself as they happen.' }); return; }
      state.sync = new window.DraftSync({ draftId: id, onPicks: onSyncPicks, onStatus: setStatus });
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
