// TERRITORY: A
/* COMMITMENT ITEM 18 — every cross-lane contract has a declared SHAPE a
 * consumer can test against. draft/shapes/<contract>.shape.json declares the
 * export surface (name -> typeof) and the output keys of the pure entry
 * points; this test is the consumer. A producer that renames or drops a field
 * turns THIS red, in CI, instead of a renderer on a Sunday.
 *
 * Arms: every declared export exists with the declared type; every declared
 * output key is present on a real call; and a FAIL ARM — a shape with an
 * export the module does not carry is reported, so the checker cannot pass
 * vacuously. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

function checkExports(shape, mod) {
  return Object.entries(shape.exports).filter(([k, t]) => typeof mod[k] !== t).map(([k, t]) => `${k}:${typeof mod[k]}!=${t}`);
}
function missingKeys(obj, keys) { return keys.filter(k => !obj || !(k in obj)); }

const shapes = fs.readdirSync(path.join(ROOT, 'draft', 'shapes')).filter(f => /\.shape\.json$/.test(f));
ck('three contract shapes exist (decision_contract, valuation, draft_session)',
  ['decision_contract', 'valuation', 'draft_session'].every(n => shapes.includes(n + '.shape.json')), shapes);

const mods = {};
for (const f of shapes) {
  const shape = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'shapes', f), 'utf8'));
  const mod = require(path.join(ROOT, shape.module));
  mods[f.replace('.shape.json', '')] = { shape, mod };
  const bad = checkExports(shape, mod);
  ck(`${f}: every declared export exists with its declared type (${Object.keys(shape.exports).length})`, bad.length === 0, bad);
}

// ── output shapes on real calls ─────────────────────────────────────────────
{
  const { shape, mod } = mods.decision_contract;
  const res = mod.resolution(3.2, {});
  const o = shape.outputs['resolution(gap, cfg)'];
  ck('decision_contract.resolution -> the declared keys, status in the declared set',
    missingKeys(res, o.keys).length === 0 && o.status_in.includes(res.status), res);
  const winner = { player: { player_id: '1', name: 'A', position: 'RB' }, score: 10, gap_to_second: 3.2,
    components: {}, survival_to_next: null };
  const alt = { player: { player_id: '2', name: 'B', position: 'RB' }, score: 6.8, components: {} };
  let ex = null; try { ex = mod.explain({ winner, alternative: alt }); } catch (e) { ex = { _err: String(e.message) }; }
  const oe = shape.outputs['explain(o)'];
  ck('decision_contract.explain -> the declared top-level and evidence keys, contract string pinned',
    ex && !ex._err && missingKeys(ex, oe.keys).length === 0 && ex.contract === oe.contract
      && missingKeys(ex.evidence, oe.evidence_keys).length === 0, ex && (ex._err || Object.keys(ex.evidence || {})));
}
{
  const { shape, mod } = mods.draft_session;
  const ser = mod.serialize({}, {});
  ck('draft_session.serialize -> every declared key, v === VERSION',
    missingKeys(ser, shape.outputs['serialize(state, meta)'].keys).length === 0 && ser.v === mod.VERSION, ser);
  const bad = mod.restore(null, [], {});
  ck('draft_session.restore(null) -> the declared failure keys, ok false',
    bad.ok === false && missingKeys(bad, shape.outputs['restore(saved, board, opts)'].keys_on_failure).length === 0, bad);
}
{
  const { shape, mod } = mods.valuation;
  const league = { starters: { RB: 2 }, trade_deadline_week: 10 };
  const rb = { player_id: '9', position: 'RB', proj_mean: 12, vorp: 3 };
  let sv = null; try { sv = mod.startableValue(rb, [], league); } catch (e) { sv = { _err: String(e.message) }; }
  ck('valuation.startableValue -> {value, fills}', sv && missingKeys(sv, shape.outputs['startableValue(player, roster, league)'].keys).length === 0, sv);
  let ta = null; try { ta = mod.tradeActionability({ current_week: 12, deadline_week: 10 }); } catch (e) { ta = { _err: String(e.message) }; }
  ck('valuation.tradeActionability -> the declared keys',
    ta && missingKeys(ta, shape.outputs['tradeActionability(opts)'].keys).length === 0, ta);
  let sr = null; try { sr = mod.claimStoppingRule({ net_points: 2, depletes: false, contested: false }); } catch (e) { sr = { _err: String(e.message) }; }
  ck('valuation.claimStoppingRule -> the declared keys',
    sr && missingKeys(sr, shape.outputs['claimStoppingRule(opts)'].keys).length === 0, sr);
}
// ── FAIL ARM: the checker cannot pass a shape the module does not carry ──────
{
  const bad = checkExports({ exports: { noSuchExport: 'function', KEY: 'number' } }, mods.draft_session.mod);
  ck('FAIL ARM — a declared export the module lacks, or of the wrong type, is reported', bad.length === 2, bad);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
