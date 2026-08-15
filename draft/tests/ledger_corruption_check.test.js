'use strict';
// TERRITORY: A
// THE DIAGNOSTIC ITSELF, PROVEN AGAINST BOTH SHAPES — the exact corrupted
// string the double-escape bug produces, and the healthy parsed object it's
// supposed to produce post-fix. Built alongside draft/tools/ledger_corruption_
// check.js so whoever runs it against a real exported ledger (see that file's
// header for how) can trust the result rather than take it on faith.
//
// Run: node draft/tests/ledger_corruption_check.test.js
const path = require('path');
const { findCorrupted } = require(path.join(__dirname, '..', 'tools', 'ledger_corruption_check.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// The EXACT corrupted string a real double-escaped submission produces —
// reproduced from the real bug this session found and fixed, not invented.
const CORRUPTED_CHOSEN = '{&quot;id&quot;:&quot;f1&quot;,&quot;name&quot;:&quot;Streamer Kicker&quot;}';

// ── A clean, post-fix entry must never be flagged ────────────────────────
{
  const clean = [{
    id: '2026-000000001', kind: 'stream_call', method: 'waiver-tool-stream-v1',
    payload: { owner_id: 1, week: 3, chosen: { id: 'f1', name: 'Streamer Kicker' },
      counterfactual: { player_id: 'm8', name: 'Weak Kicker' }, dollars: 12 },
  }];
  const flagged = findCorrupted(clean);
  ck('a healthy stream_call entry (parsed objects) is never flagged', flagged.length === 0, flagged);
}

// ── A corrupted stream_call/waiver_claim/lineup_call entry IS flagged ────
{
  const corrupted = [{
    id: '2026-000000002', kind: 'stream_call', method: 'waiver-tool-stream-v1',
    payload: { owner_id: 1, week: 3, chosen: CORRUPTED_CHOSEN,
      counterfactual: { player_id: 'm8', name: 'Weak Kicker' }, dollars: 12 },
  }];
  const flagged = findCorrupted(corrupted);
  ck('a stream_call with a raw-string "chosen" is flagged', flagged.length === 1, flagged);
  ck('  names the specific field, not just the entry', /payload\.chosen/.test(flagged[0].reasons[0]), flagged[0]);
}

// ── THE FALSE-POSITIVE TRAP: waiver_claim's counterfactual is a HARDCODED
// plain string ("hold priority") by design — src/routes/member.js never even
// reads req.body.counterfactual for that route. Flagging it would tell
// whoever runs this that EVERY waiver_claim ever written is corrupted, which
// is false and would make the tool worthless the first time it's run for
// real. ────────────────────────────────────────────────────────────────────
{
  const healthyWaiverClaim = [{
    id: '2026-000000003', kind: 'waiver_claim', method: 'waiver-tool-v1',
    payload: { owner_id: 1, week: 3, chosen: { id: 'x', name: 'Add Guy' },
      counterfactual: 'hold priority', drop: { id: 'y', name: 'Cut Guy' }, dollars: 8, contested: false },
  }];
  const flagged = findCorrupted(healthyWaiverClaim);
  ck('waiver_claim\'s legitimate "hold priority" string counterfactual is NOT a false positive',
    flagged.length === 0, flagged);
}
{
  // But a genuinely corrupted `chosen`/`drop` on the SAME kind must still catch.
  const corruptedWaiverClaim = [{
    id: '2026-000000004', kind: 'waiver_claim', method: 'waiver-tool-v1',
    payload: { owner_id: 1, week: 3, chosen: CORRUPTED_CHOSEN,
      counterfactual: 'hold priority', drop: { id: 'y', name: 'Cut Guy' }, dollars: 8 },
  }];
  const flagged = findCorrupted(corruptedWaiverClaim);
  ck('  while a corrupted "chosen" on the same kind is still caught', flagged.length === 1, flagged);
}

// ── CONTENT-LEVEL corruption on a plain string field (confidence) — the
// field's TYPE is still "string" (it always was), so the type-check above
// can't catch this; only the escape-artifact substring check can. ─────────
{
  const corruptedConfidence = [{
    id: '2026-000000005', kind: 'lineup_call', method: 'lineup-optimizer-v1',
    payload: { owner_id: 1, week: 3, recommended: [{ id: 'a' }], counterfactual: [{ id: 'b' }],
      confidence: 'high — &quot;clear&quot; starter' },
  }];
  const flagged = findCorrupted(corruptedConfidence);
  ck('a mangled free-text confidence field is flagged even though its TYPE is correct',
    flagged.length === 1 && /confidence/.test(flagged[0].reasons.join(' ')), flagged);
}

// ── null is a legitimate "nothing here", never evidence of corruption ────
{
  const nulls = [{
    id: '2026-000000006', kind: 'lineup_call', method: 'lineup-optimizer-v1',
    payload: { owner_id: 1, week: null, recommended: [{ id: 'a' }], counterfactual: [{ id: 'b' }],
      confidence: '', dollars: null },
  }];
  const flagged = findCorrupted(nulls);
  ck('null/empty fields are never flagged as corrupted', flagged.length === 0, flagged);
}

// ── unrelated kinds (forecast, pick, etc.) are never scanned — they were
// never routed through the buggy views at all, and forcing a shape check on
// them would be pure noise. ────────────────────────────────────────────────
{
  const unrelated = [{ id: '2026-000000007', kind: 'forecast', method: 'x',
    payload: { note: 'plain text, not JSON, by design for this kind' } }];
  ck('a kind never written through the affected forms is not scanned at all',
    findCorrupted(unrelated).length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
