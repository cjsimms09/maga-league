/* The side-bet condition engine.
 *
 * The problem this solves: "Richard and I every year select 4 other teams and
 * our own, and whoever selected the winning team wins the bet." That is a real
 * bet with a real answer that the site already has the data to compute — but
 * only if the bet is stored as structure rather than as a paragraph of English.
 *
 * ── The two shapes ──────────────────────────────────────────────────────────
 *
 * Every side bet anyone has ever actually made in this league is one of two
 * things, and trying to build one grammar that covers both makes both worse:
 *
 *   POOL       Everybody stakes a SET OF TEAMS, and one outcome decides whose
 *              set was right. Richard/Cory is this. So is "we each take five
 *              teams, most combined points wins".
 *
 *   PROPOSITION  A claim about one team, which is either true or false. "My
 *              team outscores yours in week 4." "Marian misses the playoffs."
 *              Sides: whoever is FOR the claim, and everyone against.
 *
 * ── The grammar ─────────────────────────────────────────────────────────────
 *
 * A proposition condition is one sentence with four slots:
 *
 *     <TEAM>  <TEST>  <TARGET>  <WHEN>
 *     Cory    outscores  David   in week 4
 *     Marian  finishes   champion  this season
 *     Bates   scores at least  140  in week 9
 *
 * Five tests cover every example in the brief — beating a specific team in a
 * given week, beating them over a whole season, clearing a points number,
 * taking a weekly high, and landing a finishing place (title, regular-season
 * crown, playoff berth, the toilet). Adding a sixth is a row in TESTS plus an
 * evaluator; it is deliberately not an open-ended expression language, because
 * an expression language is a thing nobody will use on a phone at 11pm.
 *
 * Conditions join with ALL (and) or ANY (or). That is the "if/then" — and it is
 * OPTIONAL. A bet with zero conditions is a handshake with a stake on it, which
 * is what most side bets are, and it settles by hand like it always did.
 *
 * ── The rule that matters ───────────────────────────────────────────────────
 *
 * THE ENGINE NEVER SETTLES A BET. It computes a verdict, shows its working, and
 * a human presses the button. Sleeper's data arrives late, gets corrected, and
 * occasionally lies; a bet auto-settled on a stat correction is exactly the
 * argument this feature exists to prevent. So: propose, explain, confirm.
 *
 * Every verdict carries `lines` — the numbers it used, in English. If the site
 * cannot decide, it says which fact it is missing rather than guessing.
 */

// ─────────────────────────────────────────────────────────── config
// Every threshold in one place, commented, per the house rule.
const CFG = {
  // A week is only evaluated once it is safely finished. Sleeper keeps scoring
  // Monday night into Tuesday morning, and stat corrections land Wednesday.
  // Refusing to grade the current week costs a day and prevents a wrong verdict.
  GRADE_WEEK_LAG: 1,
  // Points comparisons are decided to this precision. Fantasy scores carry two
  // decimals and ties on the nose do happen — a tie is NOT a win for either
  // side, it is undecided, and the bet's own terms have to say what happens.
  POINTS_EPSILON: 0.005,
  // How many distinct weeks we will fetch from Sleeper in one page render.
  // Each is a separate HTTP call; the cache makes repeats free but a league
  // with thirty open weekly bets should not fan out thirty requests.
  MAX_WEEK_FETCH: 6,
  // Places, in terms of the final standings array (owner ids, best first).
  PLACE_PLAYOFF_CUT: 4,
};

// ─────────────────────────────────────────────────────── the vocabulary

// What the subject team is being asked to do. `target` says which second input
// the form should show; `when` says which time controls apply.
const TESTS = {
  outscores: {
    label: 'outscores',
    target: 'owner',
    when: ['week', 'season'],
    hint: 'more fantasy points than another team',
  },
  scores_at_least: {
    label: 'scores at least',
    target: 'number',
    when: ['week', 'season'],
    hint: 'a points number, e.g. 140 in a week or 1,700 over a season',
  },
  weekly_high: {
    label: 'is the weekly high scorer',
    target: 'none',
    when: ['week'],
    hint: 'top score in the whole league that week — the $100 week',
  },
  finishes: {
    label: 'finishes',
    target: 'place',
    when: ['season'],
    hint: 'where they end up when it is all over',
  },
  wins_at_least: {
    label: 'wins at least',
    target: 'number',
    when: ['season'],
    hint: 'regular-season wins',
  },
};

