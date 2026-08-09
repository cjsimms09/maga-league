// ─────────────────────────────────────────────────────────────────────────────
// SETTLEMENT REPORT — the invoice. The machine that computes the money writes
// who-pays-whom, so nobody settles a season from memory.
//
// From the season's net positions (ledger balances: + = the league owes you,
// − = you owe), produce the minimal set of owner-to-owner transfers that clears
// everyone to zero, each with the payer→payee Venmo link. Pure + testable; the
// Finances page renders it and the Annual emits it as the sealed-season artifact.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const r2 = n => Math.round(n * 100) / 100;

/**
 * @param nets   [{ owner_id, name, net }]  net position, + owed-to / − owes
 * @param venmoOf (owner_id) => { handle, url } | null
 * @returns {
 *   rows:      the nets, sorted (biggest creditor first),
 *   transfers: [{ from_id, from, to_id, to, amount, venmo }]  minimal payer→payee list
 *   total:     total dollars moving,
 *   balanced:  true if creditors and debtors net to ~zero (a real season should),
 *   imbalance: the leftover (non-zero means the books don't close — surfaced, not hidden)
 * }
 */
function settlementReport(nets, venmoOf = () => null) {
  const rows = [...nets].map(n => ({ ...n, net: r2(n.net) })).sort((a, b) => b.net - a.net);
  // Work on copies so we can draw balances down as we match.
  const creditors = rows.filter(r => r.net > 0.005).map(r => ({ ...r }));
  const debtors = rows.filter(r => r.net < -0.005).map(r => ({ ...r, net: -r.net })); // positive = amount owed
  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => b.net - a.net);

  const transfers = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci], d = debtors[di];
    const amt = r2(Math.min(c.net, d.net));
    if (amt > 0.005) {
      const v = venmoOf(c.owner_id);   // payee's handle — the debtor pays the creditor
      transfers.push({ from_id: d.owner_id, from: d.name, to_id: c.owner_id, to: c.name, amount: amt, venmo: v || null });
    }
    c.net = r2(c.net - amt); d.net = r2(d.net - amt);
    if (c.net <= 0.005) ci++;
    if (d.net <= 0.005) di++;
  }

  const sumPos = rows.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0);
  const sumNeg = rows.filter(r => r.net < 0).reduce((s, r) => s + r.net, 0);
  const imbalance = r2(sumPos + sumNeg);
  return {
    rows, transfers, total: r2(transfers.reduce((s, t) => s + t.amount, 0)),
    balanced: Math.abs(imbalance) < 0.02, imbalance,
  };
}

module.exports = { settlementReport };
