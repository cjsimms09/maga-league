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

  // ── Matchup bets ──────────────────────────────────────────────────────────
  // A bet on this week's game can only be ACCEPTED before football starts.
  // After kickoff you would be betting on information, which is not a bet.
  //
  // Two independent signals, earlier one wins:
  //   1. Points on the board. If anybody in the matchup has scored, a game
  //      involving their roster has kicked off. That is a fact, not a guess,
  //      and it is the signal that actually matters.
  //   2. The weekly deadline below, for the gap between kickoff and the first
  //      score — a few minutes where signal 1 has not fired yet.
  //
  // Thursday 8:15pm New York, which is when the NFL week opens. Expressed in
  // ET rather than UTC on purpose: the league is American and the NFL does not
  // move its kickoff when the clocks change, so a UTC constant would drift by
  // an hour twice a season.
  MATCHUP_LOCK_DAY: 4,          // Thursday, as getDay()
  MATCHUP_LOCK_HOUR: 20,
  MATCHUP_LOCK_MINUTE: 15,
  MATCHUP_LOCK_TZ: 'America/New_York',
  // The fantasy week turns over on Tuesday — after Monday night, before Thursday.
  MATCHUP_WEEK_START_DAY: 2,    // Tuesday

  // Thursday of NFL week 1, in New York. Every other week's kickoff is derived
  // from it, so one date pins the whole calendar. Commissioner-overridable via
  // config.season_start.
  SEASON_START: '2026-09-10',
  // Every offer dies after this long, whatever it is about. A season-long bet
  // is legitimately acceptable in October — but not because it has been sitting
  // in a list since August and somebody just noticed it is now free money. If
  // you still want the bet, send it again.
  PROPOSAL_MAX_DAYS: 10,
  // Where the fantasy playoffs start, when Sleeper has not told us. Verified
  // against the live league on 2026-08-07: playoff_week_start is 16, not the 15
  // I had guessed. It is only a fallback — the real value is read from Sleeper
  // per request — but the fallback is what runs whenever Sleeper is briefly
  // unreachable, and a season-long bet closing a week early is the kind of
  // wrong that only shows up in an argument.
  PLAYOFF_WEEK_DEFAULT: 16,
  // A bet offered once the week is already in play. Live betting is fine — you
  // are both watching the same game — but it cannot SIT, because every minute
  // that passes moves the price. Three hours is about one afternoon of football.
  IN_PLAY_HOURS: 3,
};

/**
 * Minutes to add to a New York wall-clock time to get UTC. Handles EDT/EST
 * without a timezone library: format the same instant in both zones and take
 * the difference.
 */
function etOffsetMinutes(at) {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const et = new Date(at.toLocaleString('en-US', { timeZone: CFG.MATCHUP_LOCK_TZ }));
  return Math.round((utc - et) / 60000);
}

/**
 * When this football week's first game starts, as a real instant.
 *
 * Anchored to the Tuesday the fantasy week began, so on a Monday you get this
 * week's Thursday (already past) rather than next week's.
 */
function weekLockAt(at = new Date()) {
  const off = etOffsetMinutes(at);
  const et = new Date(at.getTime() - off * 60000);      // wall clock, held in UTC fields
  const since = (et.getUTCDay() - CFG.MATCHUP_WEEK_START_DAY + 7) % 7;
  const lock = new Date(et);
  lock.setUTCDate(et.getUTCDate() - since + (CFG.MATCHUP_LOCK_DAY - CFG.MATCHUP_WEEK_START_DAY));
  lock.setUTCHours(CFG.MATCHUP_LOCK_HOUR, CFG.MATCHUP_LOCK_MINUTE, 0, 0);
  return new Date(lock.getTime() + off * 60000);
}

/** Kickoff of a given NFL week: week 1's Thursday plus seven days per week. */
function kickoffOf(week, seasonStart) {
  const base = new Date(`${seasonStart || CFG.SEASON_START}T12:00:00Z`);
  const day = new Date(base.getTime() + (Math.max(1, Number(week) || 1) - 1) * 7 * 86400000);
  const off = etOffsetMinutes(day);
  const et = new Date(day.getTime() - off * 60000);
  et.setUTCHours(CFG.MATCHUP_LOCK_HOUR, CFG.MATCHUP_LOCK_MINUTE, 0, 0);
  return new Date(et.getTime() + off * 60000);
}

