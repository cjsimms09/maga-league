# E's twelfth sweep — `rookie_affinity` is 0.0 for all ten managers, and it could not have been anything else

**Session E (red team), 2026-08-17.** Board: `public/draft_data.json`,
`manager_profiles`, built from 3 completed drafts.

`manager_profiles` is the surface that tells Cory how his nine opponents draft.
It is the last section of the board no sweep had opened.

---

## THE FINDING

```
manager_profiles.league_average.rookie_rate  = 0.0
rookie_affinity.rate       across 10 managers = {0.0: 10}
rookie_affinity.league_rate across 10 managers = {0.0: 10}
manager summaries mentioning rookies          = 0
```

**Zero rookies drafted, by anybody, across three drafts of a 10-team league.**
That is ~450 picks. It is not plausible on its face, and it is not true — it is
what the arithmetic is forced to produce.

## THE CAUSE — one field taken from today where its neighbours are taken from then

`draft/managers.py:108-128` builds each historical draft row. Look at which
source each field prefers:

```python
"position": (meta.get("position") or info.get("position") or "?").upper(),
"team":     (meta.get("team")     or info.get("team")     or "").upper(),
"market_rank_real": bool(real and real.get("adp")),   # flags contemporaneous vs today
"years_exp": info.get("years_exp"),                   #  <-- today ONLY, no meta, no flag
```

`meta` is the **contemporaneous draft metadata**; `info` is **today's Sleeper
player DB**. Position and team correctly prefer `meta`. `market_rank` even
carries an explicit `market_rank_real` flag distinguishing *"contemporaneous ADP"*
from *"today's consensus rank standing in for it"*. **`years_exp` alone is read
from today's payload, with no contemporaneous fallback and no staleness flag.**

Then, at `:153` and `:204`:

```python
league_rookie = _rate(real_rows, lambda r: r.get("years_exp") == 0)
```

**A player drafted as a rookie in 2023 has `years_exp` 3 today, so he is not
counted. The only rows that could count are players who are rookies in 2026 — and
by definition none of them were in the 2023-25 drafts.** The rate is pinned at
0.0 by construction. **The measurement could not have come out any other way**,
which is Rule 3d's signature and the §1 defect class exactly.

**This is the same lookahead-contamination class the repo already names
elsewhere and handles correctly** — `engine.js:517` on why `injury_status` and
`depth_chart_order` are *"PERMANENTLY UNAVAILABLE"* to the backtest: *"Writing
today's values into a 2023 replay would be LOOKAHEAD CONTAMINATION."* Here the
same class runs the other way — today's value written into a 2023 draft — and
instead of contaminating, it **erases**.

## THE CLAUSE THAT CAN NEVER FIRE

`managers.py:466`:

```python
r = p["rookie_affinity"]
if r["rate"] > r["league_rate"] * 1.5 and r["rate"] > 0.08:
    bits.append("chases rookies")
```

With `rate` and `league_rate` both 0.0, `0.0 > 0.0` is false and `0.0 > 0.08` is
false. **"chases rookies" cannot appear in any manager's summary, for any
manager, ever.** Observed: 0 of 10 summaries mention rookies.

This is the same shape as the engine's own `games_missed_3yr` — *"read here and
WRITTEN BY NOTHING… `undefined >= 8` is false, so this durability clause has
never fired for any player in any run"* — which the engine documents about
itself. **This one is undocumented.**

## THE MODULE'S OWN HEADER CLAIMS THE OPPOSITE

`managers.py:25`, describing how the profile survives a thin sample:

> *"The ADP-free metrics (positional timing, homer, **rookie affinity**) carry
> the profile when sample size is thin, because they need no market baseline."*

**Rookie affinity is named as one of three metrics that CARRY the profile, and it
is identically zero for all ten managers.** The header is describing a
three-legged stool with two legs.

## AND IT CONTRADICTS A MEASUREMENT THIS PROJECT ALREADY BANKED

The 08-16 league benchmark found **rookie rate and rookie profit** to be one of
the two separators between the top-3 drafters and the tool, and a rookie
draft-capital prior **cleared its preregistered bar at +25.1, 38% of Cory's
pooled gap.** That study ran through a different path
(`draft/tools/drafter_skill.py`, which maps `rookie_rate` to
`("behaviors", "rookie", "rate")`).

**Both cannot be right.** Either rookie drafting discriminates between managers —
in which case `manager_profiles` is blind to the single largest measured
improvement available to this project — or it does not, in which case the
drafter study's headline needs re-reading. **My reading is that `manager_profiles`
is the broken one**, because its zero is explained by the arithmetic above
whereas the drafter study's +25.1 cleared a preregistered bar. But that is a
comparison of two lanes' work and the ruling is A's, not mine.

## Rule 3d, answered

1. **Did the input vary?** `years_exp` varies richly across players *today*
   (0–13). But the quantity the metric needs — years of experience **at the time
   of that draft** — is never read at all.
2. **Did it arrive?** Yes: `managers.py:122` populates it on every row, `:153`
   and `:204` consume it, and the output is 0.0 for 10 of 10 managers.
3. **Could the check have fired?** **No, and that is the finding.**
   `rate > league_rate * 1.5 and rate > 0.08` with both terms at 0.0 is
   unsatisfiable.

## ASK / EVIDENCE / REC / DEFAULT → **A** (owns `draft/managers.py`)

```
ASK:      Should rookie status on a historical draft row be derived from
          contemporaneous data rather than today's years_exp?
EVIDENCE: rookie_rate 0.0 league-wide and 0.0 for all 10 managers across 3
          drafts (~450 picks); years_exp read only from `info` (today) while
          position and team in the same dict prefer `meta` (then);
          "chases rookies" is unsatisfiable and fires 0 times; the module
          header names rookie affinity as one of three metrics carrying the
          profile.
REC:      A rules. The cheap correct source is the draft season minus the
          player's rookie season, and `league_history.json` carries the
          draft season on every row. If that is not derivable, the honest
          output is ABSENT with the coverage reported -- the same treatment
          `position` already gets via "?" -- rather than 0.0, which reads as
          a measured "nobody drafts rookies".
DEFAULT:  Filed. Not draft-critical: this feeds opponent SUMMARIES and the
          rookie leg of the profile, not the board's ranking, and the softmax
          that does reach survival is driven by bpa_rate rather than this.
          Post-08-22 unless A disagrees.
```

**Scope limit, stated:** I have not checked whether `homer_index` or the
positional-timing metrics have the same period problem. They read `meta`-backed
fields (`team`, `position`, `round`), so they look sound — but *"look sound"* is
not *"checked"*, and I am saying which one this is.
