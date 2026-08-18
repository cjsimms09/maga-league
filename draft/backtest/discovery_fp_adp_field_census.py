# TERRITORY: C
"""DOES FANTASYPROS' REAL ADP PAYLOAD CARRY A BEST/WORST/STD-DEV RANGE WE'VE BEEN DROPPING?

Cory, pushing back hard on the FFDP finding: "We already have ceilings and
floors!!! ... No we literally already have it from fantasy pros and sleeper
I believe."

CHECKED FIRST, DIRECTLY, AGAINST REAL CAPTURED DATA — not re-argued. Two real
field censuses already exist in this repo from live fetches:
  - `draft/audit/rule12_statlines.json`: 13 real Sleeper players (QB/RB/WR/TE/
    K/DST), full raw `projection_row`/`prior_season_row` key union. No
    ceiling/floor/upside/downside/percentile field anywhere — extensive stat
    splits (rec_0_4, rush_td_40p, pts_allow_21_27) and SEVEN ADP variants
    (adp_ppr/std/dynasty/idp/rookie/2qb) but no range around the point total.
  - `draft/audit/proj_correctness_evidence_2026-08-16.json`: 520 real
    FantasyPros players, captured 2026-08-16 (one day before this check) from
    `api.fantasypros.com/v2/json/nfl/2026/projections`, full raw key census.
    Same result — `points`/`points_half`/`points_ppr` and stat splits, no
    ceiling/floor field.

So Cory is not simply wrong to think FantasyPros publishes SOMETHING in this
family — their live ADP page is well known to show Best/Worst pick columns —
he may be thinking of a DIFFERENT FantasyPros product than the one already
checked (projections). And `fantasypros_adp.py`'s OWN docstring already
admits the gap: "the probe only captured FP's experts-modal, not the ADP
data table, so the exact column layout is UNCONFIRMED" — confirmed against
`draft/data/adp_sources_probe.json`'s `fantasypros_structure`, which holds
exactly that experts-modal slice and nothing from the real data rows.
`fantasypros_adp.parse()` extracts only `avg` (renamed `adp`) from each row
and drops every other key — if the raw payload does carry `best`/`worst`/
`std_dev`, this repo has been silently discarding it since the file was
written.

THIS PROBE SETTLES IT DIRECTLY rather than re-arguing from priors on either
side. It reuses `fantasypros_adp.fetch()` (read-only import, not edited) and
walks the ENTIRE raw response for every key name — not the four
`parse()` already extracts — so a `best`/`worst`/`std_dev`/`ceiling`/`floor`
field shows up here even though `parse()` would drop it today.

CI-ONLY for the egress half — the sandbox proxy blocks the host, same as
every other fetch this session. Everything that decides anything is pure and
tested.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "discovery_fp_adp_field_census.json"

YEAR = 2026


#: Same families as `discovery_ffdp_probe.FAMILIES`, plus `range` — FantasyPros'
#: known ADP-page columns are named Best/Worst/Avg/Std Dev, not ceiling/floor,
#: so the pattern has to catch that vocabulary too or a real hit reads as a miss.
FAMILIES = {
    "ceiling": (r"ceiling|upside|p90|high_?end|best_?case", "points-based upside"),
    "floor": (r"floor|downside|p10|low_?end|worst_?case", "points-based downside"),
    "range": (r"\bbest\b|\bworst\b|std.?dev|\bmin\b|\bmax\b|\brange\b",
              "FantasyPros' own known ADP-page vocabulary — a pick-slot range, "
              "not a points range, but the thing Cory may actually be "
              "remembering seeing on their site"),
    "adp": (r"\badp\b|average.?pick|rank_?ave", "confirms a row IS an ADP record"),
}


def walk_keys(payload, depth: int = 0) -> set:
    """Every dict key anywhere in the payload. Same shape as
    `discovery_ffdp_probe.walk_keys` — not imported from there because a
    shared helper would couple two probes that answer unrelated questions;
    both are small and both are tested independently."""
    keys = set()
    if depth > 12:
        return keys
    if isinstance(payload, dict):
        for k, v in payload.items():
            keys.add(str(k))
            keys |= walk_keys(v, depth + 1)
    elif isinstance(payload, list):
        for item in payload[:50]:
            keys |= walk_keys(item, depth + 1)
    return keys


def classify_fields(keys) -> dict:
    """Group observed keys into the declared families; every unmatched key
    travels rather than being dropped — same discipline as
    `discovery_ffdp_probe.classify_fields`."""
    out = {name: [] for name in FAMILIES}
    unclassified = []
    for k in sorted(keys or []):
        hit = [name for name, (pat, _why) in FAMILIES.items()
               if re.search(pat, k, re.I)]
        if hit:
            for name in hit:
                out[name].append(k)
        else:
            unclassified.append(k)
    return {"families": out, "unclassified": unclassified,
            "counts": {n: len(v) for n, v in out.items()}}


def report(text_or_none, url: str, diag: dict, classified: dict) -> dict:
    """Three verdict shapes — a failed fetch is UNMEASURED, never read as
    'FantasyPros carries no range field'."""
    if not text_or_none:
        return {
            "_territory": "TERRITORY: C — written by discovery_fp_adp_field_census.py",
            "url": url, "diag": diag,
            "verdict": ("UNMEASURED — the fetch itself did not return anything "
                       "to inspect. A fact about this run, not about "
                       "FantasyPros."),
        }
    range_hits = (classified or {}).get("families", {}).get("range") or []
    verdict = (
        "ACTIONABLE — a Best/Worst/range-shaped field was found: %s. "
        "fantasypros_adp.parse() currently DROPS this — worth reading it "
        "back in if it's real ADP-slot range, not a false match on an "
        "unrelated key." % ", ".join(range_hits)
        if range_hits else
        "NULL — no Best/Worst/std-dev-shaped field in this response either. "
        "See `unclassified` before concluding absence — FantasyPros may "
        "still gate this behind a different endpoint or a paid tier this "
        "fetch cannot see.")
    return {
        "_territory": "TERRITORY: C — written by discovery_fp_adp_field_census.py",
        "url": url, "diag": diag,
        "observed_fields": (classified or {}).get("families"),
        "unclassified": (classified or {}).get("unclassified"),
        "range_field_found": bool(range_hits),
        "verdict": verdict,
    }


def probe(year: int = YEAR, timeout: int = 30) -> dict:  # pragma: no cover  (egress; CI only)
    import fantasypros_adp as FPA

    text, url, diag = FPA.fetch(year, half_ppr=True, timeout=timeout)
    if not text:
        return report(None, url, diag, {})
    try:
        payload = json.loads(text)
    except (ValueError, TypeError):
        # SSR HTML rather than the data-API JSON — still walk it for any
        # embedded JSON object the regex-based parser already knows to find,
        # via the same rows-extraction fantasypros_adp.parse() uses.
        raw_rows = FPA._extract_rows_json(text)
        try:
            payload = json.loads(raw_rows) if raw_rows else {}
        except (ValueError, TypeError):
            payload = {}
    keys = walk_keys(payload)
    classified = classify_fields(keys)
    return report(text, url, diag, classified)


def main() -> int:  # pragma: no cover  (egress; CI only)
    rep = probe()
    OUT.write_text(json.dumps(rep, indent=1) + "\n")
    print("wrote %s" % OUT.name)
    print(rep["verdict"])
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
