/* TERRITORY: A
 * `random_top25` — register 280 / P322's constructed null.
 *
 * WHAT IT IS FOR. `market_adp` beats `shipped` by reordering the engine's own
 * top-25. That single fact is consistent with two opposite diagnoses:
 *
 *   (a) ADP carries ordering information our score lacks  -> add an ADP prior
 *   (b) our fine-grained ordering INSIDE our own shortlist is worse than noise
 *
 * Uniform choice from the SAME slate separates them. If the coin also beats
 * shipped, (b) is live and an ADP prior is the wrong repair. That is Getty's
 * Test 3 — a decision scored against a constructed null — and it is worth
 * nothing if the coin is not actually a coin.
 *
 * ⚠️ WHICH IS EXACTLY HOW THIS NEARLY SHIPPED UNVERIFIED. The first probe of
 * this arm reported it landing on `recs[0]` 200 times out of 200 and never
 * refusing a missing seed — an INERT null, which would have graded (b) as
 * "no effect" no matter what was true. The arm was fine; the probe's fixture
 * had no `score`, so `candidates()` returned empty and the arm took its
 * nothing-to-choose-from early return. Two more fixture-field slips followed
 * (`adp` where `adpOf` reads `raw_adp`; and earlier the same day `roster_slots`
 * where the code reads `starters`). None was caught by reading the code.
 *
 * So the FIXTURE IS ITSELF CONTROLLED here: a known arm with a known answer runs
 * on the same recs first, and if that control does not produce the documented
 * result then nothing below is evidence about anything. Rule 3f.
 */
