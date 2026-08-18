// FORWARD-PREDICTION + DECISION GRADER (JS live path).
//
// The one score no backtest can produce: a forecast committed in writing, timestamped
// BEFORE the outcome exists, carries no researcher degree of freedom. This is the JS
// port of draft/backtest/forecast_grade.py (kept as the reference implementation) so the
// whole weekly loop lives in ONE runtime with direct Blobs access — no cross-runtime
// handoff. PURE: takes plain ledger dicts, returns a scorecard; never writes back into
// the ledger it reads (the contamination rule).
//
// THE FORWARD GUARANTEE, enforced not assumed: a forecast grades ONLY if its decision_at
// is strictly before its resolution's decision_at. A "forecast" written after reality is
// DISQUALIFIED, listed by key, so a backdated claim can never inflate the score.
//
// Grading:
//   probability  — Brier (p-outcome)^2 + a reliability table (the calibration curve)
//   point        — signed error + |error| (bias = mean signed)
//   categorical  — hit/miss (accuracy)
//   DECISIONS (#6) — recommendation vs pick (was the tool overridden?) and, where an
//     outcome is known, whether the override/recommendation won or lost. "Where Cory beat
//     the model" and "which recommendations lost money" — the most useful thing a season
//     teaches and the easiest to lose. Captured by predledger; graded here.

'use strict';

function ts(e) { return e && e.decision_at; }

function isForward(fc, res) {
  const a = ts(fc), b = ts(res);
  return Boolean(a) && Boolean(b) && a < b;   // fail closed: missing stamp => not forward
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Join forecasts to resolutions by key. Keep the EARLIEST commitment per key (a later
// re-commit can never move the stamp closer to reality). Returns {pairs, pending, orphans}.
function pair(forecasts, resolutions) {
  const byKey = {};
  for (const f of forecasts) {
    const k = (f.payload || {}).key;
    if (!k) continue;
    const prev = byKey[k];
    if (!prev || (f.decision_at || '') < (prev.decision_at || '')) byKey[k] = f;
  }
  const resByKey = {};
  for (const r of resolutions) {
    const k = (r.payload || {}).forecast_key;
    if (k && !(k in resByKey)) resByKey[k] = r;   // first resolution wins (append-only)
  }
  const pairs = [], orphans = [];
  for (const [k, r] of Object.entries(resByKey)) {
    if (k in byKey) pairs.push([byKey[k], r]); else orphans.push(k);
  }
  const pending = Object.keys(byKey).filter(k => !(k in resByKey));
  return { pairs, pending, orphans };
}

function reliabilityTable(probPoints, bins = 10) {
  const buckets = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, hits: 0 }));
  for (const [p, o] of probPoints) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    buckets[idx].n += 1;
    buckets[idx].hits += o >= 0.5 ? 1 : 0;
  }
  return buckets.map(b => {
    const mid = Math.round(((b.lo + b.hi) / 2) * 100) / 100;
    const rate = b.n ? Math.round((b.hits / b.n) * 1000) / 1000 : null;
    return {
      bucket: `${Math.round(b.lo * 100)}-${Math.round(b.hi * 100)}%`,
      predicted_mid: mid, n: b.n, observed_rate: rate,
      error: rate === null ? null : Math.round((rate - mid) * 1000) / 1000,  // + = too pessimistic
    };
  });
}

const mean = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4 : null);

