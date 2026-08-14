// TERRITORY: A
// THE GUARD THAT SAID "MUST NEVER BE PUBLISHED" RAN BEFORE THE THING IT GUARDED.
//
// `draft-data.yml` carried this, on a step at line 53:
//
//     # A board that fails its own scoring tests must never be published.
//     run: python -m pytest draft/tests -q
//
// It runs BEFORE `Build the draft artifact`. So it tested the board ALREADY
// COMMITTED, and then a new, untested one was built and pushed. The sentence
// was true of a step that could not enforce it.
//
// ── WHAT IT COST, MEASURED RATHER THAN IMAGINED ───────────────────────────
//
// 2026-08-14T09:16Z, `draft-bot`, an unattended GitHub Actions run: the rebuilt
// board carried `adp_sd_source` with no declared purpose, NINE suites failed on
// it, and it was pushed to main anyway. Every lane's `integrate.sh` then went
// red on somebody else's artifact. **No lane did it and no owner was watching**,
// which is the part that makes this worth a test rather than a fix.
//
// The board is the single input every draft-day surface reads. On 22 August an
// untested one ships to the room Cory is drafting in.
//
// ── WHY ORDER IS THE ASSERTION ────────────────────────────────────────────
//
// A post-build gate that gets moved back above the build later is the same
// defect returning with the same comment attached. So this pins the ORDER —
// build, then gate, then commit — not the presence of a step named "gate".
//
// Run: node draft/tests/board_publish_gate.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const WF = path.join(ROOT, '.github', 'workflows', 'draft-data.yml');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const src = fs.readFileSync(WF, 'utf8');
const at = re => { const m = src.match(re); return m ? m.index : -1; };

const build = at(/^\s+- name: Build the draft artifact/m);
const gate = at(/^\s+- name: Acceptance gate on the FRESH board/m);
const commit = at(/^\s+- name: Commit the artifact if it changed/m);

// ── 1. THE THREE STEPS EXIST ────────────────────────────────────────────
{
  ck('the workflow still builds an artifact', build > 0, build);
  ck('there is a gate on the FRESH board', gate > 0, gate);
  ck('and a commit step', commit > 0, commit);
}

// ── 2. THE ORDER, WHICH IS THE WHOLE POINT ──────────────────────────────
{
  ck('the gate runs AFTER the build — testing a board that does not exist yet '
    + 'is what the old step did', gate > build, { build: build, gate: gate });
  ck('and BEFORE the commit — a gate after the push guards nothing',
    gate < commit, { gate: gate, commit: commit });
  ck('so the sequence is build -> gate -> commit',
    build < gate && gate < commit, { build: build, gate: gate, commit: commit });
}

// ── 3. IT FAILS THE JOB RATHER THAN SKIPPING QUIETLY ────────────────────
// A rebuild that stops publishing is a visible red run. A rebuild that publishes
// a broken board is invisible until someone else's merge goes red — which is
// exactly how this was found, hours later, by an unrelated integration.
{
  const body = src.slice(gate, commit);
  ck('the gate runs the suite that reads the board', /pytest draft\/tests/.test(body));
  ck('and EXITS NON-ZERO on failure rather than continuing to the commit',
    /exit 1/.test(body), body.slice(0, 200));
  ck('it says the previously published board is untouched, so a red run is not '
    + 'mistaken for an outage', /previously published board is untouched/.test(body));
  ck('and it tells the reader not to bypass it, because the tempting fix at '
    + '08:00 is to get a rebuild out', /do NOT bypass/.test(body));
}

