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

**Scope limit, now CLOSED rather than left standing.** I originally wrote that
`homer_index` and the positional-timing metrics *"look sound, but 'look sound' is
not 'checked'"*. I checked. **They are not degenerate — only `rookie_affinity`
is**, and the contrast is what makes this a specific defect rather than a
systemic one:

| metric | values across the 10 managers |
|---|---|
| `homer_index.rate` | 0.056 – 0.094, **7 distinct** |
| `homer_index.team` | **9 distinct teams** |
| `bpa_vs_need.bpa_rate` | 0.247 – 0.370, **all 10 distinct** |
| positional `consistency` | present on **10 of 10** |
| **`rookie_affinity.rate`** | **0.0 on 10 of 10** |

And the summaries discriminate in plain language, which is the point of the
whole module:

> *"Reaches ~7 picks early. Takes QB early (round 5 on average, 1.4 rounds before
> the league). Takes TE early (round 5 on average, 1.8 rounds before the
> league)."*
> *"Drafts near market value. Waits on QB (round 8). Waits on TE (round 8)."*

**So three of the four legs carry weight and one is sawn off.** That is better
news than the alternative and it sharpens the ask: the fix is to one metric, not
to the module.

**One residual asymmetry, observed but NOT a finding.** `position` carries an
explicit `pos_coverage` measure and a `"?"` sentinel so a caller *"must be able
to tell 'he has no tendency' from 'we could not see his picks'"*. `team`, which
`_homer` depends on, has no equivalent coverage measure — it silently falls back
from contemporaneous `meta` to today's `info`, so a player who changed teams
between the draft and now would be attributed to the wrong one. **The homer
numbers look right** (7 distinct rates, 9 distinct teams, 2–3× the 1/32 random
baseline), so nothing suggests it is actually misfiring — I am recording the
missing guard, not claiming a defect behind it.

---

# APPENDIX — a hypothesis that did NOT survive, and an assumption nobody has checked

**I nearly filed a much bigger finding here and stopped because the evidence did
not support it.** Recording both halves, because the near-miss is the useful part.

## The hypothesis: "`meta` is empty everywhere, so every *then* field is really *now*"

`managers.py` is written around a contemporaneous-first fallback:

```python
"position": (meta.get("position") or info.get("position") or "?").upper(),
"team":     (meta.get("team")     or info.get("team")     or "").upper(),
```

If `meta` were always empty, both would silently degrade to **today's** values —
and `_homer` would be measuring *which NFL teams a manager's old picks play for
now*, not which teams he drafted from. `"loves SF (7% of picks)"` would then
describe nothing the manager ever did. That would be far worse than E13, because
`homer_index` **does** vary and therefore looks trustworthy.

**And the only copy of historical picks I can inspect supports it:**

```
league_history.json — 480 historical draft picks
  carrying metadata.team     : 0  (0.0%)
  carrying metadata.position : 0  (0.0%)
```

**Zero of 480.** Every pick's `metadata` is an empty object.

## Why I did not file it

**`league_history.json` is not what `managers.py` reads.** The production path is
`build.py:1493` → `si.all_drafts(league_id)` → `fetch_draft_picks()` →
`_get("/draft/{id}/picks")`, which returns **Sleeper's raw payload**. Sleeper's
draft-picks endpoint is documented to return a per-pick `metadata` object
carrying `position` and `team`. **So `meta` is probably populated in production,
and the stripped `league_history.json` is a different store built by a different
exporter.**

**Probably. I could not check**, and per the standing rule that *"we can't get
it" is not a finished answer*, here is the response code from an attempt made
today rather than a claim about the past:

```
GET https://api.sleeper.app/v1/league/1374848328470102016      HTTP 000
GET https://api.sleeper.app/v1/draft/1248121522766217216/picks HTTP 000
```

Sleeper is unreachable from this sandbox, so the hypothesis is **unverified, not
refuted.**

## What that leaves — an assumption under three metrics, and a one-line check

**`homer_index`, positional timing and `bpa_vs_need` all rest on `meta` being
populated, and nobody has ever confirmed it.** The code is *written* as though
`meta` normally wins; there is no coverage measure for it, and no test asserts
it. Contrast `position`, which carries an explicit `pos_coverage` figure and a
`"?"` sentinel precisely so a caller *"must be able to tell 'he has no tendency'
from 'we could not see his picks'"* — **that guard measures whether a position
was resolved, not whether it was resolved from the right era.**

**The check costs one line to anyone with egress:**

```python
picks = si.fetch_draft_picks("<a completed draft_id>")
print(sum(1 for p in picks if (p.get("metadata") or {}).get("team")), "of", len(picks))
```

If that prints `0 of N`, `homer_index` is measuring today's rosters and the
`"loves <TEAM>"` line in every opponent summary is wrong. If it prints `N of N`,
this appendix closes and only E13 stands.

**Filed as E14 — an unverified assumption, not a defect.** I am deliberately not
calling it broken: the one store I can read says one thing and the store the code
actually uses is out of reach, and saying "broken" on that evidence is the error
this lane exists to prevent.

## One correction to E13 above, while I am here

E13 says `years_exp` is read *"from today's payload, with no contemporaneous
fallback."* True of the code — but worth sharpening so nobody tries the obvious
fix: **Sleeper's pick metadata carries no `years_exp` field at all**, so
`meta.get("years_exp")` would be `None` for every row and would change nothing.
**The fix has to be derivation — draft season minus rookie season — which is what
E13's REC already says.** There is no fallback to add.

