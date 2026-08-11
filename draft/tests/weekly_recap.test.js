'use strict';
// THE WEEKLY RECAP — the only thing on this site that is for the league.
//
// Three things this has to get right, and all three are testable:
//
//  1. EVERY SENTENCE IS EARNED BY A FACT. The failure mode is "a hard-fought
//     battle" stapled onto a 40-point blowout. So the same week must not be
//     describable by a sentence from a different margin band, and changing the
//     number must change the sentence.
//  2. IT REFUSES RATHER THAN DEGRADES. "X beat Y" is a claim; it is false at 4pm
//     on Sunday and stays false forever once it is in nine inboxes.
//  3. NOTHING IS MEAN AT ONE PERSON. Mock the RESULT, never the person. An email
//     is one-directional — group-chat abuse works because everyone is in the
//     group chat. This is the check that cannot be left to a screenshot somebody
//     remembers to look at, so it is mechanical: every phrase in every bank is
//     scanned, not just the ones this week's fixture happens to produce.
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'src', 'recap'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name];
  ck(`${what} exists`, false, `recap.${name} is not exported`);
  return () => ({ ready: false, reason: 'missing-export', sections: [] });
};
const build = need(R, 'buildRecap', 'the generator');
const toText = need(R, 'toText', 'the text renderer');

const side = (name, points, x) => Object.assign(
  { name, points, starters: [{ name: 'a', pos: 'WR', points: 12 }], bench: [],
    worstStarter: { name: 'a', pos: 'WR', points: 12 }, kicker: null }, x || {});
const game = (w, l) => ({ winner: w, loser: l,
  margin: Math.round((w.points - l.points) * 10) / 10, final: true });

// ── 1) IT REFUSES RATHER THAN DEGRADES ──────────────────────────────────────
{
  const A = side('Cory', 120), B = side('Richard', 100);
  ck('no week at all → refuses', build({ games: [game(A, B)] }).ready === false);
  ck('no games → refuses', build({ week: 5, games: [] }).ready === false);
  const half = build({ season: '2026', week: 5, games: [
    game(A, B), { winner: side('David', 0), loser: side('Sam', 0), margin: 0, final: false }] });
  ck('ONE unfinished matchup refuses the WHOLE week', half.ready === false, half);
  ck('  and names it, so a scheduler can tell "too early" from "broken"',
    half.reason === 'week-not-final' && /1 of 2/.test(half.note || ''), half);
  ck('  it does not emit a partial recap', !half.sections, Object.keys(half));
}

// ── 2) THE NUMBER PICKS THE SENTENCE ────────────────────────────────────────
{
  const bands = [[0.4, 'heartbreak'], [2.1, 'squeaker'], [7.0, 'close'],
                 [18.0, 'comfortable'], [33.0, 'beating'], [61.0, 'massacre']];
  const bandOf = need(R, 'bandOf', 'the margin bands');
  for (const [m, want] of bands) ck(`a ${m}-point margin is "${want}"`, bandOf(m) === want, bandOf(m));

  // The real property: no sentence produced for a blowout can also be produced
  // for a one-point game. Bands that share phrasing are how filler creeps in.
  const banks = R.GAME_LINES;
  const seen = new Map();
  let overlap = null;
  for (const [key, lines] of Object.entries(banks)) {
    for (const l of lines) {
      if (seen.has(l) && seen.get(l) !== key) overlap = [l, seen.get(l), key];
      seen.set(l, key);
    }
  }
  ck('no phrase is shared between two margin bands', overlap === null, overlap);

  // And the generated line actually moves when the margin does.
  const mk = margin => {
    const A = side('Cory', 100 + margin), B = side('Richard', 100);
    return toText(build({ season: '2026', week: 5, games: [game(A, B)],
      ranked: [{ name: 'Cory', points: 100 + margin }, { name: 'Richard', points: 100 }] }));
  };
  const tight = mk(0.5), blowout = mk(58);
  ck('a 0.5-point week and a 58-point week share no game sentence',
    tight.split('\n').filter(l => /Cory|Richard/.test(l))
      .every(l => !blowout.includes(l.trim()) || !l.trim()),
    [tight.slice(0, 90), blowout.slice(0, 90)]);
  ck('  the tight one calls it what it was', /coin|Somewhere in that box score/.test(tight), tight);
  ck('  the blowout does not pretend it was a contest',
    !/hard-fought|battle|nail-?biter|thriller/i.test(blowout), blowout);
}

