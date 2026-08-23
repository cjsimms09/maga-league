// TERRITORY: A
/* POSITION BOARDS — top N at every position, with when-gone and when-to-strike.
 *
 * Cory, 2026-08-19: "you aren't making 1 recommended pick anymore. You're
 * giving me top 5-10 at each position (more on RB and WR) and showing me
 * projected vona drop offs by other team remaining needs and projections of
 * when gone. This helps me determine when to strike on certain positions.
 * Wouldn't mind little notes from model like maybe take QB here or wait on QB
 * here."
 *
 * So this emits ONE recommendation for nothing. Per position, per pick:
 *
 *   - the top N (10 for RB/WR, 6 for QB/TE, 4 for K/DEF)
 *   - P(still there at your NEXT pick), from 300 simulated rooms
 *   - the VONA drop-off, and WHERE the cliff is inside the list
 *   - a plain-English note: strike, or wait, and why
 *
 * ⚠️ THE SURVIVAL NUMBER HERE IS ADP-DRAIN ONLY. The live war room has a far
 * better one -- `survival.js` composes ADP with opponent-need Layer 2 from
 * `opponent_need_2026.json` -- but it needs live draft context (who has picked,
 * what they still need) that does not exist offline. THE WAR ROOM MUST OVERRIDE
 * THIS FIELD WITH THE LIVE ONE. It is here so the view has something to render
 * before the draft starts, and it is labelled in the artifact so nobody mistakes
 * it for the opponent-aware number.
 *
 * Projections/floor/ceiling: Draft Sharks. ADP/adp_sd: our board.
 * REPORT ONLY. Writes public/position_boards.json for the war room to read.
 *
 * Run: node draft/tools/position_boards.js [--rooms 300] [--a 0]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TOPN = { RB: 10, WR: 10, QB: 6, TE: 6, K: 4, DEF: 4 };   // Cory: "more on RB and WR"
/* ── THE WAIVER BASELINE IS DERIVED NOW, AND IT FOLLOWS THE SOURCE ─────────
 *
 * Cory, 2026-08-21: *"we need to fix wire logic! should we use last few years
 * of draft to determine how many at each position are rostered/drafted then use
 * that to compare waiver wire"* and *"it should also change with each source
 * probably?"*
 *
 * This line was `{ QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6,
 * DEF: 100.0 }` — six literals, duplicated verbatim in `vona_board.js:41` and
 * `mlv.js:84`. `mlv.js` states where they came from and it is ALREADY Cory's
 * method (the (N+1)-th best at each position, N = how many this room takes), so
 * what was wrong was not the arithmetic but that it ran ONCE: never recomputed,
 * frozen to one source, and copy-pasted into three files free to drift.
 *
 * `draft/tools/waiver_baseline.js` recomputes both halves and the split is the
 * whole point — the COUNT is a fact about this league (source-independent,
 * from three seasons of `final_rosters`), the VALUE is that source's own
 * opinion of the (count+1)-th man. Which is exactly why the chip must follow
 * the toggle: the count does not move, the price does.
 *
 * FALLBACK IS THE OLD CONSTANT, NOT A CRASH, and it is LABELLED in the
 * artifact (`waiver_baseline_meta.derived === false`): this file runs inside
 * the nightly board build hours before a draft, and a missing artifact must
 * degrade to the number we shipped yesterday rather than take the board down. */
const LEGACY_WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const WB = (() => {
  try {
    const d = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'waiver_baseline.json'), 'utf8'));
    if (!d.controls_all_passed) return { ok: false, why: 'controls failed: ' + (d.control_failures || []).join('; ') };
    return { ok: true, doc: d };
  } catch (e) { return { ok: false, why: e.code === 'ENOENT' ? 'artifact not built' : String(e.message) }; }
})();
/* The DS-priced baseline is the one the legacy `surplus_over_wire` compares
 * against, because `projUsed` reads `x.ds.proj` — comparing a Draft Sharks
 * projection to some other source's wire was half of what made the old number
 * hard to defend. */
