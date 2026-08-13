'use strict';
// TERRITORY: A
// INDEPENDENT VERIFICATION OF THE H2H RESOLVER — gated item 4.
//
// `h2h.test.js`, `h2h_agreement.test.js` and `h2h_franchise_scope.test.js` are
// all green, and none of them is independent verification of the ARITHMETIC.
// The agreement suite is the closest and it compares /matchup against /rivalry
// — two PAGES that both call `H2H.headToHead`. If that function miscounts, both
// pages agree and both are wrong, and a green agreement test says so
// confidently. Agreement between two consumers of one function is a check on
// the consumers, not on the function.
//
// So this recomputes every head-to-head record straight from the archive BY A
// DIFFERENT TRAVERSAL and compares, for EVERY PAIR OF OWNERS, not a sample.
//
//   THE SHIPPED METHOD  walks seasons -> weeks and does rows.find(A),
//                       rows.find(B), then asks whether the two share a
//                       matchup_id.
//
//   THIS METHOD         groups every week's rows BY matchup_id first and emits
//                       the pairing each group contains, then looks the pair up.
//
// The difference is the point. `find()` returns the FIRST row matching an owner
// and silently ignores a second; a group-by sees the whole group and can say
// how big it was. So this also checks the structural assumptions the shipped
// traversal depends on and cannot report on: that a matchup group holds exactly
// two rows, and that an owner holds exactly one roster per season.
//
// Run: node draft/tests/h2h_independent_verify.test.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H2H = require(path.join(ROOT, 'src', 'routes', 'h2h'));
const ARCHIVE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 400) : '')); }
};

const PLAYOFF_START = 16;
const r2 = n => Math.round(n * 100) / 100;

// ── THE INDEPENDENT DERIVATION ──────────────────────────────────────────────
// Group-by matchup_id, then emit pairings. Deliberately NOT the shipped shape.
function pairingsFrom(data) {
  const out = [];                        // {season, week, uidA, uidB, ptsA, ptsB}
  const oversized = [];                  // groups that are not exactly 2 rows
  const dupRoster = [];                  // an owner holding 2+ rosters in a season
  for (const s of (data.seasons || [])) {
    if (!s.weeks) continue;
    const r2u = {};
    const seenUid = {};
    for (const [rid, o] of Object.entries(s.owners || {})) {
      const uid = String(o.user_id);
      r2u[rid] = uid;
      if (seenUid[uid]) dupRoster.push({ season: s.season, uid, rosters: [seenUid[uid], rid] });
      seenUid[uid] = rid;
    }
    for (const [wk, rows] of Object.entries(s.weeks)) {
      if (!Array.isArray(rows)) continue;
      const groups = {};
      for (const r of rows) {
        if (r.matchup_id == null) continue;      // a bye is not a game
        (groups[r.matchup_id] = groups[r.matchup_id] || []).push(r);
      }
      for (const [mid, g] of Object.entries(groups)) {
        if (g.length !== 2) { oversized.push({ season: s.season, week: wk, mid, n: g.length }); continue; }
        const ua = r2u[g[0].roster_id], ub = r2u[g[1].roster_id];
        if (!ua || !ub || ua === ub) continue;
        out.push({ season: String(s.season), week: Number(wk),
          uidA: ua, uidB: ub, ptsA: Number(g[0].points) || 0, ptsB: Number(g[1].points) || 0 });
      }
    }
  }
  return { pairings: out, oversized, dupRoster };
}

// Fold the independent pairings into the same record shape headToHead reports.
function recordFor(pairings, uidA, uidB) {
  let w = 0, l = 0, t = 0, ptsA = 0, ptsB = 0, played = 0, post = 0;
  for (const p of pairings) {
    let a, b;
    if (p.uidA === uidA && p.uidB === uidB) { a = p.ptsA; b = p.ptsB; }
    else if (p.uidA === uidB && p.uidB === uidA) { a = p.ptsB; b = p.ptsA; }
    else continue;
    played++; ptsA += a; ptsB += b;
    if (p.week >= PLAYOFF_START) post++;
    if (a > b) w++; else if (b > a) l++; else t++;
  }
  return { played, w, l, t, ptsA: r2(ptsA), ptsB: r2(ptsB), post };
}

const { pairings, oversized, dupRoster } = pairingsFrom(ARCHIVE);

// ── 0. THE DERIVATION ITSELF HAS TO BE NON-TRIVIAL ─────────────────────────
// A verifier that found no games would agree with a resolver that found no
// games, and both would be silently useless — the same vacuous-pass shape as a
// check that cannot fail.
ck('the independent derivation found games at all', pairings.length > 0, pairings.length);
// A season is only expected to yield games if it CONTAINS any played matchup.
// The archive carries 2026, which has begun on paper and has no games, so
// comparing against every season with a `weeks` key charged the derivation with
// missing a season that has nothing in it.
const seasonsWithGames = (ARCHIVE.seasons || []).filter(s => s.weeks
  && Object.values(s.weeks).some(rows => Array.isArray(rows)
    && rows.some(r => r.matchup_id != null))).map(s => String(s.season));
ck('it found games in every season that HAS games',
  new Set(pairings.map(p => p.season)).size === seasonsWithGames.length,
  { derived: [...new Set(pairings.map(p => p.season))].sort(), expected: seasonsWithGames });

// ── 1. THE STRUCTURAL ASSUMPTIONS `find()` CANNOT REPORT ON ────────────────
ck('every matchup group holds exactly two rows (find() would hide a third)',
  oversized.length === 0, oversized.slice(0, 5));
ck('no owner holds two rosters in one season (find() would take the first)',
  dupRoster.length === 0, dupRoster.slice(0, 5));

