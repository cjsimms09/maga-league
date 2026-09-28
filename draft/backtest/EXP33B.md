# EXPERIMENT 33b — naive as the projection source (tune vs replace)

_Race the shipped BLEND vs the NAIVE prior-year model vs the MARKET on ranking
(per-pick Spearman over the pool) and on DOLLARS (value-greedy roster, certified
grader). Pre-registered: if naive wins, REPLACE the input; ships nothing (gate first)._

## RANKING (mean per-pick rho with realized)

- blend 0.377 · naive 0.349 · market/ADP 0.187 (n=45 picks)
- **naive − blend: -0.028 CI [-0.081, 0.022] → inconclusive**
- naive − market: 0.162 CI [0.05, 0.271] → positive
- blend − market: 0.189 CI [0.106, 0.276] → positive

## DOLLARS (value-greedy roster per source)

- 2026: blend $0.0 · naive $0.0 · adp $0.0 (naive−blend $0.0)
- 2025: blend $0.0 · naive $0.0 · adp $200.0 (naive−blend $0.0)
- 2024: blend $200.0 · naive $100.0 · adp $1025.0 (naive−blend $-100.0)
- 2023: blend $0.0 · naive $0.0 · adp $800.0 (naive−blend $0.0)
- **naive − blend, summed: $-100.0**

## DECISION (pre-registered reading, applied not tuned)

**KEEP/TUNE: naive does not clearly beat the blend on ranking here — the exp-35 weight reduction is the lever, not replacement. Gate before installing either.**

## Caveats

- 2026: realized from harvest (nflverse unavailable)
- 2025: realized from harvest (nflverse unavailable)

_Ships nothing. A source change is gated on null + leave-one-season-out CV._
