/* The keeper slate screen.
 *
 * Ten teams, three slots each, everything editable, and every edit immediately
 * recomputed through the same DraftKeepers.reapply() the War Room uses — so
 * what this screen says the draft will look like IS what the board will do.
 *
 * The screen is deliberately loud about two things: what an edit costs you, and
 * whether the slate has been confirmed. Neither is decoration. A keeper change
 * the day before the draft is the single failure mode that leaves every number
 * wrong while everything still looks normal.
 */
(function () {
  'use strict';

  const K = window.KeeperLock;
  const DK = window.DraftKeepers;
  const $ = s => document.querySelector(s);
  const PIN_KEY = 'mfga.draft.artifact';

  const state = {
    data: null,
    cfg: null,
    built: {},        // the slate the artifact was built with
    slate: {},        // the slate on screen
    baseline: null,   // recompute of `built`, for the consequence comparison
    search: {},       // per-seat search box state
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  /* REFUSE A FIXTURE BOARD. Loudly, and before anything renders.
   *
   * An offline build substitutes synthetic players — "RB Player 2", "QB
   * Player 8" — and is otherwise shaped exactly like a real board: same
   * fields, same confident projections, same rank order. The ONLY thing that
   * distinguishes it is one provenance field. Render it and you get a keeper
   * screen that looks completely normal and is about nobody.
   *
   * An hour of this project's time went into working out which of three
   * plausible causes was producing fixture names on a screen. That hour is
   * this function. */
  function guardFixture(data) {
    const src = (((data || {}).provenance || {}).adp || {}).adp_source;
    if (src === 'fixture' || src == null) {
      $('#loading').innerHTML = '<div class="card"><div class="body">'
        + '<h2 style="color:#b00020;margin-top:0">This board is not real data</h2>'
        + '<p><strong>adp_source: ' + escapeHtml(String(src)) + '</strong> — this is a '
        + 'fixture build, made when the pipeline could not reach Sleeper or the '
        + 'ADP source. Its players are synthetic ("RB Player 1"), and any keeper '
        + 'slate built against it would be about players who do not exist.</p>'
        + '<p>The keeper screen will not open on a fixture board. Rebuild the '
        + 'artifact against live sources, or open the deployed site rather than '
        + 'a local copy.</p>'
        + '<p style="opacity:.7">built_at ' + escapeHtml(String((data || {}).built_at))
        + ' &middot; ' + (((data || {}).players || []).length) + ' players</p>'
        + '</div></div>';
      throw new Error('fixture board refused');
    }
    return data;
  }

  // ---------------------------------------------------------------- bootstrap
  function boot() {
    fetch('/draft_data.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(guardFixture)
      .then(start)
      .catch(() => {
        // The pinned artifact is the same one the War Room runs from offline.
        try {
          const pin = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
          if (pin && pin.data) return start(pin.data);
        } catch (e) { /* fall through */ }
        $('#loading').innerHTML = '<div class="card"><div class="body">'
          + '<p>Could not load the draft board, so the keeper slate cannot be '
          + 'edited against it. Open the War Room once while online, then come back — '
          + 'it pins a local copy.</p></div></div>';
      });
  }

  function start(data) {
    state.data = data;
    const league = data.league || {};
    const ov = window.CFG_OVERRIDES || {};
    const teams = ov.teams || league.teams || 10;
    // BUG FIX (2026-08-08): forfeited entries can arrive with name == player_id
    // and position '?' (a slate stored as raw ids). Route every one through the
    // shared PlayerRef resolver so the keeper screen renders name + position +
    // team + bye, and an unresolvable id renders LOUDLY as "Unknown player (id)"
    // (and is logged) — never a bare number. One resolver, every reader.
    const rawForfeited = (data.pick_order || {}).forfeited || [];
    const forfeited = (typeof PlayerRef === 'undefined') ? rawForfeited : rawForfeited.map(function (f) {
      const r = PlayerRef.resolve(f, data);
      if (!r.resolved) {
        try { console.error('keeper slate: unresolvable player id on the board — ' + r.player_id); } catch (e) {}
      }
      // Keep the forfeiture fields (team_slot, cost_round, original_round…) and
      // overwrite the display fields with resolved metadata.
      return Object.assign({}, f, { name: r.name, position: r.position || f.position,
        team: r.team || f.team, bye: r.bye != null ? r.bye : f.bye, resolved: r.resolved });
    });
    // Rounds has to include the picks keepers ate, or the rebuilt order is
    // short by exactly the number of keepers and every pick number is wrong.
    const rounds = Math.round(((data.pick_order || {}).picks || []).length / teams)
      + Math.round(forfeited.length / teams);

    state.cfg = {
      teams: teams,
      rounds: rounds || ((league.roster_size || 15) - ((league.keeper_rules || {}).count || 0)),
      draft_type: ov.draft_type || league.draft_type || 'snake',
      my_draft_slot: ov.my_draft_slot || league.my_draft_slot,
      adp_blend_weight: 0.7,
      keepers: Object.assign({ count: 3, cost_model: 'original_round' },
        league.keeper_rules || {}, ov.keepers || {}),
      original_rounds: league.original_rounds || {},
    };

    state.built = K.slateFromForfeited(forfeited);
    state.baseline = recompute(state.built);

    // A slate edited earlier survives a reload — that is the whole point of
    // persisting it, since corrections get made minutes before the draft.
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(K.CFG.SLATE_KEY) || 'null'); } catch (e) {}
    state.slate = saved && Object.keys(saved).length ? saved : clone(state.built);
    // A saved slate silently OVERRIDES the one Sleeper rebuilds nightly. That
    // is right for a correction made minutes before the draft and wrong when
    // keepers get finalised on Sleeper and the saved copy goes on shadowing
    // them. Say which one is in force rather than letting it be discovered.
    state.divergence = (saved && Object.keys(saved).length)
      ? K.divergesFromSource(saved, state.built) : null;
    // Entries in neither the draftable board nor Sleeper's keeper set are not
    // players in this artifact at all — a slate carried over from a different
    // board. Blocking, because confirming it would price the whole draft
    // against people who do not exist.
    const boardById = {};
    (state.data.players || []).forEach(function (p) { boardById[String(p.player_id)] = p; });
    state.orphans = K.orphans(state.slate, boardById, state.built);

    $('#loading').style.display = 'none';
    $('#keeper-screen').style.display = '';
    wire();
    render();
  }

  function saveSlate() {
    try { localStorage.setItem(K.CFG.SLATE_KEY, JSON.stringify(state.slate)); } catch (e) {}
  }
  function readLock() {
    try { return JSON.parse(localStorage.getItem(K.CFG.LOCK_KEY) || 'null'); } catch (e) { return null; }
  }

  /* One recompute, through exactly the path the War Room uses. */
  function recompute(slate) {
    const out = DK.reapply(state.data.players || [], state.cfg, slate);
    const kept = {};
    out.kept_ids.forEach(id => { kept[String(id)] = true; });
    const pool = (out.players || []).filter(p => !kept[String(p.player_id)]);
    const first = out.order.my_picks[0];
    // "Best likely to reach my first pick" — the plainest possible reading of
    // what a keeper change did to me. Adjusted ADP is already the remapped
    // number, so a player whose ADP is past my pick is one I can expect.
    let bestAtFirst = null;
    pool.slice().sort((a, b) => (a.adjusted_adp || 1e9) - (b.adjusted_adp || 1e9))
      .some(p => {
        if ((p.adjusted_adp || 0) >= first) { bestAtFirst = p; return true; }
        return false;
      });
    return { order: out.order, myPicks: out.order.my_picks, poolSize: pool.length,
             bestAtFirst: bestAtFirst, keptIds: out.kept_ids };
  }

  // ------------------------------------------------------------------- render
  function render() {
    // The divergence banner renders before anything else, because it answers
    // "which slate am I even looking at" — and every number below it is
    // computed from the answer.
    const dv = $('#divergence');
    if (dv) {
      const orph = state.orphans || [];
      dv.innerHTML = (orph.length
        ? '<div class="stale-block"><h3 style="color:#b00020">\u26d4 This slate is about a '
          + 'different board</h3><p>' + orph.length + ' keeper'
          + (orph.length === 1 ? '' : 's') + ' on it — '
          + orph.slice(0, 4).map(function (o) { return escapeHtml(o.name); }).join(', ')
          + (orph.length > 4 ? ', \u2026' : '')
          + ' — are neither on the draftable board nor in Sleeper\u2019s keeper list, '
          + 'so they are not players in this artifact at all. This slate was saved '
          + 'against a different board. Do not confirm it; reset it first.</p>'
          + '<button id="reset-orphans" class="btn">Reset to Sleeper\u2019s keepers</button>'
          + '</div>'
        : '') + (state.divergence
        ? '<div class="stale-block"><h3>⚠ Your saved slate is shadowing Sleeper</h3>'
          + '<p>' + escapeHtml(state.divergence.message) + '</p>'
          + '<button id="reset-to-source" class="btn">Reset to Sleeper\u2019s keepers</button></div>'
        : '');
      const btn = $('#reset-to-source') || $('#reset-orphans');
      if (btn) btn.onclick = function () {
        state.slate = clone(state.built);
        state.divergence = null;
        state.orphans = [];
        saveSlate();
        render();
      };
    }
    let now;
    try { now = recompute(state.slate); } catch (err) {
      // A slate the cost model cannot price (an undrafted keeper in a league
      // that forbids them) throws. Say which keeper, rather than a blank screen.
      $('#consequence').innerHTML = '<div class="stale-block"><h3>⛔ This slate cannot be priced</h3>'
        + '<p>' + escapeHtml(err.message) + '</p></div>';
      $('#problems').innerHTML = '';
      $('#diff').innerHTML = '';
      renderTeams();
      return;
    }
    state.now = now;

    renderLock();
    renderConsequence(now);
    renderDiff();
    renderProblems();
    renderPicks(now);
    renderTeams();
  }

  function renderLock() {
    const host = $('#lock-banner');
    const st = K.lockState(readLock(), state.slate, Date.now());
    if (st.locked && !st.stale) {
      host.innerHTML = '<div class="prov-note"><b>🔒</b> <span>' + escapeHtml(st.message) + '</span></div>';
      return;
    }
    host.innerHTML = '<div class="stale-block' + (st.stale ? ' warn' : '') + '">'
      + '<h3>' + (st.stale ? '⚠️ Confirmed a while ago' : '⛔ Keeper slate not confirmed') + '</h3>'
      + '<p>' + escapeHtml(st.message) + '</p></div>';
  }

  function renderConsequence(now) {
    const lines = K.consequence(state.baseline, now);
    const changed = K.diffSlates(state.built, state.slate).changed;
    $('#ks-head').textContent = changed
      ? changed + ' change' + (changed === 1 ? '' : 's') + ' from the built slate'
      : 'matches the slate the board was built with';
    $('#consequence').innerHTML = lines.map(l =>
      '<div class="conseq' + (/No change/.test(l) ? ' quiet' : '') + '">' + escapeHtml(l) + '</div>').join('');
  }

  function renderDiff() {
    const d = K.diffSlates(state.built, state.slate);
    const host = $('#diff');
    if (!d.changed) { host.innerHTML = ''; return; }
    const row = (cls, sign, text) => '<div class="diff-row ' + cls + '"><span>' + sign + '</span>'
      + '<span>' + escapeHtml(text) + '</span></div>';
    host.innerHTML = '<div class="diff-box"><div class="threat-sub">Against the built slate</div>'
      + d.added.map(k => row('add', '+', seatName(k.team_slot) + ' keeps ' + k.name
          + ' (round ' + k.original_round + ')')).join('')
      + d.removed.map(k => row('rm', '−', seatName(k.team_slot) + ' no longer keeps ' + k.name)).join('')
      + d.moved.map(m => row('mv', '→', seatName(m.keeper.team_slot) + ' — ' + m.keeper.name
          + ' costs round ' + m.from + ' → ' + m.to)).join('')
      + '</div>';
  }

  function renderProblems() {
    const byId = {};
    (state.data.players || []).forEach(p => { byId[String(p.player_id)] = p; });
    const probs = K.validate(state.slate, state.cfg, byId);
    const host = $('#problems');
    if (!probs.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="prob-box">' + probs.map(p =>
      '<div class="prob-row">⚠️ ' + escapeHtml(p) + '</div>').join('') + '</div>';
  }

  function renderPicks(now) {
    const before = state.baseline.myPicks, after = now.myPicks;
    $('#ks-picks').innerHTML = '<div class="pick-strip">'
      + after.slice(0, 16).map((p, i) => '<span class="pick-chip'
          + (before[i] !== p ? ' moved' : '') + '">' + p
          + (before[i] != null && before[i] !== p
              ? '<span class="was">was ' + before[i] + '</span>' : '') + '</span>').join('')
      + '</div>'
      + (now.bestAtFirst
          ? '<p class="muted" style="margin:.4rem 0 0; font-size:.76rem">Best player likely to reach '
            + 'pick ' + after[0] + ': <b>' + escapeHtml(now.bestAtFirst.name) + '</b> ('
            + escapeHtml(now.bestAtFirst.position) + ', adj ADP '
            + Math.round(now.bestAtFirst.adjusted_adp) + ')</p>'
          : '');
  }

  function seatName(slot) {
    const owners = window.OWNERS_BY_SLOT || {};
    return owners[String(slot)] ? owners[String(slot)] : 'Seat ' + slot;
  }

  // Big-board value of a player_id (proj_mean, fallback to −overall_rank), used to
  // order each team's keepers BEST-FIRST so the most valuable keeper reads as
  // "round 1", the next "round 2", etc. — for EVERY team. Under top_picks_flat the
  // order is cost- and hash-independent, so sorting the slate in place is safe.
  function boardValue(id) {
    const m = state._valById || (state._valById = (function () {
      const map = {};
      const add = (arr) => (arr || []).forEach(p => {
        const k = String(p.player_id);
        if (map[k] == null) map[k] = (p.proj_mean != null ? p.proj_mean
          : (p.overall_rank != null ? -p.overall_rank : 0));
      });
      add((state.data || {}).kept_players);
      add((state.data || {}).players);
      return map;
    })());
    return m[String(id)] || 0;
  }

  function renderTeams() {
    const max = state.cfg.keepers.count == null ? 3 : Number(state.cfg.keepers.count);
    const mine = Number(state.cfg.my_draft_slot);
    let html = '';
    for (let slot = 1; slot <= state.cfg.teams; slot++) {
      const list = state.slate[String(slot)] || [];
      // Best board value first → round 1, 2, 3 … (in place; order is safe).
      list.sort((a, b) => boardValue(b.player_id) - boardValue(a.player_id));
      const q = state.search[slot] || '';
      html += '<div class="card keeper-card' + (slot === mine ? ' mine' : '') + '">'
        + '<h2>' + escapeHtml(seatName(slot)) + (slot === mine ? ' <span class="sub">you</span>' : '')
        + ' <span class="sub">' + list.length + ' of ' + max + '</span></h2>'
        + '<div class="body">'
        + (list.length ? list.map((k, i) => keeperRow(slot, i, k)).join('')
                       : '<p class="muted" style="margin:0 0 .5rem; font-size:.8rem">No keepers.</p>')
        + (list.length < max
            ? '<div class="keeper-add">'
              + '<input type="text" class="ks-search" data-slot="' + slot + '" '
              + 'placeholder="Add a keeper — type a name" value="' + escapeHtml(q) + '">'
              + searchResults(slot, q) + '</div>'
            : '')
        + '</div></div>';
    }
    $('#teams').innerHTML = html;
  }

  function keeperRow(slot, i, k) {
    // COST ROUND display. Under top_picks_flat the cost is RANK-derived — keeping
    // N keepers forfeits rounds 1..N — so the Nth keeper (by slate order) costs
    // round i+1, regardless of the player's original draft round. Showing
    // original_round here made all three of a same-tier keeper set read "round 1",
    // which is wrong: they forfeit rounds 1, 2 AND 3 (hence first live pick = r4).
    // So for top_picks_flat we render a read-only, rank-derived cost; other cost
    // models (original_round / fixed_round) keep the editable per-keeper input.
    const model = (state.cfg.keepers || {}).cost_model;
    let costCell;
    if (model === 'top_picks_flat') {
      const r = i + 1;
      costCell = '<span class="keeper-cost fixed" title="top-picks-flat: keeping ' + r
        + ' keeper' + (r === 1 ? '' : 's') + ' forfeits rounds 1–' + r + '">round <b>' + r + '</b></span>';
    } else {
      const val = k.cost_round != null ? k.cost_round : k.original_round;
      costCell = '<label class="keeper-cost">round '
        + '<input type="number" min="1" max="' + state.cfg.rounds + '" '
        + 'value="' + (val == null ? '' : val) + '" '
        + 'data-cost="' + slot + ':' + i + '"></label>';
    }
    return '<div class="keeper-row">'
      + '<span class="keeper-name">' + escapeHtml(k.name)
      + '<span class="rec-pos ' + escapeHtml(k.position || '?') + '">'
      + escapeHtml(k.position || '?') + '</span></span>'
      + costCell
      + '<button class="btn small ghost" data-drop="' + slot + ':' + i + '" title="Remove">✕</button>'
      + '</div>';
  }

  /* Search the WHOLE player list, not the draftable board.
   *
   * A keeper is by definition off the board, so searching the board would fail
   * to find the very players this screen exists to manage. */
  function searchResults(slot, q) {
    if (!q || q.length < 2) return '';
    const needle = q.toLowerCase();
    const taken = {};
    K.keepersOf(state.slate).forEach(x => { taken[String(x.player_id)] = true; });
    const hits = (state.data.players || [])
      .filter(p => !taken[String(p.player_id)] && String(p.name).toLowerCase().indexOf(needle) >= 0)
      .slice(0, 6);
    if (!hits.length) {
      return '<div class="ks-hits"><span class="muted">Nobody on the board by that name. '
        + 'A keeper who was never draftable has to be added on the League Setup screen.</span></div>';
    }
    return '<div class="ks-hits">' + hits.map(p =>
      '<button class="btn small ghost" data-add="' + slot + ':' + escapeHtml(String(p.player_id)) + '">'
      + escapeHtml(p.name) + ' <span class="muted">' + escapeHtml(p.position || '')
      + (p.raw_adp ? ' · adp ' + Math.round(p.raw_adp) : '') + '</span></button>').join('') + '</div>';
  }

  // -------------------------------------------------------------------- wiring
  function wire() {
    document.body.addEventListener('click', ev => {
      const drop = ev.target.closest('[data-drop]');
      if (drop) {
        const [slot, i] = drop.getAttribute('data-drop').split(':');
        (state.slate[slot] || []).splice(Number(i), 1);
        if (!state.slate[slot].length) delete state.slate[slot];
        saveSlate(); render(); return;
      }
      const add = ev.target.closest('[data-add]');
      if (add) {
        const raw = add.getAttribute('data-add');
        const slot = raw.slice(0, raw.indexOf(':'));
        const id = raw.slice(raw.indexOf(':') + 1);
        const p = (state.data.players || []).find(x => String(x.player_id) === id);
        if (p) {
          // Default his cost to the league's own record of where he went, and
          // fall back to his current ADP round — a guess that is visible and
          // editable beats an empty box somebody forgets to fill in.
          const orig = (state.cfg.original_rounds || {})[id];
          const guess = orig != null ? Number(orig)
            : Math.max(1, Math.ceil((p.raw_adp || p.adjusted_adp || 1) / state.cfg.teams));
          (state.slate[slot] = state.slate[slot] || []).push({
            player_id: String(p.player_id), name: p.name, position: p.position,
            original_round: guess, years_kept: 1,
            cost_guessed: orig == null,
          });
          state.search[slot] = '';
          saveSlate(); render();
        }
        return;
      }
      if (ev.target.closest('#ks-confirm')) return confirmSlate();
      if (ev.target.closest('#ks-revert')) {
        state.slate = clone(state.built);
        saveSlate(); render();
        note('Back to the slate the board was built with.');
      }
    });

    document.body.addEventListener('input', ev => {
      const s = ev.target.closest('.ks-search');
      if (s) {
        state.search[s.getAttribute('data-slot')] = s.value;
        renderTeams();
        // Re-rendering the list blurs the box; put the caret back or typing a
        // second character is impossible.
        const again = document.querySelector('.ks-search[data-slot="' + s.getAttribute('data-slot') + '"]');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        return;
      }
      const c = ev.target.closest('[data-cost]');
      if (c) {
        const [slot, i] = c.getAttribute('data-cost').split(':');
        const k = (state.slate[slot] || [])[Number(i)];
        if (k) {
          const v = parseInt(c.value, 10);
          k.original_round = isNaN(v) ? null : v;
          k.cost_guessed = false;
          saveSlate();
          // Everything except the team list, so the box keeps focus mid-typing.
          try {
            state.now = recompute(state.slate);
            renderLock(); renderConsequence(state.now); renderDiff();
            renderProblems(); renderPicks(state.now);
          } catch (e) { /* a half-typed round is not an error worth shouting about */ }
        }
      }
    });
  }

  function confirmSlate() {
    const byId = {};
    (state.data.players || []).forEach(p => { byId[String(p.player_id)] = p; });
    const probs = K.validate(state.slate, state.cfg, byId);
    // Problems are warnings, not a veto — a keeper genuinely off the board is a
    // real situation. But confirming past one has to be a deliberate act.
    if (probs.length && !window.confirm(probs.length + ' problem'
        + (probs.length === 1 ? '' : 's') + ' with this slate:\n\n' + probs.join('\n\n')
        + '\n\nConfirm anyway?')) return;
    const guessed = K.keepersOf(state.slate).filter(k => k.cost_guessed);
    if (guessed.length && !window.confirm(guessed.length + ' keeper'
        + (guessed.length === 1 ? '' : 's') + ' still have a GUESSED cost round ('
        + guessed.map(g => g.name).join(', ') + ').\n\nEvery pick number depends on '
        + 'these being right. Confirm anyway?')) return;

    try {
      localStorage.setItem(K.CFG.LOCK_KEY, JSON.stringify({
        hash: K.slateHash(state.slate), at: new Date().toISOString(),
      }));
    } catch (e) {}
    render();
    note('Locked. The War Room will stop warning about the slate. Change anything '
      + 'here and it unlocks itself — a cleared banner over an edited slate would be '
      + 'worse than no banner.');
  }

  function note(msg) { const el = $('#ks-note'); if (el) el.textContent = msg; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
