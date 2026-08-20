# PREPARED FIX, AWAITING A — THE KEEPER-LOCK ALARM CANNOT FIRE

**Relay, 2026-08-18. Register 5l. `draft/build.py` is A's territory, so this is
prepared and NOT applied** — the same pattern as
`E1_proposed_fix_for_approval_2026-08-17.md`.

**ASK:** apply the three-line change in §3, or reject it with a reason.
**DEFAULT if nothing happens:** Cory takes the Saturday-morning freeze, it stamps
`PROVISIONAL — "the keeper lock has not passed"` when the lock passed at 6:00 PM
Friday, and the alarm built to catch exactly that stays silent.

---

## 1 · WHAT IS WRONG

`keeper_slate.assess_slate()` takes `keeper_lock_passed=False`. **All three call
sites in `build.py` omit it** (lines 312, 336, 344), and nothing else assigns it.
So the board's `keeper_slate.keeper_lock_passed` is **permanently `false`**.

Two consumers key on it, and both are load-bearing:

**`draft/freeze_pre_draft.py:275`** — stamps the freeze `CONFIRMED` only if
`locked and truth and not mismatches`. With `locked` permanently false, **the
pre-draft freeze can never be CONFIRMED**, however complete the slate is. Its own
docstring calls the confirmed freeze *"the grading baseline for the season."*

**`draft/backtest/standing_check.py:531`** — escalates with *"THE KEEPER LOCK HAS
PASSED AND THE FREEZE IS STILL {status}. Re-take it now: the diff between the two
runs IS the keeper-scarcity evidence, and it is unrecoverable once the draft
starts."* Gated on `locked` alone. **That escalation is dead code.**

## 2 · THE PART THAT MAKES THIS WORTH READING TWICE

`standing_check.py`'s own docstring says:

> **THE TRIGGER IS DERIVED, NOT A DATE.** `keeper_slate.keeper_lock_passed` is
> computed from Sleeper placements on the live board. No "20 August" literal
> appears here, so a lock that moves — or one that happens early — is still
> caught. A hardcoded date is a second definition of the lock and would disagree
> with the board on exactly the day it mattered.

**Every sentence of that is a good argument, and the premise is false.** It is not
computed from placements. It is a parameter defaulting to `False` that nobody
passes. **The author reasoned carefully about a mechanism that was never wired**,
and the reasoning is what makes it read as settled.

⚠️ **AND `safe_to_treat_as_truth` DOES NOT COVER IT.** That field is
`confirmed` — all teams *placed* and consistent. Placement and lock are different
events: the lock can pass with teams still unplaced, which is precisely the state
the escalation exists to catch. So a reader checking "surely something else
notices" finds a field that looks like it would and does not.

**This is the "a check that cannot fail, reported as a check that passed" family,
and it is the second instance found today** — register 5k was the first
(`season_now` never passed, `rookie_affinity` zero for 10 of 10 managers).

## 3 · THE FIX

Cory's ruling already lives in config as of 08-18 —
`draft/config/league_config.json`:

```json
"deadline": { "date": "2026-08-21", "time": "6:00 PM", "tz": "CDT",
              "cory_ruling_verbatim": "Keepers will be set by 08/21 at 6pm" }
```

Derive the flag from that and from placements, and pass it at all three sites:

```python
def _keeper_lock_passed(cfg: dict, placements) -> bool:
    """Has the keeper lock passed?

    TWO INDEPENDENT PATHS, EITHER SUFFICIENT, because the previous version had
    ZERO and read as if it had one:
      * placements exist on the draft — the commissioner has placed keepers,
        which cannot happen before the lock; this is the DERIVED path the
        standing_check docstring believed was already here.
      * the configured deadline has passed — Cory's ruling, verbatim, in
        league_config.json rather than a literal in this file.
    A hardcoded date alone would be a second definition of the lock. A
    placement-only rule misses a lock that passes with teams unplaced, which is
    exactly the state the alarm exists to catch. Neither alone is enough.
    """
    if placements:
        return True
    d = ((cfg.get("keepers") or {}).get("deadline") or {})
    if not d.get("date"):
        return False        # unknown is NOT "passed" — the safe direction
    tz = _dt.timezone(_dt.timedelta(hours=-5))          # CDT
    hh, mm = _parse_12h(d.get("time") or "11:59 PM")
    y, m, dd = (int(x) for x in d["date"].split("-"))
    return _dt.datetime.now(tz) >= _dt.datetime(y, m, dd, hh, mm, tzinfo=tz)
```

Then at lines 312, 336, 344:

```python
keeper_slate_mod.assess_slate(teams, designations, placements=placements,
                              keeper_lock_passed=_keeper_lock_passed(cfg, placements))
```

## 4 · HOW TO KNOW IT WORKED, WITHOUT WAITING FOR FRIDAY

The whole difficulty is that the correct behaviour only appears after 6:00 PM
Friday, which is after the last useful moment to find out it is wrong.

**So drive the clock, do not wait for it.** A test with three arms:

1. **before the deadline, no placements** → `keeper_lock_passed is False`, freeze
   stamps `PROVISIONAL`, `standing_check` does not escalate. *(today's state —
   this is the control that proves the fix did not simply hardcode `True`)*
2. **after the deadline, no placements** → `True`, and `standing_check`
   **escalates** on a `PROVISIONAL` freeze. **This arm is the whole point: it has
   never once been reachable.**
3. **before the deadline, placements present** → `True` via the derived path, so
   an early lock is caught without a date.

## 5 · WHY I DID NOT JUST SHIP IT

`build.py` is A's file and the change is a behaviour change three days before the
draft. **But it is small, it is testable without waiting for Friday, and the cost
of leaving it is that a documented irreversible step silently misreports on the
one morning it matters.** Recommendation: apply.

**If you reject it, the thing to say is what SHOULD set the flag** — leaving it
permanently false and the two consumers keyed on it is the one outcome with no
argument for it.