// ── 3) THE HUNDRED DOLLARS IS NEVER OMITTED AND NEVER BURIED ────────────────
{
  const A = side('Cory', 151.2), B = side('Richard', 150.6);
  const C = side('David', 128), D = side('Sam', 67.4);
  const out = build({ season: '2026', week: 7, games: [game(A, B), game(C, D)],
    ranked: [A, B, C, D].map(s => ({ name: s.name, points: s.points })) });
  const sec = out.sections.find(s => s.h === 'The hundred dollars');
  ck('the weekly high has its own section', !!sec, out.sections.map(s => s.h));
  ck('  it names the winner and the money', /Cory/.test(sec.lines[0]) && /\$100/.test(sec.lines[0]), sec);
  ck('  a 0.6 gap is reported as the mugging it was', /0\.6/.test(sec.lines[0]), sec.lines[0]);
  // Same fixture, wide gap: a different sentence, not the same one with a number swapped.
  const wide = build({ season: '2026', week: 7,
    games: [game(side('Cory', 180), side('Richard', 120)), game(C, D)],
    ranked: [{ name: 'Cory', points: 180 }, { name: 'Richard', points: 120 },
             { name: 'David', points: 128 }, { name: 'Sam', points: 67.4 }] })
    .sections.find(s => s.h === 'The hundred dollars');
  ck('  a runaway gets a different sentence than a photo finish',
    wide.lines[0] !== sec.lines[0] && /ran away|Nobody was close/.test(wide.lines[0]), wide.lines[0]);
}

// ── 4) THE FUNNY THINGS ARE FOUND IN THE DATA ───────────────────────────────
{
  const loser = side('Dylan', 119.9, {
    starters: [{ name: 'Dud', pos: 'WR', points: 1.2 }, { name: 'ok', pos: 'RB', points: 14 }],
    bench: [{ name: 'Bench Guy', pos: 'WR', points: 26.4 }],
    worstStarter: { name: 'Dud', pos: 'WR', points: 1.2 } });
  const winner = side('Bates', 121.0, { kicker: { name: 'Butker', pos: 'K', points: 14 } });
  const out = build({ season: '2026', week: 9, games: [game(winner, loser)],
    ranked: [winner, loser].map(s => ({ name: s.name, points: s.points })) });
  const t = toText(out);
  ck('a benched player who would have FLIPPED the game leads the oddities',
    /Bench Guy/.test(t) && /decided by 1\.1/.test(t), t);
  ck('  a kicker deciding a 1.1-point game is reported', /Butker/.test(t) && /kicker decided/.test(t), t);

  // THE KICKER THRESHOLD, ASSERTED DIRECTLY. Driving a real week showed the
  // original rule — "the margin was under the kicker's score" — firing on three
  // of five matchups, because kickers score 8-14 and plenty of games are decided
  // by less. It is only a story when the game was a coin flip.
  //
  // This needs its own check because the one-instance-per-kind rule ALSO hides a
  // loose threshold: with the dedupe in place, loosening the threshold still
  // produces exactly one kicker line and the end-to-end drive stays green. Two
  // fixes covering one symptom means neither is independently guarded.
  {
    const k = (margin, kick) => R.findNotables([{
      margin,
      winner: side('A', 100 + margin, { kicker: { name: 'Kicker', pos: 'K', points: kick } }),
      loser: side('B', 100),
    }], 5).filter(n => n.kind === 'kicker');
    ck('a kicker deciding a 1.5-point game IS a story', k(1.5, 11).length === 1, k(1.5, 11));
    ck('  a kicker in an 8-point game is NOT — every kicker outscores 8',
      k(8, 11).length === 0, k(8, 11));
    ck('  nor in a 20-point game', k(20, 14).length === 0, k(20, 14));
    ck('  and a game the kicker could not have decided is never one',
      k(1.5, 1.0).length === 0, k(1.5, 1.0));
  }

  // The inverse: a bench player who beat a K or DEF is true every week and must
  // NOT be reported, or the section becomes noise.
  const dull = build({ season: '2026', week: 9, ranked: [{ name: 'A', points: 120 }],
    games: [game(side('A', 120, { starters: [{ name: 'K', pos: 'K', points: 3 }],
                                  worstStarter: null,
                                  bench: [{ name: 'Bench', pos: 'WR', points: 22 }] }),
                 side('B', 100))] });
  ck('a bench WR outscoring a kicker is NOT a finding',
    !/Bench/.test(toText(dull)), toText(dull));
}

