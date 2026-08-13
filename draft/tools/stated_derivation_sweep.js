/* ITEM 9, SUB-CLASS THREE: A CONSTANT WHOSE COMMENT STATES A DERIVATION THE
 * SHIPPED LITERAL DOES NOT ACTUALLY OBEY.
 *
 * ── THE FIRST VERSION OF THIS FILE WAS WORTHLESS AND THE REASON MATTERS ─────
 *
 * It reported "0 evaluable relationships, 0 disagree, residual 0" and I nearly
 * filed that as a clean null. It is not a null. Rule 10 says break the guard
 * before trusting it, so I reintroduced the exact defect this sweep was written
 * for — PATHS_BAND: 12.0 with its shipped comment, "max(12, COIN_FLIP_GAP*4)
 * = 12" — and re-ran. IT STILL REPORTED ZERO. The sweep could not catch its own
 * exemplar. Two independent faults, and the second is the interesting one:
 *
 *   1. THE EXTRACTOR WAS BROKEN BY A COMMA. The capture class was
 *      [\w.*\/+\-() ] with no comma in it, so on `max(12, COIN_FLIP_GAP*4)` the
 *      match began after the comma and produced " COIN_FLIP_GAP*4)" — an
 *      unbalanced fragment that throws on eval and was silently counted as
 *      "prose, not arithmetic". Every stated derivation of the form max(a, b)
 *      or min(a, b) — the most likely form a floor-vs-derivation comment takes,
 *      which is to say EXACTLY the population being hunted — was invisible.
 *
 *   2. THE PREDICATE WAS WRONG, AND FIXING THE EXTRACTOR WOULD NOT HAVE HELPED.
 *      max(12, COIN_FLIP_GAP*4) evaluates to 12 at COIN_FLIP_GAP = 1.0, and the
 *      shipped literal was 12.0. An "does the stated arithmetic equal the
 *      literal" test reports AGREES on the defect. It was never a member of the
 *      class I defined. PATHS_BAND is a floor dominating a derivation — sub-
 *      class ONE wearing a comment — and I generalised a whole sub-class off a
 *      mischaracterised exemplar, which is the same mistake as the VONA comment
 *      itself: a description asserted rather than checked.
 *
 * SO THE PREDICATE IS NOW THE ONE THAT ACTUALLY SEPARATES THEM — AN INERT
 * REFERENCE. A comment says a constant is derived from X. Perturb X by ±20%
 * around its shipped value and re-evaluate the stated expression. If the value
 * does not move, X does not participate: the comment credits a dependency the
 * arithmetic does not have, and a reader tuning X will change nothing. That
 * fires on max(12, COIN_FLIP_GAP*4) at every plausible setting, and it fires on
 * any future floor written into a comment the same way.
 *
 * The literal-disagreement check is kept as a second, weaker predicate.
 *
 * ── THE SELF-TEST RUNS ON EVERY INVOCATION ──────────────────────────────────
 * A fixture carrying the historical PATHS_BAND comment is swept first. If it
 * does not FIRE, this tool exits non-zero and reports nothing, because a sweep
 * that cannot fail has no null to offer. That is the whole lesson of the first
 * version, wired in so it cannot be forgotten.
 *
 * WHAT IT STILL CANNOT DO: prove a comment is honest. A quantity described in
 * PROSE — "value over the next STARTER", the defect that cost the value term
 * for half of every draft — states no arithmetic and is unreachable here. The
 * prose count below is not decoration; it is the size of the blind spot.
 *
 * Run: node draft/tools/stated_derivation_sweep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
['survival', 'composite', 'engine'].forEach(m =>
  require(path.join(ROOT, 'public', 'js', 'draft', m + '.js')));

const PERTURB = 0.2;          // ±20% around the shipped value of the named constant
const LEFT_SPAN = 60;         // how far left of the name an expression may reach
const RIGHT_SPAN = 60;        // how far right the "= <number>" terminator may sit
const EXPR_CHAR = /[\w.+\-*/(), ]/;

/* Compile a stated expression into f(K), with the NAMED constant left free so it
 * can be perturbed and every other constant substituted at its shipped value.
 * Returns null if anything alphabetic survives substitution — that is prose. */
function compile(text, named, cfg) {
  let e = text.replace(/\bmax\b/gi, 'Math.max').replace(/\bmin\b/gi, 'Math.min');
  e = e.replace(new RegExp('\\b' + named + '\\b', 'g'), '__K__');
  Object.keys(cfg).forEach(k => {
    const v = Number(cfg[k]);
    if (!isFinite(v)) return;
    e = e.replace(new RegExp('\\b' + k + '\\b', 'g'), '(' + v + ')');
  });
  const residue = e.replace(/Math\.(max|min)/g, '').replace(/__K__/g, '');
  if (/[A-Za-z_]/.test(residue)) return null;   // leftover words: prose, not arithmetic
  if (!/__K__/.test(e)) return null;            // does not actually mention the constant
  try { return Function('__K__', '"use strict";return (' + e + ');'); }
  catch (err) { return null; }
}

