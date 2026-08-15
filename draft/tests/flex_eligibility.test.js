// TERRITORY: A
'use strict';
// FLEX ELIGIBILITY IS DEFINED SIX TIMES. THIS IS THE THING THAT COMPARES THEM.
//
// Rule 11, requirement 3: where is the same quantity derived more than one way,
// and does anything compare them? Flex eligibility is derived in six places
// across both lanes — the draft engine (value.js, mcts.js, valuation.js,
// grabby.js), the in-season optimizer (src/routes/lineup.js) and a test
// (sanity-sweep). Nothing compared them, and they did NOT all agree: three
// carried FLEX + SUPER_FLEX + REC_FLEX, three carried FLEX alone.
//
// The narrow copy was not merely narrower, it was wrong. src/routes/lineup.js
// checked `slot === 'FLEX' ? eligible.has(pos) : pos === slot`, so a SUPER_FLEX
// or REC_FLEX slot matched no player at all and VANISHED from the lineup: the
// optimizer returned six starters for a seven-slot roster and priced that as
// optimal. Every downstream number — projected mean, P(win), P($100), the dollar
// edge over your studs — was computed on a lineup missing a starter, silently,
// while the draft engine had supported both slot types the whole time.
//
// This test does two things a consolidation could not: it fails when the six
// DISAGREE, and it fails when a NEW one appears that nobody told it about.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

// The known definitions. `flexOnly` records that a file legitimately covers
// only the FLEX case — that is a scope statement, and the test holds it to it.
const SITES = [
  { file: 'src/routes/lineup.js', name: 'FLEX_SLOTS', flexOnly: false, lane: 'B' },
  { file: 'public/js/draft/value.js', name: 'FLEX_ELIGIBLE', flexOnly: false, lane: 'A' },
  { file: 'public/js/draft/mcts.js', name: 'FLEX_ELIGIBLE', flexOnly: false, lane: 'A' },
  { file: 'public/js/draft/valuation.js', name: 'FLEX_ELIGIBLE', flexOnly: false, lane: 'A' },
  { file: 'public/js/draft/grabby.js', name: 'FLEX_ELIGIBLE', flexOnly: true, lane: 'A' },
  { file: 'draft/tests/sanity-sweep.test.js', name: 'FLEX_ELIGIBLE', flexOnly: true, lane: 'A' },
  /* SEVENTH, added 2026-08-13. draft/tools/lineup_value.js declared its own
   * FLEX_ELIGIBLE and this test caught it the same day — which is the entire
   * reason check 3 exists. REGISTERED SO IT IS COMPARED, not exempted: adding it
   * to an ignore list would have silenced the alarm and left the copy free to
   * drift, which is the failure the file is named after. */
  { file: 'draft/tools/lineup_value.js', name: 'FLEX_ELIGIBLE', flexOnly: false, lane: 'A' },
];

// Pull the literal out of the source and evaluate it. Reading the SOURCE rather
// than importing matters: three of these are browser modules inside an IIFE and
// never export the constant, so importing would silently test only the two that
// happen to be reachable — which is how a comparison test ends up comparing one
// thing with itself.
function literal(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = src.match(new RegExp('(?:const|var|let)\\s+' + name + '\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)'));
  if (!m) return null;
  try { return new Function('return ' + m[1])(); } catch (e) { return { _error: e.message }; }
}

// Normalise every shape to { SLOT: [positions, sorted] }.
function normalise(v) {
  if (v == null || v._error) return null;
  const sorted = xs => [...xs].map(String).sort();
  if (v instanceof Set) return { FLEX: sorted(v) };
  if (Array.isArray(v)) return { FLEX: sorted(v) };
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = val instanceof Set ? sorted(val) : Array.isArray(val) ? sorted(val) : null;
    }
    return out;
  }
  return null;
}

const found = {};
for (const s of SITES) {
  const norm = normalise(literal(s.file, s.name));
  ck(`${s.file} still defines ${s.name}`, !!norm, norm);
  if (norm) found[s.file] = { norm, site: s };
}

// ── 1) EVERY FILE THAT DEFINES FLEX MUST AGREE ON FLEX.
{
  const flex = Object.entries(found).map(([f, v]) => [f, (v.norm.FLEX || []).join(',')]);
  const distinct = [...new Set(flex.map(([, v]) => v))];
  ck('all six agree on what may fill a FLEX', distinct.length === 1,
    Object.fromEntries(flex));
}