// Grade forecast/forecast_resolution entries. Mirrors forecast_grade.py:grade().
function gradeForecasts(entries) {
  const forecasts = entries.filter(e => e.kind === 'forecast');
  // DECISION resolutions (realized_chosen/realized_counterfactual, written by
  // buildInseasonResolutions for the in-season decision kinds) share the
  // forecast_resolution KIND but resolve decisions, not forecasts — their keys
  // never have a forecast to pair with, and counting them here would grow
  // `orphan_resolution_keys` by one per graded decision, making a healthy
  // weekly loop read as a pile of orphaned forecasts. They are gradeDecisions'
  // input, and are excluded from the forecast join by their own shape.
  const resolutions = entries.filter(e => e.kind === 'forecast_resolution'
    && (e.payload || {}).realized_chosen === undefined);
  const { pairs, pending, orphans } = pair(forecasts, resolutions);

  const graded = [], disqualified = [];
  const probPoints = [], brierTerms = [], pointSigned = [], pointAbs = [];
  let catHits = 0, catN = 0;

  for (const [fc, res] of pairs) {
    if (!isForward(fc, res)) {
      disqualified.push({ key: (fc.payload || {}).key, reason: 'not forward: decision_at not strictly before resolution', forecast_at: ts(fc), resolved_at: ts(res) });
      continue;
    }
    const p = fc.payload || {};
    const outcome = (res.payload || {}).outcome;
    const rec = { key: p.key, ftype: p.ftype, claim: p.claim, value: p.value, outcome, method: fc.method, forecast_at: ts(fc) };
    if (p.ftype === 'probability') {
      const pv = num(p.value), ov = num(outcome);
      if (pv === null || ov === null) { disqualified.push({ key: p.key, reason: 'non-numeric probability/outcome' }); continue; }
      const o01 = ov >= 0.5 ? 1 : 0;
      const brier = (pv - o01) ** 2;
      rec.brier = Math.round(brier * 1e4) / 1e4; brierTerms.push(brier); probPoints.push([pv, o01]);
    } else if (p.ftype === 'point') {
      const pv = num(p.value), ov = num(outcome);
      if (pv === null || ov === null) { disqualified.push({ key: p.key, reason: 'non-numeric point/outcome' }); continue; }
      const err = pv - ov;
      rec.error = Math.round(err * 1e3) / 1e3; rec.abs_error = Math.round(Math.abs(err) * 1e3) / 1e3;
      pointSigned.push(err); pointAbs.push(Math.abs(err));
    } else if (p.ftype === 'categorical') {
      const hit = String(p.value) === String(outcome) ? 1 : 0;
      rec.hit = Boolean(hit); catHits += hit; catN += 1;
    } else {
      disqualified.push({ key: p.key, reason: `unknown ftype ${JSON.stringify(p.ftype)}` }); continue;
    }
    graded.push(rec);
  }

  return {
    n_forecasts: forecasts.length, n_resolved: pairs.length, n_graded: graded.length,
    n_pending: pending.length, n_disqualified: disqualified.length,
    pending_keys: pending, orphan_resolution_keys: orphans, disqualified,
    probability: { n: probPoints.length, brier: mean(brierTerms), reliability: probPoints.length ? reliabilityTable(probPoints) : [] },
    point: { n: pointSigned.length, bias: mean(pointSigned), mae: mean(pointAbs) },
    categorical: { n: catN, accuracy: catN ? Math.round((catHits / catN) * 1000) / 1000 : null },
    graded,
  };
}

// #6 — grade the DECISION kinds. predledger stamps `recommendation` (what the tool said),
// `pick` (what was actually taken, a separate later entry joined by key), and `override`
// (an explicit "I went another way"). This computes, per decision key: was the tool
// followed or OVERRIDDEN, and — where an outcome entry exists — did the taken choice beat
// the recommended one (so "where Cory beat the model" and "recs that lost money" are real,
// not anecdotal). Outcome join is by payload.key -> a resolution/outcome carrying `realized`.
/* ── THE IN-SEASON KINDS JOIN DIFFERENTLY, AND THAT IS THE WHOLE EXTENSION ──
 *
 * `src/routes/accuracy.js` has carried the read side for these since it was
 * written, with its labels deliberately inert and a `PENDING_KINDS` list so the
 * table "cannot quietly look like it covers decisions it does not". Its comment
 * names the blocker: *"that extension is A's, and is parked."* This is it.
 *
 * A DRAFT decision is a PAIR — `recommendation` says one thing, `pick` records
 * another, and the join discovers whether they differed. An IN-SEASON decision
 * is a SINGLE entry that already contains both sides, because `predledger`
 * REFUSES to store one without `payload.counterfactual` ("what I would plausibly
 * have done without the tool"). So they need no pairing, and pretending they do
 * would drop every one of them for lacking a partner that cannot exist.
 *
 * ⚠ COUNTED SEPARATELY, DELIBERATELY. `override_rate` today means "of the DRAFT
 * decisions, how often did Cory go another way". Folding start/sit calls into
 * the same numerator would leave the name unchanged while the quantity became
 * something else — the defect this project keeps finding. In-season decisions
 * get their own counts, and a reader can add them up on purpose if they want to.
 */
const INSEASON_DECISION_KINDS = ['lineup_call', 'waiver_claim', 'stream_call',
                                 'trade_eval', 'inseason_override'];