/* Longest suffix of `raw` that compiles and evaluates finitely. Longest-first so
 * `max(12, COIN_FLIP_GAP*4)` wins over the unbalanced `COIN_FLIP_GAP*4)` that
 * defeated the previous version. */
function longestEvaluable(raw, named, cfg, k0) {
  const toks = raw.split(/(?<=\s)/);
  for (let s = 0; s < toks.length; s++) {
    const text = toks.slice(s).join('').trim();
    if (!text || !new RegExp('\\b' + named + '\\b').test(text)) continue;
    /* A DERIVATION, NOT A VALUE STATEMENT. "COIN_FLIP_GAP is 1.0" is a true
     * remark about COIN_FLIP_GAP; read as a claim about the constant declared
     * below it, it is a fabricated disagreement. Require an operator. */
    if (!/[+\-*/]|\b(?:max|min)\b/i.test(text.replace(new RegExp('\\b' + named + '\\b', 'g'), ''))) continue;
    const fn = compile(text, named, cfg);
    if (!fn) continue;
    let v;
    try { v = fn(k0); } catch (err) { continue; }
    if (typeof v === 'number' && isFinite(v)) return { text: text, fn: fn };
  }
  return null;
}

/* Character ranges of double-quoted or backticked spans, so a quotation can be
 * told from an assertion. */
function quotedSpans(s) {
  const spans = [];
  const re = /"[^"]*"|`[^`]*`/g;
  let m;
  while ((m = re.exec(s))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

/* Every stated arithmetic relationship in `above` that names `other`. */
function statedRelations(above, other, cfg) {
  const out = [];
  const k0 = Number(cfg[other]);
  if (!isFinite(k0)) return out;
  const finder = new RegExp('\\b' + other + '\\b', 'g');
  let m;
  while ((m = finder.exec(above))) {
    const nameEnd = m.index + other.length;
    const tail = above.slice(nameEnd, nameEnd + RIGHT_SPAN);
    const term = tail.match(/^([\w.+\-*/(), ]*?)\s*(?:=|\bis\b|\bgives\b)\s*(-?\d+(?:\.\d+)?)/);
    if (!term) { out.push({ prose: true }); continue; }
    let left = m.index;
    while (left > 0 && m.index - left < LEFT_SPAN && EXPR_CHAR.test(above[left - 1])) left--;
    const raw = above.slice(left, nameEnd + term[1].length);
    const parsed = longestEvaluable(raw, other, cfg, k0);
    if (!parsed) { out.push({ prose: true }); continue; }
    /* A QUOTED EXPRESSION IS A CITATION, NOT A CLAIM. The comment attached to
     * PATHS_POOL contains the retirement note for PATHS_BAND, which quotes the
     * old design verbatim: "max(12, COIN_FLIP_GAP*4) = 12". Attributed to
     * PATHS_POOL that reads as a live disagreement, and it is a historical
     * record of a fixed one. Reported, but not counted as unresolved — a
     * codebase that documents its own defects must not be punished for it. */
    const cited = quotedSpans(above).some(sp => m.index >= sp[0] && m.index < sp[1]);
    out.push({ prose: false, cited: cited, text: parsed.text, fn: parsed.fn, k0: k0,
      statedRhs: Number(term[2]) });
  }
  return out;
}

/* Sweep one source: returns {rows, prose}. `lines`/`cfg` supplied so the
 * self-test can drive the identical code path over a fixture. */
function sweep(label, lines, cfg) {
  const rows = [];
  let prose = 0;
  lines.forEach((line, i) => {
    const lit = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*(-?[\d.]+)\s*,/);
    const get = line.match(/^\s*get\s+([A-Z][A-Z0-9_]*)\s*\(\)/);
    const name = lit ? lit[1] : (get ? get[1] : null);
    if (!name || cfg[name] === undefined) return;
    const live = Number(cfg[name]);
    if (!isFinite(live)) return;

    /* ONLY THE COMMENT BLOCK PHYSICALLY ATTACHED TO THIS DECLARATION.
     *
     * The first working version used a flat 25-line lookback and reported 22
     * hits where there are 2: one long comment above PATHS_BAND was attributed
     * to PATHS_MAX, DG_HIGH_K, TARGET_NUDGE and six others simply for being
     * declared beneath it. AN OVER-FIRING SWEEP IS AS USELESS AS A SILENT ONE —
     * twenty false positives is a report nobody reads to the end, which is how
     * the two real ones get lost. Walk up only while the lines are comment. */
    let top = i;
    while (top > 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[top - 1])) top--;
    if (top === i) return;                       // no attached comment at all
    const above = lines.slice(top, i).join(' ');
    Object.keys(cfg).forEach(other => {
      if (other === name || other.length <= 4) return;
      if (!new RegExp('\\b' + other + '\\b').test(above)) return;
      statedRelations(above, other, cfg).forEach(rel => {
        if (rel.prose) { prose++; return; }
        const val = rel.fn(rel.k0);
        const lo = rel.fn(rel.k0 * (1 - PERTURB));
        const hi = rel.fn(rel.k0 * (1 + PERTURB));
        const inert = Math.abs(lo - val) < 1e-12 && Math.abs(hi - val) < 1e-12;
        const disagrees = Math.abs(val - live) > 1e-9;
        rows.push({ file: label, name: name, other: other, live: live,
          stated: rel.text, value: val, inert: inert, disagrees: disagrees,
          cited: !!rel.cited, lo: lo, hi: hi });
      });
    });
  });
  return { rows: rows, prose: prose };
}

