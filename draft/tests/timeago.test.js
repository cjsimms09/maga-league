/* timeago (redesign catalog 18) — one timestamp voice sitewide, deterministic
 * via injectable now. Also the fix for chat showing raw UTC clock time to a
 * Central-time league.
 */
'use strict';
const path = require('path');
const H = require(path.join(__dirname, '..', '..', 'src', 'helpers'));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : `  -> got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
};

const now = Date.parse('2026-08-24T20:00:00Z');
const t = iso => H.timeago(iso, now);

eq('under a minute is just now', t('2026-08-24T19:59:40Z'), 'just now');
eq('under an hour counts minutes', t('2026-08-24T19:15:00Z'), '45m ago');
eq('under a day counts hours', t('2026-08-24T03:00:00Z'), '17h ago');
eq('under a week is weekday + CENTRAL wall time (18:30Z = 1:30 PM CDT)',
  t('2026-08-21T18:30:00Z'), 'Fri 1:30 PM');
eq('older is the short date', t('2026-07-04T12:00:00Z'), '7/4');
eq('garbage renders empty, never NaN', t('garbage'), '');
eq('null renders empty', t(null), '');
eq('a future stamp (clock skew) reads just now, never negative', t('2026-08-24T20:00:30Z'), 'just now');

console.log(`\n${pass}/${pass + fail} timeago checks passed`);
process.exit(fail ? 1 : 0);