const WAIVER = (WB.ok && WB.doc.baseline.ds) || LEGACY_WAIVER;
const WAIVER_BY_SRC = WB.ok ? WB.doc.baseline : null;
const SCHED = PLAN.SCHED;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const ROOMS = arg('--rooms', 300);
const A = Math.min(1, Math.max(0, arg('--a', 0)));

const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (f <= m && m <= c) dsById.set(String(p.sleeper_id), { floor: f, proj: m, ceiling: c,
    risk: p.injury_risk_pct == null ? null : +p.injury_risk_pct });
});
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
/* THE BLEND NUMBER, ALONGSIDE — ROUTE-B-TOGGLE (ROUTES-B-TOGGLE.md, A→B
 * 2026-08-19): `public/draft_data.json` rows now carry `proj_mean` (the
 * position-centred blend, all 700) beside the Draft Sharks fields this file
 * has always used to select and rank. SELECTION AND ORDERING STAY
 * DRAFT-SHARKS-PRICED — unchanged, and not something this file's TOPN/VONA/
 * cliff/note math should quietly start reading two ways three days before the
 * draft. The blend is read ONLY to attach as a second, alongside number for
 * the war room's toggle (view: TERRITORY B) to display for the SAME already-
 * selected player — never to reselect or reorder who is in the list. Every
 * player here has a Draft Sharks line by construction, so `proj_mean` is
 * always present too (blend covers 700, DS-selected are a subset); no
 * unranked case to handle on this side of the join. */
const meanById = new Map();
BOARD.players.forEach(p => {
  if (p.proj_mean == null) return;
  meanById.set(String(p.player_id), { proj: +p.proj_mean,
    floor: p.proj_floor == null ? null : +p.proj_floor,
    ceiling: p.proj_ceiling == null ? null : +p.proj_ceiling });
});

/* ⚠️ PER-SOURCE PROJECTIONS — CORY, 2026-08-21, ruling this file's VONA
 * directly: "Vona should change for each source in which we have a projected
 * points total. If we don't have projected points then it shouldn't show Vona
 * for that source."
 *
 * E's audit found the symptom ("all VONA is coming from draft shark and
 * doesn't change with changing source") and it was true of THIS file: `VONA`
 * was computed once, from Draft Sharks, and the war room printed that one
 * number under whichever source was selected.
 *
 * THE PREMISE THAT MADE IT LOOK UNFIXABLE IS GONE. It used to be true that we
 * only held Draft Sharks' points per player. The board now carries EIGHT
 * projection columns (attach_multisource.py, 2026-08-21), so the "we only have
 * DS points" objection no longer applies.
 *
 * AND IT NEEDS NO RE-SIMULATION, which is the reason this ships rather than
 * waiting. The 300-room simulation drains the board by **ADP**, and ADP comes
 * from our own board (Sleeper/FantasyPros), not from any source's projections
 * — see `_sources`. Projections enter only when asking "who is the best of the
 * men still available". So the same simulated availability can be re-priced
 * under each source at essentially no cost: one extra pass over the pool per
 * room-pick, no second simulation.
 *
 * COVERAGE IS GATED, PER HIS SECOND SENTENCE. A source that does not price a
 * position's available men gets `null`, not a fallback — the view must print
 * nothing rather than quietly showing Draft Sharks' number under another
 * source's name, which is the exact defect being fixed. */
