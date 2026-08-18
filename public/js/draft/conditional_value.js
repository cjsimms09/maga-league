// TERRITORY: A
/* CONDITIONAL VALUE — the DISPLAY layer for the stack + handcuff premiums.
 *
 * WIRED BY CORY'S RULING, 2026-08-17 (verbatim: "Yes!"), on the evidence in
 * draft/audit/conditional_value_2026-08-16.md. The layer was built, measured,
 * priced and GATED OFF by construction pending exactly that ruling
 * (docs/queued/conditional-value-program.md: the layer ships OFF, wiring is
 * Cory's call). This file is the wiring — and it is DISPLAY ONLY.
 *
 * THE CONTRACT, unchanged from the queued doc: "board value + stack premium +
 * handcuff premium, EACH PRINTED SEPARATELY so the adjustment is inspectable,
 * never silently blended."  Concretely:
 *
 *   - Nothing here is read by engine.js, composite.js, valuation.js, vorp,
 *     build.py or any scoring path. The composite score Cory compares rows by
 *     DOES NOT contain these numbers, and every chip says so ("not in the
 *     score"). draft/tests/test_conditional_value.py pins both halves: the
 *     display reads the artifact, the scoring side never does.
 *   - The chip ANNOTATES; it never recommends. No take control, no verb, no
 *     second name above the fold — the adjudicated TAKE (verdict.js) keeps the
 *     headline. draft/tests/conditional_value_display.test.js pins this.
 *   - ABSENT IS NEVER ZERO. No artifact -> no chips and one provenance note;
 *     a player without a premium gets nothing, not "+$0".
 *
 * PURE STRING BUILDERS + a join. Data in (the committed artifact
 * conditional_value_2026.json, fetched by app.js the same way the board is),
 * HTML strings out. No DOM, no state, no fetch — testable in node, loaded in
 * the browser before app.js, guarded everywhere it is consumed.
 *
 * Every number rendered here comes FROM the artifact — premiums, correlations,
 * n's, ADPs, availability. This file computes nothing but rounding and the
 * market-vs-depth-chart disagreement (both backups' own artifact fields).
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var MINUS = '−';           // − true minus, the audit doc's own glyph
  var NDASH = '–';           // – range dash

  function money(v) {
    if (v == null) return null;
    var r = Math.round(v);
    return (r < 0 ? MINUS + '$' + Math.abs(r) : '+$' + r);
  }
  function moneyRange(lo, hi) {
    var a = Math.round(lo), b = Math.round(hi);
    if (a === b) return money(lo);
    return (a < 0 ? MINUS + '$' + Math.abs(a) : '+$' + a) + NDASH + Math.abs(b);
  }
  function ptsRange(lo, hi) {
    var a = Math.round(lo), b = Math.round(hi);
    if (a === b) return (a < 0 ? MINUS + Math.abs(a) : '+' + a) + ' pts';
    return (a < 0 ? MINUS + Math.abs(a) : '+' + a) + NDASH + Math.abs(b) + ' pts';
  }
  function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
  function pp(v) { return v == null ? '—' : (v >= 0 ? '+' : MINUS) + (Math.abs(v) * 100).toFixed(1) + 'pp'; }
  function fmtR(v) { return v == null ? '—' : (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2).replace(/^0\./, '0.'); }

  /* "Joe Burrow + Ja'Marr Chase (kept)" -> "Burrow×Chase" — the chip's short
   * pair name comes from the artifact's own label, never a second name list. */
  function shortPair(label) {
    var parts = String(label || '').replace(/\(kept\)/g, '')
      .replace(/ given .*$/, '').split('+');
    var last = function (s) {
      var w = s.trim().split(/\s+/);
      return w[w.length - 1] || '';
    };
    if (parts.length < 2) return String(label || '').trim();
    return last(parts[0]) + '×' + last(parts[1]);
  }

  /* Dollar/point RANGES from the artifact's two arms: the pair-measured rho
   * and the class-pooled (shrunk) rho — the audit's own "+$18–22" is exactly
   * [class, pair] rounded. Nothing here invents a number. */
  function stackNumbers(st) {
    var pair = st.premium_dollars_season;
    var cls = st.premium_dollars_season_class_rho;
    if (pair == null) return null;
    var pPair = st.composite_pts_equiv_season;
    var pCls = (st.sim_class_rho && st.sim_class_rho.pointEquivalentWeekly != null
      && st.co_active_weeks_15 != null)
      ? st.sim_class_rho.pointEquivalentWeekly * st.co_active_weeks_15 : null;
    var negative = pair < 0;
    if (negative || cls == null) {
      return { negative: negative, dollars: money(pair), pts: pPair == null ? null : ptsRange(pPair, pPair),
        clsDollars: cls == null ? null : money(cls) };
    }
    return {
      negative: false,
      dollars: moneyRange(Math.min(pair, cls), Math.max(pair, cls)),
      pts: (pPair != null && pCls != null)
        ? ptsRange(Math.min(pPair, pCls), Math.max(pPair, pCls))
        : (pPair != null ? ptsRange(pPair, pPair) : null),
    };
  }

  /* ── THE JOIN — artifact -> player_id -> entries ─────────────────────────
   * Roster-independent; the roster is applied at render time (entriesFor) so
   * mid-draft roster changes (Burrow drafted) flip Higgins' entry live. */
  function index(artifact) {
    if (!artifact || !artifact.stacks_for_cory) return null;
    var byPid = { stacks: {}, handcuffs: {} };
    (artifact.stacks_for_cory || []).forEach(function (st) {
      var pids = st.pids || {};
      if (!pids.board || st.history == null) return;
      (byPid.stacks[String(pids.board)] = byPid.stacks[String(pids.board)] || []).push(st);
    });
    (artifact.handcuffs_for_cory || []).forEach(function (entry) {
      var backups = entry.backups || [];
      /* market's pick = lowest ADP; depth chart's pick = lowest depth order.
       * When they are DIFFERENT PLAYERS the premium's NAME is uncertain even
       * though the premium is real — the flag Cory needs at pick 150. Derived
       * from the artifact's own fields, per starter. */
      var byAdp = backups.slice().sort(function (a, b) { return (a.adp || 9999) - (b.adp || 9999); })[0];
      var byChart = backups.slice().sort(function (a, b) {
        return (a.depth_chart_order || 99) - (b.depth_chart_order || 99);
      })[0];
      var flag = (byAdp && byChart && byAdp.pid !== byChart.pid)
        ? 'market prices ' + byAdp.name + ' (ADP ' + Math.round(byAdp.adp) + ') as the next man; '
          + 'the depth chart lists ' + byChart.name + ' — the premium follows the ROLE, not the name; watch camp news'
        : null;
      backups.forEach(function (b) {
        if (b.premium_pts_to_cory == null || b.premium_pts_to_cory === 0) return;  // absent or zero: no chip
        byPid.handcuffs[String(b.pid)] = { starter: entry.starter, backup: b, flag: flag };
      });
    });
    byPid.league = artifact.league || {};
    byPid.replacement = artifact.replacement || {};
    byPid.rb_class = artifact.rb_conditional_class || {};
    return byPid;
  }

  /* Which stack entries are LIVE for this pid given Cory's roster right now.
   * partner must be ON the roster (a premium conditional on a player he does
   * not have is not his); an entry superseded by a rostered pid steps aside
   * (Higgins' WR-pair case is replaced by the double-stack case the moment
   * Burrow is on the roster — the audit's own two-row structure). */
  function stacksFor(pid, idx, rosterPids) {
    if (!idx) return [];
    var set = {};
    (rosterPids || []).forEach(function (id) { set[String(id)] = true; });
    return (idx.stacks[String(pid)] || []).filter(function (st) {
      var p = st.pids || {};
      if (!p.partner || !set[String(p.partner)]) return false;
      if (p.superseded_when_on_roster && set[String(p.superseded_when_on_roster)]) return false;
      var nums = stackNumbers(st);
      return !!(nums && (st.premium_dollars_season !== 0));
    });
  }

  function handcuffFor(pid, idx, rosterPids) {
    if (!idx) return null;
    var h = idx.handcuffs[String(pid)];
    if (!h) return null;
    var set = {};
    (rosterPids || []).forEach(function (id) { set[String(id)] = true; });
    // the premium exists only while Cory owns the starter
    if (!set[String(h.starter.pid)]) return null;
    return h;
  }

  /* ── THE CHIP — one labelled line beside board value, never a verdict ──── */
  var NOT_IN_SCORE = '<span class="cv-note">not in the score</span>';

  function stackChipLine(st) {
    var nums = stackNumbers(st);
    if (!nums) return '';
    var h = st.history || {};
    var pair = shortPair(st.label);
    var corr = '(' + esc(pair) + ' r=' + fmtR(h.r_pooled) + ', n=' + esc(h.n_weeks) + ' wks)';
    if (nums.negative) {
      return '<span class="cv-kind">stack</span> <b class="cv-money neg">' + nums.dollars
        + '/season</b> ' + corr + ' — no roster-fit case';
    }
    /* the double stack's qualifier ("only live if Burrow is on the roster")
     * comes from the artifact's own note — a non-kept partner is a condition
     * worth saying out loud on the chip itself. */
    var conditional = (st.pids && st.pids.partner && !st.pids.partner_kept && st.note)
      ? ' · <span class="cv-cond">' + esc(st.note) + '</span>' : '';
    return '<span class="cv-kind">stack</span> <b class="cv-money">' + nums.dollars
      + '/season</b> ' + corr
      + (nums.pts ? ' · ' + nums.pts : '') + conditional;
  }

  function handcuffChipLine(h) {
    var b = h.backup, s = h.starter;
    var own = b.premium_pts_to_cory_own_availability;
    var range = own != null && own !== b.premium_pts_to_cory
      ? ptsRange(Math.min(b.premium_pts_to_cory, own), Math.max(b.premium_pts_to_cory, own))
      : ptsRange(b.premium_pts_to_cory, b.premium_pts_to_cory);
    var sLast = String(s.name || '').split(/\s+/).pop();
    return '<span class="cv-kind">handcuff</span> (' + esc(sLast) + ') <b class="cv-pts">'
      + range + '/season to you</b> · '
      + ptsRange(b.premium_pts_to_field, b.premium_pts_to_field) + ' to the room '
      + '(elevated ' + esc(b.class_elevated_ppw) + '/wk, n=' + esc(b.class_n_elevated_weeks) + ' wks)'
      + ' — <b class="cv-verdict">round 15 or wire, never a mid-round spend</b>'
      + (h.flag ? ' · <span class="cv-flag">⚑ ' + esc(h.flag) + '</span>' : '');
  }

  /* The chip host. Returns '' when this player carries no premium for THIS
   * roster — absent, never zero. */
  function chipHtml(pid, idx, rosterPids) {
    if (!idx) return '';
    var lines = stacksFor(pid, idx, rosterPids).map(stackChipLine).filter(Boolean);
    var h = handcuffFor(pid, idx, rosterPids);
    if (h) lines.push(handcuffChipLine(h));
    if (!lines.length) return '';
    return lines.map(function (l) {
      return '<div class="cv-chip" title="Conditional value TO YOUR ROSTER — measured stack/handcuff premium, '
        + 'printed separately from board value and NEVER added into the composite score">'
        + '<span class="cv-tag">to your roster</span> ' + l + ' · ' + NOT_IN_SCORE + '</div>';
    }).join('');
  }

  /* ── THE DRILL-DOWN READOUT — the full conditional story for one player ── */
  var CAVEAT = 'pricing ran on the v1 money model in the simulated-room proxy '
    + '(equal-mean 10-team weekly-high contest at the champodds sd 21.3); '
    + 'correlations come from 5 seasons of weekly rows and are noisy — the n is part of the number.';

  function stackDrillRows(st) {
    var nums = stackNumbers(st);
    if (!nums) return '';
    var h = st.history || {};
    var cb = st.class_baseline || {};
    var sim = st.sim_pair_rho || {};
    var out = '<div class="cv-drill-block">'
      + '<div class="cv-drill-head">stack — ' + esc(st.label) + '</div>'
      + '<div class="cv-drill-line"><span>premium</span><b class="cv-money' + (nums.negative ? ' neg' : '') + '">'
        + nums.dollars + '/season</b>' + (nums.pts ? '<span class="cv-sub">' + nums.pts + ' composite-equiv</span>' : '') + '</div>'
      + '<div class="cv-drill-line"><span>mechanism</span><span>correlated weekly scores '
        + (nums.negative ? 'REMOVE' : 'add') + ' team variance; the weekly-high pot pays variance: '
        + 'ΔP(weekly high) ' + pp(sim.dHigh) + '/wk over ' + esc(st.co_active_weeks_15) + ' co-active wks</span></div>'
      + '<div class="cv-drill-line"><span>correlation</span><span>' + esc(shortPair(st.label))
        + ' r=' + fmtR(h.r_pooled) + ' (n=' + esc(h.n_weeks) + ' wks, ' + esc((h.per_season || []).length)
        + ' seasons) · class ' + esc(st.cls) + ' r=' + fmtR(cb.r_pooled)
        + ' (' + esc(cb.n_pairs) + ' pairs, ' + esc(cb.n_weeks) + ' wks)</span></div>'
      + (st.bust_tail
        ? '<div class="cv-drill-line"><span>bust tail</span><span>the same covariance moves the BAD weeks too: '
          + 'P(week low) ' + pp(st.bust_tail.dLow) + ', P(&lt; mean−1sd) ' + pp(st.bust_tail.dBelow1Sd)
          + ' — reported, not netted away</span></div>'
        : '')
      + (st.note ? '<div class="cv-drill-line"><span>note</span><span>' + esc(st.note) + '</span></div>' : '')
      + '</div>';
    return out;
  }

  function handcuffDrillRows(h, idx) {
    var b = h.backup, s = h.starter;
    var ca = s.class_availability || {}, oa = s.own_availability || {};
    var wire = ((idx.replacement || {}).wire_per_week || {}).RB;
    var own = b.premium_pts_to_cory_own_availability;
    return '<div class="cv-drill-block">'
      + '<div class="cv-drill-head">handcuff — ' + esc(b.name) + ' behind ' + esc(s.name) + '</div>'
      + '<div class="cv-drill-line"><span>premium</span><b class="cv-pts">+' + esc(b.premium_pts_to_cory)
        + ' pts/season to you</b><span class="cv-sub">(his own miss rate: +' + esc(own)
        + ') · +' + esc(b.premium_pts_to_field) + ' to the room — the asymmetry IS the finding</span></div>'
      + '<div class="cv-drill-line"><span>mechanism</span><span>expected missed starts × (elevated production '
        + MINUS + ' wire): ' + esc(ca.expected_missed_starts_15wk) + ' class-expected missed starts '
        + '(' + Math.round((ca.p_miss_ge1 || 0) * 100) + '% of top-24 RB1s miss ≥1 game, n='
        + esc(ca.n_rb1_seasons) + ' starter-seasons)'
        + (oa.expected_missed_starts_15wk != null
          ? ' · his own rate: ' + esc(oa.expected_missed_starts_15wk) + ' (' + esc(oa.missed_total)
            + '/' + esc(oa.team_games_total) + ' team-games)' : '')
        + '</span></div>'
      + '<div class="cv-drill-line"><span>elevated production</span><span>'
        + esc(b.class_elevated_ppw) + ' pts/wk in exactly the weeks the RB1 sat (n='
        + esc(b.class_n_elevated_weeks) + ' elevated wks, sd ' + esc(b.class_elevated_sd)
        + ') vs wire ' + esc(wire) + '</span></div>'
      + (b.own_elevated_history == null
        ? '<div class="cv-drill-line"><span>his own history</span><span>no measurable elevated weeks behind this '
          + 'starter — ABSENT, not zero; the class number stands in</span></div>'
        : '')
      + '<div class="cv-drill-line"><span>price</span><span>ADP ' + esc(b.adp == null ? '—' : Math.round(b.adp))
        + ' — <b class="cv-verdict">round 15 or wire, never a mid-round spend</b>'
        + ' (the premium is real but small; that is a last-pick price)</span></div>'
      + (h.flag ? '<div class="cv-drill-line"><span>flag</span><span class="cv-flag">⚑ ' + esc(h.flag) + '</span></div>' : '')
      + '</div>';
  }

  function drillHtml(pid, idx, rosterPids) {
    if (!idx) return '';
    var blocks = stacksFor(pid, idx, rosterPids).map(stackDrillRows).filter(Boolean);
    var h = handcuffFor(pid, idx, rosterPids);
    if (h) blocks.push(handcuffDrillRows(h, idx));
    if (!blocks.length) return '';
    return '<div class="cv-drill"><div class="wr-drill-h">conditional value — to your roster '
      + '<span class="cv-note">printed separately · never added into board value</span></div>'
      + blocks.join('')
      + '<div class="cv-caveat">' + esc(CAVEAT) + '</div>'
      + '</div>';
  }

  /* The one honest line for the provenance rail when the artifact is absent. */
  function absentNote() {
    return 'Conditional-value artifact (stack/handcuff premiums) did not load — '
      + 'premium chips are ABSENT, not zero. Board value is unaffected: the composite never reads this layer.';
  }

  var API = {
    index: index,
    stacksFor: stacksFor,
    handcuffFor: handcuffFor,
    chipHtml: chipHtml,
    drillHtml: drillHtml,
    absentNote: absentNote,
    // exported for the unit tests' recompute checks
    _stackNumbers: stackNumbers,
    _shortPair: shortPair,
    _moneyRange: moneyRange,
  };
  global.CondValue = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
