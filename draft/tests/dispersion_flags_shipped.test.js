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
  ck('...and the board proves it — players carry the -x-player-cv ceiling stamp',
    B.players.filter(p => p.proj_ceiling_source === 'measured-2023-25-p90-x-player-cv').length > 200,
    B.players.filter(p => p.proj_ceiling_source === 'measured-2023-25-p90-x-player-cv').length);
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
  ck('the window holds enough stamped-measured players to judge',
    measured.length >= 100, { window: W.length, measured: measured.length });

  const cells = {};
  B.players.filter(p => p.proj_sd_source === 'measured-2023-25-error'
    && Number(p.proj_mean) > 0 && p.proj_sd != null).forEach(p => {
    const k = p.position + '|' + bandOf(Number(p.pos_rank));
    (cells[k] = cells[k] || []).push(p.proj_sd / p.proj_mean);
  });
  const flatCells = new Set(Object.keys(cells)
    .filter(k => cells[k].length >= 3 && cv(cells[k]) < FLAT));
  const inFlat = measured.filter(p => flatCells.has(p.position + '|' + bandOf(Number(p.pos_rank))));

  ck('DEFECT: most of the stamped-measured players in his window sit in a cell '
    + 'where proj_sd / proj_mean is a CONSTANT — the stamp reads per-player and '
    + 'the number is not',
  inFlat.length > measured.length * 0.5,
  { in_flat_cell: inFlat.length, of_measured: measured.length,
    flat_cells: [...flatCells].sort() });

  const byPos = p => {
    const o = {};
    p.forEach(x => { o[x.position] = (o[x.position] || 0) + 1; });
    return o;
  };
  const mp = byPos(measured), fp = byPos(inFlat);
  ck('DEFECT: and at QB and TE it is EVERY player in the window, not most',
    fp.QB === mp.QB && fp.TE === mp.TE && mp.QB > 10 && mp.TE > 10,
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
  ck('no client surface reads proj_sd, which is why this is a POST-DRAFT item '
    + 'and is filed as one', hits.length === 0, hits);

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
