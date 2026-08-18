# OPPONENT-NEED SURVIVAL LAYER — measured verdict and a report-only proposal
_2026-08-17 · lane: opponent-need · code: `draft/backtest/opponent_need_model.py` · tests: `draft/tests/test_opponent_need.py` · artifact: `draft/data/opponent_need_2026.json` · prepared diff (NOT applied): `draft/data/patches/opponent_need_wiring.patch`_

## 1. The verdict, numbers first

**IMPROVED under the rule fixed before the first run** (improved iff pooled
ΔBrier < 0 AND the 95% CI upper bound < 0), **and the honest decomposition is
mixed enough that the gate ships OFF and the wiring is not applied.**

Walk-forward on this room's real 2024 and 2025 drafts, every seat's consecutive
real decisions treated as a wait-vs-take gap, every alive player within the
40-pick eval window graded on "gone before that seat's next pick". Both arms
share the same anchor (room proxy — no era market ADP exists on file), the same
engine-mirrored sd and the same live drift correction; they differ by the need
layer and nothing else.

| slice | n gaps | n obs | Brier base | Brier need | Δ (need−base) | 95% CI (gap-clustered bootstrap, 2000) |
|---|---|---|---|---|---|---|
| **pooled 2024+2025 (engine sd)** | 213 | 15,650 | 0.4465 | 0.4426 | **−0.0039** | **[−0.0067, −0.0015]** |
| 2024 only (tendencies from 2023 alone — thin) | 105 | 5,957 | 0.4555 | 0.4451 | −0.0103 | [−0.0148, −0.0064] |
| 2025 only (tendencies from 2023-24) | 108 | 9,693 | 0.4411 | 0.4411 | **+0.00001** | [−0.0033, +0.0030] — **null** |
| 2025, calibrated dispersion (sd = 28.7, measured 2023→2024 train-only) | 108 | 9,693 | 0.0819 | 0.0807 | −0.0012 | [−0.0022, −0.0003] |

ECE: engine-sd arms are both badly calibrated (base 0.498, need 0.501 — see §2);
calibrated-sd 2025 arm: base 0.1297, need **0.1266** (need better).

**Both directions, honestly:** the layer never grades significantly WORSE in
any slice; the pooled win is carried by 2024, whose tendency table rests on a
single prior season; the cleanest slice (2025 on two prior seasons) is a null
at engine sd and a small real win (−1.5% relative Brier, CI excluding zero)
at calibrated dispersion. That is a modest, real, but not slam-dunk signal —
exactly the shape that earns a DEFAULT-OFF flag and a human call, not a live
wiring.

## 2. Caveat that bounds the whole table (read before quoting any number)

The engine-sd baseline is a faithful mirror of the **form** of the live model
(truncated-normal conditional + drift, `survival.js` constants pinned by test)
but its **anchor** is the room proxy, whose true dispersion (~29 picks,
measured train-only) is far wider than the engine's sd cap (15, typical 2–11).
Result: 5,770 of 15,650 observations sit in the 0.9–1.0 band with predicted
0.99 vs actual 0.098 — the baseline is confidently wrong about "fallen"
players, and both arms inherit that. This is the same anchor limitation
`draft_behavior.py` §1 recorded, not a new defect. The calibrated-sd arm exists
precisely to check the delta's sign survives fixing it (it does, on 2025). No
slice here says anything direct about live calibration against real market
ADP; it says the need layer adds information **relative to the same baseline**.

## 3. Where the layer's information actually came from

