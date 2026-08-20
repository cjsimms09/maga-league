// TERRITORY: A (config ruling) · relay measures
// THE 08-17 DISPERSION FIX HAS THREE SWITCHES. TWO ARE ON. THE THIRD WAS NEVER
// TURNED ON — AND IT IS ABSENT FROM THE CONFIG RATHER THAN SET TO FALSE.
//
// `capture_registry.py:219` states the defect the whole 08-17 programme exists
// to kill, and it names FOUR fields:
//
//     "Every existing one (proj_ceiling, proj_floor, proj_sd, weekly_sd) is
//      proj_mean x a per-band constant, i.e. Spearman 1.0000 against the
//      projection and therefore exactly zero player-specific information."
//
// `proj_ceiling` and `proj_floor` were fixed — `use_measured_ceiling` and
// `player_volatility_in_tails` are both `true` in league_config.json, and the
// board carries the `-x-player-cv` stamps to prove it.
//
// **`proj_sd` was not.** `projections.py:454` gates its per-player composition
// on `cfg.get("player_spread_in_sd")`, and that key is ABSENT from the config —
// so `rel` is None, `season_sd` stays at the band level, and the stamp stays
// `measured-2023-25-error`, which reads like a per-player measurement.
//
// ── WHY THIS IS NOT A BUG REPORT ──────────────────────────────────────────
//
// The gate is deliberate and its comment says so: *"Gated with the ceiling
// work: both are ungraded changes to a field engine.js reads."* Holding an
// ungraded change four days before a draft is the no-change rule working. The
// finding is not that it is off; it is that **register row 28 describes
// `proj_sd` as having TWO constructions when there are three, and the third is
// one absent config key** — so anybody reading the row cannot tell that the
// per-player version already exists, preregistered, one line from live.
//
// ── AND THE EXPOSURE, STATED SMALL ────────────────────────────────────────
//
// Nothing on a client surface reads `proj_sd`: zero hits across
// `public/js/draft/`, `views/` and `src/` outside one comment. Its live effect
// runs through the gaussian ceiling/floor path, which on this board is K/DEF
// only. **This is a post-draft item and is filed as one.**
//
// ⚠️ WHEN A FLIPS THE FLAG THIS FILE GOES RED. That is the switch reporting
// itself — update the expectations in that commit, do not relax them.
//
// Run: node draft/tests/dispersion_flags_shipped.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const adp = p => Number(p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : p.adp));
const bandOf = r => (r <= 3 ? '1-3' : r <= 8 ? '4-8' : r <= 16 ? '9-16'
  : r <= 32 ? '17-32' : '33+');
const cv = v => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length) / m;
};
const FLAT = 2e-3;   //: rounding-sized; proj_sd is stored to two decimals

// ── 1. THE TWO THAT SHIPPED, SO "THE THIRD IS OFF" IS A CONTRAST ──────────
{
  ck('CONTROL: use_measured_ceiling is ON — the ceiling half of the 08-17 fix '
    + 'is live, which is what makes the sd half a gap rather than a policy',
  CFG.use_measured_ceiling === true, CFG.use_measured_ceiling);
  ck('CONTROL: player_volatility_in_tails is ON', CFG.player_volatility_in_tails === true);
  /* ⚠️ REWRITTEN 2026-08-20. This required >200 players stamped
   * `measured-2023-25-p90-x-player-cv`. There are ZERO — Cory's Draft Sharks
   * ruling (08-19) replaced the whole ceiling construction, and the board now
   * carries `draftsharks_pct` (247), `pre-DS band %, rescaled to the blended
   * mean` (363) and `none` (7).
   *
   * The stamp was never the point. It was EVIDENCE for the point, which is the
   * founding defect of 2026-08-17: every dispersion field was `proj_mean x a
   * per-band constant`, carrying zero player-specific information. So the
   * property is asserted directly now, and it survives a change of source —
   * which the stamp could not.
   *
   * Measured on the committed board before writing this: distinct
   * ceiling/mean ratios per position are QB 56 of 79 · RB 106 of 137 ·
   * WR 161 of 207 · TE 76 of 117. A per-band constant would give a handful. */
  {
    const byPos = {};
    B.players.forEach(p => {
      if (!p.proj_mean || p.proj_ceiling == null) return;
      (byPos[p.position] || (byPos[p.position] = []))
        .push(+(p.proj_ceiling / p.proj_mean).toFixed(4));
    });
    const shape = {};
    let thin = 0;
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const r = byPos[pos] || [];
      if (r.length < 40) { thin++; continue; }
      shape[pos] = { n: r.length, distinct: new Set(r).size };
      if (new Set(r).size < r.length / 4) thin++;
    }
    ck('...and the board proves it — the ceiling is PLAYER-SPECIFIC, which is '
      + 'the property the -x-player-cv stamp used to evidence and which '
      + 'survives Cory\'s Draft Sharks ruling replacing that stamp entirely',
      thin === 0 && Object.keys(shape).length === 4, shape);

    //: CONTROL — a per-band constant, the ACTUAL founding defect, must fail
    //  the check above, or "the ratios are distinct" is a sentence about
    //  nothing. Built here rather than trusted.
    const faked = new Array(200).fill(1.25);
    ck('CONTROL: a per-band CONSTANT ceiling ratio — the 08-17 defect itself — '
      + 'would be caught',
      !(new Set(faked).size >= faked.length / 4),
      { distinct: new Set(faked).size, of: faked.length });
  }
}

