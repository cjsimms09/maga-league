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
  /* THE PICK SCHEDULE IS ASSUMED UNTIL THE SLATE SAYS OTHERWISE.
   *
   * Two schedules were used this week and they disagree -- "12 picks from 34"
   * and the slot-8 snake 33/48/53 -- producing different rosters (TE 1 vs TE 2).
   * A one-pick offset moved the constructed roster more than a 30-point shift in
   * RB replacement did, so every construction result is conditional on a fact
   * nobody has.
   *
   * MET means a schedule file exists, names its SOURCE as the confirmed slate
   * rather than an assumption, and carries a confirmation timestamp. It cannot be
   * satisfied by writing down a guess: `source` must not be "assumed", and the
   * pick list must be non-empty. Deliberately NOT satisfied by "somebody re-ran
   * it" -- the artifact is what a later reader can check. */
  'schedule-rerun-on-slate': () => {
    const raw = readText('draft/data/pick_schedule.json');
    if (raw === null) {
      return { code: 1, why: 'no draft/data/pick_schedule.json — the schedule is '
        + 'still assumed, and two mutually exclusive assumptions are in use' };
    }
    let doc;
    try { doc = JSON.parse(raw); } catch (e) {
      return { code: 2, why: 'pick_schedule.json is not JSON: ' + e.message };
    }
    const picks = Array.isArray(doc.picks) ? doc.picks : null;
    const src = String(doc.source || 'assumed');
    if (!picks || !picks.length) {
      return { code: 1, why: 'pick_schedule.json carries no picks' };
    }
    if (/assumed|guess|derived/i.test(src)) {
      return { code: 1, why: 'the schedule is present but its source is "' + src
        + '" — an assumption written down is still an assumption' };
    }
    if (!doc.confirmed_at) {
      return { code: 1, why: 'the schedule names a real source but carries no '
        + 'confirmed_at, so nobody can tell when it stopped being a guess' };
    }
    return { code: 0, why: picks.length + ' picks from source "' + src
      + '", confirmed ' + doc.confirmed_at };
  },

  /* THE REFUSAL OF 1181 PLAYERS IS A DECISION, AND AN UNGRADED ONE.
   * MET requires a grading artifact that joins the snapshot to realized points.
   * A snapshot alone is NOT enough -- capturing the list is the cheap half, and
   * a commitment satisfied by the easy half is the shape this file exists to
   * prevent. */
  'grade-the-unprojected': () => {
    const snap = readText('draft/data/unprojected_snapshot.json');
    if (snap === null) {
      return { code: 1, why: 'no snapshot — the list was never captured, and it '
        + 'cannot be reconstructed once the projections update' };
    }
    let doc;
    try { doc = JSON.parse(snap); } catch (e) {
      return { code: 2, why: 'snapshot is not JSON: ' + e.message };
    }
    if (!Array.isArray(doc.players) || !doc.players.length) {
      return { code: 1, why: 'snapshot carries no players' };
    }
    const graded = readText('draft/data/unprojected_graded.json');
    if (graded === null) {
      return { code: 1, why: doc.players.length + ' players captured (board '
        + String(doc.board_sha256 || '').slice(0, 12) + '), NOT YET GRADED — no '
        + 'draft/data/unprojected_graded.json joining them to realized points' };
    }
    let g;
    try { g = JSON.parse(graded); } catch (e) {
      return { code: 2, why: 'grading file is not JSON: ' + e.message };
    }
    if (g.top24_count == null || !Array.isArray(g.rows) || !g.rows.length) {
      return { code: 1, why: 'grading file exists but carries no counted result '
        + '(needs top24_count and a non-empty rows array)' };
    }
    return { code: 0, why: g.rows.length + ' of ' + doc.players.length
      + ' graded; ' + g.top24_count + ' finished top-24 at their position' };
  },

  /* MET requires the tool AND a suite that proves it can fire. A detector nobody
   * has seen fire is the failure class this whole program exists to catch, and a
   * report-only tool is especially easy to ship inert. */
  'constant-spike-detector': () => {
    const tool = readText('draft/tools/constant_spike.js');
    if (tool === null) return { code: 1, why: 'draft/tools/constant_spike.js does not exist' };
    if (!/ratio/i.test(tool) || !/spike/i.test(tool)) {
      return { code: 1, why: 'the tool exists but does not implement BOTH arms '
        + '(value spike and ratio lock) — the ratio arm is the one that would have '
        + 'caught proj_ceiling = 1.35 * proj_mean' };
    }
    const suite = readText('draft/tests/constant_spike.test.js');
    if (suite === null) {
      return { code: 1, why: 'no suite — a report-only detector that nobody has '
        + 'watched fire is indistinguishable from one that reports nothing' };
    }
    return { code: 0, why: 'detector and suite both present' };
  },

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

  /* Item 32, BUILD half. The claim surface is rejected; the CALLER is a dated
   * commitment. MET when something scheduled actually invokes analyzerClaims —
   * a rail with no caller is rule 14 on a weekly cadence. */
  'analyzer-claims-caller': () => {
    const dir = R('.github/workflows');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)); }
    catch (e) { return { code: 2, why: 'cannot read .github/workflows' }; }
    const callers = files.filter(f => /analyzerClaims|analyzer_claims|analyzer-claims/
      .test(fs.readFileSync(path.join(dir, f), 'utf8')));
    if (!callers.length) {
      return { code: 1, why: 'no workflow invokes analyzerClaims — the rail has no caller' };
    }
    const scheduled = callers.filter(f =>
      /cron:/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    return scheduled.length
      ? { code: 0, why: 'scheduled caller(s): ' + scheduled.join(', ') }
      : { code: 1, why: 'analyzerClaims is invoked by ' + callers.join(', ')
          + ' but none of them is scheduled — a caller that only runs when somebody '
          + 'pushes is not a weekly caller' };
  },

  /* THE ONE NUMBER A TEST FILE ASKED SOMEBODY TO RE-CHECK, WITH NOBODY NAMED.
   *
   * `draft/tests/withheld_slate_exposure.test.js` closes with: *"It also uses
   * the PREDICTED slate — the real one locks 20 August, and the one number to
   * re-check then is whether any keeper ranks deeper than pick 33."*
   *
   * That is a correct, bounded, exactly-stated follow-up sitting in a comment.
   * The suite it lives in is 23/23 green and will stay 23/23 green whether or
   * not anybody ever performs the re-check, because the test measures the
   * PREDICTED slate — which is the right thing for it to measure and the reason
   * it cannot be the trigger. A finding whose follow-up depends on a person
   * remembering a date is the shape this whole file exists to remove.
   *
   * WHAT THIS READS, AND WHY IT IS STATE RATHER THAN A CLAIM. The live board
   * stamps its own slate condition (`keeper_slate`), built from Sleeper
   * designations plus real draft placements — nothing here can be satisfied by
   * editing a status. MET requires the board to be standing on the CONFIRMED
   * slate with nothing withheld, and then reports the exposure number itself.
   *
   * WHY IT WILL SHOUT, AND WHY THAT IS NOT CRYING WOLF. Until the lock this
   * returns NOT MET, which is `pending` and not a failure. It becomes OVERDUE
   * the day after the due date — once, about the single condition that decides
   * whether the board Cory drafts from contains players nobody can draft. */
  'slate-exposure-rechecked': () => {
    /* THE BOARD PATH IS OVERRIDABLE FOR THE SAME REASON `--today` AND
     * `COMMITMENTS_PATH` ARE, and this file's own header gives the argument: a
     * check whose firing condition cannot be exercised is a check nobody has
     * seen fire. Every interesting branch of this one lives on the far side of
     * a keeper lock that has not happened, so without a way to point it at a
     * fixture the MET path would ship unproven and first run for real on draft
     * morning. Default completely unchanged, and asserted unchanged by the
     * test. */
    const rel = process.env.DRAFT_DATA_PATH || 'public/draft_data.json';
    const b = process.env.DRAFT_DATA_PATH
      ? (() => { try { return JSON.parse(fs.readFileSync(rel, 'utf8')); }
        catch (e) { return null; } })()
      : readJSON(rel);
    if (!b) return { code: 2, why: 'cannot read ' + rel };
    const s = b.keeper_slate;
    if (!s) {
      return { code: 2, why: 'the board carries no keeper_slate block — the '
        + 'condition cannot be read at all, which is not the same as unmet' };
    }
    const withheld = (s.withheld_from_board || {});
    if (!s.confirmed || s.status !== 'confirmed') {
      return { code: 1, why: 'the board is standing on a "' + s.status + '" slate — '
        + (s.teams_designated == null ? '' : s.teams_designated + '/' + s.teams_expected
          + ' team(s) designated, ')
        + (withheld.keepers || 0) + ' keeper(s) across ' + (withheld.teams || 0)
        + ' team(s) deliberately withheld. Until this confirms, the exposure number '
        + 'is a prediction and the board carries players other teams may keep' };
    }
    if (withheld.withheld) {
      return { code: 1, why: 'the slate reads confirmed but ' + (withheld.keepers || 0)
        + ' keeper(s) are still withheld from the board — those two cannot both be '
        + 'right, and the board is the one Cory drafts from' };
    }
    /* CONFIRMED. Now answer the actual question the test file asked: is any real
     * keeper ranked DEEPER than my first pick? Each one that is frees exactly one
     * player at the boundary, so the exposure is a count, not an opinion. */
    const mine = ((b.pick_order || {}).my_picks || []);
    const firstPick = mine.length ? Number(mine[0]) : null;
    if (!firstPick) {
      return { code: 2, why: 'the slate is confirmed but the board carries no '
        + 'my_picks, so "deeper than my first pick" has no referent' };
    }
    const adpOf = p => Number(p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : p.adp));
    const keepers = (b.kept_players || []).filter(p => Number.isFinite(adpOf(p)));
    if (!keepers.length) {
      return { code: 2, why: 'the slate is confirmed but no kept_players carry an '
        + 'ADP, so the exposure cannot be counted' };
    }
    const deep = keepers.filter(p => adpOf(p) > firstPick - 1);
    return { code: 0, why: keepers.length + ' confirmed keeper(s) on a full slate; '
      + deep.length + ' rank deeper than my first pick (' + firstPick + ')'
      + (deep.length
        ? ' — ' + deep.map(p => p.name + ' @' + Math.round(adpOf(p))).join(', ')
          + '. Each frees one player at the boundary versus the ADP-window model.'
        : ', so the ADP window and the real removals coincide, as the study predicted.') };
  },
  /* THE SWEEP CORY ASKED FOR, WITH A DATE AND A MECHANICAL TEST.
   *
   * "can we get rid of the moot tasks now then?" (2026-08-18). The 101 already
   * TICKED pre-08-17 items moved to the archive that day. These are the other
   * half — OPEN and old — and they were NOT swept on the relay's judgement,
   * because burying live work is worse than a long file. Each lane got the list
   * and a stated default: archived 08-25 unless they say otherwise.
   *
   * MET is a property of the file, not a claim that the sweep happened. */
  'routes-old-open-swept': () => {
    const txt = readText('ROUTES.md');
    if (txt === null) return { code: 2, why: 'cannot read ROUTES.md' };
    const ITEM = /^- \[( |x)\] (\d{4}-\d{2}-\d{2}) ·/;
    let old = 0, total = 0;
    txt.split('\n').forEach(l => {
      const m = ITEM.exec(l);
      if (!m) return;
      total++;
      if (m[1] === ' ' && m[2] < '2026-08-17') old++;
    });
    if (!total) return { code: 2, why: 'no ROUTES items parsed — the row shape changed' };
    return old
      ? { code: 1, why: old + ' item(s) of ' + total + ' are still OPEN and older than '
          + '2026-08-17. Tick them, annotate them as live, or archive them.' }
      : { code: 0, why: 'no open item older than 2026-08-17 remains, across ' + total + ' items' };
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
