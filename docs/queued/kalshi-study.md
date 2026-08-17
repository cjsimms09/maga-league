# Kalshi for projections — the study (Cory, 2026-08-16)

**The directive, verbatim:** "We should also look and study Kalshi odds and how
to implement into projections.. it's something we should at least be looking at
this year."

## What Kalshi is, for our purposes

A CFTC-regulated prediction market: binary contracts priced 1¢–99¢ where the
price IS the market's probability. That's the draw versus sportsbook lines —
a sportsbook moneyline has to be de-vigged (two juiced prices solved back to
probabilities, method-dependent); a Kalshi contract at 62¢ is the crowd saying
62% directly. NFL markets run game winners plus season-scale markets
(win totals, division/championship futures), alongside the yes/no event style.

## What it could buy us — three candidate uses, honestly ranked

1. **Weekly win probabilities as a projector feature (best case).** Our
   in-season weekly arm consumes implied team totals from lines. A second,
   independently-priced probability per game lets us (a) cross-check the
   book consensus, (b) measure divergence — when the prediction-market crowd
   and the books disagree, that disagreement is itself a feature we can
   grade. Zero-cost to test once captured: the weekly grading loop already
   prices arms week by week.
2. **Season-scale markets for the season-total model.** Win totals map to
   team environment the way week-1 lines do, but with a season horizon —
   a candidate v7 feature at exactly the position (QB) where the vegas arm
   already showed its value.
3. **Side-bet/pool pricing context.** The bank's edge advisor prices from
   our model plus lines; a second market source narrows the "is the line
   off or are we?" question.

**The ceiling caveat that travels with every betting claim in this repo:**
EXP-WEEKLY-ENV measured perfect-foresight game totals at only ~+0.23 weekly
MAE. Kalshi is a different *source*, not a different *ceiling* — expect
refinement, not revolution, and grade it before believing it.

## Implementation path (staged, nothing bought, nothing built blind)

1. **Probe (now):** key-probe.yml gains an unauthenticated Kalshi arm —
   market data reads are public on their trade API; the probe prints status
   + whether NFL series answer. Zero credentials, zero cost.
2. **Capture (if the probe answers):** a `fetch_kalshi.py` arm in
   odds-capture.yml, same pattern as SGO — pure parser + I/O glue, snapshots
   committed, budget-free (public data, rate-limited politely).
3. **Grade (in season):** the captured probabilities join the weekly Vegas
   third arm's prereg as a variant — divergence-vs-books measured, not
   argued. Nothing enters a projection until it clears a preregistered bar,
   same as every arm before it.

## Named risks

- NFL markets are seasonal/rotating; ticker series must be discovered from
  the API, not hardcoded (the probe's job).
- Liquidity: thin books make prices noisy probabilities; capture should
  record volume/open-interest so thin markets can be filtered at grading.
- Terms: we read public market data; no trading, no account, no scraping
  behind auth.