// Finishing places, and how to read one out of a standings array.
const PLACES = {
  champion:   { label: 'champion',                test: (i) => i === 0 },
  top2:       { label: 'top 2 (in the final)',    test: (i) => i < 2 },
  playoffs:   { label: 'the playoffs',            test: (i) => i < CFG.PLACE_PLAYOFF_CUT },
  missed:     { label: 'out of the playoffs',     test: (i, n) => i >= CFG.PLACE_PLAYOFF_CUT },
  last:       { label: 'dead last (the toilet)',  test: (i, n) => i === n - 1 },
};

// What a pool is played for. Each maps the league's season to ONE owner id —
// the team that "won" by that measure — and everyone who picked them cashes.
const POOL_OUTCOMES = {
  champion:    { label: 'wins the championship',       needs: 'final' },
  reg_first:   { label: 'finishes 1st in the regular season', needs: 'regular' },
  most_points: { label: 'scores the most points all season',  needs: 'regular' },
  last_place:  { label: 'finishes dead last',          needs: 'final' },
};

// ────────────────────────────────────────────── building a readable sentence

/** One condition as English. Used in the builder preview, the card, and email. */
function conditionText(c, nameOf) {
  const t = TESTS[c.test];
  if (!t) return 'an unrecognised condition';
  const who = nameOf(c.subject_id) + "'s team";
  const when = c.when === 'week' ? `in week ${c.week}` : 'over the whole season';
  switch (c.test) {
    case 'outscores':       return `${who} outscores ${nameOf(c.target_id)} ${when}`;
    case 'scores_at_least': return `${who} scores at least ${c.target_number} points ${when}`;
    case 'weekly_high':     return `${who} is the weekly high scorer in week ${c.week}`;
    case 'finishes':        return `${who} finishes ${(PLACES[c.target_place] || {}).label || '?'}`;
    case 'wins_at_least':   return `${who} wins at least ${c.target_number} games`;
    default:                return 'an unrecognised condition';
  }
}

/** The whole proposition, joined. */
function betText(bet, nameOf) {
  if (bet.format === 'pool') {
    const o = POOL_OUTCOMES[bet.pool_outcome] || { label: 'wins' };
    return `Everyone picks teams — whoever picked the team that ${o.label} takes the pot.`;
  }
  const cs = bet.conditions || [];
  if (!cs.length) return bet.terms;
  const joiner = bet.logic === 'any' ? ' OR ' : ' AND ';
  return cs.map(c => conditionText(c, nameOf)).join(joiner);
}

// ───────────────────────────────────────────────────────── the context
//
// Everything the evaluator is allowed to look at, gathered once per request.
// Passing a plain object rather than reaching for Sleeper inside the evaluator
// keeps the whole thing synchronous, pure, and testable without a network.

/**
 * @param season        the season record (has `standings`: owner ids, best first)
 * @param liveRows      sleeper.standings() rows, each {owner_name, wins, pf}
 * @param weeklyHigh    history.weekly[year] — owner id per week, index 0 = wk 1
 * @param weekPoints    { [week]: { [owner_id]: points } } for fetched weeks
 * @param weekNow       the league's current week
 * @param owners        active owners, for name lookup
 */
