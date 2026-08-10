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
 * @param hubId  (optional) the central-bank owner id. LEAGUE money in this league
 *               does not move peer-to-peer — the commissioner IS the bank, so every
 *               debtor pays the hub and the hub pays every creditor (Cory, 2026-08-10:
 *               "any debt or credit is owed to or by Cory — UNLESS it's a side bet").
 *               Side bets settle peer-to-peer and are a DIFFERENT report (SB.settlementsFor);
 *               this hub only applies to the league ledger. Omit for the classic minimal
 *               peer-to-peer settlement.
 * @returns {
 *   rows:      the nets, sorted (biggest creditor first),
 *   transfers: [{ from_id, from, to_id, to, amount, venmo }]  payer→payee list
 *   total:     total dollars moving,
 *   balanced:  true if creditors and debtors net to ~zero (a real season should),
 *   imbalance: the leftover (non-zero means the books don't close — surfaced, not hidden),
 *   hub:       the hub owner id when hub-routed (else null)
 * }
 */
function settlementReport(nets, venmoOf = () => null, hubId = null) {
  const rows = [...nets].map(n => ({ ...n, net: r2(n.net) })).sort((a, b) => b.net - a.net);

  const sumPos0 = rows.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0);
  const sumNeg0 = rows.filter(r => r.net < 0).reduce((s, r) => s + r.net, 0);
  const imbalance0 = r2(sumPos0 + sumNeg0);

  // HUB MODE — the commissioner is the bank. Each debtor pays the hub; the hub
  // pays each creditor. The hub's own net is absorbed (it holds the pot), so it
  // never appears as a counterparty to itself.
  if (hubId != null) {
    const hubRow = rows.find(r => r.owner_id === hubId);
    const hubName = hubRow ? hubRow.name : 'the bank';
    const transfers = [];
    for (const r of rows) {
      if (r.owner_id === hubId) continue;
      if (r.net < -0.005) {
        transfers.push({ from_id: r.owner_id, from: r.name, to_id: hubId, to: hubName,
          amount: r2(-r.net), venmo: venmoOf(hubId) || null });   // debtor pays the bank
      } else if (r.net > 0.005) {
        transfers.push({ from_id: hubId, from: hubName, to_id: r.owner_id, to: r.name,
          amount: r2(r.net), venmo: venmoOf(r.owner_id) || null });  // bank pays the creditor
      }
    }
    // Creditor-first, then debtor, so the list reads "who the bank owes" then
    // "who owes the bank" — the order Cory settles in.
    transfers.sort((a, b) => (a.from_id === hubId ? 0 : 1) - (b.from_id === hubId ? 0 : 1) || b.amount - a.amount);
    return {
      rows, transfers, total: r2(transfers.reduce((s, t) => s + t.amount, 0)),
      balanced: Math.abs(imbalance0) < 0.02, imbalance: imbalance0, hub: hubId, hubName,
    };
  }

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

  return {
    rows, transfers, total: r2(transfers.reduce((s, t) => s + t.amount, 0)),
    balanced: Math.abs(imbalance0) < 0.02, imbalance: imbalance0, hub: null,
  };
}

module.exports = { settlementReport };
