// TERRITORY: A (extends src/forecast_grade.js, same lane as inseason_resolution.test.js)
// THE OTHER THREE RESOLVERS — waiver_claim, stream_call, inseason_override.
//
// inseason_resolution.test.js closed the loop for lineup_call and named
// exactly why the other three kinds were excluded. This file is those three
// exclusions answered, each with a designed rule rather than a shrug:
//
//   waiver_claim     — counterfactual is the literal string 'hold priority',
//                      so the rule needed a WINDOW (measured from this
//                      league's own hold lengths, §0, not chosen by taste)
//                      and a BASELINE (the dropped player when captured — a
//                      real roster delta — else the wire's own measured
//                      median for the position over the same window).
//   stream_call      — chosen vs the held K/DEF, one week, both real players
//                      (or an honestly-empty slot worth 0).
//   inseason_override— resolvable ONLY where the capture recorded what the
//                      human actually did (payload.actual, added to the
//                      routes the same day); pre-fix entries stay pending.
//
// Proven against REAL history (league_history.json weekly points and real
// 2023 acquisitions via wire_level.js), not only synthetic fixtures — the
// leak-free discipline: a resolver that only works on invented numbers is
// not proven to work on the shape real weekly data has.
//
// Run: node draft/tests/waiver_stream_resolution.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade.js'));
const WL = require(path.join(ROOT, 'draft', 'tools', 'wire_level.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// ── 0. THE WINDOW IS MEASURED, NOT TASTE — re-derived here from the same
//       transactions so the constant cannot silently outlive its evidence. ───
{
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const holds = [], censored = [];
  for (const s of hist.seasons || []) {
    const tx = s.transactions || {};
    const weeks = Object.keys(tx).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!weeks.length) continue;
    const lastWeek = weeks[weeks.length - 1];
    const flat = [];
    for (const wk of weeks) for (const row of tx[wk] || []) flat.push({ week: wk, row });
    for (const { week, row } of flat) {
      if (row.status !== 'complete' || ['waiver', 'free_agent'].indexOf(row.type) < 0) continue;
      for (const pid of Object.keys(row.adds || {})) {
        const rosterId = row.adds[pid];
        let dropWeek = null;
        for (const cand of flat) {
          if (cand.week < week || (cand.week === week && cand.row === row)) continue;
          const d = cand.row.drops || {};
          if (cand.row.status === 'complete' && d[pid] != null && String(d[pid]) === String(rosterId)) {
            if (dropWeek === null || cand.week < dropWeek) dropWeek = cand.week;
          }
        }
        if (dropWeek !== null) holds.push(dropWeek - week); else censored.push(lastWeek - week);
      }
    }
  }
  ck('CONTROL — the hold-length sample is the real 764-add log, not a subset',
    holds.length + censored.length === 764, { dropped: holds.length, censored: censored.length });
  const medDropped = med(holds);
  const medAll = med(holds.concat(censored));
  ck('median hold of dropped adds is 1 week; all-adds (censored) median is 2 — the evidence the window cites',
    medDropped === 1 && medAll === 2, { medDropped, medAll });
  ck('WAIVER_WINDOW_WEEKS covers the measured median hold (add week + median tenure) and is pinned to it',
    FG.WAIVER_WINDOW_WEEKS === 3 && FG.WAIVER_WINDOW_WEEKS >= medAll + 1,
    { window: FG.WAIVER_WINDOW_WEEKS, medAll });
}

// ── 1. stream_call — SYNTHETIC MECHANICS, real capture shapes ───────────────
// Shapes are the ones views/waivers.ejs actually posts: chosen {id, pos},
// counterfactual either {player_id, ...} (currentKD rows carry player_id, not
// id) or the {note: 'no current K on roster'} empty-slot object.
{
  const mk = (cf) => [{ kind: 'stream_call', id: '2026-000000001', decision_at: 't1',
    payload: { key: 's1', week: 3, chosen: { id: 'a', pos: 'DEF' }, counterfactual: cf } }];
  const pts = { 3: { a: 12, b: 7 } };
  let r = FG.buildInseasonResolutions(mk({ player_id: 'b', name: 'Held' }), pts);
  ck('chosen vs held resolves off both real players\' week (12 vs 7, outcome +5)',
    r.length === 1 && r[0].payload.realized_chosen === 12 && r[0].payload.realized_counterfactual === 7
      && r[0].payload.outcome === 5, r[0] && r[0].payload);
  ck('the counterfactual\'s player_id field (currentKD\'s shape) is read, not only id',
    r[0].payload.realized_counterfactual === 7);
  r = FG.buildInseasonResolutions(mk({ note: 'no current DEF on roster' }), pts);
  ck('an empty-slot counterfactual is worth 0 BY CONSTRUCTION and says so in source',
    r.length === 1 && r[0].payload.realized_counterfactual === 0 && /empty/.test(r[0].payload.source),
    r[0] && r[0].payload);
  r = FG.buildInseasonResolutions(mk('kept who I have'), pts);
  ck('a string counterfactual has no honest number — skipped, not zeroed', r.length === 0, r);
  r = FG.buildInseasonResolutions(mk({ player_id: 'b' }), {});
  ck('a week with no real data yet stays UNRESOLVED — absent, not zero', r.length === 0, r);
}

// ── 2. stream_call — REAL HISTORY: a real 2023 week, hand-sum checked ───────
{
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const season = (hist.seasons || []).find(s => String(s.season) === '2023');
  const wk3 = (season.weeks || {})['3'] || [];
  const merged = {};
  for (const entry of wk3) Object.assign(merged, entry.players_points || {});
  const ids = Object.keys(merged);
  ck('CONTROL — the real week has scored players to draw from', ids.length > 20, ids.length);
  const a = ids[0], b = ids[1];
  const r = FG.buildInseasonResolutions([{ kind: 'stream_call', id: '2023-000000009', decision_at: 't1',
    payload: { key: 'real-s', week: 3, chosen: { id: a }, counterfactual: { id: b } } }],
  { 3: merged });
  const r2 = v => Math.round(v * 100) / 100;
  ck('realized_chosen matches the real box-score number for the streamed player',
    r.length === 1 && r[0].payload.realized_chosen === r2(Number(merged[a])),
    { got: r[0] && r[0].payload.realized_chosen, expected: merged[a] });
  ck('realized_counterfactual matches the held player\'s real number',
    r[0].payload.realized_counterfactual === r2(Number(merged[b])),
    { got: r[0].payload.realized_counterfactual, expected: merged[b] });
}

// ── 3. waiver_claim — REAL HISTORY: a real 2023 acquisition, windowed ───────
// The claim is a REAL add from the transaction log (wire_level's own
// acquisitions()), resolved against the REAL nflverse weekly points the wire
// measurement itself uses, with the 3-week window hand-summed independently.
{
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const wp = WL.weeklyPoints('2023');
  ck('CONTROL — the 2023 weekly-points store exists (the wire measurement needs it too)', !!wp);
  if (wp) {
    const acq = WL.acquisitions(hist, '2023')
      .find(a => /^\d+$/.test(a.player_id) && a.week <= 10
        && [0, 1, 2].every(k => wp[a.week + k] && Object.prototype.hasOwnProperty.call(wp[a.week + k], a.player_id)));
    ck('CONTROL — a real add with a fully-scored 3-week window exists', !!acq, acq);
    if (acq) {
      // weeklyPoints keys are numeric weeks; the resolver reads string keys of
      // the map it is given — build the map the way the live cron builds it.
      const weekly = {};
      for (let w = acq.week; w <= acq.week + 2; w++) weekly[String(w)] = wp[w];
      // (a) drop-based counterfactual: another real player, same window.
      const other = Object.keys(wp[acq.week]).find(pid => pid !== acq.player_id);
      const entry = { kind: 'waiver_claim', id: '2023-000000010', decision_at: 't1',
        payload: { key: 'real-w', week: acq.week,
          chosen: { id: acq.player_id, pos: 'RB' },
          counterfactual: 'hold priority',
          drop: { id: other } } };
      const res = FG.buildInseasonResolutions([entry], weekly);
      const hand = pid => { let s = 0; for (let w = acq.week; w <= acq.week + 2; w++) {
        const row = wp[w]; s += Object.prototype.hasOwnProperty.call(row, pid) ? Number(row[pid]) : 0; }
        return Math.round(s * 100) / 100; };
      ck('the claimed player\'s window sum matches an independent hand-sum over REAL nflverse points',
        res.length === 1 && res[0].payload.realized_chosen === hand(acq.player_id),
        { got: res[0] && res[0].payload.realized_chosen, expected: hand(acq.player_id) });
      ck('the dropped player\'s window sum matches too — the counterfactual is a real roster delta',
        res[0].payload.realized_counterfactual === hand(other),
        { got: res[0].payload.realized_counterfactual, expected: hand(other) });
      ck('the source names the rule and its limitation (priority cost unmodelled)',
        /priority cost unmodelled/.test(res[0].payload.source), res[0].payload.source);
      // (b) an incomplete window is PENDING, not partially graded.
      const short = { [String(acq.week)]: wp[acq.week] };
      ck('a window missing later weeks yields NO resolution — pending, never a partial sum',
        FG.buildInseasonResolutions([entry], short).length === 0);
      // (c) finalWeek clips the window instead of pending forever: with the
      // season ending at the add week, only that week's points are needed AND
      // only that week is summed.
      const oneWeek = pid => { const row = wp[acq.week];
        return Math.round((Object.prototype.hasOwnProperty.call(row, pid) ? Number(row[pid]) : 0) * 100) / 100; };
      const clipped = FG.buildInseasonResolutions([entry],
        { [String(acq.week)]: wp[acq.week] }, { finalWeek: acq.week });
      ck('finalWeek clips the window — a season-ending claim grades on exactly the weeks that exist',
        clipped.length === 1 && clipped[0].payload.realized_chosen === oneWeek(acq.player_id)
          && clipped[0].payload.realized_counterfactual === oneWeek(other),
        clipped[0] && clipped[0].payload);
    }
  }
}

// ── 4. waiver_claim — THE WIRE BASELINE when no drop was captured ───────────
{
  const entry = { kind: 'waiver_claim', id: '2026-000000011', decision_at: 't1',
    payload: { key: 'wire-w', week: 3, chosen: { id: 'x', pos: 'RB' },
      counterfactual: 'hold priority', drop: {} } };
  const weekly = { 3: { x: 10 }, 4: { x: 8 }, 5: {} };   // x absent week 5 => delivered 0
  const wire = { per_week: { RB: 7.8 }, ongoing_per_week: { RB: 5.9 } };
  const res = FG.buildInseasonResolutions([entry], weekly, { wire });
  ck('chosen sums the claim window with an unplayed week delivering 0 (10+8+0)',
    res.length === 1 && res[0].payload.realized_chosen === 18, res[0] && res[0].payload);
  ck('counterfactual is the wire\'s measured window: add week at per_week + held weeks at ongoing (7.8+5.9+5.9)',
    res[0].payload.realized_counterfactual === 19.6, res[0].payload);
  ck('outcome (the edge) rides on the resolution — predledger refuses a resolution without one',
    res[0].payload.outcome === -1.6, res[0].payload);
  const kEntry = JSON.parse(JSON.stringify(entry));
  kEntry.payload.chosen.pos = 'K';
  ck('a K claim with no drop stays UNRESOLVED — the wire has no K sample (offence-only source) and nothing is invented',
    FG.buildInseasonResolutions([kEntry], weekly, { wire }).length === 0);
  ck('no wire baseline at all (the cron\'s missing-file degrade) also stays pending, never defaults',
    FG.buildInseasonResolutions([entry], weekly, {}).length === 0);
}

// ── 5. inseason_override — resolvable exactly where `actual` was captured ───
{
  const pts = { 3: { a: 15, b: 9, c: 10, d: 11, k1: 6, k2: 13 } };
  // (a) the lineup-override shape: actual = the lineup as set, recommended = tool's.
  const lineupOv = { kind: 'inseason_override', id: '2026-000000012', decision_at: 't1',
    payload: { key: 'ov1', week: 3,
      recommended: [{ id: 'a' }, { id: 'b' }], counterfactual: [{ id: 'a' }, { id: 'b' }],
      actual: [{ id: 'c' }, { id: 'd' }] } };
  let r = FG.buildInseasonResolutions([lineupOv], pts);
  ck('an override WITH the captured actual resolves: human 21 vs tool 24',
    r.length === 1 && r[0].payload.realized_chosen === 21 && r[0].payload.realized_counterfactual === 24,
    r[0] && r[0].payload);
  // (b) the stream-override shape: actual = the kept K/DEF (single player).
  const streamOv = { kind: 'inseason_override', id: '2026-000000013', decision_at: 't1',
    payload: { key: 'ov2', week: 3,
      recommended: { id: 'k2', pos: 'K' }, counterfactual: { id: 'k2', pos: 'K' },
      actual: { player_id: 'k1', name: 'Kept K' } } };
  r = FG.buildInseasonResolutions([streamOv], pts);
  ck('a stream override resolves kept-player vs recommended-stream (6 vs 13)',
    r.length === 1 && r[0].payload.realized_chosen === 6 && r[0].payload.realized_counterfactual === 13,
    r[0] && r[0].payload);
  // (c) the PRE-FIX shape (recommended duplicated, no actual) stays pending.
  const preFix = { kind: 'inseason_override', id: '2026-000000014', decision_at: 't1',
    payload: { key: 'ov3', week: 3, recommended: [{ id: 'a' }], counterfactual: [{ id: 'a' }] } };
  ck('a pre-fix override (no actual) stays UNRESOLVED — nothing honest to sum, reported pending',
    FG.buildInseasonResolutions([preFix], pts).length === 0);

  // (d) the tallies do not credit the tool with the human's win, or vice versa.
  const graded = FG.gradeDecisions([lineupOv, ...FG.buildInseasonResolutions([lineupOv], pts)]).inseason;
  ck('an override the TOOL won lands in override_tool_won, never in tool_won (whose chosen side is the tool\'s)',
    graded.override_tool_won === 1 && graded.tool_won === 0 && graded.counterfactual_won === 0,
    { ovTool: graded.override_tool_won, tool: graded.tool_won, cf: graded.counterfactual_won });
  const humanWin = JSON.parse(JSON.stringify(lineupOv));
  humanWin.payload.actual = [{ id: 'a' }, { id: 'k2' }];   // 15+13=28 beats 24
  const graded2 = FG.gradeDecisions([humanWin, ...FG.buildInseasonResolutions([humanWin], pts)]).inseason;
  ck('an override the HUMAN won lands in override_human_won',
    graded2.override_human_won === 1 && graded2.override_tool_won === 0, graded2);
}

// ── 6. THE JOIN-KEY FALLBACK — a keyless capture still closes the loop ──────
// The real routes wrote NO payload.key until 2026-08-15; every fixture had
// one, so the gap was invisible. The entry id (unique, stamped by predledger)
// is the fallback on BOTH sides of the join.
{
  const keyless = { kind: 'stream_call', id: '2026-000000015', decision_at: 't1',
    payload: { week: 3, chosen: { id: 'a' }, counterfactual: { id: 'b' } } };
  const pts = { 3: { a: 9, b: 4 } };
  const res = FG.buildInseasonResolutions([keyless], pts);
  ck('the resolver keys a keyless entry by its ledger id', res.length === 1
    && res[0].payload.forecast_key === '2026-000000015', res[0] && res[0].payload);
  const g = FG.gradeDecisions([keyless, ...res]).inseason;
  ck('and gradeDecisions joins it back by the same id — the keyless loop CLOSES',
    g.scored === 1 && g.rows[0].edge === 5, g.rows[0]);
  ck('FAIL ARM — before the fallback this entry would grade unscored (key null, join impossible): '
    + 'the row now carries the id as its key', g.rows[0].key === '2026-000000015', g.rows[0].key);
}

// ── 7. DEDUPE — the weekly runner must not stack resolutions forever ────────
{
  const e = { kind: 'stream_call', id: '2026-000000016', decision_at: 't1',
    payload: { key: 'dd1', week: 3, chosen: { id: 'a' }, counterfactual: { id: 'b' } } };
  const pts = { 3: { a: 9, b: 4 } };
  const first = FG.buildInseasonResolutions(FG.unresolvedDecisionEntries([e]), pts);
  ck('first pass resolves the pending entry', first.length === 1);
  const ledgerAfter = [e, { kind: 'forecast_resolution', id: '2026-000000017', decision_at: 't2',
    payload: first[0].payload }];
  const second = FG.buildInseasonResolutions(FG.unresolvedDecisionEntries(ledgerAfter), pts);
  ck('second pass emits NOTHING — an already-resolved decision is filtered, append-only stays clean',
    second.length === 0, second);
}

// ── 8. decision resolutions never pollute the FORECAST diagnostics ──────────
{
  const e = { kind: 'lineup_call', id: '2026-000000018', decision_at: 't1',
    payload: { key: 'lc1', week: 3, recommended: [{ id: 'a' }], counterfactual: [{ id: 'b' }] } };
  const res = FG.buildInseasonResolutions([e], { 3: { a: 5, b: 3 } });
  const gf = FG.gradeForecasts([e, ...res]);
  ck('a decision resolution is NOT counted as an orphaned forecast resolution',
    gf.orphan_resolution_keys.length === 0, gf.orphan_resolution_keys);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: all three previously-unresolved in-season kinds now');
console.log('have working resolvers with rules stated before any 2026 outcome exists —');
console.log('waiver_claim windowed by the league\'s own measured hold length and priced');
console.log('against a real roster delta or the measured wire median; stream_call by both');
console.log('players\' real week; inseason_override wherever the capture recorded the');
console.log('human\'s actual play — proven against real 2023 history, with honest pendings');
console.log('for every shape that has no defensible number (K/DEF wire, pre-fix overrides,');
console.log('unplayed weeks). WHAT IT DOES NOT: model waiver priority\'s option value or');
console.log('FAAB-style pricing (stated on every wire-based resolution), or supply 2026');
console.log('data (the season has not started).');
