#!/usr/bin/env node
/**
 * A WEIGHT RULING SHIPS AND THE PROSE QUOTING THE OLD NUMBER NEVER MOVES.
 * SEVEN INSTANCES IN TWO DAYS. THIS IS THE MECHANICAL END OF REGISTER 5h.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * Cory ruled `MEASURED_WEIGHTS.ceiling` 0 -> 0.45 and it shipped as `09f94f99`.
 * Then, one at a time, over two days:
 *
 *   1. `CLAUDE.md` said the weight "is held at zero through the draft"
 *   2. `A-DRAFT-DAY-DECISIONS.md` C2 said the same
 *   3-5. `DECISIONS-NEEDED.md` entries quoting `value ~0.1`, `value ~0.15`,
 *        `stack ~0.5`
 *   6. `draft/config/league_config.json` — "MEASURED_WEIGHTS.ceiling stays 0",
 *      inside a CONFIG file, which reads as authority rather than commentary
 *   7-8. `DRAFT-WEEK-BRIEF.md` twice — including a flat "The tool ships
 *        `ceiling = 0`" — in **the file CLAUDE.md tells every session to read
 *        first**
 *
 * Every one was found by a human tripping over it while looking for something
 * else. Four of the last five surfaced as side-effects of unrelated searches.
 * That is what a class looks like when nothing sweeps for it.
 *
 * ── THE HALF THAT IS NOT MECHANICAL, MEASURED BEFORE THIS SHIPPED ──────────
 *
 * The first prototype flagged 18 mismatches. **Roughly half were correct
 * sentences**, and the reason matters: a quoted old value is only wrong when the
 * sentence asserts it is CURRENT. Three kinds of quote are legitimate forever:
 *
 *   · a description of a FROZEN artifact — `CLAUDE.md` says `baseline/v1.json`
 *     "still carries `ceiling: 0` and `stack: 0.5`", and it does; that sentence
 *     is register 5g and it is true
 *   · a historical experiment result — "`stack ~0.5` (exp6 winner)"
 *   · a RECORD of a past state — every row in `DEFECT-REGISTER.md` and
 *     `PREDICTION-LEDGER.md` that says what a number USED to be
 *
 * So this does two things a naive version would not:
 *
 *   **SCOPE.** It reads only files that assert CURRENT state. The register and
 *   the ledger are excluded BY DESIGN — they are historical records, and a
 *   checker that reddens on a correctly-recorded past value teaches people to
 *   ignore it. That is this project's own epitaph for the intervention-rate
 *   check, and it is not getting a second one.
 *
 *   **AN ALLOWLIST WITH REASONS, NOT A MUTE BUTTON.** Each entry names the
 *   quote and why it is legitimate. Adding one is a claim you are making in
 *   writing, and it is reviewed like any other.
 *
 * Struck-through text (`~~...~~`) is ignored: striking the old value and writing
 * the correction beside it is how this repo records a correction, and the struck
 * half must not keep firing forever.
 *
 * Run: node draft/tools/weight_claim_sweep.js [--control] [--verbose]
 * Exit: 1 if any non-allowlisted claim disagrees with the live constants.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');

const KEYS = ['value', 'tier', 'need', 'risk', 'ceiling', 'keeper', 'bye', 'stack'];

/* FILES THAT ASSERT CURRENT STATE. Not the register, not the ledger — see the
 * header. Add a file here when it starts telling readers what the tool DOES. */
const SCOPE = [
  'CLAUDE.md',
  'DRAFT-WEEK-BRIEF.md',
  'A-DRAFT-DAY-DECISIONS.md',
  'DECISIONS-NEEDED.md',
  'draft/config/league_config.json',
  'DRAFT-NIGHT-RUNBOOK.md',
  'OPERATING-MODEL.md',
];

/* KNOWN-LEGITIMATE QUOTES, each with the reason it is not drift. A key here is
 * `file::key=value`. Every entry is a claim in writing — review it like code. */
const ALLOW = {
  'CLAUDE.md::ceiling=0':
    'register 5g, describing draft/baseline/v1.json, which is FROZEN at '
    + '2026-08-10 and genuinely still carries ceiling 0. The sentence is about '
    + 'the frozen artifact, not the live engine, and it is the whole point of 5g.',
  'CLAUDE.md::stack=0.5':
    'same sentence, same frozen baseline — v1.json carries stack 0.5.',
  'DECISIONS-NEEDED.md::stack=0.5':
    'quotes exp6\'s WINNING VALUE as a historical experiment result ("the flat '
    + 'preset Cory floated"), not a claim about what ships today.',
};

function liveWeights(src) {
  const out = {};
  for (const name of ['MEASURED_WEIGHTS', 'DEFAULT_WEIGHTS']) {
    const m = src.match(new RegExp(name + '\\s*=\\s*\\{([^}]*)\\}', 's'));
    if (!m) continue;
    const o = {};
    KEYS.forEach((k) => {
      const km = m[1].match(new RegExp('\\b' + k + '\\s*:\\s*(-?\\d+\\.?\\d*)'));
      if (km) o[k] = parseFloat(km[1]);
    });
    out[name] = o;
  }
  if (!out.MEASURED_WEIGHTS || !Object.keys(out.MEASURED_WEIGHTS).length) {
    throw new Error(
      'CANNOT READ MEASURED_WEIGHTS from engine.js. This check compares prose to '
      + 'the live constants; unreadable constants would make every claim look '
      + 'fine, which is indistinguishable from no drift. Fix the parse.');
  }
  return out;
}

