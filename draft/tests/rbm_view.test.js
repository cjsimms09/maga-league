/* ROSTER BUILDER MODEL PANEL — pure render layer, ROSTER-BUILDER-PANEL-DESIGN.md
 * (A, 2026-08-19). Tests the render half only: three-row cap, the four fields
 * in the spec's priority order, the WHY string surviving verbatim (including
 * the "bench only" string §4 says must never be filtered), the K/DEF footer
 * line, the evidence disclosure, and every honest-empty-state degrade path.
 * mlv.js's own valuation logic (surplus-over-the-wire, the K<=1/DEF<=1 cap)
 * is A's territory and out of scope here — this only checks that whatever
 * RosterBuilderMLV.recommend() returns gets rendered correctly and safely.
 *
 * Run: node draft/tests/rbm_view.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'rbm_view.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

function mkRecs(overrides) {
  return [
    { player: { name: 'Jahmyr Gibbs', adp: 1 }, position: 'RB', marginal: 245.9, why: 'takes your open FLEX seat' },
    { player: { name: 'Bijan Robinson', adp: 2 }, position: 'RB', marginal: 238.3, why: 'takes your open FLEX seat' },
    { player: { name: 'Puka Nacua', adp: 4 }, position: 'WR', marginal: 158.9, why: 'fills your open WR slot' },
  ].concat(overrides || []);
}

// ── basic render ─────────────────────────────────────────────────────────
{
  const html = V.render(mkRecs(), 'evidence sentence', esc);
  ck('the panel carries its own label, never the board\'s', /Roster builder model says/.test(html));
  ck('the sub-label makes clear this is a second voice, not a pick',
    /a second voice.*not your board/i.test(html.replace(/&#39;|&apos;/g, "'")));
  ck('all three players render', /Jahmyr Gibbs/.test(html) && /Bijan Robinson/.test(html) && /Puka Nacua/.test(html));
  ck('a 4th+ recommendation is NOT rendered — three rows is enough per §2',
    (function () {
      const withFourth = V.render(mkRecs([{ player: { name: 'Extra Guy', adp: 9 }, position: 'TE', marginal: 10, why: 'bench only — he does not crack your lineup' }]), null, esc);
      return !/Extra Guy/.test(withFourth);
    })());
}

// ── the four fields, spec §2 priority order ────────────────────────────────
{
  const html = V.render(mkRecs(), null, esc);
  ck('name + position render for every row', /Jahmyr Gibbs/.test(html) && /rbm-pos">RB</.test(html));
  ck('the WHY string renders verbatim — "the point of the panel" per §2', /takes your open FLEX seat/.test(html));
  ck('the marginal figure renders, signed', /\+245\.9/.test(html));
  ck('ADP renders when present', /ADP 1/.test(html));
  ck('a missing ADP degrades to an empty cell, not "ADP null" or a crash',
    (function () {
      const noAdp = V.render([{ player: { name: 'No ADP Guy' }, position: 'RB', marginal: 10, why: 'bench only — he does not crack your lineup' }], null, esc);
      return /No ADP Guy/.test(noAdp) && !/ADP null/.test(noAdp) && !/ADP undefined/.test(noAdp);
    })());
}

// ── the WHY string that must never be filtered (§4) ────────────────────────
{
  const html = V.render([{ player: { name: 'Bench Guy', adp: 40 }, position: 'QB', marginal: 3.2,
    why: 'bench only — he does not crack your lineup' }], null, esc);
  ck('"bench only" — the most valuable string on the panel per §4 — renders, not filtered out',
    /bench only .{1,3} he does not crack your lineup/.test(html));
}

// ── the K/DEF footer line — §5① ─────────────────────────────────────────
{
  const html = V.render(mkRecs(), null, esc);
  ck('the K/DEF exclusion is disclosed in the footer, not hidden',
    /K and DEF excluded/.test(html));
  ck('the footer names the standing reason (worth +17/+23 all draft)',
    /\+17/.test(html) && /\+23/.test(html));
  ck('the footer clarifies STARTING lineup, not roster — the units the marginal number is in',
    /STARTING LINEUP, not to your roster/.test(html));
}

// ── the evidence disclosure — §5②: "a sentence, not a colour" ─────────────
{
  const withEvidence = V.render(mkRecs(), 'Beats the humans in all three seasons.', esc);
  ck('evidence renders as a <details> disclosure, collapsed by default (matches pb-opponents/pb-dropoffs)',
    /<details class="rbm-evidence"><summary>why trust this<\/summary>/.test(withEvidence));
  ck('the caveat sentence itself is printed inside it', /Beats the humans in all three seasons\./.test(withEvidence));
  ck('no confidence badge/color class anywhere — the spec explicitly forbids one',
    !/rbm-confidence|rbm-badge/.test(withEvidence));
  const withoutEvidence = V.render(mkRecs(), null, esc);
  ck('no evidence disclosure renders when no caveat is given, rather than an empty <details>',
    !/rbm-evidence/.test(withoutEvidence));
}

// ── honest empty states ────────────────────────────────────────────────────
{
  ck('no recs → empty string, not a broken shell', V.render([], 'x', esc) === '');
  ck('null recs → empty string', V.render(null, 'x', esc) === '');
  ck('undefined recs → empty string', V.render(undefined, 'x', esc) === '');
}

// ── this panel must never read as the board's own pick (§1) ────────────────
{
  const html = V.render(mkRecs(), null, esc);
  ck('the wrapper carries its own distinct class, not a pb-* (position-board) class',
    /class="rbm-wrap"/.test(html) && !/class="pb-/.test(html));
}

// ── escaping ────────────────────────────────────────────────────────────
{
  const html = V.render([{ player: { name: '<script>alert(1)</script>', adp: 1 }, position: 'RB',
    marginal: 5, why: '<script>alert(2)</script>' }], null, esc);
  ck('a hostile player name is escaped, not injected raw', !/<script>alert\(1\)/.test(html) && /&lt;script&gt;/.test(html));
  ck('a hostile why string is escaped too', !/<script>alert\(2\)/.test(html));
}

// ── KNOWN-POSITIVE (rule 3e): the real board, through mlv.js, renders ──────
{
  const RosterBuilderMLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
  const BOARD = path.join(ROOT, 'public', 'draft_data.json');
  if (fs.existsSync(BOARD)) {
    const D = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
    const recs = RosterBuilderMLV.recommend(D.players, [], { league: D.league, topN: 3 });
    ck('CONTROL — recommend() actually returns rows against the real board', recs.length > 0, recs.length);
    const html = V.render(recs, RosterBuilderMLV.EVIDENCE.caveat, esc);
    ck('KNOWN-POSITIVE — the live board renders a non-trivial panel through both modules composed',
      html.length > 200, { length: html.length });
    ck('...and K/DEF really are absent from a real recommendation (the cap doing its job)',
      !recs.some(r => r.position === 'K' || r.position === 'DEF'));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