/* THE JOIN KEY OF AN IN-SEASON DECISION — one definition, used by BOTH the
 * grader (below) and every resolver, because two independent derivations of
 * "which resolution belongs to which decision" is how a loop reads closed in
 * the code and stays empty in the data.
 *
 * FOUND 2026-08-15 (the commissioner's full-verification pass): the REAL
 * capture routes (src/routes/member.js — /lineup/log, /waivers/log,
 * /stream/log and the three overrides) never wrote a payload.key at all.
 * Every test fixture had one ('w1'), so the resolver and grader looked closed
 * — and a real captured decision would have had key === undefined, been
 * SKIPPED by buildInseasonResolutions, and joined to nothing, forever. The
 * fixture shape hid exactly the field the real shape lacked, the same class
 * as the chosen/recommended field miss this file already records above.
 *
 * Two-part fix: the routes now write a deterministic payload.key, AND this
 * fallback uses the ledger entry's own id (unique per entry, stamped by
 * predledger at append) so entries captured BEFORE the route fix — and any
 * future capture that forgets a key — still close the loop instead of
 * silently never resolving. */
function decisionJoinKey(e) {
  const p = (e && e.payload) || {};
  return p.key || e.id || null;
}

function gradeDecisions(entries) {
  const recs = {}, picks = {}, overrides = {}, outcomes = {};
  const inseason = [];
  for (const e of entries) {
    const p = e.payload || {};
    if (INSEASON_DECISION_KINDS.indexOf(e.kind) >= 0) inseason.push(e);
    // decision entries join on payload.key; outcome/resolution entries join on
    // payload.forecast_key (they carry no `key` of their own) — routing on kind first
    // so a resolution is never skipped for lacking a `key` (the bug this fixes).
    if (e.kind === 'recommendation') { if (p.key) recs[p.key] = e; }
    else if (e.kind === 'pick') { if (p.key) picks[p.key] = e; }
    else if (e.kind === 'override') { if (p.key) overrides[p.key] = e; }
    else if (e.kind === 'forecast_resolution' || p.realized !== undefined
             || p.realized_taken !== undefined) {
      const ok = p.forecast_key || p.key;
      if (ok) outcomes[ok] = e;
    }
  }
  const rows = [];
  let overridden = 0, followed = 0, cory_beat = 0, model_beat = 0, scored = 0;
  for (const k of Object.keys(recs)) {
    const rec = recs[k], pick = picks[k], ov = overrides[k];
    const recommended = (rec.payload || {}).value ?? (rec.payload || {}).recommended;
    const taken = pick ? ((pick.payload || {}).value ?? (pick.payload || {}).player_id) : undefined;
    const wasOverride = Boolean(ov) || (taken !== undefined && recommended !== undefined && String(taken) !== String(recommended));
    if (wasOverride) overridden += 1; else if (taken !== undefined) followed += 1;
    const row = { key: k, recommended, taken, overridden: wasOverride, decision_at: ts(rec) };
    // outcome scoring where reality is known: realized value of the taken vs the recommended
    const out = outcomes[k] && (outcomes[k].payload || {});
    if (out && out.realized_taken !== undefined && out.realized_recommended !== undefined) {
      const rt = num(out.realized_taken), rr = num(out.realized_recommended);
      if (rt !== null && rr !== null) {
        row.realized_taken = rt; row.realized_recommended = rr; row.edge = Math.round((rt - rr) * 100) / 100;
        scored += 1;
        if (wasOverride) { if (rt > rr) cory_beat += 1; else if (rr > rt) model_beat += 1; }
      }
    }
    rows.push(row);
  }
  /* ── IN-SEASON DECISIONS: one entry, both sides, outcome joined by key ──── */
  const inRows = [];
  let inScored = 0, inToolWon = 0, inCfWon = 0;
  /* inseason_override rows are tallied SEPARATELY (2026-08-15). Their `chosen`
   * side is the HUMAN's action and their counterfactual is the TOOL's rejected
   * recommendation — the mirror image of every other in-season kind, where
   * `chosen` IS the tool's call. Counting an override's chosen-side win into
   * `tool_won` would credit the tool with the human's win: the name would stay
   * and the quantity would become something else, the defect this file's own
   * header warns about. So overrides get their own pair of counters and never
   * touch tool_won / counterfactual_won. */
  let ovHumanWon = 0, ovToolWon = 0;
  const byKind = {};
  /* ONE ROW PER DECISION KEY, earliest commitment wins — the same rule pair()
   * applies to forecasts, for the same reason. The capture routes mint
   * DETERMINISTIC keys (surface|season|week|owner[|subject]) precisely so a
   * double-tap of the same form is the same decision; without this dedupe each
   * tap became its own row and every one of them joined the SAME resolution,
   * double-counting the decision in scored/tool_won (caught by
   * loop_closure_live.test.js driving two taps through the real routes).
   * Entries without a key fall back to their unique ledger id, so nothing
   * distinct is ever merged. Dropped duplicates are COUNTED, not hidden. */
  const seen = {};
  let dupes = 0;
  const deduped = [];
  for (const e of inseason) {
    const k = decisionJoinKey(e);
    if (k == null) { deduped.push(e); continue; }
    const prev = seen[k];
    if (prev === undefined) { seen[k] = deduped.length; deduped.push(e); }
    else {
      dupes += 1;
      if ((ts(e) || '') < (ts(deduped[prev]) || '')) deduped[prev] = e;
    }
  }
  for (const e of deduped) {
    const p = e.payload || {};
    const k = decisionJoinKey(e);
    const out = (k && outcomes[k] && (outcomes[k].payload || {})) || p;
    const row = {
      kind: e.kind, key: k, decision_at: ts(e),
      // The week the decision was about, carried so per-week aggregates do not
      // have to re-open the payload (and so the read side can show "week 3").
      week: p.week != null ? Number(p.week) : null,
      // FIXED 2026-08-15: `p.recommended` is `lineup_call`'s real field name
      // (src/routes/member.js's /lineup/log route) -- this used to read only
      // chosen/value/player_id, none of which that route ever writes, so a
      // real lineup_call always graded chosen: null and could never be
      // scored even once an outcome existed. Found by reproducing the real
      // capture payload against this function directly, not by reading the
      // route and assuming. `p.chosen` still wins when present (waiver_claim
      // already writes it correctly) so this is purely additive.
      chosen: p.chosen ?? p.value ?? p.player_id ?? p.recommended ?? null,
      // The counterfactual is REQUIRED by predledger, so its absence here means
      // an entry got in before that guard existed — reported, not defaulted.
      counterfactual: p.counterfactual ?? null,
      counterfactual_missing: p.counterfactual === undefined || p.counterfactual === null,
    };
    // Outcome scoring, same shape as the draft side: realized value of what was
    // done against realized value of what we would have done instead.
    const rt = num(out.realized_chosen ?? out.realized_taken);
    const rc = num(out.realized_counterfactual ?? out.realized_recommended);
    if (rt !== null && rc !== null) {
      row.realized_chosen = rt; row.realized_counterfactual = rc;
      row.edge = Math.round((rt - rc) * 100) / 100;
      inScored += 1;
      if (e.kind === 'inseason_override') {
        // chosen = the human's actual action; counterfactual = the tool's call.
        if (rt > rc) ovHumanWon += 1; else if (rc > rt) ovToolWon += 1;
      } else {
        if (rt > rc) inToolWon += 1; else if (rc > rt) inCfWon += 1;
      }
    }
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    inRows.push(row);
  }

  return {
    n_decisions: Object.keys(recs).length, followed, overridden, scored,
    // among scored OVERRIDES: how often the human's different choice actually won
    cory_beat_model: cory_beat, model_beat_cory: model_beat,
    override_rate: (followed + overridden) ? Math.round((overridden / (followed + overridden)) * 1000) / 1000 : null,
    rows,
    /* SEPARATE BLOCK, SEPARATE NAMES. Nothing above changes value when in-season
     * rows arrive — `override_rate` still means what it has always meant. */
    inseason: {
      n: inRows.length, by_kind: byKind, scored: inScored,
      // Non-override kinds only — chosen is the TOOL's call for these.
      tool_won: inToolWon, counterfactual_won: inCfWon,
      // inseason_override rows only — chosen is the HUMAN's action, so a
      // chosen-side win here is the human beating the tool, never the reverse.
      override_human_won: ovHumanWon, override_tool_won: ovToolWon,
      // The edge only means something over the SCORED subset; reporting it over
      // all rows would silently treat "not yet resolved" as "no edge".
      // NOTE the sign convention is per-row ("the decision as recorded beat its
      // recorded alternative"), so for override rows a positive edge is the
      // HUMAN's win — read the split tallies above, not this pooled number,
      // when asking who beat whom.
      mean_edge: inScored
        ? Math.round((inRows.filter(r => r.edge != null)
          .reduce((s, r) => s + r.edge, 0) / inScored) * 100) / 100 : null,
      missing_counterfactual: inRows.filter(r => r.counterfactual_missing).length,
      // Same-key duplicate captures dropped by the dedupe above — reported so
      // a double-tap is visible in the record rather than silently absorbed.
      duplicates: dupes,
      rows: inRows,
    },
  };
}