// ── 2) THE WIDER SLOTS MUST AGREE WHERE THEY ARE DEFINED.
for (const slot of ['SUPER_FLEX', 'REC_FLEX']) {
  const defs = Object.entries(found)
    .filter(([, v]) => v.norm[slot])
    .map(([f, v]) => [f, v.norm[slot].join(',')]);
  ck(`every definition of ${slot} agrees`, [...new Set(defs.map(([, v]) => v))].length === 1,
    Object.fromEntries(defs));
  // And the files that claim to cover it actually do.
  const shouldHave = Object.entries(found).filter(([, v]) => !v.site.flexOnly).map(([f]) => f);
  const missing = shouldHave.filter(f => !found[f].norm[slot]);
  ck(`  and every non-FLEX-only file carries ${slot}`, missing.length === 0, missing);
}

// ── 3) A SEVENTH COPY MUST NOT APPEAR UNNOTICED.
// The whole failure mode is a definition nobody knew about drifting from the
// rest, so an unknown site is a failure, not a curiosity.
{
  const { execFileSync } = require('child_process');
  let hits = [];
  try {
    hits = execFileSync('grep', ['-rln', '--include=*.js', '-E',
      '(const|var|let)[[:space:]]+FLEX_(ELIGIBLE|SLOTS)[[:space:]]*=', ROOT],
      { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (e) { hits = []; }
  const rel = hits.map(h => path.relative(ROOT, h)).filter(f => !f.startsWith('node_modules'))
    // Background-agent worktrees are full duplicate checkouts under
    // .claude/worktrees/ — every hit inside one is a COPY of a registered
    // site, not a seventh definition. Found 2026-08-15 when two live
    // worktrees turned this red with copies of lineup.js/value.js/grabby.js.
    .filter(f => !f.startsWith('.claude'))
    .filter(f => f !== 'draft/tests/flex_eligibility.test.js');
  const known = new Set(SITES.map(s => s.file));
  const unknown = rel.filter(f => !known.has(f));
  ck('no UNREGISTERED definition has appeared that this test does not compare',
    unknown.length === 0, unknown);
  ck('  and every known definition still exists', SITES.every(s => rel.includes(s.file)),
    SITES.map(s => s.file).filter(f => !rel.includes(f)));
}

// ── 4) BEHAVIOUR, not just literals: the optimizer must FILL each flex slot.
// The literals agreeing is necessary and not sufficient — the defect was in the
// eligibility CHECK, which read the literal correctly and then ignored it for
// every slot but FLEX.
{
  const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));
  const roster = [
    { id: 'q1', name: 'QB One', pos: 'QB', proj: 22 }, { id: 'q2', name: 'QB Two', pos: 'QB', proj: 18 },
    { id: 'r1', name: 'RB One', pos: 'RB', proj: 15 }, { id: 'r2', name: 'RB Two', pos: 'RB', proj: 12 },
    { id: 'w1', name: 'WR One', pos: 'WR', proj: 14 }, { id: 'w2', name: 'WR Two', pos: 'WR', proj: 11 },
    { id: 'w3', name: 'WR Three', pos: 'WR', proj: 10 }, { id: 't1', name: 'TE One', pos: 'TE', proj: 9 },
  ];
  const base = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const run = extra => LO.optimize(roster, { slots: { ...base, ...extra },
    band: { samples: [120, 130, 140] }, oppMean: 120, matchupValue: 25 });

  for (const slot of ['FLEX', 'SUPER_FLEX', 'REC_FLEX']) {
    const res = run({ [slot]: 1 });
    const cell = (res.lineup || []).find(s => s.slot === slot);
    ck(`the optimizer fills a ${slot} slot`, !!cell && !!cell.pid,
      { starters: (res.lineup || []).length, slots: (res.lineup || []).map(s => s.slot) });
    ck(`  and returns a full ${slot} lineup, not one starter short`,
      (res.lineup || []).length === 7, (res.lineup || []).length);
  }
  // Eligibility is respected, not merely non-empty: a QB may fill SUPER_FLEX and
  // must not fill REC_FLEX.
  const sf = (run({ SUPER_FLEX: 1 }).lineup || []).find(s => s.slot === 'SUPER_FLEX');
  ck('SUPER_FLEX takes the QB when the QB is the best eligible', sf && sf.pos === 'QB', sf);
  const rf = (run({ REC_FLEX: 1 }).lineup || []).find(s => s.slot === 'REC_FLEX');
  ck('REC_FLEX never takes a QB or an RB', rf && ['WR', 'TE'].includes(rf.pos), rf);

  // The old name must remain a VIEW on the map, never a second literal.
  ck('FLEX_ELIGIBLE is derived from FLEX_SLOTS, not restated',
    LO.FLEX_ELIGIBLE === LO.FLEX_SLOTS.FLEX);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