const SRC = [
  { key: 'ds', field: 'proj_ds' },
  { key: 'sleeper', field: 'proj_sleeper' },
  { key: 'cbs', field: 'proj_cbs' },
  { key: 'espn', field: 'proj_espn' },
  { key: 'fftoday', field: 'proj_fftoday' },
  { key: 'fantasypros', field: 'proj_fantasypros' },
  { key: 'clay', field: 'proj_clay' },
  { key: 'ownmodel', field: 'proj_ownmodel' },
];
//: how many priced, available men a (position, source) cell needs before its
//: VONA means anything. Two players cannot show what waiting costs.
const SRC_MIN_COVERED = 3;
const srcById = new Map();
BOARD.players.forEach(p => {
  const row = {};
  SRC.forEach(sc => { const v = p[sc.field]; if (v != null && isFinite(+v)) row[sc.key] = +v; });
  srcById.set(String(p.player_id), row);
});
const pool = [];
BOARD.players.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d || !POS.includes(p.position)) return;
  pool.push({ id: String(p.player_id), name: p.name || p.player_name, position: p.position,
              team: p.team || null, adp: adpOf(p), sd: p.adp_sd == null ? 12 : +p.adp_sd, ds: d,
              blend: meanById.get(String(p.player_id)) || null,
              src: srcById.get(String(p.player_id)) || {},
              // WAR-ROOM-SPEC.md P1's per-row field list names `bye` — was
              // missing from this artifact entirely (checked: draft_data.json
              // carries it as `bye`, this file just never joined it).
              bye: p.bye == null ? null : +p.bye });
});
const projUsed = x => x.ds.proj + A * (x.ds.ceiling - x.ds.proj);

let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* availableAt[i][id] = times he was still on the board at Cory's i-th pick */
const availAt = SCHED.map(() => new Map());
const bestNextByPos = SCHED.map(() => { const o = {}; POS.forEach(q => { o[q] = []; }); return o; });
/* pick index -> position -> source key -> per-room best-available-at-next-pick */
const bestNextBySrc = SCHED.map(() => {
  const byPos = {};
  POS.forEach(q => { byPos[q] = {}; SRC.forEach(sc => { byPos[q][sc.key] = []; }); });
  return byPos;
});
for (let r = 0; r < ROOMS; r++) {
  const order = pool.map(p => ({ p, k: p.adp + gauss() * p.sd }))
    .sort((x, y) => x.k - y.k).map(x => x.p.id);
  SCHED.forEach((pk, i) => {
    /* liveBefore(pk), NOT pk - 1 -- `pk` is a BOARD pick number and this
    * list counts SELECTIONS; they differ by the keeper slots ahead (exactly
    * 3 at every one of Cory's twelve picks on this board). One derivation:
    * draft_plan.js liveBefore(). Fixed 2026-08-20 after pick_schedule's
    * detector was widened to see the `pk` spelling it had been blind to. */
    const gone = new Set(order.slice(0, PLAN.liveBefore(pk)));
    pool.forEach(x => { if (!gone.has(x.id)) availAt[i].set(x.id, (availAt[i].get(x.id) || 0) + 1); });
    const nxt = SCHED[i + 1];
    if (nxt == null) return;
    const goneNext = new Set(order.slice(0, nxt - 1));
    POS.forEach(q => {
      let b = null;
      for (const x of pool) if (x.position === q && !goneNext.has(x.id)) {
        const v = projUsed(x); if (b === null || v > b) b = v;
      }
      if (b != null) bestNextByPos[i][q].push(b);
    });
    /* PER-SOURCE, SAME ROOM, SAME SURVIVORS — one extra pass over the pool,
     * not a second simulation. `goneNext` is ADP-drained and therefore
     * source-independent; only the pricing of the survivors changes. */
    {
      const best = {};                       // pos -> src -> max
      for (const x of pool) {
        if (goneNext.has(x.id)) continue;
        const bq = best[x.position] || (best[x.position] = {});
        for (const sc of SRC) {
          const v = x.src[sc.key];
          if (v == null) continue;
          if (bq[sc.key] === undefined || v > bq[sc.key]) bq[sc.key] = v;
        }
      }
      POS.forEach(q => {
        const bq = best[q] || {};
        SRC.forEach(sc => {
          if (bq[sc.key] === undefined) return;
          bestNextBySrc[i][q][sc.key].push(bq[sc.key]);
        });
      });
    }
  });
}
const mean = z => (z.length ? z.reduce((x, y) => x + y, 0) / z.length : null);