/* A TIGHT separator only — `key: n`, `key ~n`, `key = n`, `key at n`, `key to n`.
 * A loose window ("...ceiling, and the 0.5 weight...") turns every paragraph
 * mentioning a weight into a hit, which is how the first prototype produced a
 * list nobody would read. */
const CLAIM = new RegExp(
  '\\b(' + KEYS.join('|') + ')\\b\\s*(?::|~|=|\\bat\\b|\\bto\\b)\\s*(-?\\d\\.\\d+|-?\\d+)', 'gi');

function claimsIn(text) {
  const stripped = text.replace(/~~[\s\S]*?~~/g, ' ');   //: corrections, already struck
  const out = [];
  let m;
  while ((m = CLAIM.exec(stripped))) {
    const v = parseFloat(m[2]);
    if (v > 3 || v < -3) continue;        //: out of weight range — a year, a pick number
    out.push({ key: m[1].toLowerCase(), value: v, at: m.index });
  }
  return out;
}

function sweep(files, weights) {
  const flagged = [];
  let scanned = 0;
  for (const rel of files) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const c of claimsIn(text)) {
      scanned++;
      const M = weights.MEASURED_WEIGHTS[c.key];
      const D = (weights.DEFAULT_WEIGHTS || {})[c.key];
      const ok = (M != null && Math.abs(M - c.value) < 1e-9)
        || (D != null && Math.abs(D - c.value) < 1e-9);
      if (ok) continue;
      const id = `${rel}::${c.key}=${c.value}`;
      if (ALLOW[id]) continue;
      flagged.push({ id: id, file: rel, key: c.key, claimed: c.value, live: M });
    }
  }
  return { flagged, scanned };
}

function main(argv) {
  const weights = liveWeights(fs.readFileSync(ENGINE, 'utf8'));

  if (argv.includes('--control')) {
    /* ── THE KNOWN POSITIVE ─────────────────────────────────────────────
     * Rule 3e: a probe that has never returned a positive has not been tested,
     * only run. `DRAFT-WEEK-BRIEF.md` carried two stale ceiling claims until
     * 2026-08-18. This replays the committed pre-fix file and asserts they are
     * found — a real defect, in a real file, that really cost something. */
    let before;
    try {
      before = execSync('git show HEAD:DRAFT-WEEK-BRIEF.md',
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      console.log('CONTROL COULD NOT RUN — HEAD:DRAFT-WEEK-BRIEF.md unreadable.');
      return 1;
    }
    const stale = claimsIn(before).filter((c) => {
      const M = weights.MEASURED_WEIGHTS[c.key];
      return M != null && Math.abs(M - c.value) > 1e-9;
    });
    const now = sweep(['DRAFT-WEEK-BRIEF.md'], weights).flagged;
    const ok = stale.length >= 1 && now.length === 0;
    console.log('KNOWN-POSITIVE CONTROL (register 5h, instances 7-8)');
    console.log(`  committed DRAFT-WEEK-BRIEF.md: ${stale.length} stale claim(s) `
      + `-> ${stale.length ? 'FOUND' : 'MISSED'}`);
    console.log(`  working tree                 : ${now.length} flagged`);
    console.log('  ' + (ok
      ? 'PASS — the sweep finds real drift in a real file, and that file is clean now.'
      : 'FAIL — a sweep that cannot find the instance it was built for says '
        + 'nothing by finding nothing else.'));
    return ok ? 0 : 1;
  }

  const { flagged, scanned } = sweep(SCOPE, weights);
  console.log('WEIGHT CLAIMS IN STATE-ASSERTING FILES vs THE LIVE CONSTANTS\n');
  console.log('  live MEASURED_WEIGHTS: '
    + JSON.stringify(weights.MEASURED_WEIGHTS));
  console.log(`  ${scanned} claim(s) scanned across ${SCOPE.length} file(s), `
    + `${Object.keys(ALLOW).length} allowlisted with reasons\n`);

  if (argv.includes('--verbose')) {
    Object.entries(ALLOW).forEach(([k, why]) => console.log(`  allowed  ${k}\n           ${why}\n`));
  }

  if (!flagged.length) {
    console.log('  ✅ no state-asserting file quotes a weight the engine does not carry.\n');
    console.log('  SCOPE: the register and the ledger are NOT read — they are historical');
    console.log('  records, and a past value recorded correctly is not drift.');
    return 0;
  }
  console.log(`  ✗ ${flagged.length} claim(s) disagree with the live engine:\n`);
  flagged.forEach((f) => console.log(
    `      ${f.file}: ${f.key} = ${f.claimed}, live ${f.live}`));
  console.log('\n  Correct the sentence (strike the old value, write the new one beside');
  console.log('  it), or add it to ALLOW with the reason it is legitimate.');
  return 1;
}

module.exports = { sweep, claimsIn, liveWeights, SCOPE, ALLOW };

if (require.main === module) process.exit(main(process.argv.slice(2)));
