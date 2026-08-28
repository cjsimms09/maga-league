#!/usr/bin/env node
/* TERRITORY: A.  THE PROBES BEHIND `premise_check.js`.
 *
 * One function per premise, each returning a NUMBER measured from live state —
 * never a boolean, never prose. The number is what makes a verdict arguable:
 * "VOID" alone starts a conversation, "VOID: 0 of 60 cells constant" ends one.
 *
 * A probe MUST throw rather than guess. `premise_check.js` treats a throw as
 * CANNOT-CHECK and refuses to report the run as healthy, because a probe that
 * returns a plausible number on missing data is how a dead premise gets
 * certified alive — which is the whole failure this mechanism exists to catch.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function board() {
  const p = path.join(ROOT, 'public', 'draft_data.json');
  if (!fs.existsSync(p)) throw new Error('no board at ' + p);
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(b.players) || !b.players.length) throw new Error('board has no players');
  return b;
}

/* Cells = (position, tier). Only cells with 3+ members are counted: a cell of
 * one or two is constant by arithmetic, not by construction, and counting them
 * would let a thinning board fake the premise back into life. */
function constantRatioCells(field) {
  const rows = board().players.filter(p => Number(p.proj_mean) > 0 && p[field] != null);
  if (!rows.length) throw new Error('no players carry ' + field);
  const cells = {};
  for (const p of rows) {
    const k = p.position + '|' + (p.tier == null ? '?' : p.tier);
    (cells[k] = cells[k] || []).push(Number(p[field]) / Number(p.proj_mean));
  }
  let constant = 0, considered = 0;
  for (const k of Object.keys(cells)) {
    const r = cells[k];
    if (r.length < 3) continue;
    considered++;
    if (Math.max.apply(null, r) - Math.min.apply(null, r) < 1e-9) constant++;
  }
  if (!considered) throw new Error('no cell had 3+ members — cannot judge');
  return constant;
}

