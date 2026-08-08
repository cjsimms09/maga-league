/* Keeper slate: edit it, see what it broke, lock it.
 *
 * WHY THIS EXISTS
 *
 * The keeper slate is an input file, and every number in the War Room derives
 * from it — adjusted ADP, the true pick order, which picks are mine. Keepers in
 * this league get finalised days before the draft, and a single late change
 * invalidates the whole board while everything still looks completely normal.
 * That is the failure mode worth the most effort: not a crash, not an empty
 * screen, but a confident board built on last week's assumptions.
 *
 * So the slate has to be editable in ten seconds with no network, every edit
 * has to state its consequence in a sentence, and the whole thing has to be
 * explicitly CONFIRMED before the board counts as draft-ready. Until it is, the
 * War Room says so and does not pretend otherwise.
 *
 * Everything here is pure. The recompute itself is DraftKeepers.reapply(),
 * which is already parity-tested against the Python implementation — this
 * module is the bookkeeping around it: what changed, what it cost, and whether
 * what you locked is still what you are looking at.
 */
(function (global) {
  'use strict';

  const CFG = {
    // localStorage, not the server, and deliberately.
    //
    // This gets edited at a table with bad wifi, minutes before a draft, on the
    // one device that matters. A round trip is a thing that can fail at exactly
    // the wrong moment, and the rest of the War Room already runs fully offline
    // from a pinned artifact. The trade is real — the slate does not follow you
    // to another device — and it is the right way round.
    SLATE_KEY: 'mfga.keepers.slate',
    LOCK_KEY: 'mfga.keepers.lock',
    // A lock older than this is suspicious rather than wrong: keepers can be
    // declared a week out, but a slate locked before the previous board build
    // has not been checked against the players actually on it.
    LOCK_STALE_HOURS: 168,
  };

  function keepersOf(slate) {
    const out = [];
    Object.keys(slate || {}).forEach(function (slot) {
      (slate[slot] || []).forEach(function (k) {
        out.push(Object.assign({}, k, { team_slot: Number(slot) }));
      });
    });
    return out;
  }

  /** The slate the artifact was built with, recovered from its forfeited picks. */
  function slateFromForfeited(forfeited) {
    const slate = {};
    (forfeited || []).forEach(function (f) {
      const slot = String(f.team_slot);
      if (!slate[slot]) slate[slot] = [];
      slate[slot].push({
        player_id: String(f.player_id),
        name: f.name || String(f.player_id),
        position: f.position || '?',
        original_round: f.original_round == null ? f.cost_round : f.original_round,
        // The round this keeper actually FORFEITS. Under top_picks_flat this is
        // rank-derived (keeping N forfeits rounds 1..N), NOT the original round —
        // preserve it so the slate shows the real cost, not "round 1" three times.
        cost_round: f.cost_round == null ? null : f.cost_round,
        years_kept: f.years_kept == null ? 1 : f.years_kept,
      });
    });
    return slate;
  }

  /* A fingerprint of WHO is kept and at what cost.
   *
   * Order-independent, because reordering a team's keepers changes nothing
   * about the draft — but changing a cost round changes everything, so that is
   * in the hash. A lock is only meaningful against a specific slate; without
   * this, confirming one slate and then editing it would leave the banner
   * cleared and the board wrong, which is worse than never having locked.
   */
  function slateHash(slate) {
    return keepersOf(slate).map(function (k) {
      return k.team_slot + ':' + k.player_id + ':' + (k.original_round == null ? '-' : k.original_round)
        + ':' + (k.years_kept == null ? 1 : k.years_kept);
    }).sort().join('|');
  }

  /**
   * What is wrong with this slate, in the order it would bite you.
   *
   * Returns [] for a clean slate. Every problem is a sentence, not a code:
   * these get read at speed by somebody who is about to draft.
   */
  /* Is this slate even about the CURRENT board?
   *
   * THE BUG THIS CATCHES. The slate persists in localStorage and stores the
   * player's NAME snapshotted at save time. A slate built while a fixture
   * board was loaded keeps showing fixture names — "RB Player 2" — forever,
   * no matter how real the board underneath becomes, and its ids are
   * synthetic too. Confirming it would recompute adjusted ADP and the true
   * pick order against players that DO NOT EXIST, with every screen looking
   * completely normal.
   *
   * THE TRAP IN WRITING THIS CHECK, which I fell into once already: a real
   * keeper is ABSENT from the draftable board. That is what being kept means.
   * Testing ids against the board alone flags all thirty legitimate keepers,
   * which is the same false-positive this project already fixed once.
   *
   * Three-way discriminator instead:
   *   on the draftable board      -> a player you could still draft. Fine;
   *                                  this is how a manual keeper gets added.
   *   in Sleeper's own keeper set -> a real keeper, legitimately off-board.
   *   in NEITHER                  -> not a player in this artifact at all.
   *                                  That is the fixture ghost.
   */
  function orphans(slate, playersById, builtSlate) {
    const known = {};
    Object.keys(builtSlate || {}).forEach(function (slot) {
      (builtSlate[slot] || []).forEach(function (k) { known[String(k.player_id)] = true; });
    });
    const out = [];
    Object.keys(slate || {}).forEach(function (slot) {
      (slate[slot] || []).forEach(function (k) {
        const id = String(k.player_id);
        const onBoard = !!(playersById && playersById[id]);
        if (!onBoard && !known[id]) {
          out.push({ team_slot: Number(slot), player_id: id,
                     name: k.name || id });
        }
      });
    });
    return out;
  }

  /* Has Sleeper moved on without us?
   *
   * `state.built` is rebuilt from Sleeper every night. A saved slate silently
   * OVERRIDES it — which is correct for a manual correction made minutes
   * before the draft, and badly wrong when keepers get finalised on Sleeper
   * and the saved copy just goes on shadowing them. Same hash, different
   * question: not "did I edit this since confirming" but "did the league
   * change under me". */
  function divergesFromSource(saved, built) {
    if (!saved || !built) return null;
    const a = slateHash(saved), b = slateHash(built);
    if (a === b) return null;
    const sc = keepersOf(saved).length, bc = keepersOf(built).length;
    return {
      diverged: true, saved_count: sc, source_count: bc,
      message: 'Your saved keeper slate no longer matches what Sleeper says. '
        + 'Sleeper now shows ' + bc + ' keeper' + (bc === 1 ? '' : 's') + '; your saved '
        + 'slate has ' + sc + '. Your copy is what the board is using. Either '
        + 'reset to Sleeper, or confirm you meant to keep yours.',
    };
  }

  function validate(slate, cfg, playersById) {
    const problems = [];
    const rules = (cfg || {}).keepers || {};
    const max = rules.count == null ? 3 : Number(rules.count);
    const teams = (cfg || {}).teams || 10;

    const seen = {};
    Object.keys(slate || {}).forEach(function (slot) {
      const list = slate[slot] || [];
      const n = Number(slot);
      if (!(n >= 1 && n <= teams)) {
        problems.push('There is a keeper on seat ' + slot + ', but this is a ' + teams + '-team league.');
      }
      if (list.length > max) {
        problems.push('Seat ' + slot + ' has ' + list.length + ' keepers; the league allows ' + max + '.');
      }
      list.forEach(function (k) {
        const id = String(k.player_id);
        if (seen[id]) {
          problems.push((k.name || id) + ' is kept by seat ' + seen[id] + ' AND seat ' + slot
            + '. One of them is wrong.');
        }
        seen[id] = slot;
        // DELIBERATELY NOT CHECKED: whether he is on the board. A keeper is by
        // definition off the draftable board — checking for it fired on all
        // thirty keepers of a perfectly normal slate, and thirty warnings on
        // the happy path is how a screen teaches you to ignore warnings. It
        // also buried the duplicate-keeper warning, which is the one that
        // matters.
        //
        // What IS worth checking is whether his cost can be determined at all,
        // because that is the number every downstream pick depends on.
        if (k.original_round == null) {
          if (rules.cost_model === 'original_round' && rules.undrafted_rule === 'ineligible') {
            problems.push((k.name || id) + ' (seat ' + slot + ') has no original round, and this '
              + 'league does not allow undrafted keepers.');
          } else if (rules.cost_model !== 'no_cost' && rules.cost_model !== 'fixed_round') {
            problems.push((k.name || id) + ' (seat ' + slot + ') has no cost round set — '
              + 'he will be charged the undrafted default of round '
              + (rules.undrafted_round == null ? 10 : rules.undrafted_round) + '.');
          }
        } else if (cfg && cfg.rounds && (k.original_round < 1 || k.original_round > cfg.rounds)) {
          problems.push((k.name || id) + ' (seat ' + slot + ') costs round ' + k.original_round
            + ', but this draft is only ' + cfg.rounds + ' rounds.');
        }
      });
    });
    return problems;
  }

  /** Who came in, who went out, and whose cost moved. */
  function diffSlates(before, after) {
    const b = {}, a = {};
    keepersOf(before).forEach(function (k) { b[k.team_slot + ':' + k.player_id] = k; });
    keepersOf(after).forEach(function (k) { a[k.team_slot + ':' + k.player_id] = k; });

    const added = [], removed = [], moved = [];
    Object.keys(a).forEach(function (key) {
      if (!b[key]) added.push(a[key]);
      else if (Number(b[key].original_round) !== Number(a[key].original_round)) {
        moved.push({ keeper: a[key], from: b[key].original_round, to: a[key].original_round });
      }
    });
    Object.keys(b).forEach(function (key) { if (!a[key]) removed.push(b[key]); });

    // A player moving between seats shows as one removal and one addition,
    // which is the honest description: two teams' pick orders changed.
    return { added: added, removed: removed, moved: moved,
             changed: added.length + removed.length + moved.length };
  }

  /**
   * Say what an edit DID, not just that something re-rendered.
   *
   * "Your first pick moves 4 → 7" is a sentence you can sanity-check in a
   * second. A re-sorted table of two hundred rows is not, and a bad edit hides
   * in it perfectly.
   */
  function consequence(before, after) {
    const lines = [];
    const bp = (before && before.myPicks) || [];
    const ap = (after && after.myPicks) || [];

    if (bp.join(',') !== ap.join(',')) {
      const shown = [];
      for (let i = 0; i < Math.max(bp.length, ap.length) && shown.length < 4; i++) {
        if (bp[i] !== ap[i]) {
          shown.push(bp[i] == null ? 'new pick ' + ap[i]
            : (ap[i] == null ? 'pick ' + bp[i] + ' gone' : bp[i] + ' → ' + ap[i]));
        }
      }
      lines.push('Your picks change: ' + shown.join(', ')
        + (bp.length !== ap.length
            ? '. You now have ' + ap.length + ' picks, not ' + bp.length + '.' : '.'));
    }

    // The question actually being asked is "who can I still get".
    const bBest = (before && before.bestAtFirst) || null;
    const aBest = (after && after.bestAtFirst) || null;
    if (bBest && aBest && bBest.player_id !== aBest.player_id) {
      lines.push('Best player likely to reach your first pick: '
        + bBest.name + ' → ' + aBest.name + '.');
    }

    const bn = (before && before.poolSize) || 0;
    const an = (after && after.poolSize) || 0;
    if (bn && an && bn !== an) {
      const d = Math.abs(an - bn);
      lines.push(d + ' ' + (d === 1 ? 'player is' : 'players are')
        + (an < bn ? ' no longer' : ' now') + ' in the draft pool.');
    }
    if (!lines.length) lines.push('No change to your picks or to the pool.');
    return lines;
  }

  /* Is the slate on screen the one that was confirmed?
   *
   * Three states, and conflating the last two is the whole point of this
   * module: never locked, locked and matching, locked but EDITED SINCE. The
   * third is the dangerous one — a cleared banner over a changed slate is worse
   * than no banner at all, because it actively asserts that somebody checked.
   */
  function lockState(stored, slate, nowMs) {
    const hash = slateHash(slate);
    if (!stored || !stored.hash) {
      return { locked: false, stale: false, matches: false,
               message: 'The keeper slate has never been confirmed. '
                 + 'Every pick number and every adjusted ADP on the board depends on it.' };
    }
    if (stored.hash !== hash) {
      return { locked: false, stale: false, matches: false, edited: true,
               at: stored.at,
               message: 'The keeper slate has been edited since it was confirmed. '
                 + 'Confirm it again, or the board is running on a slate nobody checked.' };
    }
    const ageH = stored.at && nowMs ? (nowMs - Date.parse(stored.at)) / 3.6e6 : 0;
    if (ageH > CFG.LOCK_STALE_HOURS) {
      return { locked: true, stale: true, matches: true, at: stored.at, age_hours: ageH,
               message: 'Confirmed ' + Math.round(ageH / 24) + ' days ago. '
                 + 'Worth a second look if keepers were still moving since.' };
    }
    return { locked: true, stale: false, matches: true, at: stored.at, age_hours: ageH,
             message: 'Keeper slate confirmed' + (stored.at ? ' ' + stored.at : '') + '.' };
  }

  const api = {
    orphans: orphans,
    divergesFromSource: divergesFromSource,
    CFG, keepersOf, slateFromForfeited, slateHash, validate, diffSlates,
    consequence, lockState,
  };
  global.KeeperLock = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
