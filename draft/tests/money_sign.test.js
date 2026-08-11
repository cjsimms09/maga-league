/* ONE MINUS SIGN ACROSS THE SITE — A's helper and B's views must agree.
 *
 * `money()` emitted an ASCII hyphen (-$400) while B's views format the sign
 * themselves with a typographic MINUS SIGN (U+2212). Both landed in the SAME
 * TABLE on /bank: `money(run)` and `money(vc.balance)` hand it a negative and
 * got the hyphen; `_side_bets.ejs` and `_hist_money.ejs` do
 * `(n > 0 ? '+' : '−') + money(Math.abs(n))` and got the minus.
 *
 * Cosmetic, and pinned anyway: it is a CROSS-LANE agreement, and the two halves
 * live in different sessions' files. Nothing compared them, which is why it
 * survived to appear a column apart. B found it by eye and routed it rather than
 * crossing the lane.
 *
 * Run: node draft/tests/money_sign.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = require(path.join(ROOT, 'src', 'helpers.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const MINUS = '−';

ck('a negative renders with U+2212 MINUS SIGN, not an ASCII hyphen',
  H.money(-400) === MINUS + '$400', H.money(-400));
ck('  and specifically NOT U+002D', H.money(-400).indexOf('-') === -1, H.money(-400));
ck('positives are unchanged — no sign is added', H.money(400) === '$400', H.money(400));
ck('zero is not negative', H.money(0) === '$0', H.money(0));
ck('null still renders the em dash', H.money(null) === '—', H.money(null));
ck('thousands separator and cents survive',
  H.money(-1234.5) === MINUS + '$1,234.50', H.money(-1234.5));

/* THE CROSS-LANE HALF. B's views hand `money()` a POSITIVE and prefix their own
 * sign — so if this helper ever also emitted one, the result would be a doubled
 * `+−$400`. Asserted against B's real files rather than described, because the
 * agreement is the thing being tested and it spans two lanes. */
const VIEWS = ['views/partials/_side_bets.ejs', 'views/partials/_hist_money.ejs'];
VIEWS.forEach(v => {
  const p = path.join(ROOT, v);
  if (!fs.existsSync(p)) { console.log('SKIP  ' + v + ' absent'); return; }
  const src = fs.readFileSync(p, 'utf8');
  ck(v + ' uses U+2212 for its own sign', src.indexOf(MINUS) >= 0);
});
ck('money() adds NO sign to a positive, so B prefixing + cannot double it',
  H.money(400).indexOf('+') === -1 && H.money(400).indexOf(MINUS) === -1, H.money(400));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
