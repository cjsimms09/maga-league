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
 * MOST PANELS DO NOT DECIDE. That is the finding, and it is the measurement B
 * should lay the page out from — the current screen gives a take-button,
 * tier-cliff prose and a chip grid roughly equal billing.
 *
 * THE COUNTS ARE PRINTED AT THE BOTTOM, COMPUTED. They were written into this
 * header as words ("FOUR PANELS DECIDE. Twenty-two do not") and were wrong
 * within a day — the file described 25 panels while 54 painted. A number typed
 * into prose beside the data it describes is the defect this repo keeps
 * shipping, and a spec is the last place it belongs.
 *
 * ── AND THE PART I HAVE TO OWN ────────────────────────────────────────────
 *
 * `renderRecommendations` is 436 LINES. A third of the decision surface is one
 * function emitting a headline, a rationale, a timing block, a tier-cliff card,
 * an against-case and a chip grid. Cory read the same player appearing in three
 * of those as "Gibbs listed twice". That is not a layout problem B can solve by
 * moving things; it is one function doing six jobs, and splitting it is mine.
 *
 * ── AND IT IS GROWING, WHICH IS THE HONEST WAY TO REPORT THIS BUMP ────────
 *
 * This said 377 until 2026-08-14 and `panel_spec.test.js` went red on it, which
 * is exactly what that assertion is for. I bumped the number because the code
 * really did grow — the `.rec-promoted` mark for ceiling tiebreaks — but a
 * staleness guard that I satisfy by editing the claim every time is a guard I am
 * training myself to ignore. So: +59 lines since the split was called mine, and
 * NONE of them were the split. Recorded here rather than in a task list, because
 * the next person to bump this number should have to read that sentence first.
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
  { fn: 'renderRecommendations', weight: 'DECIDES', lines: 436,
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
  // ══════════════════════════════════════════════════════════════════════
  // THE 29 THE FIRST VERSION MISSED (2026-08-14).
  //
  // The spec said "every panel `renderAll` paints" and its test read `renderAll`
  // for zero-argument `renderXxx()` calls. Every panel rendered as a SUB-PANEL,
  // or taking an argument, was invisible to both — 29 of them, MORE THAN THE 25
  // DESCRIBED. So a document written to close exactly this gap shipped covering
  // less than half the screen while reading as complete.
  //
  // THAT IS THE DEFECT THIS FILE EXISTS TO PREVENT, COMMITTED BY THIS FILE. The
  // extraction is now over every `render*` function DEFINED AND CALLED in
  // app.js, which cannot be fooled by a call shape.
  //
  // AND `renderPaths` WAS IN THE MISSING SET — the strategy cards Cory was
  // complaining about when he asked for this spec in the first place.
  // ══════════════════════════════════════════════════════════════════════

  // ── DECIDES ───────────────────────────────────────────────────────────
  { fn: 'renderPaths', weight: 'DECIDES', lines: null,
    question: 'What are my real OPTIONS here, and what does each one cost?',
    means: 'The top candidates grouped into coherent DIRECTIONS (position x '
      + 'take-now-vs-value), each led by its best man, each priced in points '
      + 'below the top direction. "-12.5 vs top" is what choosing it concedes.',
    changes_it: 'any pick at those positions; my next pick moving; a tier emptying',
    reads: ['E.computePaths', 'scored', 'league.starters'],
    note: 'THE PANEL CORY WAS DESCRIBING and the one this spec originally left '
      + 'out. It rendered ONE card at 10 of his 12 picks, and a card\'s leader '
      + 'is by construction the #1 recommendation — "Gibbs listed twice? No '
      + 'other options." Fixed 08-14: it now always offers what the board holds. '
      + 'Two fields B must render DIFFERENTLY: `price` and `within_band`. A card '
      + 'with within_band=false is a real option at a real cost and must never '
      + 'carry the same visual weight as one inside the band.' },
  { fn: 'renderTiming', weight: 'TIMES', lines: null,
    question: 'Should I take this position NOW or can it wait?',
    means: 'Per position: TAKE NOW / WAIT / OK, from what the position loses '
      + 'between this pick and my next one. It answers order, not identity.',
    changes_it: 'the gap to my next pick; a run at that position',
    reads: ['positionTiming', 'scored', 'nextPick'],
    note: 'STRONGEST SINGLE-GLANCE PANEL ON THE PAGE and it is buried inside '
      + 'renderRecommendations. Four verdicts, no reading required.' },
  { fn: 'renderBestAvailStrip', weight: 'DECIDES', lines: null,
    question: 'Who is the best man left at each position, in one line?',
    means: 'One name per position off the same scored board the recommendations '
      + 'use — so it can never disagree with them.',
    changes_it: 'any pick',
    reads: ['scored', 'nextPick'],
    note: 'OVERLAPS renderPositionRecs — same question, one as a strip and one '
      + 'as chips. Cory asked for "10 next best players in easy view"; these two '
      + 'are the closest thing and neither is it. Merging them is a layout call.' },
  { fn: 'renderMVS', weight: 'CONTEXT', lines: null,
    question: 'If I could only see one box, what would it say?',
    means: 'The minimum viable screen — state, seat, board freshness, health, '
      + 'current pick and the pick itself, in one block.',
    changes_it: 'any pick; sync health; the board rebuilding',
    reads: ['state', 'out.scored', 'out.paths'],
    note: 'NOT DECIDES, BY THIS FILE\'S OWN VOCABULARY — it restates the '
      + 'decision surface rather than adding to it, and duplicating a DECIDES '
      + 'panel does not make you one. Worth saying because it was built as the '
      + 'answer to a busy screen and then placed ON the busy screen beside '
      + 'everything it summarises. If B wants a fold, this is already it.' },

  // ── TIMES ─────────────────────────────────────────────────────────────
  { fn: 'renderBranches', weight: 'TIMES', lines: null,
    question: 'What is likely still on the board at my NEXT pick?',
    means: 'Per position, what the best available is expected to be when I pick '
      + 'again — and only where waiting actually costs something.',
    changes_it: 'the picks between now and my turn; a run',
    reads: ['E.branchForecast', 'nextPick'] },
  { fn: 'renderQueueSlip', weight: 'TIMES', lines: null,
    question: 'Is anybody on my shortlist about to be gone?',
    means: 'The men I queued, flagged when their survival to my next pick drops '
      + 'far enough that waiting is a real risk.',
    changes_it: 'the room picking; me queueing somebody',
    reads: ['state.lists.queue', 'survival_to_next'],
    note: 'THE ONLY PANEL THAT ACTS ON MY OWN LIST rather than the model\'s. It '
      + 'is small and it earns its space.' },
  { fn: 'renderMovementLine', weight: 'TIMES', lines: null,
    question: 'Did the recommendation change since my last look?',
    means: 'A diff of this pick\'s top against the previous pick\'s — moved, '
      + 'nearly moved, or held.',
    changes_it: 'any pick that re-scores the board',
    reads: ['state.movement'] },
  { fn: 'renderStackLine', weight: 'TIMES', lines: null,
    question: 'Would this pick complete a QB-receiver stack I already own?',
    means: 'Live stack routes off my roster and the scored board — a correlation '
      + 'note, not a scoring term.',
    changes_it: 'me taking a QB or a pass-catcher',
    reads: ['E.liveStackRoutes', 'roster'] },
  { fn: 'renderShadowProjection', weight: 'TIMES', lines: null,
    question: 'Where would each strategy have me end up?',
    means: 'The alternative strategies projected forward from the LIVE board, so '
      + 'it is populated at every pick rather than only after a rebuild.',
    changes_it: 'any pick; the board rebuilding',
    reads: ['DraftShadows', 'state.board'] },
  { fn: 'renderShadowStrip', weight: 'TIMES', lines: null,
    question: 'How do the strategies compare, in one line?',
    means: 'The same shadow strategies collapsed to a strip.',
    changes_it: 'a rebuild re-running the race',
    reads: ['state.shadows'],
    note: 'DUPLICATES renderShadowProjection at a different size — the same '
      + 'pattern as renderThreats/renderThreatStrip. Two of these pairs on one '
      + 'screen is a large part of what "super busy yet very little info" is.' },

  // ── TRUSTS ────────────────────────────────────────────────────────────
  { fn: 'renderConfidence', weight: 'TRUSTS', lines: null,
    question: 'How sure is the model about this pick?',
    means: 'Coin-flip / close / clear, from the gap between the top two. Silent '
      + 'when the gap is clear, so seeing it at all means take care.',
    changes_it: 'the gap between the top two candidates',
    reads: ['E.confidence'],
    note: 'SILENT WHEN CLEAR is the right design and makes it easy to miss '
      + 'that it is a TRUSTS panel rather than decoration.' },
  { fn: 'renderProvenance', weight: 'TRUSTS', lines: null,
    question: 'Where did these numbers come from, and are any of them stale?',
    means: 'Build age, sources, and any recomputation the board did to itself.',
    changes_it: 'the nightly rebuild; the slot being recomputed',
    reads: ['draft_data.provenance'] },
  { fn: 'renderStatusBar', weight: 'TRUSTS', lines: null,
    question: 'Am I on the clock, and is this board connected?',
    means: 'Current pick, my next turn, and whether sync is live.',
    changes_it: 'any pick; sync connecting or dropping',
    reads: ['pickState', 'state.sync'] },
  { fn: 'renderSyncAge', weight: 'TRUSTS', lines: null,
    question: 'How old is the last sync?',
    means: 'Seconds since Sleeper was last read. A board that stopped updating '
      + 'looks exactly like a room that stopped picking.',
    changes_it: 'every sync; the network dropping',
    reads: ['state.sync.lastSyncAt'],
    note: 'THE SINGLE MOST INVALIDATING NUMBER ON THE PAGE and it renders as '
      + 'small grey text.' },
  { fn: 'renderReconcile', weight: 'TRUSTS', lines: null,
    question: 'Does the board agree with the room about what has happened?',
    means: 'A mismatch between the recorded slate and the live draft. When it '
      + 'halts, every number below it is derived from a slate known to be wrong.',
    changes_it: 'a pick the board missed; a keeper mismatch',
    reads: ['state.reconcile'],
    note: 'THE ONE PANEL THAT CAN STOP THE BOARD — renderRecommendations refuses '
      + 'to draw while it halts. That relationship should be visible.' },
  { fn: 'renderKeeperLock', weight: 'TRUSTS', lines: null,
    question: 'Are my keepers final?',
    means: 'Whether the keeper slate is locked or still predicted. Lock is 08-20.',
    changes_it: 'keeper lock; the predicted slate going stale',
    reads: ['state.keeperLock'],
    note: 'SUPPRESSED IN A MOCK ON PURPOSE — a banner you learn to scroll past '
      + 'is worse than no banner, and this is the one that must land on 08-20.' },
  { fn: 'renderRehearsalKeeperNote', weight: 'TRUSTS', lines: null,
    question: 'Which keepers did rehearsal mode take off the board?',
    means: 'The players a rehearsal removed, so a mock board is never mistaken '
      + 'for the real pool.',
    changes_it: 'entering rehearsal; the keeper slate changing',
    reads: ['state.rehearsalKeepers'] },
  { fn: 'renderOverrideCount', weight: 'TRUSTS', lines: null,
    question: 'How much of this board is me rather than the model?',
    means: 'How many manual overrides are active. Hidden at zero.',
    changes_it: 'me overriding something; me clearing one',
    reads: ['state overrides'] },
  { fn: 'renderSearchTail', weight: 'TRUSTS', lines: null,
    question: 'The man I searched for — is he already gone, and to whom?',
    means: 'For a search hit, whether he is drafted and which roster holds him.',
    changes_it: 'the search box; any pick',
    reads: ['state.search', 'state.rosters'],
    note: 'ANSWERS THE QUESTION A SEARCH IS USUALLY ASKED — "is he still there" — '
      + 'and only appears while searching, which is right.' },

  // ── CONTEXT ───────────────────────────────────────────────────────────
  { fn: 'renderClock', weight: 'CONTEXT', lines: null,
    question: 'Give me the stripped-down on-the-clock view.',
    means: 'A mode switch, not a panel: it hides the recommendations card and '
      + 'the branch card in favour of a single clock view.',
    changes_it: 'me toggling clock mode',
    reads: ['state.clockMode'],
    note: 'A SECOND ANSWER TO "the screen is too busy", built before MVS and '
      + 'overlapping it. Two competing minimal views is one too many.' },
  { fn: 'renderRuleHeadline', weight: 'CONTEXT', lines: null,
    question: 'What does the needs-based rule say, in one line?',
    means: 'A one-line headline from the need rule, sitting above the '
      + 'recommendations it does not produce.',
    changes_it: 'my roster filling a slot',
    reads: ['DraftNeedRule'],
    note: 'RANKS BY A DIFFERENT QUANTITY than the panel underneath it — the rule '
      + 'is market-ordered and the recommendations are model-ordered, and they '
      + 'disagree about 11 times in 12. Two headlines that disagree, adjacent, '
      + 'is a large part of "I don\'t know what it\'s telling me".' },
  { fn: 'renderCompareTray', weight: 'CONTEXT', lines: null,
    question: 'How do these two players actually differ?',
    means: 'A side-by-side of two chosen players with the dollar-gap breakdown.',
    changes_it: 'me picking two to compare; the board changing',
    reads: ['state.compare', 'E.dollarGap'],
    note: 'THE INTERACTIVE TOOL CORY ASKED FOR ("I can click for more info") and '
      + 'it already exists — it just needs a way in from the rec cards.' },
  { fn: 'renderDeviationBadge', weight: 'CONTEXT', lines: null,
    question: 'Why is this pick so far from where the market has him?',
    means: 'When a recommendation departs from ADP, which scoring terms bought '
      + 'the distance, each with its size and class.',
    changes_it: 'the gap between our score and market ADP',
    reads: ['DraftDeviation', 'components'],
    note: 'THE BEST EXPLAIN-YOURSELF SURFACE IN THE APP and it renders as a '
      + 'badge. This is the "pros and cons of the options" Cory asked for.' },
  { fn: 'renderDoctrine', weight: 'CONTEXT', lines: null,
    question: 'Which strategy is the board following?',
    means: 'The enrolled doctrine and what it is tilting toward.',
    changes_it: 'a rebuild re-running the race; me switching manually',
    reads: ['DraftDoctrine', 'scored'] },
  { fn: 'renderDoctrinePicker', weight: 'CONTEXT', lines: null,
    question: 'Can I change the strategy myself?',
    means: 'The always-visible doctrine chooser. A manual choice re-tilts the '
      + 'scoring exactly as an auto-enrolled one does.',
    changes_it: 'me choosing a doctrine',
    reads: ['state.doctrine'],
    note: 'CONTEXT BY CONTENT, DECIDES BY CONSEQUENCE — choosing here re-scores '
      + 'the whole board. Cory asked for it always visible and compact.' },
  { fn: 'renderDoctrineSwitch', weight: 'CONTEXT', lines: null,
    question: 'Did the model just change its mind about the strategy?',
    means: 'An announcement when the doctrine switches, with the option to '
      + 'decline it. Leaves any prior announcement standing.',
    changes_it: 'the doctrine switching mid-draft',
    reads: ['doctrine switch output'] },
  { fn: 'renderPresets', weight: 'CONTEXT', lines: null,
    question: 'How is the model weighted, and can I change it?',
    means: 'The weight presets plus the auto-reweighting toggle.',
    changes_it: 'me choosing a preset; auto-weights adjusting by round',
    reads: ['E.WEIGHT_PRESETS', 'state.weights'] },
  { fn: 'renderAutoNote', weight: 'CONTEXT', lines: null,
    question: 'Why did the weights just move?',
    means: 'When auto-weighting is on, the phase and round it adjusted for and '
      + 'the reasons. Blank when auto is off.',
    changes_it: 'the round advancing; auto-weights being toggled',
    reads: ['state.autoWeights'] },
  { fn: 'renderBaselineControl', weight: 'CONTEXT', lines: null,
    question: 'How do I get back to the measured settings?',
    means: 'A restore button for the frozen measured core, stamped with the date '
      + 'it was frozen.',
    changes_it: 'me changing weights away from the baseline',
    reads: ['state.frozenBaseline'],
    note: 'THE UNDO FOR EVERY SLIDER ON THE PAGE. Worth being findable from '
      + 'wherever the sliders are.' },
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
