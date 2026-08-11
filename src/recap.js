/* THE WEEKLY RECAP — the one thing on this site that is for the league.
 *
 * Everything else built here is a tool for the commissioner: the war room, the
 * optimizer, the waiver tool, the accuracy page. The site has history and money
 * and standings, but those are things people have to go and look at. This is the
 * one thing that reaches nine people on a Tuesday morning and makes the league
 * better for them rather than making one person better at beating them.
 *
 * ── THE GOVERNING RULE: EVERY SENTENCE IS EARNED BY A FACT ───────────────────
 *
 * The failure mode is generic filler — "a hard-fought battle" stapled onto a
 * 40-point blowout. So no phrase is ever chosen at random from a pool that could
 * describe any week. Every line is selected by a MEASURED quantity: the margin
 * band picks the verb, the streak length picks the tone, the gap between the
 * weekly high and second place decides whether the hundred dollars was a
 * coronation or a mugging. Change the number and the sentence changes.
 *
 * And if nothing clears the bar, it says the week was boring in one line and
 * stops. A short honest email beats a long one pretending. That judgement is
 * already applied to the optimizer's eighty-nine-percent-nothing weeks; it is
 * the same judgement.
 *
 * ── VOICE ────────────────────────────────────────────────────────────────────
 *
 * The chronicle register (docs/queued/history-chronicle-voice.md) at conversation
 * volume: a friend narrating the week, not a newsletter. Funny at everyone's
 * expense INCLUDING the commissioner's — and nothing that reads as a genuine dig
 * at one person. Group-chat abuse works because everyone is in the group chat;
 * an email is one-directional and lands differently. The specific discipline
 * that keeps it on the right side of that line: **mock the RESULT, never the
 * person.** "Lost by one" is funny. "Is bad at this" is not, and is not here.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 *
 * No runtime LLM calls (same rule the chronicle runs under). Variety comes from
 * a phrase index seeded on (season, week), so the wording moves week to week and
 * is reproducible for a test — a recap you cannot write a test against is a
 * recap nobody can check for meanness before it goes out.
 */
'use strict';

const r1 = n => Math.round(Number(n || 0) * 10) / 10;

