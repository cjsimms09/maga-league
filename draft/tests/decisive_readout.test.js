// TERRITORY: A
/* THE DECISIVE-TERM READOUT IS CALLED, NOT MERELY LOADED.
 *
 * decision_contract.js sat on the war-room page, verified present by
 * module_check.js, and referenced by app.js ZERO times. A module can be loaded,
 * checked, and unread all at once, and every one of those checks was green.
 * That is rule 14 at the surface that answers "why this player".
 *
 * These assertions are deliberately split so a future regression says WHICH half
 * broke: the contract exists, app.js calls it, and the call is READ-ONLY.
 *
 * Run: node draft/tests/decisive_readout.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DC = require(path.join(ROOT, 'public', 'js', 'draft', 'decision_contract.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const TPL = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');

// ── 1. LOADED — the half that was already true and proved nothing on its own ─
ck('CONTROL: the contract is on the war-room page',
  /<script src="\/js\/draft\/decision_contract\.js"><\/script>/.test(TPL));

// ── 2. AND NOW CALLED ───────────────────────────────────────────────────────
ck('app.js actually CALLS DecisionContract — loaded is not read',
  /DecisionContract\.contributions\(/.test(APP));
ck('  and filters to the terms that decided it, not every term',
  /decision_significant/.test(APP));
ck('  and it renders into the recommendation host',
  /decisiveLine/.test(APP) && /head \+ decisiveLine \+ scored\.map/.test(APP));

// ── 3. READ-ONLY. A readout that reorders is a scoring term in disguise. ────
{
  /* ⚠️ THE END ANCHOR WAS A FULL SOURCE LINE AND IT BROKE ON AN UNRELATED EDIT.
   *
   * It read `APP.indexOf('host.innerHTML = head + decisiveLine')`. Adding a
   * caption to the same statement — `explainPanel('recommendations') + head +
   * decisiveLine` — made that lookup return -1, `slice(i, -1)` swallowed almost
   * the whole file, and the sort-detector duly found sorts. THE FAILURE WAS
   * REAL AND THE CAUSE WAS THE ANCHOR: a test that pins a whole line of source
   * fails on any edit to that line, whatever the edit was for.
   *
   * Anchored on `decisiveLine` alone now — the identifier this section is
   * actually about — and asserted to be a plausible span rather than trusted,
   * because a -1 from either lookup is what turned a narrow check into a
   * file-wide one without saying so. */
  const i = APP.indexOf('let decisiveLine');
  const j = APP.indexOf('decisiveLine + scored.map', i);
  ck('the readout block is LOCATABLE — both anchors resolve', i > 0 && j > i,
    { start: i, end: j });
  ck('and it is a plausible span, not the rest of the file', j - i > 50 && j - i < 6000,
    j - i);
  const block = APP.slice(i, j);
  ck('the readout SORTS nothing and mutates no score',
    !/\.sort\(|\.score\s*=|scored\[\d\]\s*=|\.splice\(/.test(block), block.length);
  ck('  and it is wrapped so a throw costs the line, never the list',
    /try\s*\{/.test(block) && /catch/.test(block));
  ck('  and a failure SAYS so rather than rendering blank',
    /unavailable/.test(block));
}

// ── 4. IT FIRES ON A REAL STATE, AND NOT ON EVERY STATE ────────────────────
{
  const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const L = DATA.league;
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
  const keep = KEEP.keepersFrom(DATA);
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const fire = pick => {
    const t = new Set(byAdp.slice(0, pick - 1).map(p => String(p.player_id)));
    keep.forEach(k => t.add(String(k.player_id)));
    const board = pool.filter(p => !t.has(String(p.player_id)));
    const recs = E.recommend({ board, roster: keep, league: L, currentPick: pick,
      nextPick: pick + 13, totalPicks: 147, myPicksLeft: 8, roundsLeft: 8,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS })
      .filter(x => E.scoreable(x));
    const gap = recs[0].score - recs[1].score;
    return DC.contributions(recs[0], recs[1], gap).filter(c => c.decision_significant);
  };
  const picks = [34, 47, 54, 67, 74, 87, 94, 107, 114, 127];
  const fired = picks.filter(p => fire(p).length > 0).length;

  ck('the readout FIRES on a real board state', fired > 0, fired);
  /* IF IT FIRED EVERY TIME IT WOULD BE FURNITURE. A line that is always on is a
   * line nobody reads — the same defect as the always-printed CI warning. */
  ck('  and NOT on every pick, or it is furniture rather than a signal',
    fired < picks.length, { fired: fired, of: picks.length });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
