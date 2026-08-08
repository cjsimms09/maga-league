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

  // Working doctrine set (final names come from the tournaments; creeds are the
  // one-line philosophy each executes). key is the machine id.
  const DOCTRINES = {
    hero_rb:    { key: 'hero_rb',    name: 'Hero-RB Continuation', creed: 'one anchor back, then hammer WR value' },
    wr_feast:   { key: 'wr_feast',   name: 'WR Feast',             creed: 'ride the value fall; TE and QB wait; ceiling in the flex' },
    elite_te:   { key: 'elite_te',   name: 'Elite-TE Anchor',      creed: 'pay for the last elite TE; the cliff pays it back' },
    early_qb:   { key: 'early_qb',   name: 'Early-QB Strike',      creed: 'take the rushing-QB edge before the room does' },
    ceiling:    { key: 'ceiling',    name: 'Ceiling Chase',        creed: 'high-variance builds; the weekly-high pool rewards booms' },
    balanced:   { key: 'balanced',   name: 'Balanced Value',       creed: 'best expected dollars available (the control)' },
  };

  const DEFAULTS = {
    noiseBand: 4.0,       // dollars; mirrors the engine's DG_NOISE_BAND even-money band
    minPicks: 2,          // consecutive picks the challenger must lead by > band to flip
  };

  function doctrineMeta(key) {
    return DOCTRINES[key] || { key: key, name: key, creed: '' };
  }

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

    // The live alternative to display: the top-ranked doctrine that isn't current.
    const alt = ranked.find(function (d) { return d.key !== this.current; }, this) || null;
    const altGap = alt ? +( (scoresByKey[this.current] != null ? scoresByKey[this.current] : curScore) - alt.score ).toFixed(2) : null;
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
      switched: switched,
      confidence: this._confidence(pick, switched, alt, altGap),
      sentence: switched ? this._switchSentence(cur, scoresByKey, ctx) : null,
    };
    this.log.push({ pick: pick, doctrine: cur.key, alternative: out.alternative_key,
                    gap: altGap, switched: switched });
    return out;
  };

  DoctrineState.prototype._confidence = function (pick, switched, alt, altGap) {
    if (switched) return 'Doctrine switched — re-ranking';
    if (!alt) return 'Plan intact';
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

  const api = { DOCTRINES: DOCTRINES, DEFAULTS: DEFAULTS, doctrineMeta: doctrineMeta,
                rankDoctrines: rankDoctrines, DoctrineState: DoctrineState };
  global.DraftDoctrine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
