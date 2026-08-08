/* Payment handles — one home, rendered everywhere money changes hands.
 *
 * A Venmo handle is a data-spine manual-entry fact: it exists nowhere else, so
 * each owner types it once (on their profile) and every surface that moves money
 * — the settlement, the side-bet ledger, the dues line, January's Annual — reads
 * it from here. Nobody re-types a handle the site already knows.
 *
 * Two rules this module enforces so the callers do not each reinvent them:
 *   * a missing handle renders LOUD ("no Venmo on file"), never blank — a blank
 *     reads as "no money owed", which on a settlement screen is a real error.
 *   * the deep link is venmo.com/u/<handle> with the stored bare handle (the
 *     leading @ is already stripped at entry), so a tap opens the app on that
 *     person. An amount/note can be attached for the actionable-invoice case.
 */
'use strict';

const FALLBACK = 'no Venmo on file';

/** The bare stored handle, or null. Defensive strip in case an @ slipped in. */
function handle(owner) {
  const h = owner && owner.venmo ? String(owner.venmo).trim().replace(/^@+/, '') : '';
  return h || null;
}

function has(owner) {
  return !!handle(owner);
}

/**
 * Deep link to pay this owner. Optionally pre-fills the Venmo pay screen with an
 * amount and note, turning a settlement line into a one-tap invoice.
 * @param opts {amount, note, action:'pay'|'charge'}
 */
function link(owner, opts = {}) {
  const h = handle(owner);
  if (!h) return null;
  const base = `https://venmo.com/u/${encodeURIComponent(h)}`;
  const q = [];
  if (opts.amount != null && Number(opts.amount) > 0) {
    q.push('txn=' + (opts.action === 'charge' ? 'charge' : 'pay'));
    q.push('amount=' + encodeURIComponent(Number(opts.amount).toFixed(2)));
  }
  if (opts.note) q.push('note=' + encodeURIComponent(String(opts.note).slice(0, 80)));
  return q.length ? `${base}?${q.join('&')}` : base;
}

/**
 * One object a template can render without branching: whether a handle exists,
 * the @label (or the loud fallback), and the tappable url (null when missing).
 */
function render(owner, opts = {}) {
  const h = handle(owner);
  return {
    has: !!h,
    handle: h,
    label: h ? '@' + h : FALLBACK,
    url: h ? link(owner, opts) : null,
  };
}

/** Owners with NO handle on file — drives the nag and the commissioner list. */
function missing(owners) {
  return (owners || []).filter(o => !has(o));
}

/** Does THIS owner need the add-your-Venmo nag? (Logged-in owner, no handle.) */
function needsNag(owner) {
  return !!owner && !has(owner);
}

/**
 * Apply a payment-info update to the ONE owner record — from EITHER surface.
 *
 * Two writers exist by design (the home-page banner posts venmo alone; the
 * Finances "How to Pay" form posts all four), and both land here. The rule the
 * data spine demands: a field ABSENT from the body is left alone — the
 * home-banner save must never wipe the paypal/cashapp/zelle somebody entered on
 * the other surface. An empty string PRESENT in the body is an intentional
 * clear and is honored.
 */
const FIELDS = { venmo: 60, paypal: 80, cashapp: 60, zelle: 80 };

function applyProfileUpdate(owner, body) {
  if (!owner || !body) return owner;
  const clean = (v, n) => String(v == null ? '' : v).trim().replace(/^@+/, '').slice(0, n);
  for (const f of Object.keys(FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      owner[f] = clean(body[f], FIELDS[f]);
    }
  }
  return owner;
}

module.exports = { FALLBACK, FIELDS, handle, has, link, render, missing, needsNag,
                   applyProfileUpdate };
