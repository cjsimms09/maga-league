/* Side bets — a separate set of books.
 *
 * DELIBERATELY NOT PART OF THE LEAGUE LEDGER.
 *
 * The league ledger is the commissioner's responsibility: buy-ins he collects,
 * prizes he pays out, one signed number per person that he settles. Side bets
 * are between members and are none of the league's business — folding them into
 * the same balance would mean the commissioner appears to owe money he never
 * took, and a disputed bet would corrupt the one number the whole site exists
 * to keep unambiguous.
 *
 * So: separate store, separate totals, never summed into `balances()`, never
 * into the all-time winnings grid. Tracked and displayed, not banked.
 *
 * ── What a bet is ───────────────────────────────────────────────────────────
 *
 *   format      'prop' (a claim about a team) or 'pool' (everyone picks teams).
 *               See src/betlogic.js — that module owns the grammar and does all
 *               the grading. This module owns the paperwork: who is in, who
 *               agreed, who won, and who still owes whom.
 *
 *   status      open      posted to the market, looking for someone to take it
 *               proposed  named parties, waiting on at least one to accept
 *               locked    everybody in — it is on
 *               settled   a result was recorded, and `legs` say who pays whom
 *               declined / void
 *
 * A bet is only real once EVERY party has accepted. Until then it is a proposal
 * and worth nothing — which is the software equivalent of the thing it models,
 * a handshake.
 *
 * ── Settlement ──────────────────────────────────────────────────────────────
 *
 * Settling does not just record a winner, it produces LEGS: one row per
 * loser→winner payment, each with its own paid flag. That is the difference
 * between "you are up $150" and "Richard owes you $100 and you owe David $50",
 * and the second is the one that gets money to move.
 */
const store = require('./store');

const KEY = id => `sidebet:${id}`;
const PREFIX = 'sidebet:';

const now = () => new Date().toISOString();
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const r2 = n => Math.round(n * 100) / 100;

const STATUS = {
  OPEN: 'open',           // on the market, anyone can take the other side
  PROPOSED: 'proposed',   // waiting on at least one named party
  LOCKED: 'locked',       // everyone in; it is on
  SETTLED: 'settled',     // a result was recorded
  DECLINED: 'declined',   // somebody said no
  VOID: 'void',           // called off
};

// Free text caps. Generous, because "side bets can be elaborate" — but bounded,
// because this all renders on a phone and lands in a KV store.
const MAX_TERMS = 1200;
const MAX_POSITION = 400;
const MAX_RESOLVES = 120;
// An open-market bet cannot recruit the entire league by accident.
const MAX_OPEN_SLOTS = 9;

/**
 * Fill in fields added after a bet was written.
 *
 * Bets are stored as whole documents, so a bet made before conditions existed
 * has no `conditions` key and one made before payment legs existed has no
 * `legs`. Defaulting at read time rather than migrating the store means an old
 * bet keeps working and a settled old bet still produces the "who owes whom"
 * rows — which is the whole point of legs, and would otherwise only appear for
 * bets settled from today onwards.
 */
function normalize(b) {
  if (!b) return b;
  b.format ??= 'prop';
  b.conditions ??= [];
  b.logic ??= 'all';
  b.pool_outcome ??= '';
  b.for_id ??= b.proposer_id;
  b.open_slots ??= 0;
  b.push ??= false;
  for (const p of b.parties || []) { p.position ??= ''; p.picks ??= []; }
  if (b.status === STATUS.SETTLED && !b.legs) b.legs = buildLegs(b);
  b.legs ??= [];
  return b;
}

