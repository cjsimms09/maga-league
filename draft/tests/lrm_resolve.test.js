// TERRITORY: A
// THE LRM DEADLINE IS NOW GRADED. It was captured and graded by nothing.
//
// "Startable QB safe until pick 73" is the most actionable claim on the war
// room, and the only one answered ENTIRELY INSIDE THE DRAFT: pick 73 settles it
// and nothing afterwards can. It has been written to the ledger since
// decision-capture went in (`PredLedger.lrm`, method `survival-snapshot-v0`) and
// read by no grader — one of four open loops, and the only one that would have
// produced a full set of claims on 22 August with no record of whether any held.
// After the draft that evidence is not recoverable, which is the same shape as
// the in-season capture gap.
//
// ── A HIT RATE, NOT A BRIER SCORE ─────────────────────────────────────────
//
// `resolveSurvival` scores probabilities, so Brier belongs there. An LRM call is
// a DEADLINE produced by thresholding a probability at 0.85 — the only number it
// commits to is the threshold. So the honest grade is: of the calls that said
// "safe until N", how often was somebody from that pool still there at N? That
// rate belongs beside 0.85, and a gap is calibration evidence, not a bug.
//
// ── THE CLAIM IS ABOUT THE POOL ───────────────────────────────────────────
//
// The strip says a startable option survives and names one only so the reader
// can check it. Grading the NAMED man would score a harder claim than the one
// made, so the capture carries the pool ids and a capture without them is
// skipped rather than downgraded to the target.
//
// Run: node draft/tests/lrm_resolve.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const LEDGER = fs.readFileSync(path.join(ROOT, 'src', 'predledger.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const cap = (pick, rows) => ({ pick: pick, payload: { last_responsible_moment: rows } });
const pk = (overall, id) => ({ overall: overall, player_id: id });

// ── 1. THE THRESHOLD IS ONE CONSTANT ────────────────────────────────────
{
  ck('the survival model publishes the "safe" threshold the strip commits to',
    S.CFG.LRM_SAFE_P === 0.85, S.CFG.LRM_SAFE_P);
  ck('and the STRIP reads it rather than carrying its own copy — the claim and '
    + 'its grade cannot drift apart if there is only one number',
  /E\.survivalModel\.CFG\.LRM_SAFE_P/.test(APP));
  ck('FAIL ARM — the bare 0.85 is gone from the threshold test',
    !/survival\(pool\[j\], upcoming\[i\], ctx\) >= 0\.85/.test(APP));
  ck('the resolver reports that same number beside the outcome, so the '
    + 'comparison is the reader\'s and not a verdict baked in',
  S.resolveLrm([], { picks: [] }).implied === S.CFG.LRM_SAFE_P);
}

// ── 2. HIT AND MISS, ON THE POOL ────────────────────────────────────────
{
  const caps = [cap(33, [
    { position: 'QB', startable_by: 73, startable_pool_ids: ['q1', 'q2', 'q3'],
      elite_by: 53, elite_pool_ids: ['q1'] },
    { position: 'TE', startable_by: 53, startable_pool_ids: ['t1', 't2'],
      elite_by: null, elite_pool_ids: ['t1'] },
  ])];
  // q1 gone at 40, q2 at 50, q3 survives. t1 at 41, t2 at 44 — TE pool emptied.
  const picks = [pk(40, 'q1'), pk(50, 'q2'), pk(41, 't1'), pk(44, 't2'), pk(80, 'z')];
  const r = S.resolveLrm(caps, { picks: picks });

  ck('a pool with a survivor at the deadline is a HIT',
    r.rows.some(x => x.position === 'QB' && x.band === 'startable' && x.hit === true),
    r.rows);
  ck('a pool emptied before the deadline is a MISS',
    r.rows.some(x => x.position === 'TE' && x.band === 'startable' && x.hit === false));
  ck('the elite band is graded SEPARATELY from startable — they are two claims '
    + 'and the audit found them diverging',
  r.by_band.length === 2 && r.by_band.every(b => b.n >= 1), r.by_band);
  ck('the hit rate is over the graded calls only', r.n === 3 && r.hits === 1
    && Math.abs(r.hit_rate - 1 / 3) < 1e-9, { n: r.n, hits: r.hits });
  ck('and the calibration gap is signed against the implied threshold',
    Math.abs(r.calibration_gap - (1 / 3 - 0.85)) < 1e-9, r.calibration_gap);
}

