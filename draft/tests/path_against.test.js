// TERRITORY: A
// A ROUTE WITH ONLY A "FOR" IS ADVOCACY, NOT A CHOICE.
//
// Cory asked for routes contrasted "for and against and why". The engine emits
// six `when_right` strings and no counterweight, so the panel read as six
// recommendations rather than one decision.
//
// `pathAgainst` is built in app.js from what computePaths ALREADY returns —
// price, the branch rows, mechanism, fills, coin_flip_with — so it needed no
// edit to a scoring-path file nine days from a draft. This checks the objection
// it produces is real: derived from the route's own numbers, specific to its
// mechanism, and honest about the seat.
//
// THE ONE THAT MATTERS MOST is the seat objection. If a route fills a slot the
// plan does not want at this pick, that is a measured objection rather than a
// hedge — and it is what makes the panel agree with the model instead of arguing
// with it on the same screen.
//
// Run: node draft/tests/path_against.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// Extract the SHIPPED function, not a copy — a re-implementation here would
// agree with itself forever.
function extract(sig) {
  const start = SRC.indexOf(sig);
  if (start < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', start); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(start, i + 1); }
  }
  return '';
}
const againstSrc = extract('  function pathAgainst(p) {');
ck('pathAgainst exists in the shipped app.js', againstSrc.length > 100);
if (!againstSrc) { console.log('\nFAILED'); process.exit(1); }

function makeAgainst(seat, pick) {
  const state = { seatPlan: seat ? { seats: [seat] } : null };
  const pickCoordinate = () => ({ current: pick });
  const seatForCurrentPick = () => seat;
  // eslint-disable-next-line no-new-func
  return new Function('state', 'pickCoordinate', 'seatForCurrentPick',
    againstSrc + '; return pathAgainst;')(state, pickCoordinate, seatForCurrentPick);
}

const TE_SEAT = { pick: 13, slot: 'TE', is_starter_seat: true };
const FLEX_SEAT = { pick: 8, slot: 'FLEX', is_starter_seat: true };
const BENCH_SEAT = { pick: 48, slot: 'BENCH', is_starter_seat: false };
const P = (o) => Object.assign({ position: 'WR', price: 0, mechanism: 'value',
  fills: 'starter', plan: [], coin_flip_with: null }, o);

// ── 1. THE SEAT OBJECTION ─────────────────────────────────────────────────
{
  const ag = makeAgainst(TE_SEAT, 13);
  const wrong = ag(P({ position: 'WR' }));
  ck('a route that fills the WRONG position says the plan wants the seat',
    wrong.some(x => /plan wants TE/.test(x)), wrong);
  const right = ag(P({ position: 'TE' }));
  ck('and a route that fills the RIGHT seat does NOT raise that objection',
    !right.some(x => /plan wants/.test(x)), right);
  // FLEX is satisfiable three ways — objecting there would be a false positive
  // on every legal flex fill.
  const flexAg = makeAgainst(FLEX_SEAT, 8);
  ck('a FLEX seat accepts RB, WR and TE without a seat objection',
    ['RB', 'WR', 'TE'].every(pos => !flexAg(P({ position: pos })).some(x => /plan wants/.test(x))));
  ck('and a FLEX seat DOES object to a quarterback',
    flexAg(P({ position: 'QB' })).some(x => /plan wants FLEX/.test(x)));
  // A bench seat asserts nothing, so it must not manufacture an objection.
  const benchAg = makeAgainst(BENCH_SEAT, 48);
  ck('a BENCH row raises no seat objection at all',
    !benchAg(P({ position: 'QB' })).some(x => /plan wants/.test(x)));
  // And with no plan loaded it must degrade silently, not crash or invent.
  const noPlan = makeAgainst(null, 8);
  ck('with no seat plan loaded it still returns objections and none about seats',
    Array.isArray(noPlan(P({ mechanism: 'value' })))
    && !noPlan(P({})).some(x => /plan wants/.test(x)));
}

// ── 2. THE PRICE OBJECTION IS ONLY RAISED WHEN THERE IS A PRICE ──────────
{
  const ag = makeAgainst(null, 8);
  ck('a route priced BELOW the top says so', ag(P({ price: 4.2 })).some(x => /4.2 below/.test(x)));
  ck('the top-priced route does NOT claim to cost 0',
    !ag(P({ price: 0 })).some(x => /below the top/.test(x)));
}

// ── 3. THE MECHANISM OBJECTION IS THE NEGATION OF ITS OWN "FOR" ──────────
// A disclaimer would say the same thing on every card; a contrast says what
// has to be TRUE for THIS route to be wrong.
{
  const ag = makeAgainst(null, 8);
  const byMech = {
    scarcity: ag(P({ mechanism: 'scarcity' })),
    need: ag(P({ mechanism: 'need', plan: [{ loss: 2 }] })),
    flex: ag(P({ mechanism: 'flex' })),
    value: ag(P({ mechanism: 'value' })),
  };
  ck('scarcity is challenged on the cliff not arriving',
    byMech.scarcity.some(x => /cliff never arrives/.test(x)));
  ck('need is challenged with the MEASURED wait cost when it is small',
    byMech.need.some(x => /waiting costs only ~2/.test(x)));
  ck('flex is challenged on replaceability', byMech.flex.some(x => /replaceable/.test(x)));
  ck('value is challenged on having no seat behind it',
    byMech.value.some(x => /bench player/.test(x)));
  const texts = Object.keys(byMech).map(k => byMech[k].join('|'));
  ck('the four mechanisms produce FOUR DIFFERENT objections, not one disclaimer',
    new Set(texts).size === 4, texts.map(t => t.slice(0, 40)));
  // A large wait cost must flip the need objection, or the number is decoration.
  const bigWait = ag(P({ mechanism: 'need', plan: [{ loss: 30 }] }));
  ck('a LARGE wait cost changes the need objection rather than reprinting it',
    !bigWait.some(x => /waiting costs only/.test(x)), bigWait);
}

// ── 4. COIN FLIP AND BENCH ───────────────────────────────────────────────
{
  const ag = makeAgainst(null, 8);
  ck('a flagged coin flip is stated as one the model CANNOT separate',
    ag(P({ coin_flip_with: 'RB:value' })).some(x => /cannot separate/.test(x)));
  ck('a bench fill says plainly that it does not start today',
    ag(P({ fills: 'bench' })).some(x => /does not start for you today/.test(x)));
  ck('a starter fill does NOT say that', !ag(P({ fills: 'starter' })).some(x => /does not start/.test(x)));
}

// ── 5. IT IS WIRED INTO THE CARD, not merely defined ────────────────────
ck('the path card renders an AGAINST block', /class="path-against"/.test(SRC));
ck('and labels the existing case FOR, so the contrast is legible',
  /class="path-lbl">FOR</.test(SRC));

// ── 6. FAIL ARM ─────────────────────────────────────────────────────────
{
  const ag = makeAgainst(TE_SEAT, 13);
  ck('FAIL ARM — the seat objection is absent when it should be, present when it should be',
    ag(P({ position: 'TE' })).filter(x => /plan wants/.test(x)).length === 0
    && ag(P({ position: 'QB' })).filter(x => /plan wants/.test(x)).length === 1);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every route carries an objection derived from its own');
console.log('numbers — the seat it does or does not fill, what it prices below the top,');
console.log('the mechanism-specific thing that must be true for it to be wrong.');
console.log('WHAT IT DOES NOT: judge whether the objection is PERSUASIVE. It checks that a');
console.log('contrast exists and is specific, not that the reasoning is sound.');
