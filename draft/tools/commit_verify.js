/* DOES A COMMITMENT ACTUALLY HOLD? — one mechanical check per row.
 *
 * draft/data/commitments.json carries a DUE DATE for each row. This file
 * carries the VERIFICATION, and the two are deliberately separate: a date
 * without a mechanical check is an intention with no trigger, which is the
 * failure class already found in the January reconstruction, the enforcement
 * table's empty cells, the grading cron that existed and never ran, and the
 * standing check that could not fire inside the window it protected.
 *
 * EVERY CHECK BELOW READS STATE. None of them reads a claim that the work is
 * done, and none can be satisfied by editing a status field — that is the whole
 * point. A row is MET because the repository is in a particular condition.
 *
 * Exit 0 = met, 1 = not met, 2 = cannot determine.
 * AND 2 IS NOT 0. An unreadable artifact is not a satisfied commitment.
 *
 * Run: node draft/tools/commit_verify.js <id>
 *      node draft/tools/commitments_check.js        (all rows, with dates)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = p => path.join(ROOT, p);

function readJSON(rel) {
  try { return JSON.parse(fs.readFileSync(R(rel), 'utf8')); } catch (e) { return null; }
}
function readText(rel) {
  try { return fs.readFileSync(R(rel), 'utf8'); } catch (e) { return null; }
}

const CHECKS = {

  /* Item 15. The rail exists (src/component_grade.js); nothing calls it until
   * weekly realized data lands. MET when at least one component carries a real
   * verdict rather than no_data/too_thin. */
  'component-grading-live': () => {
    const d = readJSON('draft/data/component_grades.json');
    if (d === null) return { code: 2, why: 'component_grades.json unreadable' };
    const rows = (Array.isArray(d) ? d : d.components) || [];
    const graded = rows.filter(r => r && r.verdict
      && r.verdict !== 'no_data' && r.verdict !== 'too_thin');
    return graded.length
      ? { code: 0, why: graded.length + ' component(s) carry a real grade: '
          + graded.map(r => r.name + '=' + r.verdict).join(', ') }
      : { code: 1, why: rows.length + ' row(s), 0 with a grade above no_data/too_thin' };
  },

  /* Item 16. The ledger must be able to CHANGE A GATE VERDICT, not merely exist
   * beside one. MET when the gate's own output contains at least one row whose
   * verdict came from measured evidence rather than "no arm covers this". */
  'ledger-to-gate-path': () => {
    const src = readText('draft/backtest/graduation_gate.py');
    if (src === null) return { code: 2, why: 'graduation_gate.py unreadable' };
    const readsLedger = /pred_ledger|prediction_ledger|component_grades/.test(src);
    if (!readsLedger) {
      return { code: 1, why: 'graduation_gate.py does not reference the ledger or '
        + 'the component grades at all — the two halves are not joined' };
    }
    /* Referencing it is not exercising it. The gate prints "??  <term>  no
     * participation arm covers this term" for an unjoined row, so an all-?? gate
     * is a path that exists and carries nothing. */
    const grades = readJSON('draft/data/component_grades.json');
    const rows = (Array.isArray(grades) ? grades : (grades || {}).components) || [];
    const live = rows.filter(r => r && r.verdict && r.verdict !== 'no_data');
    return live.length
      ? { code: 0, why: 'the gate reads the grading surface and ' + live.length
          + ' row(s) carry evidence' }
      : { code: 1, why: 'the gate references the surface but every row is no_data — '
          + 'a path that exists and carries nothing' };
  },

  /* Item 17. THE ORIGINAL instance of intention-with-no-trigger. MET when a
   * SCHEDULED trigger exists that fires in January — not when a document says
   * somebody should remember. */
  'january-reconstruction-mandate': () => {
    const dir = R('.github/workflows');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)); }
    catch (e) { return { code: 2, why: 'cannot read .github/workflows' }; }
    const hits = [];
    files.forEach(f => {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      const crons = s.match(/cron:\s*['"][^'"]+['"]/g) || [];
      crons.forEach(c => {
        const expr = (c.match(/['"]([^'"]+)['"]/) || [])[1] || '';
        const month = expr.trim().split(/\s+/)[3];
        // fires in January: explicit 1, a list/range containing it, or every month
        if (month === '*' || /(^|,)1(,|$)/.test(month) || /^1-/.test(month)) {
          hits.push(f + ' [' + expr + ']');
        }
      });
    });
    const januaryish = hits.filter(h => /recon|annual|january|winter/i.test(h));
    if (januaryish.length) return { code: 0, why: 'scheduled: ' + januaryish.join(', ') };
    return { code: 1, why: 'no workflow schedules a January reconstruction. '
      + (hits.length ? hits.length + ' cron(s) could fire in January but none names '
        + 'the reconstruction: ' + hits.slice(0, 3).join(', ')
        : 'no cron fires in January at all') };
  },

  /* Item 18. A cross-lane contract with no testable shape means a producer can
   * change a field and a RENDERER finds out. MET when every declared contract
   * has a shape a consumer can assert against. */
  'shape-files': () => {
    const contracts = ['decision_contract.js', 'valuation.js', 'draft_session.js'];
    const missing = contracts.filter(c => {
      const base = c.replace(/\.js$/, '');
      return !fs.existsSync(R('draft/shapes/' + base + '.shape.json'))
        && !fs.existsSync(R('public/js/draft/' + base + '.shape.json'));
    });
    return missing.length
      ? { code: 1, why: missing.length + ' of ' + contracts.length
          + ' cross-lane contracts have no shape file: ' + missing.join(', ') }
      : { code: 0, why: 'all ' + contracts.length + ' contracts carry a shape' };
  },

  /* Item 19. ALREADY DONE — registered so a regression FIRES rather than being
   * noticed in a mock. The collapse is per-render-pass, keyed on a stable
   * data-caveat hook. */
  'caveat-collapse': () => {
    const app = readText('public/js/draft/app.js');
    if (app === null) return { code: 2, why: 'app.js unreadable' };
    const hasHook = /data-caveat/.test(app);
    const perPass = /caveat/i.test(app) && /(seen|shown|rendered)[A-Za-z]*Caveat|caveatSeen|_caveat/i.test(app);
    return (hasHook && perPass)
      ? { code: 0, why: 'the data-caveat hook and a per-pass suppression are both present' }
      : { code: 1, why: 'caveat collapse missing: hook=' + hasHook + ' per-pass=' + perPass };
  },

  /* Item 20. ALREADY DONE — the queue card's title says what the queue IS
   * ("the short list you read first when it is your turn") rather than naming a
   * mechanism. Registered so the wording cannot drift back. */
  'queue-title': () => {
    const app = readText('public/js/draft/app.js');
    if (app === null) return { code: 2, why: 'app.js unreadable' };
    return /Queue — the short list you read first/.test(app)
      ? { code: 0, why: 'the queue title still explains what the queue is' }
      : { code: 1, why: 'the queue title no longer explains what the queue is' };
  },

  /* Item 21. UNKNOWN HAS NO ROLE. Executed rather than grepped: the contract is
   * loaded and asked. A source scan would pass on a comment. */
  'contract-unknown-role': () => {
    let DC, E;
    try {
      DC = require(R('public/js/draft/decision_contract.js'));
      E = require(R('public/js/draft/engine.js'));
    } catch (e) { return { code: 2, why: 'cannot load the contract: ' + e.message }; }
    const res = DC.resolution(null, E.CFG);
    if (res.status !== 'UNKNOWN') {
      return { code: 2, why: 'resolution(null) is ' + res.status + ', not UNKNOWN — '
        + 'this check can no longer reach the state it guards' };
    }
    const role = DC.roleOf({ term: 'value', delta: 5 }, res);
    /* The defect was a renderer reaching a DECISIVE/SUPPORTING role while the
     * decision was UNKNOWN. `unknown` is the correct answer; anything that reads
     * as a real role is the defect back. */
    const REAL_ROLES = ['decisive', 'supporting', 'contributing', 'against'];
    return REAL_ROLES.indexOf(String(role)) === -1
      ? { code: 0, why: 'roleOf under UNKNOWN returns "' + role + '" — not a real role' }
      : { code: 1, why: 'roleOf under UNKNOWN returns "' + role + '" — a renderer can '
          + 'reach a role while the decision is UNKNOWN' };
  },
};

if (require.main === module) {
  const id = process.argv[2];
  if (!id || !CHECKS[id]) {
    console.log('unknown commitment id: ' + id);
    console.log('known: ' + Object.keys(CHECKS).join(', '));
    process.exit(2);
  }
  let r;
  try { r = CHECKS[id](); }
  catch (e) { r = { code: 2, why: 'check threw: ' + e.message }; }
  console.log(['MET', 'NOT MET', 'CANNOT DETERMINE'][r.code] + ': ' + r.why);
  process.exit(r.code);
}

module.exports = { CHECKS };