const PROBES = {
  /* Register 370 / E16. The 08-17 floor/ceiling model was `proj_mean × a
   * per-cell constant`, which put a cliff at every band edge and made the
   * ceiling tiebreak inert. Draft Sharks replaced it per-player on 08-19. */
  ceiling_ratio_constant_cells: () => constantRatioCells('proj_ceiling'),
  floor_ratio_constant_cells: () => constantRatioCells('proj_floor'),

  /* Register 364 and its four siblings. Pre-lock `kept_players` WAS Cory's
   * three, so one variable could serve both availability and roster. The
   * 08-23 league-wide lock made it 23 and disjoint from `players`. */
  kept_players_total: () => {
    const b = board();
    const k = b.kept_players || [];
    if (!k.length) throw new Error('board carries no kept_players');
    return k.length;
  },
  kept_players_at_my_seat: () => {
    const b = board();
    const slot = Number((b.league || {}).my_draft_slot);
    if (!slot) throw new Error('board names no my_draft_slot');
    return (b.kept_players || []).filter(p => Number(p.team_slot) === slot).length;
  },

  /* The one that cost the most: how many of the league's keepers are NOT
   * Cory's. Zero means one variable can safely serve both availability and
   * roster; anything else means every tool conflating them is wrong. */
  kept_players_not_mine: () => {
    const b = board();
    const slot = Number((b.league || {}).my_draft_slot);
    if (!slot) throw new Error('board names no my_draft_slot');
    const all = b.kept_players || [];
    if (!all.length) throw new Error('board carries no kept_players');
    return all.length - all.filter(p => Number(p.team_slot) === slot).length;
  },

  /* ── THE MODEL'S OWN FITS vs THE MODEL'S SHIPPED CONSTANTS (register 386) ──
   *
   * `RECENCY_WEIGHTS = (0.7, 0.3)` is marked "DECLARED — see prereg: cannot be
   * refit leak-free", and `recency_weight_fit.py` fits it anyway to see whether
   * the hand-set number was defensible. Its own header states the expectation:
   * "The incumbent 0.7 was hand-set and never measured; a small gap means it
   * was fine and we finally know it."
   *
   * At three positions it WAS fine. At QB it is not, and nobody read it,
   * because the artifact carrying the answer sat in the freshness tool's
   * ERROR bucket for want of a `--json` flag.
   *
   * THE 0.05 LINE IS DECLARED, AND THE DISTRIBUTION SAYS IT IS NOT
   * LOAD-BEARING (Rule 3i): the four measured gaps are WR 0.0049, TE 0.0074,
   * RB 0.0112, QB 0.1154. Any threshold between 0.012 and 0.115 returns the
   * identical answer, so the verdict rests on a tenfold separation in the data
   * rather than on where the line was put. If a future refit lands a position
   * INSIDE that empty band, this number stops being safe and the premise entry
   * must be re-derived rather than re-thresholded. */
  recency_positions_where_the_fit_disagrees: () => {
    const f = path.join(ROOT, 'draft', 'backtest', 'recency_weight_fit.json');
    if (!fs.existsSync(f)) throw new Error('no recency_weight_fit.json — run the fit');
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const curves = doc.curves || {};
    const keys = Object.keys(curves);
    if (!keys.length) throw new Error('recency_weight_fit.json carries no curves');
    let n = 0, seen = 0;
    for (const k of keys) {
      const gap = curves[k]['mean_gap_0.7_to_best'];
      if (gap == null) continue;
      seen++;
      if (Number(gap) > 0.05) n++;
    }
    if (!seen) throw new Error('no position reported a gap — cannot judge');
    return n;
  },

  /* Register 374. `file_register_row.js` ran a WHOLE-REGISTER health check as
   * a per-row guard. That was harmless while the backlog was zero, which it
   * was on 08-24 — and a veto on all new rows once it was not. */
  register_overdue_rows: () => {
    const R = require(path.join(ROOT, 'draft', 'tools', 'register_recheck_check.js'));
    const reg = path.join(ROOT, 'DEFECT-REGISTER.md');
    if (!fs.existsSync(reg)) throw new Error('no DEFECT-REGISTER.md');
    const today = new Date().toISOString().slice(0, 10);
    return (R.audit(fs.readFileSync(reg, 'utf8'), today).overdue || []).length;
  },

  /* Register 5h, three times over: prose quoting a weight the constant no
   * longer carries. Read off engine.js itself, never off a document. */
  shipped_ceiling_weight_x100: () => weightX100('ceiling'),
  shipped_need_weight_x100: () => weightX100('need'),

  /* Register 378. The premise was "a red pytest run means the CODE is broken",
   * which holds only when the interpreter matches draft/requirements.txt. */
  declared_python_packages_missing: () => {
    const { execFileSync } = require('child_process');
    const tool = path.join(ROOT, 'draft', 'tools', 'check_python_env.py');
    if (!fs.existsSync(tool)) throw new Error('check_python_env.py is missing');
    let out;
    try {
      out = execFileSync('python3', [tool], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { out = String((e.stdout || '') + (e.stderr || '')); }
    const m = out.match(/MISSING (\d+):/);
    if (m) return Number(m[1]);
    if (/every declared distribution is installed/.test(out)) return 0;
    throw new Error('could not parse check_python_env output');
  },
};

/* Weights are read out of the shipped constant by parsing the source, NOT by
 * requiring engine.js — it is a browser module that wants a `window`, and a
 * probe that drags a global shim into the checker is a probe that can break
 * for reasons unrelated to its premise. */
function weightX100(name) {
  const p = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');
  if (!fs.existsSync(p)) throw new Error('no engine.js');
  const src = fs.readFileSync(p, 'utf8');
  const block = src.match(/MEASURED_WEIGHTS\s*=\s*\{[\s\S]{0,400}?\}/);
  if (!block) throw new Error('MEASURED_WEIGHTS not found in engine.js');
  const m = block[0].match(new RegExp(name + '\\s*:\\s*([0-9.]+)'));
  if (!m) throw new Error(name + ' not found inside MEASURED_WEIGHTS');
  return Math.round(Number(m[1]) * 100);
}

module.exports = { PROBES, weightX100 };
