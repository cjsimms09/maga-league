# EXPERIMENT 33b — naive as the projection source (tune vs replace)

_Race the shipped BLEND vs the NAIVE prior-year model vs the MARKET on ranking
(per-pick Spearman over the pool) and on DOLLARS (value-greedy roster, certified
grader). Pre-registered: if naive wins, REPLACE the input; ships nothing (gate first)._

## RANKING (mean per-pick rho with realized)

- blend 0.404 · naive 0.35 · market/ADP 0.244 (n=38 picks)
- **naive − blend: -0.055 CI [-0.112, -0.002] → negative**
- naive − market: 0.106 CI [-0.018, 0.22] → inconclusive
- blend − market: 0.161 CI [0.077, 0.245] → positive

## DOLLARS (value-greedy roster per source)

- 2025: blend $100.0 · naive $0.0 · adp $100.0 (naive−blend $-100.0)
- 2024: blend $200.0 · naive $100.0 · adp $400.0 (naive−blend $-100.0)
- 2023: blend $0.0 · naive $0.0 · adp $800.0 (naive−blend $0.0)
- **naive − blend, summed: $-200.0**

## DECISION (pre-registered reading, applied not tuned)

**KEEP/TUNE: naive does not clearly beat the blend on ranking here — the exp-35 weight reduction is the lever, not replacement. Gate before installing either.**

## Caveats

- 2025: realized from harvest (nflverse unavailable)

_Ships nothing. A source change is gated on null + leave-one-season-out CV._
