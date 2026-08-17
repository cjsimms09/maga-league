// TERRITORY: A
/* BOARD IDENTITY IS THE BYTES, NOT THE TIMESTAMP — the fix for C's routed
 * finding (ROUTES.md TO:A, 2026-08-14): freeze_baseline.js's `same_board`
 * compared built_at, and built_at does not track content. C's git evidence:
 * three commits (ce866a5 / e77f834 / 57ce958), three different sha256s,
 * 31KB apart, 136 of the first 400 player rows differing — one shared
 * built_at, because the board is rebuilt once and then edited in place.
 * The old check would have said same_board:true for all three, and freezing
 * a baseline against the wrong board is a silent failure on the one day it
 * matters (the freeze lands 2026-08-20, two days before the draft).
 *
 * This file pins the fix AND reproduces the defect as a fail-arm, so the
 * check can never quietly regress to timestamp identity.
 *
 * Run: node draft/tests/board_identity.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FB = require(path.join(__dirname, '..', 'tools', 'freeze_baseline.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── 1. THE FAIL-ARM: C's exact evidence shape — same built_at, different bytes
{
  const a = JSON.stringify({ built_at: '2026-08-13T23:13:18Z', players: [{ player_id: '1', adp_unordered: 1 }] });
  const b = JSON.stringify({ built_at: '2026-08-13T23:13:18Z', players: [{ player_id: '1', adp_unordered: 2 }] });
  const id = FB.boardIdentity(a, b);
  ck('same built_at + different content -> same_board is FALSE (the exact case the '
    + 'old timestamp check called identical)', id.same_board === false, id);
  ck('and the two sha256s differ, so the report SHOWS why they are not the same board',
    id.pinned_sha256 !== id.live_sha256);
}

// ── 2. THE PASS-ARM: byte-identical boards ARE the same board ──────────────
{
  const a = JSON.stringify({ built_at: '2026-08-13T23:13:18Z', players: [{ player_id: '1' }] });
  const id = FB.boardIdentity(a, a);
  ck('byte-identical boards -> same_board true', id.same_board === true, id);
  ck('CONTROL — identical bytes yield identical digests', id.pinned_sha256 === id.live_sha256);
}

// ── 3. AND THE INVERSE OF THE OLD BUG: different built_at, same content ────
// A re-stamp with no content change is the SAME board under content
// addressing. The old check called this "different" — wrong in the harmless
// direction, but wrong, and worth pinning so the semantics are explicit.
{
  const players = [{ player_id: '1', adp: 5 }];
  // Different built_at strings make different BYTES, so a raw-bytes hash calls
  // them different. That is CORRECT for this tool: artifactDrift compares two
  // FILES, and two files that differ in any byte are two artifacts. The claim
  // pinned here is only that content is what decides — not that built_at is
  // specially ignored. Stated so nobody "fixes" this into parsing-and-stripping.
  const a = JSON.stringify({ built_at: 'T1', players });
  const b = JSON.stringify({ built_at: 'T2', players });
  ck('different bytes (even if only the stamp moved) -> not the same artifact, '
    + 'and that is the deliberate, documented semantic',
  FB.boardIdentity(a, b).same_board === false);
}

// ── 4. THE DIGEST IS REAL SHA256 OF THE RAW BYTES ──────────────────────────
{
  const raw = JSON.stringify({ built_at: 'x', players: [] });
  const id = FB.boardIdentity(raw, raw);
  const expected = crypto.createHash('sha256').update(raw).digest('hex');
  ck('pinned_sha256 is the sha256 of the exact raw bytes handed in (recover_with-'
    + 'compatible with board_pin.py\'s content addressing)',
  id.pinned_sha256 === expected, { got: id.pinned_sha256.slice(0, 16), expected: expected.slice(0, 16) });
}

// ── 5. INTEGRATION: the real artifactDrift() carries the new fields ────────
{
  const livePath = path.join(__dirname, '..', '..', 'public', 'draft_data.json');
  let pinnedPath = null;
  try { pinnedPath = FB.artifactPath(); } catch (e) { /* no pinned artifact */ }
  if (fs.existsSync(livePath) && pinnedPath && fs.existsSync(pinnedPath)) {
    const d = FB.artifactDrift();
    ck('the real artifactDrift() reports both sha256s beside both built_ats',
      typeof d.pinned_sha256 === 'string' && d.pinned_sha256.length === 64
        && typeof d.live_sha256 === 'string' && d.live_sha256.length === 64,
      { pinned: String(d.pinned_sha256).slice(0, 12), live: String(d.live_sha256).slice(0, 12) });
    ck('and same_board agrees with the digests, not the timestamps',
      d.same_board === (d.pinned_sha256 === d.live_sha256),
      { same_board: d.same_board, digests_equal: d.pinned_sha256 === d.live_sha256,
        stamps_equal: d.pinned_built_at === d.live_built_at });
  } else {
    console.log('SKIP  integration check — no pinned artifact or live board in this checkout '
      + '(UNCHECKED, not passed)');
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: same_board means "the same bytes", proven on the exact');
console.log('fail-arm C reproduced from git (one built_at, two boards), and the real');
console.log('artifactDrift() report carries the digests so a reader can verify identity');
console.log('rather than trust a boolean.');
console.log('WHAT IT DOES NOT: re-verify C\'s original git evidence (those commits are');
console.log('history), or fix the same class anywhere else — opening_script.py\'s');
console.log('fingerprint got the same fix separately (test_opening_script.py).');
