// TERRITORY: A
/* THE WEEKLY GRADE RUNNER — the repo-side half of the weekly learning loop.
 *
 * WHAT RUNS WHERE, so nobody hunts for a job that lives elsewhere:
 *
 *   LIVE (Netlify, Blobs, already scheduled in netlify.toml):
 *     claims-cron  Sun 13:00 UTC  emits forecasts; resolves last week's
 *                                 forecasts AND the in-season decision kinds
 *                                 (buildDecisionResolutions — real Sleeper
 *                                 players_points, appended via predledger).
 *     grade-cron   Tue 12:00 UTC  grades forecasts + decisions, writes the
 *                                 calibration:<season>:<ISO> ledger with
 *                                 by_kind/by_week that /lineup/accuracy reads.
 *
 *   REPO (GitHub Actions, .github/workflows/weekly-grade.yml, Tue 13:30 UTC):
 *     THIS SCRIPT — (1) regenerates draft/data/component_grades.json through
 *     component_write.js (which degrades honestly while weekly_realized.json
 *     does not exist and carries its own fixture self-check), and (2) proves
 *     the in-season resolution pipe still computes, by running the SAME
 *     resolver + grader the live crons use against REAL 2023 history with
 *     independently hand-summed expected answers.
 *
 *     LOOP CLOSURE (2026-08-15, Cory's ruling): three read-side steps —
 *     (3) MIRROR evidence_weights:current from the live store (read-only
 *         weights-read function; never grade-cron's manual key, which RUNS a
 *         grading pass) into draft/data/evidence_weights_latest.json, era
 *         stamp and all — grade-cron's weights finally have a reader;
 *     (4) CHECK REC-2's unlock condition (graded 2026 weeks in the committed
 *         store) so 'blocked until January' is observed by machinery weekly,
 *         never remembered;
 *     (5) REGENERATE draft/data/model_update_recommendations.json
 *         (learning_loop.py), which consumes the mirror — weekly grades flow
 *         into the RECOMMENDATION artifact, not into live parameters.
 *
 * WHY THE SELF-CHECK EXISTS (the component_write pattern, one level up): from
 * now until week 1 every real input is empty, so a broken resolver and a quiet
 * preseason look identical from the outside. The check below is labelled a
 * FIXTURE — it is evidence the pipe computes, never evidence about the league
 * — and it uses real historical box scores so the shapes exercised are the
 * shapes the live data will actually have. Week 1 must not be this pipeline's
 * first execution; with this on a Tuesday schedule, it never can be.
 *
 * Run: node draft/tools/weekly_grade_runner.js
 * Exit 0 = artifact written + self-check passed; 1 = something is broken.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade.js'));
const CW = require(path.join(ROOT, 'src', 'component_write.js'));

function selfCheckResolutionPipe() {
  const hist = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const s2023 = (hist.seasons || []).find(s => String(s.season) === '2023');
  const weekly = {};
  for (const w of ['3', '4', '5']) {
    const merged = {};
    for (const entry of ((s2023 || {}).weeks || {})[w] || []) {
      Object.assign(merged, entry.players_points || {});
    }
    weekly[w] = merged;
  }
  const ids = Object.keys(weekly['3']);
  if (ids.length < 6) {
    return { ok: false, detail: 'league_history.json 2023 week 3 has too few scored players — the fixture cannot run' };
  }
  const [a, b, c, d, e, f] = ids;
  const pts = (w, pid) => Object.prototype.hasOwnProperty.call(weekly[w], pid)
    ? Number(weekly[w][pid]) : 0;
  const r2 = v => Math.round(v * 100) / 100;

  // FIXTURE decisions over REAL points, expected answers summed independently.
  const decisions = [
    { kind: 'lineup_call', id: 'fx-1', decision_at: 't1',
      payload: { key: 'fx-lineup', week: 3, recommended: [{ id: a }, { id: b }],
        counterfactual: [{ id: c }, { id: d }] } },
    { kind: 'stream_call', id: 'fx-2', decision_at: 't1',
      payload: { key: 'fx-stream', week: 3, chosen: { id: a }, counterfactual: { player_id: b } } },
    { kind: 'waiver_claim', id: 'fx-3', decision_at: 't1',
      payload: { key: 'fx-waiver', week: 3, chosen: { id: e, pos: 'RB' },
        counterfactual: 'hold priority', drop: { id: f } } },
    { kind: 'inseason_override', id: 'fx-4', decision_at: 't1',
      payload: { key: 'fx-override', week: 3, recommended: [{ id: a }],
        counterfactual: [{ id: a }], actual: [{ id: b }] } },
  ];
  const expect = {
    'fx-lineup': [r2(pts('3', a) + pts('3', b)), r2(pts('3', c) + pts('3', d))],
    'fx-stream': [r2(pts('3', a)), r2(pts('3', b))],
    'fx-waiver': [r2(pts('3', e) + pts('4', e) + pts('5', e)),
      r2(pts('3', f) + pts('4', f) + pts('5', f))],
    'fx-override': [r2(pts('3', b)), r2(pts('3', a))],
  };
  const res = FG.buildInseasonResolutions(decisions, weekly, { finalWeek: 18 });
  if (res.length !== 4) {
    return { ok: false, detail: `expected 4 resolutions from the fixture, got ${res.length}` };
  }
  for (const r of res) {
    const [ec, ecf] = expect[r.payload.forecast_key] || [];
    if (r.payload.realized_chosen !== ec || r.payload.realized_counterfactual !== ecf) {
      return { ok: false, detail: `${r.payload.forecast_key}: got `
        + `${r.payload.realized_chosen}/${r.payload.realized_counterfactual}, `
        + `hand-sum says ${ec}/${ecf} — THE PIPE IS BROKEN` };
    }
  }
  const graded = FG.gradeDecisions([...decisions, ...res]).inseason;
  if (graded.scored !== 4) {
    return { ok: false, detail: `grader scored ${graded.scored} of 4 resolved fixture decisions` };
  }
  const byKind = FG.decisionByKind({ inseason: graded });
  const kinds = ['lineup_call', 'stream_call', 'waiver_claim', 'inseason_override'];
  if (!kinds.every(k => byKind[k] && byKind[k].scored === 1)) {
    return { ok: false, detail: 'per-kind aggregates missing a fixture kind: '
      + JSON.stringify(Object.keys(byKind)) };
  }
  return { ok: true,
    detail: '4 fixture decisions over real 2023 box scores resolved, graded and '
      + 'aggregated with every number matching an independent hand-sum',
    is_evidence_about_the_league: false,
    what_it_is: 'a connectivity check on the resolve->grade->aggregate pipe, '
      + 'not a measurement (rule 10d): it proves the code computes, nothing else.' };
}

/* (3) THE EVIDENCE-WEIGHTS MIRROR — REC-4's read side. Fetches the read-only
 * weights-read function and writes the era-stamped mirror the recommendation
 * artifact consumes. Degrades honestly: unset URL or unreachable site is a
 * NAMED absence (the mirror is left as-is and the run says why), never a
 * failure — preseason weeks with no deploy configured must stay green. */
