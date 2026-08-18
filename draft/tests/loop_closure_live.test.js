// TERRITORY: A
// THE WHOLE LOOP, DRIVEN END TO END THROUGH THE REAL SURFACES:
//
//   capture  — the six real POST routes, hit over HTTP as the commissioner
//              (never route functions called directly);
//   resolve  — claims-cron's own buildDecisionResolutions (the pure core the
//              Sunday schedule runs), fed REAL 2023 weekly points in exactly
//              the {week: {pid: pts}} shape mergePlayersPoints builds from
//              Sleeper matchup rows;
//   append   — each resolution written back through predledger.append, the
//              REAL guarded path. This arm is what caught a live-loop killer:
//              assertForecast refuses a forecast_resolution without an
//              `outcome`, and the resolver's first output shape had none —
//              every Sunday write would have thrown, forever, while every
//              test that skipped the append path stayed green;
//   grade    — grade-cron's own runGrade, producing the calibration snapshot
//              the Tuesday schedule stores;
//   read     — buildAccuracyView over that snapshot, mapped exactly the way
//              /lineup/accuracy maps it, with the by-kind table actually
//              showing the in-season kinds (GAP: PENDING_KINDS shrinks).
//
// Run: node draft/tests/loop_closure_live.test.js
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-closure-live-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));
const ACC = require(path.join(ROOT, 'src', 'routes', 'accuracy'));
const CC = require(path.join(ROOT, 'netlify', 'functions', 'claims-cron'));
const { runGrade } = require(path.join(ROOT, 'netlify', 'functions', 'grade-cron'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + String(JSON.stringify(d)).slice(0, 300) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const comm = owners.find(o => o.is_commissioner);
  comm.password_hash = hashPassword('pw123456'); comm.must_change_password = false;
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookie = (await fetch(b + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${comm.username}&password=pw123456`, redirect: 'manual',
  }).then(r => r.headers.getSetCookie())).map(s => s.split(';')[0]).join('; ');
  const post = (p, form) => fetch(b + p, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(), redirect: 'manual',
  });
  const seasons = await store.get('seasons');
  const all = Object.values(seasons);
  const season = String((all.find(s => s.status === 'active') || all.sort((a, c) => c.year - a.year)[0]).year);

  // REAL weekly points: 2023 weeks 3-5, merged across every roster's
  // players_points — the identical field Sleeper's matchup rows carry live,
  // which is what makes this a proof about the real data shape.
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const s2023 = (hist.seasons || []).find(s => String(s.season) === '2023');
  const weeklyPoints = {};
  for (const w of ['3', '4', '5']) {
    const merged = {};
    for (const entry of (s2023.weeks || {})[w] || []) Object.assign(merged, entry.players_points || {});
    weeklyPoints[w] = merged;
  }
  const ids = Object.keys(weeklyPoints['3']);
  ck('CONTROL — real week-3 points exist to resolve against', ids.length > 20, ids.length);
  const [pA, pB, pC, pD, pE, pF] = ids;

  // ── CAPTURE, over real HTTP, in every route's real form shape ─────────────
  const J = JSON.stringify;
  await post('/lineup/log', { week: '3', dollars: '4',
    recommended: J([{ id: pA }, { id: pB }]), counterfactual: J([{ id: pC }, { id: pD }]),
    confidence: 'test' });
  await post('/lineup/override', { week: '3', dollars: '4', reason: 'gut',
    recommended: J([{ id: pA }, { id: pB }]), actual: J([{ id: pC }, { id: pD }]),
    confidence: 'test' });
  await post('/waivers/log', { week: '3', dollars: '7', contested: '0',
    chosen: J({ id: pE, pos: 'RB', name: 'Real Add' }), drop: J({ id: pF, name: 'Real Cut' }) });
  await post('/stream/log', { week: '3', dollars: '2',
    chosen: J({ id: pA, pos: 'DEF', name: 'Stream' }), counterfactual: J({ player_id: pB, name: 'Held' }) });
  await post('/stream/override', { week: '3', dollars: '2', reason: 'kept current',
    recommended: J({ id: pA, pos: 'DEF' }), actual: J({ player_id: pB, name: 'Held' }) });
  // The honest-null arm: "streamed someone else" means the page does NOT know
  // what was done — the route must refuse to pretend it does. A DIFFERENT
  // recommendation than the override above, so it is a distinct decision (a
  // same-key repeat would be the double-tap the grader dedupes — tested below).
  await post('/stream/override', { week: '3', dollars: '2', reason: 'streamed someone else',
    recommended: J({ id: pC, pos: 'DEF' }), actual: J({ player_id: pB, name: 'Held' }) });
  // The double-tap arm: the SAME lineup override submitted twice mints the
  // same deterministic key and must grade as ONE decision, not two.
  await post('/lineup/override', { week: '3', dollars: '4', reason: 'gut',
    recommended: J([{ id: pA }, { id: pB }]), actual: J([{ id: pC }, { id: pD }]),
    confidence: 'test' });

  const entries = await predledger.readAll(store, season);
  const inseason = entries.filter(e => FG.INSEASON_DECISION_KINDS.includes(e.kind));
  ck('all seven captures landed (six decisions + one double-tap)', inseason.length === 7,
    inseason.map(e => e.kind));
  ck('EVERY capture now carries a deterministic payload.key (the join the loop was missing)',
    inseason.every(e => typeof e.payload.key === 'string' && e.payload.key.includes('|' + season + '|w3|')),
    inseason.map(e => e.payload.key));
  const streamedElse = inseason.filter(e => (e.payload.reason || '') === 'streamed someone else')[0];
  ck('"streamed someone else" stores actual: null — unknown is recorded as unknown',
    streamedElse && streamedElse.payload.actual === null, streamedElse && streamedElse.payload);
  const lineupOv = inseason.find(e => e.method === 'lineup-override-v1');
  ck('the lineup override captured the ACTUAL lineup (the pre-fix shape never did)',
    lineupOv && Array.isArray(lineupOv.payload.actual) && lineupOv.payload.actual[0].id === pC,
    lineupOv && lineupOv.payload.actual);

  // ── RESOLVE, through claims-cron's own core, and APPEND through the guard ─
  const weeksNeeded = CC.decisionWeeksNeeded(entries, 6, 18);
  ck('decisionWeeksNeeded asks for exactly the claim window (3,4,5) and nothing else',
    JSON.stringify(weeksNeeded) === JSON.stringify([3, 4, 5]), weeksNeeded);
  const resolutions = CC.buildDecisionResolutions(entries, weeklyPoints, { finalWeek: 18 });
  // Resolvable: lineup_call, lineup override (has actual), waiver_claim
  // (drop-based window), stream_call, stream override (kept player). NOT the
  // honest-null override. = 5.
  ck('five of six decisions resolve; the honest-null override stays pending',
    resolutions.length === 5, resolutions.map(r => r.payload.forecast_key));
  for (const r of resolutions) {
    await predledger.append(store, { kind: 'forecast_resolution', method: r.method, season, payload: r.payload });
  }
  ck('every resolution survived the REAL append guard (outcome present — the bug this arm caught)',
    (await predledger.readAll(store, season)).filter(e => e.kind === 'forecast_resolution').length === 5);

  // A second Sunday: nothing re-resolves, the append-only ledger stays clean.
  const after = await predledger.readAll(store, season);
  ck('the next weekly run emits NOTHING for already-resolved decisions',
    CC.buildDecisionResolutions(after, weeklyPoints, { finalWeek: 18 }).length === 0);

  // ── GRADE, through grade-cron's own runGrade ──────────────────────────────
  const rules = { payouts: null, scoring: null, teams: 10, season };
  const { snapshot } = runGrade(after, rules, [], new Date().toISOString());
  const dec = snapshot.decisions.inseason;
  ck('the grader scores all five resolved decisions — the double-tap graded as ONE, not two',
    dec.scored === 5 && dec.n === 6, { scored: dec.scored, n: dec.n });
  ck('and the dropped duplicate is REPORTED, not silently absorbed', dec.duplicates === 1,
    dec.duplicates);
  ck('per-kind aggregates landed in the snapshot (the edge-identification shape)',
    snapshot.forecasts.by_kind && snapshot.forecasts.by_kind.lineup_call
      && snapshot.forecasts.by_kind.waiver_claim && snapshot.forecasts.by_kind.stream_call,
    Object.keys(snapshot.forecasts.by_kind || {}));
  ck('per-week aggregates landed too, keyed to the real decision week',
    Array.isArray(snapshot.forecasts.by_week) && snapshot.forecasts.by_week[0]
      && snapshot.forecasts.by_week[0].week === 3 && snapshot.forecasts.by_week[0].n_graded === 5,
    snapshot.forecasts.by_week);
  ck('override tallies stay separate from tool tallies (the sign-convention guard): '
    + '2 scored overrides split human/tool, 3 non-override decisions split tool/counterfactual',
  (dec.override_human_won + dec.override_tool_won) === 2
      && (dec.tool_won + dec.counterfactual_won) === 3,
  { ovH: dec.override_human_won, ovT: dec.override_tool_won, tool: dec.tool_won, cf: dec.counterfactual_won });

  // ── READ, mapped exactly as /lineup/accuracy maps the stored snapshot ─────
  const calibration = Object.assign({}, snapshot.forecasts, { generated_at: snapshot.graded_at });
  const view = ACC.buildAccuracyView(calibration, null, after.length, { decisions: snapshot.decisions });
  const kinds = Object.fromEntries(view.byKind.map(r => [r.key, r]));
  ck('the by-kind table now SHOWS the in-season kinds, labelled',
    kinds.lineup_call && kinds.lineup_call.label === 'Start/sit calls'
      && kinds.waiver_claim && kinds.waiver_claim.label === 'Waiver calls'
      && kinds.stream_call && kinds.stream_call.label === 'Streaming calls',
    view.byKind.map(r => r.key + ':' + r.label));
  ck('each row carries the honest denominators: n captured AND scored',
    kinds.lineup_call.n === 1 && kinds.lineup_call.scored === 1
      && kinds.waiver_claim.scored === 1 && kinds.stream_call.scored === 1,
    kinds);
  ck('each scored row carries a real mean edge in points',
    typeof kinds.lineup_call.meanEdge === 'number' && typeof kinds.waiver_claim.meanEdge === 'number',
    { lineup: kinds.lineup_call.meanEdge, waiver: kinds.waiver_claim.meanEdge });
  ck('PENDING_KINDS has shrunk to exactly the kind that still cannot grade',
    JSON.stringify(ACC.PENDING_KINDS) === JSON.stringify(['trade_eval']), ACC.PENDING_KINDS);
  ck('by_week reaches the view unchanged', view.byWeek.length === 1 && view.byWeek[0].week === 3,
    view.byWeek);

  // mergePlayersPoints — the live-shape adapter, on the raw row shape.
  const merged = CC.mergePlayersPoints([
    { roster_id: 1, players_points: { a: 1.5, b: 2 } },
    { roster_id: 2, players_points: { c: 3 } }, null]);
  ck('mergePlayersPoints merges every roster\'s players_points into one week map',
    merged.a === 1.5 && merged.b === 2 && merged.c === 3, merged);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILED'); process.exit(1); }
  console.log('\nWHAT THIS GUARANTEES: the loop is closed THROUGH THE REAL SURFACES for');
  console.log('lineup_call, waiver_claim, stream_call and the resolvable overrides —');
  console.log('captured over HTTP, resolved by the Sunday cron\'s own core against real');
  console.log('historical per-player points, appended through the real ledger guard,');
  console.log('graded by the Tuesday cron\'s own core, and readable with per-kind and');
  console.log('per-week aggregates. WHAT IT DOES NOT: exercise the Sleeper fetch itself');
  console.log('(network, proven shape-compatible via mergePlayersPoints against the');
  console.log('archived players_points field), or grade trade_eval (no capture surface');
  console.log('exists — declared in PENDING_KINDS, guarded by scope_agreement.test.js).');
})().catch(e => { console.error(e); process.exit(1); });