function makeContext({ season, liveRows = [], weeklyHigh = [], weekPoints = {}, weekNow = 1, owners = [] }) {
  const byName = {};
  for (const r of liveRows) if (r.owner_name) byName[r.owner_name] = r;
  const rowFor = id => {
    const o = owners.find(x => x.id === Number(id));
    return o ? byName[o.name] || null : null;
  };
  return {
    season,
    weekNow,
    owners,
    // Final order, only once the commissioner has closed the season out.
    finalStandings: (season && season.status === 'complete' && (season.standings || []).length)
      ? season.standings.map(Number) : null,
    // Live regular-season order — wins then points-for, same as the league page.
    liveOrder: liveRows.filter(r => r.owner_name)
      .map(r => (owners.find(o => o.name === r.owner_name) || {}).id).filter(Boolean),
    seasonPoints: id => { const r = rowFor(id); return r ? r.pf : null; },
    seasonWins:   id => { const r = rowFor(id); return r ? r.wins : null; },
    weeklyHigh:   week => (weeklyHigh[week - 1] != null ? Number(weeklyHigh[week - 1]) : null),
    weekPoints:   (week, id) => {
      const wk = weekPoints[week];
      if (!wk) return null;
      const v = wk[String(id)];
      return v == null ? null : Number(v);
    },
    // A week is gradeable once it is far enough behind us to be final.
    weekIsFinal: week => Number(week) <= weekNow - CFG.GRADE_WEEK_LAG,
  };
}

/** Which weeks a set of bets actually needs fetched. Deduped and bounded. */
function weeksNeeded(bets, weekNow) {
  const want = new Set();
  for (const b of bets) {
    if (b.status !== 'locked') continue;
    for (const c of b.conditions || []) {
      if (c.when === 'week' && c.week && Number(c.week) <= weekNow - CFG.GRADE_WEEK_LAG) {
        want.add(Number(c.week));
      }
    }
  }
  // Most recent first: a bet on last week is the one somebody is refreshing for.
  return [...want].sort((a, b) => b - a).slice(0, CFG.MAX_WEEK_FETCH);
}

// ────────────────────────────────────────────────── evaluating one condition

/**
 * @returns {value: true|false|null, line: string}
 *          `null` means undecidable — the fact is not in yet. The line always
 *          says why, because "we can't tell" with no reason is indistinguishable
 *          from a bug.
 */
function evalCondition(c, ctx, nameOf) {
  const say = (value, line) => ({ value, line });
  const subject = nameOf(c.subject_id);

  switch (c.test) {
    case 'outscores': {
      const other = nameOf(c.target_id);
      if (c.when === 'week') {
        if (!ctx.weekIsFinal(c.week)) {
          return say(null, `Week ${c.week} isn't final yet — nothing to compare.`);
        }
        const a = ctx.weekPoints(c.week, c.subject_id);
        const b = ctx.weekPoints(c.week, c.target_id);
        if (a == null || b == null) {
          return say(null, `No week ${c.week} score on file for ${a == null ? subject : other}.`);
        }
        if (Math.abs(a - b) < CFG.POINTS_EPSILON) {
          return say(null, `Dead tie in week ${c.week}: both on ${a.toFixed(2)}. Your terms have to break it.`);
        }
        return say(a > b, `Week ${c.week}: ${subject} ${a.toFixed(2)}, ${other} ${b.toFixed(2)}.`);
      }
      const a = ctx.seasonPoints(c.subject_id);
      const b = ctx.seasonPoints(c.target_id);
      if (a == null || b == null) return say(null, `No season points on file for ${a == null ? subject : other}.`);
      if (ctx.season && ctx.season.status !== 'complete') {
        return say(null, `Season isn't over — ${subject} ${a.toFixed(2)}, ${other} ${b.toFixed(2)} so far.`);
      }
      if (Math.abs(a - b) < CFG.POINTS_EPSILON) return say(null, `Season points dead level at ${a.toFixed(2)}.`);
      return say(a > b, `Season points: ${subject} ${a.toFixed(2)}, ${other} ${b.toFixed(2)}.`);
    }

    case 'scores_at_least': {
      const need = Number(c.target_number);
      if (c.when === 'week') {
        if (!ctx.weekIsFinal(c.week)) return say(null, `Week ${c.week} isn't final yet.`);
        const a = ctx.weekPoints(c.week, c.subject_id);
        if (a == null) return say(null, `No week ${c.week} score on file for ${subject}.`);
        return say(a >= need, `Week ${c.week}: ${subject} scored ${a.toFixed(2)}, needed ${need}.`);
      }
      const a = ctx.seasonPoints(c.subject_id);
      if (a == null) return say(null, `No season points on file for ${subject}.`);
      if (a >= need) return say(true, `${subject} is on ${a.toFixed(2)} — already past ${need}.`);
      if (ctx.season && ctx.season.status !== 'complete') {
        return say(null, `${subject} is on ${a.toFixed(2)} of ${need} — season still running.`);
      }
      return say(false, `${subject} finished on ${a.toFixed(2)}, short of ${need}.`);
    }

    case 'weekly_high': {
      if (!ctx.weekIsFinal(c.week)) return say(null, `Week ${c.week} isn't final yet.`);
      const winner = ctx.weeklyHigh(c.week);
      if (winner == null) {
        return say(null, `Week ${c.week}'s high scorer hasn't been recorded — the commissioner logs it on the money page.`);
      }
      return say(winner === Number(c.subject_id),
        `Week ${c.week} high scorer: ${nameOf(winner)}.`);
    }

    case 'finishes': {
      const place = PLACES[c.target_place];
      if (!place) return say(null, 'That finishing place is no longer a thing on this site.');
      const order = ctx.finalStandings;
      if (!order) {
        // Show the live picture so the card is still useful mid-season.
        const li = ctx.liveOrder.indexOf(Number(c.subject_id));
        const where = li < 0 ? 'unplaced' : `${li + 1}${['st','nd','rd'][li] || 'th'} right now`;
        return say(null, `Season isn't final — ${subject} is ${where}.`);
      }
      const i = order.indexOf(Number(c.subject_id));
      if (i < 0) return say(null, `${subject} isn't in the final standings for this season.`);
      return say(!!place.test(i, order.length),
        `${subject} finished ${i + 1}${['st','nd','rd'][i] || 'th'} of ${order.length}.`);
    }

    case 'wins_at_least': {
      const need = Number(c.target_number);
      const w = ctx.seasonWins(c.subject_id);
      if (w == null) return say(null, `No record on file for ${subject}.`);
      if (w >= need) return say(true, `${subject} is ${w}–? — already at ${need} wins.`);
      if (ctx.season && ctx.season.status !== 'complete') {
        return say(null, `${subject} has ${w} of the ${need} wins needed — season still running.`);
      }
      return say(false, `${subject} finished with ${w} wins, short of ${need}.`);
    }

    default:
      return say(null, 'Unrecognised condition — settle this one by hand.');
  }
}