/* ── SELF-TEST: the historical defect, verbatim. Must FIRE. ─────────────────*/
const FIXTURE_LINES = [
  '    COIN_FLIP_GAP: 1.0,',
  '    /* How far below the top score a direction may sit and still count as',
  '     * "solid". The design is max(12, COIN_FLIP_GAP*4) = 12. */',
  '    PATHS_BAND: 12.0,',
];
const FIXTURE_CFG = { COIN_FLIP_GAP: 1.0, PATHS_BAND: 12.0 };
const selftest = sweep('<fixture>', FIXTURE_LINES, FIXTURE_CFG);
const fired = selftest.rows.filter(r => r.name === 'PATHS_BAND' && (r.inert || r.disagrees));
if (!fired.length) {
  console.log('SELF-TEST FAILED — this sweep cannot detect the defect it was written for.');
  console.log('  Fixture: PATHS_BAND: 12.0 with the comment "max(12, COIN_FLIP_GAP*4) = 12".');
  console.log('  extracted rows: ' + JSON.stringify(selftest.rows.map(r =>
    ({ name: r.name, stated: r.stated, inert: r.inert, disagrees: r.disagrees }))));
  console.log('  prose references: ' + selftest.prose);
  console.log('\n  REPORTING NOTHING. A sweep that cannot fail has no null to offer.');
  process.exit(2);
}

/* ── THE REAL SWEEP ────────────────────────────────────────────────────────*/
const SOURCES = [
  ['engine.js', global.DraftEngine.CFG],
  ['survival.js', (global.DraftSurvival || {}).CFG],
  ['composite.js', (global.DraftComposite || {}).CFG],
].filter(([, cfg]) => cfg);

let rows = [], prose = 0;
SOURCES.forEach(([file, cfg]) => {
  const lines = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', file), 'utf8').split('\n');
  const r = sweep(file, lines, cfg);
  rows = rows.concat(r.rows);
  prose += r.prose;
});

console.log('STATED-DERIVATION SWEEP — does a constant obey the derivation its own comment claims?\n');
console.log('  self-test: FIRED on the historical PATHS_BAND fixture ('
  + fired.map(f => f.inert ? 'INERT REFERENCE' : 'DISAGREES').join(', ') + ') — the sweep can fail.\n');

const bad = rows.filter(r => (r.inert || r.disagrees) && !r.cited);
if (!rows.length) {
  console.log('  No CFG entry states an evaluable arithmetic relationship to another constant.');
} else {
  rows.forEach(r => {
    const verdict = r.cited ? 'quoted — a CITATION of a past design, not a live claim'
      : r.disagrees ? '*** DISAGREES with the literal'
      : (r.inert ? '*** INERT REFERENCE — ' + r.other + ' does not move it' : 'obeyed');
    console.log('  ' + (r.file + ':' + r.name).padEnd(30) + 'live ' + String(r.live).padEnd(8)
      + '"' + r.stated + '" = ' + r.value.toFixed(2) + '   ' + verdict);
    if (r.inert && !r.cited) console.log('      ' + r.other + ' at -20%/-/+20% -> '
      + r.lo.toFixed(2) + ' / ' + r.value.toFixed(2) + ' / ' + r.hi.toFixed(2));
  });
}

console.log('\n  COUNT: ' + rows.length + ' evaluable stated relationship(s), '
  + rows.filter(r => r.disagrees && !r.cited).length + ' DISAGREE with the shipped literal, '
  + rows.filter(r => r.inert && !r.disagrees && !r.cited).length + ' name an INERT constant, '
  + rows.filter(r => r.cited).length + ' quoted (citation).');
console.log('  ' + prose + ' reference(s) named a constant but stated no evaluable '
  + 'relationship (prose — OUT OF REACH OF THIS INSTRUMENT, not cleared by it).');
console.log('  RESIDUAL UNRESOLVED: ' + bad.length + '.');
process.exit(bad.length ? 1 : 0);