Tendency lookups during grading, by fallback tier (n = 11,482 position-cell
queries): owner-conditional-on-need 8,582 (75% — `filled` 5,915, `open`
2,667), owner-unconditioned 2,740 (24%), league bucket 160 (1%). The
conditional floor (n ≥ 5, the work order's own rule; refused below — tested)
held everywhere; no conditional was invented from thin air.

## 4. Per-opponent tendencies for 2026 (mid rounds 4–9, at draft-open need state)

Measured shares of the owner's own 2023-25 mid-round decisions, conditioned on
the position's open/filled state given the keeper slate; n beside everything
in the artifact. Keeper provenance per seat: 4 confirmed
(`draft/config/keepers.json`), 6 predicted (labeled NOT-a-fact; slate locks
08-20 — regenerate then).

| owner | keepers | n (mid) | QB | RB | WR | TE |
|---|---|---|---|---|---|---|
| Bates | confirmed | 18 | 0.14 | 0.23 | **0.55** | 0.08 |
| Cory | confirmed | 17 | 0.13 | **0.40** | 0.17 | 0.30 |
| David | predicted | 18 | 0.10 | 0.43 | 0.43 | 0.05 |
| Dylan | predicted | 18 | 0.22 | 0.15 | **0.51** | 0.11 |
| Jeremy | predicted | 17 | 0.24 | 0.13 | 0.36 | 0.24 |
| Justin | confirmed | 18 | 0.04 | 0.28 | 0.47 | 0.21 |
| Marian | confirmed | 18 | 0.16 | 0.36 | 0.30 | 0.18 |
| Michael | predicted | 18 | 0.00 | 0.33 | 0.39 | 0.29 |
| Richard | predicted | 18 | 0.12 | 0.24 | **0.65** | 0.00 |
| Sam | predicted | 18 | 0.26 | 0.35 | 0.22 | 0.17 |

(Early-bucket cells are mostly league-rate fallbacks — rounds 1-3 are keeper
rounds here, n per owner is 0–6 — the same thinness `LEAGUE_MIX` already
records. These rates measure *share of mid-round picks*, so they complement
rather than restate `room_read.md`'s first-QB/TE round tells.)

## 5. Integration proposal — REPORT ONLY, nothing applied

The prepared diff (`draft/data/patches/opponent_need_wiring.patch`, verified
with `git apply --check`, **not applied**) does three things and nothing else:

1. `survival.js` CFG gains `OPPONENT_NEED_LAYER: false` (**ships OFF**) and
   `OPPONENT_NEED_W: 0.25` — the existing `BUCKET_BLEND`/`ROOM_MIX_W`
   magnitude reused, not a new tuned constant.
2. A helper `opponentNeedDist(artifact, ownerKey, round, roster, keys)` that
   evaluates the artifact's RAW COUNTS with the same n≥5 fallback chain the
   backtest measured, against the seat's LIVE roster (need states change every
   pick, so the artifact deliberately ships counts, not baked rates). An
   unresolved seat (order not yet assigned by Sleeper) gets no tilt.
3. One gated blend inside `positionProbabilities`, exactly where
   `ROOM_MIX_PRIOR` blends (after the room prior, before per-owner tilts),
   consuming `ctx.opponentNeed` = `draft/data/opponent_need_2026.json`.

Form note, stated rather than glossed: the backtest measured the layer as a
hazard tilt on the Layer-1 baseline; the proposed wiring injects the same
measured distributions at Layer 2's seat-distribution point, the engine's
native composition. Same information, adjacent composition — if A prefers the
exact measured form, the alternative is a wrapper on
`layer1TakenGivenAvailable`, and the artifact supports either.

Also known and relevant: `draft_behavior.json`'s forward test found the
PER-OWNER bucket term added nothing over league mix + need (mean rho 0.074,
perm p=0.56). This layer differs from that null arm — it conditions on need
per position with a floor and falls back to owner/league rates — but the
precedent is a reason for the OFF default, not against the measurement.

**Decision chain: A's merge (apply the patch or not) + Cory's call (flip the
flag or not). Until both, the live path is byte-identical to main.**

## 6. What would change this verdict

* Real archived market ADP for 2023-25 (the anchor limitation dissolves).
* The 2026 confirmed keeper slates on 08-20 (six seats' need states are
  predictions today; `python3 draft/backtest/opponent_need_model.py`
  regenerates the artifact in ~1s).
* A third graded season: 2024's win rests on a one-season tendency table.
