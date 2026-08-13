// TERRITORY: A
// THE LIVE BOARD CARRIES ONLY CORY'S KEEPERS. WHAT DOES THAT COST HIM?
//
// Cory, 2026-08-13: "Some people have a 1st round pick some don't." True, and
// the live board does not model it: `predicted_keepers.json` is marked
// MOCK/REHEARSAL ONLY and is deliberately withheld, because — Cory's own rule —
// "a prediction rendered indistinguishably from a fact IS a fact as far as
// behaviour is concerned."
//
// That decision is right and it has a price, because every seat asks "who is
// gone by now" as `byAdp.slice(0, pick - 1)`: the top N by ADP. Reality removes
// the KEEPERS — whoever they are, wherever they rank — plus however many live
// selections actually happen. Those are different sets in general.
//
// ── THEY ARE THE SAME SET HERE, AND THE REASON IS STRUCTURAL ─────────────
//
// Every one of the fourteen predicted opponent keepers ranks inside the top 22
// by ADP; the deepest is #22. Cory's first pick is 33. A keeper INSIDE the
// window is removed by both accounts, so the two sets coincide — at pick 33 and
// at all eleven of his later picks, where the window is wider still.
//
// It is structural rather than lucky: under `top_picks_flat` keeping anybody
// costs a first, second or third round pick, so nobody keeps a player who is not
// worth one. Elite players have elite ADP.
//
// ── THE EXPOSURE IS BOUNDED AND EXACT, WHICH IS THE USEFUL PART ──────────
//
// Divergence at pick P is the number of keepers ranked OUTSIDE the top (P-1),
// and each one frees exactly one player at the boundary. So the risk is not
// "the slate is withheld"; it is precisely "somebody keeps a player deeper than
// my next pick", and that is one number Cory can check on 20 August.
//
// A NULL IS A CLAIM. Rule 13f: before believing one, show the instrument can
// produce a non-null. The fail arm below substitutes a single deep keeper and
// the divergence appears immediately, at every depth tried.
//
// Run: node draft/tests/withheld_slate_exposure.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PK = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'predicted_keepers.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const byId = {};
pool.forEach(p => { byId[String(p.player_id)] = p; });
const rankOf = id => byAdp.findIndex(p => String(p.player_id) === String(id)) + 1;

/* What the model believes is gone, against what a keeper-aware account gives.
 * Both remove exactly `pick - 1` players — a board slot removes one man whether
 * a keeper sits in it or somebody selects — so this is about IDENTITY, not
 * count, which is the whole reason the difference is easy to miss. */
function divergence(keeperIds, myPick) {
  const K = new Set(keeperIds.map(String));
  const model = new Set(byAdp.slice(0, myPick - 1).map(p => String(p.player_id)));
  const real = new Set(K);
  const live = (myPick - 1) - K.size;
  let taken = 0;
  for (const p of byAdp) {
    const id = String(p.player_id);
    if (real.has(id)) continue;
    if (taken >= live) break;
    real.add(id); taken++;
  }
  return [...model].filter(id => !real.has(id)).map(id => byId[id]).filter(Boolean);
}

// ── 0. THE SLATE IS WITHHELD, AND THAT IS THE DESIGN ────────────────────
ck('the predicted slate says out loud that it is not for the live board',
  /MOCK\/REHEARSAL ONLY/i.test(PK.note || ''), (PK.note || '').slice(0, 60));
const others = [];
Object.values(PK.predictions || {}).forEach(v => {
  if (String(v.roster_id) === '1') return;
  (v.predicted_keepers || []).forEach(k => others.push(String(k.player_id)));
});
ck('there are opponent keepers to reason about', others.length >= 10, others.length);
ck('and every one of them is still in the draftable pool, so ranks are real',
  others.every(id => !!byId[id]), others.filter(id => !byId[id]));
ck('CONTROL — some teams keep NOBODY, which is the clause a uniform model breaks',
  Object.values(PK.predictions || {})
    .filter(v => !(v.predicted_keepers || []).length).length >= 1,
  Object.values(PK.predictions || {}).map(v => (v.predicted_keepers || []).length));

// ── 1. THE STRUCTURAL FACT THE NULL RESTS ON ────────────────────────────
const deepest = Math.max.apply(null, others.map(rankOf));
const MY = DATA.pick_order.my_picks || [];
ck('every opponent keeper ranks inside the top 22 by ADP', deepest <= 22, deepest);
ck('and my FIRST pick is deeper than all of them', MY[0] > deepest,
  { first_pick: MY[0], deepest_keeper_rank: deepest });

// ── 2. SO THE WITHHELD SLATE COSTS NOTHING, AT EVERY PICK ───────────────
const perPick = MY.map(pk => ({ pick: pk, n: divergence(others, pk).length }));
ck('the model and a keeper-aware account agree at EVERY one of my picks',
  perPick.every(x => x.n === 0), perPick.filter(x => x.n));
ck('CONTROL — both accounts remove the same COUNT, so this is about identity',
  divergence(others, MY[0]).length === 0 && MY[0] - 1 === 32, MY[0] - 1);

// ── 3. FAIL ARM — the probe must be able to produce a non-null ──────────
// Rule 13f. A null that matches what its author expected needs its instrument
// checked, and "the withheld slate is harmless" is exactly what I expected.
{
  const found = [40, 60, 90, 140].map(r => {
    const deep = byAdp[r - 1];
    const alt = others.slice(0, -1).concat([String(deep.player_id)]);
    const d = divergence(alt, MY[0]);
    return { rank: r, name: deep.name, freed: d.length,
      who: d.map(p => p.name + ' #' + rankOf(p.player_id)) };
  });
  ck('FAIL ARM — one keeper deeper than my first pick breaks the null at every '
    + 'depth tried', found.every(f => f.freed >= 1),
    found.map(f => '#' + f.rank + '->' + f.freed));
  ck('and it frees EXACTLY ONE player, at the boundary — the arithmetic is exact, '
    + 'so the exposure is countable rather than vague',
    found.every(f => f.freed === 1 && /#3[0-9]\b/.test(f.who[0] || '')),
    found.map(f => f.who[0]));
}

// ── 4. THE RULE THAT MAKES IT STRUCTURAL, READ NOT ASSUMED ──────────────
// Under top_picks_flat keeping anybody costs a first, second or third, so nobody
// keeps a player who is not worth one. If the cost model ever changes to
// original_round, cheap deep keepers become rational and this null dies with it.
const kr = (DATA.league || {}).keeper_rules || {};
ck('the league charges a TOP round for any keeper, which is why keepers are elite',
  kr.cost_model === 'top_picks_flat', kr.cost_model);
ck('and caps the count at 3, so at most 30 board slots can be keepers',
  +kr.count === 3, kr.count);

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  (deepest opponent '
  + 'keeper #' + deepest + ', first pick ' + MY[0] + ')');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: withholding the opponent keeper slate from the live');
console.log('board costs Cory NOTHING at any of his twelve picks, because every keeper is');
console.log('already inside the window the model removes — and the exposure if that stops');
console.log('being true is exactly one freed player per keeper deeper than the next pick.');
console.log('WHAT IT DOES NOT: model the ORDER opponents pick in. Both accounts assume the');
console.log('room drafts near ADP, and that is the assumption the seat plan already states.');
console.log('It also uses the PREDICTED slate — the real one locks 20 August, and the one');
console.log('number to re-check then is whether any keeper ranks deeper than pick 33.');
