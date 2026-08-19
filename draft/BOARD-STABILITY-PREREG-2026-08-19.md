# PREREGISTRATION — is slot-aware structurally less stable to a rebuild?

**A, 2026-08-19, filed before running.** Draft is 08-22; the board rebuilds at
**03:00 CDT on draft morning.**

---

## 1. WHY, AND WHAT I ALREADY SAW (which is the problem)

Re-running the live-board roster drive across two rebuilds today, **shipped and
`need: 1.0` were bit-stable while slot-aware and Auto moved** — slot-aware went
TE 2 → 1, RB 10 → 11, un-fieldable weeks 1 → 2. I wrote into register 74 that
*"some arms sit near a decision boundary where a small projection change flips a
pick and cascades."*

**That sentence is drawn from ONE pair of boards. It is a hypothesis wearing a
finding's clothes, and this document exists to test it before Cory rules on
A13 — because if slot-aware is genuinely the least stable arm, that is a real
argument against shipping it two days before a draft, and it is an argument I
generated against my own recommendation.**

## 2. THE INSTRUMENT, AND WHY IT DOES NOT TOUCH THE LIVE BOARD

Five real board versions were committed today (`built_at` 00:5x, 05:11, 06:45,
07:52, 08:52). Each is checked out **in a git worktree**, so
`public/draft_data.json` in the working tree is never written. **Register 65 is
why:** an `--offline` build once overwrote the real board and four dated
archives, and the only reason it was caught was that `git status` happened to be
the next command.

Same probe, same code, only the board differs — so any movement is the board's,
not the harness's.

## 3. THE METRIC, FIXED NOW

For each arm, between **consecutive** board versions:

- **`roster_churn`** — how many of the 15 drafted players differ (symmetric
  difference ÷ 2). Range 0–15.
- **`shape_changed`** — whether the position-count vector (QB/RB/WR/TE) differs
  at all. Boolean.

Reported as the **mean across all consecutive pairs**, per arm. **More pairs
than the two I have already seen is the entire point** — a rank drawn from one
pair is what produced the claim under test.

## 4. PREDICTION

**P133: slot-aware has the HIGHEST mean `roster_churn` of the four arms.**

**FALSE if any other arm's mean churn equals or exceeds it** — in which case my
register-74 sentence overclaimed from n = 1 and must be corrected, not softened.

⚠️ **I am predicting the thing I already half-observed, on more data, which is
weak by construction.** The value here is not the direction; it is that **a
claim I wrote into the register yesterday-evening gets tested rather than
inherited.** A FALSE is the more useful outcome because it retracts something I
have already told Cory.

## 5. WHAT IT CANNOT SETTLE

**The drive fills the room in strict ADP order, which the real draft will not.**
Register 74's standing ruling — *this probe must not be used to RANK arms on
quality* — still holds and is not what this measures. **This measures STABILITY,
which is a property of the probe-plus-board and is exactly the thing the probe
can speak to**: if the same code on two boards a rebuild apart gives different
rosters, that is a fact about sensitivity regardless of whether the rosters are
any good.

**And it cannot license a ruling by itself.** If slot-aware is least stable that
is one input to A13 alongside the seat replay, not a veto.
