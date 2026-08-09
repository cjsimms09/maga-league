/* CLIENT PredLedger forecast emitters — the POST body is well-formed and deduped.
 * The client (public/js/draft/predledger.js) is otherwise only exercised over real
 * HTTP in CI; this stubs fetch so the forecast/resolution emitters are proven in
 * the sandbox too. Run: node draft/tests/client_forecast.test.js
 */
'use strict';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Capture every POST body the client would send.
const posts = [];
global.fetch = function (url, opts) {
  posts.push({ url: url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true }); } });
};

const PL = require('../../public/js/draft/predledger.js');

(async () => {
  PL._reset();

  await PL.forecast({ season: 2026, method: 'survival-forecast-v1', pick: 45,
    payload: { key: 'survival:p99@pick45', ftype: 'probability', value: 0.72,
      claim: 'survives to my next pick', resolution_rule: 'undrafted when my pick came' } });
  check('forecast POSTs to the ledger endpoint', posts.length === 1 && /\/ledger\/predict$/.test(posts[0].url));
  check('forecast body carries kind + the gradeable payload',
    posts[0].body.kind === 'forecast'
    && posts[0].body.payload.key === 'survival:p99@pick45'
    && posts[0].body.payload.ftype === 'probability'
    && posts[0].body.payload.resolution_rule, JSON.stringify(posts[0].body));

  // Dedup by forecast key: re-committing the same claim does not double-post.
  await PL.forecast({ season: 2026, method: 'survival-forecast-v1', pick: 45,
    payload: { key: 'survival:p99@pick45', ftype: 'probability', value: 0.72, resolution_rule: 'r' } });
  check('the same forecast key is deduped (no double-commit)', posts.length === 1);

  // A different key commits.
  await PL.forecast({ season: 2026, method: 'room-seat-forecast-v1', pick: 3,
    payload: { key: 'room_seat:r1p3', ftype: 'categorical', value: 'Bijan', resolution_rule: 'actual pick at overall 3' } });
  check('a different forecast key commits', posts.length === 2);

  // Resolution joins by forecast_key and is deduped by it.
  await PL.forecastResolution({ season: 2026, method: 'forecast-resolution-v1',
    payload: { forecast_key: 'survival:p99@pick45', outcome: 1, source: 'draft board' } });
  check('resolution POSTs with kind forecast_resolution + the join key',
    posts.length === 3 && posts[2].body.kind === 'forecast_resolution'
    && posts[2].body.payload.forecast_key === 'survival:p99@pick45');

  await PL.forecastResolution({ season: 2026,
    payload: { forecast_key: 'survival:p99@pick45', outcome: 0 } });
  check('a resolution for the same key is deduped (first resolution wins)', posts.length === 3);

  console.log('\n' + pass + '/' + (pass + fail) + ' client-forecast checks passed');
  process.exit(fail ? 1 : 0);
})();