/**
 * The last moment a bet can be ACCEPTED, and why.
 *
 * The rule is one sentence: you cannot accept a bet after the first thing it
 * depends on has started. Everything else follows from reading the bet.
 *
 * This exists because of a specific way to get robbed. Somebody offers you a
 * week-4 bet on Wednesday, you say nothing, and on Monday morning — with their
 * team up fifty — you accept. They forgot to withdraw it, so you have taken a
 * bet you already know you have won. Hiding the button is not enough; the
 * deadline has to be a property of the bet, checked on the server, for every
 * kind of bet rather than just the matchup ones.
 *
 * @returns { at: Date|null, why: string, open: boolean, reason: string }
 */
function acceptDeadline(bet, ctx = {}, at = new Date()) {
  const start = ctx.seasonStart || CFG.SEASON_START;
  const playoffWeek = Number(ctx.playoffWeek) || CFG.PLAYOFF_WEEK_DEFAULT;
  const weeks = (bet.conditions || [])
    .filter(c => c.when === 'week' && c.week).map(c => Number(c.week));
  if (bet.kind === 'matchup' && bet.week) weeks.push(Number(bet.week));

  // Expiry depends on what the bet is ABOUT. Three kinds, three rules — one
  // universal clock would be wrong for at least two of them.
  let deadline = null, why = '';

  if (weeks.length) {
    // ── A specific week ───────────────────────────────────────────────────
    // It dies when that week starts scoring. No day-count on top: a week-17
    // bet offered in September is still a bet on a week that has not happened,
    // and both of you know exactly as much about week 17 as each other.
    const wk = Math.min(...weeks);
    const kick = kickoffOf(wk, start);
    const offered = bet.created_at ? new Date(bet.created_at) : null;
    if (offered && offered > kick) {
      // Offered once the week is already in play. Allowed — you are both
      // watching — but it gets hours, not days, because every minute moves the
      // price and only one of you is watching it move.
      deadline = new Date(offered.getTime() + CFG.IN_PLAY_HOURS * 3600000);
      why = `it was offered mid-week, and live offers only stand for ${CFG.IN_PLAY_HOURS} hours`;
    } else {
      deadline = kick;
      why = `week ${wk} kicks off`;
    }
  } else {
    // ── Season-long, or anything with no event to hang it on ──────────────
    // Ten days to answer. A season bet can be struck in October, but not
    // because it has been sitting in a list since August.
    if (bet.created_at) {
      deadline = new Date(new Date(bet.created_at).getTime() + CFG.PROPOSAL_MAX_DAYS * 86400000);
      why = `nobody answered it in ${CFG.PROPOSAL_MAX_DAYS} days`;
    }
    // ...and a season bet is dead once the playoffs start regardless, because
    // by then the table has stopped being a question.
    if (bet.format === 'pool'
        || (bet.conditions || []).some(c => c.when === 'season' || c.test === 'finishes')) {
      const po = kickoffOf(playoffWeek, start);
      if (!deadline || po < deadline) {
        deadline = po;
        why = `the playoffs start (week ${playoffWeek})`;
      }
    }
  }

  if (!deadline) return { at: null, why: '', open: true, reason: '', stale: false };
  const open = at < deadline;
  // A stale offer is one that timed out waiting for an answer, as opposed to
  // one overtaken by events. The difference matters: stale gets "send it again",
  // too-late does not, because the thing it was about has happened.
  const stale = !open && (/nobody answered/.test(why) || /only stand for/.test(why));
  return {
    at: deadline, why, open, stale,
    reason: open ? ''
      : stale ? `This offer expired — ${why}. Send it again if you still want it.`
              : `Too late — ${why}. This one had to be accepted before then.`,
  };
}

/**
 * Can a bet on this week's matchup still be accepted?
 *
 * @param matchup  sleeper.myMatchup() shape, or null
 * @returns { open, reason, locks_at }
 */