// ── 4. THE OLD CLAIM IS GONE FROM THE PRE-BUILD STEP ────────────────────
// The sentence was the defect: it described enforcement the step could not do,
// and it is exactly the kind of comment a reader trusts instead of checking.
{
  const pre = src.slice(0, build);
  /* ASSERT THE RETRACTION, NOT THE ABSENCE. My first version required the old
   * sentence to be GONE — and it matched my own QUOTATION of it in the comment
   * that retracts it. Deleting the history to satisfy a regex would have made
   * the file worse: the next reader needs to know the claim was there and why it
   * was false. So what must be true is that it is marked as retracted. */
  ck('the pre-build step no longer claims to gate publication — the old sentence '
    + 'survives only as a quoted, retracted claim',
  /DOES NOT GATE WHAT GETS PUBLISHED/.test(pre)
    && /its old comment claimed it/.test(pre), pre.slice(0, 120));
  ck('it is now labelled as running against the CURRENT board',
    /Run acceptance tests \(against the CURRENT board, pre-build\)/.test(pre));
  ck('and it is KEPT rather than deleted — failing fast on an already-broken '
    + 'board is still worth the two minutes', /pytest draft\/tests/.test(pre));
  ck('the reason it could not gate is recorded where the next reader will be, '
    + 'with the date it cost us', /2026-08-14/.test(pre) && /UNTESTED/.test(pre));

  /* ── AND IT MUST NOT FAIL THE JOB, WHICH IS THE OPPOSITE OF THE POST-BUILD
   *    GATE AND DELIBERATELY SO ──────────────────────────────────────────────
   *
   * Failing here stops the rebuild BECAUSE the committed board is broken — and a
   * rebuild is exactly what repairs a broken board. One red test on the current
   * artifact froze the pipeline that would replace it.
   *
   * Live on 2026-08-14: the 09:16Z run published a board carrying
   * `adp_sd_source` with no declared purpose, so from that moment this step
   * failed. The next scheduled run, 08:00Z on the 15th and six days before
   * keeper lock, would have died here without attempting a build — stale ADP
   * into a draft, caused by the guard rather than by the defect.
   *
   * The two steps are NOT redundant and must not be made symmetric: this one
   * reports, the post-build one enforces. */
  ck('the pre-build step is ADVISORY — it must not fail the job, or a broken '
    + 'board blocks its own repair', /continue-on-error: true/.test(pre),
  pre.slice(pre.indexOf('pre-build'), pre.indexOf('pre-build') + 200));
  ck('and it says WHY it is advisory, so the next reader does not "fix" it back '
    + 'into a deadlock', /blocks its own repair|blocking its own repair|block its own repair/i
    .test(pre.replace(/\s+/g, ' ')) || /a rebuild is exactly what repairs/.test(pre.replace(/\s+/g, ' ')));
  ck('CONTROL — the POST-build gate still fails the job, so this change did not '
    + 'quietly disarm publication protection',
  /exit 1/.test(src.slice(gate, commit))
    && !/continue-on-error/.test(src.slice(gate, commit)),
  src.slice(gate, commit).slice(0, 160));
}

// ── 5. THE WORKFLOW IS STILL VALID YAML-ISH ─────────────────────────────
// A broken workflow fails SILENTLY — the run simply never happens, which for a
// nightly board rebuild looks identical to "no changes today".
{
  ck('the gate is indented as a step of the same job as the commit',
    /\n      - name: Acceptance gate on the FRESH board/.test(src));
  const gateBody = src.slice(gate, commit);
  ck('and carries the same snapshot guard as the commit step, so a snapshot run '
    + 'is not gated on a board it never built',
  /if: github\.event\.inputs\.snapshot != 'true'/.test(gateBody),
  gateBody.slice(0, 160));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the board is tested AFTER it is built and BEFORE it is');
console.log('pushed, the job fails rather than publishing something the suite rejects, and');
console.log('the pre-build step no longer claims an enforcement it cannot perform. The');
console.log('ORDER is what is pinned, so moving the gate back above the build breaks this');
console.log('rather than silently restoring the defect.');
console.log('WHAT IT DOES NOT: make the board correct. It stops a board that fails its own');
console.log('suite from reaching the surfaces Cory drafts on, which is a different and');
console.log('smaller claim than "the board is right".');
