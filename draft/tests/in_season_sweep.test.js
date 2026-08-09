/* IN-SEASON DISPLAY SWEEP — the Sunday alert and the what-to-watch panel, run
 * over real 2023-25 weeks. The two surfaces read every week for four months that
 * had, until now, only ever been exercised on one hand-built fixture (the alert)
 * or on empty off-season state (the panel).
 *
 * The optimizer taught the lesson: a path that passes unit tests still fails the
 * first time it meets real data (it recommended benched players until swept). So
 * these run the real generators over hundreds of real states and assert nothing
 * malformed reaches the screen — no NaN, no undefined, no hallucinated player, no
 * label outside its set, no probability outside [0,1].
 *
 *   A. THE SUNDAY ALERT — optimize() every real team-week, format the alert,
 *      assert its every displayed field is sane.
 *   B. WHAT TO WATCH — stage each real matchup at several points in the game
 *      (first N starters "played", the rest "remaining", from real per-starter
 *      points), run the panel, assert every sweat row is sane.
 *
 * Run: node draft/tests/in_season_sweep.test.js
 */
'use strict';
const LO = require('../../src/routes/lineup.js');
const WW = require('../../src/routes/whatwatch.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '\n        ' + d : '')); } };

const isNum = x => typeof x === 'number' && Number.isFinite(x);
const dirty = s => /NaN|undefined|null/.test(String(s));   // no debris in display strings

const history = LO.harvest();
const seasons = LO.defaultSeasons(history);
const band = LO.weeklyHighBand(history, seasons);
const sigmaByPos = LO.positionSigmas(history, seasons);
const bandSamples = (band && band.samples) || [];

// ============================================================ A. SUNDAY ALERT
{
  let states = 0, withCalls = 0;
  const bad = [];
  for (const season of seasons) {
    const s = LO.seasonOf(history, season);
    if (!s) continue;
    const posById = LO.inferPositions(s);
    for (const [wk, entries] of Object.entries(s.weeks || {})) {
      for (const e of (entries || [])) {
        const pts = {};
        for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
        const roster = Object.keys(pts).map(id => ({ id, name: 'P' + id, pos: posById[id], proj: pts[id] }))
          .filter(r => r.pos);
        if (roster.length < 9) continue;
        let res, alert;
        try {
          res = LO.optimize(roster, { band, sigmaByPos, oppMean: band.median, matchupValue: 25 });
          alert = LO.sundayAlert(res, { week: Number(wk), band });
        } catch (err) { bad.push({ season, wk, why: 'THREW:' + err.message }); continue; }
        states++;
        const rid = e.roster_id;
        const flag = m => bad.push({ season, wk, rid, why: m });

        if (!alert || typeof alert.headline !== 'string' || !alert.headline || dirty(alert.headline)) flag('bad headline: ' + (alert && alert.headline));
        if (!isNum(alert.edge)) flag('edge not finite: ' + alert.edge);
        if (alert.hasCalls) {
          withCalls++;
          if (alert.calls.length > 4) flag('more than 4 calls: ' + alert.calls.length);
          for (const c of alert.calls) {
            if (!c.start || !c.sit || dirty(c.start) || dirty(c.sit)) flag('call missing names');
            if (!isNum(c.dollars)) flag('call dollars not finite');
            if (!/weekly-high/.test(c.why) || !/win-prob/.test(c.why) || dirty(c.why)) flag('call why malformed: ' + c.why);
          }
        } else if (!/optimal|nothing/i.test(alert.headline)) {
          flag('quiet week without a plain headline: ' + alert.headline);
        }
        if (!(alert.band && isNum(alert.band.median))) flag('band median missing');
        for (const k of ['pWin', 'pHigh']) {
          const v = alert[k];
          if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 100)) flag(k + ' out of 0..100: ' + v);
        }
      }
    }
  }
  console.log('A. Sunday alert: swept ' + states + ' real team-weeks, ' + withCalls + ' with calls');
  check('A: the alert ran over real weeks (non-vacuity)', states >= 100, states + ' states');
  check('A: every alert field is sane on every real week', bad.length === 0,
    bad.slice(0, 8).map(b => b.season + ' wk' + b.wk + (b.rid ? ' r' + b.rid : '') + ': ' + b.why).join('\n        '));

  // Replay uses actual points as projections, so naive == optimal and no calls
  // ever fire above — which leaves the alert's CALL-formatting branch unswept
  // here. Force it with a boom/bust flex the high-chase must prefer, so this file
  // guards the call path too (not only the quiet-week path).
  const boomRoster = [
    { id: 'qb', name: 'QB1', pos: 'QB', proj: 22, sd: 6 }, { id: 'r1', name: 'RB1', pos: 'RB', proj: 18, sd: 6 },
    { id: 'r2', name: 'RB2', pos: 'RB', proj: 16, sd: 6 }, { id: 'w1', name: 'WR1', pos: 'WR', proj: 17, sd: 6 },
    { id: 'w2', name: 'WR2', pos: 'WR', proj: 15, sd: 6 }, { id: 'te', name: 'TE1', pos: 'TE', proj: 12, sd: 5 },
    { id: 'k', name: 'K1', pos: 'K', proj: 8, sd: 4 }, { id: 'def', name: 'DEF1', pos: 'DEF', proj: 7, sd: 5 },
    { id: 'safe', name: 'SafeFlex', pos: 'RB', proj: 15, sd: 3 }, { id: 'boom', name: 'BoomFlex', pos: 'WR', proj: 14, sd: 20 },
  ];
  const boomAlert = LO.sundayAlert(LO.optimize(boomRoster, { band, sigmaByPos, oppMean: 175, matchupValue: 25 }), { week: 9, band });
  check('A: the call-formatting branch produces clean, named, priced calls', boomAlert.hasCalls
    && boomAlert.calls.every(c => c.start && c.sit && !dirty(c.start) && !dirty(c.sit) && isNum(c.dollars)
      && /weekly-high/.test(c.why) && /win-prob/.test(c.why)),
    JSON.stringify(boomAlert.calls && boomAlert.calls[0]));
}