const picks = SCHED.map((pk, i) => {
  const row = { pick: pk, round: Math.ceil(pk / 10), next_pick: SCHED[i + 1] || null, positions: {} };
  POS.forEach(q => {
    const here = pool.filter(x => x.position === q)
      .map(x => ({ x, availNow: (availAt[i].get(x.id) || 0) / ROOMS,
                   availNext: SCHED[i + 1] == null ? 0 : (availAt[i + 1].get(x.id) || 0) / ROOMS }))
      /* the men actually in play at this pick — not the ones already gone */
      .filter(o => o.availNow >= 0.05)
      .sort((a, b) => projUsed(b.x) - projUsed(a.x))
      .slice(0, TOPN[q]);

    const bestNow = here.length ? projUsed(here[0].x) : null;
    const bestNext = mean(bestNextByPos[i][q]);
    const vona = (bestNow != null && bestNext != null) ? Math.max(0, bestNow - bestNext) : null;
    const surplus = bestNow == null ? null : Math.max(0, bestNow - WAIVER[q]);

    /* the cliff INSIDE the list: the biggest one-step drop among the top N */
    let cliffAfter = null, cliffSize = 0;
    for (let k = 0; k + 1 < here.length; k++) {
      const d = projUsed(here[k].x) - projUsed(here[k + 1].x);
      if (d > cliffSize) { cliffSize = d; cliffAfter = k + 1; }
    }

    /* PER-SOURCE VONA — Cory's ruling, 2026-08-21. `bestNow` is the best
     * AVAILABLE man at this pick under that source's own points (not the
     * DS-selected top-N, which would re-price a Draft Sharks answer and call
     * it CBS); `bestNext` is the same question at the next pick, averaged over
     * the same 300 ADP-drained rooms.
     *
     * NULL, NOT A FALLBACK, when a source does not price enough of the
     * available men — his second sentence, verbatim: "If we don't have
     * projected points then it shouldn't show Vona for that source." */
    const availNow = pool.filter(x => x.position === q
      && ((availAt[i].get(x.id) || 0) / ROOMS) >= 0.05);
    const vonaBySrc = {}, coveredBySrc = {}, bestNowBySrc = {}, bestNextBySrcOut = {};
    SRC.forEach(sc => {
      const priced = availNow.map(x => x.src[sc.key]).filter(v => v != null);
      coveredBySrc[sc.key] = priced.length;
      const bn = priced.length ? Math.max.apply(null, priced) : null;
      const nx = mean(bestNextBySrc[i][q][sc.key]);
      bestNowBySrc[sc.key] = bn == null ? null : +bn.toFixed(1);
      bestNextBySrcOut[sc.key] = nx == null ? null : +nx.toFixed(1);
      vonaBySrc[sc.key] = (priced.length >= SRC_MIN_COVERED && bn != null && nx != null)
        ? +Math.max(0, bn - nx).toFixed(1) : null;
    });

    /* PER-SOURCE SURPLUS OVER THE WIRE — Cory's second sentence, 2026-08-21:
     * "it should also change with each source probably?"
     *
     * Same gate as VONA and for the same reason: a source that does not price
     * enough of the available men here has no opinion about this position, and
     * a source with no derived baseline at this position (too few players
     * priced league-wide to reach the (count+1)-th man) has no wire to measure
     * against. Either way NULL, which the view prints as a dash — never
     * another source's number wearing this one's name.
     *
     * `bestNowBySrc` is already the best AVAILABLE man under that source's own
     * points, so this is that man's points minus that source's own wire. Both
     * halves come from one source; the old chip took its numerator from Draft
     * Sharks and its denominator from a frozen literal. */
    const surplusBySrc = {}, wireBySrc = {}, noteBySrc = {};
    SRC.forEach(sc => {
      const base = WAIVER_BY_SRC ? WAIVER_BY_SRC[sc.key] : null;
      const w = base ? base[q] : null;
      wireBySrc[sc.key] = w == null ? null : w;
      const bn = bestNowBySrc[sc.key];
      surplusBySrc[sc.key] = (w == null || bn == null
        || coveredBySrc[sc.key] < SRC_MIN_COVERED)
        ? null : +Math.max(0, bn - w).toFixed(1);
      /* The NOTE reads the same two numbers the chips do, so it cannot end up
       * describing a different source than the chips beside it — which is the
       * failure this whole family was built out of. */
      noteBySrc[sc.key] = noteFor(q, vonaBySrc[sc.key], surplusBySrc[sc.key], here);
    });

    row.positions[q] = {
      best_now: bestNow == null ? null : +bestNow.toFixed(1),
      expected_best_at_next_pick: bestNext == null ? null : +bestNext.toFixed(1),
      VONA: vona == null ? null : +vona.toFixed(1),
      //: Cory 2026-08-21 — VONA per source, null where that source does not
      //: price at least SRC_MIN_COVERED of the available men at this position.
      VONA_by_source: vonaBySrc,
      best_now_by_source: bestNowBySrc,
      expected_best_at_next_pick_by_source: bestNextBySrcOut,
      covered_by_source: coveredBySrc,
      surplus_over_wire: surplus == null ? null : +surplus.toFixed(1),
      //: Cory 2026-08-21 — the "+N wire" chip per source, on the SAME null rule
      //: as VONA. `waiver_by_source` is published beside it so the number can be
      //: audited without re-deriving it (it is what the surplus was measured
      //: against, not a decoration).
      surplus_over_wire_by_source: surplusBySrc,
      waiver_by_source: wireBySrc,
      note_by_source: noteBySrc,
      cliff_after_rank: cliffAfter, cliff_size: +cliffSize.toFixed(1),
      note: noteFor(q, vona, surplus, here),
      players: here.map(o => ({
        player_id: o.x.id, name: o.x.name, team: o.x.team, bye: o.x.bye,
        proj: +o.x.ds.proj.toFixed(1), floor: +o.x.ds.floor.toFixed(1),
        ceiling: +o.x.ds.ceiling.toFixed(1), injury_risk_pct: o.x.ds.risk,
        // The blend's own numbers for this SAME player — the toggle's other
        // arm. Ranking, VONA, cliff and surplus above are unaffected: they
        // stay computed from `ds`, only these three fields switch under the
        // view's toggle.
        proj_blend: o.x.blend ? +o.x.blend.proj.toFixed(1) : null,
        floor_blend: (o.x.blend && o.x.blend.floor != null) ? +o.x.blend.floor.toFixed(1) : null,
        ceiling_blend: (o.x.blend && o.x.blend.ceiling != null) ? +o.x.blend.ceiling.toFixed(1) : null,
        adp: +o.x.adp.toFixed(1),
        pct_available_now: +(o.availNow * 100).toFixed(0),
        pct_still_there_next_pick: +(o.availNext * 100).toFixed(0),
        surplus_over_wire: +Math.max(0, projUsed(o.x) - WAIVER[q]).toFixed(1),
      })),
    };
  });
  return row;
});

