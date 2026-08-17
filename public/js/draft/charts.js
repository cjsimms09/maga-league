/* WAR-ROOM CHARTS — visual encodings of numbers the engine already computed.
 *
 * Cory (2026-08-15, rejecting the live page): "no charts or visual
 * explanations." These are the three his data actually supports:
 *
 *   tierCliffChart  VORP vs positional rank, cliff edges marked — replaces
 *                   the prose "he is the last of his tier";
 *   goneChart       market-model vs room-model P(gone) side by side for the
 *                   at-risk names — the two numbers the page used to print
 *                   under one caption, now one chart with a legend;
 *   branchGrid      the IF-YOU-TAKE forecast as a compact delta grid instead
 *                   of four repeated text blocks.
 *
 * PURE STRING BUILDERS. No DOM, no state, no computation of model quantities —
 * every number rendered here arrives as an engine output (scored entries,
 * threatBoard atRisk, branchForecast rows). ui_fidelity_charts.test.js feeds
 * them known inputs and asserts the marks encode exactly those values.
 *
 * Mark discipline (dataviz): thin bars, rounded data-ends / square baselines,
 * 2px surface gaps, hairline solid grid, direct labels only where they earn
 * it, text in ink tokens never series colors. The two-series palette
 * (#2a5f9e market / #eb6834 room) is validator-passed on the light surface.
 */