// Reused from forecast_grade.py:build_resolutions — draft-time forecasts resolve off the
// finished board. In-season resolutions come from the weekly score path (added there).
function buildDraftResolutions(forecasts, draft) {
  const picks = (draft && draft.picks) || [];
  const atOverall = {}, draftedBefore = {}, taken = new Set();
  for (const p of [...picks].sort((a, b) => (a.overall || 0) - (b.overall || 0))) {
    const ov = p.overall, pid = String(p.player_id);
    draftedBefore[ov] = new Set(taken); atOverall[ov] = pid; taken.add(pid);
  }
  const overalls = Object.keys(atOverall).map(Number);
  const maxOverall = overalls.length ? Math.max(...overalls) : 0;
  const out = [];
  for (const f of forecasts) {
    const key = (f.payload || {}).key || '';
    if (key.startsWith('room_seat:r1p')) {
      const seat = parseInt(key.split('r1p')[1], 10);
      if (Number.isFinite(seat) && atOverall[seat] !== undefined) {
        out.push({ kind: 'forecast_resolution', method: 'forecast-resolution-v1', payload: { forecast_key: key, outcome: atOverall[seat], source: 'completed draft' } });
      }
    } else if (key.startsWith('survival:') && key.includes('@pick')) {
      const [pid, tail] = key.slice('survival:'.length).split('@pick');
      const npk = parseInt(tail, 10);
      if (Number.isFinite(npk) && npk <= maxOverall) {
        const survived = !(draftedBefore[npk] && draftedBefore[npk].has(pid));
        out.push({ kind: 'forecast_resolution', method: 'forecast-resolution-v1', payload: { forecast_key: key, outcome: survived ? 1 : 0, source: 'completed draft' } });
      }
    }
  }
  return out;
}

