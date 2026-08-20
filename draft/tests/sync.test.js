/* Draft-ID parsing.
 *
 * This exists because of a real report from a real draft rehearsal: pasting the
 * mock's URL produced "Sleeper unreachable (HTTP 400)". Sleeper was never
 * contacted — our own proxy allowlist rejected the malformed path and the UI
 * blamed the other end. Two bugs: we could not read what people actually paste,
 * and we lied about whose fault it was.
 */
const path = require('path');
const DraftSync = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'sync.js'));
const norm = DraftSync.normalizeDraftId;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const ID = '1234567890123456789';

console.log('\n--- what people actually paste ---');
ok('a bare id', norm(ID).id === ID);
ok('the draft URL, which is what is in front of them',
  norm('https://sleeper.com/draft/nfl/' + ID).id === ID, norm('https://sleeper.com/draft/nfl/' + ID).id);
ok('the app domain too', norm('https://sleeper.app/draft/nfl/' + ID).id === ID);
ok('with a trailing slash', norm('sleeper.com/draft/nfl/' + ID + '/').id === ID);
ok('with a query string on the end', norm('https://sleeper.com/draft/nfl/' + ID + '?invite=abc').id === ID);
ok('with surrounding whitespace', norm('  ' + ID + '  ').id === ID);
ok('with a zero-width character from a phone share sheet',
  norm('​' + ID + '﻿').id === ID, JSON.stringify(norm('​' + ID + '﻿')));
ok('with a newline from a double-tap copy', norm(ID + '\n').id === ID);

console.log('\n--- and what it refuses ---');
ok('nonsense is refused rather than sent', norm('banana').id === null);
ok('and the refusal tells you where to find the number',
  /sleeper\.com\/draft\/nfl/.test(norm('banana').error || ''), norm('banana').error);
ok('a short number is not a draft id', norm('42').id === null);
ok('empty is not an error, it is manual mode',
  norm('').id === null && norm('').error === null);
ok('null is handled', norm(null).id === null && norm(null).error === null);
ok('undefined is handled', norm(undefined).id === null);

console.log('\n--- the id survives into the sync ---');
{
  const s = new DraftSync({ draftId: 'https://sleeper.com/draft/nfl/' + ID });
  ok('a pasted URL produces a usable draftId', s.draftId === ID, s.draftId);
  ok('and no error', !s.idError);
}
{
  const s = new DraftSync({ draftId: 'banana' });
  ok('a bad paste carries the error instead of a draftId', !s.draftId && !!s.idError);
  let status = null;
  s.onStatus = m => { status = m; };
  s.start();
  ok('and starting says so rather than polling', status && status.state === 'error', JSON.stringify(status));
  ok('without ever running', s.running !== true);
}
{
  const s = new DraftSync({ draftId: '' });
  let status = null;
  s.onStatus = m => { status = m; };
  s.start();
  ok('no id at all is manual mode, not an error',
    status && status.state === 'manual', JSON.stringify(status));
}

// --- a mock draft has no rosters, and the seat lives in draft_slot ---------
// Reported from a real mock: a round-4 pick (Colston Loveland) never
// registered. allPicks() dropped draft_slot, and reconcile reads
// `draft_slot || roster_id`. A LEAGUE draft has roster_id so the omission was
// invisible; a MOCK sends roster_id null, so every pick resolved to a null
// seat and belonged to nobody.
{
  const s = new DraftSync({ draftId: '123', onPicks: function () {}, onStatus: function () {} });
  s.picks = [
    { player_id: '12517', pick_no: 34, round: 4, draft_slot: 4, roster_id: null,
      picked_by: 'u1', metadata: { first_name: 'Colston', last_name: 'Loveland' } },
    { player_id: '999', pick_no: 35, round: 4, draft_slot: 5, roster_id: null, picked_by: 'u2' },
  ];
  const out = s.allPicks();
  ok('a mock pick keeps its seat, so it can be attributed to a team',
    out[0].draft_slot === 4 && out[1].draft_slot === 5,
    JSON.stringify(out.map(function (p) { return p.draft_slot; })));
  ok('and the pick itself survives normalisation',
    out.length === 2 && out[0].player_id === '12517');

  ok('reconcile can resolve a seat from draft_slot alone (roster_id null)',
    (out[0].draft_slot || out[0].roster_id || null) === 4);

  // A league draft must keep working through the roster_id fallback.
  const s2 = new DraftSync({ draftId: '124', onPicks: function () {}, onStatus: function () {} });
  s2.picks = [{ player_id: '77', pick_no: 1, round: 1, roster_id: 7, picked_by: 'u7' }];
  const o2 = s2.allPicks();
  ok('a league pick with no draft_slot still resolves via roster_id',
    (o2[0].draft_slot || o2[0].roster_id || null) === 7);

  // Sleeper sometimes nests it in metadata.
  const s3 = new DraftSync({ draftId: '125', onPicks: function () {}, onStatus: function () {} });
  s3.picks = [{ player_id: '88', pick_no: 2, round: 1, roster_id: null,
                metadata: { draft_slot: 9 } }];
  ok('draft_slot nested in metadata is found too',
    s3.allPicks()[0].draft_slot === 9);

  const s4 = new DraftSync({ draftId: '126', onPicks: function () {}, onStatus: function () {} });
  s4.addManual('12517', 4);
  ok('a typed pick carries a seat, or it belongs to nobody either',
    s4.allPicks()[0].draft_slot === 4);
}

// IS_KEEPER MUST SURVIVE NORMALISATION — Sleeper serves it on every pick
// (log_draft_picks.py's own _from_sleeper reads the identical field), and
// reconcile.js/selectionIndexOf both key off `p.is_keeper` on whatever
// allPicks() returns. Found empirically, session E 2026-08-18: with a real
// keeper correctly placed on Sleeper, allPicks() silently dropped is_keeper
// building its output object (same shape as the draft_slot omission fixed
// just above, in the same function) — reconcile() then reported the keeper
// "missing... still on the board" and halted, on a slate that was correct.
{
  const s = new DraftSync({ draftId: '127', onPicks: function () {}, onStatus: function () {} });
  s.picks = [
    { player_id: '7564', pick_no: 8, round: 1, draft_slot: 8, roster_id: 8, is_keeper: true },
    { player_id: '999', pick_no: 9, round: 1, draft_slot: 3, roster_id: 3, is_keeper: false },
    { player_id: '111', pick_no: 10, round: 1, draft_slot: 4, roster_id: 4 },  // field absent entirely
  ];
  const out = s.allPicks();
  ok('a keeper pick carries is_keeper: true through normalisation',
    out.find(function (p) { return p.player_id === '7564'; }).is_keeper === true, JSON.stringify(out));
  ok('an ordinary pick carries is_keeper: false, not undefined',
    out.find(function (p) { return p.player_id === '999'; }).is_keeper === false);
  ok('a pick with no is_keeper field at all normalises to false, not undefined',
    out.find(function (p) { return p.player_id === '111'; }).is_keeper === false);
}

console.log(`\n${pass}/${pass + fail} sync checks passed`);
process.exit(fail ? 1 : 0);