(function (global) {
  'use strict';

  var MARKET = '#2a5f9e';   // validated pair — see warroom.css comment
  var ROOM = '#eb6834';
  var INK = '#0c1a2b';
  var MUTED = '#5b6879';
  var GRID = '#e8e6df';
  var CLIFF = '#d4242f';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function last(name) {
    var parts = String(name || '').split(' ');
    return parts[parts.length - 1];
  }

  /* ── TIER CLIFFS — small multiples, one per position ──────────────────────
   * entries: engine scored entries (available players only). Encodes each
   * position's top N by the board's own order: bar height = VORP, a dashed
   * red line where the tier breaks, the pre-cliff player direct-labeled.
   * SHARED y-scale across multiples: VORP is cross-position comparable by
   * construction, and per-panel scales would overstate flat positions. */
  function tierCliffChart(entries, opts) {
    opts = opts || {};
    var POS = opts.positions || ['QB', 'RB', 'WR', 'TE'];
    var N = opts.perPos || 8;
    var byPos = {};
    (entries || []).forEach(function (s) {
      var p = s.player || {};
      if (POS.indexOf(p.position) < 0) return;
      if (p.vorp == null || p.tier == null) return;
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });
    var shown = POS.filter(function (pos) { return (byPos[pos] || []).length >= 2; });
    if (!shown.length) return '';
    // Board order within position (entries arrive score-sorted; VORP order is
    // the tier structure's own order).
    shown.forEach(function (pos) {
      byPos[pos].sort(function (a, b) { return b.vorp - a.vorp; });
      byPos[pos] = byPos[pos].slice(0, N);
    });
    var all = [];
    shown.forEach(function (pos) { all = all.concat(byPos[pos]); });
    var maxV = Math.max.apply(null, all.map(function (p) { return p.vorp; }).concat([1]));
    var minV = Math.min.apply(null, all.map(function (p) { return p.vorp; }).concat([0]));

    var barW = 14, gap = 2, padL = 6, padR = 6, padT = 14, padB = 16;
    var plotH = 74;
    var panelW = padL + N * (barW + gap) + padR;
    var W = panelW * shown.length;
    var H = padT + plotH + padB;
    var y = function (v) { return padT + (maxV - v) / (maxV - minV || 1) * plotH; };
    var y0 = y(0);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="value over next available, by positional rank, cliff edges marked">';
    // zero gridline across all panels — hairline, solid, recessive
    svg += '<line class="grid" x1="0" y1="' + y0.toFixed(1) + '" x2="' + W
      + '" y2="' + y0.toFixed(1) + '" stroke="' + GRID + '" stroke-width="1"/>';

    shown.forEach(function (pos, pi) {
      var x0 = pi * panelW;
      var list = byPos[pos];
      svg += '<text x="' + (x0 + padL) + '" y="9" font-size="9" font-weight="700" fill="'
        + INK + '">' + esc(pos) + '</text>';
      var labeledCliff = false;
      list.forEach(function (p, i) {
        var bx = x0 + padL + i * (barW + gap);
        var v = p.vorp;
        var top = Math.min(y(v), y0), bh = Math.max(1, Math.abs(y(v) - y0));
        // rounded DATA end, square baseline: a top-rounded path for positive
        // bars, bottom-rounded for negative.
        var r = Math.min(4, bh);
        var d = v >= 0
          ? 'M' + bx + ',' + (top + bh) + ' v-' + (bh - r) + ' q0,-' + r + ' ' + r + ',-' + r
            + ' h' + (barW - 2 * r) + ' q' + r + ',0 ' + r + ',' + r + ' v' + (bh - r) + ' z'
          : 'M' + bx + ',' + top + ' v' + (bh - r) + ' q0,' + r + ' ' + r + ',' + r
            + ' h' + (barW - 2 * r) + ' q' + r + ',0 ' + r + ',-' + r + ' v-' + (bh - r) + ' z';
        svg += '<path d="' + d + '" fill="' + MARKET + '"><title>' + esc(p.name) + ' — VORP '
          + v.toFixed(1) + ' · tier ' + p.tier + '</title></path>';
        // Cliff edge: the boundary BEFORE the next bar when the tier changes.
        var nxt = list[i + 1];
        if (nxt && nxt.tier !== p.tier) {
          var cx = bx + barW + gap / 2;
          svg += '<line x1="' + cx + '" y1="' + (padT - 2) + '" x2="' + cx + '" y2="'
            + (padT + plotH) + '" stroke="' + CLIFF + '" stroke-width="1.5" stroke-dasharray="3 2"/>';
          if (!labeledCliff) {
            labeledCliff = true;   // direct-label the pre-cliff man ONCE per panel
            svg += '<text x="' + (bx + barW / 2) + '" y="' + (H - 5)
              + '" font-size="8" text-anchor="middle" fill="' + INK + '" font-weight="600">'
              + esc(last(p.name)) + '</text>';
          }
        }
      });
    });
    svg += '</svg>';
    return '<div class="wr-chart" data-chart="tier-cliff">' + svg
      + '<p class="wr-chart-cap">Value over next available (VORP, season pts) by positional '
      + 'rank — available players only. <span style="color:' + CLIFF + '">┆</span> marks a '
      + 'tier cliff; the named player is the last of his tier.</p></div>';
  }

  /* ── GONE CHART — two models, one chart, labeled ─────────────────────────
   * rows: [{ name, position, market_gone, room_gone }] — both 0-100 or null.
   * market_gone = round((1 − survival_to_next)×100)  (the score's number)
   * room_gone   = threatBoard atRisk `gone`           (the seats' number)   */
  function goneChart(rows) {
    rows = (rows || []).filter(function (r) {
      return r && (r.market_gone != null || r.room_gone != null);
    }).slice(0, 6);
    if (!rows.length) return '';
    var rowH = 30, padT = 16, padL = 86, padR = 34, barH = 8;
    var W = 320, H = padT + rows.length * rowH + 4;
    var plotW = W - padL - padR;
    var x = function (v) { return padL + (Math.max(0, Math.min(100, v)) / 100) * plotW; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="chance gone by your next pick — market model vs room model">';
    [0, 50, 100].forEach(function (t) {
      svg += '<line class="grid" x1="' + x(t) + '" y1="' + (padT - 4) + '" x2="' + x(t)
        + '" y2="' + (H - 2) + '" stroke="' + GRID + '" stroke-width="1"/>'
        + '<text x="' + x(t) + '" y="' + (padT - 7) + '" font-size="8" text-anchor="middle" fill="'
        + MUTED + '">' + t + '%</text>';
    });
    rows.forEach(function (r, i) {
      var top = padT + i * rowH;
      svg += '<text x="' + (padL - 5) + '" y="' + (top + rowH / 2 + 3)
        + '" font-size="9" text-anchor="end" fill="' + INK + '">'
        + esc(last(r.name)) + '</text>';
      var bars = [
        { v: r.market_gone, c: MARKET, dy: 4, tag: 'market' },
        { v: r.room_gone, c: ROOM, dy: 4 + barH + 2, tag: 'room' },
      ];
      bars.forEach(function (b) {
        if (b.v == null) return;
        var bw = Math.max(1, x(b.v) - padL);
        svg += '<rect x="' + padL + '" y="' + (top + b.dy) + '" width="' + bw.toFixed(1)
          + '" height="' + barH + '" rx="0" fill="' + b.c + '"><title>' + esc(r.name) + ' — '
          + b.v + '% gone (' + b.tag + ' model)</title></rect>'
          // 4px rounded DATA end only (baseline square): overlay a rounded cap
          + '<rect x="' + Math.max(padL, x(b.v) - 4).toFixed(1) + '" y="' + (top + b.dy)
          + '" width="4" height="' + barH + '" rx="2" fill="' + b.c + '"/>'
          + '<text x="' + (x(b.v) + 3).toFixed(1) + '" y="' + (top + b.dy + barH - 1)
          + '" font-size="8" fill="' + INK + '">' + b.v + '</text>';
      });
    });
    svg += '</svg>';
    return '<div class="wr-chart" data-chart="gone">' + svg
      + '<p class="wr-chart-cap"><span style="color:' + MARKET + '">▮</span> market (ADP) '
      + 'model — the number the score uses · <span style="color:' + ROOM + '">▮</span> room '
      + 'model — what the seats ahead actually take. Where they disagree, the room model '
      + 'answers WHO goes first; identical market bars are its redistribution floor.</p></div>';
  }

  /* ── BRANCH GRID — the IF-YOU-TAKE matrix ────────────────────────────────
   * branches: engine branchForecast outputs [{ taking, pick, rows:[{position,
   * at_next, loss}] }]. Cell ink deepens with loss (sequential, one hue) —
   * never a rainbow. All values displayed, units in the caption. */
  function branchGrid(branches) {
    branches = (branches || []).filter(function (b) { return b && b.rows; });
    if (!branches.length) return '';
    var POS = [];
    branches.forEach(function (b) {
      b.rows.forEach(function (r) { if (POS.indexOf(r.position) < 0) POS.push(r.position); });
    });
    if (!POS.length) return '';
    var maxLoss = 1;
    branches.forEach(function (b) {
      b.rows.forEach(function (r) { if (r.loss > maxLoss) maxLoss = r.loss; });
    });
    var html = '<table class="wr-branch-grid"><thead><tr><th>take…</th>'
      + POS.map(function (p) { return '<th class="wr-num">' + esc(p) + ' waits</th>'; }).join('')
      + '</tr></thead><tbody>';
    branches.forEach(function (b) {
      html += '<tr><td class="bg-take">' + esc(last(b.taking)) + '</td>'
        + POS.map(function (p) {
          var r = null;
          for (var i = 0; i < b.rows.length; i++) if (b.rows[i].position === p) r = b.rows[i];
          if (!r) return '<td class="wr-num muted">—</td>';
          var a = Math.min(0.85, 0.08 + 0.77 * (Math.max(0, r.loss) / maxLoss));
          var deep = r.loss / maxLoss > 0.55;   // ink flips by fill luminance
          return '<td class="wr-num" style="background:rgba(42,95,158,' + a.toFixed(2)
            + ');color:' + (deep ? '#fff' : INK) + '" title="best ' + esc(p) + ' left at pick '
            + esc(b.pick) + ' ≈ ' + Math.round(r.at_next) + ' pts (' + Math.round(r.loss)
            + ' worse than now)">−' + Math.round(r.loss) + '</td>';
        }).join('')
        + '</tr>';
    });
    html += '</tbody></table>'
      + '<p class="wr-chart-cap">Projected points LOST at that position by waiting until your '
      + 'next pick, if you take the row\'s player now. Darker = steeper drop — take the dark '
      + 'columns now, wait on the light ones. Tap a cell for the expected best player left.</p>';
    return '<div class="wr-chart" data-chart="branch-grid">' + html + '</div>';
  }

  var api = { tierCliffChart: tierCliffChart, goneChart: goneChart, branchGrid: branchGrid,
    PALETTE: { market: MARKET, room: ROOM } };
  global.DraftCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
