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
  OPEN: 'open',                       // on the market, anyone can take the other side
  PROPOSED: 'proposed',               // named parties, waiting on acceptance — NOT a bet yet
  LOCKED: 'locked',                   // everyone in; it is on, running
  AWAITING_CONFIRM: 'awaiting_confirm', // one party DECLARED a result; the other must confirm
  DISPUTED: 'disputed',               // the parties disagree on the outcome — the site records, never adjudicates
  SETTLED: 'settled',                 // a result was confirmed; legs say who pays whom
  DECLINED: 'declined',               // somebody said no
  VOID: 'void',                       // called off
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
  b.pool_rules ??= (b.pool_outcome ? [b.pool_outcome] : []);
  b.picks_required ??= 0;
  b.kind ??= '';
  b.bought_out ??= false;
  b.for_id ??= b.proposer_id;
  b.open_slots ??= 0;
  b.push ??= false;
  // Lifecycle fields (declare→confirm→dispute). Default at read time so a bet
  // made before this shipped reads cleanly rather than needing a migration.
  b.declared ??= null;
  b.dispute ??= null;
  // Pool-draft fields: `pool` is the config (which teams are in play, what wins),
  // `draft` is the live alternating-snake-draft state. Null on a prop bet.
  b.pool ??= null;
  b.draft ??= null;
  for (const p of b.parties || []) { p.position ??= ''; p.picks ??= []; }
  if (b.status === STATUS.SETTLED && !b.legs) b.legs = buildLegs(b);
  b.legs ??= [];
  // Payer's I-paid claim (receiver-confirms model) — default at read time so a
  // leg written before the claim state existed reads cleanly.
  for (const l of b.legs) l.claimed ??= null;
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
  format = 'prop', conditions = [], logic = 'all', pool_rules = [], picks_required = 0,
  open_slots = 0, kind = '',
  pool_teams = [], pool_wins = '',
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
    // Ordered rules; the first that separates the field decides it.
    pool_rules: (Array.isArray(pool_rules) ? pool_rules : [pool_rules]).filter(Boolean).map(String),
    picks_required: Math.min(Math.max(Number(picks_required) || 0, 0), 10),
    // Pool-DRAFT config: the franchises in play + what wins it. The draft itself
    // (order, picks, whose turn) is initialised on accept via startPoolDraft, so
    // nothing is picked until both sides are in — a pool bet is a draft, not a form.
    pool: format === 'pool'
      ? { team_pool: [...new Set((pool_teams || []).map(Number))].filter(Boolean),
          wins: String(pool_wins || 'holds the league champion').slice(0, 200) }
      : null,
    draft: null,
    // 'matchup' means this is a bet on one week's game, and acceptance is
    // closed at kickoff — see BL.matchupWindow. Everything else is untimed.
    kind: String(kind || ''),
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
        paid: false, paid_at: null, paid_by: null, claimed: null,
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

/**
 * DECLARE the outcome — the first half of settling. Either party states who won
 * (or that it pushed); the OTHER party must confirm before a dollar moves. This
 * is what makes "never settle silently" true: a declaration is a claim, not a
 * settlement. Valid while the bet is LOCKED (running), or as a RE-declaration
 * from AWAITING_CONFIRM / DISPUTED (a fresh declaration resets the handshake and
 * clears the dispute — the parties are trying again).
 */