async function all() {
  const keys = await store.listKeys(PREFIX);
  const docs = await store.getMany(keys);
  return docs.filter(Boolean).map(normalize)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

async function get(id) {
  return normalize(await store.get(KEY(id), null));
}

const mkParty = (owner_id, accepted, extra = {}) => ({
  owner_id: Number(owner_id),
  // Each person's own side of it in words: their picks, their team, the number
  // they took. On an elaborate bet this IS the bet.
  position: String(extra.position || '').slice(0, MAX_POSITION),
  // For a pool: the owner ids this person staked.
  picks: [...new Set((extra.picks || []).map(Number))].filter(Boolean),
  accepted: !!accepted,
  accepted_at: accepted ? now() : null,
});

/**
 * @param proposer_id   who is putting it up (auto-accepted — proposing IS agreeing)
 * @param party_ids     everyone else named; empty when `open_slots` is set
 * @param open_slots    post to the market instead: how many takers are wanted
 * @param format        'prop' | 'pool'
 * @param conditions    betlogic conditions; optional, and most bets have none
 * @param logic         'all' | 'any' — the if/then joiner
 * @param pool_outcome  for a pool: what it is played for
 */
async function propose({
  proposer_id, party_ids = [], terms, stake,
  position = '', picks = [], resolves = '', week = null,
  format = 'prop', conditions = [], logic = 'all', pool_outcome = '',
  open_slots = 0,
}) {
  const others = [...new Set(party_ids.map(Number))].filter(id => id && id !== Number(proposer_id));
  const slots = Math.min(Math.max(Number(open_slots) || 0, 0), MAX_OPEN_SLOTS);
  if (!others.length && !slots) {
    throw new Error('a side bet needs someone on the other side of it');
  }

  const bet = {
    id: newId(),
    created_at: now(),
    proposer_id: Number(proposer_id),
    format: format === 'pool' ? 'pool' : 'prop',
    terms: String(terms || '').slice(0, MAX_TERMS),
    // When it settles. A season-long bet is not "did the Bills cover" — it is
    // "whoever picked the champion", and it sits open for months.
    resolves: String(resolves || '').slice(0, MAX_RESOLVES),
    stake: Math.abs(Number(stake) || 0),
    week,
    // The if/then. Optional by design: a bet with no conditions settles by hand,
    // which is how every side bet in this league has always worked.
    conditions: Array.isArray(conditions) ? conditions : [],
    logic: logic === 'any' ? 'any' : 'all',
    // Whose side the conditions are stated FOR. If they hold, this person wins.
    for_id: Number(proposer_id),
    pool_outcome: String(pool_outcome || ''),
    // Market listing: how many more takers this bet is looking for.
    open_slots: slots,
    status: slots ? STATUS.OPEN : STATUS.PROPOSED,
    parties: [
      mkParty(proposer_id, true, { position, picks }),
      ...others.map(id => mkParty(id, false)),
    ],
    winner_ids: [],
    legs: [],
    settled_at: null,
    settled_by: null,
    audit: [{ at: now(), by: Number(proposer_id), what: slots ? 'Posted to the market' : 'Proposed' }],
  };
  await store.set(KEY(bet.id), bet);
  return bet;
}

function isParty(bet, owner_id) {
  return (bet.parties || []).some(p => p.owner_id === Number(owner_id));
}

/** Accepting is the handshake. Once the last party accepts, the bet is on. */
async function accept(id, owner_id, by_name, { position = '', picks = null } = {}) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.PROPOSED) return null;
  const party = (bet.parties || []).find(p => p.owner_id === Number(owner_id));
  if (!party || party.accepted) return bet;

  if (position) party.position = String(position).slice(0, MAX_POSITION);
  if (picks) party.picks = [...new Set(picks.map(Number))].filter(Boolean);
  party.accepted = true;
  party.accepted_at = now();
  bet.audit.push({ at: now(), by: Number(owner_id), what: `${by_name || 'Someone'} accepted` });
  if (bet.parties.every(p => p.accepted)) {
    bet.status = STATUS.LOCKED;
    bet.audit.push({ at: now(), what: 'All parties in — bet is locked' });
  }
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * Take the other side of a bet somebody posted to the market.
 *
 * This is the difference between a side bet and a side-bet MARKET: you do not
 * have to know who wants the other side, you post the side you want and wait.
 * Taking is an acceptance — there is no second handshake, because the person
 * who posted it already gave theirs by posting.
 */