function mirrorEvidenceWeights() {
  const site = process.env.SITE_URL || '';
  const key = process.env.GRADE_CRON_KEY || '';
  if (!site) {
    return Promise.resolve({ ok: false, skipped: true,
      detail: 'SITE_URL unset — mirror step skipped by name; configure the repo '
        + 'variable to arm the weekly fetch' });
  }
  const url = site.replace(/\/$/, '') + '/.netlify/functions/weights-read'
    + (key ? ('?key=' + encodeURIComponent(key)) : '');
  return fetch(url, { signal: AbortSignal.timeout(20000) })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(doc => {
      if (!doc || doc.ok !== true) throw new Error('weights-read returned not-ok');
      if (!doc.weights) {
        return { ok: false, skipped: true,
          detail: 'reachable, but no evidence_weights:current in the store yet — '
            + 'grade-cron has not produced a snapshot; named absence, not a claim' };
      }
      const out = {
        _territory: 'TERRITORY: A — mirrored by draft/tools/weekly_grade_runner.js',
        _note: 'Weekly mirror of evidence_weights:current (grade-cron\'s consumed '
          + 'weights, rules_era stamp included). Consumed by learning_loop.py into '
          + 'model_update_recommendations.json — the RECOMMENDATION artifact, not a '
          + 'live parameter (REC-4).',
        fetched_at: new Date().toISOString(),
        calibration_snapshots: doc.calibration_snapshots || 0,
        weights: doc.weights,
      };
      fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'evidence_weights_latest.json'),
        JSON.stringify(out, null, 1));
      return { ok: true, detail: 'mirrored (graded_n=' + (doc.weights.graded_n || 0)
        + ', era=' + String((doc.weights.rules_era || {}).signature || 'unstamped').slice(0, 12)
        + ', snapshots=' + (doc.calibration_snapshots || 0) + ')' };
    })
    .catch(e => ({ ok: false, skipped: true,
      detail: 'fetch failed (' + (e && e.message) + ') — mirror left as-is; a red '
        + 'weekly run is reserved for a broken pipe, not an unreachable site' }));
}

