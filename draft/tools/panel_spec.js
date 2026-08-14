// TERRITORY: A
/* WHAT EVERY PANEL ON THE WAR ROOM IS ACTUALLY TELLING YOU.
 *
 * Cory: *"I think the info is fine but the design and way it's giving info is
 * terrible. Super busy screen yet very little info and info I do have I don't
 * know what it's telling me. B may need a better explanation from you about
 * what each thing does."*
 *
 * That is my failure and not B's. They own the pixels; I own what every number
 * MEANS, and I have never written it down in one place. Nobody can build a
 * hierarchy out of panels whose meaning is undocumented — so they laid out what
 * they could see, which is why the screen is a stack of equals.
 *
 * ── THIS IS A SPEC FOR B, NOT COPY FOR THE PAGE ───────────────────────────
 *
 * The field that matters is `weight`. It is the answer to "does this change
 * which player I take, and when" — which is the only question that can order a
 * screen. Everything else here is supporting detail.
 *
 *   DECIDES    changes WHICH PLAYER I take, at this pick, right now.
 *   TIMES      changes WHEN I take a position — not who, but the order.
 *   TRUSTS     tells me whether to believe the panels above. Invalidating.
 *   CONTEXT    true, useful, and has never once changed a pick by itself.
 *
 * FOUR PANELS DECIDE. Twenty-two do not. That is the finding, and it is the
 * measurement B should lay the page out from — the current screen gives a
 * take-button, tier-cliff prose and a chip grid roughly equal billing.
 *
 * ── AND THE PART I HAVE TO OWN ────────────────────────────────────────────
 *
 * `renderRecommendations` is 377 LINES. A third of the decision surface is one
 * function emitting a headline, a rationale, a timing block, a tier-cliff card,
 * an against-case and a chip grid. Cory read the same player appearing in three
 * of those as "Gibbs listed twice". That is not a layout problem B can solve by
 * moving things; it is one function doing six jobs, and splitting it is mine.
 *
 * Run: node draft/tools/panel_spec.js            (human-readable)
 *      node draft/tools/panel_spec.js --json     (for B to build from)
 */
'use strict';

/* Every panel `renderAll` paints. `question` is in Cory's words, not the
 * model's. `reads` names the artifact fields behind it, so B can tell a panel
 * that is cheap to move from one that is wired to a lot. */