function matchupWindow(matchup, at = new Date()) {
  const locks_at = weekLockAt(at);
  const scored = matchup
    && ((matchup.me && matchup.me.points > 0) || (matchup.opp && matchup.opp.points > 0));
  if (scored) {
    return { open: false, locks_at,
             reason: 'Games have started — there are points on the board.' };
  }
  if (at >= locks_at) {
    return { open: false, locks_at,
             reason: 'Kickoff has passed. Bets on this week closed Thursday night.' };
  }
  return { open: true, locks_at, reason: '' };
}

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
  finishes: {
    label: 'finishes',
    target: 'place',
    when: ['season'],
    hint: 'where they end up when it is all over',
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

/* ── Pool rules ───────────────────────────────────────────────────────────────
 *
 * A pool is the shape of the bet this league actually makes: "we each pick five
 * teams, and whoever picked the champion wins." What makes it work as software
 * is not one outcome but an ORDERED LIST of them.
 *
 * Because the interesting case is the one that happens most years — NEITHER of
 * you picked the champion. In the group chat that gets settled by falling back
 * to something else: whose best team finished higher, who had more teams in the
 * playoffs, whose five scored more points between them. That fallback is the
 * real "if/then" in a bet like this, and it is what the condition builder
 * should have been all along instead of "scores at least 140 points".
 *
 * So: rules are evaluated in order. The first one that SEPARATES the field
 * decides it. A tie falls through to the next rule. Run out of rules with
 * everyone still level and it is a push.
 *
 * Every rule scores each person's whole set of picks, higher being better, so
 * "did you have the champion" (1 or 0) and "how many wins did your five rack
 * up" (a count) are the same kind of thing and compose in one list.
 */
const POOL_RULES = {
  // ── Outcome rules: one thing happened, and either you had it or you did not.
  // `teams` returns everyone who won it — usually one, but 2022 split the title
  // between Sam and Marian and that has to be representable.
  champion: {
    kind: 'outcome',
    label: 'whoever picked the champion',
    needs: 'final',
    teams: ctx => ctx.champions,
    note: (ctx, nameOf) => ctx.champions.length > 1
      ? `${ctx.champions.map(nameOf).join(' and ')} shared the title.`
      : `${nameOf(ctx.champions[0])} won it all.`,
  },
  reg_first: {
    kind: 'outcome',
    label: 'whoever picked the regular-season #1',
    needs: 'complete',
    teams: ctx => [ctx.liveOrder[0]],
    note: (ctx, nameOf) => `${nameOf(ctx.liveOrder[0])} finished 1st in the regular season.`,
  },
  last_place: {
    kind: 'outcome',
    label: 'whoever picked the last-place team',
    needs: 'final',
    teams: ctx => [ctx.finalStandings[ctx.finalStandings.length - 1]],
    note: (ctx, nameOf) => `${nameOf(ctx.finalStandings[ctx.finalStandings.length - 1])} took the toilet.`,
  },
  best_finish: {
    label: "whoever's best team finished higher",
    needs: 'final',
    // Negated index: 1st place is index 0, and higher must mean better.
    score: (picks, ctx) => {
      const idx = picks.map(p => ctx.finalStandings.indexOf(Number(p))).filter(i => i >= 0);
      return idx.length ? -Math.min(...idx) : -999;
    },
    fmt: v => (v === -999 ? 'nothing placed' : `best was ${-v + 1}${['st', 'nd', 'rd'][-v] || 'th'}`),
  },
  most_playoff: {
    label: 'whoever got more teams into the playoffs',
    needs: 'final',
    score: (picks, ctx) => picks.filter(p => {
      const i = ctx.finalStandings.indexOf(Number(p));
      return i >= 0 && i < CFG.PLACE_PLAYOFF_CUT;
    }).length,
    fmt: v => `${v} in`,
  },
  most_wins: {
    label: 'whose teams won the most games between them',
    needs: 'complete',
    score: (picks, ctx) => picks.reduce((n, p) => n + (ctx.seasonWins(p) || 0), 0),
    fmt: v => `${v} wins`,
  },
  most_points: {
    label: 'whose teams scored the most points between them',
    needs: 'complete',
    score: (picks, ctx) => picks.reduce((n, p) => n + (ctx.seasonPoints(p) || 0), 0),
    fmt: v => `${Math.round(v * 10) / 10} pts`,
  },
  top_scorer: {
    kind: 'outcome',
    label: 'whoever picked the highest-scoring team',
    needs: 'complete',
    teams: ctx => {
      let best = null;
      for (const o of ctx.owners) {
        const pf = ctx.seasonPoints(o.id);
        if (pf == null) continue;
        if (!best || pf > best.pf) best = { id: o.id, pf };
      }
      return best ? [best.id] : [];
    },
  },
};

// Kept so bets written before rules were ordered still read and grade.
const POOL_OUTCOMES = POOL_RULES;

/** The rule list for a bet, tolerating the older single-outcome shape. */
function poolRules(bet) {
  const list = (bet.pool_rules && bet.pool_rules.length) ? bet.pool_rules
    : (bet.pool_outcome ? [bet.pool_outcome] : ['champion']);
  return list.filter(k => POOL_RULES[k]);
}

/** Can this rule be called yet, and if not, what is missing? */
function poolRuleReady(rule, ctx) {
  if (rule.needs === 'final') {
    return ctx.finalStandings
      ? { ok: true }
      : { ok: false, why: 'the season has not been closed out, so there are no final standings yet' };
  }
  return (ctx.season && ctx.season.status === 'complete')
    ? { ok: true }
    : { ok: false, why: 'the season is still running' };
}

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
    const n = bet.picks_required || 0;
    const rules = poolRules(bet).map(k => POOL_RULES[k].label);
    const head = n ? `We each pick ${n} teams.` : 'We each pick teams.';
    if (!rules.length) return `${head} Winner takes the pot.`;
    // The tiebreakers are the interesting part, so they get said out loud.
    const chain = rules.length === 1 ? rules[0]
      : rules[0] + rules.slice(1).map(r => `; if that ties, ${r}`).join('');
    return `${head} Decided by ${chain}.`;
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
function makeContext({ season, liveRows = [], weeklyHigh = [], weekPoints = {}, weekNow = 1,
                      owners = [], champions = null, seasonStart = null }) {
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
    // Usually one team. In 2022 the title was split, and a bet where each side
    // held one of the co-champions is a push — so more than one has to fit.
    champions: champions && champions.length ? champions.map(Number)
      : ((season && season.status === 'complete' && (season.standings || []).length)
          ? [Number(season.standings[0])] : []),
    seasonStart: seasonStart || null,
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
  // A tie is not "we can't tell" — it is a result. The bet is off and both
  // sides get their stake back. Leaving it undecided meant a dead-level week
  // sat open forever waiting for a fact that was never coming.
  const tie = line => ({ value: null, push: true, line });
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
          return tie(`Dead tie in week ${c.week}: both on ${a.toFixed(2)}. Bet's off.`);
        }
        return say(a > b, `Week ${c.week}: ${subject} ${a.toFixed(2)}, ${other} ${b.toFixed(2)}.`);
      }
      const a = ctx.seasonPoints(c.subject_id);
      const b = ctx.seasonPoints(c.target_id);
      if (a == null || b == null) return say(null, `No season points on file for ${a == null ? subject : other}.`);
      if (ctx.season && ctx.season.status !== 'complete') {
        return say(null, `Season isn't over — ${subject} ${a.toFixed(2)}, ${other} ${b.toFixed(2)} so far.`);
      }
      if (Math.abs(a - b) < CFG.POINTS_EPSILON) return tie(`Season points dead level at ${a.toFixed(2)}. Bet's off.`);
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
  const rules = poolRules(bet);
  const lines = [];
  if (!rules.length) {
    return { decided: false, winner_ids: [], push: false,
             headline: 'This pool has no rules set — settle it by hand.', lines };
  }

  let last = null;
  for (const key of rules) {
    const rule = POOL_RULES[key];
    const ready = poolRuleReady(rule, ctx);
    if (!ready.ok) {
      lines.push(`${rule.label} — not yet: ${ready.why}.`);
      if (ctx.liveOrder.length) {
        lines.push(`As it stands: ${ctx.liveOrder.slice(0, 3).map(nameOf).join(', ')} lead.`);
      }
      return { decided: false, winner_ids: [], push: false,
               headline: `Not settled — ${ready.why}.`, lines };
    }

    if (rule.kind === 'outcome') {
      const won = (rule.teams(ctx) || []).map(Number).filter(Boolean);
      const holders = (bet.parties || []).map(p => ({
        party: p,
        held: (p.picks || []).map(Number).filter(t => won.includes(t)),
      })).filter(h => h.held.length);

      if (rule.note) lines.push(rule.label + ' — ' + rule.note(ctx, nameOf));

      // ── The dead heat ──────────────────────────────────────────────────
      // The thing itself was shared, and the two of you held different halves
      // of it. Neither was more right than the other, so nobody's money moves.
      // This is NOT the same as "we both picked the same winner" and it is not
      // something a tiebreaker should decide — you'd each be paying for the
      // other's correct pick.
      const distinct = new Set(holders.flatMap(h => h.held));
      if (won.length > 1 && holders.length > 1 && distinct.size > 1) {
        lines.push(holders.map(h =>
          `${nameOf(h.party.owner_id)} had ${h.held.map(nameOf).join(', ')}`).join('; ') + '.');
        lines.push('Split outcome, split down the middle — everyone gets their stake back.');
        return { decided: true, winner_ids: [], push: true,
                 headline: 'Push — the title was shared and you held one each.', lines };
      }

      lines.push(holders.length
        ? holders.map(h => `${nameOf(h.party.owner_id)} had them`).join(', ')
        : 'Nobody had them.');
      last = { rule, winners: holders.map(h => h.party), everyoneMissed: !holders.length };

      if (holders.length === 1) {
        return { decided: true, push: false,
                 winner_ids: [holders[0].party.owner_id],
                 headline: `${nameOf(holders[0].party.owner_id)} wins it.`, lines };
      }
    } else {
      const scored = (bet.parties || []).map(p => ({
        party: p, score: rule.score((p.picks || []).map(Number), ctx),
      }));
      const best = Math.max(...scored.map(x => x.score));
      const winners = scored.filter(x => x.score === best);
      lines.push(`${rule.label}: `
        + scored.map(x => `${nameOf(x.party.owner_id)} ${rule.fmt ? rule.fmt(x.score) : x.score}`).join(', '));
      last = { rule, winners: winners.map(w => w.party), everyoneMissed: false };
      if (winners.length === 1) {
        return { decided: true, push: false,
                 winner_ids: [winners[0].party.owner_id],
                 headline: `${nameOf(winners[0].party.owner_id)} wins it.`, lines };
      }
    }

    if (rules.indexOf(key) < rules.length - 1) {
      lines.push(last.everyoneMissed ? '→ Nobody hit that one. Next rule.'
                                     : '→ Level on that one. Next rule.');
    }
  }

  if (last && last.everyoneMissed) {
    lines.push('No rule separated anyone.');
    return { decided: true, winner_ids: [], push: true,
             headline: 'Push — nobody won it. Add a tiebreaker next year.', lines };
  }
  // Level after everything. Same rule as anywhere else: a tie voids the bet and
  // the money goes back. Splitting a pot nobody won means both sides paying for
  // a result neither of them got right.
  lines.push("Still level after every rule — bet's off.");
  return {
    decided: true, push: true, winner_ids: [],
    headline: 'Push — dead level on every rule. Everyone gets their money back.',
    lines,
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
  const pushes = results.filter(r => r.push);
  const unknowns = results.filter(r => r.value === null && !r.push).length;

  // Order matters here, and it is the order a person would reason in:
  //   1. Already settled either way? Then a tie elsewhere is irrelevant — if
  //      you needed BOTH and one flatly failed, you lost, tie or no tie.
  //   2. Otherwise a tie voids the whole thing.
  //   3. Otherwise wait for the facts that are still missing.
  let holds = null;
  if (any && trues > 0) holds = true;
  else if (!any && falses > 0) holds = false;

  if (holds === null && pushes.length) {
    return { decided: true, winner_ids: [], push: true,
             headline: "Push — it ended level, so the bet's off and everyone gets their money back.",
             lines };
  }
  if (holds === null && unknowns === 0) holds = any ? trues > 0 : falses === 0;

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
  CFG, TESTS, PLACES, POOL_OUTCOMES, POOL_RULES, poolRules,
  conditionText, betText, makeContext, weeksNeeded, evalCondition, evaluate,
  weekLockAt, matchupWindow, kickoffOf, acceptDeadline,
};