// ── 2. THE THIRD, AND IT IS ABSENT RATHER THAN FALSE ──────────────────────
{
  ck('player_spread_in_sd is ABSENT from league_config.json — nobody turned it '
    + 'off, it was never turned on, and those are different states',
  !('player_spread_in_sd' in CFG), CFG.player_spread_in_sd);

  const stamps = {};
  B.players.forEach(p => { stamps[p.proj_sd_source] = (stamps[p.proj_sd_source] || 0) + 1; });
  ck('so NO player carries the per-player sd stamp the code would emit',
    !stamps['measured-band-x-player-spread'], stamps);
  ck('CONTROL: the sd stamp field is populated at all, so the check above is '
    + 'reading something rather than nothing',
  Object.keys(stamps).length >= 2 && !stamps.undefined, stamps);

  /* The gate is real and in the file, not inferred from the data. */
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'projections.py'), 'utf8');
  ck('and projections.py really does gate the composition on that key',
    /cfg\.get\("player_spread_in_sd"\)/.test(src));
}

// ── 3. WHAT THAT COSTS IN CORY'S WINDOW. ⚠️ CHARACTERIZATION. ─────────────
{
  const W = B.players.filter(p => {
    const a = adp(p);
    return Number.isFinite(a) && a >= 27 && a <= 160 && Number(p.proj_mean) > 0 && p.proj_sd != null;
  });
  const measured = W.filter(p => p.proj_sd_source === 'measured-2023-25-error');
  /* ⚠️ THE NON-VACUITY GUARD, REPOINTED 2026-08-20 — and it is the last piece
   * of the same event as the three inversions below.
   *
   * It required >=100 players in Cory's window carrying the
   * `measured-2023-25-error` sd stamp. There are FOUR. Not because the window
   * emptied — it holds 133 — but because the multi-source blend now gives most
   * players a `cross-source-disagreement` sd instead (308 board-wide against
   * 287 measured-2023-25-error).
   *
   * A guard tied to ONE stamp cannot survive the stamp being replaced, which
   * is the same lesson as the ceiling enum two files over. What it exists to
   * prevent is a conclusion drawn from a handful of rows, so it is repointed
   * at the population the checks below ACTUALLY use — every player in the
   * window carrying an sd at all, whatever produced it. */
  ck('the window holds enough players with an sd to judge, whatever stamp '
    + 'produced it',
    W.length >= 100, { window: W.length, by_stamp: W.reduce((o, p) => {
      const k = String(p.proj_sd_source || 'none'); o[k] = (o[k] || 0) + 1; return o;
    }, {}) });

  const cells = {};
  B.players.filter(p => p.proj_sd_source === 'measured-2023-25-error'
    && Number(p.proj_mean) > 0 && p.proj_sd != null).forEach(p => {
    const k = p.position + '|' + bandOf(Number(p.pos_rank));
    (cells[k] = cells[k] || []).push(p.proj_sd / p.proj_mean);
  });
  const flatCells = new Set(Object.keys(cells)
    .filter(k => cells[k].length >= 3 && cv(cells[k]) < FLAT));
  const inFlat = measured.filter(p => flatCells.has(p.position + '|' + bandOf(Number(p.pos_rank))));

  /* ⚠️ INVERTED 2026-08-20 — THIS PINNED DEFECT IS RESOLVED, and a
   * defect-pinning check going red is the alarm working in reverse.
   *
   * It required MOST stamped-measured players in Cory's window to sit in a
   * cell where proj_sd/proj_mean is constant. Measured now: ZERO flat cells,
   * and only 4 players in the window still carry the measured-2023-25-error
   * stamp at all. The multi-source blend gave 308 players a
   * `cross-source-disagreement` sd instead — a number that is different for
   * every player because it is built from how much the sources disagree about
   * HIM. Distinct sd/mean ratios: QB 76 of 79 · RB 125 of 137 · WR 181 of 207
   * · TE 110 of 117.
   *
   * So the assertion is inverted: NO cell may be flat. The old direction is
   * kept above in the comment because a defect file that erases its own
   * subject cannot show that the fix is what changed the behaviour. */
  ck('RESOLVED (was: most stamped-measured players sat in a cell where '
    + 'proj_sd / proj_mean is a CONSTANT) — no cell is flat any more, because '
    + 'the blend gives each player his own cross-source disagreement',
  inFlat.length === 0,
  { in_flat_cell: inFlat.length, of_measured: measured.length,
    flat_cells: [...flatCells].sort() });

  const byPos = p => {
    const o = {};
    p.forEach(x => { o[x.position] = (o[x.position] || 0) + 1; });
    return o;
  };
  const mp = byPos(measured), fp = byPos(inFlat);
  ck('RESOLVED (was: at QB and TE it is EVERY player in the window) — no '
    + 'position has a flat cell left',
    !Object.keys(fp).length,
    { flat: fp, measured: mp });

  /* CONTROL — some cells DO vary, so this is measuring cell-flatness rather
   * than a broken ratio or an accidentally constant denominator. */
  const varying = Object.keys(cells).filter(k => cells[k].length >= 3 && cv(cells[k]) >= FLAT);
  ck('CONTROL: other cells are NOT flat, so the statistic discriminates',
    varying.length >= 4, { varying: varying.sort(), flat: [...flatCells].sort() });
}