// ── 3. THE NULL DEADLINE — A BUG I WROTE AND CAUGHT ─────────────────────
/* `Number(null)` is 0 and `isFinite(0)` is true, so the first version graded a
 * NULL deadline as a deadline of pick 0 — which every pool trivially survives,
 * scoring a free HIT. Measured: a TE row with `elite_by: null` came back
 * "by 0 · HIT". A null there is not a deadline; it is the strip saying "elite
 * tier gone, there is no safe moment left" — a different claim, and counting it
 * as satisfied would inflate the hit rate exactly where the model admitted it
 * had nothing to offer. */
{
  const caps = [cap(33, [{ position: 'TE', startable_by: null,
    startable_pool_ids: ['t1'], elite_by: null, elite_pool_ids: ['t1'] }])];
  const r = S.resolveLrm(caps, { picks: [pk(80, 'z')] });
  ck('a null deadline scores NOTHING — not a free hit at pick 0',
    r.n === 0 && r.hits === 0, { n: r.n, hits: r.hits });
  ck('but it is COUNTED, so "no safe moment left" is visible rather than '
    + 'vanishing from the denominator', r.no_deadline.length === 2, r.no_deadline);
  ck('FAIL ARM — no graded row carries a by_pick of 0, which is what the bug '
    + 'produced', r.rows.every(x => x.by_pick > 0), r.rows);
}

// ── 4. IT REFUSES RATHER THAN GUESSING ──────────────────────────────────
{
  const rows = [{ position: 'QB', startable_by: 73, startable_target: 'Somebody' }];
  const r = S.resolveLrm([cap(33, rows)], { picks: [pk(80, 'z')] });
  ck('a capture with no pool ids is SKIPPED, not silently downgraded to grading '
    + 'the named target — that would score a harder claim than the one made',
  r.n === 0 && r.resolvable === false, r);

  const early = S.resolveLrm([cap(33, [{ position: 'QB', startable_by: 73,
    startable_pool_ids: ['q1'] }])], { picks: [pk(40, 'q1')] });
  ck('a deadline the draft has not reached is not graded — 40 < 73 says nothing '
    + 'about pick 73', early.n === 0, early);
  ck('and `hit_rate` is NULL rather than 0 when nothing resolved — a null is not '
    + 'a score', early.hit_rate === null && early.resolvable === false, early);
  ck('empty input never throws', S.resolveLrm(null, null).n === 0);
}

// ── 5. THE BOUNDARY, SAME AS resolveSurvival AND FOR THE SAME REASON ────
/* `by_pick` is one of CORY'S OWN picks. A pool member taken AT it was taken BY
 * HIM — the call coming true. Scoring that as a miss would punish the model on
 * exactly the calls it got right, which is the bias resolveSurvival was fixed
 * for; the same trap is one character wide here. */
{
  const caps = [cap(33, [{ position: 'QB', startable_by: 73,
    startable_pool_ids: ['q1'] }])];
  const takenAtDeadline = S.resolveLrm(caps, { picks: [pk(73, 'q1'), pk(80, 'z')] });
  ck('a pool member taken AT the deadline still counts as having survived TO it '
    + '— that is Cory drafting him', takenAtDeadline.rows[0].hit === true,
  takenAtDeadline.rows);
  const takenBefore = S.resolveLrm(caps, { picks: [pk(72, 'q1'), pk(80, 'z')] });
  ck('CONTROL — taken one pick EARLIER is a genuine miss, so the clause above is '
    + 'a boundary and not a blanket pass', takenBefore.rows[0].hit === false);
}

// ── 6. THE LOOP IS ACTUALLY CLOSED, NOT JUST WRITTEN ────────────────────
{
  ck('the resolution kind is DECLARED — an undeclared kind is rejected by '
    + 'buildEntry, so the loop would read closed in code and be empty in data',
  /'lrm_resolved'/.test(LEDGER));
  ck('the app REMEMBERS the capture, which is the only place holding both the '
    + 'call and the pick stream', /state\.lrmCaptures/.test(APP));
  ck('and it is deduped per pick — a re-render inside one pick is the same call',
    /state\.lrmCaptures\.some\(/.test(APP));
  ck('the resolver is CALLED from the pick sync, not merely defined',
    /resolveLrmCalls\(picks\);/.test(APP));
  ck('mock drafts are excluded — a rehearsal is not forward evidence',
    /function resolveLrmCalls[\s\S]{0,200}state\.mockMode/.test(APP));
  ck('a capture is spent only when EVERY deadline in it has been reached, so one '
    + 'early resolution cannot discard the positions still pending',
  /pending[\s\S]{0,120}c\._resolved = true;/.test(APP));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the LRM deadline is captured, graded against the same');
console.log('0.85 the strip thresholds on, and scored on the POOL the claim was about — with');
console.log('a null deadline counted separately rather than banked as a free hit, and the');
console.log('at-the-deadline boundary set so Cory drafting the man is not a miss.');
console.log('WHAT IT DOES NOT: say whether 0.85 is the right threshold, or whether "safe" is');
console.log('the right word for it. It makes the question answerable from a real draft, which');
console.log('it was not before — and one draft will not answer it either.');