// THE PIECE inseason_decisions.test.js's own closing note said did not exist:
// "In-season resolutions come from the weekly score path (added there)" was
// aspirational when it was written -- nothing implemented it. Built 2026-08-15,
// directly requested rather than left flagged: gradeDecisions() has correctly
// graded in-season decisions since inseason_decisions.test.js landed, but
// nothing ever produced the forecast_resolution entries it joins against, so
// every in-season row has sat permanently unscored regardless of the field-name
// fix above.
//
// SCOPED TO lineup_call ONLY, deliberately. It is the one in-season kind whose
// capture (src/routes/member.js's /lineup/log) is unambiguous: payload.recommended
// and payload.counterfactual are each a REAL, COMPLETE, DISTINCT lineup ([{id,
// name, pos, proj}, ...] -- views/lineup.ejs's own hidden-field shape), and
// resolving "did this decision beat the alternative" is exactly "sum each
// named player's REAL points that week for each lineup and diff them" -- the
// same computation draft/tools/lineup_edge_backtest.js already does in
// aggregate, applied per-decision instead.
//
// EXTENDED 2026-08-15 (the commissioner's full-verification pass): originally
// scoped to lineup_call only, with the comment here naming why waiver_claim /
// stream_call / inseason_override were excluded. Each exclusion has now been
// answered with a designed rule rather than left flagged:
//
//   stream_call — the easy one, and it resolves the way its capture is shaped
//     (src/routes/member.js /stream/log): `chosen` and `counterfactual` are
//     each a single player object ({id|player_id, name, pos, ...}), or the
//     counterfactual is the "no current K/DEF on roster" note object, meaning
//     the alternative to streaming was an EMPTY slot that scores 0. Realized
//     value = that player's real points in the decision's week.
//
//   waiver_claim — the counterfactual is the literal string 'hold priority'
//     (deliberate: the page's own design says the real alternative is waiting,
//     not a specific other player), so the realized comparison needs a WINDOW
//     and a BASELINE, both chosen from the league's own history rather than
//     taste — see WAIVER_WINDOW_WEEKS below and the rule at the waiver branch.
//
//   inseason_override — resolvable ONLY when the capture recorded what the
//     human actually did (`payload.actual`, added to the override routes the
//     same day). Entries from before that fix carry recommended ===
//     counterfactual and nothing else; there is nothing honest to sum for
//     them and they stay unresolved, reported as pending rather than zero.
//
// weeklyPoints: {week: {player_id: points}} -- REAL points, however sourced.
// Deliberately decoupled from any specific feed (weekly_realized.json does not
// exist yet; no season has been played). Proven against real HISTORICAL data
// in the test files rather than only synthetic fixtures, exactly the
// leak-free-backtest discipline this session used throughout, so the mechanism
// is validated before the live data it needs even exists.
//
// A PLAYER WITH NO ROW IN AN EXISTING WEEK CONTRIBUTES 0, DELIBERATELY — and
// this is a DIFFERENT convention from draft/tools/wire_level.js's "absent,
// never 0.0", for a reason worth stating: wire_level measures what the SHELF
// pays (a stashed rookie who never played must not drag the shelf's level
// down), while this grades what a DECISION DELIVERED to the roster that made
// it — a claimed or started player who did not play delivered nothing to the
// lineup, and grading that as anything but 0 would flatter every bust.
// A WEEK with no data at all is still absent-not-zero: no resolution is
// emitted until the week's real points exist.