'use strict';
const AP = require('../tools/archetype_policy.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

/* 25 candidates. `score` is what `candidates()` filters on and `raw_adp` is what
 * `adpOf` reads — both spelled the way the CODE spells them, which is the whole
 * point of the control below. P0 is the engine's top rec; P24 has the lowest ADP. */
const recs = [];
for (let i = 0; i < 25; i++) {
  recs.push({ player: { player_id: 'p' + i, name: 'P' + i,
                        position: i % 3 ? 'RB' : 'WR', raw_adp: 100 - i },
              score: 100 - i });
}
const state = s => ({ round: 1, picksLeft: 12, posCounts: {}, pickSeed: s });

/* ── THE FIXTURE CONTROL, before any claim about the null ─────────────────── */
const mk = AP.choosePick('market_adp', recs, { round: 1, picksLeft: 12, posCounts: {} });
check('CONTROL: market_adp takes the lowest ADP (P24), so this fixture is valid',
  mk.player.name === 'P24',
  'got ' + mk.player.name + ' — the fixture does not reach the code path, and '
  + 'every assertion below is vacuous until it does');

/* ── it is deterministic ──────────────────────────────────────────────────── */
check('the same seed gives the same pick',
  AP.choosePick('random_top25', recs, state(12345))
  === AP.choosePick('random_top25', recs, state(12345)));

/* ── it is actually random — the arm that would have caught the inert probe ── */
const seen = new Set();
let atTop = 0;
const N = 400;
for (let s = 0; s < N; s++) {
  const p = AP.choosePick('random_top25', recs, state(s)).player.name;
  seen.add(p);
  if (p === 'P0') atTop++;
}
check('it reaches every candidate, not just the engine\'s favourite',
  seen.size === 25, 'only ' + seen.size + '/25 distinct picks over ' + N + ' seeds');

/* Uniform over 25 => p = 0.04, mean 16, sd sqrt(400*0.04*0.96) = 3.92.
 * A band of +/- 4 sd is [0, 32]; an INERT arm scores 400 and a broken one 0. */
check('it lands on recs[0] at the uniform rate, not always and not never',
  atTop > 0 && atTop <= 32,
  'recs[0] taken ' + atTop + '/' + N + ' (uniform expectation 16, band [1, 32]) — '
  + (atTop === N ? 'THIS IS THE INERT ARM: it is not choosing at all'
                 : 'far from uniform'));

/* ── it refuses rather than falling back to Math.random ───────────────────── */
let refused = false;
try { AP.choosePick('random_top25', recs, { round: 1, picksLeft: 12, posCounts: {} }); }
catch (e) { refused = /pickSeed/.test(e.message); }
check('a missing pickSeed REFUSES', refused,
  'a silent Math.random fallback makes the null irreproducible AND unpaired '
  + 'against the control — the two properties the whole paired design rests on');

/* ── the seed must not come from the room stream ──────────────────────────── */
check('the seed is a pure function of (room seed, pick number)',
  /pickSeed:\s*\(seed \* 2654435761 \+ overall\) >>> 0/.test(
    require('fs').readFileSync(__dirname + '/../tools/archetype_rooms.js', 'utf8')),
  'drawing the null\'s seed from the shared rng would consume from it and shift '
  + 'every later opponent pick, silently unpairing this arm from the control');

/* ── onesies stay out, same slate as market_adp ───────────────────────────── */
const withK = [{ player: { player_id: 'k', name: 'KICKER', position: 'K', raw_adp: 1 },
                 score: 999 }].concat(recs);
let kickers = 0;
for (let s = 0; s < N; s++) {
  if (AP.choosePick('random_top25', withK, state(s)).player.position === 'K') kickers++;
}
check('it never draws a kicker — it must reorder the SAME slate market_adp does',
  kickers === 0, kickers + '/' + N + ' picks were onesies');


/* ── THE RATE-MATCHED NULL (P324) ─────────────────────────────────────────────
 * `random_top25` answers "is ADP better than noise?", but it deviates from the
 * engine on ~8.4 picks a room against market_adp's ~6.2 — so its deficit mixes
 * "our ordering carries information" with "deviating costs something per se".
 * `random_rate_matched` removes the second by acting on EXACTLY the picks
 * market_adp acts on, and never taking recs[0] when it acts.
 *
 * Both halves of that sentence are load-bearing and both are testable, so both
 * are tested — on a case where market_adp AGREES with the engine (the arm must
 * stay silent) and one where it disagrees (the arm must act, and never land on
 * the engine's favourite). An arm that only ever gets the second case checked
 * would pass while deviating everywhere. */

function ladder(adpOf_) {
  const r = [];
  for (let i = 0; i < 25; i++) {
    r.push({ player: { player_id: 'p' + i, name: 'P' + i,
                       position: i % 3 ? 'RB' : 'WR', raw_adp: adpOf_(i) },
             score: 100 - i });
  }
  return r;
}

/* market_adp AGREES with the engine: P0 is both top-scored and lowest ADP. */
const agree = ladder(i => i);
check('CONTROL: market_adp takes P0 when it agrees with the engine',
  AP.choosePick('market_adp', agree, { round: 1, picksLeft: 12, posCounts: {} })
    .player.name === 'P0');

let actedWhenItShouldNot = 0;
for (let s = 0; s < 300; s++) {
  if (AP.choosePick('random_rate_matched', agree, state(s)).player.name !== 'P0') {
    actedWhenItShouldNot++;
  }
}
check('rate-matched stays SILENT wherever market_adp does not deviate',
  actedWhenItShouldNot === 0,
  'deviated ' + actedWhenItShouldNot + '/300 times where market_adp took the '
  + 'engine\'s own pick — the rate match is the whole arm, and this breaks it');

/* market_adp DISAGREES: P24 has the lowest ADP. */
const disagree = ladder(i => 100 - i);
check('CONTROL: market_adp takes P24 when it disagrees',
  AP.choosePick('market_adp', disagree, { round: 1, picksLeft: 12, posCounts: {} })
    .player.name === 'P24');

let tookTop = 0;
const rmSeen = new Set();
for (let s = 0; s < 300; s++) {
  const nm = AP.choosePick('random_rate_matched', disagree, state(s)).player.name;
  rmSeen.add(nm);
  if (nm === 'P0') tookTop++;
}
check('when it DOES act, rate-matched never returns the engine\'s favourite',
  tookTop === 0,
  'took recs[0] ' + tookTop + '/300 — that would re-introduce exactly the '
  + 'deviation-rate gap this arm exists to close');
check('and it spreads over the whole non-recs[0] slate',
  rmSeen.size === 24, 'only ' + rmSeen.size + '/24 distinct');

check('rate-matched is deterministic on a seed',
  AP.choosePick('random_rate_matched', disagree, state(7))
  === AP.choosePick('random_rate_matched', disagree, state(7)));

let rmRefused = false;
try { AP.choosePick('random_rate_matched', disagree, { round: 1, picksLeft: 12, posCounts: {} }); }
catch (e) { rmRefused = /pickSeed/.test(e.message); }
check('rate-matched refuses a missing pickSeed too', rmRefused);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
