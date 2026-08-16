/* THE VERDICT — one voice over four lenses, derived, never invented.
 *
 * Cory's 21-page capture (2026-08-15) showed the war room contradicting itself
 * four ways at one pick: the rule headline said TAKE GIBBS, the paths panel
 * priced Nacua 82.3 higher, the seat plan wanted a TE, and the strategy poll
 * went 7-of-7 Nacua — four unmarked authorities, no hierarchy, no arbiter.
 * His directive: "a host of options yet be clear about what it is actually
 * recommending and how confident it is in that recommendation."
 *
 * This module DERIVES the single verdict the page backs from the engine's own
 * fields. It computes NO new model quantities:
 *
 *   · the confidence ladder is engine.confidence() — its `level` and `gap`
 *     are used verbatim, its thresholds are CFG.COIN_FLIP_GAP / CFG.CLOSE_GAP;
 *   · "contested" is scored[0].contested — the engine's own tie flag,
 *     gap < CFG.TIE_THRESHOLD;
 *   · "the board cannot resolve this" is CFG.PATHS_BAND — the exact band the
 *     rule-headline's Two-Reads line already used for the same sentence;
 *   · the backed pick follows the ruled hierarchy (Cory, 2026-08-16, queue
 *     item 4): a personal-list PIN first (his own hand), then THE SEAT PLAN's
 *     answer wherever the plan speaks — it optimizes all his picks together —
 *     with the value pick always printed as the explicit priced alternative;
 *     where the plan is silent, the older doctrine stands (the rule's pick,
 *     "measured to earn money", over value-now).
 *
 * The chip can therefore never say LOCK while the engine says contested: LOCK
 * requires level 'clear', which requires gap >= CFG.CLOSE_GAP (3.5), while
 * contested requires gap < CFG.TIE_THRESHOLD (2.0) — and the derivation checks
 * `contested` FIRST anyway, so the guarantee holds even if the thresholds are
 * ever re-tuned into overlap. ui_fidelity_verdict.test.js sweeps the gap axis
 * against the real CFG to pin this.
 *
 * Pure. No DOM, no state, no fetch. The renderer (app.js renderVerdict) feeds
 * it engine outputs and prints what it returns.
 */
