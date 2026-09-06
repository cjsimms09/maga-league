/* TERRITORY: relay owns the loop · A owns the arms
 *
 * "ARE WE CASTING A WIDE ENOUGH NET?" — CORY, 2026-08-18. THIS ANSWERS IT WITH
 * A NUMBER, AND FAILS THE BUILD WHEN THE ANSWER STOPS IMPROVING ON SCHEDULE.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * `prediction_ledger_check.js` enforces that predictions get GRADED and that a
 * grade names a SUCCESSOR. Neither of those notices the failure Cory is
 * actually asking about, which is a BREADTH failure:
 *
 *   > "The current arm set is five variants of ONE axis; Tier 1 alone is the
 *   >  single biggest improvement available."  — BLEND-SEARCH-DESIGN.md §2
 *
 * P28 filed that as a prediction and it graded TRUE: `DEFAULT_ARMS` in
 * `draft/weekly_own_projection.py` is five rows varying exactly two knobs —
 * `tilt_scale` and `divisor` — both on the Vegas axis. You can grade those five
 * arms every Tuesday for eighteen weeks, promote a champion every time, satisfy
 * every check this repo owns, and never once test a signal you were not already
 * using. **A search that only selects among the arms it is given is not a
 * search.** The projector's own docstring says exactly this and nothing enforced
 * it: *"the mechanical loop only selects among the arms it is given."*
 *
 * ── THE MECHANISM, AND WHY IT IS A DEADLINE AND NOT A FLOOR ────────────────
 *
 * A floor ("at least N axes live") is satisfied on the day it is written and
 * never again. The thing that actually moves is a DATE — the same mechanism
 * `register_recheck_check.js` uses, which is the only one in this repo with a
 * track record of making anyone do anything.
 *
 * BLEND-SEARCH-DESIGN.md §Sequence already commits to dates. This file makes
 * those commitments executable: when an axis's `by` date passes and that axis
 * still has no arm in the LIVE set, the build goes red with the axis named.
 *
 * ── WHAT COUNTS AS "COVERED", MEASURED THREE WAYS ──────────────────────────
 *
 *   LIVE    an arm on this axis is in `DEFAULT_ARMS`, so it is priced every
 *           Thursday and graded every Tuesday, forever, without anyone asking.
 *   GRADED  a study on this axis has a committed verdict, but nothing recurring
 *           consumes it. This is where most of our work sits, and it is why the
 *           net FEELS wide while the loop stays narrow.
 *   NONE    no arm, no study, no verdict. Nobody has looked.
 *
 * ⚠️ THE DISTINCTION BETWEEN THE FIRST TWO IS THE WHOLE POINT. `pace_arm.py`
 * and `advanced_efficiency_study.json` both exist and both carry graded FALSE
 * verdicts — that is real work and it is not breadth, because a one-off study
 * that ran once in August tells you nothing in November. Counting GRADED as
 * covered is how a program congratulates itself for a net it is not casting.
 *
 * Run:  node draft/tools/projection_breadth.js [--today YYYY-MM-DD] [--emit]
 *       --emit prints ledger-ready prediction rows for every uncovered axis.
 * Exit: 1 when an axis is past its committed date with no LIVE arm.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTOR = path.join(ROOT, 'draft', 'weekly_own_projection.py');
const BACKTEST = path.join(ROOT, 'draft', 'backtest');

/* ── THE AXIS REGISTRY ──────────────────────────────────────────────────────
 *
 * One row per SIGNAL, not per arm. `live` is a predicate over the parsed
 * `DEFAULT_ARMS` — an axis is live only if a shipped arm actually varies it.
 *
 * `by` comes from BLEND-SEARCH-DESIGN.md's own sequence table. Moving a date is
 * allowed and expected; moving it silently is not, which is why the date lives
 * here in code and not in prose.
 *
 * ⚠️ ADDING A ROW HERE MAKES THE BUILD HARDER TO PASS, ON PURPOSE. That is the
 * only direction this file is allowed to move: an axis nobody has thought of is
 * invisible to every check we own, so the registry growing IS the net widening.
 */
