// TERRITORY: A
// THE READ SIDE OF THE WEEKLY LOOP — the three steps that turned grading from
// display into flow (loop closure, 2026-08-15, Cory's ruling).
//
// grade-cron wrote evidence_weights:current for weeks with zero readers; C's
// calibration had appliers with no caller; REC-2's unlock lived in memory.
// The runner now mirrors, checks, and regenerates. This file pins the
// behaviours that keep those honest WITHOUT a network or a live store.
//
// Run: node draft/tests/weekly_grade_readside.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'draft', 'tools', 'weekly_grade_runner.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. REC-2's unlock condition is machine-checked, in the prereg's units ──
{
  const r2 = R.rec2UnlockCheck();
  ck('the unlock check reports weeks toward 17 — the prereg\'s own denominator',
    r2.needed === 17 && r2.weeks >= 0 && r2.weeks <= 17, r2);
  ck('and its line carries the X/17 progress a log reader scans for',
    new RegExp(r2.weeks + '/17').test(r2.line), r2.line);
  const store = path.join(ROOT, 'draft', 'backtest', 'nflverse_weekly_points_2026.json');
  if (!fs.existsSync(store)) {
    ck('no 2026 store on disk -> 0/17 and the absence is NAMED, not skipped',
      r2.weeks === 0 && /store absent/.test(r2.line), r2.line);
  } else {
    ck('the 2026 store exists -> the count is read from it, not asserted',
      typeof r2.weeks === 'number');
  }
}

// ── 2. The mirror step degrades honestly with no site configured ──────────
{
  const saved = { SITE_URL: process.env.SITE_URL, GRADE_CRON_KEY: process.env.GRADE_CRON_KEY };
  delete process.env.SITE_URL;
  R.mirrorEvidenceWeights().then(mw => {
    ck('SITE_URL unset -> the mirror SKIPS BY NAME instead of failing the run '
      + '(a red weekly run is reserved for a broken pipe)',
    mw.ok === false && mw.skipped === true && /SITE_URL unset/.test(mw.detail), mw);

    // ── 3. The expose function is read-only BY CONSTRUCTION ───────────────
    const src = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'weights-read.js'), 'utf8');
    ck('weights-read.js never writes the store — the difference from hitting '
      + 'grade-cron\'s manual key, which RUNS a grading pass',
    !/store\.set\(/.test(src) && /store\.get\('evidence_weights:current'\)/.test(src));
    ck('and it is key-gated under the same GRADE_CRON_KEY policy',
      /GRADE_CRON_KEY/.test(src));

    // ── 4. The artifact refresh executes the real regeneration ────────────
    const rr = R.refreshRecommendations();
    ck('learning_loop.py regenerates the recommendation artifact through the '
      + 'runner — the weekly grades have somewhere to LAND', rr.ok === true, rr.detail);
    const art = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'model_update_recommendations.json'), 'utf8'));
    ck('the refreshed artifact keeps its territory stamp first and the ruling '
      + 'boundary explicit', Object.keys(art)[0] === '_territory'
      && art.defaults_untouched_beyond_ruling === true
      && Array.isArray(art.applied_under_ruling));
    const rec4 = art.recommendations.find(r => /REC-4/.test(r.id));
    ck('REC-4 reports its reader state truthfully (mirror consumed OR a named '
      + 'absence — never a silent gap)',
    rec4 && (rec4.status === 'wired-to-recommendation-artifact'
      || (rec4.status === 'wiring-gap' && /named absence/.test(rec4.reader_status))),
    rec4 && rec4.status);

    if (saved.SITE_URL !== undefined) process.env.SITE_URL = saved.SITE_URL;
    console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
    if (fail) { console.log('\nFAILED'); process.exit(1); }
  });
}