async function take(id, owner_id, by_name, { position = '', picks = null } = {}) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.OPEN) return null;
  if (isParty(bet, owner_id)) return bet;             // you cannot take your own side
  if (bet.open_slots <= 0) return bet;

  bet.parties.push(mkParty(owner_id, true, { position, picks: picks || [] }));
  bet.open_slots -= 1;
  bet.audit.push({ at: now(), by: Number(owner_id), what: `${by_name || 'Someone'} took the other side` });
  if (bet.open_slots === 0) {
    bet.status = STATUS.LOCKED;
    bet.audit.push({ at: now(), what: 'Filled — bet is locked' });
  }
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Set or correct your own side of a bet. Yours only — never anyone else's. */
async function setPosition(id, owner_id, position, picks = null) {
  const bet = await get(id);
  if (!bet || ![STATUS.OPEN, STATUS.PROPOSED, STATUS.LOCKED].includes(bet.status)) return null;
  const party = (bet.parties || []).find(p => p.owner_id === Number(owner_id));
  if (!party) return null;
  if (position != null) party.position = String(position || '').slice(0, MAX_POSITION);
  if (picks) party.picks = [...new Set(picks.map(Number))].filter(Boolean);
  bet.audit.push({ at: now(), by: Number(owner_id), what: 'Updated their side' });
  await store.set(KEY(bet.id), bet);
  return bet;
}