/* THE WAIVER WINDOW, measured from this league's own transactions rather than
 * chosen by taste (2026-08-15, draft/data/league_history.json, 2023-25):
 * of 764 completed waiver/free-agent adds, 559 were later dropped by the
 * roster that made them, with a MEDIAN HOLD OF 1 WEEK (mean 2.0; distribution
 * mode 1); including the 205 never-dropped adds censored at their season's
 * last transaction week, the all-adds median is 2 weeks — a lower bound,
 * since censoring can only understate. So the median real claim's tenure is
 * its add week plus roughly one to two more, and a 3-week window (add week w,
 * w+1, w+2) covers it — and deliberately matches wire_level.js's `ongoing`
 * 3-week convention so the toolset carries ONE window, not two. Re-derive:
 * draft/tests/waiver_stream_resolution.test.js measures it fresh from the
 * same file and pins this constant to the measurement. */
const WAIVER_WINDOW_WEEKS = 3;

function pidOf(o) {
  if (!o || typeof o !== 'object') return null;
  const id = o.id != null ? o.id : o.player_id;
  return id == null ? null : String(id);
}

function buildInseasonResolutions(entries, weeklyPoints, opts) {
  const o = opts || {};
  const wp = weeklyPoints || {};
  const out = [];
  const weekPts = w => wp[String(w)] || null;
  // Delivered points: 0 when the player has no row in a week that EXISTS.
  const delivered = (pts, pid) => {
    const v = num(pts[String(pid)]);
    return v == null ? 0 : v;
  };
  const r2 = v => Math.round(v * 100) / 100;
  // ONE resolution per key per pass: duplicate same-key captures (a double-tap
  // — the routes mint deterministic keys precisely so a repeat is the same
  // decision) must not each mint a resolution, or the append-only ledger
  // accretes identical resolutions the joins then tiebreak silently.
  const emitted = new Set();
  const push = (key, chosen, cf, source) => {
    if (emitted.has(String(key))) return;
    emitted.add(String(key));
    return out.push({
    kind: 'forecast_resolution', method: 'inseason-resolution-v1',
    payload: { forecast_key: key, realized_chosen: r2(chosen),
      realized_counterfactual: r2(cf),
      // predledger's assertForecast REFUSES a forecast_resolution without an
      // `outcome` (found 2026-08-15 by driving these through the REAL append
      // path — the resolver's first output shape would have thrown on every
      // live write and the weekly cron would have resolved nothing, forever).
      // The realized edge IS this resolution's outcome, so it carries it.
      outcome: r2(chosen - cf),
      source },
    });
  };
  // Realized value of one "side" of a decision in one week's real points:
  // an array is a lineup (sum), an object with an id is a player, an object
  // WITHOUT an id is the recorded empty-slot note (worth 0 — not streaming
  // with no rostered K/DEF means the slot scores nothing). Anything else
  // (a string, null) has no honest number and returns null = do not resolve.
  const sideValue = (side, pts) => {
    if (Array.isArray(side)) {
      return side.reduce((s, pl) => s + delivered(pts, pidOf(pl) || ''), 0);
    }
    if (side && typeof side === 'object') {
      const pid = pidOf(side);
      if (pid) return delivered(pts, pid);
      return 0;                       // the {note: 'no current X on roster'} shape
    }
    return null;
  };

  for (const e of entries) {
    const p = e.payload || {};
    const key = decisionJoinKey(e);
    const week = p.week;
    if (!key || week == null) continue;               // cannot join without both

    if (e.kind === 'lineup_call') {
      const pts = weekPts(week);
      if (!pts) continue;                              // week not yet resolvable -- not a zero
      const rec = Array.isArray(p.recommended) ? p.recommended : null;
      const cf = Array.isArray(p.counterfactual) ? p.counterfactual : null;
      if (!rec || !cf) continue;                       // not the lineup-array shape this resolves
      push(key, sideValue(rec, pts), sideValue(cf, pts), 'weekly realized points');

    } else if (e.kind === 'stream_call') {
      const pts = weekPts(week);
      if (!pts) continue;
      const chosen = sideValue(p.chosen, pts);
      const cf = sideValue(p.counterfactual, pts);
      if (chosen == null || cf == null) continue;      // a string/absent side has no honest number
      const cfEmpty = !(p.counterfactual && pidOf(p.counterfactual));
      push(key, chosen, cf, cfEmpty
        ? 'weekly realized points; counterfactual slot was empty (0 by construction)'
        : 'weekly realized points, chosen vs held');

    } else if (e.kind === 'inseason_override') {
      // Only the post-fix capture shape resolves: payload.actual is what the
      // human actually did (lineup array or single player), and the honest
      // comparison is actual vs the tool's recommendation. Pre-fix entries
      // (recommended duplicated into counterfactual, no actual) stay pending.
      const pts = weekPts(week);
      if (!pts) continue;
      const actual = sideValue(p.actual, pts);
      const rec = sideValue(p.recommended, pts);
      if (actual == null || rec == null || p.actual == null) continue;
      push(key, actual, rec, 'weekly realized points, human actual vs tool recommendation');

    } else if (e.kind === 'waiver_claim') {
      /* THE RULE, stated in full so a null can never be reinterpreted:
       * realized_chosen = the claimed player's real points summed over the
       * WAIVER_WINDOW_WEEKS-week window starting at the add week (clipped to
       * opts.finalWeek when the season ends first). realized_counterfactual =
       *   (a) when the capture recorded a dropped player: THAT player's real
       *       points over the same window — the actual roster delta of making
       *       the claim, measured, not modelled; else
       *   (b) the wire's own realized level for the claimed position over the
       *       same window (opts.wire: add week at wire.per_week, later weeks
       *       at wire.ongoing_per_week — wire_level.js's measured "what a
       *       typical add pays in its add week / while held" pair). The graded
       *       question is then "did this claim beat the median wire add",
       *       which is answerable; "was claiming better than holding priority
       *       in expectation" is NOT — priority position, FAAB-style pricing
       *       and the option value of waiting are all unmodelled, and that
       *       limitation rides with every number this branch produces.
       * Positions with no wire sample (K/DEF: nflverse is offence-only) and
       * captures with neither a drop nor a wire baseline stay UNRESOLVED —
       * reported pending, never defaulted. */
      const w0 = Number(week);
      if (!Number.isFinite(w0)) continue;
      const wEnd = Math.min(w0 + WAIVER_WINDOW_WEEKS - 1,
        o.finalWeek != null ? Number(o.finalWeek) : Infinity);
      if (wEnd < w0) continue;
      const window = [];
      let complete = true;
      for (let w = w0; w <= wEnd; w++) {
        const pts = weekPts(w);
        if (!pts) { complete = false; break; }
        window.push(pts);
      }
      if (!complete) continue;                         // window not fully played -- pending, not zero
      const chosenPid = pidOf(p.chosen);
      if (!chosenPid) continue;
      const chosen = window.reduce((s, pts) => s + delivered(pts, chosenPid), 0);
      const dropPid = pidOf(p.drop);
      if (dropPid) {
        const cf = window.reduce((s, pts) => s + delivered(pts, dropPid), 0);
        push(key, chosen, cf,
          `claim window w${w0}-w${wEnd} vs the dropped player (real roster delta; priority cost unmodelled)`);
      } else {
        const wire = o.wire || null;
        const pos = p.chosen && p.chosen.pos;
        const perWeek = wire && wire.per_week && num(wire.per_week[pos]);
        if (perWeek == null) continue;                 // no wire sample (e.g. K/DEF) -- honest pending
        const ongoing = (wire.ongoing_per_week && num(wire.ongoing_per_week[pos]));
        const later = ongoing == null ? perWeek : ongoing;
        const cf = perWeek + later * (window.length - 1);
        push(key, chosen, cf,
          `claim window w${w0}-w${wEnd} vs the wire's realized ${pos} median over the same window `
          + '(add week at per_week, held weeks at ongoing; priority cost unmodelled)');
      }
    }
  }
  return out;
}