const PANELS = [
  // ── DECIDES ───────────────────────────────────────────────────────────
  { fn: 'renderRecommendations', weight: 'DECIDES', lines: 377,
    question: 'Who should I take right now?',
    means: 'A ranked list of available players scored on projection, positional '
      + 'scarcity and what survives to my next pick. The top row is the model\'s pick.',
    changes_it: 'a player leaving the board; my roster filling a slot; my next pick moving',
    reads: ['players[].proj_mean', 'survival', 'pick_order.my_picks', 'myRoster'],
    note: 'DOING SIX JOBS. Headline, rationale, timing, tier-cliff, against-case, '
      + 'chip grid. This is the busy screen. Splitting it is A\'s, not B\'s.' },

  { fn: 'renderSeatPlan', weight: 'DECIDES', lines: 121,
    question: 'Which SEAT am I filling at this pick — and what is the plan for the rest?',
    means: 'The plan solves all twelve of my picks at once and assigns each a ROLE '
      + '(fill TE, fill FLEX). The engine then picks the player for that role.',
    changes_it: 'the pick on the clock; a seat being filled early',
    reads: ['seat_plan.json seats[]'],
    note: 'CORY ASKED FOR EXACTLY THIS AND DOES NOT KNOW HE HAS IT: "a look ahead '
      + 'to what complete strategy may be for rest of draft". Twelve seats exist; '
      + 'ONE is rendered. The other eleven are the look-ahead, unbuilt.' },

  { fn: 'renderPositionRecs', weight: 'DECIDES', lines: 35,
    question: 'Who is the best man left at each position?',
    means: 'Top few per position, so a positional decision does not require '
      + 'scrolling the whole board.',
    changes_it: 'any pick at that position',
    reads: ['players[]', 'drafted'],
    note: 'THE CLOSEST THING WE HAVE TO CORY\'S "10 next best players in easy '
      + 'view" — currently 3 per position as chips rather than a ranked table.' },

  { fn: 'renderQueue', weight: 'DECIDES', lines: 52,
    question: 'Who have I pre-decided to take?',
    means: 'My own shortlist, in my order — the one panel that is my judgement '
      + 'rather than the model\'s.',
    changes_it: 'me adding or removing somebody; a queued player being taken',
    reads: ['state.queue'] },

  // ── TIMES ─────────────────────────────────────────────────────────────
  { fn: 'renderSurvival', weight: 'TIMES', lines: 112,
    question: 'Will he still be there at my next pick?',
    means: 'Probability each player lasts until my next turn, from ADP and the '
      + 'number of picks in between. 86% means he is GONE 86% of the time.',
    changes_it: 'the room picking; my next pick getting closer',
    reads: ['adjusted_adp', 'adp_sd', 'pick_order.my_picks'],
    note: 'THE STRONGEST CHART CANDIDATE ON THE PAGE. It is a decay curve per '
      + 'candidate and it renders as a percentage in a chip. A reader cannot see '
      + 'from "86%" whether the cliff is at pick 20 or pick 32.' },

  { fn: 'renderRuns', weight: 'TIMES', lines: 19,
    question: 'Is the room emptying a position faster than expected?',
    means: 'Picks at a position versus its ADP rate. 1.42x means it is going 42% faster.',
    changes_it: 'the last few picks',
    reads: ['recentPicks', 'adjusted_adp'],
    note: 'ALREADY SELF-EXPLAINS in one sentence and is the model for the rest.' },

  { fn: 'renderThreats', weight: 'TIMES', lines: 98,
    question: 'Who picks between now and my turn, and what do they need?',
    means: 'The managers between me and my next pick, with the positions their '
      + 'history says they take.',
    changes_it: 'the pick on the clock',
    reads: ['manager_profiles', 'pick_order', 'slot_to_roster_id'] },

  { fn: 'renderLRM', weight: 'TIMES', lines: 33,
    question: 'What is the LAST pick I can still get this position at?',
    means: 'The latest turn at which a startable player at each position is '
      + 'likely to survive.',
    changes_it: 'players at that position leaving',
    reads: ['survival', 'pick_order.my_picks'] },

  { fn: 'renderByes', weight: 'TIMES', lines: 27,
    question: 'Am I stacking too many players on one bye week?',
    means: 'Bye-week counts across my roster.',
    changes_it: 'me taking a player',
    reads: ['players[].bye', 'myRoster'],
    note: 'ONLY BECAME REAL TODAY — 855 byes on the board against 215 before C\'s '
      + 'fix. This panel has been computing over nulls for weeks.' },

  // ── TRUSTS ────────────────────────────────────────────────────────────
  { fn: 'renderSystemStrip', weight: 'TRUSTS', lines: null,
    question: 'Can I believe anything above?',
    means: 'Red = a recommendation cannot be trusted. Amber = trust it less.',
    changes_it: 'sync going stale; the board and slate disagreeing; a stale build',
    reads: ['sync age', 'reconcile', 'provenance', 'seat'],
    note: 'A stale sync invalidates EVERY panel that decides. It belongs adjacent '
      + 'to them, not in a strip that can be scrolled away from.' },

  { fn: 'renderLegality', weight: 'TRUSTS', lines: null,
    question: 'Can I still field a legal lineup with the picks I have left?',
    means: 'Whether my remaining picks can fill every starting slot.',
    changes_it: 'me taking a player; a pick passing',
    reads: ['league.starters', 'myRoster', 'my_picks'] },

  { fn: 'renderChecklist', weight: 'TRUSTS', lines: null,
    question: 'Is anything about this board unverified?',
    means: 'Open items — slot unconfirmed, keeper slate predicted rather than locked.',
    changes_it: 'Sleeper confirming the seat; keeper lock on 08-20',
    reads: ['keeper_slate', 'league.my_draft_slot'] },

  { fn: 'renderUnrecordedPicks', weight: 'TRUSTS', lines: null,
    question: 'Did the board miss a pick?',
    means: 'Picks the room made that this board has not recorded.',
    changes_it: 'sync recovering; me entering a pick by hand',
    reads: ['sync picks', 'drafted'] },

  { fn: 'renderAccountingNote', weight: 'TRUSTS', lines: null,
    question: 'Do the pick counts add up?',
    means: 'Board removals versus picks observed plus keepers placed.',
    changes_it: 'any pick; a keeper landing',
    reads: ['pickState invariants'] },

  { fn: 'renderRehearsalWatermark', weight: 'TRUSTS', lines: null,
    question: 'Is this the real draft?',
    means: 'A rehearsal marker, so a mock is never mistaken for the real thing.',
    changes_it: 'entering or leaving rehearsal', reads: ['state.mockMode'] },

  { fn: 'renderSlotWatermark', weight: 'TRUSTS', lines: null,
    question: 'Is my seat confirmed?',
    means: 'Slot unverified — every pick number is provisional until Sleeper draws the order.',
    changes_it: 'Sleeper publishing the draft order',
    reads: ['league.slot_to_roster_id'] },

  // ── CONTEXT ───────────────────────────────────────────────────────────
  { fn: 'renderBoard', weight: 'CONTEXT', lines: null,
    question: 'Everyone still available, searchable.',
    means: 'The full pool. The reference, not the recommendation.',
    changes_it: 'any pick; the search box', reads: ['players[]', 'drafted'] },
  { fn: 'renderRoster', weight: 'CONTEXT', lines: null,
    question: 'What do I have so far?', means: 'My picks and keepers by slot.',
    changes_it: 'me taking a player', reads: ['myRoster'] },
  { fn: 'renderHeader', weight: 'CONTEXT', lines: null,
    question: 'Which pick is this?', means: 'The pick on the clock and my next turn.',
    changes_it: 'any pick', reads: ['pickState'] },
  { fn: 'renderPicksFeed', weight: 'CONTEXT', lines: null,
    question: 'What just happened?', means: 'Recent picks, newest first.',
    changes_it: 'any pick', reads: ['recentPicks'] },
  { fn: 'renderPlan', weight: 'CONTEXT', lines: 12,
    question: 'Which doctrine is enrolled?',
    means: 'The strategy the tournament picked, and its measured edge.',
    changes_it: 'a rebuild re-running the race', reads: ['doctrine'] },
  { fn: 'renderManagers', weight: 'CONTEXT', lines: null,
    question: 'Who else is in this draft?', means: 'The room, with tendencies.',
    changes_it: 'nothing during a draft', reads: ['manager_profiles'] },
  { fn: 'renderThreatStrip', weight: 'CONTEXT', lines: null,
    question: 'Who is picking before me, in one line?',
    means: 'The same managers-between-me-and-my-turn as renderThreats, collapsed '
      + 'to a single strip instead of a panel.',
    changes_it: 'the pick on the clock; a manager filling the need it predicted',
    reads: ['manager_profiles', 'pick_order'],
    note: 'DUPLICATES renderThreats — same question, same source, two renderings. '
      + 'One of them should go, and which one is a layout call, not mine.' },
  { fn: 'renderLists', weight: 'CONTEXT', lines: null,
    question: 'What did I write down before the draft started?',
    means: 'Lists I authored myself — sleepers, avoids, handcuffs. Nothing the '
      + 'model produced, so nothing here reacts to the room.',
    changes_it: 'only me editing them — it is inert during a draft',
    reads: ['state.lists'],
    note: 'INERT WHILE DRAFTING, which is the argument for collapsing it behind '
      + 'a tap rather than giving it vertical space on the clock.' },
  { fn: 'renderPickControls', weight: 'CONTEXT', lines: null,
    question: 'How do I tell the board what just happened?',
    means: 'The take/undo/manual-entry controls. Not information — the way I act '
      + 'on everything above, and the whole fallback when sync is down.',
    changes_it: 'whose turn it is; sync going down, which makes this the only path',
    reads: ['pickState', 'sync'],
    note: 'CONTEXT BY CONTENT, CRITICAL BY FUNCTION. After a wedge this is the '
      + 'entire plan for the rest of the night, so it must never be the thing '
      + 'that scrolls off.' },
];