const AXES = [
  {
    id: 'vegas',
    name: 'Vegas team total / implied tilt',
    by: null,                       //: already live — the champion's own axis
    live: (arms) => arms.some((a) => a.tilt_scale > 0),
    evidence: ['vegas_team_arm.json'],
  },
  {
    id: 'usage',
    name: 'Usage share (targets / carries / snap share)',
    //: 09-03 -> 09-15 (A, 2026-09-04). IN-SEASON-EDGE-PLAN item 5 commits D to
    //: backtesting usage through weekly_arms_2025_backtest and filing the
    //: number, TRUE or FALSE, by 09-15 — the screen this program requires
    //: before an arm ships. Moved to the date that work is actually committed
    //: to, not a date nobody owns. Register 485.
    by: '2026-09-15',
    live: (arms) => arms.some((a) => /usage|share|tgt|snap/i.test(a.name)),
    evidence: ['snap_share_arm.json'],
  },
  {
    id: 'efficiency',
    name: 'Air yards / EPA / CPOE',
    //: 09-03 -> 09-29 (A, 2026-09-04). The explorer cap is >=3 arms/week and it
    //: is FULL through week 2: v1_blend_pull3 (P359) and ffa4_weekly (P365)
    //: entered 09-02, the props arm enters week 2 (P354). Efficiency queues
    //: behind them by the cap this design set for itself, and section 5's own
    //: warning — fitting on too little and believing it — is the reason not to
    //: jump the queue. Register 485.
    by: '2026-09-29',
    live: (arms) => arms.some((a) => /epa|cpoe|air|eff/i.test(a.name)),
    evidence: ['advanced_efficiency_study.json'],
  },
  {
    id: 'pace',
    name: 'Team pace (plays per game)',
    //: RETIRED ON A GRADE, not moved (A, 2026-09-04, register 485). Pace was
    //: measured twice and came back null both times: a tempo tilt on the season
    //: model, then a prior-season pace tilt on the weekly number in BOTH
    //: backtest folds — pooled miss 4.018 vs 4.010 and 4.365 vs 4.360,
    //: start/sit unchanged to the third decimal (game_env_lab.json). It is on
    //: Cory's own page as a dead axis (WHAT-STUCK entry 8). An axis we answered
    //: is not breadth we are missing, and a gate that demands an arm for it
    //: forever contradicts the measurement it was built to respect.
    by: '2026-09-03',
    retired: 'graded INERT twice (season tilt + weekly tilt, both 2024 and 2025 '
      + 'folds): pooled miss 4.018 vs 4.010 and 4.365 vs 4.360, start/sit '
      + 'unchanged to 3dp. game_env_lab.json; WHAT-STUCK entry 8. Revives '
      + 'automatically if any arm on this axis ever ships.',
    live: (arms) => arms.some((a) => /pace/i.test(a.name)),
    evidence: ['pace_arm.json'],
  },
  {
    id: 'props',
    name: 'Sportsbook player props (weekly)',
    //: 09-03 -> 09-17 (A, 2026-09-04). P354 ships the props arm live as a
    //: weekly challenger for WEEK 2, and IN-SEASON-EDGE-PLAN item 1 states its
    //: own default in the same words: "if unbuilt by 09-17, the relay files the
    //: build as a routed patch". The capture is already running (free writer,
    //: Wed/Thu) and props_weekly_v1 grades as a study arm each Tuesday; what is
    //: missing is the DEFAULT_ARMS entry, which is what this gate measures.
    //: Register 485.
    by: '2026-09-17',
    live: (arms) => arms.some((a) => /prop/i.test(a.name)),
    evidence: ['props_week1_arm.json'],
  },
  {
    id: 'opponent',
    name: 'Opponent defence strength',
    by: '2026-09-19',
    live: (arms) => arms.some((a) => /opp|def|sos/i.test(a.name)),
    evidence: [],
  },
  {
    id: 'kalshi',
    name: 'Kalshi season-long markets',
    by: '2026-09-19',
    live: (arms) => arms.some((a) => /kalshi/i.test(a.name)),
    evidence: [],
  },
  {
    id: 'residual',
    name: 'Residual vs Sleeper (actual − sleeper_proj)',
    by: '2026-09-19',
    live: (arms) => arms.some((a) => /resid/i.test(a.name)),
    evidence: ['RESIDUAL-ARM-PROPOSAL.md'],
  },
];

/* ── READING THE LIVE ARM SET ───────────────────────────────────────────────
 *
 * Parsed out of the Python source rather than imported, because importing means
 * a Python runtime in a Node check and a second way for this to break. The
 * parse is deliberately strict: if it yields nothing, that is a HARD FAILURE,
 * not an empty result. Rule 3e — "no arms found" and "could not read the file"
 * produce identical output, and only one of them is a finding.
 */
function liveArms(src) {
  const block = src.match(/DEFAULT_ARMS\s*=\s*\[([\s\S]*?)\n\]/);
  if (!block) {
    throw new Error(
      'CANNOT FIND DEFAULT_ARMS in weekly_own_projection.py. This check reports '
      + 'BREADTH; an unreadable arm set would silently read as "no axes live", '
      + 'which is indistinguishable from a real regression. Fix the parse.');
  }
  const arms = [];
  for (const m of block[1].matchAll(/\{([^}]*)\}/g)) {
    const body = m[1];
    const name = (body.match(/"name"\s*:\s*"([^"]*)"/) || [])[1];
    if (!name) continue;
    const num = (k) => {
      const v = (body.match(new RegExp('"' + k + '"\\s*:\\s*([-\\d.]+)')) || [])[1];
      return v === undefined ? null : Number(v);
    };
    arms.push({ name: name, tilt_scale: num('tilt_scale'), divisor: num('divisor') });
  }
  if (!arms.length) {
    throw new Error('DEFAULT_ARMS parsed to ZERO arms — the parse is broken, not the arm set.');
  }
  return arms;
}

