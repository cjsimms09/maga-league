<!-- TERRITORY: A -->
# THE HARNESS FIX, VERIFIED END TO END — and "upside late" loses a FIFTH time

**CI run 32002876691, branch `claude/fantasy-football-research-926y6z`, HEAD
`735e5ace`. Fired with `commit: false`, so nothing was written back.**

---

## 1. WHY THIS RUN EXISTS

When the bundle-dispersion fix landed I recorded, in the commit itself:

> **NOT VERIFIED END TO END:** real bundles are built in CI where the network
> is, so the pure functions and the CLI wiring are tested here but the full
> rebuild runs there.

That was an honest caveat and it is now closed. `commit: false` makes the run
side-effect-free: it assembles bundles, replays, reports, and **skips** the
commit-back step.

## 2. THE FIX WORKS ON REAL BUNDLES

From the `Assemble era-appropriate bundles` step:

```
--- measured dispersion (leave-one-season-out) ---
  2023: ceiling 706, floor 706, sd 706 attached over 841 players (135 off any measured cell)
  2024: ceiling 694, floor 694, sd 694 attached over 812 players (118 off any measured cell)
  2025: ceiling 703, floor 703, sd 703 attached over 801 players ( 98 off any measured cell)
```

Three things are confirmed at once, and the third is the one that matters:

1. **The path runs.** All three seasons received measured p90/p10/sd, ~84% of
   each board.
2. **Leave-one-season-out held.** Each season was fitted on the others;
   `calibrate(exclude_season=)` raises if handed its own season and did not.
3. **THE REFUSAL FIRED, ON REAL DATA.** 135 / 118 / 98 players landed off any
   measured cell and got **nothing** — no field, no fallback constant. That is
   the behaviour the unit tests pin, now observed on boards of 800+ players
   rather than fixtures. The old code would have handed every one of them
   `1.35 x proj_mean`.

**And the caveat propagated by itself.** Both `BACKTEST.md` and `STRATEGY.md`
now carry, without anyone re-typing it:

> *Dispersion is the MEASURED per-(position,band) calibration fitted
> leave-one-season-out, not the former 1.35x/0.25x constants. It is still
> proj_mean x a per-CELL constant, so it varies between bands and not within
> them: a ceiling weight fitted here measures cross-band dispersion differences
> only.*

A report that states its own limitation is the point of putting it in `caveats`
rather than in a commit message.

## 3. THE NEW FINDING: A FIFTH INDEPENDENT LOSS FOR "UPSIDE LATE"

The strategy table graded every weight profile on the **fixed** board:

```
profile           seasons won   pooled edge      95% CI
  Default                 0/2          0.00     +/- 0.00   (baseline)
  Scarcity                2/2         23.52    +/- 48.99
  Tier-Hunter             1/2         40.05    +/- 66.09
  Value-Anchor            1/2          9.73    +/- 61.29
  Need-Filler             1/2         -1.71    +/- 68.59
  Upside-Late             0/2        -79.21    +/- 58.70
```

**Upside-Late lost BOTH seasons, pooled −79.21 with an interval excluding zero
([−137.9, −20.5]).** Per-season: −79.58 in 2023, −78.84 in 2024 — a remarkably
consistent loss, not one bad draft.

**This is the first time that profile has been graded on a board whose ceiling
is not a rescaled copy of the projection.** Every previous refutation ran
against `proj_ceiling = 1.35 x proj_mean`, where the arm was arithmetically
incapable of expressing anything but "double-count the projection". Now the
ceiling varies by measured band, and the arm still loses — by essentially the
same margin in each season.

That makes **five independent lines** agreeing: barbell (10/10 losses), the
empirical draft-value study, the morning re-tune, the re-tune after the
keeper-variance correction, and this.

**Read the size honestly: N=2 graded seasons.** The report's own rule applies —
*"three drafts can pick a profile, they cannot tune weights."* This is a profile
comparison on two drafts, and the interval is wide. It is another consistent
line, not a precise coefficient.

## 4. WHAT THE RUN ALSO SHOWS, UNCHANGED BY ME

- **2025 could not be graded.** nflverse weekly stats 404 for 2025, and the
  play-by-play rebuild **refused** its own cross-validation against 2024
  (mean_abs_diff 0.489 against a 0.5 tolerance, worst 11.0 — `agrees: false`).
  So 2025 was replayed but contributes nothing to any headline. That refusal is
  the harness protecting itself and predates this work.
- **The round-1 alarm still fires** (−9.75 pts/pick), as it did before.
- **Scarcity cleared the selection rule** (2/2, pooled +23.52) and is a
  CANDIDATE only — it installs nothing without the tournament null gate.

None of these are caused by the dispersion change; they are recorded so a reader
of this note does not attribute them to it.

## 5. WHAT IS NOW UNBLOCKED

`HARNESS-DISPERSION-PREREG.md`'s gate 1 asked for a rebuilt bundle to
demonstrate the ceiling is no longer a fixed multiple. It does, on real data.
**The composite `ceiling` weight re-derivation — whose zero was to stand "until
a real-ceiling board re-runs the experiment" — now has that board.**

It still does not run before 2026-08-22.