/* Cory: "wouldn't mind little notes from model like maybe take QB here or wait
 * on QB here." The note states the ARITHMETIC, never a pick. The two numbers it
 * weighs are the ones the model kept confusing: VONA is what waiting costs,
 * surplus is whether he is worth anything at all. */
function noteFor(q, vona, surplus, here) {
  if (vona == null || surplus == null) return null;
  const top = here[0];
  if (surplus < 5) return `skip — the best ${q} left is worth ${surplus.toFixed(0)} over a free one`;
  if (vona >= 12 && surplus >= 40) return `STRIKE — waiting costs ${vona.toFixed(0)} and he is +${surplus.toFixed(0)} over the wire`;
  if (vona <= 4 && surplus >= 25) return `wait — only ${vona.toFixed(0)} lost by waiting, the tier holds`;
  if (top && top.availNext >= 0.7) return `wait — ${top.x.name} is there next pick ${Math.round(top.availNext * 100)}% of the time`;
  if (vona >= 12) return `waiting costs ${vona.toFixed(0)}, but he is only +${surplus.toFixed(0)} over the wire — thin`;
  return `neutral — ${vona.toFixed(0)} to wait, +${surplus.toFixed(0)} over the wire`;
}


/* ── 1. OPPONENT NEEDS, SMALL ENOUGH TO READ AT 8 SECONDS A PICK ─────────────
 * Cory: "It should be very easy for me to view other team needs in a very small
 * window, find way to make it clear yet small."
 * One row per owner. Not tendencies, not probabilities -- the two facts that
 * change his pick: what they KEEP (so those slots are shut) and what is still
 * OPEN. Rendered as a compact string the view can print in one line. */
