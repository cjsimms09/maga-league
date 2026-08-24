// THE WAIVER AUTO-CAPTURE (2026-08-24) — Cory: "you should be logging and
// grading ALL recommendations everywhere even if I don't do them."
//
// Covers the three pure pieces of waiver-reco-cron plus the control that
// actually matters (rule 3e): an auto-emitted row must not merely be WRITTEN —
// it must be accepted by predledger's validation and picked up and RESOLVED by
// the exact resolver claims-cron runs, because "logged" without "graded" is
// the failure the mandate names.
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'waiverauto-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { buildAutoWaiverEntry, buildAutoStreamEntry, buildAutoLineupEntry } =
  require(path.join(ROOT, 'src', 'waiver_reco'));
const { autoCaptureContext } = require(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const store = require(path.join(ROOT, 'src', 'store'));
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : ' — ' + JSON.stringify(detail)));
  cond ? pass++ : fail++;
};

(async () => {
  // ── buildAutoWaiverEntry ──────────────────────────────────────────────────
  const reco = {
    live: true,
    claims: [{ player_id: '9509', name: 'Puka Test', position: 'WR',
               net_value: 21.4, dollars: 38 },
             { player_id: '1111', name: 'Second Guy', position: 'RB',
               net_value: 3.0, dollars: 5 }],
    drop: { player_id: '4046', name: 'Bench Body' },
  };
  const entry = buildAutoWaiverEntry(reco, '2026', 3, 1);
  ok('emits the TOP claim only', entry && entry.payload.chosen.player_id === '9509', entry);
  ok('kind is waiver_claim so the existing resolver/grader own it',
    entry.kind === 'waiver_claim' && entry.method === 'waiver-auto-v1', entry);
  ok('key uses the waiver_auto surface so a manual log of the same player cannot collide',
    entry.payload.key === 'waiver_auto|2026|w3|1|9509', entry.payload.key);
  ok('counterfactual is hold priority (the ledger requires one, and it is true)',
    entry.payload.counterfactual === 'hold priority', entry.payload);
  ok('the drop rides along — the resolver prefers a real roster delta over the wire baseline',
    entry.payload.drop && entry.payload.drop.player_id === '4046', entry.payload.drop);
  ok('the row is marked as the tool\'s own emission', entry.payload.auto === true, entry.payload);

  ok('no positive-value claim -> null, never a fabricated row',
    buildAutoWaiverEntry({ live: true, claims: [{ player_id: 'x', net_value: -2 }] }, '2026', 3, 1) === null);
  ok('not live -> null', buildAutoWaiverEntry({ live: false, claims: [] }, '2026', 3, 1) === null);
  ok('empty claims -> null', buildAutoWaiverEntry({ live: true, claims: [] }, '2026', 3, 1) === null);

  // ── autoCaptureContext ────────────────────────────────────────────────────
  const owners = [{ id: 1, name: 'Cory', is_commissioner: true }, { id: 2, name: 'Rich' }];
  const cfg = { sleeper_map: { '8': 1, '3': 2 } };
  const liveS = { state: { season: '2026' }, week: 3, season_type: 'regular' };
  const c1 = autoCaptureContext(liveS, cfg, owners);
  ok('happy path finds the commissioner\'s roster',
    c1.season === '2026' && c1.week === 3 && c1.ownerId === 1 && c1.myRid === '8', c1);
  ok('preseason is a clean skip (the third false-lock surface taught us why)',
    autoCaptureContext({ state: { season: '2026' }, week: 1, season_type: 'pre' }, cfg, owners).skip === 'preseason');
  ok('no live week is a clean skip', autoCaptureContext(null, cfg, owners).skip === 'no live week yet');
  ok('unmapped commissioner is a named skip, not a crash',
    /not mapped/.test(autoCaptureContext(liveS, { sleeper_map: {} }, owners).skip || ''));

  // ── the control: the row survives validation AND the real resolver ───────
  const appended = await predledger.append(store, entry);
  ok('predledger accepts the auto entry (validation control)',
    appended && appended.kind === 'waiver_claim', appended);

  const unresolved = FG.unresolvedDecisionEntries([appended]);
  ok('the resolver\'s intake sees the auto row as a pending decision',
    unresolved.length === 1, unresolved.length);

  // Resolve it with the SAME function claims-cron calls, over the claim window
  // starting at week 3 — chosen scores, the dropped player scores less.
  const weeklyPoints = {};
  for (let w = 3; w <= 3 + FG.WAIVER_WINDOW_WEEKS - 1; w++) {
    weeklyPoints[String(w)] = { '9509': 12.5, '4046': 4.0 };
  }
  const res = FG.buildInseasonResolutions(unresolved, weeklyPoints, { finalWeek: 18 });
  ok('the real resolver RESOLVES the auto row (rule 3e positive control)',
    res.length === 1 && res[0].payload && res[0].payload.forecast_key === entry.payload.key,
    res);
  const rp = res.length === 1 ? res[0].payload : {};
  ok('the resolution grades chosen vs the real drop over the window',
    rp.realized_chosen === 12.5 * FG.WAIVER_WINDOW_WEEKS
      && rp.realized_counterfactual === 4.0 * FG.WAIVER_WINDOW_WEEKS, rp);

  // Negative arm: an incomplete window stays pending, never defaults to zero.
  const res2 = FG.buildInseasonResolutions(unresolved, { '3': { '9509': 12.5, '4046': 4.0 } },
    { finalWeek: 18 });
  ok('an incomplete window stays pending (negative arm)', res2.length === 0, res2);

  // ── the STREAM twin (register 287 ①) ──────────────────────────────────────
  const sReco = {
    live: true, claims: [],
    streamClaims: [{ player_id: 'DEN', name: 'Broncos', position: 'DEF',
                     net_value: 4.2, dollars: 6 }],
    currentKD: [{ player_id: 'CAR', name: 'Panthers', position: 'DEF' },
                { player_id: '1234', name: 'Some Kicker', position: 'K' }],
  };
  const sEntry = buildAutoStreamEntry(sReco, '2026', 3, 1);
  ok('stream: chosen is the top stream, counterfactual is the HELD unit at that position',
    sEntry && sEntry.kind === 'stream_call'
      && sEntry.payload.chosen.player_id === 'DEN'
      && sEntry.payload.counterfactual.player_id === 'CAR', sEntry);
  ok('stream: key surface is stream_auto',
    sEntry.payload.key === 'stream_auto|2026|w3|1|DEN', sEntry.payload.key);
  const sApp = await predledger.append(store, sEntry);
  const sRes = FG.buildInseasonResolutions(FG.unresolvedDecisionEntries([sApp]),
    { '3': { 'DEN': 11.0, 'CAR': 2.0 } }, { finalWeek: 18 });
  ok('stream: the real resolver grades chosen vs held for the one week',
    sRes.length === 1 && sRes[0].payload.realized_chosen === 11.0
      && sRes[0].payload.realized_counterfactual === 2.0, sRes);
  const sEmpty = buildAutoStreamEntry({ live: true, claims: [],
    streamClaims: [{ player_id: 'DEN', name: 'Broncos', position: 'DEF', net_value: 4.2 }],
    currentKD: [] }, '2026', 3, 1);
  ok('stream: no held unit records the resolver\'s empty-slot note shape',
    sEmpty && /no current DEF/.test(sEmpty.payload.counterfactual.note || ''), sEmpty);
  ok('stream: no positive stream -> null',
    buildAutoStreamEntry({ live: true, claims: [], streamClaims: [], currentKD: [] }, '2026', 3, 1) === null);

  // ── the LINEUP twin (register 287 ①) ──────────────────────────────────────
  const live = {
    lineup: [{ pid: 'p1', name: 'Stud One', pos: 'QB', proj: 20 },
             { pid: 'p2', name: 'Value Two', pos: 'RB', proj: 14 }],
    naive:  [{ pid: 'p1', name: 'Stud One', pos: 'QB', proj: 20 },
             { pid: 'p3', name: 'Big Name', pos: 'RB', proj: 12 }],
    edge: 1.4, confidence: 'one swap, +2.0 proj', ev: {},
  };
  const lEntry = buildAutoLineupEntry(live, { median: 148.5 }, '2026', 3, 1);
  ok('lineup: recommended/counterfactual are the form\'s {id,name,pos,proj} arrays',
    lEntry && lEntry.kind === 'lineup_call'
      && lEntry.payload.recommended[1].id === 'p2'
      && lEntry.payload.counterfactual[1].id === 'p3'
      && lEntry.payload.opp_mean === Math.round(148.5),
    lEntry && lEntry.payload);
  ok('lineup: key is one call per owner-week on the lineup_auto surface',
    lEntry.payload.key === 'lineup_auto|2026|w3|1', lEntry.payload.key);
  const lApp = await predledger.append(store, lEntry);
  const lRes = FG.buildInseasonResolutions(FG.unresolvedDecisionEntries([lApp]),
    { '3': { 'p1': 18.0, 'p2': 16.5, 'p3': 3.0 } }, { finalWeek: 18 });
  ok('lineup: the real resolver sums recommended vs counterfactual over real points',
    lRes.length === 1 && lRes[0].payload.realized_chosen === 34.5
      && lRes[0].payload.realized_counterfactual === 21.0, lRes);
  ok('lineup: a dead optimizer emits nothing',
    buildAutoLineupEntry(null, { median: 148 }, '2026', 3, 1) === null
      && buildAutoLineupEntry({ lineup: [], naive: [] }, { median: 148 }, '2026', 3, 1) === null);

  console.log(`\n${pass}/${pass + fail} waiver auto-capture checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
