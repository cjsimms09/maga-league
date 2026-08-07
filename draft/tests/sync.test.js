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

console.log(`\n${pass}/${pass + fail} sync checks passed`);
process.exit(fail ? 1 : 0);
