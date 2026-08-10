# SOURCE GRADE — which ADP board the keeper-need rule should rank by

_Run in CI (lab.yml exp36 job) → `exp_source_grade.json`. Pure core:
`test_source_grade.py` 4/4. Points-reliability (Spearman(-adp, realized)) per
(round-band × position), per season, like exp36. FFC vs MFL; FantasyPros joins when
its CSV parser lands._

## Result (2023–24; 2025 realized 404 upstream)

| season | FFC ρ | MFL ρ | composite ρ | winner |
|---|---|---|---|---|
| 2023 | 0.281 (n=92) | **0.397** (n=84) | 0.373 | MFL |
| 2024 | −0.030 (n=67) | **0.070** (n=67) | 0.001 | MFL (both weak) |

- **MFL orders realized value better than FFC in BOTH seasons.** Pooled region wins
  MFL 7 / FFC 5. **The composite (mean rank) does NOT beat MFL alone** in either
  season — so blend nothing; use the best single member.
- **Verdict: rank by MFL, not FFC** (directionally).

## Honest correction + caveats

- **My prior bet was partly wrong.** I bet the sources correlate ~0.9 so the choice
  wouldn't matter; the ρ gap (0.40 vs 0.28 in 2023) says the source *does* matter and
  MFL is the better board. Cory was right to grade it.
- **Thin + uncertain:** ~85 ranked players/season, 2 seasons, and this reports point ρ
  with **no CI on the gap** — do not treat MFL>FFC as significant yet. 2024 ρ is
  near-zero for both (the market barely ordered value that injury year), so the whole
  signal leans on 2023.
- **Format mismatch:** MFL is full-PPR / 12-team, FFC half-PPR / 10-team (ours).
  Compared by RANK so a shared offset cancels, but pass-catching RB/WR could shift.
- **Points, not dollars.** The decision-relevant confirm is **B0-per-source dollars**
  through the bridge (does following MFL earn more than following FFC?) — the follow-on.

## What changes, and what does NOT

- The **keeper-need rule holds regardless of source** (mask to need, best-ADP within
  it) — this only picks WHICH adp fills the "best-ADP" slot.
- **Do not rewire the live anchor to MFL yet.** The switch needs (a) a CI on the ρ gap,
  (b) B0-per-source dollars, (c) FantasyPros in the grade, and (d) live MFL 2026 ADP
  ingested (today the board uses FFC's `adjusted_adp`). Until then this is a
  **directional lean to MFL**, recorded, not installed.