// ────────────────────────────────────────────────────── evaluating a bet

/**
 * The verdict. Never applied automatically — handed to a human with its working.
 *
 * @returns {
 *   decided: boolean,
 *   winner_ids: number[],      // empty when undecided, or when it is a push
 *   headline: string,          // one line, the answer
 *   lines: string[],           // the facts used, in order
 *   push: boolean,             // decided, but nobody won (a genuine outcome)
 * }
 */
function evaluate(bet, ctx, nameOf) {
  if (bet.format === 'pool') return evaluatePool(bet, ctx, nameOf);
  return evaluateProposition(bet, ctx, nameOf);
}

function evaluatePool(bet, ctx, nameOf) {
  const outcome = POOL_OUTCOMES[bet.pool_outcome];
  const lines = [];
  if (!outcome) {
    return { decided: false, winner_ids: [], push: false,
             headline: 'This pool has no outcome set — settle it by hand.', lines };
  }

  let winnerOwner = null;
  if (outcome.needs === 'final') {
    const order = ctx.finalStandings;
    if (!order) {
      lines.push('The season is not closed out yet, so the final standings do not exist.');
      if (ctx.liveOrder.length) {
        lines.push(`As it stands: ${ctx.liveOrder.slice(0, 3).map(nameOf).join(', ')} lead.`);
      }
      return { decided: false, winner_ids: [], push: false,
               headline: `Not settled — waiting on the final standings.`, lines };
    }
    winnerOwner = bet.pool_outcome === 'last_place' ? order[order.length - 1] : order[0];
    lines.push(`${nameOf(winnerOwner)} ${outcome.label}.`);
  } else if (bet.pool_outcome === 'most_points') {
    let best = null;
    for (const o of ctx.owners) {
      const pf = ctx.seasonPoints(o.id);
      if (pf == null) continue;
      if (!best || pf > best.pf) best = { id: o.id, pf };
    }
    if (!best) return { decided: false, winner_ids: [], push: false,
                        headline: 'No season points on file yet.', lines };
    if (ctx.season && ctx.season.status !== 'complete') {
      lines.push(`${nameOf(best.id)} leads on ${best.pf.toFixed(2)} points, but the season is still running.`);
      return { decided: false, winner_ids: [], push: false,
               headline: 'Not settled — season still running.', lines };
    }
    winnerOwner = best.id;
    lines.push(`${nameOf(best.id)} scored the most points: ${best.pf.toFixed(2)}.`);
  } else {
    // reg_first — the regular-season table, which is live all year.
    if (ctx.season && ctx.season.status !== 'complete') {
      lines.push(`${nameOf(ctx.liveOrder[0])} is top of the regular season right now, but it is not over.`);
      return { decided: false, winner_ids: [], push: false,
               headline: 'Not settled — regular season still running.', lines };
    }
    winnerOwner = ctx.liveOrder[0];
    lines.push(`${nameOf(winnerOwner)} finished 1st in the regular season.`);
  }

  const holders = (bet.parties || []).filter(p => (p.picks || []).map(Number).includes(Number(winnerOwner)));
  if (!holders.length) {
    lines.push(`Nobody in this pool picked ${nameOf(winnerOwner)}.`);
    return { decided: true, winner_ids: [], push: true,
             headline: `Push — nobody picked ${nameOf(winnerOwner)}.`, lines };
  }
  for (const h of holders) lines.push(`${nameOf(h.owner_id)} had ${nameOf(winnerOwner)}.`);
  return {
    decided: true, push: false,
    winner_ids: holders.map(h => h.owner_id),
    headline: holders.length === 1
      ? `${nameOf(holders[0].owner_id)} wins — they picked ${nameOf(winnerOwner)}.`
      : `${holders.map(h => nameOf(h.owner_id)).join(' and ')} split it — they both had ${nameOf(winnerOwner)}.`,
  };
}