// Deterministic pick — same week, same wording; different week, different.
function seeded(season, week, salt) {
  let h = 2166136261 ^ Number(week || 0);
  const s = String(season) + '|' + String(salt || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
const pick = (arr, season, week, salt) => arr[seeded(season, week, salt) % arr.length];

/* ── MARGIN BANDS ────────────────────────────────────────────────────────────
 * The verb comes from the number. A 0.6-point game and a 58-point game do not
 * get the same sentence, and no sentence in one band can be produced by another.
 */
const BANDS = [
  // A TIE IS NOT A NARROW WIN. Sleeper reports ties, the writer's shape is
  // winner/loser, and with no band of its own a 0-point margin came out as
  // "**Sam** beat Jeremy by 0. By 0." — a sentence that is not merely awkward
  // but false, in an email nine people cannot correct.
  { max: 0.0,  key: 'tie' },
  { max: 1.0,  key: 'heartbreak' },
  { max: 3.0,  key: 'squeaker' },
  { max: 10.0, key: 'close' },
  { max: 25.0, key: 'comfortable' },
  { max: 45.0, key: 'beating' },
  { max: 1e9,  key: 'massacre' },
];
const bandOf = margin => BANDS.find(b => margin <= b.max).key;

const GAME_LINES = {
  tie: [
    '{w} and {l} tied. {ws} apiece. Two hours of football to arrive at exactly nowhere, and neither of them gets the satisfaction of blaming anyone.',
    '{w} {ws}, {l} {ls}. A tie. Both of these men are going to spend the week explaining which one of them really won.',
  ],
  heartbreak: [
    '{w} beat {l} by {m}. By {m}. Somewhere in that box score is a single decision {l} is going to think about until Thursday.',
    '{w} {ws}, {l} {ls}. A margin of {m} is not a win, it is a coin that landed on its edge.',
  ],
  squeaker: [
    '{w} got past {l} {ws}–{ls}. Three points or fewer is the worst way to lose and the least satisfying way to win, so nobody enjoyed that one.',
    '{w} over {l} by {m}. Both of these teams checked the scoreboard on Monday night and neither of them liked what they saw until it was over.',
  ],
  close: [
    '{w} handled {l} {ws}–{ls} — close enough to watch, not close enough to panic.',
    '{w} beat {l} by {m}. A real game, decided by a real margin, which is about as much as anyone can ask for.',
    '{w} {ws}, {l} {ls}. {l} had a look at it late and could not get there.',
  ],
  comfortable: [
    '{w} beat {l} {ws}–{ls}. Never especially in doubt.',
    '{w} took care of {l} by {m}. The kind of win you forget by Wednesday.',
    '{w} beat {l} by {m} without ever looking especially worried about it.',
    '{w} {ws}, {l} {ls}. Fine. Next.',
  ],
  beating: [
    '{w} beat {l} {ws}–{ls}. At some point on Sunday afternoon {l} stopped watching the games and started watching the waiver wire.',
    '{w} beat {l} by {m}, which was settled early and stayed settled.',
    '{w} {ws}, {l} {ls}. Not close, not cruel, just over.',
  ],
  massacre: [
    '{w} beat {l} {ws}–{ls}, a margin of {m}. There is no analysis to offer here. One team played football and the other one filed a lineup.',
    '{w} put {ws} on {l} and won by {m}. That is not a loss, that is a weather event.',
    '{w} {ws}, {l} {ls}. {m} points. We are contractually obliged to report this and we take no pleasure in it.',
  ],
};

/* ── THE HUNDRED DOLLARS ─────────────────────────────────────────────────────
 * 37.5% of the pot pays out on weekly highs, which makes this the single most
 * consequential line in the email. It is never omitted and never buried.
 */
function highDollarsLine(high, second, season, week) {
  if (!high) return null;
  const gap = second ? r1(high.points - second.points) : null;
  if (gap == null) {
    return `**${high.name}** posted ${r1(high.points)} and took the week's $100.`;
  }
  if (gap <= 1.5) {
    return `**${high.name}** took the week's **$100** with ${r1(high.points)} — ${gap} clear of `
         + `${second.name}, who will be recalculating that for a while. A hundred dollars, decided by ${gap} points.`;
  }
  if (gap >= 25) {
    return `**${high.name}** ran away with the week's **$100**: ${r1(high.points)}, which is `
         + `${gap} more than anyone else managed. Nobody was close, and nobody is pretending they were.`;
  }
  return `**${high.name}** took the week's **$100** with ${r1(high.points)}, `
       + `${gap} ahead of ${second.name}.`;
}

/* ── STREAKS ─────────────────────────────────────────────────────────────────
 * Both directions, because a four-game skid is funnier than a four-game run and
 * both are worth naming. Under three is not a streak, it is two results.
 */
function streakLine(s, season, week) {
  if (!s || s.length < 3) return null;
  if (s.kind === 'W') {
    return s.length >= 5
      ? `**${s.name}** has now won ${s.length} in a row. This has stopped being a hot streak and started being a problem for everyone else.`
      : `**${s.name}** makes it ${s.length} straight.`;
  }
  return s.length >= 5
    ? `**${s.name}** has lost ${s.length} in a row. At this point we are less interested in the fantasy football and more concerned as friends.`
    : `**${s.name}** has dropped ${s.length} straight and would like everyone to stop bringing it up.`;
}

/* ── THE FUNNY THINGS ────────────────────────────────────────────────────────
 * Found in the data, not invented, and RANKED — the best two or three, never all
 * of them. A list of six mild observations reads as filler; two good ones read as
 * someone who actually watched.
 *
 * Each carries a `weight`, and the weight is the measured magnitude, so the
 * ordering is a property of the week rather than of this file.
 */
function findNotables(games, week) {
  const out = [];
  for (const g of games) {
    for (const side of [g.winner, g.loser]) {
      if (!side) continue;
      const beat = (side.bench || []).filter(b => b.points > (side.worstStarter ? side.worstStarter.points : 0));
      // THE BENCHED PLAYER WHO OUTSCORED THE STARTER. Only worth saying when the
      // gap would have mattered — otherwise it is true every week for everyone.
      if (beat.length && side.worstStarter) {
        const best = beat.sort((a, b) => b.points - a.points)[0];
        const gap = r1(best.points - side.worstStarter.points);
        if (gap >= 8) {
          const flipped = side === g.loser && gap > g.margin;
          out.push({ kind: flipped ? 'flipped' : 'bench', weight: flipped ? 100 + gap : gap,
            text: flipped
              ? `**${side.name}** left ${best.name} (${r1(best.points)}) on the bench and started ${side.worstStarter.name} (${r1(side.worstStarter.points)}). `
                + `The gap was ${gap}. The game was decided by ${g.margin}. That one is going to sit there a while.`
              : `**${side.name}** benched ${best.name} for ${gap} more points than the man who played. It didn't cost the game, which is the only good news in that sentence.` });
        }
      }
      // A ZEROED STARTER. Sleeper reports 0.0 for a player who never took the
      // field, so this is "the lineup was not set" as far as anyone can tell.
      const zeros = (side.starters || []).filter(p => p.points === 0);
      if (zeros.length >= 2) {
        out.push({ kind: 'unset', weight: 60 + zeros.length,
          text: `**${side.name}** started ${zeros.length} players who scored exactly nothing. `
              + `We are not going to say the lineup was never set. We are going to report the number and let everyone draw their own conclusion.` });
      }
    }
    // THE KICKER DECIDED IT. Tightened after driving a real week: "the margin
    // was smaller than the kicker's score" is true in most games, because
    // kickers score 8-14 and plenty of games are decided by less. It fired on
    // THREE of five matchups in one email and pushed the genuinely good material
    // out of the top three. It is only a story when the game was a coin flip, so
    // the squeaker band is required too.
    //
    // `kind` matters as much as the threshold. Without it this notable had no
    // key, the one-per-kind map collapsed every kind-less finding into a single
    // slot, and the repeat-suppression appeared to work for the wrong reason —
    // which is why the end-to-end drive went green while this fix was, in fact,
    // not applied at all. Found by rule 10: the break stayed green.
    if (g.winner && g.winner.kicker && g.margin > 0 && g.margin <= 3
        && g.margin < g.winner.kicker.points) {
      out.push({ kind: 'kicker', weight: 80 + (g.winner.kicker.points - g.margin),
        text: `**${g.winner.name}** won by ${g.margin}. ${g.winner.kicker.name} scored ${r1(g.winner.kicker.points)}. `
            + `A kicker decided a football game, which is the most fantasy football sentence anyone will read this week.` });
    }
  }
  // ONE INSTANCE PER KIND. A running joke told three times in one email is not
  // three findings, it is a mail merge — and worse, the repeats pushed the
  // best material out of the top three. Keep the strongest example of each
  // shape; the rest of that shape is noise once the point has been made.
  // A notable with no `kind` would silently share one slot with every other
  // kind-less notable, which is how a broken threshold looked fixed. Fall back to
  // a unique key so a forgotten `kind` shows up as a repeated line — a visible
  // bug — rather than as accidental deduplication.
  const bestOf = new Map();
  out.sort((a, b) => b.weight - a.weight).forEach((n, i) => {
    const key = n.kind || `unkinded-${i}`;
    if (!bestOf.has(key)) bestOf.set(key, n);
  });
  return [...bestOf.values()].sort((a, b) => b.weight - a.weight);
}

/* ── THE CRUELLEST LOSS ──────────────────────────────────────────────────────
 * Losing with the second-highest score of the week is the single best piece of
 * material a fantasy week produces, and it needs no embellishment.
 */
function robbedLine(games, ranked) {
  if (ranked.length < 3) return null;
  const second = ranked[1];
  const g = games.find(x => x.loser && x.loser.name === second.name);
  if (!g) return null;
  return `**${second.name}** put up ${r1(second.points)} — the second-best score in the league — `
       + `and lost, because ${g.winner.name} put up ${r1(g.winner.points)}. `
       + `Any other week that is a hundred dollars. This week it is nothing.`;
}
function loserBonusLine(games, ranked) {
  if (ranked.length < 3) return null;
  const low = ranked[ranked.length - 1];
  const g = games.find(x => x.winner && x.winner.name === low.name);
  if (!g) return null;
  return `**${g.loser.name}** lost to the lowest score in the league. `
       + `${low.name} scored ${r1(low.points)} and it was enough. Somebody had to.`;
}

/* ── PLAYOFF LINE ────────────────────────────────────────────────────────────
 * A line or two, never a table. Who is safe, who is in trouble, who is on the
 * bubble — and nothing at all before the numbers mean anything.
 */
function playoffLine(picture, cut) {
  if (!picture || !picture.length) return null;
  const safe = picture.filter(p => p.odds >= 90).map(p => p.name);
  const dead = picture.filter(p => p.odds <= 5).map(p => p.name);
  const bubble = picture.filter(p => p.odds > 25 && p.odds < 75).map(p => p.name);
  // "Cory, David are effectively in" is how a list built by join() reads, and it
  // reads like a machine wrote it. An Oxford-comma list with "and" does not.
  const list = names => names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const bits = [];
  if (safe.length) bits.push(`${list(safe)} ${safe.length === 1 ? 'is' : 'are'} effectively in`);
  // NO SILENT TRUNCATION. This used to name four and drop the rest, which reads
  // as "these four are uniquely on the bubble" when in fact eight were. Past
  // four, count them instead of listing them — the same rule applied to the
  // accuracy page's "the latest 12 of 202".
  if (bubble.length) {
    bits.push(bubble.length <= 4
      ? `${list(bubble)} ${bubble.length === 1 ? 'is' : 'are'} on the bubble`
      : `${bubble.length} of the ${picture.length} are still genuinely live`);
  }
  if (dead.length) bits.push(`${list(dead)} ${dead.length === 1 ? 'is' : 'are'} playing for pride and the draft order`);
  if (!bits.length) return null;
  return bits.join('; ') + '.';
}

/**
 * BUILD THE RECAP.
 *
 * Input is a fully-resolved week — the caller does the data gathering, this does
 * the writing, so the prose is testable without a network.
 *
 * Returns `{ ready, reason }` when it will not write one. It NEVER writes a
 * partial recap: a half-told week is worse than no email, and "the data was not
 * ready" is a thing the caller must be able to act on rather than paper over.
 */
function buildRecap(input) {
  const { season, week, games = [], ranked = [], streaks = [], playoff = null,
          rivalry = null, cut = 6 } = input || {};

  if (!week) return { ready: false, reason: 'no-week' };
  if (!games.length) return { ready: false, reason: 'no-games' };
  // EVERY game must be final. One unfinished matchup and the story is wrong, not
  // incomplete — "X beat Y" is a claim, and it is false at 4pm on Sunday.
  const unfinished = games.filter(g => !g.final);
  if (unfinished.length) {
    return { ready: false, reason: 'week-not-final',
             note: `${unfinished.length} of ${games.length} matchups have not finished` };
  }

  const high = ranked[0] || null, second = ranked[1] || null;
  const notables = findNotables(games, week);
  const closest = [...games].sort((a, b) => a.margin - b.margin)[0];
  const widest = [...games].sort((a, b) => b.margin - a.margin)[0];

  // ── THE LEDE. Whatever was actually most remarkable, and NOT a generic
  // scene-setter. If the week's best fact is mild, the lede says so.
  // ── THE LEDE MEASURES THE WEEK. IT DOES NOT ASSUME ITS SHAPE ──────────────
  //
  // Every one of these sentences was wrong on some week when it was written by
  // assumption instead of by count, and reading seven weeks of output found them:
  //
  //   • "came down to X points in ONE GAME" — on a week where TWO games were
  //     decided by 0.6, which the number was right about and the noun was not.
  //   • "mostly normal apart from ONE RESULT that should be investigated" — on a
  //     week where all five games were blowouts. There was no normal background
  //     for the outlier to stand against; the outlier WAS the week.
  //
  // Both are the same failure and it is the one this module exists to prevent,
  // inverted: not filler attached to a specific week, but a specific claim
  // attached to a week that does not fit it. So the lede now counts.
  const tied = games.filter(g => g.margin === 0);
  const bands = games.map(g => bandOf(g.margin));
  const n = games.length;
  const nTight = bands.filter(b => b === 'heartbreak' || b === 'squeaker').length;
  const nBlowout = bands.filter(b => b === 'massacre').length;
  const tightest = closest ? games.filter(g => g.margin === closest.margin).length : 0;
  let lede;
  if (tied.length) {
    lede = `Week ${week} produced a tie, which happens roughly never and pleases absolutely nobody.`;
  } else if (nBlowout >= Math.ceil(n / 2)) {
    lede = `Week ${week} was a bloodbath — ${nBlowout} of the ${n} games were over before Sunday afternoon. `
         + 'There is not much to narrate about a massacre, so this will be short.';
  } else if (nTight >= Math.ceil(n / 2)) {
    lede = `Week ${week} was decided by inches — ${nTight} of the ${n} games came down to three points or fewer. `
         + 'Everybody watched the whole slate whether they wanted to or not.';
  } else if (closest && closest.margin <= 1.0) {
    lede = tightest > 1
      ? `Week ${week} produced ${tightest} games decided by ${closest.margin} points, which is the whole reason we do this.`
      : `Week ${week} came down to ${closest.margin} points in one game, which is the whole reason we do this.`;
  } else if (notables.length && notables[0].weight >= 100) {
    lede = `Week ${week} produced one genuinely painful piece of lineup management, and we will get to it.`;
  } else if (widest && widest.margin >= 60) {
    lede = `Week ${week} was mostly normal apart from one result that should probably be investigated.`;
  } else if (closest && closest.margin >= 15) {
    lede = `Week ${week} was, frankly, a quiet one. Every game was decided by ${r1(closest.margin)} or more and nothing needed a calculator.`;
  } else {
    lede = `Week ${week}, in the order it happened.`;
  }

  // ── THE GAMES. Every matchup, phrased by its own margin.
  // Two games in the same band must not produce the same sentence. The seeded
  // pick is deterministic per (week, index), so without this a three-game band
  // reads like a mail merge — which is exactly the tell this whole module exists
  // to avoid. Walk forward from the seeded choice until an unused line is found.
  //
  // AND WHEN A BAND RUNS OUT, IT SAYS THE SCORE. With more games in a band than
  // there are phrases for it, the walk-forward wrapped around and printed the
  // same joke three times in one email — five blowouts, three massacre lines,
  // "we are contractually obliged to report this" twice over. A plain scoreline
  // is honest; a repeated joke is a mail merge, which is the exact tell this
  // whole module was built to avoid.
  const PLAIN = '{w} {ws}, {l} {ls}.';
  const usedLines = new Set();
  const gameLines = games.map((g, i) => {
    const pool = GAME_LINES[bandOf(g.margin)];
    let tpl = pick(pool, season, week, 'g' + i);
    for (let k = 0; k < pool.length && usedLines.has(tpl); k++) {
      tpl = pool[(pool.indexOf(tpl) + 1) % pool.length];
    }
    if (usedLines.has(tpl)) tpl = PLAIN;
    usedLines.add(tpl);
    let line = tpl
      .replace(/\{w\}/g, `**${g.winner.name}**`).replace(/\{l\}/g, g.loser.name)
      .replace(/\{ws\}/g, String(r1(g.winner.points))).replace(/\{ls\}/g, String(r1(g.loser.points)))
      .replace(/\{m\}/g, String(r1(g.margin)));
    // The rivalry carries its own billing when this is the game that has one.
    // THE RIVALRY BILLING. Read the fields the module actually returns:
    // `name` (not `title`), and `notable.line` (notableFrom returns an OBJECT).
    // The first version guessed both and shipped "(undefined — [object Object].)"
    // into the email body — invisible until the thing was actually driven, which
    // is the entire argument for driving it.
    if (rivalry && rivalry.pair && rivalry.name
        && [g.winner.name, g.loser.name].includes(rivalry.pair.a)
        && [g.winner.name, g.loser.name].includes(rivalry.pair.b)) {
      const hist = rivalry.notable && typeof rivalry.notable.line === 'string' ? rivalry.notable.line : '';
      line += ` (${rivalry.name}${hist ? ' — ' + hist : ''}.)`;
    }
    return line;
  });

  const sections = [];
  sections.push({ h: null, lines: [lede] });
  sections.push({ h: 'The games', lines: gameLines });

  const hd = highDollarsLine(high, second, season, week);
  if (hd) sections.push({ h: 'The hundred dollars', lines: [hd] });

  const cruel = [robbedLine(games, ranked), loserBonusLine(games, ranked)].filter(Boolean);
  const funny = notables.slice(0, 3).map(n => n.text);
  const oddities = [...cruel, ...funny];
  if (oddities.length) sections.push({ h: 'And then there was this', lines: oddities });

  const st = streaks.map(s => streakLine(s, season, week)).filter(Boolean);
  if (st.length) sections.push({ h: 'Streaks', lines: st });

  const pl = playoffLine(playoff, cut);
  if (pl) sections.push({ h: 'Where this leaves everyone', lines: [pl] });

  // ── THE HONEST SHORT WEEK. If the only thing the week produced was the
  // scoreboard and the hundred dollars, say that, rather than inflating it.
  // A WEEK WITH A 110-POINT MARGIN IN IT IS NOT "JUST THE SCOREBOARD". This
  // checked only the oddities, the streaks and the CLOSEST game, so a slate of
  // five blowouts — nothing closer than 51 — came out flagged thin and signed off
  // with "no collapses, no miracles". The games themselves have to be
  // unremarkable too, or the closing line contradicts the five lines above it.
  const thin = !oddities.length && !st.length
    && (!closest || closest.margin > 12)
    && !bands.includes('massacre') && !bands.includes('tie');
  if (thin) {
    sections.push({ h: null, lines: [
      "That's the whole week. No collapses, no miracles, nobody left thirty points on the bench. "
      + 'Some weeks are just the scoreboard, and this was one of them.'] });
  }

  const subject = tied.length
    ? `🏈 Week ${week}: a tie. An actual tie.`
    // Same count the lede uses, for the same reason: "a game decided by 0.6" on
    // a week where TWO were is the subject line making the lede's old mistake.
    : closest && closest.margin <= 1.0
    ? `🏈 Week ${week}: ${tightest > 1 ? tightest + ' games' : 'a game'} decided by ${r1(closest.margin)}`
    : high ? `🏈 Week ${week}: ${high.name} takes the $100`
           : `🏈 Week ${week} recap`;

  return { ready: true, season, week, subject, sections, thin,
           counts: { games: games.length, notables: notables.length, streaks: st.length } };
}

/** Plain text, for a preview and for a test to read without parsing HTML. */
function toText(recap) {
  if (!recap || !recap.ready) return '';
  return recap.sections.map(s =>
    (s.h ? s.h.toUpperCase() + '\n' : '') + s.lines.join('\n')).join('\n\n')
    .replace(/\*\*(.+?)\*\*/g, '$1');
}

module.exports = { buildRecap, toText, bandOf, findNotables, highDollarsLine,
                   streakLine, playoffLine, GAME_LINES };
