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
    return '<span class="wr-range' + (opts.lead ? ' lead' : '') + '" title="floor '
      + Math.round(floor) + ' · proj ' + Math.round(mean) + ' · ceiling ' + Math.round(ceiling) + '">'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h
      + '" role="img" aria-label="outcome range ' + Math.round(floor) + ' to ' + Math.round(ceiling)
      + ', projection ' + Math.round(mean) + '" data-f="' + r1(floor) + '" data-m="' + r1(mean)
      + '" data-c="' + r1(ceiling) + '">'
      + '<line class="wr-range-rail" x1="0" y1="' + (h / 2) + '" x2="' + w + '" y2="' + (h / 2) + '"/>'
      + '<rect class="wr-range-band" x="' + bx.toFixed(1) + '" y="2" width="' + bw.toFixed(1)
        + '" height="' + (h - 4) + '" rx="2"/>'
      + '<line class="wr-range-tick" x1="' + mx.toFixed(1) + '" y1="0" x2="' + mx.toFixed(1)
        + '" y2="' + h + '"/>'
      + '</svg></span>';
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
   * rows: [{ name, proj, tier }] SORTED best-first for ONE position.
   * opts.goneBy: how many of these are likely GONE before my next pick — the
   * reachable-window shading (index count from the left). Cliffs are drawn
   * where tier changes, each stamped data-cliff-at="<index>" (the LAST man of
   * the ending tier), which is what the unit test pins.                      */
  function tierCliffChart(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && r.proj != null; });
    if (rows.length < 2) {
      return '<p class="wr-chart-empty">not enough ' + esc(opts.pos || '') + ' left to chart</p>';
    }
    var N = Math.min(rows.length, opts.maxN || 18);
    rows = rows.slice(0, N);
    var W = opts.w || 280, H = opts.h || 110;
    var padL = 30, padR = 6, padT = 8, padB = 18;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) { if (r.proj < lo) lo = r.proj; if (r.proj > hi) hi = r.proj; });
    if (!(hi > lo)) { hi = lo + 1; }
    var x = function (i) { return padL + (N === 1 ? 0 : (i / (N - 1)) * plotW); };
    var y = function (v) { return padT + (hi - v) / (hi - lo) * plotH; };

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
    rows.forEach(function (r, i) {
      svg += '<circle class="wr-cliff-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(r.proj).toFixed(1)
        + '" r="2.2"><title>' + esc(r.name) + ' — ' + Math.round(r.proj) + ' pts · tier '
        + esc(r.tier) + '</title></circle>';
      var nxt = rows[i + 1];
      if (nxt && nxt.tier !== r.tier) {
        var cx = (x(i) + x(i + 1)) / 2;
        svg += '<line class="wr-cliff-mark" data-cliff-at="' + i + '" x1="' + cx.toFixed(1)
          + '" y1="' + padT + '" x2="' + cx.toFixed(1) + '" y2="' + (padT + plotH) + '"/>';
        svg += '<text class="wr-cliff-lbl" x="' + x(i).toFixed(1) + '" y="' + (H - 5)
          + '" text-anchor="middle">' + esc(lastName(r.name)) + '</text>';
      }
    });
    svg += '</svg>';
    return '<div class="wr-chart wr-cliffchart" data-chart="cockpit-cliff" data-pos="' + esc(opts.pos || '')
      + '">' + svg + '<p class="wr-chart-cap">season pts by ' + esc(opts.pos || 'positional')
      + ' rank · <span class="wr-cliff-key">┆</span> tier cliff · shaded = likely gone before your next pick</p></div>';
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
   * cols: [{ pos, total, rows: [{ id, rank, name, proj, cliffAfter }] }].    */
  function posColumns(cols) {
    cols = (cols || []).filter(function (c) { return c && c.pos; });
    if (!cols.length) return '<p class="wr-chart-empty">no board yet</p>';
    return '<div class="wr-cols">' + cols.map(function (c) {
      var rows = (c.rows || []).map(function (p) {
        return '<li class="wr-col-row" data-drill="' + esc(p.id) + '">'
          + '<span class="wr-col-rank">' + esc(p.rank) + '</span>'
          + '<span class="wr-col-name">' + esc(shortName(p.name)) + '</span>'
          + '<span class="wr-col-proj">' + (p.proj != null ? Math.round(p.proj) : '—') + '</span>'
          + '</li>'
          + (p.cliffAfter ? '<li class="wr-cliffline" aria-label="tier cliff"></li>' : '');
      }).join('');
      return '<div class="wr-col" data-pos="' + esc(c.pos) + '">'
        + '<div class="wr-col-head"><b>' + esc(c.pos) + '</b><span>' + esc(c.total) + ' left</span></div>'
        + (rows ? '<ol class="wr-col-list">' + rows + '</ol>'
                : '<p class="wr-chart-empty">none left</p>')
        + '</div>';
    }).join('') + '</div>';
  }

  var Charts = {
    rangeBar: rangeBar,
    posRails: posRails,
    runningOutTiles: runningOutTiles,
    tierCliffChart: tierCliffChart,
    survivalSpark: survivalSpark,
    rosterShape: rosterShape,
    posColumns: posColumns,
  };
  global.WarRoomCharts = Charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Charts;

  /* ════════════════════════ COCKPIT CONTROLLER ════════════════════════════
   * Browser-only from here down: tabs, rails, charts, drill-down.            */
  if (typeof document === 'undefined') return;

  var POS_ALL = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
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
    host.innerHTML = Charts.tierCliffChart(at.map(function (p) {
      return { name: p.name, proj: p.proj_mean, tier: p.tier };
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
          return { id: p.player_id, rank: i + 1, name: p.name, proj: p.proj_mean,
            cliffAfter: !!(nxt && i < 29 && nxt.tier !== p.tier) };
        }),
      };
    });
    host.innerHTML = Charts.posColumns(cols);
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
      ['Proj (floor / mean / ceiling)', num(p.proj_floor) + ' / <b>' + num(p.proj_mean) + '</b> / ' + num(p.proj_ceiling)],
      ['VONA', s && s.components && s.components.vona != null ? s.components.vona.toFixed(1) : '—'],
      ['Composite score', s ? s.score.toFixed(1) : '—'],
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

    host.innerHTML = '<div class="wr-drill-panel" role="dialog" aria-label="Player detail">'
      + '<button type="button" class="wr-drill-close" data-drill-close="1" title="Close">✕</button>'
      + '<div class="wr-drill-name">' + esc(p.name)
        + ' <span class="rec-pos ' + esc(p.position) + '">' + esc(p.position) + '</span>'
        + ' <span class="muted">' + esc(p.team || '') + '</span>'
        + (taken ? ' <span class="wr-drill-gone">GONE</span>' : '') + '</div>'
      + (range ? '<div class="wr-drill-range">' + range + '</div>' : '')
      + '<table class="wr-drill-facts">' + rows.map(function (r) {
          return '<tr><td>' + r[0] + '</td><td class="wr-num">' + r[1] + '</td></tr>';
        }).join('') + '</table>'
      + (survRows ? '<div class="wr-drill-surv"><div class="wr-drill-h">survives to my picks</div>' + survRows + '</div>' : '')
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