/* Which in-season decision entries still lack a resolution — the dedupe the
 * weekly resolver needs, since predledger is append-only and re-emitting a
 * resolution every Sunday would stack duplicates the graders then tiebreak
 * silently. Pure: pass the whole ledger, get back only the decision entries
 * whose join key has no forecast_resolution yet. */
function unresolvedDecisionEntries(entries) {
  const resolved = new Set();
  for (const e of entries || []) {
    if (e.kind === 'forecast_resolution') {
      const k = (e.payload || {}).forecast_key;
      if (k) resolved.add(String(k));
    }
  }
  return (entries || []).filter(e =>
    INSEASON_DECISION_KINDS.indexOf(e.kind) >= 0
    && decisionJoinKey(e) != null
    && !resolved.has(String(decisionJoinKey(e))));
}

/* ── PER-KIND / PER-WEEK AGGREGATES for the read side ("evaluated for future
 * edge identification"). accuracy.js's byKindRows reads a calibration doc's
 * `by_kind` map; these produce the in-season half of it from gradeDecisions'
 * own output, so the numbers on the page are the numbers the grader computed
 * — never a second derivation that can drift.
 *
 * `accuracy` here = share of SCORED rows where the recorded decision beat its
 * recorded alternative (for overrides: the human beat the tool — the split
 * whose sign convention is documented on the tallies above). `mean_edge` is
 * in real points over the scored subset. n counts CAPTURED rows so the page
 * can show "5 logged, 2 scored" honestly. */
