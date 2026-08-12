// TERRITORY: A
/* THE COMPONENT-GRADE WRITER — the artifact the gate and the standing check
 * both read and nothing has ever produced.
 *
 * `component_specs.js` declares six rows. `component_grade.js` grades one.
 * `component_run.js` grades all six. **NOTHING WROTE THE RESULT ANYWHERE**, so
 * `standing_check.check_components` reports "quiet — nothing calls it" and the
 * graduation gate has never seen a component grade at all. That is the
 * produced-and-unread shape (rule 14) one level up: not a value nobody reads, a
 * whole grading surface nobody invokes.
 *
 * ── IT RUNS TODAY, IN AUGUST, WITH NO SEASON ───────────────────────────────
 *
 * And reports `no_data` on every row that has no input. **That is the deliverable
 * rather than a placeholder**, for the same reason the January reconstruction
 * prints "NO INPUT — and this is a successful run": a writer first executed in
 * week 1 is a writer nobody has ever executed, and week 1 is a bad time to find
 * out. Every row names THE SPECIFIC INPUT IT IS WAITING FOR, so an empty artifact
 * is a checklist rather than a shrug.
 *
 * ── AND AN ARTIFACT OF ALL NULLS CANNOT SHOW THAT IT COMPUTES ──────────────
 *
 * Which is rule 10's problem exactly: a writer that only ever emits `no_data` is
 * indistinguishable from a writer whose grading path is broken. So the emitted
 * artifact carries a **SELF-CHECK**: the same `runAll` is exercised on a
 * synthetic fixture with a KNOWN sign, and the artifact records whether the
 * grading path returned the expected verdict. If the path breaks, the artifact
 * says so next to the nulls instead of looking identical to a healthy one.
 *
 * The self-check is NOT evidence about the league. It is evidence that the pipe
 * is connected, and it is labelled that way in the artifact so nothing downstream
 * can mistake a fixture for a measurement (rule 10d — a fixture that derives from
 * the code under test must not be read as a result).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const RUN = require('./component_run.js');
const SPECS = require('./component_specs.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'draft', 'data', 'component_grades.json');

/* WHAT EACH ROW IS WAITING FOR, named per component rather than left as a
 * generic "no data". A reader in week 3 needs to know WHICH feed is missing. */
const AWAITING = {
  projection: 'weekly realized box scores joined to the frozen proj_mean and to '
    + 'last season\'s per-game average (prior_ppg)',
  opportunity_adj: 'weekly realized box scores joined to BOTH proj_mean and '
    + 'proj_baseline — the same projection without the ±15% adjustment',
  consensus: 'weekly realized box scores joined to the FantasyPros-only and '
    + 'Sleeper-only projections, not just the blend',
  replacement: 'realized weekly STARTS across the league, to locate the actual '
    + 'startable boundary against the shipped subtrahend',
  survival: 'replayed drafts with the board state at each pick. 3 real drafts '
    + 'are on disk (draft/data/league_history.json) against a declared minimum '
    + 'of 20 clusters, so this row reads too_thin even once replay is wired',
  weekly_claims: 'the emitted per-matchup win probabilities paired with final '
    + 'weekly scores',
};

/* Load whatever realized rows exist. TODAY THERE ARE NONE, and this returns an
 * empty map rather than pretending — but the function is the seam the weekly job
 * fills, so it exists now and is exercised now. */
function loadRealized() {
  const data = {};
  const wk = path.join(ROOT, 'draft', 'data', 'weekly_realized.json');
  if (fs.existsSync(wk)) {
    try {
      const d = JSON.parse(fs.readFileSync(wk, 'utf8'));
      Object.keys(d || {}).forEach(k => { if (Array.isArray(d[k])) data[k] = d[k]; });
    } catch (e) {
      /* ⚠️ LOUD. An unreadable input that silently becomes "no data" would report
       * a BROKEN FEED as a QUIET SEASON, which is the single most expensive
       * confusion this artifact can produce. */
      return { __error: `weekly_realized.json unreadable: ${e.message}` };
    }
  }
  return data;
}