const ON = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'opponent_need_2026.json'), 'utf8')); }
  catch (e) { return null; }
})();
const opponents_compact = [];
if (ON && ON.opponents) {
  Object.entries(ON.opponents).forEach(([who, o]) => {
    const ns = o.need_state_at_draft_open || {};
    const open = POS.filter(q => ns[q] === 'open');
    const keeps = (o.keeper_slate || []).map(k => k.position);
    const kc = {}; keeps.forEach(q => { kc[q] = (kc[q] || 0) + 1; });
    opponents_compact.push({
      owner: who,
      keeps: POS.filter(q => kc[q]).map(q => (kc[q] > 1 ? kc[q] : '') + q).join(' '),
      needs: open.join(' '),
      /* the one number that changes YOUR pick: how likely they take each
       * position early, from their own history */
      /* ⛔ THE FIRST VERSION PRINTED "RB 50%" FOR ALL TEN OWNERS. That is the
       * LEAGUE bucket, not the owner -- tendency_by_bucket marks each cell with
       * source: 'league_bucket' when it has no owner history, and I was reading
       * the probability without the source. A column identical down every row is
       * not information, and it looked like information. Owner-specific cells
       * only; otherwise the column says so. */
      early_lean: (() => {
        const e = (o.tendency_by_bucket || {}).early || {};
        const cells = e.cells || {};
        const own = Object.entries(cells)
          .filter(([, c]) => c && c.source && c.source !== 'league_bucket' && c.rate > 0)
          .sort((a, b) => b[1].rate - a[1].rate)[0];
        return own ? `${own[0]} ${(own[1].rate * 100).toFixed(0)}%` : 'league avg only';
      })(),
    });
  });
}

/* ── 2. ROUND-TO-ROUND DROP-OFFS ─────────────────────────────────────────────
 * Cory: "what I need from you is info about when position drop offs are high or
 * low between rounds."
 * Not VONA within a pick -- the change in what is available BETWEEN his picks.
 * A big number means the position falls off a cliff between these two rounds;
 * a small one means the tier holds and he can wait. */
const round_dropoffs = [];
for (let i = 0; i + 1 < picks.length; i++) {
  const a = picks[i], b = picks[i + 1];
  const row = { from_pick: a.pick, to_pick: b.pick,
                from_round: a.round, to_round: b.round, pos: {} };
  POS.forEach(q => {
    const x = a.positions[q].best_now, y = b.positions[q].best_now;
    row.pos[q] = (x == null || y == null) ? null : +(x - y).toFixed(1);
  });
  const vals = POS.map(q => row.pos[q]).filter(v => v != null);
  row.steepest = POS.reduce((bq, q) => (row.pos[q] != null
    && (bq == null || row.pos[q] > row.pos[bq])) ? q : bq, null);
  row.flattest = POS.reduce((bq, q) => (row.pos[q] != null
    && (bq == null || row.pos[q] < row.pos[bq])) ? q : bq, null);
  round_dropoffs.push(row);
}

/* ── 3. CEILING STEALS ───────────────────────────────────────────────────────
 * Cory: "look for players who's ADP is a steal if they perform closer to their
 * ceilings."
 * A player the room prices by his MEAN, whose CEILING would make him a far
 * earlier pick. Measured as the gap between where ADP has him and where his
 * ceiling would rank him on the whole board. Positive = the room is late on him
 * IF he hits. This is an IF, and the artifact says so -- it is not a projection
 * that he will. */
/* ⛔ RANKED WITHIN POSITION, NOT ACROSS THE BOARD. The first version ranked
 * ceilings over the whole pool and returned TWELVE QUARTERBACKS out of twelve --
 * because QB ceilings sit on a 400-point scale while a receiver's top out near
 * 290. That is the same cross-position comparability bug that was in the value
 * term (P196), reappearing here. A steal is "early for HIS position". */
