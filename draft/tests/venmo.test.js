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
  // `missing()` was deleted 2026-08-11 under rule 14 — its only callers were
  // these two assertions. See the note in src/venmo.js. The live nag is
  // `needsNag`, checked below, and the commissioner's list is /admin's
  // contactStatus, which reports a different quantity.
  check('needsNag fires for a handle-less logged-in owner', V.needsNag(noHandle) === true);
  check('needsNag suppresses once a handle is filled', V.needsNag(withHandle) === false);
  check('needsNag is false for no owner (logged out)', V.needsNag(null) === false);
}

// --- WIRING (venmo-wiring verification): one handle, entered once, ---------
// correct everywhere. Both surfaces write through applyProfileUpdate to the
// SAME owner record; every reader renders from that record.
{
  const owners = [
    { id: 1, name: 'Cory', paypal: 'cory-pp', zelle: 'cory@x.com' },  // no venmo yet
    { id: 2, name: 'Richard' },
  ];
  const me = owners[0];

  // Before the save: the nag fires and every money surface shows the fallback.
  check('wiring: before any save, the nag fires for me', V.needsNag(me) === true);
  check('wiring: settlement shows the loud fallback before the save',
    V.render(me).label === V.FALLBACK);

  // THE HOME-BANNER SAVE: posts venmo alone (plus the back field).
  V.applyProfileUpdate(me, { venmo: '@cory-simms', back: 'home' });

  // ...and every reader sees it, from the single write:
  check('wiring: How to Pay renders the handle after the home-banner save',
    V.render(me).label === '@cory-simms');
  check('wiring: the settlement deep link works from the same record',
    V.link(me, { amount: 25 }).indexOf('venmo.com/u/cory-simms') > 0);
  check('wiring: the nag suppresses for me', V.needsNag(me) === false);

  // The clobber bug, locked out: the venmo-only save left the OTHER fields alone.
  check('wiring: a venmo-only save never wipes paypal/zelle entered elsewhere',
    me.paypal === 'cory-pp' && me.zelle === 'cory@x.com');

  // EDIT FROM THE OTHER SURFACE: the Finances form updates the same record.
  V.applyProfileUpdate(me, { venmo: 'cory-simms-2', paypal: 'cory-pp', cashapp: '', zelle: 'cory@x.com' });
  check('wiring: an edit from How to Pay updates the one record everywhere',
    V.render(me).label === '@cory-simms-2');

  // An explicitly-present empty string is an intentional clear — honored.
  V.applyProfileUpdate(me, { venmo: '' });
  check('wiring: an explicit empty venmo clears it (and the nag returns)',
    V.needsNag(me) === true && V.render(me).label === V.FALLBACK);

  // Junk fields in the body never land on the record.
  V.applyProfileUpdate(me, { venmo: 'ok', is_commissioner: true, evil: 'x' });
  check('wiring: only the four payment fields can be written through this path',
    me.is_commissioner === undefined && me.evil === undefined && me.venmo === 'ok');
}

console.log(`\n${pass}/${pass + fail} venmo checks passed`);
process.exit(fail ? 1 : 0);