/* THE SELF-CHECK. A fixture with a KNOWN answer, run through the same `runAll`
 * the real rows use. Its only job is to distinguish "no data" from "broken".
 *
 * Deliberately uses the `weekly_claims` row: it is Brier against a flat 50%
 * baseline, so a fixture of confident-and-correct forecasts must grade `earning`
 * and there is no ambiguity about the expected sign. */
function selfCheck() {
  const pairs = [];
  for (let w = 1; w <= 40; w++) {
    // Confident and right: p=0.9 when the home team wins, p=0.1 when it does not.
    const homeWon = w % 2 === 0 ? 1 : 0;
    pairs.push({ p_home: homeWon ? 0.9 : 0.1, home_won: homeWon, week: w });
  }
  let res;
  try {
    res = RUN.runAll({ weekly_claims: pairs });
  } catch (e) {
    return { ok: false, detail: `runAll threw on the fixture: ${e.message}`,
      is_evidence_about_the_league: false };
  }
  const row = (res.components || []).find(r => r.name === 'weekly_claims');
  const got = row && row.verdict;
  return {
    ok: got === 'earning',
    expected: 'earning',
    got: got || null,
    detail: got === 'earning'
      ? 'a fixture of confident-and-correct forecasts graded `earning` against a '
        + 'flat-50% baseline, so the grading path computes'
      : `the grading path returned "${got}" on a fixture that must grade `
        + '`earning` — THE PIPE IS BROKEN AND THE NULLS BELOW ARE NOT EVIDENCE',
    /* NAMED IN THE ARTIFACT so nothing downstream reads a fixture as a result. */
    is_evidence_about_the_league: false,
    what_it_is: 'a connectivity check on the grading path, not a measurement. '
      + 'It derives from the code under test and therefore proves only that the '
      + 'code runs (rule 10d).',
  };
}

function build() {
  const realized = loadRealized();
  const feedError = realized.__error || null;
  if (feedError) delete realized.__error;

  const graded = RUN.runAll(realized);
  const rows = (graded.components || []).map(r => {
    const out = Object.assign({}, r);
    if (r.verdict === 'no_data' || r.verdict === 'no_builder') {
      out.awaiting = AWAITING[r.name] || 'input not described — add it to AWAITING';
    }
    out.units = SPECS.SPECS[r.name] && SPECS.SPECS[r.name].material != null
      ? { material: SPECS.SPECS[r.name].material,
          cluster_is: SPECS.SPECS[r.name].cluster_is }
      : null;
    return out;
  });

  return {
    artifact: 'component grades',
    written_by: 'src/component_write.js',
    /* NO TIMESTAMP FROM THE CLOCK IN THE COMMITTED ARTIFACT'S IDENTITY. The
     * caller passes one; a self-generated one would make every run a diff and
     * train the weekly job's reviewers to ignore it. */
    rows: rows,
    declared: graded.declared,
    graded: graded.graded,
    feed_error: feedError,
    self_check: selfCheck(),
    note: 'PROPOSES NOTHING. This artifact is evidence; the graduation gate '
      + 'reads it and reports, and a human decides. Rows reading no_data name '
      + 'the input they await rather than reporting an empty season.',
  };
}

function write(stamp) {
  const doc = build();
  if (stamp) doc.written_at = stamp;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  return doc;
}

module.exports = { build, write, selfCheck, AWAITING, OUT };

if (require.main === module) {
  const i = process.argv.indexOf('--stamp');
  const doc = write(i > 0 ? process.argv[i + 1] : null);
  const sc = doc.self_check;
  console.log(`component grades written → draft/data/component_grades.json`);
  console.log(`  declared ${doc.declared}, graded ${doc.graded}`);
  doc.rows.forEach(r => {
    console.log(`  ${String(r.name).padEnd(16)} ${String(r.verdict).padEnd(12)}`
      + (r.awaiting ? `awaiting: ${r.awaiting.slice(0, 78)}` : ''));
  });
  if (doc.feed_error) console.error(`  !! FEED ERROR: ${doc.feed_error}`);
  console.log(`  self-check: ${sc.ok ? 'PASS' : 'FAIL'} — ${sc.detail}`);
  process.exit(sc.ok && !doc.feed_error ? 0 : 1);
}