function decisionByKind(decisions) {
  const rows = ((decisions || {}).inseason || {}).rows || [];
  const out = {};
  for (const r of rows) {
    const b = out[r.kind] || (out[r.kind] = { n: 0, scored: 0, wins: 0, edges: [] });
    b.n += 1;
    if (r.edge != null) {
      b.scored += 1;
      b.edges.push(r.edge);
      if (r.edge > 0) b.wins += 1;
    }
  }
  const res = {};
  for (const k of Object.keys(out)) {
    const b = out[k];
    res[k] = {
      n: b.n, scored: b.scored,
      accuracy: b.scored ? Math.round((b.wins / b.scored) * 1000) / 1000 : null,
      mean_edge: b.scored
        ? Math.round((b.edges.reduce((s, v) => s + v, 0) / b.scored) * 100) / 100 : null,
    };
  }
  return res;
}

function decisionByWeek(decisions) {
  const rows = ((decisions || {}).inseason || {}).rows || [];
  const byWeek = {};
  for (const r of rows) {
    if (r.week == null) continue;
    const b = byWeek[r.week] || (byWeek[r.week] = { week: r.week, n: 0, n_graded: 0, edges: [] });
    b.n += 1;
    if (r.edge != null) { b.n_graded += 1; b.edges.push(r.edge); }
  }
  return Object.values(byWeek)
    .sort((a, b) => a.week - b.week)
    .map(b => ({ week: b.week, n: b.n, n_graded: b.n_graded,
      mean_edge: b.n_graded
        ? Math.round((b.edges.reduce((s, v) => s + v, 0) / b.n_graded) * 100) / 100 : null }));
}

module.exports = { gradeForecasts, gradeDecisions, INSEASON_DECISION_KINDS,
  buildDraftResolutions, buildInseasonResolutions, unresolvedDecisionEntries,
  decisionJoinKey, decisionByKind, decisionByWeek, WAIVER_WINDOW_WEEKS,
  pair, reliabilityTable, isForward };
