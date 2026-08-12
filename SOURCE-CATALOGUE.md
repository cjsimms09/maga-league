# TERRITORY: C
# THE SOURCE CATALOGUE — what the producers ACTUALLY emit

**Every entry below was read off a real captured response or the assigning line of code.
Nothing here is copied from a provider's documentation, and nothing is what a consumer
believes.** That distinction is the entire point: five defects this week were consumers
guessing at a contract nobody had written down, and a catalogue built from beliefs would
have recorded the same guesses.

**Scope, bounded per rule 9.** Four sources; only fields something reads; observed types.
Where I could not observe a live response, the entry says so rather than filling the gap.

---

## THE CLASS THAT MATTERS MOST — misleading names and misleading presence

**A field whose NAME or PRESENCE answers a different question than it appears to. These
are the entries worth the catalogue's existence, and each is measured.**

### `proj_sleeper` — the value is Sleeper's, the PRESENCE is FantasyPros'

`draft/build.py:532`, inside `if fp_proj:` — the FantasyPros attachment block:

```python
p["proj_sleeper"] = round(float(p["proj_baseline"]), 2)   # raw, unmodelled
p["proj_fantasypros"] = v
```

**Measured on the live board (1760 players):**

| | count |
|---|---|
| `proj_sleeper` present | **437** |
| `proj_fantasypros` present | **437** |
| `proj_sleeper` WITHOUT `proj_fantasypros` | **0** |
| `proj_sleeper == proj_baseline` | **437 of 437** |

**So `proj_sleeper` CANNOT answer "does Sleeper project this player."** Its presence is
perfectly determined by whether FantasyPros attached. **1,323 players carry a
Sleeper-derived `proj_baseline` and no `proj_sleeper`.** B inferred K and DEF were
synthesised from exactly this field and was wrong.

**Read `proj_baseline` for "what does Sleeper say" — it is 100% present.**

### `adp_stale` — named like a boolean, carries a dict or None

**Measured: 1,755 `None`, 5 `dict`.** The payload is `{"direction": "falling", "slots":
14.33, "days": 2}`.

`if p["adp_stale"]:` is correct. **`p["adp_stale"] == True` is False for all five stale
players**, and `p.get("adp_stale", False)` looks safe and is not a boolean. Not currently
a defect — recorded because the name invites one.

### Four names for "where does this player go"

Observed on one player: `adp` 1.33, `raw_adp` 1.33, `consensus_rank` 1.33,
**`adjusted_adp` 1.1**. Three agree and one does not. A consumer picking whichever name it
remembers gets the market number three times out of four and the *adjusted* number once.

### Four names for one date, already load-bearing

`A`'s `standing_check.DATE_KEYS = ("date", "observed_at", "captured_at", "as_of")` exists
because its first version hardcoded `"date"`, found nothing in `external_adp_series` (which
uses **`observed_at`**), computed a newest date of `""`, and reported the row **QUIET** — a
staleness check that could never fire, inside the file whose purpose is catching checks
that can never fire.

| archive | date field |
|---|---|
| `adp_series.json`, `proj_series.json` | `date` |
| `external_adp_series.json` (C) | **`observed_at`** |
| `format_census_series.json` (C) | `observed_at` |
| `board_pins.json` (C) | `observed_at` |

---

## SLEEPER — observed in `league_history.json`, real captured responses

| field | observed type | note |
|---|---|---|
| `season` | **`str`** `'2025'` | **NOT an int.** `[e for e in seasons if e["season"]==2025]` silently returns `[]` |
| `player_id` | **`str`** `'9221'` | string everywhere, including as dict keys |
| `picks[].round`, `.pick_no`, `.roster_id` | `int` | |
| `picks[].is_keeper` | `bool` | a keeper is not a decision — every arm of the replay excludes these |
| `weeks` | `dict` keyed by **`str`** `'1'` | not a list, not int keys |
| `weeks[w][].players_points` | `dict` `str -> float` | **only players ON a roster that week** — a mid-season cut loses its later weeks |
| `weeks[w][].starters` | `list` | **MIXED**: `['6770', '3198', ..., 'DET']` — numeric player ids AND bare team codes for DEF |
| `owners` | `dict` keyed by roster id `str` | `display_name`, `team_name`, `user_id` |

**The `starters` mixing is the one to watch.** Any consumer treating the list as
homogeneous numeric ids will mis-handle every defence, in every week, in every season.

---

## FANTASYPROS — observed in `proj_series.json`, `adp_series.json`

| field | observed type | note |
|---|---|---|
| `series[].date` | `str` `'2026-08-09'` | |
| `series[].source` | `str` `'fantasypros'` | |
| `series[].proj` | `dict` `str -> float` | keyed by **Sleeper** player_id, not a FantasyPros id |
| `series[].adp` | `dict` `str -> float` | keys include bare team codes (`'HOU'`, `'LAR'`) alongside numeric ids |

**Coverage is 25%, not a failure.** 437 of 1760. `build.py` treats FP as an upgrade and
never a build dependency, which is why a low number here is not an error.

---

## MFL — NOT OBSERVABLE FROM THIS SANDBOX, and the variance is the point

**Every MFL request from here returns a proxy 403.** These entries come from
`mfl_adapter.py`, written against live CI responses — so they are observed, but at one
remove, and I flag that rather than implying I re-verified them.

| shape | what it does |
|---|---|
| `{"$t": "12"}` | **scalars arrive WRAPPED.** A bare `int(v)` fails; every read goes through the unwrapper |
| one-vs-many | **a single element arrives as a DICT, many as a LIST.** `listify` exists for this; it was documented in one adapter docstring and incompletely applied |
| `draftUnit` | sometimes a **LIST** (P5) |
| scoring points | `*0.5`, `=3`, `a/b` rates, `/N` leading-slash | four notations for one quantity; `=N` and zero denominators are refused |
| ranges | lower bounds may be **negative** |

**Honest limit:** MFL is the source I would least trust a catalogue of, because its shape
varies by league configuration rather than by endpoint. **A catalogue entry per field
cannot capture "this field's type depends on how many of the thing there are."** That is a
finding, and it is why the adapter, not the catalogue, is the contract for MFL.

---

## NFLVERSE — reachable, not catalogued here

nflverse passes the proxy where MFL does not, so it *is* observable — but nothing in this
lane currently reads it outside the F3 ingest, which runs in CI. **Rather than catalogue
fields from memory I am marking this incomplete.** One CI run against a live response
would settle it, and until then this section is a gap I am naming rather than filling.

**One thing already established and worth carrying:** nflverse **weekly** does NOT carry
`age`; `import_seasonal_rosters` does. An age question needs the weekly ⋈ roster join.

---

## THE STRUCTURAL HALF — one reader, not three parsers

**The catalogue documents the contract; it does not enforce it.** The enforcement is that
every consumer reads a source through one place, so a field arriving as epoch seconds
instead of ISO **breaks once, loudly**, instead of silently in three consumers.

Current state, honestly:

| source | single reader? |
|---|---|
| MFL | **YES** — `mfl_adapter.py`. This is why MFL's shape variance has been survivable |
| Sleeper | **NO** — `league_history.json` is parsed independently by `oracle_capture`, `standing_check`, and the replay harness |
| FantasyPros | **PARTIAL** — `adp_mod.build_fantasypros_projections` is the fetch path, but archives are re-parsed by each consumer |
| nflverse | single ingest path, CI only |

**The Sleeper row is where the next defect of this class will come from**, and I am
naming it before it happens rather than after: three consumers each parse `season` as
whatever they assume, and `season` is a **string**.