(function (global) {
  'use strict';

  /* Map the engine's confidence level + contested flag to a chip.
   * Exposed for tests. `contested` DOMINATES: it is the engine's own "these
   * two are a tie" claim and no presentation may out-confidence it. */
  function chipForConfidence(level, contested) {
    if (contested) return 'TOSS-UP';
    if (level === 'coin-flip') return 'TOSS-UP';
    if (level === 'close') return 'LEAN';
    if (level === 'clear') return 'LOCK';
    if (level === 'pinned') return 'PINNED';
    return 'NONE';
  }

  function _entryFor(scored, playerId) {
    if (playerId == null) return null;
    for (var i = 0; i < scored.length; i++) {
      var p = scored[i].player || {};
      if (String(p.player_id) === String(playerId)) return scored[i];
    }
    return null;
  }

  function _name(p) { return (p && (p.name || p.player_id)) || '?'; }

  /* ── TIE-BREAK FACTS — printed, never scored (Cory, 2026-08-16: "Anything we
   * should add to it that could help me, especially in tie break scenarios?").
   *
   * When the verdict is TOSS-UP the board has already said it cannot separate
   * the two names — so this adds NO new scoring weight and NEVER moves the
   * backed pick. It prints FACTS the board already carries that a human can
   * legitimately break a tie with:
   *   (a) ADP velocity divergence — one rising, one falling (build.py stamps
   *       adp_velocity from the retained series; positive = rising);
   *   (b) bye-week overlap with the roster already drafted (a tie-breaker,
   *       not a price — the bye adjuster stays measured-off);
   *   (c) an age gap where meaningful (> 2 years);
   *   (d) depth-chart security — a listed starter vs a committee/backup slot.
   * A fact whose inputs are absent on either player is SKIPPED (absent ≠ zero
   * — no fact is invented from a missing field). Returns [] when nothing on
   * the board separates them, and the renderer says that honestly.
   * ui_fidelity_tiebreak.test.js pins: facts render only on TOSS-UP, and the
   * backed pick is byte-identical with and without the roster input. */
  function tiebreakFacts(aEntry, bEntry, roster) {
    var a = aEntry && aEntry.player, b = bEntry && bEntry.player;
    if (!a || !b) return [];
    var facts = [];

    // (a) market divergence — only when the two move in OPPOSITE directions.
    var va = a.adp_velocity, vb = b.adp_velocity;
    if (va != null && vb != null && ((va > 0 && vb < 0) || (va < 0 && vb > 0))) {
      var riser = va > 0 ? a : b;
      var faller = va > 0 ? b : a;
      var rv = Math.abs(va > 0 ? va : vb);
      var fv = Math.abs(va > 0 ? vb : va);
      facts.push('market: ' + _name(riser) + ' is rising (+' + Math.round(rv)
        + ' ADP slots) while ' + _name(faller) + ' is falling (−'
        + Math.round(fv) + ') — one of these moves may be news');
    }

    // (b) bye overlap with what is already drafted (keepers included).
    if (roster && roster.length) {
      var overlap = function (pl) {
        if (pl.bye == null) return null;         // absent bye: no claim at all
        var n = 0;
        for (var i = 0; i < roster.length; i++) {
          var r = roster[i];
          if (!r || r.bye == null) continue;
          if (String(r.player_id) === String(pl.player_id)) continue;
          if (Number(r.bye) === Number(pl.bye)) n++;
        }
        return n;
      };
      var oa = overlap(a), ob = overlap(b);
      if (oa != null && ob != null && oa !== ob) {
        var stacked = oa > ob ? a : b;
        var clear = oa > ob ? b : a;
        var sn = Math.max(oa, ob), cn = Math.min(oa, ob);
        facts.push('byes: ' + _name(stacked) + ' (wk ' + stacked.bye + ') stacks with '
          + sn + ' of your picks; ' + _name(clear) + ' (wk ' + clear.bye + ') '
          + (cn === 0 ? 'is clear' : 'stacks with ' + cn));
      }
    }

    // (c) age, only where the gap is meaningful (> 2 years).
    if (a.age != null && b.age != null && Math.abs(a.age - b.age) > 2) {
      var younger = a.age < b.age ? a : b;
      var older = a.age < b.age ? b : a;
      facts.push('age: ' + _name(younger) + ' is ' + younger.age + ', '
        + _name(older) + ' is ' + older.age + ' — '
        + Math.round(Math.abs(a.age - b.age)) + ' years apart');
    }

    // (d) depth-chart security — a fact only when exactly one is the listed №1.
    var da = a.depth_chart_order, db = b.depth_chart_order;
    if (da != null && db != null && (Number(da) === 1) !== (Number(db) === 1)) {
      var starter = Number(da) === 1 ? a : b;
      var committee = Number(da) === 1 ? b : a;
      facts.push('depth chart: ' + _name(starter) + ' is the listed starter; '
        + _name(committee) + ' sits №' + (Number(da) === 1 ? db : da)
        + ' — committee/backup risk');
    }

    return facts;
  }

  /* derive(input) -> the one verdict.
   *
   * input:
   *   cfg         engine CFG (TIE_THRESHOLD, COIN_FLIP_GAP, CLOSE_GAP, PATHS_BAND) — REQUIRED
   *   scored      engine scored list (already personal-list adjusted)
   *   confidence  engine confidence(scored) result
   *   rule        { pick:{player_id,name,position}, reason } | null   (DraftNeedRule.recommend)
   *   ruleOverfill true when the value top over-fills a position the rule caps
   *   plan        { slot, name } | null       (seat_plan seat: wanted position)
   *   poll        { agree, n, lead_name, lead_position, artifact, contested } | null
   *   roster      [player…] | null — the picks already made (board player
   *               objects; bye/age fields read for tie-break FACTS only —
   *               nothing here changes scoring or the backed pick)
   *
   * returns:
   *   { verdict, pick, headline, why, confidence_note, gap_pts, gap_units,
   *     lenses:[{key,label,optimizes,pick,stance,note}], alternatives:[{player,behind_pts}],
   *     tiebreak: null | { a, b, facts:[…] }   (TOSS-UP only — printed facts) }
   */
  function derive(input) {
    var cfg = input.cfg;
    if (!cfg) throw new Error('DraftVerdict.derive: cfg (engine CFG) is required');
    var scored = (input.scored || []).filter(function (s) { return s && s.player; });
    var conf = input.confidence || { level: 'none', gap: 0, message: '' };
    var rule = input.rule && input.rule.pick ? input.rule : null;

    if (!scored.length) {
      return { verdict: 'NONE', pick: null, headline: 'Board is empty.',
        why: '', confidence_note: conf.message || '', gap_pts: null,
        gap_units: 'composite pts', lenses: [], alternatives: [], tiebreak: null };
    }

    var top = scored[0];
    var contested = !!top.contested;
    var band = cfg.PATHS_BAND != null ? cfg.PATHS_BAND
      : (cfg.COIN_FLIP_GAP == null ? 1 : cfg.COIN_FLIP_GAP) * 4;

    // ── Which player does the page back? ────────────────────────────────
    // THE SEAT PLAN'S, when the plan speaks — Cory's ruling, 2026-08-16
    // (queue item 4, "pick-33 headline ownership": the DP-backed seat plan
    // owns the headline; the value pick prints as the explicit second line).
    // The plan optimizes ALL his picks together, which is strictly more
    // context than value-now. Where the plan is silent the older doctrine
    // stands: the rule's pick when the rule speaks, value top otherwise.
    // A personal-list PIN still trumps everything — that is Cory's own hand.
    var rulePick = rule ? rule.pick : null;
    var ruleEntry = rulePick ? _entryFor(scored, rulePick.player_id) : null;
    var ruleDiffers = !!(rulePick && String(rulePick.player_id) !== String(top.player.player_id));
    // The plan's concrete candidate: its own shortlist name when that player
    // is on the scored board, else the best-scoring player at the wanted
    // slot. A wanted slot with nobody scoreable leaves the plan silent.
    var planEntry = null;
    if (input.plan && input.plan.slot) {
      if (input.plan.name) {
        for (var pi = 0; pi < scored.length; pi++) {
          if (scored[pi].player.name === input.plan.name) { planEntry = scored[pi]; break; }
        }
      }
      if (!planEntry) {
        for (var pj = 0; pj < scored.length; pj++) {
          if (scored[pj].player.position === input.plan.slot) { planEntry = scored[pj]; break; }
        }
      }
    }
    var planDiffers = !!(planEntry
      && String(planEntry.player.player_id) !== String(top.player.player_id));
    var planGap = (planDiffers && planEntry.score != null && top.score != null)
      ? (top.score - planEntry.score) : null;
    // The separation between the two answers, in the score's own units.
    var splitGap = (ruleDiffers && ruleEntry && ruleEntry.score != null && top.score != null)
      ? (top.score - ruleEntry.score) : null;

    var verdict, why;
    var backed = ruleDiffers ? (ruleEntry ? ruleEntry.player : rulePick) : top.player;
    if (planEntry) backed = planEntry.player;

    if (conf.level === 'pinned') {
      verdict = 'PINNED';
      backed = top.player;
      why = conf.message; // the engine's own sentence — keep him on purpose, or take the other.
    } else if (planDiffers && (planGap == null || Math.abs(planGap) >= band)) {
      verdict = 'SPLIT';
      why = 'The season plan owns this seat: take ' + _name(planEntry.player)
        + ' (' + input.plan.slot + '). The value board prefers ' + _name(top.player)
        + (planGap != null ? ' by ' + Math.abs(planGap).toFixed(1) + ' composite pts' : '')
        + ' — that is your alternative if you have a reason; log it.';
    } else if (planDiffers) {
      verdict = 'TOSS-UP';
      why = _name(planEntry.player) + ' (plan) and ' + _name(top.player)
        + ' (value) are within what the board can resolve ('
        + Math.abs(planGap).toFixed(1) + ' of ' + band
        + ' composite pts) — these are inside the model’s noise. Your call; log which.';
    } else if (!planEntry && ruleDiffers && (splitGap == null || Math.abs(splitGap) >= band)) {
      verdict = 'SPLIT';
      why = 'Two answers. The measured rule takes ' + _name(rulePick)
        + '; the value board prefers ' + _name(top.player)
        + (splitGap != null ? ' by ' + Math.abs(splitGap).toFixed(1) + ' composite pts' : '')
        + '. The rule is the one measured to earn money — take '
        + _name(top.player) + ' only with a reason, and log it.';
    } else if (!planEntry && ruleDiffers) {
      // Rule and value disagree INSIDE the band the board itself cannot
      // resolve — that is a tossup between two right answers, not a split.
      verdict = 'TOSS-UP';
      why = _name(rulePick) + ' (rule) and ' + _name(top.player)
        + ' (value) are within what the board can resolve ('
        + Math.abs(splitGap).toFixed(1) + ' of ' + band
        + ' composite pts) — these are inside the model’s noise. Your call; log which.';
    } else {
      verdict = chipForConfidence(conf.level, contested);
      if (verdict === 'TOSS-UP') {
        var second = scored[1] ? _name(scored[1].player) : 'the next name';
        why = _name(top.player) + ' and ' + second + ' are within the model’s noise ('
          + (top.gap_to_second != null ? top.gap_to_second.toFixed(1) : conf.gap.toFixed(1))
          + ' composite pts) — the board cannot separate them. Your call; both are right.';
      } else if (verdict === 'LEAN') {
        why = conf.message; // "Close: A is ahead of B by only N. A real preference should override this."
      } else if (verdict === 'LOCK') {
        why = conf.message; // "A is clearly ahead — N points over B."
      } else {
        why = conf.message || '';
      }
    }

    // ── Tie-break facts, TOSS-UP only — printed AFTER the verdict and the
    // backed pick are both final, so they structurally cannot move either.
    var tiebreak = null;
    if (verdict === 'TOSS-UP') {
      var backedEntry = _entryFor(scored, (backed || {}).player_id) || top;
      // The other half of the tie is whichever answer the toss-up was between:
      // plan-vs-value and rule-vs-value ties are against the value top;
      // a plain contested/coin-flip board is #1 vs #2.
      var rivalEntry = null;
      if (planEntry && planDiffers) rivalEntry = top;
      else if (!planEntry && ruleDiffers && ruleEntry) rivalEntry = top;
      else rivalEntry = scored[1] || null;
      if (rivalEntry && rivalEntry.player && backedEntry.player
          && String(rivalEntry.player.player_id) !== String(backedEntry.player.player_id)) {
        tiebreak = {
          a: _name(backedEntry.player), b: _name(rivalEntry.player),
          facts: tiebreakFacts(backedEntry, rivalEntry, input.roster || []),
        };
      }
    }

    // ── The lenses: every voice, labeled by what it optimizes ───────────
    // Stance is measured against the BACKED pick — the lens that supplied the
    // answer must read as agreeing with it (Cory's capture showed the rule
    // chip saying "disagrees" under a headline that WAS the rule's pick).
    var lenses = [];
    if (rulePick) {
      lenses.push({ key: 'rule', label: 'RULE', optimizes: 'measured to earn money',
        pick: _name(rulePick),
        stance: String(rulePick.player_id) === String((backed || {}).player_id) ? 'agrees' : 'differs',
        note: rule.reason || '' });
    }
    lenses.push({ key: 'value', label: 'VALUE', optimizes: 'biggest points edge now',
      pick: _name(top.player),
      stance: String(top.player.player_id) === String((backed || {}).player_id) ? 'agrees' : 'differs',
      note: (top.reasons && top.reasons[0]) || '' });
    if (input.plan && input.plan.slot) {
      var planAgrees = (backed && backed.position) === input.plan.slot;
      lenses.push({ key: 'plan', label: 'PLAN', optimizes: 'all your picks together',
        pick: input.plan.slot + (input.plan.name ? ' — ' + input.plan.name : ''),
        stance: planAgrees ? 'agrees' : 'differs',
        note: 'the season plan wants a ' + input.plan.slot + ' at this seat' });
    }
    if (input.poll && input.poll.n) {
      var pollAgrees = backed && input.poll.lead_name
        && input.poll.lead_name === _name(backed);
      lenses.push({ key: 'poll', label: 'POLL', optimizes: input.poll.n + ' strategy sims',
        pick: input.poll.agree + '/' + input.poll.n + ' → ' + (input.poll.lead_name || '?'),
        stance: input.poll.artifact ? 'artifact' : (pollAgrees ? 'agrees' : 'differs'),
        note: input.poll.artifact
          ? 'one term drives all ' + input.poll.agree + ' votes — not independent confirmation'
          : (input.poll.contested ? 'the strategies split — slow down' : '') });
    }

    // ── Alternatives, priced against the BACKED pick in the score's units ─
    // Signed: negative = behind the pick, positive = scores HIGHER than the
    // pick (possible in a SPLIT, where the page backs the rule over the value
    // top — that "+6.3 ahead on value" is the honest price of following the
    // rule, shown rather than hidden). The backed pick never lists itself.
    var refEntry = _entryFor(scored, (backed || {}).player_id) || top;
    var refScore = refEntry.score != null ? refEntry.score : top.score;
    var alternatives = scored
      .filter(function (s) {
        return String(s.player.player_id) !== String((backed || {}).player_id);
      })
      .slice(0, 4)
      .map(function (s) {
        return { player: s.player,
          delta_pts: (s.score != null && refScore != null)
            ? Number((s.score - refScore).toFixed(1)) : null };
      });

    return {
      verdict: verdict,
      pick: backed,
      headline: 'TAKE ' + _name(backed).toUpperCase(),
      why: why,
      confidence_note: conf.message || '',
      gap_pts: top.gap_to_second != null ? Number(top.gap_to_second.toFixed(1)) : null,
      gap_units: 'composite pts',
      lenses: lenses,
      alternatives: alternatives,
      tiebreak: tiebreak,
    };
  }

  var api = { derive: derive, chipForConfidence: chipForConfidence,
    tiebreakFacts: tiebreakFacts };
  global.DraftVerdict = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