const ORDER = ['DECIDES', 'TIMES', 'TRUSTS', 'CONTEXT'];

if (process.argv.indexOf('--json') >= 0) {
  console.log(JSON.stringify({ panels: PANELS, weight_order: ORDER }, null, 1));
} else {
  console.log('WHAT EVERY WAR-ROOM PANEL IS TELLING YOU — a spec for B\n');
  console.log('  `weight` answers "does this change which player I take, and when".');
  console.log('  It is the only field that can order a screen.\n');
  ORDER.forEach(w => {
    const g = PANELS.filter(p => p.weight === w);
    console.log('\n══ ' + w + '  (' + g.length + ' panel' + (g.length === 1 ? '' : 's') + ') ══');
    g.forEach(p => {
      console.log('\n  ' + p.fn + (p.lines ? '   [' + p.lines + ' lines]' : ''));
      console.log('    Q: ' + p.question);
      console.log('    A: ' + p.means);
      console.log('    changes when: ' + p.changes_it);
      if (p.note) console.log('    ⚠ ' + p.note);
    });
  });
  const d = PANELS.filter(p => p.weight === 'DECIDES').length;
  console.log('\n\n── THE MEASUREMENT B SHOULD LAY OUT FROM ──────────────────────');
  console.log('  ' + d + ' panels DECIDE which player to take. ' + (PANELS.length - d)
    + ' do not.');
  console.log('  The current screen gives a take-button, tier-cliff prose and a chip');
  console.log('  grid roughly equal billing, and buries the seat plan\'s other ELEVEN');
  console.log('  seats — which is the "look ahead to the rest of the draft" Cory asked');
  console.log('  for and already has.');
  const busiest = PANELS.slice().filter(p => p.lines).sort((a, b) => b.lines - a.lines)[0];
  console.log('\n  AND THE ONE THING B CANNOT FIX BY MOVING ANYTHING: ' + busiest.fn
    + ' is ' + busiest.lines + ' lines');
  console.log('  emitting six different things. Cory read the same player in three of');
  console.log('  them as "Gibbs listed twice". Splitting it is A\'s job, not layout.');
}

module.exports = { PANELS, ORDER };
