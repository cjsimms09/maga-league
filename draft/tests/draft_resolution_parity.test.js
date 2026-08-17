// TERRITORY: A
/* DRAFT-NIGHT RESOLUTION PARITY — the "parallel test" that was claimed and
 * never existed (loop review 2026-08-15).
 *
 * public/js/draft/forecast.js `buildResolutions` (the LIVE path — the war-room
 * client resolves room_seat/survival forecasts the moment the board finishes)
 * carries the comment "Mirror of forecast_grade.build_resolutions (kept in
 * step by parallel tests)". The audit found the other half of that sentence:
 * src/forecast_grade.js `buildDraftResolutions` has ZERO callers and ZERO
 * tests — an untested mirror is exactly how the two ends of a loop come to
 * disagree about the same draft. This file makes the claimed parity real:
 * same forecasts, same finished board, byte-equal resolution payloads. If a
 * future change touches one side only, this goes red.
 *
 * Run: node draft/tests/draft_resolution_parity.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade.js'));
const DF = require(path.join(ROOT, 'public', 'js', 'draft', 'forecast.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// A finished round-1 board with a mid-draft survival claim landscape:
// picks 1..6, one forecast per shape the resolvers know.
const draft = { picks: [
  { overall: 1, player_id: 'p-cmc' },
  { overall: 2, player_id: 'p-jj' },
  { overall: 3, player_id: 'p-tyreek' },
  { overall: 4, player_id: 'p-bijan' },
  { overall: 5, player_id: 'p-amon' },
  { overall: 6, player_id: 'p-gibbs' },
] };

const forecasts = [
  // room_seat: resolved (seat picked), and unresolved (seat never reached)
  { payload: { key: 'room_seat:r1p3', value: 'p-tyreek' } },
  { payload: { key: 'room_seat:r1p9', value: 'p-nacua' } },
  // survival: taken before the pick (0), survived to the pick (1),
  // and a claim whose pick was never reached (stays pending)
  { payload: { key: 'survival:p-jj@pick4', value: 0.4 } },
  { payload: { key: 'survival:p-gibbs@pick5', value: 0.7 } },
  { payload: { key: 'survival:p-nacua@pick9', value: 0.9 } },
  // noise the resolvers must ignore
  { payload: { key: 'lrm:whatever', value: 1 } },
  { payload: {} },
];

const server = FG.buildDraftResolutions(forecasts, draft);
const client = DF.buildResolutions(forecasts, draft);

ck('both sides resolve the SAME set of forecasts (2 room_seat pending/1, '
  + '2 survival graded, 1 survival pending)',
server.length === 3 && client.length === 3,
{ server: server.length, client: client.length });

const key = r => r.payload.forecast_key;
const byKey = rows => Object.fromEntries(rows.map(r => [key(r), r.payload]));
const s = byKey(server), c = byKey(client);

ck('the resolved key sets are identical',
  JSON.stringify(Object.keys(s).sort()) === JSON.stringify(Object.keys(c).sort()),
  { server: Object.keys(s).sort(), client: Object.keys(c).sort() });

for (const k of Object.keys(s).sort()) {
  ck(`${k}: outcome and source agree exactly`,
    c[k] && s[k].outcome === c[k].outcome && s[k].source === c[k].source,
    { server: s[k], client: c[k] });
}

ck('room_seat resolves to the player actually taken at that overall',
  s['room_seat:r1p3'] && s['room_seat:r1p3'].outcome === 'p-tyreek');
ck('a survival claim on a player taken BEFORE its pick resolves 0',
  s['survival:p-jj@pick4'] && s['survival:p-jj@pick4'].outcome === 0);
ck('a survival claim on a player still on the board AT its pick resolves 1',
  s['survival:p-gibbs@pick5'] && s['survival:p-gibbs@pick5'].outcome === 1);
ck('a claim whose pick was never reached stays PENDING on both sides '
  + '(no fabricated outcome)',
!s['survival:p-nacua@pick9'] && !c['survival:p-nacua@pick9']
  && !s['room_seat:r1p9'] && !c['room_seat:r1p9']);

// The server rows must also be shaped for the real ledger append.
ck('server rows carry kind/method for the predledger append path',
  server.every(r => r.kind === 'forecast_resolution'
    && r.method === 'forecast-resolution-v1'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