const ceilRank = new Map(), adpRank = new Map();
POS.forEach(q => {
  const grp = pool.filter(x => x.position === q);
  [...grp].sort((a, b) => b.ds.ceiling - a.ds.ceiling).forEach((x, i) => ceilRank.set(x.id, i + 1));
  [...grp].sort((a, b) => a.adp - b.adp).forEach((x, i) => adpRank.set(x.id, i + 1));
});
const ceiling_steals = pool
  .map(x => ({
    player_id: x.id, name: x.name, position: x.position, adp: +x.adp.toFixed(1),
    proj: +x.ds.proj.toFixed(1), ceiling: +x.ds.ceiling.toFixed(1),
    upside: +(x.ds.ceiling - x.ds.proj).toFixed(1),
    ceiling_rank: ceilRank.get(x.id), adp_rank: adpRank.get(x.id),
    steal_gap: adpRank.get(x.id) - ceilRank.get(x.id),
    injury_risk_pct: x.ds.risk,
  }))
  .filter(r => r.adp <= 200 && r.steal_gap >= 5)
  .sort((a, b) => b.steal_gap - a.steal_gap)
  .slice(0, 25);

const out = {
  _territory: 'TERRITORY: A — draft/tools/position_boards.js',
  _what: 'Top N per position with when-gone and when-to-strike. NO single '
       + 'recommendation — Cory chooses the position.',
  _sources: 'projections/floor/ceiling = Draft Sharks; ADP/adp_sd = our board (Sleeper/FantasyPros)',
  _blend_toggle_caveat: 'proj/floor/ceiling are Draft Sharks, which SELECTS and RANKS every list '
    + 'here — that is unchanged. proj_blend/floor_blend/ceiling_blend carry the SAME already-selected '
    + "player's blend numbers (public/draft_data.json's proj_mean/proj_floor/proj_ceiling) for the war "
    + "room's toggle to display instead. They never change who is in the list or its order — every "
    + 'player here has a Draft Sharks line by construction, so the blend fields are always present too.',
  _survival_caveat: 'pct_still_there_next_pick is ADP-DRAIN ONLY over ' + ROOMS
    + ' simulated rooms. The war room MUST override it with survival.js, which '
    + 'composes ADP with opponent-need Layer 2 and needs live draft context.',
  built_at: BOARD.built_at || null,
  rooms: ROOMS, adjuster_a: A, top_n: TOPN, waiver: WAIVER,
  /* WHERE THE WIRE NUMBER CAME FROM, travelling WITH the numbers rather than
   * living only in a tool nobody opens. `derived:false` is the honest label for
   * the fallback — a consumer can tell a recomputed baseline from yesterday's
   * frozen literal without guessing. */
  waiver_by_source: WAIVER_BY_SRC,
  waiver_baseline_meta: WB.ok ? {
    derived: true,
    seasons_used: WB.doc.seasons_used,
    rostered_count: WB.doc.rostered_count,
    drafted_count: WB.doc.drafted_count,
    generated_at: WB.doc.generated_at,
    method: WB.doc._method,
  } : { derived: false, why: WB.why, using: 'LEGACY_WAIVER (frozen literal)' },
  picks,
  opponents_compact, round_dropoffs, ceiling_steals,
  _steals_caveat: 'ceiling_steals is an IF, not a forecast: it ranks players by '
    + 'how much earlier their CEILING would have ranked them AT THEIR OWN POSITION than their ADP did. It says '
    + 'nothing about whether they reach it.',
};

