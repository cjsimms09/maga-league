/* Side bets — a separate set of books.
 *
 * DELIBERATELY NOT PART OF THE LEAGUE LEDGER.
 *
 * The league ledger is the commissioner's responsibility: buy-ins he collects,
 * prizes he pays out, one signed number per person that he settles. Side bets
 * are between two members and are none of the league's business — folding them
 * into the same balance would mean the commissioner appears to owe money he
 * never took, and a disputed bet would corrupt the one number the whole site
 * exists to keep unambiguous.
 *
 * So: separate store, separate totals, never summed into `balances()`, never
 * into the all-time winnings grid. Tracked and displayed, not banked.
 *
 * A bet is only real once EVERY named party has accepted. Until then it is a
 * proposal and worth nothing — which is the software equivalent of the thing
 * it is modelling, a handshake.
 */
const store = require('./store');

const KEY = id => `sidebet:${id}`;
const PREFIX = 'sidebet:';

const now = () => new Date().toISOString();
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const STATUS = {
  PROPOSED: 'proposed',   // waiting on at least one party
  LOCKED: 'locked',       // everyone accepted; it is on
  SETTLED: 'settled',     // a result was recorded
  DECLINED: 'declined',   // somebody said no
  VOID: 'void',           // called off by agreement or by the commissioner
};

async function all() {
  const keys = await store.listKeys(PREFIX);
  const docs = await store.getMany(keys);
  return docs.filter(Boolean).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

async function get(id) {
  return store.get(KEY(id), null);
}

/**
 * @param proposer_id  who is putting it up (auto-accepted — proposing IS agreeing)
 * @param party_ids    everyone else in it; one or many
 * @param terms        free text, e.g. "Bills cover -3.5 on Sunday"
 * @param stake        dollars per person
 */
async function propose({ proposer_id, party_ids, terms, stake, week = null }) {
  const others = [...new Set(party_ids.map(Number))].filter(id => id && id !== Number(proposer_id));
  if (!others.length) throw new Error('a side bet needs someone on the other side of it');

  const bet = {
    id: newId(),
    created_at: now(),
    proposer_id: Number(proposer_id),
    terms: String(terms || '').slice(0, 240),
    stake: Math.abs(Number(stake) || 0),
    week,
    status: STATUS.PROPOSED,
    parties: [
      { owner_id: Number(proposer_id), accepted: true, accepted_at: now() },
      ...others.map(id => ({ owner_id: id, accepted: false, accepted_at: null })),
    ],
    winner_ids: [],
    settled_at: null,
    settled_by: null,
    audit: [{ at: now(), by: Number(proposer_id), what: 'Proposed' }],
  };
  await store.set(KEY(bet.id), bet);
  return bet;
}

function isParty(bet, owner_id) {
  return (bet.parties || []).some(p => p.owner_id === Number(owner_id));
}

/** Accepting is the handshake. Once the last party accepts, the bet is on. */
async function accept(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.PROPOSED) return null;
  const party = (bet.parties || []).find(p => p.owner_id === Number(owner_id));
  if (!party || party.accepted) return bet;

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

async function decline(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.PROPOSED) return null;
  if (!isParty(bet, owner_id)) return null;
  bet.status = STATUS.DECLINED;
  bet.audit.push({ at: now(), by: Number(owner_id), what: `${by_name || 'Someone'} declined` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Record who won. Anyone in the bet can do it; who did is on the record. */
async function settle(id, winner_ids, by_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.LOCKED) return null;
  const winners = [...new Set((winner_ids || []).map(Number))].filter(w => isParty(bet, w));
  if (!winners.length) return null;
  bet.status = STATUS.SETTLED;
  bet.winner_ids = winners;
  bet.settled_at = now();
  bet.settled_by = Number(by_id);
  bet.audit.push({ at: now(), by: Number(by_id), what: `${by_name || 'Someone'} recorded the result` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Undo a result, or call a bet off. Commissioner or any party. */
async function reopen(id, by_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.SETTLED) return null;
  bet.status = STATUS.LOCKED;
  bet.winner_ids = [];
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
 * separately, because it is not yours until it is.
 */
function tallies(bets, owners) {
  const out = {};
  for (const o of owners) {
    out[o.id] = { owner: o, won: 0, lost: 0, net: 0, at_stake: 0, wins: 0, losses: 0, open: 0 };
  }
  for (const b of bets) {
    for (const p of b.parties || []) {
      const t = out[p.owner_id];
      if (!t) continue;
      if (b.status === 'locked') { t.open++; t.at_stake += b.stake; continue; }
      if (b.status !== 'settled') continue;
      const won = (b.winner_ids || []).includes(p.owner_id);
      // A pot is every loser's stake, split among the winners. With one winner
      // and one loser — the usual case — that is just the stake.
      const losers = b.parties.length - b.winner_ids.length;
      const winners = b.winner_ids.length || 1;
      if (won) {
        const take = (b.stake * losers) / winners;
        t.won += take; t.wins++; t.net += take;
      } else {
        t.lost += b.stake; t.losses++; t.net -= b.stake;
      }
    }
  }
  for (const t of Object.values(out)) {
    t.won = Math.round(t.won * 100) / 100;
    t.lost = Math.round(t.lost * 100) / 100;
    t.net = Math.round(t.net * 100) / 100;
  }
  return out;
}

module.exports = { STATUS, all, get, propose, accept, decline, settle, reopen, remove, tallies, isParty };
