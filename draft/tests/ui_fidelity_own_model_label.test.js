// TERRITORY: A
// UI-FIDELITY — EVERY SURFACE THAT NAMES THE OWN MODEL READS PROVENANCE.
//
// Cory (2026-08-16): "Do we need to make sure our new war room is a clear
// representation of our model." The own model was promoted TWICE in one day
// (v4 then own_v6, both under written acceptance) — so any surface that
// TYPES an algorithm name is one promotion away from lying. The audit found
// and fixed three: build.py's log line said "(own_v6)" verbatim, app.js's
// consensus fallback said 'Sleeper proj' from the single-source era, and the
// /admin/projections route read only the top-level provenance key (a fresh
// build() writes the diag under provenance.projections.own_model instead, so
// the page was one nightly rebuild from "none attached" over a full column).
//
// This suite pins the fix: the displayed label EQUALS the artifact's own
// provenance, resolved through both provenance homes, with no algorithm
// literal typed into any rendering surface.
//
// Run: node draft/tests/ui_fidelity_own_model_label.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE BOARD'S OWN PROVENANCE CARRIES THE ALGORITHM ─────────────────
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const prov = artifact.provenance || {};
// Both homes, same precedence the route uses: the promotion's board refresh
// writes provenance.own_model; a full build() writes provenance.projections.own_model.
const ownModel = prov.own_model || (prov.projections || {}).own_model || {};
ck('the committed board names its own-model algorithm in provenance',
  typeof ownModel.algorithm === 'string' && ownModel.algorithm.length > 0,
  { algorithm: ownModel.algorithm, homes: { top: !!prov.own_model, nested: !!(prov.projections || {}).own_model } });
console.log('        (provenance says: ' + ownModel.algorithm + ')');
ck('the board actually carries the column the label describes',
  (artifact.players || []).some(p => p.proj_ownmodel != null));

// ── 2. THE ROUTE READS BOTH PROVENANCE HOMES ────────────────────────────
const ROUTE = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'admin.js'), 'utf8');
ck('/admin/projections resolves ownModel through BOTH homes '
  + '(top-level first, projections.own_model fallback)',
  /ownModel:\s*prov\.own_model\s*\|\|\s*\(prov\.projections\s*\|\|\s*\{\}\)\.own_model\s*\|\|\s*\{\}/.test(ROUTE),
  (ROUTE.match(/ownModel:.*$/m) || [])[0]);

// ── 3. THE PAGE PRINTS PROVENANCE, NOT A TYPED NAME ─────────────────────
const EJS_SRC = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'projections.ejs'), 'utf8');
ck('projections.ejs renders ownModel.algorithm (the provenance field)',
  /ownModel\.algorithm/.test(EJS_SRC));
['own_v4', 'own_v5', 'own_v6', 'walk_forward'].forEach(lit => {
  ck('projections.ejs contains NO hardcoded "' + lit + '"', EJS_SRC.indexOf(lit) === -1);
});

// Render the shipped template with the REAL artifact's provenance and prove
// the displayed label is the provenance value verbatim — computed, not grepped.
{
  const ejs = require('ejs');
  const html = ejs.render(EJS_SRC, {
    byPos: { QB: [] }, posFilter: null, builtAt: artifact.built_at || null,
    ownModel: ownModel, projProv: prov.projections || null,
  });
  ck('RENDERED: the page label IS the provenance algorithm, verbatim',
    html.indexOf('<b>' + ownModel.algorithm + '</b>') >= 0, ownModel.algorithm);
  // The NEXT promotion cannot strand this page: rename the algorithm and the
  // rendered label follows with zero template edits.
  const future = ejs.render(EJS_SRC, {
    byPos: { QB: [] }, posFilter: null, builtAt: null,
    ownModel: { algorithm: 'own_v7_hypothetical', promotion: 'test' }, projProv: null,
  });
  ck('RENDERED: a hypothetical own_v7 promotion relabels the page with NO template change',
    future.indexOf('<b>own_v7_hypothetical</b>') >= 0);
}

// ── 4. THE WAR ROOM TYPES NO ALGORITHM NAME EITHER ──────────────────────
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const SHELL = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
['own_v4', 'own_v5', 'own_v6', 'walk_forward'].forEach(lit => {
  ck('warroom.ejs contains NO hardcoded "' + lit + '"', SHELL.indexOf(lit) === -1);
});
ck('app.js no longer hardcodes the single-source fallback label '
  + "('Sleeper proj' is derived from provenance now)",
  !/label:\s*'Sleeper proj'/.test(APP));

// consensus.js: the shared derivation labels our model version-free — 'Our
// model' survives every promotion — and computes the label from what is
// present, never from a typed source list at the call site.
{
  const C = require(path.join(ROOT, 'public', 'js', 'draft', 'consensus.js'));
  const solo = C.rawProjection({ proj_ownmodel: 200 }, prov);
  ck("consensus.js labels the own model version-free ('Our model proj')",
    solo.label === 'Our model proj' && solo.value === 200, solo);
  const three = C.rawProjection({ proj_sleeper: 100, proj_fantasypros: 110, proj_ownmodel: 120 }, prov);
  ck('three sources present → "Consensus (3 src)" — the count is derived, not typed',
    three.label === 'Consensus (3 src)' && three.value === 110, three);
}

// ── 5. THE BUILD LOG READS THE DIAG, NOT A TYPED NAME ───────────────────
const BUILD = fs.readFileSync(path.join(ROOT, 'draft', 'build.py'), 'utf8');
ck("build.py's own-model log line reads own_diag['algorithm'], never a literal",
  /own_diag\.get\('algorithm'/.test(BUILD)
  && !/projections: own model \(own_v/.test(BUILD));
// The diag itself carries the name (own_projections.py stamps it) — the one
// place the algorithm IS rightfully written, in the module that implements it.
const OWNP = fs.readFileSync(path.join(ROOT, 'draft', 'own_projections.py'), 'utf8');
ck('own_projections.py stamps provenance["algorithm"] (the single source the surfaces read)',
  /"algorithm":\s*"/.test(OWNP));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
