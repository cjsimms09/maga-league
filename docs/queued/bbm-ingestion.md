# BBM DATA INGESTION — external validation data for Lab experiment 24

Filed 2026-08-08 (Cory). **Sequence: AFTER the Lab harness is built** (it is —
core done 2026-08-08), feeds **Lab experiment 24** (best-ball roster-construction
translation). Free public research data. **One-time ingestion, NOT a pipeline** —
these are annual static dumps.

## 1. Fetch (in CI)
Public GCS-hosted CSVs from underdognetwork.com's data pages — **large; stream/
chunk; no auth needed.** Prioritize the two most recent complete tournaments:
- **BBM V (2024)**
- **BBM IV (2023)**
Archive raw to **L2, content-hashed**, per the founding-documents raw-forever
rule. **Runs in CI**, not the sandbox (egress + size); the Lab workflow is the
home for it, same as the draft-replay bridge.

## 2. Translation layer FIRST — with the caveat wall
Best ball is **18-round, no-lineup-setting, half-PPR, 12-team, advance-rate
economics — NOT our format.** Every finding passes through explicit translation
and is **labeled "BBM-derived, translated"** wherever it surfaces:
- their **"advance rate" ≈ our high-pool + entry blend**;
- their **no-lineups removes the efficiency dimension** (our weekly-high depends
  on lineup-setting; theirs doesn't);
- their **12-team scarcity ≠ our 10-team**;
- their **18 rounds ≠ our 15 with keepers**.
The translation is a first-class artifact, not a footnote — a finding that can't
be translated cleanly doesn't cross the wall.

## 3. The analyses
- **(a) Positional allocation structure of top-percentile rosters** — the
  RB/WR/TE/QB count-by-round shape of winners, translated to our 15-round keeper
  format.
- **(b) Spike-week validation** — compute per-player **spike-week counts** from
  their per-round scoring; test spike-count vs mean-projection as a predictor of
  roster success. **Decides whether a spike-week column earns a place on OUR
  board** (experiment 24's board-change question).
- **(c) The dead-zone check (experiment 25) at BBM sample size** — do rounds-3–6
  RBs underperform there too? BBM's N dwarfs our three seasons, so it is the
  external power behind the dead-zone prior.
- **(d) Stacking prevalence in winning rosters** — external validation of our
  correlation/stack term (experiments 6/27).

## 4. Gates UNCHANGED
BBM findings enter the Lab as **PRIORS with sample-size credibility**, then must
survive **our own harness** (league-conditional, money-graded, null + CV) before
touching the engine. **Big foreign data proposes; our data disposes.** No BBM
number reaches the board without clearing our gates on our data.

## 5. January refresh
Note **BBM VI's** data page for the January refresh via the Annual's
housekeeping — a once-a-year manual pull, folded into the Annual, not a standing
cron.