/* CONTROLS — a board that silently lost a position is worse than no board. */
const ctl = {
  C1_every_pick_has_every_position: {
    ok: picks.every(r => POS.every(q => r.positions[q] && r.positions[q].players)),
    why: 'a missing column reads as "nothing available" at the table' },
  C2_lists_are_full_where_the_pool_allows: (() => {
    const short = [];
    picks.forEach(r => POS.forEach(q => {
      const n = r.positions[q].players.length;
      if (n < Math.min(TOPN[q], 3)) short.push(`pick ${r.pick} ${q}: ${n}`);
    }));
    return { ok: short.length === 0, short: short.slice(0, 8),
      why: 'Cory asked for 5-10 per position; a list that quietly comes back with '
         + 'one name is a filter bug, not a thin position' };
  })(),
  C3_survival_is_labelled_adp_only: { ok: true,
    why: 'the live war room has an opponent-aware number and MUST override this one' },
  C4_every_player_carries_a_blend_number: (() => {
    const missing = [];
    picks.forEach(r => POS.forEach(q => (r.positions[q].players || []).forEach(p => {
      if (p.proj_blend == null) missing.push(`pick ${r.pick} ${q} ${p.name}`);
    })));
    return { ok: missing.length === 0, missing: missing.slice(0, 8),
      why: 'every player here has a Draft Sharks line by construction, so the blend join '
         + 'should never miss — a miss means the id join broke, not that he lacks a blend proj' };
  })(),
};
out.controls = ctl;
out.controls_all_passed = Object.values(ctl).every(c => c.ok);

fs.writeFileSync(path.join(ROOT, 'public', 'position_boards.json'), JSON.stringify(out, null, 1));

console.log(`POSITION BOARDS — top N per position, no single recommendation`);
console.log(`  ${ROOMS} rooms, adjuster a = ${A}\n`);
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
const show = [SCHED[0], SCHED[4], SCHED[8]];
picks.filter(r => show.includes(r.pick)).forEach(r => {
  console.log(`\n  ── PICK ${r.pick} (round ${r.round}) → next at ${r.next_pick}`);
  POS.forEach(q => {
    const c = r.positions[q];
    if (!c.players.length) return;
    console.log(`    ${q.padEnd(4)} VONA ${String(c.VONA).padStart(5)}  surplus ${String(c.surplus_over_wire).padStart(5)}   ${c.note}`);
    c.players.slice(0, 3).forEach(pl => console.log(
      `         ${pl.name.slice(0, 20).padEnd(21)} proj ${String(pl.proj).padStart(5)}`
      + `  ceil ${String(pl.ceiling).padStart(5)}  there next pick ${String(pl.pct_still_there_next_pick).padStart(3)}%`));
  });
});
console.log('\n  ── OTHER TEAMS, SMALL ──');
console.log('    ' + 'owner'.padEnd(9) + 'keeps'.padEnd(12) + 'still needs'.padEnd(22) + 'leans early');
opponents_compact.forEach(o => console.log('    ' + String(o.owner).slice(0, 8).padEnd(9)
  + String(o.keeps || '—').padEnd(12) + String(o.needs || '—').padEnd(22) + (o.early_lean || '—')));

console.log('\n  ── DROP-OFF BETWEEN YOUR PICKS (points of best-available lost) ──');
console.log('    ' + 'from→to'.padEnd(10) + POS.map(q => q.padStart(6)).join('') + '   steepest  flattest');
round_dropoffs.forEach(r => console.log('    '
  + (r.from_pick + '→' + r.to_pick).padEnd(10)
  + POS.map(q => String(r.pos[q] == null ? '—' : r.pos[q].toFixed(0)).padStart(6)).join('')
  + '   ' + String(r.steepest).padEnd(9) + r.flattest));

console.log('\n  ── CEILING STEALS — the room prices the mean; how early would the CEILING have gone? ──');
console.log('    ' + 'player'.padEnd(22) + 'pos'.padEnd(5) + 'adp'.padStart(6)
  + 'proj'.padStart(7) + 'ceil'.padStart(7) + 'upside'.padStart(8) + '  pos-ranks earlier if he hits');
ceiling_steals.slice(0, 12).forEach(r => console.log('    ' + r.name.slice(0, 21).padEnd(22)
  + r.position.padEnd(5) + String(r.adp).padStart(6) + String(r.proj).padStart(7)
  + String(r.ceiling).padStart(7) + String(r.upside).padStart(8) + String(r.steal_gap).padStart(12)));

console.log(`\n  wrote public/position_boards.json`);