function evaluateProposition(bet, ctx, nameOf) {
  const cs = bet.conditions || [];
  if (!cs.length) {
    return { decided: false, winner_ids: [], push: false,
             headline: 'No conditions on this one — settle it by hand.', lines: [] };
  }
  const results = cs.map(c => ({ c, ...evalCondition(c, ctx, nameOf) }));
  const lines = results.map(r => `${conditionText(r.c, nameOf)} → ${r.value === true ? '✅ yes' : r.value === false ? '❌ no' : '⏳ unknown'} · ${r.line}`);

  const any = bet.logic === 'any';
  const trues = results.filter(r => r.value === true).length;
  const falses = results.filter(r => r.value === false).length;
  const unknowns = results.filter(r => r.value === null).length;

  // Short-circuit: ANY is decided the moment one is true; ALL the moment one is
  // false. Waiting for every fact when the answer is already fixed would leave
  // a settled bet sitting open for months.
  let holds = null;
  if (any && trues > 0) holds = true;
  else if (!any && falses > 0) holds = false;
  else if (unknowns === 0) holds = any ? trues > 0 : falses === 0;

  if (holds === null) {
    return { decided: false, winner_ids: [], push: false,
             headline: `Not settled — ${unknowns} condition${unknowns === 1 ? '' : 's'} still open.`, lines };
  }

  const forId = Number(bet.for_id || bet.proposer_id);
  const forSide = (bet.parties || []).filter(p => Number(p.owner_id) === forId);
  const against = (bet.parties || []).filter(p => Number(p.owner_id) !== forId);
  const winners = holds ? forSide : against;
  return {
    decided: true, push: false,
    winner_ids: winners.map(p => p.owner_id),
    headline: holds
      ? `${nameOf(forId)} wins — the ${any ? 'bet' : 'whole bet'} came in.`
      : `${nameOf(forId)} loses — ${any ? 'none of it landed' : 'it did not all come in'}.`,
    lines,
  };
}

module.exports = {
  CFG, TESTS, PLACES, POOL_OUTCOMES,
  conditionText, betText, makeContext, weeksNeeded, evalCondition, evaluate,
};
