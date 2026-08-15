// TERRITORY: A
/* IN-SEASON DECISION CAPTURE — the client side of the gap DECISIONS-NEEDED.md
 * flagged 2026-08-15: lineup_call / waiver_claim / stream_call / trade_eval /
 * inseason_override were registered server-side (src/predledger.js) and graded
 * (src/forecast_grade.js's INSEASON_DECISION_KINDS) with no client call site
 * ever emitting them — a fully-built resolver with nothing to resolve.
 *
 * This tests only the NEW client helpers added to public/js/draft/predledger.js
 * (lineupCall/waiverClaim/streamCall/tradeEval/inseasonOverride) — the queue/
 * retry/durability machinery they route through is already covered by
 * predledger_durability.test.js and is not re-tested here.
 *
 * Run: node draft/tests/predledger_inseason_capture.test.js
 */
'use strict';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail !== undefined ? '\n        -> ' + String(detail).slice(0, 300) : '')); }
}

function memStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

const posted = [];
global.fetch = function (url, opts) {
  posted.push(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
};
global.localStorage = memStorage();

const PL = require('../../public/js/draft/predledger.js');

(async function () {
  const HELPERS = [
    ['lineupCall', 'lineup_call'],
    ['waiverClaim', 'waiver_claim'],
    ['streamCall', 'stream_call'],
    ['tradeEval', 'trade_eval'],
    ['inseasonOverride', 'inseason_override'],
  ];

  // --- 1. every helper exists and is a function ---------------------------
  HELPERS.forEach(([name]) => {
    check('PredLedger.' + name + ' exists', typeof PL[name] === 'function');
  });

  // --- 2. each helper sends the RIGHT kind, with the payload intact -------
  for (const [name, kind] of HELPERS) {
    PL._reset();
    posted.length = 0;
    await PL[name]({ season: 2026, payload: {
      key: 'wk3|' + kind, chosen: 'p1', counterfactual: 'p2', extra: 'x',
    } });
    await new Promise(r => setTimeout(r, 0)); // let the queue drain
    check(name + ' posts kind="' + kind + '"',
      posted.length === 1 && posted[0].kind === kind,
      posted[0] && posted[0].kind);
    check(name + ' payload passes through untouched (key/chosen/counterfactual/extra)',
      posted.length === 1
      && posted[0].payload.key === 'wk3|' + kind
      && posted[0].payload.chosen === 'p1'
      && posted[0].payload.counterfactual === 'p2'
      && posted[0].payload.extra === 'x',
      JSON.stringify(posted[0] && posted[0].payload));
  }

  // --- 3. deduped by payload.key, same as forecast() ------------------------
  {
    PL._reset();
    posted.length = 0;
    const info = { season: 2026, payload: { key: 'wk4|dedup', chosen: 'a', counterfactual: 'b' } };
    await PL.lineupCall(info);
    await PL.lineupCall(info); // same key again — must NOT post twice
    await new Promise(r => setTimeout(r, 0));
    check('a second call with the SAME key is deduped, not re-posted',
      posted.length === 1, 'posted ' + posted.length + ' times');
  }

  // --- 4. a DIFFERENT key for the same kind is NOT deduped -----------------
  {
    PL._reset();
    posted.length = 0;
    await PL.waiverClaim({ season: 2026, payload: { key: 'wk5|a', chosen: 'a', counterfactual: null } });
    await PL.waiverClaim({ season: 2026, payload: { key: 'wk5|b', chosen: 'c', counterfactual: null } });
    await new Promise(r => setTimeout(r, 0));
    check('two different keys for the same kind BOTH post',
      posted.length === 2, 'posted ' + posted.length + ' times');
  }

  // --- 5. these are registered as real kinds, not a made-up client string ---
  // (server-side enforcement is predledger.test.js's job; this only checks the
  // client and server AGREE on the kind strings, which is the two-places risk.)
  const P = require('../../src/predledger.js');
  HELPERS.forEach(([, kind]) => {
    check('server KINDS includes "' + kind + '" (client/server agree)',
      P.KINDS.indexOf(kind) >= 0);
    check('server COUNTERFACTUAL_KINDS includes "' + kind + '"',
      P.COUNTERFACTUAL_KINDS.indexOf(kind) >= 0);
  });

  console.log(`\n${pass}/${pass + fail} in-season capture checks passed`);
  if (fail) process.exit(1);
})();
