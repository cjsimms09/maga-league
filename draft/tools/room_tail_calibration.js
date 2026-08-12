// TERRITORY: A
/* ROOM TAIL CALIBRATION — score the synthetic rooms against the REAL drafts.
 *
 * ── WHY THIS EXISTS, AND THE CORRECTION THAT PROMPTED IT ────────────────────
 *
 * `room_model_tails_2026-08-12.md` measured the elite-fall-through rate at 0/40
 * in the ADP room and 40/40 in the profiled room, and concluded: neither is
 * right, so MIX them. C corrected the premise that argument rested on. I wrote
 * that the raw pick sequences are "not retained in this repository", having
 * checked `manager_profiles.json` — which holds only DERIVED profiles — and
 * generalised from one file to the repo. **`draft/data/league_history.json`
 * retains 480 real picks in order across three completed drafts.** The claim was
 * false and it was load-bearing: a mixture parameter chosen from first principles
 * is a modelling choice that has to be defended, and a mixture calibrated against
 * three real drafts is fitted to a measurement.
 *
 * ── WHAT IS MEASURED, AND WHY NOT THE FALL-THROUGH RATE DIRECTLY ────────────
 *
 * The obvious statistic is the one the original note used: a top-3-at-position
 * player still on the board 40+ picks past his ADP. **It cannot be computed on
 * the real drafts, because it needs a CONTEMPORANEOUS ADP for 2023/2024/2025 and
 * this repo holds only the current one.** Scoring a 2023 draft against 2026 ADP
 * would measure three years of career trajectory and report it as room
 * behaviour.
 *
 * So the statistic here is chosen to need NO ADP at all, and to bear on the
 * exact mechanism the overshoot was diagnosed from:
 *
 *   **POSITIONAL DROUGHT — the longest run of consecutive picks containing no
 *   player at a given position, measured only AFTER that position has started
 *   coming off the board.**
 *
 * That is what an elite faller sits through. And it is precisely what the
 * profiled room's marginal cannot get right: a per-seat positional mix has NO
 * MEMORY, so nothing stops nine seats independently drawing "not QB" twenty
 * times in a row. A real room corrects that because a human sees the position
 * still sitting there. The drought length is that mechanism, made countable.
 *
 * Reported raw AND as a ratio to the mean gap at that position, because a raw
 * drought depends on how many players at the position get taken at all — a room
 * that drafts 40 WRs has mechanically longer WR gaps than one that drafts 60,
 * with no difference in behaviour.
 *
 * ── AND WHAT WOULD SHOW IF THE SYNTHETIC ROOMS WERE FINE (rule 13g) ─────────
 *
 * If both room models reproduced real drought behaviour, their drought ratios
 * would sit inside the range spanned by the three real drafts. The instrument
 * can return that. It is not built to fail.
 *
 * SILENCE RULE (15): simulation and history only. Nothing here renders and
 * nothing is visible during a live decision.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const CO = require('./construction_order.js');

const ROOT = path.join(__dirname, '..', '..');
const HIST = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));

/* Position resolution for historical ids, against the CURRENT board.
 *
 * ⚠️ THE ASSUMPTION, STATED RATHER THAN BURIED: a player's POSITION is treated
 * as stable across seasons. That is safe in a way his ADP is not — players
 * change value every year and almost never change position — but it is still an
 * assumption, and the unresolvable count is printed so it cannot hide. */
const POS = {};
CO.DATA.players.forEach(p => { if (p.player_id != null) POS[String(p.player_id)] = p.position; });

const TRACKED = ['QB', 'RB', 'WR', 'TE'];

/* THE STATISTIC. Given an ordered array of positions, the longest run of picks
 * with no player at `pos`, counted only after the FIRST one has gone — a
 * drought before the position opens is not a drought, it is the start of the
 * draft, and counting it would hand every room a large number for free. */
