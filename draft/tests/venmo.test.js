/* Payment handles — the data-spine payment-link layer (venmo-handles.md §5).
 * Run: node draft/tests/venmo.test.js
 */
'use strict';
const V = require('../../src/venmo.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const withHandle = { id: 1, name: 'Cory', venmo: 'cory-simms' };
const withAt = { id: 2, name: 'Richard', venmo: '@richard21' };
const noHandle = { id: 3, name: 'David' };
const blankHandle = { id: 4, name: 'Mike', venmo: '   ' };

// --- handle + presence ------------------------------------------------------
check('a stored handle round-trips bare', V.handle(withHandle) === 'cory-simms');
check('a stray leading @ is stripped defensively', V.handle(withAt) === 'richard21');
check('a missing handle is null', V.handle(noHandle) === null);
check('a blank/whitespace handle is null (not a false positive)', V.handle(blankHandle) === null);
check('has() is true only with a real handle', V.has(withHandle) && !V.has(noHandle) && !V.has(blankHandle));

// --- deep links -------------------------------------------------------------
check('link is venmo.com/u/<handle>', V.link(withHandle) === 'https://venmo.com/u/cory-simms');
check('a missing handle has no link (null, never a broken url)', V.link(noHandle) === null);
{
  const url = V.link(withHandle, { amount: 60, note: 'week 5 side bet' });
  check('an amount makes it a pay invoice', /txn=pay/.test(url) && /amount=60\.00/.test(url), url);
  check('the note is attached and encoded', /note=week%205%20side%20bet/.test(url), url);
  const charge = V.link(withHandle, { amount: 25, action: 'charge' });
  check('charge action is honored', /txn=charge/.test(charge), charge);
}

// --- render (loud fallback, never blank) ------------------------------------
{
  const r = V.render(withHandle, { amount: 40 });
  check('render of a real handle: has + @label + url', r.has && r.label === '@cory-simms' && !!r.url, JSON.stringify(r));
  const m = V.render(noHandle);
  check('render of a missing handle is LOUD, never blank', !m.has && m.label === 'no Venmo on file' && m.url === null, JSON.stringify(m));
  check('the fallback is a non-empty visible string', V.FALLBACK.length > 0 && m.label === V.FALLBACK);
}

// --- nag + commissioner list ------------------------------------------------
{
  const owners = [withHandle, withAt, noHandle, blankHandle];
  const miss = V.missing(owners);
  check('missing() lists exactly the handle-less owners', miss.length === 2
    && miss.every(o => [3, 4].includes(o.id)), JSON.stringify(miss.map(o => o.id)));
  check('needsNag fires for a handle-less logged-in owner', V.needsNag(noHandle) === true);
  check('needsNag suppresses once a handle is filled', V.needsNag(withHandle) === false);
  check('needsNag is false for no owner (logged out)', V.needsNag(null) === false);
}

console.log(`\n${pass}/${pass + fail} venmo checks passed`);
process.exit(fail ? 1 : 0);
