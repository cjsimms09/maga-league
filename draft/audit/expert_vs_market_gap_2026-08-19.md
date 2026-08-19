# 5b's premise was wrong, and the live gap says the room pays a rookie premium

**A, 2026-08-19.** Register 5b, due 08-20.

---

## 1. THE PREMISE CHECK KILLED THE STUDY BEFORE I BUILT IT

Register 5b's next action: *"Dispatch the historical ADP capture, prereg the gap
study, grade before 08-21 if the capture lands clean."* **The capture landed** —
`draft/backtest/external_adp_historical.json`, `status: captured`, four years,
overlap 197 / 178 / 155 for 2023–25.

**So I was one step from preregistering a study on it. The premise is wrong.**

The store holds two blocks per year, `ffc` and `fantasypros`, and I read
`fp_rank` as expert opinion. It is not. `build_fantasypros_table`'s own
docstring, in `draft/adp.py:488`: *"FantasyPros **ADP** (our half-PPR format)"*,
and every row carries `adp_source: fantasypros`.

**Both blocks are MARKET measures.** The store is FFC ADP against FantasyPros
ADP — two prices — and contains **no historical expert consensus at all**.

**5b asks whether EXPERTS beat the MARKET. The missing half was never historical
ADP; it is historical ECR, and nothing in the repo has it.** The row's blocker
is misnamed, which is why it has sat.

⚠️ **AND THE FAILURE MODE IF I HAD NOT CHECKED IS THE ONE RULE 3f EXISTS FOR.**
The known-positive control I had planned — *does ADP predict realized points* —
**would have PASSED**, because both columns are real ADP and ADP does predict.
The study would have run clean, produced a plausible number, and reported it as
*"experts versus the market"* when it measured **FFC against FantasyPros**. A
passing control cannot detect a mislabelled column.

## 2. WHAT *IS* CONSTRUCTIBLE TODAY, AND IT NEEDS NO GRADING TO EXIST

5b says so itself: *"the live-gap display needs no grading to EXIST (both numbers
are published facts) but needs it to be CAPTIONED as an edge."*

For **2026** we have both: `rank_ecr` on 420 rows of `expert_spread_2026.json`
(C refreshed it at 08:29Z today) and ADP on all 700 board players. **403 join.**

**gap = ADP − ECR.** Positive means the room lets him fall past where the experts
rank him.

### The naive version ranks noise, and that is worth stating

Unrestricted, the top ten gaps are all **+197 to +371** — and every one is a
player at ECR 300–500 with an **expert spread of 327–452**. Out there both
measures are unstable and the experts do not agree with each other either.
**A "biggest disagreement" list computed over the whole board is a list of
players nobody drafts.**

Restricted to **ADP ≤ 160** — the range Cory's fifteen picks actually cover —
152 players remain and the gaps fall to a real 15–30 picks:

| falls to you (ADP − ECR > 0) | | | reaches (ADP − ECR < 0) | |
|---|---|---|---|---|
| **+29.9** | WR Jayden Higgins | ECR 122 / ADP 152 | **−43.3** | WR Jordyn Tyson |
| +29.0 | WR Jalen Coker | ECR 130 / ADP 159 | −17.2 | WR Deebo Samuel Sr. |
| +18.8 | WR Wan'Dale Robinson | ECR 99 / ADP 118 | −16.4 | RB Cam Skattebo |
| +17.2 | WR Michael Pittman Jr. | ECR 89 / ADP 106 | −14.9 | RB Jeremiyah Love |

## 3. THE PATTERN, MEASURED RATHER THAN EYEBALLED

The "reaches" column looked like rookies, which is an interpretable positive and
therefore a thing to test rather than assert (rule 3d).

| group | n | mean gap | median |
|---|---|---|---|
| **rookies** (`years_exp == 0`) | **8** | **−8.7** | −6.8 |
| veterans | 144 | −0.2 | −0.2 |

**Veterans minus rookies: +8.5 picks. Permutation p = 0.0227**, 4,000 shuffles,
seed 20260819.

**Inside ADP 160, the room drafts rookies about eight and a half picks earlier
than the expert consensus ranks them, and prices veterans almost exactly where
the experts do.**

## 4. WHAT THIS IS NOT — and 5b is explicit about why it matters

**This is NOT an edge and must not be captioned as one.** It says where two
published measures disagree. It says **nothing about which is right.** The
experts may simply be wrong about rookies; the room may be pricing information
the consensus lags. **Deciding that is exactly the graded half — and §1 shows the
data to grade it does not exist.**

**Other limits, stated rather than buried:**
- **n = 8 rookies.** p = 0.0227 on eight players is real but fragile, and one
  board is one sample.
- The ADP ≤ 160 cut is argued (it is Cory's pick range, picks 8–148) and was
  chosen before the rookie test was run — **but it was chosen after seeing that
  the unrestricted list was noise**, and that ordering is recorded here rather
  than smoothed over.
- ECR is a rank, ADP is a price in a different scale; differencing them is a
  crude comparison that only works because both are "expected pick number".

## 5. WHAT HAPPENS NEXT

- **Register 5b's blocker is renamed** from *historical ADP* (landed, wrong
  thing) to **historical ECR** (absent, C's egress), and the row re-dated.
- **The live gap is an observation A can hand B**; whether it earns space on the
  war room three days out is B's call, not mine. Routed.
- **A prediction is filed** so the rookie-premium direction gets graded on 2026
  outcomes instead of becoming folklore.
