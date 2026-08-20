/* WAR-ROOM COCKPIT LAYER — tabs, position rails, right-rail charts, drill-down.
 *
 * THE REBUILD (Cory's order, 2026-08-17): the war room is a single-screen
 * draft cockpit, not a scroll. This file is the presentation layer on TOP of
 * app.js — it never scores, never mutates, never re-fetches. It reads the ONE
 * narrow accessor app.js exposes (window.WarRoomData) and renders into the
 * hosts views/admin/warroom.ejs provides. Loaded AFTER app.js; app.js calls
 * WarRoomCockpit.refresh() at the end of every renderAll(), guarded, so a
 * failure here can never block the clock.
 *
 * TWO HALVES, deliberately separated:
 *
 *   1. PURE CHART BUILDERS (WarRoomCharts.*) — data in, HTML/SVG string out.
 *      No DOM, no state, no window reads. Inline SVG only — ZERO external
 *      libraries. Unit-tested with fixtures in
 *      draft/tests/warroom_charts.test.js (cliff indices, survival monotone,
 *      honest empty states).
 *
 *   2. THE COCKPIT CONTROLLER (WarRoomCockpit) — wires the tab bar
 *      (hash-persisted, pure show/hide of panels that stay in the DOM), the
 *      left rail (top 10 per position), the right-rail charts, the columnar
 *      big board, and the one reusable drill-down. All take/queue/compare
 *      actions inside anything this file renders reuse app.js's delegated
 *      data-draft-me / data-queue / data-compare handlers — never a second
 *      take path.
 *
 * Every number rendered here arrives from the engine via WarRoomData (scored
 * entries, timing rows, board fields). Nothing here invents a quantity.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function shortName(n) {
    var parts = String(n || '').trim().split(/\s+/);
    if (parts.length < 2) return parts[0] || '';
    return parts[0].charAt(0) + '. ' + parts.slice(1).join(' ');
  }
  function lastName(n) {
    var parts = String(n || '').trim().split(/\s+/);
    return parts[parts.length - 1] || '';
  }
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  /* Used by pure builders below AND the browser-only controller section past
   * the `typeof document === 'undefined'` guard — declared up here, not down
   * there, so a pure-builder call from Node (unit tests) sees it too instead
   * of tripping over an undefined array the guard never let it reach. */
  var POS_ALL = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  /* ════════════════════════ PURE CHART BUILDERS ═══════════════════════════ */

  /* ── RANGE BAR — one shortlist row's outcome range ────────────────────────
   * floor→ceiling as a translucent band, the projection as a solid tick, on a
   * scale SHARED across the list (opts.min/max — the caller owns the scale so
   * every bar is comparable). opts.lead paints the leader's band gold.
   * Returns '' when the inputs cannot make an honest bar.                    */
  function rangeBar(floor, mean, ceiling, opts) {
    opts = opts || {};
    var min = opts.min, max = opts.max;
    if (floor == null || mean == null || ceiling == null) return '';
    if (min == null || max == null || !(max > min)) return '';
    if (!(ceiling >= floor)) return '';
    var w = opts.w || 150, h = opts.h || 12;
    var x = function (v) {
      var t = (v - min) / (max - min);
      return Math.max(0, Math.min(1, t)) * w;
    };
    var bx = x(floor), bw = Math.max(1, x(ceiling) - bx), mx = x(mean);
    /* ── REGISTER 4v: SAY WHEN THE CEILING IS NOT ABOUT THIS PLAYER ──────────
     * `opts.cohortCeiling` marks a bar whose ceiling came from the band average
     * rather than the player's own measured tail. 34 of the 173 skill players
     * in Cory's ADP 25-220 range are like this, and their ratios give it away:
     * 1.4388 for four WRs, 1.4452/1.4453 for five more, 1.6081 for three QBs —
     * a per-band constant wearing a measured-looking stamp.
     *
     * A TOOLTIP WAS NOT ENOUGH. The row's complaint is that "nothing on screen
     * says so", and at eight seconds a pick nobody hovers. So it renders a
     * visible mark AND says it in the title and the aria-label.
     *
     * DELIBERATELY NOT A WARNING. For several of these the model is refusing to
     * guess from data it does not have, which is a strength — the mark says
     * where the number came from, it does not say the number is wrong. */
    var cohort = !!opts.cohortCeiling;
    var ceilNote = cohort ? ' (cohort average, not this player)' : '';
    return '<span class="wr-range' + (opts.lead ? ' lead' : '')
      + (cohort ? ' cohort-ceiling' : '') + '" title="floor '
      + Math.round(floor) + ' · proj ' + Math.round(mean) + ' · ceiling '
      + Math.round(ceiling) + ceilNote + '">'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h
      + '" role="img" aria-label="outcome range ' + Math.round(floor) + ' to ' + Math.round(ceiling)
      + ceilNote + ', projection ' + Math.round(mean) + '" data-f="' + r1(floor) + '" data-m="' + r1(mean)
      + '" data-c="' + r1(ceiling) + '" data-cohort-ceiling="' + (cohort ? '1' : '0') + '">'
      + '<line class="wr-range-rail" x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '"/>'
      + '<rect class="wr-range-band" x="' + bx.toFixed(1) + '" y="2" width="' + bw.toFixed(1)
        + '" height="' + (h - 4) + '" rx="2"/>'
      + '<line class="wr-range-tick" x1="' + mx.toFixed(1) + '" y1="0" x2="' + mx.toFixed(1)
        + '" y2="' + h + '"/>'
      + '</svg>'
      /* One character, after the bar, styled by B. Cory called the card "too
       * busy and wordy" (register 4b), so this is a mark and not a sentence —
       * the sentence lives in the title for anyone who stops to read it. */
      + (cohort ? '<sup class="wr-ceil-cohort" title="This ceiling is the band '
          + 'average, not a measurement of this player">~</sup>' : '')
      + '</span>';
  }

  /* ── LEFT RAIL — top N at each position ──────────────────────────────────
   * groups: [{ pos, total, collapsed, rows: [{ id, name, gone (0-100|null),
   * tier, team }] }]. gone is the SAME market+room number the shortlist prints
   * (1 − survival_to_next). Row click = drill-down (data-drill).             */
  function posRails(groups) {
    groups = (groups || []).filter(function (g) { return g && g.pos; });
    if (!groups.length) return '<p class="wr-chart-empty">no board yet</p>';
    var goneCls = function (g) {
      if (g == null) return '';
      return g >= 70 ? ' hot' : g >= 40 ? ' warm' : ' cool';
    };
    var rail = function (g) {
      var rows = (g.rows || []).map(function (p, i) {
        return '<li class="wr-pr-row" data-drill="' + esc(p.id) + '">'
          + '<span class="wr-pr-rank">' + (i + 1) + '</span>'
          + '<span class="wr-pr-name">' + esc(shortName(p.name)) + '</span>'
          + '<span class="wr-pr-tier t' + ((p.tier || 1) - 1) % 6 + '" title="tier ' + esc(p.tier) + '">' + esc(p.tier || '·') + '</span>'
          + '<span class="wr-pr-gone' + goneCls(p.gone) + '" title="chance GONE by your next pick (market+room — the score’s number)">'
          + (p.gone == null ? '—' : p.gone + '%') + '</span>'
          + '</li>';
      }).join('');
      var head = '<div class="wr-pr-head"><b>' + esc(g.pos) + '</b>'
        + '<span class="wr-pr-left">' + esc(g.total) + ' left</span>'
        + '<span class="wr-pr-cap" title="chance gone by your next pick">gone?</span></div>';
      var body = rows ? '<ol class="wr-pr-list">' + rows + '</ol>'
        : '<p class="wr-chart-empty">none left</p>';
      if (g.collapsed) {
        return '<details class="wr-posrail collapsed"><summary>' + esc(g.pos)
          + ' <span class="wr-pr-left">' + esc(g.total) + ' left</span></summary>'
          + body + '</details>';
      }
      return '<div class="wr-posrail">' + head + body + '</div>';
    };
    return groups.map(rail).join('');
  }

  /* ── RUNNING-OUT TILES — the position-level now-vs-wait answer ───────────
   * rows: [{ position, verdict, costWait (pts), filled, hollow, note }]
   *   filled  players left in the CURRENT top tier at that position  → ■
   *   hollow  players in the tier after the cliff                    → □
   * verdict comes from the engine's positionTiming (TAKE NOW / can wait /
   * FORCED / …) — this only draws it.                                        */
  function runningOutTiles(rows) {
    rows = (rows || []).filter(function (r) { return r && r.position; });
    if (!rows.length) return '<p class="wr-chart-empty">no timing read yet</p>';
    var sq = function (n, cls, cap) {
      n = Math.max(0, n | 0);
      var shown = Math.min(n, cap || 8);
      var s = '';
      for (var i = 0; i < shown; i++) s += '<i class="' + cls + '"></i>';
      if (n > shown) s += '<em class="wr-sq-more">+' + (n - shown) + '</em>';
      return s;
    };
    var vCls = function (v) {
      v = String(v || '').toUpperCase();
      if (v === 'TAKE NOW' || v === 'FORCED' || v === 'WORTH IT EARLY') return 'urgent';
      if (v === 'WAIT' || v === 'CAN WAIT') return 'calm';
      if (v === 'NO SEAT' || v === 'LOCKED OUT') return 'dead';
      return 'mid';
    };
    return '<div class="wr-tiles">' + rows.map(function (r) {
      return '<div class="wr-tile ' + vCls(r.verdict) + '" data-pos="' + esc(r.position)
        + '"' + (r.note ? ' title="' + esc(r.note) + '"' : '') + '>'
        + '<div class="wr-tile-pos">' + esc(r.position) + '</div>'
        + '<div class="wr-tile-sq">' + sq(r.filled, 'wr-sq') + sq(r.hollow, 'wr-sq hollow', 4) + '</div>'
        + '<div class="wr-tile-verdict">' + esc(r.verdict || '—') + '</div>'
        + (r.costWait != null && r.costWait > 0
          ? '<div class="wr-tile-cost">wait −' + Math.round(r.costWait) + ' pts</div>'
          : '<div class="wr-tile-cost">&nbsp;</div>')
        + '</div>';
    }).join('') + '</div>';
  }

  /* ── TIER-CLIFF CHART — proj points vs positional rank, one position ─────
   * rows: [{ name, proj, tier, id, floor, ceiling, gone }] SORTED best-first
   * for ONE position. `id`/`floor`/`ceiling`/`gone` are optional — the chart
   * degrades to the old bare name/pts/tier tooltip when they're missing,
   * never a broken row.
   * opts.goneBy: how many of these are likely GONE before my next pick — the
   * reachable-window shading (index count from the left). Cliffs are drawn
   * where tier changes, each stamped data-cliff-at="<index>" (the LAST man of
   * the ending tier), which is what the unit test pins.
   *
   * ⚠️ LABELS SKIP RATHER THAN OVERLAP (Cory, live: "in tier cliff chart the
   * words run together!!"). A CSS rotation mitigated this once already
   * (warroom.css's own comment on .wr-cliff-lbl still describes the
   * original overlap) but never fixed the root cause: every tier cliff got
   * an unconditional label with no spacing check, so three cliffs inside
   * ~40px still painted three names on top of each other, just at a slant.
   * The CLIFF LINE always draws — it's the one fact "waiting drops you a
   * tier" needs — the NAME only draws when there's real room since the last
   * one, so a cluster of close cliffs reads as a cluster of thin red lines
   * with the (still individually correct) name on the ones that fit,
   * instead of an unreadable word-smear on all of them. */
  function tierCliffChart(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && r.proj != null; });
    if (rows.length < 2) {
      return '<p class="wr-chart-empty">not enough ' + esc(opts.pos || '') + ' left to chart</p>';
    }
    var N = Math.min(rows.length, opts.maxN || 18);
    rows = rows.slice(0, N);
    var W = opts.w || 280, H = opts.h || 116;
    var padL = 30, padR = 6, padT = 8, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) { if (r.proj < lo) lo = r.proj; if (r.proj > hi) hi = r.proj; });
    if (!(hi > lo)) { hi = lo + 1; }
    var x = function (i) { return padL + (N === 1 ? 0 : (i / (N - 1)) * plotW); };
    var y = function (v) { return padT + (hi - v) / (hi - lo) * plotH; };
    // ~5.5px per rotated character at this font-size (measured, not guessed)
    // is the collision budget; a name shorter than the gap always fits.
    var MIN_LABEL_GAP = 22;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="'
      + esc(opts.pos || '') + ' season projection by positional rank, tier cliffs marked">';
    // reachable-window shade: the leftmost goneBy players are probably not
    // coming back to you.
    var goneBy = Math.max(0, Math.min(N, opts.goneBy | 0));
    if (goneBy > 0) {
      var shadeW = x(Math.max(0, goneBy - 1)) - padL + (plotW / Math.max(1, N - 1)) / 2;
      svg += '<rect class="wr-cliff-shade" x="' + padL + '" y="' + padT + '" width="'
        + Math.max(2, shadeW).toFixed(1) + '" height="' + plotH + '" data-gone-by="' + goneBy + '"/>';
    }
    // y gridlines: min / max, direct-labeled.
    [lo, hi].forEach(function (v) {
      svg += '<line class="wr-grid" x1="' + padL + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - padR)
        + '" y2="' + y(v).toFixed(1) + '"/>'
        + '<text class="wr-axis" x="' + (padL - 3) + '" y="' + (y(v) + 3).toFixed(1)
        + '" text-anchor="end">' + Math.round(v) + '</text>';
    });
    // the line
    var pts = rows.map(function (r, i) { return x(i).toFixed(1) + ',' + y(r.proj).toFixed(1); });
    svg += '<polyline class="wr-cliff-line" fill="none" points="' + pts.join(' ') + '"/>';
    // dots + cliffs
    var lastLabelX = -Infinity;
    rows.forEach(function (r, i) {
      var hasRange = r.floor != null && r.ceiling != null;
      var tip = esc(r.name) + ' — ' + Math.round(r.proj) + ' pts · tier ' + esc(r.tier)
        + (hasRange ? ' · floor ' + Math.round(r.floor) + '–ceiling ' + Math.round(r.ceiling) : '')
        + (r.gone != null ? ' · ' + Math.round(r.gone * 100) + '% likely gone by your next pick' : '')
        + (r.id != null ? ' · click for full detail' : '');
      svg += '<circle class="wr-cliff-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(r.proj).toFixed(1)
        + '" r="2.2"' + (r.id != null ? ' data-drill="' + esc(String(r.id)) + '"' : '')
        + '><title>' + tip + '</title></circle>';
      var nxt = rows[i + 1];
      if (nxt && nxt.tier !== r.tier) {
        var cx = (x(i) + x(i + 1)) / 2;
        svg += '<line class="wr-cliff-mark" data-cliff-at="' + i + '" x1="' + cx.toFixed(1)
          + '" y1="' + padT + '" x2="' + cx.toFixed(1) + '" y2="' + (padT + plotH) + '"/>';
        if (x(i) - lastLabelX >= MIN_LABEL_GAP) {
          svg += '<text class="wr-cliff-lbl" x="' + x(i).toFixed(1) + '" y="' + (H - 5)
            + '" text-anchor="middle">' + esc(lastName(r.name)) + '</text>';
          lastLabelX = x(i);
        }
      }
    });
    svg += '</svg>';
    return '<div class="wr-chart wr-cliffchart" data-chart="cockpit-cliff" data-pos="' + esc(opts.pos || '')
      + '">' + svg + '<p class="wr-chart-cap">season pts by ' + esc(opts.pos || 'positional')
      + ' rank · <span class="wr-cliff-key">┆</span> tier cliff · shaded = likely gone before your next pick'
      + (rows.some(function (r) { return r.id != null; }) ? ' · click a dot for the full player card' : '')
      + '</p></div>';
  }

  /* ── SURVIVAL SPARKLINES — P(available) vs my upcoming picks ─────────────
   * rows: [{ name, points: [{ pick, p }] }], p in [0,1]. One small line per
   * player, direct-labeled, % at the end. Encodes exactly what it is given —
   * the monotonicity of the DATA is the survival model's property and the
   * unit test drives both facts.                                             */
  function survivalSpark(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) {
      return r && r.points && r.points.length > 0;
    });
    if (!rows.length) return '<p class="wr-chart-empty">no shortlist to track yet</p>';
    var W = opts.w || 280, rowH = 26, padL = 84, padR = 40, padT = 14;
    var plotW = W - padL - padR;
    var maxPts = 1;
    rows.forEach(function (r) { if (r.points.length > maxPts) maxPts = r.points.length; });
    var x = function (i) { return padL + (maxPts === 1 ? plotW : (i / (maxPts - 1)) * plotW); };

    /* EVERY COLUMN CARRIES ITS NUMBER, NOT ONLY THE TERMINAL ONE (Cory's
     * capture, 2026-08-17: six lines all labelled "0%" — the terminal p68
     * value — while the p48 values, the ones a decision needs, went unprinted).
     * A column where EVERY value rounds to 0% is collapsed to ONE line
     * ("all likely gone by pN") instead of N zero labels: past that pick the
     * market model has one claim about the whole shortlist, so the chart makes
     * it once. Later all-~0 columns are implied by the first (survival is
     * monotone declining) and stay silent. */
    var GONE_EPS = 0.005;                       // rounds to the printed "0%"
    var allGoneAt = [];
    for (var ci = 0; ci < maxPts; ci++) {
      var seen = false, all = true;
      rows.forEach(function (r) {
        var pt = r.points[ci];
        if (!pt) return;
        seen = true;
        if (!(pt.p < GONE_EPS)) all = false;
      });
      allGoneAt.push(seen && all);
    }
    var firstAllGone = -1;
    for (var gi = 0; gi < allGoneAt.length; gi++) {
      if (allGoneAt[gi]) { firstAllGone = gi; break; }
    }
    var footH = firstAllGone >= 0 ? 12 : 0;
    var H = padT + rows.length * rowH + 4 + footH;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="chance each shortlist player is still available at your upcoming picks">';
    // pick labels along the top, from the first row's picks
    (rows[0].points || []).forEach(function (pt, i) {
      svg += '<text class="wr-axis" x="' + x(i).toFixed(1) + '" y="9" text-anchor="middle">'
        + (pt.pick != null ? 'p' + esc(pt.pick) : '') + '</text>';
    });
    rows.forEach(function (r, ri) {
      var top = padT + ri * rowH;
      var yy = function (p) { return top + 3 + (1 - Math.max(0, Math.min(1, p))) * (rowH - 8); };
      var pts = r.points.map(function (pt, i) { return x(i).toFixed(1) + ',' + yy(pt.p).toFixed(1); });
      var lastP = r.points[r.points.length - 1].p;
      var lastI = r.points.length - 1;
      svg += '<text class="wr-spark-name" x="' + (padL - 5) + '" y="' + (top + rowH / 2 + 2)
        + '" text-anchor="end">' + esc(lastName(r.name)) + '</text>'
        + '<polyline class="wr-spark-line' + (lastP < 0.25 ? ' dying' : '') + '" fill="none" points="'
        + pts.join(' ') + '"/>';
      // per-column value labels — the terminal one keeps its right-edge seat.
      r.points.forEach(function (pt, i) {
        if (allGoneAt[i]) return;               // the collapsed note carries it
        if (i === lastI) {
          svg += '<text class="wr-spark-pct' + (lastP < 0.25 ? ' dying' : '') + '" x="' + (W - padR + 4)
            + '" y="' + (top + rowH / 2 + 2) + '">' + Math.round(lastP * 100) + '%</text>';
        } else {
          svg += '<text class="wr-spark-val wr-axis" x="' + (x(i) + (i === 0 ? 2 : 0)).toFixed(1)
            + '" y="' + (yy(pt.p) - 2.5).toFixed(1)
            + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">'
            + Math.round(pt.p * 100) + '%</text>';
        }
      });
    });
    if (firstAllGone >= 0) {
      var gonePick = (rows[0].points[firstAllGone] || {}).pick;
      svg += '<text class="wr-spark-allgone wr-axis" x="' + (W - padR + 4)
        + '" y="' + (H - 4) + '" text-anchor="end">all likely gone'
        + (gonePick != null ? ' by p' + esc(gonePick) : '') + '</text>';
    }
    svg += '</svg>';
    return '<div class="wr-chart" data-chart="survival-spark">' + svg
      + '<p class="wr-chart-cap">P(still available) at each of your next picks — a line that dives is a now-or-never player</p></div>';
  }

  /* ── ROSTER SHAPE — starter slots filled/empty at a glance ───────────────
   * slots: [{ label, filled, name }] + optional benchCount.                  */
  function rosterShape(slots, benchCount) {
    slots = slots || [];
    if (!slots.length) return '<p class="wr-chart-empty">no roster rules loaded</p>';
    var open = slots.filter(function (s) { return !s.filled; }).length;
    return '<div class="wr-shape">' + slots.map(function (s) {
      return '<div class="wr-slot' + (s.filled ? ' filled' : '') + '">'
        + '<span class="wr-slot-lbl">' + esc(s.label) + '</span>'
        + '<span class="wr-slot-name">' + (s.filled ? esc(shortName(s.name)) : '·') + '</span>'
        + '</div>';
    }).join('')
    + '</div><p class="wr-shape-cap">' + (open
      ? open + ' starting slot' + (open === 1 ? '' : 's') + ' still to fill'
      : 'every starter filled — bench from here')
    + (benchCount != null ? ' · bench ' + esc(benchCount) : '') + '</p>';
  }

  /* ── BIG BOARD COLUMNS — per-position dense lists, cliffs as red lines ───
   * cols: [{ pos, total, rows: [{ id, rank, name, full, proj, cliffAfter }] }].
   * `full`, when present, is the untruncated name shown on hover — the row's
   * own `name` may already be a shortened display form (see renderColumns'
   * DEF handling: p.team instead of the full team name). */
  function posColumns(cols) {
    cols = (cols || []).filter(function (c) { return c && c.pos; });
    if (!cols.length) return '<p class="wr-chart-empty">no board yet</p>';
    return '<div class="wr-cols">' + cols.map(function (c) {
      var rows = (c.rows || []).map(function (p) {
        return '<li class="wr-col-row" data-drill="' + esc(p.id) + '">'
          + '<span class="wr-col-rank">' + esc(p.rank) + '</span>'
          + '<span class="wr-col-name"' + (p.full ? ' title="' + esc(p.full) + '"' : '') + '>'
            + esc(shortName(p.name)) + '</span>'
          + '<span class="wr-col-proj">' + (p.proj != null ? Math.round(p.proj) : '—') + '</span>'
          + '</li>'
          + (p.cliffAfter ? '<li class="wr-cliffline" aria-label="tier cliff"></li>' : '');
      }).join('');
      return '<div class="wr-col" data-pos="' + esc(c.pos) + '">'
        /* "undrafted", NOT "left" — register 4f. The ⏳ Running out rail says
         * "WR 2" meaning two STARTABLE bodies before the tier empties; this head
         * says "WR 206" meaning the whole undrafted pool at the position. Both
         * said "left", one glance apart, and at 8s/pick that reads as a
         * contradiction rather than two scales. The number here was always
         * correct — `total` is `at.length` off the live undrafted board — so
         * this changes a word and no arithmetic. */
        + '<div class="wr-col-head"><b>' + esc(c.pos) + '</b><span>' + esc(c.total) + ' undrafted</span></div>'
        + (rows ? '<ol class="wr-col-list">' + rows + '</ol>'
                : '<p class="wr-chart-empty">none undrafted</p>')
        + '</div>';
    }).join('') + '</div>';
  }

  /* ── OPPONENT ROSTERS + PICK DISTANCE ─────────────────────────────────────
   * Cory: "show me everyone's current roster status... and where they draft
   * relative to me.. I need to see what their needs are so I can try to calc
   * if someone will fall to me." One row per opponent seat, soonest-to-pick
   * first — the seats nearest the top are the ones that can actually take a
   * player before your own next turn.
   *
   * rows: [{ slot, manager, picksUntil, have: {pos:count}, needs: [pos,...] }]
   * `manager` null means the seat is honestly unmapped (same convention as
   * the threat strip — a name from the order-fallback would be a guess). */
  function oppPosStr(counts) {
    return POS_ALL.filter(function (q) { return counts[q]; })
      .map(function (q) { return (counts[q] > 1 ? counts[q] : '') + q; }).join(' ');
  }
  function opponentBoard(rows) {
    rows = (rows || []).filter(function (r) { return r && r.slot != null; });
    if (!rows.length) return '<p class="wr-chart-empty">no opponent rosters yet</p>';
    var body = rows.map(function (r) {
      var who = r.manager ? esc(r.manager) : 'Seat ' + esc(r.slot);
      var onClock = r.picksUntil === 0;
      var dist = r.picksUntil == null ? 'no more picks'
        : onClock ? 'on the clock'
        : r.picksUntil + ' pick' + (r.picksUntil === 1 ? '' : 's') + ' away';
      var have = oppPosStr(r.have || {});
      var needs = (r.needs || []).join(' ');
      return '<li class="wr-opp-row' + (onClock ? ' wr-opp-onclock' : '') + '">'
        + '<span class="wr-opp-who">' + who + '</span>'
        + '<span class="wr-opp-dist">' + esc(dist) + '</span>'
        + '<span class="wr-opp-needs" title="still needs a starter here">'
          + (needs ? esc(needs) : '<span class="muted">starters full</span>') + '</span>'
        + '<span class="wr-opp-have muted" title="roster so far">' + (have ? esc(have) : '—') + '</span>'
        + '</li>';
    }).join('');
    return '<ul class="wr-opp-list">' + body + '</ul>';
  }

  /* ── LEAGUE-WIDE POSITION-TAKEN COUNT, INCLUDING KEEPERS ──────────────────
   * Cory: "a running count at the top of screen somewhere of # of players
   * taken at each position (including keepers) would be nice." counts:
   * {pos: n}. A position with 0 taken is still printed at 0, not omitted —
   * "QB 0 taken" is itself information this early in a draft. */
  function posTakenStrip(counts) {
    counts = counts || {};
    var total = POS_ALL.reduce(function (s, q) { return s + (counts[q] || 0); }, 0);
    var cells = POS_ALL.map(function (q) {
      return '<span class="pts-cell"><b>' + esc(q) + '</b> ' + (counts[q] || 0) + '</span>';
    }).join('');
    return '<span class="pts-label">taken (incl. keepers)</span>' + cells
      + '<span class="pts-total">' + total + ' total</span>';
  }

  var Charts = {
    rangeBar: rangeBar,
    posRails: posRails,
    runningOutTiles: runningOutTiles,
    tierCliffChart: tierCliffChart,
    survivalSpark: survivalSpark,
    rosterShape: rosterShape,
    posColumns: posColumns,
    opponentBoard: opponentBoard,
    posTakenStrip: posTakenStrip,
  };
  global.WarRoomCharts = Charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Charts;

  /* ════════════════════════ COCKPIT CONTROLLER ════════════════════════════
   * Browser-only from here down: tabs, rails, charts, drill-down.            */
  if (typeof document === 'undefined') return;

  var ui = {
    tab: 'draft',
    cliffPos: null,        // null = follow the timing lead
    drillId: null,
  };

  function D() { return global.WarRoomData || null; }
  function byId(id) { return document.getElementById(id); }

  /* Survival map: player_id -> survival_to_next off the SAME scored board the
   * shortlist prints (never a second computation). */
  function survivalMap(scored) {
    var m = {};
    (scored || []).forEach(function (s) {
      if (s && s.player) m[String(s.player.player_id)] = s.survival_to_next;
    });
    return m;
  }
  function boardAtPos(board, pos) {
    return (board || []).filter(function (p) {
      return p.position === pos && (p.proj_mean || 0) > 0;
    }).sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
  }

  /* ── tabs ── */
  function setTab(name, fromHash) {
    var room = byId('warroom');
    if (!room) return;
    var valid = { draft: 1, board: 1, rosters: 1, adjust: 1, intel: 1 };
    if (!valid[name]) name = 'draft';
    ui.tab = name;
    room.setAttribute('data-wrtab', name);
    Array.prototype.forEach.call(document.querySelectorAll('[data-wrtab-btn]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-wrtab-btn') === name);
    });
    if (!fromHash) {
      try { history.replaceState(null, '', '#tab=' + name); } catch (e) { /* file:// etc. */ }
    }
    refresh();   // panels render lazily-cheap; a switch repaints from live state
  }
  function tabFromHash() {
    var m = /tab=([a-z]+)/.exec(location.hash || '');
    return m ? m[1] : null;
  }

  /* ── left rail ── */
  function renderRails() {
    var host = byId('wr-posrails');
    var d = D();
    if (!host || !d) return;
    var board = d.board();
    if (!board.length) { host.innerHTML = '<p class="wr-chart-empty">no board yet</p>'; return; }
    var sv = survivalMap(d.scored());
    var groups = POS_ALL.map(function (pos) {
      var at = boardAtPos(board, pos);
      return {
        pos: pos,
        total: at.length,
        collapsed: pos === 'K' || pos === 'DEF',
        rows: at.slice(0, 10).map(function (p) {
          var s = sv[String(p.player_id)];
          return { id: p.player_id, name: p.name, tier: p.tier,
            gone: s == null ? null : Math.round((1 - s) * 100) };
        }),
      };
    });
    host.innerHTML = Charts.posRails(groups);
  }

  /* ── running-out tiles ── */
  function renderTiles() {
    var host = byId('wr-pos-tiles');
    var d = D();
    if (!host || !d) return;
    var board = d.board();
    var timing = d.timing();
    if (!board.length) { host.innerHTML = '<p class="wr-chart-empty">no board yet</p>'; return; }
    var tRows = (timing && timing.rows) || [];
    var rows = POS_ALL.map(function (pos) {
      var at = boardAtPos(board, pos);
      if (!at.length) return { position: pos, verdict: 'gone', filled: 0, hollow: 0 };
      var t = null;
      for (var i = 0; i < tRows.length; i++) if (tRows[i].position === pos) t = tRows[i];
      var topTier = at[0].tier;
      var filled = 0, hollow = 0;
      at.forEach(function (p) {
        if (p.tier === topTier) filled++;
        else if (p.tier === topTier + 1) hollow++;
      });
      var verdict = t ? t.verdict : null;
      // The vocabulary Cory reads: soften the engine's WAIT to "can wait".
      var word = verdict === 'WAIT' ? 'can wait'
        : verdict === 'BEHIND' ? 'behind'
        : verdict === 'NO SEAT' ? 'no seat'
        : (verdict || '—');
      return { position: pos, verdict: word,
        costWait: t ? t.Dstar : null,
        filled: filled, hollow: hollow,
        note: t ? t.why : null };
    });
    host.innerHTML = Charts.runningOutTiles(rows);
  }

  /* ── tier-cliff chart + position chips ── */
  function cliffLeadPos() {
    var d = D();
    var timing = d && d.timing();
    if (timing && timing.lead && timing.lead.position
      && POS_ALL.indexOf(timing.lead.position) >= 0) return timing.lead.position;
    return 'RB';
  }
  function renderCliff() {
    var chips = byId('wr-cliff-chips');
    var host = byId('wr-chart-cliff');
    var d = D();
    if (!host || !d) return;
    var pos = ui.cliffPos || cliffLeadPos();
    if (chips) {
      chips.innerHTML = ['QB', 'RB', 'WR', 'TE'].map(function (p) {
        return '<button type="button" class="wr-chip' + (p === pos ? ' active' : '')
          + '" data-cliff-pos="' + p + '">' + p + '</button>';
      }).join('');
    }
    var board = d.board();
    if (!board.length) { host.innerHTML = '<p class="wr-chart-empty">no board yet</p>'; return; }
    var sv = survivalMap(d.scored());
    var at = boardAtPos(board, pos);
    var goneBy = 0;
    at.slice(0, 18).forEach(function (p) {
      var s = sv[String(p.player_id)];
      if (s != null && s < 0.5) goneBy++;
    });
    // Cory: "the tier cliff chart... could be a lot better and include more
    // useable data!!!" — floor/ceiling and per-player gone% are already
    // computed for every board player elsewhere on the page (proj_floor/
    // proj_ceiling ship on the board itself, survival_to_next is `sv` right
    // above); this just stops throwing them away before they reach the
    // chart. `id` wires the click-through to the full drill-down card.
    host.innerHTML = Charts.tierCliffChart(at.map(function (p) {
      var s = sv[String(p.player_id)];
      return { name: p.name, proj: p.proj_mean, tier: p.tier, id: p.player_id,
        floor: p.proj_floor, ceiling: p.proj_ceiling,
        gone: s != null ? (1 - s) : null };
    }), { pos: pos, goneBy: goneBy });
  }

  /* ── survival sparklines ── */
  function renderSurvivalSpark() {
    var host = byId('wr-chart-survival');
    var d = D();
    if (!host || !d) return;
    var scored = d.scored();
    if (!scored.length) { host.innerHTML = '<p class="wr-chart-empty">no shortlist to track yet</p>'; return; }
    var cur = d.currentPick();
    var nexts = d.myNextPicks().filter(function (p) { return cur == null || p > cur; }).slice(0, 3);
    if (!nexts.length) { host.innerHTML = '<p class="wr-chart-empty">no later pick to wait for</p>'; return; }
    var rows = scored.slice(0, 6).map(function (s) {
      return {
        name: s.player.name,
        points: nexts.map(function (pk) {
          var p = (pk === nexts[0] && s.survival_to_next != null)
            ? s.survival_to_next            // the board's own number for the next pick
            : d.survivalTo(s.player, pk);
          return { pick: pk, p: p == null ? 0 : p };
        }),
      };
    });
    host.innerHTML = Charts.survivalSpark(rows);
  }

  /* ── roster shape ── */
  function renderShape() {
    var host = byId('wr-chart-roster');
    var d = D();
    if (!host || !d) return;
    var starters = d.starters();
    var order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'W/R/T', 'K', 'DEF'];
    var roster = d.roster().slice();
    var slots = [];
    var used = {};
    order.forEach(function (slot) {
      var n = starters[slot] || 0;
      for (var i = 0; i < n; i++) {
        var accepts = (slot === 'FLEX' || slot === 'W/R/T') ? ['RB', 'WR', 'TE'] : [slot];
        var holder = null;
        for (var j = 0; j < roster.length; j++) {
          if (used[j]) continue;
          if (accepts.indexOf(roster[j].position) >= 0) { holder = roster[j]; used[j] = 1; break; }
        }
        slots.push({ label: slot + (n > 1 ? ' ' + (i + 1) : ''),
          filled: !!holder, name: holder ? holder.name : null });
      }
    });
    if (!slots.length) { host.innerHTML = '<p class="wr-chart-empty">no roster rules loaded</p>'; return; }
    var bench = roster.length - Object.keys(used).length;
    host.innerHTML = Charts.rosterShape(slots, bench);
  }

  /* ── opponent rosters + pick distance (Cory: "show me everyone's current
   * roster status... and where they draft relative to me") ──────────────── */
  function renderOpponents() {
    var host = byId('wr-opponents-board');
    var d = D();
    if (!host || !d) return;
    var cur = d.currentPick();
    if (cur == null) { host.innerHTML = '<p class="wr-chart-empty">no board yet</p>'; return; }
    var teams = d.teams(), mine = d.mySlot();
    var starters = d.starters();
    var rosters = d.rosters();
    var picks = d.pickOrderPicks();
    var rows = [];
    for (var slot = 1; slot <= teams; slot++) {
      if (slot === mine) continue;
      var next = null;
      for (var i = 0; i < picks.length; i++) {
        if (picks[i].slot === slot && picks[i].overall >= cur) { next = picks[i]; break; }
      }
      var roster = rosters[slot] || [];
      var have = (typeof DraftNeeds !== 'undefined') ? DraftNeeds.posCounts(roster) : {};
      var needs = (typeof DraftNeeds !== 'undefined') ? DraftNeeds.teamNeeds(roster, starters) : [];
      rows.push({
        slot: slot,
        manager: d.profileForSlot(slot) ? (d.profileForSlot(slot).name || d.profileForSlot(slot).display_name) : null,
        picksUntil: next ? (next.overall - cur) : null,
        have: have, needs: needs,
      });
    }
    rows.sort(function (a, b) {
      if (a.picksUntil == null) return b.picksUntil == null ? 0 : 1;
      if (b.picksUntil == null) return -1;
      return a.picksUntil - b.picksUntil;
    });
    var note = d.profilesMapped() ? '' : '<p class="wr-opp-note muted">seats unassigned until '
      + 'Sleeper names them — showing Seat N until then</p>';
    host.innerHTML = note + Charts.opponentBoard(rows);
  }

  /* ── big-board columns ── */
  function renderColumns() {
    var host = byId('wr-board-columns');
    var d = D();
    if (!host || !d) return;
    if (ui.tab !== 'board') return;   // only paint while visible; cheap anyway
    var board = d.board();
    if (!board.length) { host.innerHTML = '<p class="wr-chart-empty">no board yet</p>'; return; }
    var cols = POS_ALL.map(function (pos) {
      var at = boardAtPos(board, pos);
      return {
        pos: pos, total: at.length,
        rows: at.slice(0, 30).map(function (p, i) {
          var nxt = at[i + 1];
          /* DEF "players" ARE full team names ("Los Angeles Rams"), and
           * shortName()'s person-name transform (first initial + rest)
           * turns that into "L. Angeles Rams" — long enough to still hit
           * this column's ellipsis and print "L. Angeles Ra…", the exact
           * cut-off-text pattern Cory called out hard on the position
           * boards' headers. p.team already carries the short code (LAR)
           * every other DEF display in the app uses; shortName() leaves a
           * single word alone, so this is a no-op for every other position. */
          var nm = (pos === 'DEF' && p.team) ? p.team : p.name;
          return { id: p.player_id, rank: i + 1, name: nm,
            full: nm !== p.name ? p.name : null, proj: p.proj_mean,
            cliffAfter: !!(nxt && i < 29 && nxt.tier !== p.tier) };
        }),
      };
    });
    host.innerHTML = Charts.posColumns(cols);
  }

  /* ── two drill-down facts, Cory's ask (ROUTES.md 08-17): "is this player
   * listed as starting RB, and maybe also how often that team passed or
   * threw last year." Both read data that already exists — no new fetch,
   * no new artifact. ── */
  function depthChartRow(p) {
    var ord = p && p.depth_chart_order;
    if (ord == null) return null;
    var label = ord === 1 ? 'starter' : ord === 2 ? '2nd string' : ord + ' on the depth chart';
    return ['Depth chart', label + ' <span class="muted">(' + esc(p.position || '') + ', ' + esc(p.team || '') + ')</span>'];
  }
  /* REGISTER 4v'S DRILL-DOWN HALF (routed 08-18, exact line numbers given):
   * the shortlist's rangeBar() already marks a cohort-constant ceiling with
   * the `~` sup (app.js's cohortCeiling(), wired 08-18), but `renderDrill()`
   * — the REAL drill-down Cory's own rehearsal harness exercises, reached
   * from the shortlist/rail click — never called it, so the ceiling number
   * here was a bare, unmarked figure. Same predicate as app.js's
   * cohortCeiling(), inlined rather than cross-called (warroom_charts.js and
   * app.js are separate modules; duplicating four lines beats coupling them
   * for this). Reuses the SAME `.wr-ceil-cohort` class/CSS the shortlist
   * mark already ships, so no new styling. */
  function isCohortCeiling(p) {
    var src = p && p.proj_ceiling_source;
    if (typeof src !== 'string' || !src) return false;
    if (/-x-player-cv$/.test(src)) return false;
    return /^measured-/.test(src);
  }

  /* REGISTER 5c-adjacent ASK, ROUTES.md 08-19 — "the board's numbers change
   * on the next rebuild and the war room cannot say which ones." From the
   * multi-source-mean ship (`draft/multisource_blend.py`), a player's
   * `proj_mean` silently becomes the mean of Sleeper+CBS+ESPN+FFToday
   * instead of Sleeper alone, stamped `proj_mean_source:
   * "multisource-mean-2026"` with the ORIGINAL Sleeper-only number kept
   * alongside as `proj_mean_sleeper_only`. A's own REC: "a one-character
   * badge next to the projection plus the old number in the tooltip" — this
   * is that badge, glyph distinct from the `~` cohort-ceiling mark so the
   * two provenance questions (is the MEAN blended vs is the CEILING a band
   * constant) never look like the same fact. Absence of the source field
   * means Sleeper-only, per A's own stated convention — nothing to mark. */
  function projMeanBadge(p) {
    if (!p || p.proj_mean_source !== 'multisource-mean-2026') return '';
    var oldVal = p.proj_mean_sleeper_only;
    var title = 'Multi-source mean (Sleeper + CBS + ESPN + FFToday). '
      + (oldVal != null ? 'Sleeper alone had ' + (Math.round(oldVal * 10) / 10) + '.' : '');
    return '<sup class="wr-proj-blend" title="' + esc(title) + '">✱</sup>';
  }

  function teamPassRateRow(p) {
    var pace = typeof window !== 'undefined' && window.WR_TEAM_PACE;
    var t = pace && p && p.team && pace.teams && pace.teams[p.team];
    if (!t || t.pass_rate == null) return null;
    var pct = Math.round(t.pass_rate * 1000) / 10;
    return ['Team pass rate (' + esc(pace.season || '') + ')', pct + '%'
      + (t.neutral_pass_rate != null
        ? ' <span class="muted">(' + Math.round(t.neutral_pass_rate * 1000) / 10 + '% score-neutral)</span>' : '')];
  }

  /* ── the drill-down — his "places to click for more info" ── */
  function openDrill(id) {
    ui.drillId = String(id);
    renderDrill();
  }
  function closeDrill() {
    ui.drillId = null;
    var host = byId('wr-drill');
    if (host) { host.hidden = true; host.innerHTML = ''; }
  }
  function renderDrill() {
    var host = byId('wr-drill');
    var d = D();
    if (!host || !d || !ui.drillId) return;
    var p = d.playerById(ui.drillId);
    if (!p) {
      var all = d.players();
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].player_id) === ui.drillId) { p = all[i]; break; }
      }
    }
    if (!p) { closeDrill(); return; }
    var scored = d.scored();
    var s = null;
    for (var j = 0; j < scored.length; j++) {
      if (String(scored[j].player.player_id) === ui.drillId) { s = scored[j]; break; }
    }
    var taken = d.drafted().has ? d.drafted().has(ui.drillId) : false;
    var cur = d.currentPick();
    var nexts = d.myNextPicks().filter(function (pk) { return cur == null || pk > cur; }).slice(0, 3);
    var inQueue = d.queue().indexOf(String(p.player_id)) >= 0
      || d.queue().indexOf(p.player_id) >= 0;

    var num = function (v, dp) { return v == null ? '—' : (dp ? (+v).toFixed(dp) : Math.round(v)); };
    var rows = [
      ['Proj (floor / mean / ceiling)', num(p.proj_floor) + ' / <b>' + num(p.proj_mean) + '</b>'
        + projMeanBadge(p) + ' / ' + num(p.proj_ceiling)
        + (isCohortCeiling(p) ? '<sup class="wr-ceil-cohort" title="This ceiling is the band '
          + 'average, not a measurement of this player">~</sup>' : '')],
      depthChartRow(p),
      teamPassRateRow(p),
      /* B's rehearsal find (2026-08-17): these two were a bare em-dash for
       * most of the board — the engine scores only the shortlist-depth slice
       * each pick, so a rail/board click outside it has no s. A blank the
       * reader cannot distinguish from "zero" or "broken" fails the honesty
       * bar; the caption names the mechanism. On-demand scoring for any
       * clicked player is the real fix, registered for post-08-22 (it re-runs
       * the engine per click mid-draft — not a change to rush at draft-4). */
      ['VONA', s && s.components && s.components.vona != null ? s.components.vona.toFixed(1)
        : '<span class="muted">not scored this pick — outside the engine\'s shortlist depth</span>'],
      ['Composite score', s ? s.score.toFixed(1)
        : '<span class="muted">not scored this pick — outside the engine\'s shortlist depth</span>'],
      ['VORP', num(p.vorp, 1)],
      ['ADP vs our rank', num(p.adjusted_adp) + ' <span class="muted">adp</span> · #' + num(p.overall_rank) + ' <span class="muted">ours</span>'
        + (p.adjusted_adp != null && p.overall_rank != null
          ? ' <span class="' + (p.overall_rank < p.adjusted_adp ? 'wr-pos-delta' : 'wr-neg-delta') + '">('
            + (p.overall_rank < p.adjusted_adp ? 'we like him more' : 'market likes him more') + ')</span>' : '')],
      ['Tier', num(p.tier) + (p.tier_rank ? ' <span class="muted">(' + p.tier_rank + '/' + p.tier_size + ' in tier)</span>' : '')],
      ['Bye', num(p.bye)],
    ];
    var survRows = taken ? '' : nexts.map(function (pk) {
      var pr = (s && s.survival_to_next != null && pk === nexts[0])
        ? s.survival_to_next : d.survivalTo(p, pk);
      var pct = pr == null ? null : Math.round(pr * 100);
      return '<div class="wr-drill-surv-row"><span>to pick ' + pk + '</span>'
        + '<div class="wr-drill-surv-bar"><i style="width:' + (pct == null ? 0 : pct) + '%"></i></div>'
        + '<b class="' + (pct != null && pct < 25 ? 'dying' : '') + '">' + (pct == null ? '—' : pct + '%') + '</b></div>';
    }).join('');
    var range = Charts.rangeBar(p.proj_floor, p.proj_mean, p.proj_ceiling,
      p.proj_floor != null && p.proj_ceiling != null
        ? { min: p.proj_floor - (p.proj_ceiling - p.proj_floor) * 0.1,
            max: p.proj_ceiling + (p.proj_ceiling - p.proj_floor) * 0.1, w: 220, h: 14 }
        : {});
    /* Per-source rank (Cory: "if I click a player it should give me lots of
     * info including where they rank on each source"). source_boards.json is
     * ORDER ONLY — same contract renderSourceBoards() already holds to, never
     * a raw score side by side (register 107: sources' point scales are not
     * comparable). Honest "no coverage" when a source doesn't carry this
     * position or player at all, matching this panel's other honest-degrade
     * rows rather than hiding the row or printing a fake rank. */
    var SOURCE_LABELS = { BLEND: 'Blend', SLEEPER: 'Sleeper', DRAFTSHARKS: 'Draft Sharks',
      FANTASYPROS: 'FantasyPros', CBS: 'CBS', ESPN: 'ESPN', FFTODAY: 'FFToday' };
    var srcBoards = d.sourceBoards ? d.sourceBoards() : null;
    var srcRanksHtml = '';
    if (srcBoards && srcBoards.order) {
      var srcRows = Object.keys(SOURCE_LABELS).map(function (src) {
        var arr = srcBoards.order[src] && srcBoards.order[src][p.position];
        var idx = arr ? arr.indexOf(String(p.player_id)) : -1;
        var rank = idx >= 0 ? '#' + (idx + 1) : '<span class="muted">no coverage</span>';
        return '<tr><td>' + esc(SOURCE_LABELS[src]) + '</td><td class="wr-num">' + rank + '</td></tr>';
      }).join('');
      srcRanksHtml = '<div class="wr-drill-src"><div class="wr-drill-h">rank by source ('
        + esc(p.position) + ')</div><table class="wr-drill-facts">' + srcRows + '</table></div>';
    }
    /* Conditional-value readout (Cory's ruling 2026-08-17): app.js resolves
     * artifact + roster and hands back a finished string — this layer stays a
     * presenter. '' (absent, not zero) for everyone without a premium. */
    var condHtml = '';
    try { condHtml = (d.conditionalDrillHtml && d.conditionalDrillHtml(ui.drillId)) || ''; }
    catch (e) { condHtml = ''; }

    host.innerHTML = '<div class="wr-drill-panel" role="dialog" aria-label="Player detail">'
      + '<button type="button" class="wr-drill-close" data-drill-close="1" title="Close">✕</button>'
      + '<div class="wr-drill-name">' + esc(p.name)
        + ' <span class="rec-pos ' + esc(p.position) + '">' + esc(p.position) + '</span>'
        + ' <span class="muted">' + esc(p.team || '') + '</span>'
        + (taken ? ' <span class="wr-drill-gone">GONE</span>' : '') + '</div>'
      + (range ? '<div class="wr-drill-range">' + range + '</div>' : '')
      + '<table class="wr-drill-facts">' + rows.filter(Boolean).map(function (r) {
          return '<tr><td>' + r[0] + '</td><td class="wr-num">' + r[1] + '</td></tr>';
        }).join('') + '</table>'
      + (survRows ? '<div class="wr-drill-surv"><div class="wr-drill-h">survives to my picks</div>' + survRows + '</div>' : '')
      + srcRanksHtml
      + condHtml
      + (s && s.reasons && s.reasons.length
        ? '<div class="wr-drill-why"><div class="wr-drill-h">the engine\'s why</div>'
          + s.reasons.slice(0, 3).map(function (r) { return '<div>· ' + esc(r) + '</div>'; }).join('') + '</div>'
        : '')
      + (s && s.context && s.context.length
        ? '<div class="wr-drill-ctx">' + s.context.slice(0, 3).map(esc).join(' · ') + '</div>' : '')
      + (taken ? '' : '<div class="wr-drill-actions">'
        + '<button class="btn small gold" data-draft-me="' + esc(p.player_id) + '">✓ I took him</button>'
        + '<button class="btn small ' + (inQueue ? 'navy' : 'ghost') + '" data-queue="' + esc(p.player_id) + '">'
          + (inQueue ? '✓ queued' : '➕ queue') + '</button>'
        + '<button class="btn small ghost" data-draft-other="' + esc(p.player_id) + '">Gone</button>'
        + '<button class="btn small ghost" data-compare="' + esc(p.player_id) + '">⚖️ compare</button>'
        + '</div>')
      + '</div>';
    host.hidden = false;
  }

  /* ── refresh — called by app.js at the end of every renderAll ── */
  function refresh() {
    try { renderRails(); } catch (e) { console.error('[cockpit rails]', e && e.message); }
    try { renderTiles(); } catch (e) { console.error('[cockpit tiles]', e && e.message); }
    try { renderCliff(); } catch (e) { console.error('[cockpit cliff]', e && e.message); }
    try { renderSurvivalSpark(); } catch (e) { console.error('[cockpit surv]', e && e.message); }
    try { renderShape(); } catch (e) { console.error('[cockpit shape]', e && e.message); }
    try { renderOpponents(); } catch (e) { console.error('[cockpit opponents]', e && e.message); }
    try { renderColumns(); } catch (e) { console.error('[cockpit cols]', e && e.message); }
    try { if (ui.drillId) renderDrill(); } catch (e) { console.error('[cockpit drill]', e && e.message); }
  }

  /* ── wiring ── */
  function init() {
    // Tabs — pure show/hide; the hash keeps the tab across a refresh.
    var fromHash = tabFromHash();
    if (fromHash) setTab(fromHash, true);
    document.addEventListener('click', function (ev) {
      var tabBtn = ev.target.closest ? ev.target.closest('[data-wrtab-btn]') : null;
      if (tabBtn) { setTab(tabBtn.getAttribute('data-wrtab-btn')); return; }
      var chip = ev.target.closest ? ev.target.closest('[data-cliff-pos]') : null;
      if (chip) { ui.cliffPos = chip.getAttribute('data-cliff-pos'); renderCliff(); return; }
      var posChip = ev.target.closest ? ev.target.closest('[data-boardpos]') : null;
      if (posChip) {
        var sel = byId('pos-filter');
        if (sel) {
          sel.value = posChip.getAttribute('data-boardpos');
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        Array.prototype.forEach.call(document.querySelectorAll('[data-boardpos]'), function (b) {
          b.classList.toggle('active', b === posChip);
        });
        return;
      }
      var info = ev.target.closest ? ev.target.closest('[data-railinfo]') : null;
      if (info) {
        var exp = document.querySelector('[data-railexp="' + info.getAttribute('data-railinfo') + '"]');
        if (exp) exp.hidden = !exp.hidden;
        return;
      }
      var closeBtn = ev.target.closest ? ev.target.closest('[data-drill-close]') : null;
      if (closeBtn) { closeDrill(); return; }
      var drill = ev.target.closest ? ev.target.closest('[data-drill]') : null;
      if (drill) { openDrill(drill.getAttribute('data-drill')); return; }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeDrill();
    });
    window.addEventListener('hashchange', function () {
      var t = tabFromHash();
      if (t && t !== ui.tab) setTab(t, true);
    });
    // Big-board position chips (built once; drive the existing #pos-filter).
    var chipHost = byId('wr-pos-chips');
    if (chipHost) {
      chipHost.innerHTML = ['ALL'].concat(POS_ALL).map(function (p) {
        return '<button type="button" class="wr-chip' + (p === 'ALL' ? ' active' : '')
          + '" data-boardpos="' + p + '">' + p + '</button>';
      }).join('');
    }
    // Big-board search mirrors the ONE search app.js binds (#search) — one
    // filter, two places to type it.
    var bs = byId('board-search'), main = byId('search');
    if (bs && main) {
      bs.addEventListener('input', function () {
        main.value = bs.value;
        main.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    refresh();
  }

  global.WarRoomCockpit = {
    refresh: refresh,
    setTab: setTab,
    openDrill: openDrill,
    closeDrill: closeDrill,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
