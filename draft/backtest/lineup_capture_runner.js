'use strict';
/* THE TOOL ARM'S DRIVER — the live optimizer itself, not a re-implementation.
 *
 * EXP-35 (LAB-REGISTRY.md row 35) grades what src/routes/lineup.js would have
 * started each week of 2023-25. A Python re-implementation of the E[$]
 * objective would be testing a second system that merely resembles the one
 * shipping on Sundays — the exact defect class this repo keeps catching
 * (draft/backtest/replay.js exists for the same reason on the draft side: it
 * drives the real engine.js rather than a port). So Python prepares the
 * walk-forward inputs under the as-of rule, and THIS file hands them to the
 * same optimize() that member.js calls live.
 *
 * WHAT THIS FILE IS ALLOWED TO KNOW: nothing. It holds no data files, reads no
 * harvest, computes no projection. Every number in a request was assembled on
 * the Python side from weeks strictly before the week under decision. If a
 * future-week number reaches optimize(), the leak entered in Python — and
 * lineup_capture.py's leak detector (arm > per-week ceiling => SystemExit)
 * exists to catch precisely that.
 *
 * ctx.matchupValue and ctx.weeklyHigh are DELIBERATELY OMITTED so optimize()
 * falls back to its shipped defaults ($110 playoff-equity per win, $100 weekly
 * prize). EXP-35 is an instrument, not a search: it measures the tool as
 * shipped (no_fit_guard discipline; configs_tried = 1).
 *
 * Usage: node lineup_capture_runner.js <requests.json>   -> JSON on stdout
 *   requests.json: { decisions: [{ key, roster:[{id,name,pos,proj}], slots,
 *                                  sigmaByPos, oppMean, oppSd, bandSamples }] }
 *   stdout:        { tool, decisions: { key: { starters:[pid], why:{...} } } }
 */
const fs = require('fs');
const path = require('path');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

function main() {
  const reqPath = process.argv[2];
  if (!reqPath) {
    process.stderr.write('usage: node lineup_capture_runner.js <requests.json>\n');
    return 1;
  }
  const req = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
  const out = { tool: 'src/routes/lineup.js#optimize (shipped defaults)', decisions: {} };
  for (const d of req.decisions || []) {
    const ctx = {
      slots: d.slots,
      sigmaByPos: d.sigmaByPos,
      oppMean: d.oppMean,
      band: { samples: d.bandSamples || [] },
    };
    // Pass oppSd only when the Python side measured one; otherwise optimize()
    // uses its own shipped default (24), same as the live path with no data.
    if (d.oppSd != null) ctx.oppSd = d.oppSd;
    const res = LO.optimize(d.roster, ctx);
    // §3f of the pre-registration: every arm records WHY, not only what it
    // chose — so a bad week can be opened and read.
    out.decisions[d.key] = {
      starters: res.lineup.map(s => s.pid),
      why: {
        pWin: res.ev.pWin, pHigh: res.ev.pHigh, evDollars: res.ev.dollars,
        projMean: res.ev.mean,
        edge: res.edge,
        deviatedFromProjectionMax: (res.calls || []).length > 0,
        calls: (res.calls || []).map(c => ({ start: c.startId, sit: c.sitId, dollars: c.dollars })),
        oppMean: d.oppMean,
      },
    };
  }
  process.stdout.write(JSON.stringify(out));
  return 0;
}

// NOT process.exit(main()). When stdout is a pipe, writes past the first 64KB
// chunk are asynchronous, and process.exit() kills them mid-flush — the parent
// then reads a truncated JSON document. Setting exitCode lets the event loop
// drain stdout and exit on its own. (Caught by the artifact-registry freshness
// check the first time the batch response crossed 64KB.)
process.exitCode = main();