function hasEvidence(axis) {
  return axis.evidence.some((f) => fs.existsSync(path.join(BACKTEST, f)));
}

function classify(axis, arms) {
  if (axis.live(arms)) return 'LIVE';
  if (hasEvidence(axis)) return 'GRADED';
  return 'NONE';
}

function survey(src, todayStr) {
  const arms = liveArms(src);
  const today = Date.parse(todayStr);
  const rows = AXES.map((a) => {
    const state = classify(a, arms);
    /* ── A RETIRED AXIS IS ANSWERED, NOT MISSING (A, 2026-09-04, register 485).
     * `retired` means the signal was MEASURED AND FOUND INERT, with the grade
     * named in `retired`. Chasing an arm for it forever is the opposite of
     * what the measurement said, and a permanent red is how a gate stops being
     * read. It is deliberately NOT a mute: the row still prints, still carries
     * its reason, and REVIVES the moment somebody ships an arm on that axis
     * (`live` still classifies it LIVE), which is what a re-measurement would
     * look like. Retiring one requires a graded verdict — never a shrug. */
    const overdue = state !== 'LIVE' && !a.retired
      && a.by !== null && Date.parse(a.by) < today;
    return { id: a.id, name: a.name, by: a.by, state: state, overdue: overdue,
      retired: a.retired || null };
  });
  const problems = rows.filter((r) => r.overdue).map((r) =>
    `AXIS "${r.id}" (${r.name}) has NO LIVE ARM and its committed date ${r.by} has `
    + `passed. ${r.state === 'GRADED'
      ? 'A graded one-off study is not breadth — nothing recurring consumes it.'
      : 'Nobody has looked at this signal at all.'} `
    + `Ship an arm into DEFAULT_ARMS, or move the date in BLEND-SEARCH-DESIGN.md `
    + `WITH A REASON and move it here in the same commit.`);
  return {
    arms: arms,
    rows: rows,
    problems: problems,
    live: rows.filter((r) => r.state === 'LIVE').length,
    graded: rows.filter((r) => r.state === 'GRADED').length,
    none: rows.filter((r) => r.state === 'NONE').length,
    /* THE HEADLINE NUMBER. Five arms over one axis is knobs, not breadth. */
    knobs: arms.length,
  };
}

/* ── --emit: THE LOOP FEEDING ITSELF ────────────────────────────────────────
 *
 * Cory: "design in a way where I don't have to ask for more predictions."
 *
 * An uncovered axis IS a prediction waiting to be written — "an arm on X beats
 * the champion" is exactly the falsifiable claim the ledger wants. So the tool
 * that knows which axes are uncovered emits the rows, and a human pastes them.
 * The generator does not file them itself on purpose: a checker that writes to
 * the file it checks can always satisfy itself, and this repo has already paid
 * for one check that could not fail.
 */
function emit(s, todayStr) {
  const md = todayStr.slice(5);
  return s.rows.filter((r) => r.state !== 'LIVE').map((r) => {
    const by = r.by || '2026-09-19';
    return `| Pnn | An arm on the **${r.name}** axis, priced weekly on the shared `
      + `population, beats the champion (\`v1\`) on start/sit accuracy over its `
      + `first four graded weeks. Currently ${r.state}. | ${md} | A | `
      + `${by.slice(5)} | OPEN |  |  |`;
  });
}

function main(argv) {
  const today = (argv.find((a) => a.startsWith('--today=')) || '').split('=')[1]
    || (argv.includes('--today') ? argv[argv.indexOf('--today') + 1] : null)
    || new Date().toISOString().slice(0, 10);
  const s = survey(fs.readFileSync(PROJECTOR, 'utf8'), today);

  console.log('PROJECTION BREADTH — as of ' + today);
  console.log('');
  s.rows.forEach((r) => {
    const mark = r.overdue ? 'OVERDUE' : r.state;
    console.log('  ' + mark.padEnd(8) + r.id.padEnd(12)
      + (r.by ? 'by ' + r.by + '  ' : '            ') + r.name);
  });
  console.log('');
  console.log(`  ${s.live} of ${s.rows.length} axes LIVE · ${s.graded} graded but not `
    + `recurring · ${s.none} untouched`);
  console.log(`  the live arm set is ${s.knobs} arms: ` + s.arms.map((a) => a.name).join(', '));

  if (argv.includes('--emit')) {
    const rows = emit(s, today);
    console.log('\nLEDGER-READY ROWS FOR THE UNCOVERED AXES (paste into '
      + 'PREDICTION-LEDGER.md, renumber):\n');
    rows.forEach((r) => console.log(r));
  }

  if (s.problems.length) {
    console.log('\n' + s.problems.length + ' AXIS DEADLINE(S) PASSED:\n');
    s.problems.forEach((p) => console.log('  ✗ ' + p + '\n'));
    return 1;
  }
  console.log('\nNo axis is past its committed date.');
  return 0;
}

module.exports = { survey, liveArms, emit, AXES };

if (require.main === module) process.exit(main(process.argv.slice(2)));
