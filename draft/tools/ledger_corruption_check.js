#!/usr/bin/env node
'use strict';
/* LEDGER CORRUPTION CHECK — for the double-escape bug fixed 2026-08-15
 * (see TODO.md's "A REAL BUG, NOT A JUDGMENT CALL" entry and the commit that
 * fixed views/lineup.ejs + views/waivers.ejs).
 *
 * That bug predates this session and hit /lineup/log + /lineup/override too,
 * which have been live since before today. If the site was used for real
 * before the fix shipped, some lineup_call / inseason_override / waiver_claim
 * / stream_call entries may have a mangled string instead of a parsed
 * object/array in the field that matters most — the tool's actual
 * recommendation at decision time, which is the whole reason this ledger
 * exists (Sleeper can tell you what happened; only this ledger can tell you
 * what the tool said BEFORE it happened).
 *
 * THIS TOOL DOES NOT TOUCH THE LIVE SITE ITSELF — it reads a JSON file. To
 * check the real ledger:
 *   1. Log into the live site as commissioner.
 *   2. Visit /admin/api/ledger/predict?season=2026 (or whichever season) —
 *      it's a read-only GET, already gated to the commissioner
 *      (src/routes/admin.js's whole router is requireCommissioner), already
 *      shipped, nothing new to build to use it.
 *   3. Save that response as a .json file.
 *   4. node draft/tools/ledger_corruption_check.js path/to/saved.json
 *
 * Exit code is 1 if anything is flagged, 0 if clean — safe to wire into a
 * CI/cron check later if this turns out to matter ongoing, not just once.
 */
const fs = require('fs');

// Which payload fields are SUPPOSED to be a parsed object/array (they went
// through src/routes/member.js's safeJson()) for each affected kind. Left OUT
// on purpose: waiver_claim's `counterfactual`, which src/routes/member.js
// hardcodes as the literal string 'hold priority' — never touches
// req.body.counterfactual at all, so it is never a JSON field and flagging it
// here would be a false positive on every healthy waiver_claim entry.
const JSON_SHAPED_FIELDS = {
  lineup_call: ['recommended', 'counterfactual'],
  waiver_claim: ['chosen', 'drop'],
  stream_call: ['chosen', 'counterfactual'],
  inseason_override: ['recommended', 'counterfactual'],
};

// The literal substrings a double-escaped value leaves behind — present in
// ANY string field (not just the JSON-shaped ones) whose source text
// happened to contain a real quote character, e.g. lineup_call's free-text
// `confidence` field.
const ESCAPE_ARTIFACT = /&quot;|&amp;|&#34;/;

function findCorrupted(entries) {
  const flagged = [];
  for (const e of entries || []) {
    if (!e || !e.kind) continue;
    const jsonFields = JSON_SHAPED_FIELDS[e.kind];
    const payload = e.payload || {};
    const reasons = [];
    if (jsonFields) {
      for (const f of jsonFields) {
        const v = payload[f];
        // A parse failure's fallback is always a STRING (safeJson's catch
        // branch); the correct shape is always an object or array. null is a
        // legitimate "nothing there" and is not itself evidence of anything.
        if (typeof v === 'string') reasons.push(`payload.${f} is a raw string, not parsed JSON (likely the double-escape bug)`);
      }
    }
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string' && ESCAPE_ARTIFACT.test(v)) {
        reasons.push(`payload.${k} contains an HTML-escape artifact ("${v.slice(0, 80)}")`);
      }
    }
    if (reasons.length) flagged.push({ id: e.id, kind: e.kind, method: e.method, decision_at: e.decision_at, reasons });
  }
  return flagged;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node draft/tools/ledger_corruption_check.js <path-to-ledger.json>');
    console.error('  (see the header comment in this file for how to produce that file)');
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = Array.isArray(raw) ? raw : (raw.entries || []);
  if (!entries.length) {
    console.log('no entries found in ' + file + ' (wrong file, or an empty season)');
    process.exit(0);
  }
  const flagged = findCorrupted(entries);
  console.log(`checked ${entries.length} entries, ${flagged.length} flagged`);
  for (const f of flagged) {
    console.log(`\n${f.kind} / ${f.method} (${f.id}, ${f.decision_at})`);
    for (const r of f.reasons) console.log('  - ' + r);
  }
  if (flagged.length) {
    console.log(`\n${flagged.length} entries carry the double-escape bug's signature. Their `
      + `recommended/counterfactual/chosen/drop field is not recoverable — the tool's actual `
      + `call at decision time is gone for those entries specifically (everything else on them, `
      + `including week/dollars/owner_id, is fine). Entries logged AFTER the fix shipped `
      + '(2026-08-15) are unaffected.');
  }
  process.exit(flagged.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { findCorrupted, JSON_SHAPED_FIELDS, ESCAPE_ARTIFACT };