// ── 5) A BORING WEEK GETS A SHORT HONEST EMAIL ──────────────────────────────
{
  const g = (a, x, b, y) => game(side(a, x), side(b, y));
  const out = build({ season: '2026', week: 11, streaks: [], playoff: null,
    games: [g('Cory', 131, 'Richard', 114), g('David', 122, 'Sam', 101), g('Dylan', 118, 'Bates', 99)],
    ranked: [131, 122, 118, 114, 101, 99].map((p, i) =>
      ({ name: ['Cory', 'David', 'Dylan', 'Richard', 'Sam', 'Bates'][i], points: p })) });
  const t = toText(out);
  ck('a nothing week is flagged thin', out.thin === true, out.counts);
  ck('  and says so out loud rather than inflating it', /Some weeks are just the scoreboard/.test(t), t);
  ck('  the lede admits it was quiet', /quiet one/.test(t), t.split('\n')[0]);
  ck('  it is genuinely SHORTER than a busy week',
    t.length < 1400, t.length);
  // No two games in one email may read identically — that is the mail-merge tell.
  const lines = out.sections.find(s => s.h === 'The games').lines;
  ck('  no two game lines are the same sentence',
    new Set(lines.map(l => l.replace(/\d+(\.\d+)?/g, '#').replace(/\*\*[^*]+\*\*|[A-Z][a-z]+/g, 'X'))).size === lines.length,
    lines);
}

// ── 6) NOTHING IS MEAN AT ONE PERSON ────────────────────────────────────────
// Scans EVERY phrase in EVERY bank, not only what this week's fixture produced —
// a fixture-only check passes right up until the week that triggers the bad line.
{
  const banks = [];
  for (const lines of Object.values(R.GAME_LINES)) banks.push(...lines);
  for (const n of [3, 4, 5, 6]) {
    for (const kind of ['W', 'L']) {
      const l = R.streakLine({ name: '{X}', kind, length: n });
      if (l) banks.push(l);
    }
  }
  banks.push(R.highDollarsLine({ name: '{X}', points: 150 }, { name: '{Y}', points: 149 }));
  banks.push(R.highDollarsLine({ name: '{X}', points: 150 }, { name: '{Y}', points: 100 }));
  banks.push(...R.findNotables([{
    margin: 1.1,
    winner: side('{X}', 121, { kicker: { name: 'K', pos: 'K', points: 14 } }),
    loser: side('{Y}', 119.9, {
      starters: [{ name: 'D', pos: 'WR', points: 1 }, { name: 'z', pos: 'WR', points: 0 }, { name: 'q', pos: 'RB', points: 0 }],
      bench: [{ name: 'B', pos: 'WR', points: 26 }], worstStarter: { name: 'D', pos: 'WR', points: 1 } }),
  }], 9).map(n => n.text));

  // Insults about the PERSON. Everything here is a judgement on a human being
  // rather than on a scoreline, and none of it belongs in a one-directional email.
  const CRUEL = /\b(idiot|moron|stupid|dumb|pathetic|worthless|clown|loser|trash|garbage|embarrass\w*|disgrace|useless|incompetent|deserve|fraud|choke artist|bad at)\b/i;
  const bad = banks.filter(l => CRUEL.test(l));
  ck('no phrase in any bank insults the person rather than the result',
    bad.length === 0, bad);
  ck('  and none of them is a second-person accusation',
    !banks.some(l => /\byou (are|were|should have|need to|clearly)\b/i.test(l)),
    banks.filter(l => /\byou (are|were|should have)\b/i.test(l)));
  // The specific line that carries the most risk — a lineup nobody set — must
  // report the number and decline to accuse.
  const unset = banks.find(l => /scored exactly nothing/.test(l));
  ck('  the unset-lineup line reports the number and refuses to accuse',
    !!unset && /let everyone draw their own conclusion/.test(unset), unset);
  ck('every bank phrase was actually scanned', banks.length >= 25, banks.length);
}