function droughts(seq, pos) {
  const at = [];
  seq.forEach((p, i) => { if (p === pos) at.push(i); });
  if (at.length < 2) return { n: at.length, max: null, mean: null, ratio: null };
  const gaps = [];
  for (let i = 1; i < at.length; i++) gaps.push(at[i] - at[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const max = Math.max(...gaps);
  return { n: at.length, max: max, mean: Math.round(mean * 10) / 10,
    ratio: Math.round((max / mean) * 100) / 100 };
}

// ───────────────────────────────────────────────────── the real drafts
function realDrafts() {
  const out = [];
  let unresolved = 0, total = 0;
  (HIST.seasons || []).forEach(s => {
    (s.drafts || []).forEach(d => {
      const picks = (d.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
      if (picks.length < 100) return;              // the 30-pick 2023 keeper draft is not a draft
      const seq = [], seqNoKeep = [];
      picks.forEach(p => {
        total++;
        const pos = POS[String(p.player_id)];
        if (!pos) { unresolved++; }
        seq.push(pos || null);
        if (!p.is_keeper) seqNoKeep.push(pos || null);
      });
      out.push({ label: `${s.season} (${picks.length} picks)`, seq: seq, seqNoKeep: seqNoKeep });
    });
  });
  return { drafts: out, unresolved: unresolved, total: total };
}

// ───────────────────────────────────────────── the synthetic rooms
/* Every seat drawn from the room model — INCLUDING mine. This measures the room,
 * not my strategy, so there is no protagonist here. */
function syntheticDraft(roomName, seed) {
  const room = CO.ROOMS[roomName];
  if (!room) throw new Error(`no such room: ${roomName}`);
  const rand = CO.rng(seed);
  let board = CO.DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set();
  const seq = [];
  const N = CO.TEAMS * CO.ROUNDS;
  for (let o = 1; o <= N; o++) {
    const avail = board.filter(p => !gone.has(String(p.player_id)));
    if (!avail.length) break;
    const rd = Math.ceil(o / CO.TEAMS);
    const inRound = o - (rd - 1) * CO.TEAMS;
    const seat = rd % 2 === 1 ? inRound : CO.TEAMS - inRound + 1;   // snake
    let p;
    try { p = room(avail, rand, seat); } catch (e) {
      throw new Error(`room ${roomName} threw at pick ${o}: ${e.message}`);
    }
    if (!p) break;
    gone.add(String(p.player_id));
    seq.push(p.position);
  }
  return seq;
}

// ───────────────────────────────────────────────────────────── report
const R = realDrafts();
const SIM_N = Number(process.argv[2] || 40);

console.log('='.repeat(78));
console.log('ROOM TAIL CALIBRATION — synthetic rooms scored against REAL drafts');
console.log('='.repeat(78));
console.log('STATISTIC: longest positional DROUGHT (consecutive picks with none at');
console.log('the position, counted only after the position has opened), and that');
console.log('drought as a RATIO to the mean gap — scale-free, so a room that drafts');
console.log('fewer of a position is not credited with longer droughts for free.');
console.log('');
console.log(`REAL: ${R.drafts.length} completed drafts, ${R.total} picks, `
  + `${R.unresolved} unresolvable to a position `
  + `(${(100 * R.unresolved / Math.max(1, R.total)).toFixed(1)}%)`);
console.log('');

function line(label, seq) {
  const cells = TRACKED.map(pos => {
    const d = droughts(seq, pos);
    if (d.max == null) return `${pos} —`;
    /* THE COUNT IS PRINTED WITH THE RATIO because the ratio is only scale-free
     * if the counts are comparable. A room that drafts 45 receivers where a real
     * draft took 60 has a different mean gap by construction, and the ratio
     * would inherit that difference as if it were behaviour. */
    return `${pos} ${String(d.max).padStart(3)}/${String(d.ratio).padStart(5)}/n${String(d.n).padStart(2)}`;
  });
  console.log(`   ${label.padEnd(26)} ${cells.join(' ')}`);
}

console.log('   ' + 'draft / room'.padEnd(26)
  + TRACKED.map(p => `${p} max/ratio`.padEnd(15)).join(' '));
console.log('   ' + '─'.repeat(70));
R.drafts.forEach(d => line('REAL ' + d.label, d.seq));
console.log('');

/* ⚠️ THE KEEPER CONTROL, and it was computed and discarded in the first version
 * of this file — rule 14, in a tool written to check somebody else's rule-14
 * problem. Keeper picks are PRE-ASSIGNED, not chosen, and they cluster at the
 * top of the draft. If the real WR/TE drought signal is really a keeper-layout
 * artifact it will not survive their removal, and any conclusion drawn from the
 * rows above would be a conclusion about the league's keeper rules wearing a
 * room-behaviour costume. */
console.log('   KEEPERS REMOVED (pre-assigned picks are not room behaviour):');
R.drafts.forEach(d => line('REAL ' + d.label + ' no-keep', d.seqNoKeep));
console.log('');

/* The real range, which is the thing the synthetic rooms have to land inside.
 * Computed rather than eyeballed, and per position. */
const realRange = {};
const realRangeNoKeep = {};
const realCount = {};
TRACKED.forEach(pos => {
  const rs = R.drafts.map(d => droughts(d.seq, pos)).filter(x => x.ratio != null).map(x => x.ratio);
  realRange[pos] = rs.length ? [Math.min(...rs), Math.max(...rs)] : null;
  const nk = R.drafts.map(d => droughts(d.seqNoKeep, pos)).filter(x => x.ratio != null).map(x => x.ratio);
  realRangeNoKeep[pos] = nk.length ? [Math.min(...nk), Math.max(...nk)] : null;
  const cs = R.drafts.map(d => droughts(d.seq, pos).n).filter(x => x);
  realCount[pos] = cs.length ? [Math.min(...cs), Math.max(...cs)] : null;
});

const rooms = ['adp', 'profiled', 'reachy', 'qb_early', 'rb_run'];
const simRatios = {};
rooms.forEach(rn => {
  simRatios[rn] = {};
  TRACKED.forEach(p => { simRatios[rn][p] = []; });
  for (let i = 0; i < SIM_N; i++) {
    const seq = syntheticDraft(rn, 90000 + i * 104729);
    TRACKED.forEach(p => {
      const d = droughts(seq, p);
      if (d.ratio != null) simRatios[rn][p].push({ max: d.max, ratio: d.ratio, n: d.n });
    });
  }
});

const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

rooms.forEach(rn => {
  const cells = TRACKED.map(pos => {
    const arr = simRatios[rn][pos];
    if (!arr.length) return `${pos} —`;
    const mMax = med(arr.map(x => x.max));
    const mRat = med(arr.map(x => x.ratio));
    const mN = med(arr.map(x => x.n));
    return `${pos} ${String(mMax).padStart(3)}/${String(mRat.toFixed(2)).padStart(5)}/n${String(mN).padStart(2)}`;
  });
  console.log(`   ${('SIM  ' + rn + ` (n=${SIM_N}, med)`).padEnd(26)} ${cells.join(' ')}`);
});
console.log('');

// ─────────────────────────────────────── the verdict, per room per position
console.log('   VERDICT — is the room\'s median drought ratio inside the real range?');
console.log('   (real range across the ' + R.drafts.length + ' completed drafts)');
/* ⚠️ SCORED AGAINST BOTH RANGES, and a verdict that DISAGREES between them is
 * reported as fragile rather than resolved in whichever direction is more
 * interesting. Keepers are pre-assigned picks and removing them is the more
 * honest measure of room BEHAVIOUR, but it also shrinks the sample, so neither
 * range is straightforwardly the right one. Where they disagree, the finding is
 * that the finding does not survive its own control. */
function verdictOf(m, rr) {
  if (m == null || !rr) return '—';
  return m < rr[0] ? 'FLAT' : (m > rr[1] ? 'WILD' : 'in');
}
TRACKED.forEach(pos => {
  const rr = realRange[pos], nk = realRangeNoKeep[pos];
  if (!rr) { console.log(`     ${pos}: no real range`); return; }
  const verdicts = rooms.map(rn => {
    const arr = simRatios[rn][pos];
    const m = med(arr.map(x => x.ratio));
    const a = verdictOf(m, rr), b = verdictOf(m, nk);
    return `${rn}=${a === b ? a : a + '/' + b + '‼'}`;
  });
  console.log(`     ${pos} all ${rr[0].toFixed(2)}–${rr[1].toFixed(2)}  `
    + `no-keep ${nk ? nk[0].toFixed(2) + '–' + nk[1].toFixed(2) : '—'}   ${verdicts.join('  ')}`);
});
console.log('');
console.log('   ‼ = the verdict FLIPS when pre-assigned keeper picks are removed,');
console.log('       so it is an artifact of the keeper layout, not room behaviour.');
console.log('');

/* AND A SEPARATE CHECK THE RATIO CANNOT MAKE. A room can have a realistic
 * drought SHAPE while drafting an unrealistic NUMBER of the position — and a
 * room that takes 72 running backs where real drafts took 45 is mis-calibrated
 * whatever its gaps look like. */
console.log('   COUNT CHECK — does the room draft a realistic NUMBER at the position?');
TRACKED.forEach(pos => {
  const rc = realCount[pos];
  if (!rc) return;
  const cells = rooms.map(rn => {
    const m = med(simRatios[rn][pos].map(x => x.n));
    if (m == null) return `${rn}=—`;
    const off = m < rc[0] ? `${m}<` : (m > rc[1] ? `${m}>` : `${m} ok`);
    return `${rn}=${off}`;
  });
  console.log(`     ${pos} real ${rc[0]}–${rc[1]}   ${cells.join('  ')}`);
});
console.log('');
console.log('   FLAT = shorter droughts than any real draft (a room that cannot');
console.log('          leave a player sitting, which is the ADP room\'s defect).');
console.log('   WILD = longer than any real draft (a memoryless marginal).');
console.log('   in   = the room reproduces real drought behaviour at this position.');
console.log('');
console.log('   ⚠️ THREE REAL DRAFTS IS THE WHOLE SAMPLE. The "real range" is a range');
console.log('   over n=3, so a room landing inside it has cleared a low bar and a room');
console.log('   landing outside it has failed a wide one. The asymmetry is the point:');
console.log('   OUTSIDE is informative here, INSIDE is weak evidence.');