// ── 2. EVERY PAIR, NOT A SAMPLE ────────────────────────────────────────────
const uids = [...new Set(pairings.flatMap(p => [p.uidA, p.uidB]))].sort();
ck('the archive yields a plausible number of owners', uids.length >= 8 && uids.length <= 16, uids.length);

let compared = 0, mismatched = [];
for (let i = 0; i < uids.length; i++) {
  for (let j = i + 1; j < uids.length; j++) {
    const mine = recordFor(pairings, uids[i], uids[j]);
    const theirs = H2H.headToHead(uids[i], uids[j], ARCHIVE);
    compared++;
    /* THE SHIPPED SHAPE IS NESTED: {played, a:{wins, pointsFor}, b:{...}, ties}.
     * My first pass read `theirs.aWins` and `theirs.aPts` — the names of
     * summarize()'s LOCAL variables, not of the object it returns — so every
     * comparison ran against `undefined` and the suite reported the resolver as
     * disagreeing on all 45 pairs. Guessing a field name off an implementation's
     * internals is the same error as the `r.slots` read in greedy_vs_plan. */
    const t = {
      played: theirs.played,
      w: theirs.a.wins, l: theirs.b.wins, t: theirs.ties,
      ptsA: r2(theirs.a.pointsFor), ptsB: r2(theirs.b.pointsFor),
    };
    if (t.played !== mine.played || t.w !== mine.w || t.l !== mine.l || t.t !== mine.t
        || Math.abs(t.ptsA - mine.ptsA) > 0.02 || Math.abs(t.ptsB - mine.ptsB) > 0.02) {
      mismatched.push({ pair: [uids[i], uids[j]], mine, theirs: t });
    }
  }
}
ck('every owner pair was compared', compared === uids.length * (uids.length - 1) / 2, compared);
ck('THE SHIPPED RESOLVER AGREES WITH AN INDEPENDENT DERIVATION ON EVERY PAIR',
  mismatched.length === 0, mismatched.slice(0, 3));

// Records must also be self-consistent: A-vs-B reversed is B-vs-A.
let asym = 0;
for (let i = 0; i < uids.length; i++) {
  for (let j = i + 1; j < uids.length; j++) {
    const ab = H2H.headToHead(uids[i], uids[j], ARCHIVE);
    const ba = H2H.headToHead(uids[j], uids[i], ARCHIVE);
    /* THIS CHECK PASSED VACUOUSLY in the first version: it compared
     * `ab.aWins !== ba.bWins`, both `undefined`, so the inequality was always
     * false and `asym` could never rise. A check that cannot fail is not a
     * check — the exact residual class already tracked as task #23, found here
     * in a test I had just written. */
    if (ab.played !== ba.played || ab.a.wins !== ba.b.wins || ab.b.wins !== ba.a.wins) asym++;
  }
}
ck('the resolver is symmetric under argument order', asym === 0, asym);

// ── 3. TOTALS MUST RECONCILE ───────────────────────────────────────────────
// Every pairing belongs to exactly one pair, so summing `played` over all pairs
// must equal the number of pairings derived. This catches a resolver that
// double-counts or drops games in a way no single pair reveals.
let sumPlayed = 0;
for (let i = 0; i < uids.length; i++) {
  for (let j = i + 1; j < uids.length; j++) sumPlayed += H2H.headToHead(uids[i], uids[j], ARCHIVE).played;
}
ck('games summed over all pairs equals the games independently derived',
  sumPlayed === pairings.length, { resolver: sumPlayed, independent: pairings.length });

// ── 4. THE FAIL ARM — #14: prove the comparison can go red ────────────────
// Everything above passes on untampered data, which proves nothing about
// detection. Corrupt a copy of the archive and confirm the two methods diverge.
{
  const copy = JSON.parse(JSON.stringify(ARCHIVE));
  let flipped = false;
  for (const s of copy.seasons || []) {
    if (flipped || !s.weeks) continue;
    for (const rows of Object.values(s.weeks)) {
      if (flipped || !Array.isArray(rows)) continue;
      for (const r of rows) {
        if (r.matchup_id != null && Number(r.points) > 0) { r.points = Number(r.points) + 50; flipped = true; break; }
      }
    }
  }
  ck('FAIL ARM — a game was actually mutated for the negative control', flipped);
  const { pairings: badP } = pairingsFrom(copy);
  let diverged = 0;
  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const mine = recordFor(badP, uids[i], uids[j]);
      const theirs = H2H.headToHead(uids[i], uids[j], ARCHIVE);   // ORIGINAL archive
      if (mine.played !== theirs.played || mine.w !== theirs.a.wins
          || Math.abs(mine.ptsA - r2(theirs.a.pointsFor)) > 0.02) diverged++;
    }
  }
  ck('FAIL ARM — the comparison DETECTS a corrupted archive', diverged > 0, diverged);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + pairings.length + ' games independently derived across ' + uids.length + ' owners, '
  + compared + ' pairs compared)');
if (fail) { console.log('\nFAILED — the h2h resolver is NOT independently verified.'); process.exit(1); }
console.log('\nWHAT THIS ESTABLISHES: the shipped resolver\'s record arithmetic agrees with a');
console.log('genuinely different traversal of the same archive on every owner pair, its');
console.log('totals reconcile, it is symmetric, and the structural assumptions its find()');
console.log('depends on hold in the data. WHAT IT DOES NOT: the live user_id RESOLUTION');
console.log('path (name/alias -> user_id from the Sleeper bundle) is covered by');
console.log('h2h_agreement.test.js, not here — this verifies the arithmetic given ids.');