async function decline(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.PROPOSED) return null;
  if (!isParty(bet, owner_id)) return null;
  bet.status = STATUS.DECLINED;
  bet.audit.push({ at: now(), by: Number(owner_id), what: `${by_name || 'Someone'} declined` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * Build the payment legs for a settled bet: one row per loser→winner payment.
 *
 * Each loser is out one stake; the winners share it. With one winner and one
 * loser — the usual case — that is a single leg for the stake, which is what
 * anyone would have written on a napkin.
 */
function buildLegs(bet) {
  const winners = bet.winner_ids.map(Number);
  const losers = bet.parties.map(p => p.owner_id).filter(id => !winners.includes(id));
  if (!winners.length || !losers.length) return [];
  const legs = [];
  for (const from of losers) {
    for (const to of winners) {
      legs.push({
        id: newId(), from, to,
        amount: r2(bet.stake / winners.length),
        paid: false, paid_at: null, paid_by: null,
      });
    }
  }
  return legs;
}

/** Record who won. Anyone in the bet can do it; who did is on the record. */
async function settle(id, winner_ids, by_id, by_name, { push = false, why = '' } = {}) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.LOCKED) return null;
  const winners = [...new Set((winner_ids || []).map(Number))].filter(w => isParty(bet, w));
  // A push is a real outcome — nobody picked the champion, the week ended level.
  // It settles the bet and moves no money, which is not the same as leaving it
  // open forever.
  if (!winners.length && !push) return null;
  bet.status = STATUS.SETTLED;
  bet.winner_ids = winners;
  bet.push = !!push && !winners.length;
  bet.legs = bet.push ? [] : buildLegs(bet);
  bet.settled_at = now();
  bet.settled_by = Number(by_id);
  bet.settle_note = String(why || '').slice(0, 400);
  bet.audit.push({ at: now(), by: Number(by_id),
    what: `${by_name || 'Someone'} recorded the result${why ? ` — ${why}` : ''}` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Mark one payment leg paid, or un-mark it. Either side of that leg can. */
async function markLeg(id, leg_id, owner_id, by_name, paid = true) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.SETTLED) return null;
  const leg = (bet.legs || []).find(l => l.id === leg_id);
  if (!leg) return null;
  if (leg.from !== Number(owner_id) && leg.to !== Number(owner_id)) return null;
  leg.paid = !!paid;
  leg.paid_at = paid ? now() : null;
  leg.paid_by = paid ? Number(owner_id) : null;
  bet.audit.push({ at: now(), by: Number(owner_id),
    what: `${by_name || 'Someone'} marked a ${paid ? 'payment made' : 'payment unmade'}` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Undo a result, or call a bet off. Any party. */
async function reopen(id, by_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.SETTLED) return null;
  bet.status = STATUS.LOCKED;
  bet.winner_ids = [];
  bet.legs = [];
  bet.push = false;
  bet.settled_at = null;
  bet.settled_by = null;
  bet.audit.push({ at: now(), by: Number(by_id), what: `${by_name || 'Someone'} reopened it` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

async function remove(id) {
  await store.del(KEY(id));
}

/**
 * Per-owner side-bet record. Never mixed with league money.
 *
 * `net` is winnings minus losses on SETTLED bets only. `at_stake` is money
 * riding on bets that are locked but not yet resolved — worth showing
 * separately, because it is not yours until it is. `owed_to_me` / `i_owe` are
 * the settled legs nobody has ticked off, which is the number that actually
 * makes someone open Venmo.
 */
function tallies(bets, owners) {
  const out = {};
  for (const o of owners) {
    out[o.id] = { owner: o, won: 0, lost: 0, net: 0, at_stake: 0,
                  wins: 0, losses: 0, open: 0, owed_to_me: 0, i_owe: 0 };
  }
  for (const b of bets) {
    for (const p of b.parties || []) {
      const t = out[p.owner_id];
      if (!t) continue;
      if (b.status === STATUS.LOCKED) { t.open++; t.at_stake += b.stake; continue; }
      if (b.status !== STATUS.SETTLED || b.push) continue;
      const won = (b.winner_ids || []).includes(p.owner_id);
      const losers = b.parties.length - b.winner_ids.length;
      const winners = b.winner_ids.length || 1;
      if (won) {
        const take = (b.stake * losers) / winners;
        t.won += take; t.wins++; t.net += take;
      } else {
        t.lost += b.stake; t.losses++; t.net -= b.stake;
      }
    }
    for (const l of b.legs || []) {
      if (l.paid) continue;
      if (out[l.to]) out[l.to].owed_to_me += l.amount;
      if (out[l.from]) out[l.from].i_owe += l.amount;
    }
  }
  for (const t of Object.values(out)) {
    t.won = r2(t.won); t.lost = r2(t.lost); t.net = r2(t.net);
    t.owed_to_me = r2(t.owed_to_me); t.i_owe = r2(t.i_owe);
  }
  return out;
}

/**
 * Who still owes this person, and who they still owe — netted per counterparty.
 *
 * Netted on purpose: if Richard owes you $100 from the pool and you owe him $40
 * from a week 3 bet, the useful fact is "Richard owes you $60", not two rows
 * that cancel. The individual legs are still there to tick off.
 */
function settlementsFor(bets, owner_id, nameOf) {
  const me = Number(owner_id);
  const by = {};                      // counterparty id → { net, legs[] }
  for (const b of bets) {
    for (const l of b.legs || []) {
      if (l.paid) continue;
      if (l.from !== me && l.to !== me) continue;
      const other = l.from === me ? l.to : l.from;
      const row = (by[other] ??= { owner_id: other, name: nameOf(other), net: 0, legs: [] });
      row.net += l.to === me ? l.amount : -l.amount;
      row.legs.push({ ...l, bet: b, direction: l.to === me ? 'in' : 'out' });
    }
  }
  const rows = Object.values(by).map(r => ({ ...r, net: r2(r.net) }))
    .sort((a, b) => b.net - a.net);
  return {
    rows,
    owed_to_me: r2(rows.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0)),
    i_owe: r2(rows.filter(r => r.net < 0).reduce((s, r) => s - r.net, 0)),
  };
}

/**
 * One person's side-bet ledger: every bet they are in, chronological, with a
 * running net. This is the thing that matters — a W-L record says nothing about
 * a season-long bet worth $200 against four $20 ones.
 */
function ledgerFor(bets, owner_id, nameOf) {
  const rows = [];
  let running = 0;
  const mine = bets.filter(b => isParty(b, owner_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const b of mine) {
    const me = b.parties.find(p => p.owner_id === Number(owner_id));
    const others = b.parties.filter(p => p.owner_id !== Number(owner_id));
    let delta = null;                       // null = not resolved, no effect yet
    if (b.status === STATUS.SETTLED && !b.push) {
      const won = (b.winner_ids || []).includes(Number(owner_id));
      const losers = b.parties.length - b.winner_ids.length;
      const winners = b.winner_ids.length || 1;
      delta = won ? (b.stake * losers) / winners : -b.stake;
      running += delta;
    } else if (b.status === STATUS.SETTLED && b.push) {
      delta = 0;
    }
    rows.push({
      bet: b,
      my_position: (me && me.position) || '',
      my_picks: (me && me.picks) || [],
      against: others.map(p => (nameOf ? nameOf(p.owner_id) : p.owner_id)).join(', '),
      delta,
      running: r2(running),
    });
  }
  return { rows, net: r2(running) };
}

/**
 * Which teams have side-bet money riding on them, and whose.
 *
 * The point: when Richard has $100 on Michael to win the title, Michael's row
 * in the live standings should say so. Half the fun of the bet is watching the
 * table with it in mind, and a standings page that does not know about the bet
 * makes you hold the whole thing in your head.
 *
 * Only LOCKED bets count. A proposal is not money, and a settled one is over.
 *
 * @returns { [owner_id]: { mine: number, total: number, notes: string[] } }
 *          `mine` is what YOU have on that team; `total` is everyone's.
 */
function moneyOnTeams(bets, viewer_id, nameOf) {
  const out = {};
  const bump = (teamId, ownerId, amount, note) => {
    if (teamId == null) return;
    const row = (out[teamId] ??= { mine: 0, total: 0, notes: [] });
    row.total += amount;
    if (Number(ownerId) === Number(viewer_id)) row.mine += amount;
    if (!row.notes.includes(note)) row.notes.push(note);
  };

  for (const b of bets) {
    if (b.status !== STATUS.LOCKED) continue;

    if (b.format === 'pool') {
      // Everyone in the pool is rooting for their own picks.
      for (const p of b.parties || []) {
        for (const teamId of p.picks || []) {
          bump(teamId, p.owner_id, b.stake,
            `${nameOf(p.owner_id)} has ${b.stake} on them — ${b.terms.slice(0, 60)}`);
        }
      }
      continue;
    }

    // A proposition's conditions name teams directly. Both sides of a
    // comparison matter: "Cory outscores David" is money on both rows.
    for (const c of b.conditions || []) {
      for (const teamId of [c.subject_id, c.target_id]) {
        bump(teamId, b.for_id, b.stake,
          `${nameOf(b.for_id)} has ${b.stake} on this — ${b.terms.slice(0, 60)}`);
      }
    }
  }
  for (const row of Object.values(out)) {
    row.mine = r2(row.mine); row.total = r2(row.total);
  }
  return out;
}

/** Bets waiting on this person to say yes. Drives the nav badge and the email. */
function awaiting(bets, owner_id) {
  return bets.filter(b => b.status === STATUS.PROPOSED
    && (b.parties || []).some(p => p.owner_id === Number(owner_id) && !p.accepted));
}

module.exports = {
  STATUS, MAX_OPEN_SLOTS,
  all, get, propose, accept, take, decline, settle, reopen, remove,
  setPosition, markLeg, isParty,
  tallies, ledgerFor, settlementsFor, awaiting, moneyOnTeams,
};
