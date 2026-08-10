/* THE ACCOUNTING RECONCILER — one authoritative read of "what is on my roster and
 * what pick am I on", with every source itemized and cross-checked.
 *
 * WHY THIS EXISTS. The war room learned my roster from state.myRoster, my pick from
 * pickState(), my pick slots from pick_order.my_picks, and the clock from the sync
 * room — four coordinate systems for two facts. When they disagree the screen shows
 * three different pick sequences and a starter count that blends seeded keepers with
 * marked picks, and nothing says which number is right. That blend ("5/9 starters"
 * with three keepers and two picks) is not necessarily WRONG — but it is unitemized,
 * so it reads as wrong, and a genuine over-count (the dilution bug) hides in the same
 * shape. This module makes the composition explicit and ASSERTS the invariants, so a
 * real disagreement surfaces as a NAMED problem instead of a silent bad number.
 *
 * Pure: takes a plain snapshot, returns a report. No DOM, no globals read. The war
 * room passes it a snapshot; a test passes it fixtures. Unit-tested in
 * draft/tests/accounting.test.js.
 */
(function (global) {
  'use strict';

  /* Itemize the roster BY SOURCE — the "tell me which entries came from keepers,
   * which from marked picks, which from anywhere else" itemization.
   *   keepers  carry is_keeper (seeded incumbents / confirmed keeps)
   *   marked   a real player_id, drafted/marked during this draft
   *   other    neither — a phantom (a roster entry from nowhere is a bug) */
  function itemizeRoster(roster) {
    var keepers = [], marked = [], other = [];
    (roster || []).forEach(function (p) {
      if (!p) { other.push(p); return; }
      if (p.is_keeper) keepers.push(p);
      else if (p.player_id != null) marked.push(p);
      else other.push(p);
    });
    return { keepers: keepers, marked: marked, other: other,
             total: (roster || []).length };
  }

  function sizeOf(x) {
    if (!x) return 0;
    if (typeof x.size === 'number') return x.size;   // Set
    if (typeof x.length === 'number') return x.length; // array
    return 0;
  }

  /* Reconcile pick + roster accounting across the coordinate systems.
   * Snapshot `s`:
   *   roster            state.myRoster
   *   drafted           Set|array of every player off the board
   *   recentPicks       array of picks OBSERVED this draft (manual mode)
   *   syncPickNumber    the live room's current pick number, or null (manual)
   *   myPicks           pick_order.my_picks for THIS context (league OR mock)
   *   keeperPlacements  count of MY keepers occupying a slot (defaults to roster keepers)
   *   rehearsalRemovals predicted opponent keepers pre-removed for mock fidelity
   *   isMock            true in a keeper-less mock (keepers are seeded but the mock
   *                     pick order forfeits no rounds, so they are their OWN bucket,
   *                     never conflated with picks made)
   *
   * Returns the itemization, the per-coordinate counts, and `problems` — the
   * invariant violations, named. `agree` is true iff problems is empty. */
  function reconcile(s) {
    s = s || {};
    var item = itemizeRoster(s.roster);
    var draftedN = sizeOf(s.drafted);
    var pickEvents = (s.syncPickNumber != null)
      ? Math.max(0, Number(s.syncPickNumber) - 1)
      : sizeOf(s.recentPicks);
    var keeperPlacements = (s.keeperPlacements != null) ? s.keeperPlacements : item.keepers.length;
    var rehearsalRemovals = s.rehearsalRemovals || 0;
    var myPicks = s.myPicks || [];
    var currentPick = (s.currentPick != null) ? s.currentPick : pickEvents + 1;
    var picksMade = myPicks.filter(function (p) { return p < currentPick; }).length;
    var picksLeft = myPicks.filter(function (p) { return p >= currentPick; }).length;

    var problems = [];

    // 1. No phantom roster entries.
    if (item.other.length) {
      problems.push(item.other.length + ' roster entr' + (item.other.length === 1 ? 'y' : 'ies')
        + ' with no keeper flag and no player_id (came from nowhere)');
    }

    // 2. Board removals == picks observed + keeper placements + rehearsal removals.
    //    Every alarm NAMES the coordinate system that produced each number, so it
    //    is diagnosable (which source is wrong) rather than a bare "they disagree".
    var expectedRemoved = pickEvents + keeperPlacements + rehearsalRemovals;
    if (draftedN !== expectedRemoved) {
      var pe = (s.syncPickNumber != null) ? 'sync clock' : 'recentPicks';
      problems.push('[drafted-set] ' + draftedN + ' off the board != '
        + '[' + pe + '] ' + pickEvents + ' picks + [roster is_keeper] '
        + keeperPlacements + ' keepers'
        + (rehearsalRemovals ? ' + [rehearsal] ' + rehearsalRemovals + ' removals' : '')
        + ' (' + expectedRemoved + ' expected)');
    }

    // 3. My roster's MARKED picks == the picks I have actually made. This is the
    //    dilution guard: if marked > picksMade, seeded keepers or ghosts are being
    //    counted as picks and every roster-relative recommendation is biased.
    if (myPicks.length && item.marked.length !== picksMade) {
      problems.push('[roster marked] ' + item.marked.length
        + ' picks != [my_picks < clock] ' + picksMade + ' made — the need model is reading '
        + (item.marked.length > picksMade ? 'MORE' : 'FEWER') + ' picks than the clock');
    }

    // 4. Picks made + picks left == my total pick slots in this context.
    if (myPicks.length && (picksMade + picksLeft) !== myPicks.length) {
      problems.push('[my_picks split] made ' + picksMade + ' + left ' + picksLeft
        + ' != [my_picks total] ' + myPicks.length);
    }

    // 5. KEEPERS vs PICK COUNT — the invariant that was MISSING, which is how
    //    "3 keepers + 0 picks = 3 on roster · 15 of 15 picks left · ✓ reconciled"
    //    could report reconciled while carrying a number that contradicts the
    //    keeper count in the same sentence (2026-08-10 critique).
    //
    //    Under top_picks_flat a keeper does NOT shorten the draft — it forfeits a
    //    SPECIFIC round (the k-th keeper forfeits round k) — so the draft is
    //    `rounds` long for everyone but I only own `rounds - myKeeperCount` picks
    //    (15 - 3 = 12, in rounds 4-15). If my_picks carries the full 15 while I
    //    hold 3 keepers, then either my_picks was built for a seat with no keepers
    //    (a slot/keeper-owner mismatch — the live symptom) or the keeper slate
    //    never applied. Both make every downstream pick number wrong.
    if (myPicks.length && s.rounds) {
      var expectedMine = Number(s.rounds) - keeperPlacements;
      if (expectedMine >= 0 && myPicks.length !== expectedMine) {
        // SAY WHICH SIDE IS PROBABLY WRONG AND WHAT TO DO (Cory, 2026-08-10). The
        // first version named the disagreement and stopped there. On draft night
        // this fires while he is setting the seat by hand under time pressure, so
        // it has to point at the likely culprit and the one control that fixes it.
        //
        // The keeper slate is the confirmed, commissioner-locked object; the seat
        // is a number typed into a box minutes ago. When they disagree the SEAT is
        // the overwhelmingly more likely error, and the arithmetic even says which
        // seat would be consistent: one holding (rounds - my_picks) keepers.
        var impliedKeepers = Number(s.rounds) - myPicks.length;
        problems.push('[keepers vs my_picks] Your ' + keeperPlacements + ' keeper'
          + (keeperPlacements === 1 ? '' : 's') + ' mean you own ' + expectedMine
          + ' picks in this ' + s.rounds + '-round draft, but the board is giving you '
          + myPicks.length + ' — the seat currently set belongs to someone with '
          + impliedKeepers + ' keeper' + (impliedKeepers === 1 ? '' : 's') + '. '
          + 'THE SEAT IS THE LIKELY ERROR (the slate is commissioner-locked; the seat '
          + 'is typed). Fix it in My Draft Slot at the top, then this line should read '
          + expectedMine + ' of ' + expectedMine + '. Until it does, every pick number, '
          + 'survival % and timing call on this page is computed for the wrong seat.');
      }
    }

    return {
      itemization: {
        keepers: item.keepers.length,
        marked: item.marked.length,
        other: item.other.length,
        total: item.total,
      },
      pickEvents: pickEvents,
      keeperPlacements: keeperPlacements,
      rehearsalRemovals: rehearsalRemovals,
      removedFromBoard: draftedN,
      currentPick: currentPick,
      picksMade: picksMade,
      picksLeft: picksLeft,
      myTotalPicks: myPicks.length,
      isMock: !!s.isMock,
      agree: problems.length === 0,
      problems: problems,
      // A one-line human summary for the commissioner strip.
      line: item.keepers.length + ' keeper' + (item.keepers.length === 1 ? '' : 's')
        + ' + ' + item.marked.length + ' pick' + (item.marked.length === 1 ? '' : 's')
        + ' = ' + item.total + ' on roster · pick ' + currentPick
        + ' · ' + picksLeft + ' of ' + (myPicks.length || '?') + ' picks left'
        + (problems.length ? ' · ⚠ ' + problems.length + ' disagreement(s)' : ' · ✓ reconciled'),
    };
  }

  var api = { itemizeRoster: itemizeRoster, reconcile: reconcile };
  global.DraftAccounting = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