/* (4) REC-2's UNLOCK CONDITION, machine-checked. The prereg (learning_loop.py)
 * grades weeks 1-17 of the 2026 store; until that store exists and fills, the
 * recommendation is blocked — and this line is how 'blocked' stays OBSERVED. */
function rec2UnlockCheck() {
  const p = path.join(ROOT, 'draft', 'backtest', 'nflverse_weekly_points_2026.json');
  let weeks = 0;
  if (fs.existsSync(p)) {
    try {
      const store = JSON.parse(fs.readFileSync(p, 'utf8'));
      weeks = new Set((store.weeks || []).filter(w => w.week >= 1 && w.week <= 17)
        .map(w => w.week)).size;
    } catch (e) { /* unreadable store counts as 0 graded weeks, said below */ }
  }
  return { weeks: weeks, needed: 17,
    line: 'REC-2 source-weights unlock: ' + weeks + '/17 graded 2026 weeks in the '
      + 'committed store — unlocks ~2027-01'
      + (weeks === 0 ? ' (store ' + (fs.existsSync(p) ? 'present but empty' : 'absent')
        + ' — correct until week 1)' : '') };
}

/* (5) THE RECOMMENDATION ARTIFACT REFRESH — learning_loop.py consumes the
 * mirror (and every other committed grade artifact) so weekly grades land in
 * the one artifact rulings act on. A failure HERE is a broken pipe: red. */
function refreshRecommendations() {
  const { spawnSync } = require('child_process');
  const r = spawnSync('python3', [path.join(ROOT, 'draft', 'backtest', 'learning_loop.py')],
    { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) {
    return { ok: false, detail: 'learning_loop.py exited ' + r.status + ': '
      + String(r.stderr || r.stdout).slice(0, 400) };
  }
  return { ok: true, detail: String(r.stdout).trim().split('\n').join('; ') };
}

function main() {
  console.log('WEEKLY GRADE RUNNER — repo-side loop artifacts + pipe self-check\n');

  // (1) Component grades — component_write degrades honestly on its own
  // (rows name what they await; its own fixture self-check rides inside).
  const doc = CW.write(null);
  console.log(`component grades -> ${path.relative(ROOT, CW.OUT)}`);
  console.log(`  declared ${doc.declared}, graded ${doc.graded}`
    + (doc.feed_error ? `  !! FEED ERROR: ${doc.feed_error}` : ''));
  const realized = path.join(ROOT, 'draft', 'data', 'weekly_realized.json');
  if (!fs.existsSync(realized)) {
    console.log('  weekly_realized.json ABSENT — correct until week 1; every row '
      + 'names the input it awaits, and this run proves the writer executes.');
  }
  console.log(`  component self-check: ${doc.self_check.ok ? 'PASS' : 'FAIL'} — ${doc.self_check.detail}`);

  // (2) The in-season resolution pipe, proven on real history.
  const sc = selfCheckResolutionPipe();
  console.log(`\nresolution-pipe self-check (FIXTURE, not league evidence): `
    + `${sc.ok ? 'PASS' : 'FAIL'} — ${sc.detail}`);

  // (3) Mirror the live evidence weights — REC-4's reader. An unreachable
  // site is a named skip, never a red run.
  return mirrorEvidenceWeights().then(mw => {
    console.log(`\nevidence-weights mirror (REC-4 read side): `
      + `${mw.ok ? 'MIRRORED' : 'SKIPPED'} — ${mw.detail}`);

    // (4) REC-2's unlock condition, observed by machinery.
    const r2 = rec2UnlockCheck();
    console.log(r2.line);

    // (5) Refresh the recommendation artifact so this week's grades LAND.
    const rr = refreshRecommendations();
    console.log(`recommendation artifact refresh: ${rr.ok ? 'OK' : 'FAIL'} — ${rr.detail}`);

    const ok = doc.self_check.ok && !doc.feed_error && sc.ok && rr.ok;
    console.log(ok
      ? '\nOK — artifacts written, both pipes compute, and the read side ran: '
        + 'weekly grades flow into the RECOMMENDATION artifact (era-stamped), '
        + 'REC-2\'s unlock is machine-checked, and the weights mirror is '
        + (mw.ok ? 'fresh.' : 'a named absence.')
      : '\nFAILED — see above. A red run here means the pipe is broken, not that '
        + 'the season is quiet; the two are exactly what this runner exists to tell apart.');
    process.exit(ok ? 0 : 1);
  });
}

module.exports = { selfCheckResolutionPipe, mirrorEvidenceWeights, rec2UnlockCheck,
  refreshRecommendations };
if (require.main === module) main();
