# VOLATILITY SURVIVES THE DIAGNOSTIC — but only as `cv`, not as `sd`

_TERRITORY: D. Written 2026-08-17. Measurement only; nothing wired._

Two opportunity metrics died today because they were ~80% rank-collinear with
volume (TPRR, register 14; snap share, register 13). **`weekly_volatility` is the
first candidate to pass the same diagnostic — and it passes in one construction
and fails in the other.**

## The diagnostic: ρ(metric, the level measure it should complement)

| season | n | ρ(cv, mean) | ρ(sd, mean) |
|---|---|---|---|
| 2023 | 279 | −0.704 | **+0.852** |
| 2024 | 275 | −0.735 | **+0.831** |
| 2025 | 279 | −0.661 | **+0.859** |

**Neither is orthogonal.** Raw `sd` carries the mean directly (+0.85); `cv`
over-corrects by dividing and inversely tracks it (−0.70).

## The decisive test: does persistence survive removing the mean?

TPRR and snap share both *persisted* — and both persistences were inherited.

| construction | transition | raw ρ | partial ρ (given mean) | null p95 | survives |
|---|---|---|---|---|---|
| **cv** | 2023→24 | +0.482 | **+0.133** | +0.115 | ✅ |
| **cv** | 2024→25 | +0.605 | **+0.264** | +0.116 | ✅ |
| `sd` | 2023→24 | +0.454 | +0.025 | +0.117 | ✗ |
| `sd` | 2024→25 | +0.542 | +0.084 | +0.127 | ✗ |

**`cv` survives 2 of 2. Raw `sd` survives 0 of 2.**

## What that means, and it is actionable before anything ships

1. **There is a real, level-independent, persistent player volatility trait.**
   First of three candidates to clear this bar. The brief's judgement that
   volatility is the top post-draft item is now measured, not just argued.
2. **Wire `cv`, not `sd`.** The board already carries `weekly_sd`, and that
   field's apparent persistence is **entirely inherited from the mean** —
   wiring it would re-introduce the projection under a new name, which is the
   constant-multiple defect in a fresh costume.
3. **The effect is real but modest** (+0.13, +0.26). Not a headline.

## Limits

- **Two transitions.** `weekly_volatility.json` refuses 2021-22 as *"different
  scoring table"* — that refusal is a **float32 artifact** (register 27b), so
  four transitions are available. Re-running is A's (`weekly_volatility.py` is
  TERRITORY: A); this used the committed artifact only.
- Measurement, not wiring. Nothing installs.