// 6b) THE LEDE MEASURES THE WEEK; IT DOES NOT ASSUME ITS SHAPE.
//
// Found by generating seven weeks and READING them, not by testing what I had
// thought to test. Every one of these was a specific claim attached to a week
// that did not fit it — the inverse of generic filler, and just as wrong.
{
  const s6 = (n, p) => side(n, p);
  const wk = (week, scores, extra) => {
    const sides = scores.map((p, i) => s6(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'][i], p));
    const gs = [];
    for (let i = 0; i < sides.length; i += 2) {
      gs.push(sides[i].points >= sides[i + 1].points ? game(sides[i], sides[i + 1]) : game(sides[i + 1], sides[i]));
    }
    return build(Object.assign({ season: '2026', week, games: gs,
      ranked: [...sides].sort((a, b) => b.points - a.points).map(x => ({ name: x.name, points: x.points })) }, extra || {}));
  };

  // "came down to X in ONE GAME" — on a week where TWO games shared that margin.
  const two = wk(7, [151.2, 150.6, 128, 67.4, 120, 119.4, 111, 100, 96, 90]);
  ck('a week with two 0.6-point games does not call it "one game"',
    !/in one game/.test(toText(two)), (toText(two).split('\n')[0] || ''));
  ck('  it counts them instead', /2 games decided by 0\.6/.test(toText(two)) || /decided by inches/.test(toText(two)),
    toText(two).split('\n')[0]);
  ck('  and the subject makes the same count, not the old singular',
    !/: a game decided by 0\.6/.test(two.subject), two.subject);

  // "mostly normal apart from ONE RESULT" — on a week where all five were blowouts.
  const blood = wk(8, [180, 70, 175, 80, 160, 90, 155, 95, 150, 99]);
  const bt = toText(blood);
  ck('a slate of five blowouts is not called "mostly normal"',
    !/mostly normal/.test(bt), bt.split('\n')[0]);
  ck('  it says how many, out of how many', /5 of the 5 games/.test(bt), bt.split('\n')[0]);
  // The closing line contradicted the five above it.
  ck('  and it is NOT signed off as a week that was just the scoreboard',
    blood.thin === false && !/just the scoreboard/.test(bt), bt.slice(-160));

  // The mirror case must still work: an ordinary week is still called ordinary.
  const dull = wk(11, [131, 114, 122, 101, 118, 99]);
  ck('a genuinely unremarkable week is STILL flagged thin', dull.thin === true, dull.counts);
  ck('  and still says so out loud', /just the scoreboard/.test(toText(dull)));

  // NO REPEATED JOKE. Five games in one band, three phrases for it: the walk
  // forward wrapped and printed the same line three times. A plain scoreline is
  // honest; a repeated joke is the mail-merge tell.
  const lines = blood.sections.find(x => x.h === 'The games').lines;
  // THE PLAIN SCORELINE IS ALLOWED TO REPEAT — it is the score, not a joke, and
  // two teams both getting "X 155, Y 95." is a fact stated twice rather than a
  // mail merge. The first version of this check forbade ALL repeats and failed
  // on exactly that, which made it wrong rather than vacuous. What must never
  // repeat is a PHRASE from the banks.
  const norm = l => l.replace(/\*\*[^*]+\*\*/g, 'X').replace(/[\d.]+/g, '#').replace(/\b[A-Z]\b/g, 'X');
  const counts = {};
  for (const l of lines) counts[norm(l)] = (counts[norm(l)] || 0) + 1;
  const repeated = Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k);
  ck('no JOKE is repeated when a band has more games than phrases',
    // The normalizer's [\d.]+ swallows the trailing period along with the
    // score, so the plain form comes out as 'X #, X #' with no full stop.
    // Matching the shape I expected rather than the shape it produces is how
    // a check reports a failure that is its own.
    repeated.every(k => /^X #, X #\.?$/.test(k)), repeated);
  ck('  the overflow falls back to a plain scoreline rather than a repeat',
    lines.some(l => /^\*\*[A-Z]\*\* [\d.]+, [A-Z] [\d.]+\.$/.test(l)), lines);
}

// ── 7) THE PLAYOFF LINE IS A LINE, NOT A TABLE ──────────────────────────────
{
  const pl = R.playoffLine([{ name: 'Cory', odds: 96 }, { name: 'David', odds: 91 },
    { name: 'Dylan', odds: 52 }, { name: 'Bates', odds: 38 }, { name: 'Sam', odds: 3 }]);
  ck('the playoff picture is one sentence', pl && pl.split('. ').length <= 2, pl);
  ck('  it reads like English, not a join()', /Cory and David are/.test(pl), pl);
  ck('  and it is silent before the numbers mean anything', R.playoffLine([]) === null);
}

// ── 8) THE VOICE IS NOT A NEWSLETTER ────────────────────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'src', 'recap.js'), 'utf8');
  const strings = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const NEWSLETTER = /\b(dear (league|owners)|in this issue|stay tuned|until next (week|time)|as always|we hope you enjoy|thanks for reading)\b/i;
  ck('no newsletter boilerplate anywhere in the generator', !NEWSLETTER.test(strings),
    (strings.match(NEWSLETTER) || [])[0]);
  const FILLER = /\b(hard-?fought|back-and-forth thriller|barn ?burner|instant classic|for the ages)\b/i;
  ck('no generic filler phrases that could describe any week', !FILLER.test(strings),
    (strings.match(FILLER) || [])[0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
