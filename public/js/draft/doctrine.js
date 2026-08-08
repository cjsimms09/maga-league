/* THE DOCTRINE BANNER — the strategy state machine (war-room-v2-doctrine-banner.md).
 *
 * The pure, load-bearing half: hold the ranked doctrines with their dollar gaps,
 * decide switch-vs-hold under HYSTERESIS, produce the switch sentence, record a
 * decline. No DOM, no tournament output — the banner UI and the enrolled winner
 * wire in on top of this once experiment 19 + the strategy tournament land.
 *
 * WHY HYSTERESIS IS THE WHOLE POINT
 * ---------------------------------
 * A banner that changes doctrine every pick is a mood ring, not a strategy. A
 * switch requires the alternative to lead the current doctrine by MORE THAN the
 * even-money noise band, for MORE THAN one pick (SWITCH_MIN_PICKS). Noise flaps
 * are suppressed; only a durable, material lead flips the plan.
 */
(function (global) {
  'use strict';

  // The doctrine set. **Keys are the LAB's archetype keys** (`cory_conditional.py`
  // `make_archetypes()`) — the spec said the final names come from whatever the
  // tournaments race, and experiment 19b raced these. One vocabulary from the
  // simulator to the banner to the ledger means an enrolled verdict can be read
  // straight off `cory-conditional.json` without a translation table nobody
  // maintains. Creeds are the one-line philosophy each executes.
  const DOCTRINES = {
    hero_rb:    { key: 'hero_rb',    name: 'Hero-RB Continuation', creed: 'one anchor back, then hammer WR value' },
    robust_rb:  { key: 'robust_rb',  name: 'Robust RB',            creed: 'two backs early; win the position the room is short on' },
    zero_rb:    { key: 'zero_rb',    name: 'Zero RB',              creed: 'no backs until the middle rounds; pass-game value first' },
    wr_anchor:  { key: 'wr_anchor',  name: 'WR Feast',             creed: 'ride the value fall; TE and QB wait; ceiling in the flex' },
    elite_te:   { key: 'elite_te',   name: 'Elite-TE Anchor',      creed: 'pay for the last elite TE; the cliff pays it back' },
    early_qb:   { key: 'early_qb',   name: 'Early-QB Strike',      creed: 'take the rushing-QB edge before the room does' },
    late_qb:    { key: 'late_qb',    name: 'Late-QB Patience',     creed: 'let the room pay for QB; take the streamer tier' },
    ceiling:    { key: 'ceiling',    name: 'Ceiling Chase',        creed: 'high-variance builds; the weekly-high pool rewards booms' },
    balanced:   { key: 'balanced',   name: 'Balanced Value',       creed: 'best expected dollars available (the control)' },
  };

  // Older ledger rows and the pre-alignment spec used `wr_feast`; resolve it so
  // a historical record still names a doctrine instead of rendering a raw key.
  const ALIASES = { wr_feast: 'wr_anchor' };

  const DEFAULTS = {
    noiseBand: 4.0,       // dollars; mirrors the engine's DG_NOISE_BAND even-money band
    minPicks: 2,          // consecutive picks the challenger must lead by > band to flip
  };

  function doctrineMeta(key) {
    const k = ALIASES[key] || key;
    return DOCTRINES[k] || { key: k, name: k, creed: '' };
  }

  /* ── LIVE DOCTRINE SCORING ────────────────────────────────────────────────
   * The banner needs a dollar number per doctrine at every pick, and it has to
   * be a REAL number or the whole panel is decoration.
   *
   * A doctrine, in the Lab, is a CONSTRAINT on which players a seat may take at
   * a given live pick (`cory_conditional.py` `make_archetypes()`). The mirrors
   * below are that same constraint, pick-for-pick, in the browser. So a
   * doctrine's live score is: **the E[$] of the best board player that doctrine
   * would let me take right now.** The gap between two doctrines is therefore
   * the dollar cost of executing one instead of the other AT THIS PICK — an
   * auditable number off the same `playerDollars` model the dollar-gap panel
   * uses, not a season projection.
   *
   * WHAT IT IS NOT: the Lab's +$91.50 enrollment edge is a season-long, paired-
   * room result. These are this-pick costs. The banner shows both and labels
   * them differently, because conflating them would be inventing precision.
   *
   * One deliberate difference from the Lab chooser: it takes max-VORP inside the
   * allowed set, this takes max-dollars. The client's currency is E[$] and the
   * banner is a money instrument; VORP is the input to that, not the output.
   */
  function _count(roster, pos) {
    return (roster || []).filter(function (p) { return (p.position || p.pos) === pos; }).length;
  }

  // (position, liveIndex 1-based, roster) -> allowed?  Mirrors make_archetypes().
  /* ── IS THE DOCTRINE ACTUALLY GOVERNING? ────────────────────────────────
   *
   * ONE CANONICAL FLAG, because the answer has to be identical everywhere it is
   * asserted. Audited 2026-08-08 (DOCTRINE-ENFORCEMENT-AUDIT.md): the enrolled
   * doctrine never reached the engine — `grep doctrine engine.js` returned
   * nothing — and its only consumer added a badge to an already-generated path.
   * Recommendations were byte-identical whether enrolled or not.
   *
   * A plan line reading "plan intact" while nothing executes the plan is the
   * same failure as an uninstalled term wearing a badge: a truthful-looking
   * label on a computation it did not touch. So the surface says what is true,
   * and it says it from HERE — when Stage 3 wires the tilt, GOVERNS flips once
   * and every surface that asks follows, rather than each renderer being
   * remembered separately.
   */
  var GOVERNS = true;
  function governs() { return GOVERNS; }
  function setGoverns(v) { GOVERNS = !!v; return GOVERNS; }
  function governanceLine(enrolled) {
    if (!enrolled) return 'no doctrine enrolled — running the control';
    return GOVERNS
      ? 'enrolled — tilting recommendations'
      : 'enrolled, DISPLAY-ONLY — not driving recommendations';
  }

  /* ── WHAT EACH DOCTRINE WANTS (as opposed to what it ALLOWS) ─────────────
   *
   * LIVE_CONSTRAINTS answers "is this pick legal under the plan" and returns
   * true for almost everything once the binding rounds pass. That makes it a
   * filter, not a preference — using it as a tilt hands every position the same
   * bonus and differentiates nothing, which is exactly what a first attempt at
   * the Stage 3 tilt did.
   *
   * PREFERS is the missing half: +1 the plan actively wants this position here,
   * -1 it actively wants to avoid it, 0 no opinion. Read straight off each
   * doctrine's own creed, which is the only defensible source — a preference
   * invented separately from the creed would let the banner and the score mean
   * different things by the same name.
   *
   * `i` is MY pick index, 1-based (the same coordinate LIVE_CONSTRAINTS uses).
   *
   * WEIGHTS ARE CONTINUOUS, in [-1, +1], not booleans. A boolean preference
   * makes every tilt the same size, so a doctrine that mildly prefers WR and one
   * that is built entirely around WR push equally hard — and the only way to
   * express "slightly" becomes not expressing it at all. Continuous weights let
   * the tilt move a close call proportionally to how much the plan actually
   * cares, while the upper bound is preserved by construction: |w| <= 1, so the
   * tilt can never exceed DOCTRINE_TILT.
   */
  const PREFERS = {
    // "one anchor back, then hammer WR value"
    hero_rb: function (pos, i, r) {
      // "one anchor back, THEN HAMMER WR value" — the anchor is emphatic, the
      // WR lean that follows is strong but not absolute.
      if (i <= 2 && _count(r, 'RB') === 0) return pos === 'RB' ? 1 : -0.5;
      return pos === 'WR' ? 0.8 : (pos === 'RB' ? -0.6 : 0);
    },
    // "two backs early; win the position the room is short on"
    robust_rb: function (pos, i, r) {
      // "TWO backs EARLY" — emphatic while the requirement is unmet, and it
      // decays as the second back is secured.
      if (i > 4 || _count(r, 'RB') >= 2) return 0;
      var short = 2 - _count(r, 'RB');
      return pos === 'RB' ? (short >= 2 ? 1 : 0.7) : -0.6;
    },
    // "no backs until the middle rounds; pass-game value first"
    zero_rb: function (pos, i) {
      // "NO backs until the MIDDLE rounds" — absolute early, easing toward the
      // middle rather than switching off at a cliff.
      if (i >= 6) return 0;
      var decay = 1 - (i - 1) / 6;                 // 1.0 at pick 1 -> ~0.2 at 6
      if (pos === 'RB') return -1 * decay;
      return (pos === 'WR' || pos === 'TE') ? 0.8 * decay : 0;
    },
    // "ride the value fall; TE and QB wait; ceiling in the flex"
    wr_anchor: function (pos, i) {
      // "ride the value fall; TE and QB WAIT" — WR is the plan's whole name, so
      // it is emphatic; the TE/QB deferral is real but softer than a ban.
      if (i > 6) return 0;
      if (pos === 'WR') return 1;
      return (pos === 'TE' || pos === 'QB') ? -0.7 : 0;
    },
    // "pay for the last elite TE; the cliff pays it back"
    elite_te: function (pos, i, r) {
      // "pay for the LAST ELITE TE" — emphatic, and only while one is unowned.
      return (i <= 3 && _count(r, 'TE') === 0) ? (pos === 'TE' ? 1 : -0.3) : 0;
    },
    // "take the rushing-QB edge before the room does"
    early_qb: function (pos, i, r) {
      // "take the rushing-QB edge BEFORE the room does" — urgency decays as the
      // window closes rather than ending abruptly.
      if (i > 4 || _count(r, 'QB') > 0) return 0;
      return pos === 'QB' ? (1 - (i - 1) * 0.15) : -0.2;
    },
    // "let the room pay for QB; take the streamer tier"
    late_qb: function (pos, i) {
      // "LET the room PAY for QB" — strongest early, fading toward the streamer
      // tier rather than flipping off at pick 8.
      if (i > 8 || pos !== 'QB') return 0;
      return -1 * (1 - (i - 1) / 9);
    },
    // A VARIANCE posture, not a positional one. Deliberately no positional
    // preference — pretending otherwise would invent a claim the creed does
    // not make. The ceiling TERM already carries this doctrine's intent.
    ceiling: function () { return 0; },
    balanced: function () { return 0; },        // the control, by definition
  };

  /** +1 wants it here, -1 avoids it here, 0 no opinion. */
  function prefers(key, pos, i, roster) {
    const f = PREFERS[key];
    if (typeof f !== 'function') return 0;
    const v = Number(f(pos, i, roster || [])) || 0;
    // CLAMPED, so the upper bound is a property of this function rather than a
    // promise every doctrine author has to keep.
    return Math.max(-1, Math.min(1, v));
  }

  const LIVE_CONSTRAINTS = {
    balanced:  function () { return true; },
    ceiling:   function () { return true; },   // a tilt, not a positional filter
    zero_rb:   function (pos, i) { return i >= 6 || pos !== 'RB'; },
    late_qb:   function (pos, i) { return i >= 8 || pos !== 'QB'; },
    hero_rb:   function (pos, i, r) {
      if (i === 2 && _count(r, 'RB') === 0) return pos === 'RB';
      if (i <= 8 && _count(r, 'RB') >= 1) return pos !== 'RB';
      return true;
    },
    robust_rb: function (pos, i, r) {
      const have = _count(r, 'RB');
      if (i <= 4 && (2 - have) >= (4 - (i - 1)) && have < 2) return pos === 'RB';
      return true;
    },
    wr_anchor: function (pos, i, r) {
      const have = _count(r, 'WR');
      if (i <= 4 && (3 - have) >= (4 - (i - 1)) && have < 3) return pos === 'WR';
      return true;
    },
    elite_te:  function (pos, i, r) {
      if (i === 2 && _count(r, 'TE') === 0) return pos === 'TE';
      return true;
    },
    early_qb:  function (pos, i, r) {
      if (i === 3 && _count(r, 'QB') === 0) return pos === 'QB';
      return true;
    },
  };

  /**
   * Score every doctrine against the live board.
   *
   * entries    scored board rows ([{player}] — the engine's `recommend` output)
   * opts.liveIndex  1-based index of MY picks (which live pick this is)
   * opts.roster     my current roster ([{position}]), keepers included
   * opts.dollarsOf  player -> E[$] (the engine's playerDollars(...).total)
   * opts.keys       doctrines to score (defaults to all)
   *
   * Returns {key: dollars}. A doctrine whose constraint leaves NOTHING on the
   * board falls back to unconstrained — the Lab does the same, and a doctrine
   * that cannot be executed should read as "no cost", not as a fake $0 cliff.
   */
  function scoreBoard(entries, opts) {
    opts = opts || {};
    const rows = entries || [];
    const dollarsOf = opts.dollarsOf || function () { return 0; };
    const i = opts.liveIndex == null ? 1 : opts.liveIndex;
    const roster = opts.roster || [];
    const keys = opts.keys || Object.keys(LIVE_CONSTRAINTS);
    const priced = rows.map(function (e) {
      const p = e.player || e;
      return { position: p.position, dollars: dollarsOf(p) };
    });
    const bestOf = function (list) {
      return list.reduce(function (m, r) { return r.dollars > m ? r.dollars : m; }, -Infinity);
    };
    const unconstrained = priced.length ? bestOf(priced) : 0;
    const out = {};
    keys.forEach(function (k) {
      const allow = LIVE_CONSTRAINTS[k];
      if (!allow || !priced.length) { out[k] = round2(unconstrained); return; }
      const pool = priced.filter(function (r) { return allow(r.position, i, roster); });
      out[k] = round2(pool.length ? bestOf(pool) : unconstrained);
    });
    return out;
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /** Rank a {key: dollarScore} map high→low into [{...meta, score}]. */
  function rankDoctrines(scoresByKey) {
    return Object.keys(scoresByKey || {})
      .map(function (k) { return Object.assign({}, doctrineMeta(k), { score: scoresByKey[k] }); })
      .sort(function (a, b) { return b.score - a.score; });
  }

  /**
   * The state machine. Construct with the enrolled plan (the tournament's
   * Cory-conditional winner) and options; feed ranked doctrine scores per pick.
   */
  function DoctrineState(enrolledKey, opts) {
    opts = opts || {};
    this.noiseBand = opts.noiseBand == null ? DEFAULTS.noiseBand : opts.noiseBand;
    this.minPicks = opts.minPicks == null ? DEFAULTS.minPicks : opts.minPicks;
    this.current = enrolledKey;
    this._challenge = { key: null, picks: 0 };   // the pending challenger + its streak
    this.log = [];                                // per-pick doctrine state (for the ledger)
  }

  /**
   * Feed this pick's doctrine scores. Returns:
   *   { doctrine, creed, alternative, gap, switched, sentence, confidence }
   * `switched` is true on exactly the pick the hysteresis threshold is crossed.
   */
  DoctrineState.prototype.update = function (scoresByKey, pick, ctx) {
    const ranked = rankDoctrines(scoresByKey);
    const leader = ranked[0] || doctrineMeta(this.current);
    const curScore = (scoresByKey && scoresByKey[this.current] != null)
      ? scoresByKey[this.current] : (leader ? leader.score : 0);
    let switched = false;

    if (!leader || leader.key === this.current) {
      // The plan still leads. Reset any pending challenge.
      this._challenge = { key: null, picks: 0 };
    } else {
      const gap = leader.score - curScore;
      if (gap > this.noiseBand) {
        // A material lead. Count consecutive picks the SAME challenger holds it.
        if (this._challenge.key === leader.key) this._challenge.picks += 1;
        else this._challenge = { key: leader.key, picks: 1 };
        if (this._challenge.picks >= this.minPicks) {
          this.current = leader.key;
          this._challenge = { key: null, picks: 0 };
          switched = true;
        }
      } else {
        // Within the noise band — a flap, not a signal. Suppress.
        this._challenge = { key: null, picks: 0 };
      }
    }

    // The live alternative to display. Prefer one that would take a DIFFERENT
    // player — a doctrine scoring identically to the plan is not an alternative,
    // it is the same decision under another name, and showing "trails by $0"
    // reads as a contest when nothing is being contested. When every doctrine
    // ties, that is itself the finding: this pick is doctrine-neutral.
    const mine = scoresByKey && scoresByKey[this.current] != null ? scoresByKey[this.current] : curScore;
    const others = ranked.filter(function (d) { return d.key !== this.current; }, this);
    const differing = others.filter(function (d) { return Math.abs(d.score - mine) > 0.01; });
    const neutral = others.length > 0 && differing.length === 0;
    const alt = differing[0] || others[0] || null;
    const altGap = alt ? +(mine - alt.score).toFixed(2) : null;
    const cur = doctrineMeta(this.current);

    const out = {
      pick: pick,
      doctrine: cur.name,
      doctrine_key: cur.key,
      creed: cur.creed,
      alternative: alt ? alt.name : null,
      alternative_key: alt ? alt.key : null,
      // Positive = current leads the alternative by this much; negative = it trails.
      gap: altGap,
      // True when no doctrine would take a different player here — the plan is
      // not binding at this pick, so the choice is doctrine-free.
      neutral: neutral,
      switched: switched,
      confidence: this._confidence(pick, switched, alt, altGap, neutral),
      sentence: switched ? this._switchSentence(cur, scoresByKey, ctx) : null,
    };
    this.log.push({ pick: pick, doctrine: cur.key, alternative: out.alternative_key,
                    gap: altGap, switched: switched });
    return out;
  };

  DoctrineState.prototype._confidence = function (pick, switched, alt, altGap, neutral) {
    if (switched) return 'Doctrine switched — re-ranking';
    if (!alt) return 'Plan intact';
    // Checked BEFORE the band test: a $0 gap is inside the band arithmetically,
    // but "contested" would be a lie — nothing is competing, every doctrine
    // takes the same player. Saying so tells you this pick is a free one.
    if (neutral) return 'Plan not binding here — every doctrine takes the same player';
    if (altGap != null && altGap <= this.noiseBand) return 'Contested — alternative within the band';
    return 'Plan intact — on script';
  };

  DoctrineState.prototype._switchSentence = function (cur, scoresByKey, ctx) {
    const gain = ctx && ctx.projected != null
      ? ('this branch now projects +$' + Number(ctx.projected).toFixed(0))
      : 'this branch now leads';
    const cause = (ctx && ctx.cause) ? (ctx.cause + '; ') : '';
    return '⚡ SWITCHING TO ' + cur.name.toUpperCase() + ': ' + cause + gain
      + '. Paths re-ranked below.';
  };

  /**
   * The owner declined a switch: keep the PRIOR doctrine, record the override.
   * Returns a ledger record; the caller writes it through the override machinery.
   */
  DoctrineState.prototype.decline = function (priorKey, pick) {
    this.current = priorKey;
    this._challenge = { key: null, picks: 0 };
    const rec = { kind: 'doctrine_decline', pick: pick, kept: priorKey,
                  note: 'owner declined the doctrine switch; prior doctrine retained' };
    this.log.push(rec);
    return rec;
  };

  /**
   * Read the enrolled plan out of the artifact's `doctrine` block (build.py
   * stamps it from the Lab's `cory-conditional.json`). No block, or a block with
   * no winner, means NOTHING WAS ENROLLED — fall back to the control and say so.
   * The banner must never imply a verdict the Lab did not deliver.
   */
  function enrollment(block) {
    const b = block || {};
    if (!b.enrolled) {
      return { key: 'balanced', meta: doctrineMeta('balanced'), enrolled: false,
               edge: null, ci95: null, runner_up: null,
               note: 'no doctrine enrolled — running the control' };
    }
    const meta = doctrineMeta(b.enrolled);
    return { key: meta.key, meta: meta, enrolled: true,
             edge: b.edge == null ? null : Number(b.edge),
             ci95: b.ci95 || null,
             runner_up: b.runner_up ? doctrineMeta(b.runner_up) : null,
             runner_up_edge: b.runner_up_edge == null ? null : Number(b.runner_up_edge),
             rooms: b.rooms || null, source: b.source || null,
             note: null };
  }

  const api = { governs: governs, setGoverns: setGoverns,
                governanceLine: governanceLine,
                DOCTRINES: DOCTRINES, ALIASES: ALIASES, DEFAULTS: DEFAULTS,
                doctrineMeta: doctrineMeta, rankDoctrines: rankDoctrines,
                DoctrineState: DoctrineState, LIVE_CONSTRAINTS: LIVE_CONSTRAINTS,
                scoreBoard: scoreBoard, enrollment: enrollment,
                PREFERS: PREFERS, prefers: prefers };
  global.DraftDoctrine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