// ============================================================ B. WHAT TO WATCH
{
  const sigOf = pid => LO.sigmaOf(null, sigmaByPos);   // position-typical sd; pos looked up below
  let rows = 0, panels = 0;
  const bad = [];
  const LABELS = new Set(['flip', 'safe', 'cooked', 'sweat']);
  // Build one owner's game-entry at a "played through k starters" point, using
  // that team's REAL per-starter points: the first k count as live, the rest are
  // remaining with their real points as the projection.
  const entryAt = (e, posById, k) => {
    const sp = e.starters_points || [];
    const st = e.starters || [];
    const live = sp.slice(0, k).reduce((a, b) => a + Number(b || 0), 0);
    const remain = st.slice(k).map((pid, i) => ({
      proj: Number(sp[k + i] || 0), sd: LO.sigmaOf(posById[String(pid)], sigmaByPos),
    }));
    return { live, remain };
  };
  for (const season of seasons) {
    const s = LO.seasonOf(history, season);
    if (!s) continue;
    const posById = LO.inferPositions(s);
    for (const [wk, entries] of Object.entries(s.weeks || {})) {
      // pair by matchup_id
      const byM = {};
      for (const e of (entries || [])) { if (e.matchup_id != null) (byM[e.matchup_id] = byM[e.matchup_id] || []).push(e); }
      for (const pair of Object.values(byM)) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        const nStart = Math.min((a.starters || []).length, (b.starters || []).length);
        if (nStart < 1) continue;
        for (const k of [0, Math.floor(nStart * 0.4), Math.floor(nStart * 0.7), nStart]) {
          const ea = entryAt(a, posById, k), eb = entryAt(b, posById, k);
          const entries2 = [
            { owner_id: a.roster_id, name: 'A' + a.roster_id, oppName: 'B' + b.roster_id, live: ea.live, oppLive: eb.live, remain: ea.remain, oppRemain: eb.remain },
            { owner_id: b.roster_id, name: 'B' + b.roster_id, oppName: 'A' + a.roster_id, live: eb.live, oppLive: ea.live, remain: eb.remain, oppRemain: ea.remain },
          ];
          let out;
          try { out = WW.panelRows(entries2, bandSamples); }
          catch (err) { bad.push({ season, wk, k, why: 'THREW:' + err.message }); continue; }
          panels++;
          if (out.length !== 2) { bad.push({ season, wk, k, why: 'row count ' + out.length }); continue; }
          for (const r of out) {
            rows++;
            const flag = m => bad.push({ season, wk, k, rid: r.owner_id, why: m });
            if (!isNum(r.pWin) || r.pWin < 0 || r.pWin > 1) flag('pWin out of [0,1]: ' + r.pWin);
            if (!r.label || !LABELS.has(r.label.level) || !r.label.icon || !r.label.word) flag('bad label: ' + JSON.stringify(r.label));
            if (typeof r.need !== 'string' || !r.need || dirty(r.need)) flag('bad need line: ' + r.need);
            for (const key of ['myProj', 'oppProj', 'margin']) if (!isNum(r[key])) flag(key + ' not finite: ' + r[key]);
            if (r.highP !== null && (!isNum(r.highP) || r.highP < 0 || r.highP > 1)) flag('highP out of [0,1]: ' + r.highP);
          }
        }
      }
    }
  }
  console.log('B. What-to-watch: ' + panels + ' panels, ' + rows + ' sweat rows across real matchups × 4 game-points');
  check('B: the panel ran over real matchups (non-vacuity)', rows >= 200, rows + ' rows');
  check('B: every sweat row is sane on every real matchup state', bad.length === 0,
    bad.slice(0, 8).map(b => b.season + ' wk' + b.wk + ' k' + b.k + (b.rid ? ' r' + b.rid : '') + ': ' + b.why).join('\n        '));

  // A tied game that is OVER must not read as "win by 0" — a real (if rare)
  // outcome the wording should name honestly.
  const tie = WW.needLine(WW.sweat({ live: 100, oppLive: 100, remain: [], oppRemain: [] }));
  check('B: a finished dead-even game is not phrased as a win', !/win by 0\b/.test(tie), tie);
}

console.log(`\n${pass}/${pass + fail} in-season-sweep checks passed`);
process.exit(fail ? 1 : 0);