async function declareResult(id, by_id, by_name, { winner_ids = [], push = false, why = '', source = 'manual' } = {}) {
  const bet = await get(id);
  if (!bet) return null;
  if (![STATUS.LOCKED, STATUS.AWAITING_CONFIRM, STATUS.DISPUTED].includes(bet.status)) return null;
  if (!isParty(bet, by_id)) return null;
  const winners = [...new Set((winner_ids || []).map(Number))].filter(w => isParty(bet, w));
  if (!winners.length && !push) return null;
  bet.declared = {
    by: Number(by_id),
    winner_ids: winners,
    push: !!push && !winners.length,
    why: String(why || '').slice(0, 400),
    source: source === 'sleeper' ? 'sleeper' : 'manual',   // auto-detected vs hand-declared
    at: now(),
    confirmed_by: [],
  };
  bet.status = STATUS.AWAITING_CONFIRM;
  bet.dispute = null;
  bet.audit.push({ at: now(), by: Number(by_id),
    what: `${by_name || 'Someone'} declared the result${bet.declared.push ? ' — push, no winner' : ''}${bet.declared.source === 'sleeper' ? ' (auto-detected from Sleeper)' : ''}${why ? ` — ${why}` : ''}. Waiting on the other side to confirm.` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * CONFIRM a declared result — the second half, and the ONLY path a two-party bet
 * reaches SETTLED. Must be a party who is NOT the declarer: you cannot confirm
 * your own call. On confirm, legs are built and the result is on the record.
 */
async function confirmResult(id, by_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.AWAITING_CONFIRM || !bet.declared) return null;
  if (!isParty(bet, by_id)) return null;
  if (Number(by_id) === Number(bet.declared.by)) return bet;   // the declarer cannot self-confirm
  const winners = (bet.declared.winner_ids || []).map(Number);
  bet.status = STATUS.SETTLED;
  bet.winner_ids = winners;
  bet.push = !!bet.declared.push && !winners.length;
  bet.legs = bet.push ? [] : buildLegs(bet);
  bet.settled_at = now();
  bet.settled_by = Number(by_id);
  bet.settle_note = bet.declared.why || '';
  bet.declared.confirmed_by = [Number(by_id)];
  bet.audit.push({ at: now(), by: Number(by_id),
    what: `${by_name || 'Someone'} confirmed the result — settled${bet.push ? ' as a push (no money moves)' : ''}.` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * DISPUTE a declared result. The other party says "that's not what happened."
 * The bet goes to DISPUTED and STAYS THERE — the site records the disagreement,
 * it does not adjudicate it. A visible dispute is its own social pressure; the
 * group chat handles it, and either party can DECLARE again to re-open the
 * handshake once they've sorted it out.
 */
async function disputeResult(id, by_id, by_name, why = '') {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.AWAITING_CONFIRM || !bet.declared) return null;
  if (!isParty(bet, by_id)) return null;
  if (Number(by_id) === Number(bet.declared.by)) return bet;   // the declarer isn't the disputer
  bet.status = STATUS.DISPUTED;
  bet.dispute = {
    by: Number(by_id),
    at: now(),
    why: String(why || '').slice(0, 400),
    over: { winner_ids: bet.declared.winner_ids, push: bet.declared.push, declared_by: bet.declared.by },
  };
  bet.audit.push({ at: now(), by: Number(by_id),
    what: `${by_name || 'Someone'} DISPUTED the declared result${why ? ` — ${why}` : ''}. On the record until you two sort it out.` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

// ── POOL BETS AS A SNAKE DRAFT OF FRANCHISES ─────────────────────────────────
// A pool bet is a DRAFT, not a form: the two bettors split the league's teams by
// ALTERNATING picks (snake order), each pick locks a team out of the shared pool,
// and whoever ends up holding the eventual champion wins. Nobody picks until both
// are in, and no team can be held by both sides.

/** Whose pick it is, given the draft order and how many picks have been made.
 *  SNAKE: the order reverses each round, so for [A,B] the sequence is A B B A A B… */
function snakeTurn(order, made) {
  const n = order.length;
  if (!n) return null;
  const round = Math.floor(made / n);
  const pos = made % n;
  const idx = (round % 2 === 0) ? pos : (n - 1 - pos);
  return order[idx];
}

/**
 * Open the draft once both sides are in. The ROUTE computes `order` from the
 * prior season's finish (higher finisher picks first) and passes the human `why`
 * ("Richard picks first — finished 4th to your 7th in 2025"). Idempotent-safe:
 * refuses if a draft is already under way.
 */
async function startPoolDraft(id, orderedBettorIds, why = '') {
  const bet = await get(id);
  if (!bet || bet.format !== 'pool' || !bet.pool) return null;
  if (bet.status !== STATUS.LOCKED) return null;          // both must have accepted
  if (bet.draft) return bet;                              // already started
  const order = [...new Set((orderedBettorIds || []).map(Number))].filter(n => isParty(bet, n));
  const pool = [...new Set((bet.pool.team_pool || []).map(Number))].filter(Boolean);
  if (order.length < 2 || !pool.length) return null;
  bet.draft = {
    order,
    why: String(why || '').slice(0, 300),
    pool,                       // every franchise in play
    taken: {},                  // team_owner_id -> bettor_id who holds it
    sequence: [],               // [{ by, team, at }] in pick order
    turn: order[0],
    complete: false,
    started_at: now(),
  };
  // Picks reset — the draft is the source of truth now.
  for (const p of bet.parties) p.picks = [];
  bet.audit.push({ at: now(), what: `Franchise draft opened — ${why || 'order set by prior-season finish'}. ${betNamesSafe(order[0])} on the clock.` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** One draft pick: it must be your turn, the team must still be on the board. */
async function poolDraftPick(id, owner_id, team_id) {
  const bet = await get(id);
  if (!bet || !bet.draft || bet.draft.complete) return null;
  const me = Number(owner_id), team = Number(team_id);
  if (Number(bet.draft.turn) !== me) return bet;                 // not your turn
  if (!bet.draft.pool.includes(team)) return bet;                // not a team in play
  if (bet.draft.taken[team] != null) return bet;                 // already held
  bet.draft.taken[team] = me;
  bet.draft.sequence.push({ by: me, team, at: now() });
  const party = (bet.parties || []).find(p => p.owner_id === me);
  if (party) party.picks = [...new Set([...(party.picks || []), team])];
  bet.audit.push({ at: now(), by: me, what: `drafted a franchise (pick ${bet.draft.sequence.length}/${bet.draft.pool.length})` });
  // Advance, or finish when every franchise is allocated.
  if (bet.draft.sequence.length >= bet.draft.pool.length) {
    bet.draft.complete = true;
    bet.draft.turn = null;
    bet.audit.push({ at: now(), what: 'Draft complete — the pool is set and the bet is live.' });
  } else {
    bet.draft.turn = snakeTurn(bet.draft.order, bet.draft.sequence.length);
  }
  await store.set(KEY(bet.id), bet);
  return bet;
}

// A best-effort name for audit strings (the module has ids, not names; the routes
// pass names elsewhere). Falls back to the id so the trail is never blank.
function betNamesSafe(id) { return `#${id}`; }

/**
 * Mark one payment leg — the RECEIVER-CONFIRMS model (2026-08-15).
 *
 * The old rule let either side of a leg set `paid`, which means the person who
 * OWES the money could unilaterally write "paid" into the record the whole
 * ledger trusts. Money arriving is a fact only the person it arrives to can
 * attest, so:
 *
 *   * the RECEIVER (leg.to) marking paid is THE FACT — it sets `paid` and the
 *     leg leaves every owes-list. Un-marking (receiver only) reverses it and
 *     clears any claim, because "actually it never arrived" outranks "I sent it".
 *   * the PAYER (leg.from) marking paid is A CLAIM — it sets `leg.claimed`
 *     ({by, at}), the card reads "says they've paid — confirm?", and the leg
 *     STAYS on the books until the receiver confirms. Marking unpaid as the
 *     payer withdraws the claim.
 *   * anyone else: refused.
 *
 * This is the two-step (payer-says → receiver-confirms) rather than
 * receiver-only because the payer taps Venmo and the confirm from the other
 * phone can be hours away — the interim state is real and worth showing.
 * Tested both arms (allowed and refused) in draft/tests/sidebet_paid_flow.test.js.
 */
async function markLeg(id, leg_id, owner_id, by_name, paid = true) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.SETTLED) return null;
  const leg = (bet.legs || []).find(l => l.id === leg_id);
  if (!leg) return null;
  const me = Number(owner_id);
  if (leg.to === me) {
    // The receiver's mark is the fact.
    leg.paid = !!paid;
    leg.paid_at = paid ? now() : null;
    leg.paid_by = paid ? me : null;
    if (!paid) leg.claimed = null;      // "it never arrived" clears "I sent it"
    bet.audit.push({ at: now(), by: me,
      what: `${by_name || 'Someone'} confirmed a payment ${paid ? 'received' : 'NOT received — back on the books'}` });
  } else if (leg.from === me) {
    // The payer's mark is a claim. It never sets `paid`.
    leg.claimed = paid ? { by: me, at: now() } : null;
    bet.audit.push({ at: now(), by: me,
      what: `${by_name || 'Someone'} ${paid ? 'says they have paid — waiting on the other side to confirm' : 'withdrew their paid claim'}` });
  } else {
    return null;                        // not your leg, not your money
  }
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * Offer to buy your way out of a live bet.
 *
 * Halfway through the season a bet stops being a coin flip — one of you is
 * plainly winning. A buyout is how that gets closed without waiting: "give me
 * $30 and we'll call it off", or "I'll pay you $30 to let me out".
 *
 * It is an offer, not a settlement. Everyone else in the bet has to say yes,
 * for the same reason the bet itself needed everyone to say yes.
 *
 * @param direction  'receive' — they pay the offerer to end it
 *                   'pay'     — the offerer pays them to end it
 */
async function offerBuyout(id, owner_id, by_name, { amount, direction = 'receive', note = '' }) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.LOCKED) return null;
  if (!isParty(bet, owner_id)) return null;
  const amt = Math.abs(Number(amount) || 0);
  if (!amt) return null;
  bet.buyout = {
    by: Number(owner_id),
    amount: r2(amt),
    direction: direction === 'pay' ? 'pay' : 'receive',
    note: String(note || '').slice(0, 200),
    offered_at: now(),
    // Everyone who is not the offerer has to agree.
    accepted_by: [],
  };
  bet.audit.push({ at: now(), by: Number(owner_id),
    what: `${by_name || 'Someone'} offered to ${direction === 'pay' ? 'pay' : 'take'} ${amt} to call it off` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Say yes to a buyout. When the last party agrees, the bet closes on it. */
async function acceptBuyout(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.LOCKED || !bet.buyout) return null;
  const me = Number(owner_id);
  if (!isParty(bet, me) || me === bet.buyout.by) return bet;
  if (!bet.buyout.accepted_by.includes(me)) bet.buyout.accepted_by.push(me);
  bet.audit.push({ at: now(), by: me, what: `${by_name || 'Someone'} accepted the buyout` });

  const others = bet.parties.map(p => p.owner_id).filter(x => x !== bet.buyout.by);
  if (others.every(x => bet.buyout.accepted_by.includes(x))) {
    // Closed by agreement rather than by result. No winner is recorded, because
    // nobody won — but money still moves, so it still produces legs.
    const each = r2(bet.buyout.amount / (others.length || 1));
    bet.status = STATUS.SETTLED;
    bet.winner_ids = [];
    bet.push = true;                       // no result; keeps W-L honest
    bet.bought_out = true;
    bet.settled_at = now();
    bet.settled_by = me;
    bet.settle_note = `Bought out for ${bet.buyout.amount}`;
    bet.legs = others.map(other => ({
      id: newId(),
      from: bet.buyout.direction === 'receive' ? other : bet.buyout.by,
      to: bet.buyout.direction === 'receive' ? bet.buyout.by : other,
      amount: each, paid: false, paid_at: null, paid_by: null, claimed: null,
    }));
    bet.audit.push({ at: now(), what: 'Bought out — bet closed by agreement' });
  }
  await store.set(KEY(bet.id), bet);
  return bet;
}

/** Withdraw or turn down a buyout. The bet carries on as it was. */
async function clearBuyout(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || !bet.buyout || !isParty(bet, owner_id)) return null;
  bet.audit.push({ at: now(), by: Number(owner_id),
    what: `${by_name || 'Someone'} ${Number(owner_id) === bet.buyout.by ? 'withdrew' : 'turned down'} the buyout` });
  delete bet.buyout;
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
function ledgerFor(bets, owner_id, nameOf, { year = null } = {}) {
  const rows = [];
  let running = 0;
  let mine = bets.filter(b => isParty(b, owner_id));
  // Cell-click view (§5): filter to bets that RESOLVED in one year. A year view
  // is historical, so it is settled bets only — an open bet has no year yet.
  if (year != null) {
    const y = Number(year);
    mine = mine.filter(b => b.status === STATUS.SETTLED && betYear(b) === y);
  }
  mine = mine.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
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

/**
 * Bets ABOUT this owner's team that they are not in.
 *
 * If Richard and David have money on your week-4 game, you should know — both
 * because it is funny and because you would rather find out from the site than
 * from Richard gloating afterwards. Which side each of them took is the actual
 * information, so it is worked out rather than just listing the bet.
 *
 * Only locked and settled bets: a proposal nobody accepted is not a bet, and
 * telling somebody about it would leak a negotiation that never happened.
 */
function betsAbout(bets, owner_id, nameOf) {
  const me = Number(owner_id);
  const out = [];
  for (const b of bets) {
    if (![STATUS.LOCKED, STATUS.SETTLED].includes(b.status)) continue;
    if (isParty(b, me)) continue;                 // your own bets are not gossip

    const backing = [], against = [];
    if (b.format === 'pool') {
      // In a pool, holding you IS backing you.
      for (const p of b.parties || []) {
        ((p.picks || []).map(Number).includes(me) ? backing : against).push(p.owner_id);
      }
      if (!backing.length) continue;              // nobody took you; not about you
    } else {
      const mentions = (b.conditions || []).some(c =>
        Number(c.subject_id) === me || Number(c.target_id) === me);
      if (!mentions) continue;
      // `for_id` backs the claim. Whether that is backing YOU depends on which
      // side of the claim you are: the subject, or the thing being beaten.
      const forMe = (b.conditions || []).some(c => Number(c.subject_id) === me);
      for (const p of b.parties || []) {
        const isFor = Number(p.owner_id) === Number(b.for_id);
        ((isFor === forMe) ? backing : against).push(p.owner_id);
      }
    }
    out.push({
      bet: b,
      stake: b.stake,
      backing: backing.map(id => nameOf(id)),
      against: against.map(id => nameOf(id)),
    });
  }
  return out;
}

/**
 * Send an expired offer again.
 *
 * The ten-day clock runs from `created_at`, so resending is literally resetting
 * it — same terms, same people, fresh clock. Deliberately an explicit act by
 * the person who offered it rather than an auto-renew: the whole point of the
 * expiry is that a stale offer should need somebody to look at it again and
 * decide they still mean it.
 */
async function resend(id, owner_id, by_name) {
  const bet = await get(id);
  if (!bet || bet.status !== STATUS.PROPOSED) return null;
  if (Number(bet.proposer_id) !== Number(owner_id)) return null;
  bet.created_at = now();
  bet.audit.push({ at: now(), by: Number(owner_id), what: `${by_name || 'Someone'} sent it again` });
  await store.set(KEY(bet.id), bet);
  return bet;
}

/**
 * The year a settled bet belongs to. Money changes hands when it settles, so the
 * grid keys on the settlement year (falling back to when it was created for the
 * odd bet missing a settled stamp). Only settled, non-push bets have a year that
 * matters to the running score.
 */
function betYear(b) {
  const d = b.settled_at || b.created_at;
  if (!d) return null;
  const y = new Date(d).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

/** One party's dollar delta on a bet: +winnings or −stake. 0 unless settled. */
function partyDelta(b, owner_id) {
  if (b.status !== STATUS.SETTLED || b.push) return 0;
  const won = (b.winner_ids || []).includes(Number(owner_id));
  const losers = b.parties.length - b.winner_ids.length;
  const winners = b.winner_ids.length || 1;
  return won ? (b.stake * losers) / winners : -b.stake;
}

/**
 * THE SIDE-BET TRACKER GRID (side-bet-tracker.md §1–3): owners down the left,
 * years across the top, each cell that owner's side-bet net for that year, a
 * career column on the right. Fully derived from settled bets — nothing typed.
 *
 * A cell with no bets for that owner-year is `null` (rendered as a quiet dash,
 * never a zero). Zero-sum by construction: sum every owner's cell for a year and
 * it is 0 — the invariant the robot asserts.
 */
function gridByYear(bets, owners) {
  const net = {};                       // owner_id -> { year -> net }
  const present = {};                   // owner_id -> Set(years with a bet)
  for (const o of owners) { net[o.id] = {}; present[o.id] = new Set(); }
  const years = new Set();

  for (const b of bets) {
    if (b.status !== STATUS.SETTLED || b.push) continue;
    const y = betYear(b);
    if (y == null) continue;
    years.add(y);
    for (const p of b.parties || []) {
      if (!net[p.owner_id]) continue;
      net[p.owner_id][y] = (net[p.owner_id][y] || 0) + partyDelta(b, p.owner_id);
      present[p.owner_id].add(y);
    }
  }

  const ys = [...years].sort((a, b) => a - b);
  const rows = owners.map(o => {
    const cells = {};
    let career = 0, hasAny = false;
    for (const y of ys) {
      if (present[o.id].has(y)) {
        cells[y] = r2(net[o.id][y] || 0);
        career += net[o.id][y] || 0;
        hasAny = true;
      } else {
        cells[y] = null;               // quiet dash, not zero
      }
    }
    return { owner: o, cells, career: r2(career), has_bets: hasAny };
  });
  return { years: ys, rows };
}

/**
 * League-wide ledger for one year (side-bet-tracker.md §5, the year-click view):
 * every settled bet that resolved that year, both parties shown, plus the year's
 * biggest winner and loser from the grid.
 */
function leagueLedgerForYear(bets, year, nameOf) {
  const y = Number(year);
  const rows = [];
  for (const b of bets) {
    if (b.status !== STATUS.SETTLED || b.push) continue;
    if (betYear(b) !== y) continue;
    rows.push({
      bet: b,
      parties: (b.parties || []).map(p => ({
        owner_id: p.owner_id,
        name: nameOf ? nameOf(p.owner_id) : p.owner_id,
        delta: r2(partyDelta(b, p.owner_id)),
        won: (b.winner_ids || []).includes(p.owner_id),
      })),
    });
  }
  rows.sort((a, b) => (a.bet.settled_at < b.bet.settled_at ? 1 : -1));
  // Year's biggest winner / loser across all parties.
  const net = {};
  for (const row of rows) {
    for (const p of row.parties) net[p.owner_id] = (net[p.owner_id] || 0) + p.delta;
  }
  const ranked = Object.entries(net).map(([id, v]) => ({
    owner_id: Number(id), name: nameOf ? nameOf(Number(id)) : Number(id), net: r2(v),
  })).sort((a, b) => b.net - a.net);
  return {
    year: y, rows,
    biggest_winner: ranked[0] || null,
    biggest_loser: ranked.length ? ranked[ranked.length - 1] : null,
  };
}

/**
 * Bets waiting on this person to ACT. Drives the nav badge and the email. Two
 * kinds of waiting now: a PROPOSED bet you haven't accepted, and an
 * AWAITING_CONFIRM bet where the OTHER side declared a result you must confirm or
 * dispute (you're a party and not the declarer).
 */
function awaiting(bets, owner_id) {
  const me = Number(owner_id);
  return bets.filter(b => {
    if (b.status === STATUS.PROPOSED) {
      return (b.parties || []).some(p => p.owner_id === me && !p.accepted);
    }
    if (b.status === STATUS.AWAITING_CONFIRM && b.declared) {
      return isParty(b, me) && Number(b.declared.by) !== me;
    }
    return false;
  });
}

/** Bets sitting in DISPUTED that this person is a party to (a nudge, not a task). */
function disputed(bets, owner_id) {
  const me = Number(owner_id);
  return bets.filter(b => b.status === STATUS.DISPUTED && isParty(b, me));
}

module.exports = {
  STATUS, MAX_OPEN_SLOTS,
  all, get, propose, accept, take, decline, settle, reopen, remove,
  declareResult, confirmResult, disputeResult,
  startPoolDraft, poolDraftPick, snakeTurn,
  setPosition, markLeg, isParty, offerBuyout, acceptBuyout, clearBuyout, resend,
  tallies, ledgerFor, settlementsFor, awaiting, disputed, moneyOnTeams, betsAbout,
  betYear, partyDelta, gridByYear, leagueLedgerForYear,
};