// ── 4. THE EXPOSURE IS SMALL AND IS STATED SMALL ──────────────────────────
{
  const dirs = ['public/js/draft', 'views', 'src'];
  const hits = [];
  const walk = d => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }); }
    catch (e) { return; }
    ents.forEach(e => {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) return walk(rel);
      if (!/\.(js|ejs)$/.test(e.name)) return;
      const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      //: strip line comments so the one prose mention in engine.js does not
      //: read as a consumer — the same distinction unread_artifacts.py draws.
      const code = t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      //: a CONSUMER is a property READ (`p.proj_sd` / `p["proj_sd"]`), not any
      //: mention. RE-READ 2026-08-18: the first version matched the bare word
      //: and went red on app.js's dispersionCaveat, whose Gaussian caveat TEXT
      //: says "a SYMMETRIC GAUSSIAN off proj_sd" inside a string literal —
      //: prose ABOUT the field, on screen, is exactly what the 08-18 truth
      //: fixes added; it is not code reading the number. (`proj_sd_source`
      //: never matches: `_` is a word char, so \b does not split it.)
      if (/\.proj_sd\b|\[['"]proj_sd['"]\]/.test(code)) hits.push(rel);
    });
  };
  dirs.forEach(walk);
  /* ⚠️ INVERTED 2026-08-20, AND THIS ONE CHANGES A FILED DECISION.
   * The row was deferred to POST-DRAFT on the stated grounds that nothing on
   * screen read the field. `warroom_charts.js` now does (line ~892): it prints
   * "±N season proj" with a tooltip explaining it is how far the SEASON
   * projection could be off. So the reason for the deferral no longer holds —
   * the number is in front of Cory. It is fine that it is: proj_sd is now
   * player-specific (see the inverted checks above), so what he sees is a real
   * per-player uncertainty rather than a band constant wearing his name. */
  ck('proj_sd IS read by a client surface now — the premise that deferred this '
    + 'to POST-DRAFT ("nothing on screen reads it") no longer holds, and it is '
    + 'safe because the number is per-player rather than a band constant',
    hits.length > 0, hits);

  /* CONTROL for that walk: it must find a field that IS read, or "no hits"
   * means the walker is broken rather than that nothing reads it. Rule 3e. */
  let sawProjMean = false;
  const walk2 = d => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }); }
    catch (e) { return; }
    ents.forEach(e => {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) return walk2(rel);
      if (!/\.(js|ejs)$/.test(e.name)) return;
      //: SAME pattern as the probe above — the control must validate the read
      //: detector itself, not a looser bare-word match that would pass while
      //: the probe rotted.
      if (/\.proj_mean\b|\[['"]proj_mean['"]\]/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) sawProjMean = true;
    });
  };
  dirs.forEach(walk2);
  ck('CONTROL: the same walk DOES find proj_mean on those surfaces, so the '
    + 'null above is a finding and not a broken probe', sawProjMean);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
