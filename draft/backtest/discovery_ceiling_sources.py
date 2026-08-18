#!/usr/bin/env python3
# TERRITORY: C (fetch) — dispatched by the relay under register 4t.
"""WHERE DOES A REAL, PUBLISHED, PER-PLAYER POINT CEILING COME FROM?

Cory, 2026-08-18, in order:
    "I'm starting to question how we're doing a ceiling.. that makes no sense"
    "this isn't a ceiling…"
    "ceiling is a projected score that we will have to get from outside source"
    "we need to get them from somewhere!!!"
    "We will probably have to get from fantasy pro api don't think we ever got"

THE LAST ONE IS ALREADY ANSWERED, AND THE ANSWER IS NO — WE DID GET IT.
`draft/audit/proj_correctness_evidence_2026-08-16.json` holds a real capture of
`api.fantasypros.com/v2/json/nfl/2026/projections?position=ALL&scoring=HALF&week=draft`
from 2026-08-16: **596 raw rows, full UNFILTERED key census, 40 distinct stat
keys.** Every one is a point estimate — `points`, `points_half`, `points_ppr`,
`pass_yds`, `rush_tds`, … — and there is **no high/low/ceiling/floor/range key
anywhere in the payload.** FantasyPros' projections API serves a consensus MEAN
and nothing around it. So the FP projections endpoint is not the answer, and we
do not need to spend a CI run finding that out a second time.

That is a null on ONE endpoint, not on the question. This probe asks the rest of
it, properly, in one run.

── WHY THIS EXISTS AS ITS OWN FILE, WHEN `fp-projections-probe.yml` ALREADY RAN ──

Because that probe **could not have found a ceiling even if one was there.** It
calls `FP.parse_projections()`, which walks `_FP_STAT_MAP` — a 9-key whitelist —
and drops every key not in it. Then it reports coverage and a scored sample. A
payload carrying `ceiling: 341.2` would have produced exactly the same green
"VERDICT: FantasyPros DOES serve projections" line, because the ceiling would
have been dropped before anything looked at it.

**That is this week's defect, again: a check that cannot fail, reported as a
check that passed.** `_FP_STAT_MAP`'s own comment already records this costing us
five real scoring categories. So the rule here is absolute — **THIS PROBE NEVER
FILTERS.** It censuses every key at every depth, with counts, and retains sample
rows VERBATIM so a human reads the real shape rather than our summary of it.

── THE CANDIDATES, AND WHAT EACH WOULD BUY ────────────────────────────────────

  1. `consensus-rankings?type=draft` (ECR) — expert consensus rank, and the ADP
     census already proved this family carries **`rank_min` / `rank_max` /
     `rank_std`** per player. That is a REAL, PUBLISHED, PER-PLAYER dispersion
     from an outside source. It is in RANK space, not points, so it is not a
     ceiling by itself — but rank_min is "the most bullish credible expert has
     him HERE", which is exactly the quantity a cohort p90 has been faking.
  2. `...&experts=show` — if FP returns the individual expert ranks behind the
     consensus, the per-player distribution is fully observed rather than
     summarised into three numbers.
  3. Sleeper's projections API — never censused unfiltered. `rule12_statlines`
     covered the PLAYER endpoint, not this one.
  4. FP's weekly projections — a different product from season/draft, and the
     one most likely to carry a range if any of them do.

── WHAT A HIT LOOKS LIKE, AND WHY THE TEST CARRIES A KNOWN-POSITIVE ───────────

A "no ceiling field found" result is only worth reading if this code CAN find
one. `test_discovery_ceiling_sources.py` feeds it a synthetic payload that DOES
carry `ceiling`/`high`/`floor_pts` and fails if the census misses them. Without
that control this file is another check that cannot fail.

CI-ONLY for the egress half — the sandbox proxy 403s every one of these hosts
(`recentRelayFailures` on the agent proxy shows exactly that for
api.fantasypros.com). Everything that DECIDES anything is pure and tested.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "discovery_ceiling_sources.json"

YEAR = 2026

#: Substring families — these are distinctive enough that seeing them ANYWHERE in a
#: key name means the field is about a range. `ceiling`, `proj_ceiling`,
#: `ceilingPoints` all qualify.
_RANGE_SUBSTRINGS = ("ceil", "floor", "upside", "downside", "percentile",
                     "quantile", "variance", "spread", "stddev", "bestcase",
                     "worstcase")

#: Token families — short, ambiguous words that must be a WHOLE token to count.
#: `high` in `proj_high` is a hit; `high` inside `highlight` is not. This half is
#: where `rank_min` / `rank_max` / `rank_std` get caught, and catching them is the
#: point: the last census had all three in its payload, filed them under
#: `unclassified`, and printed the verdict "NULL".
#: `pct` is deliberately ABSENT: it fired on `cmp_pct` (completion percentage) in
#: the real Sleeper capture, and a completion rate is not a range. `percentile`
#: covers the case we actually want.
_RANGE_TOKENS = {"high", "low", "best", "worst", "min", "max", "std", "sd",
                 "range", "band", "p90", "p10", "conf", "dev"}

_TOKEN_SPLIT = re.compile(r"[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])")


def tokens(key: str) -> list:
    """`proj_high` -> [proj, high]; `pointsHigh` -> [points, high].

    Written as tokenisation rather than a regex with `\\b` because `_` is a WORD
    character: `\\bhigh\\b` does NOT match `proj_high`, and `\\bmin\\b` does NOT
    match `rank_min`. The first draft of this file used exactly that pattern and
    its own known-positive test caught it — which is the only reason this comment
    exists instead of another confident null.
    """
    return [t.lower() for t in _TOKEN_SPLIT.split(key or "") if t]


class _RangeShaped:
    """Kept `.search()`-shaped so it reads like the pattern it replaced."""

    @staticmethod
    def search(key: str):
        toks = tokens(key)
        flat = "".join(toks)
        if any(s in flat for s in _RANGE_SUBSTRINGS):
            return True
        return bool(set(toks) & _RANGE_TOKENS)


RANGE_SHAPED = _RangeShaped()

#: NFL team abbreviations. `MIN` is Minnesota, and it appeared as a literal KEY in
#: the real Sleeper capture — where the token rule read it as "minimum". Found by
#: replaying this classifier over `proj_correctness_evidence_2026-08-16.json`
#: rather than by reasoning about it.
_TEAM_CODES = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
    "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE",
    "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
}


def why_not_a_point_range(key: str):
    """A reason this range-shaped key is NOT a points ceiling, or None if it might be.

    Rules, not a hand-list, because a hand-list only excludes the fields somebody
    already saw — `adp_dynasty_std` was in the real payload and no hand-list had it.

    ⚠️ THIS IS THE FUNCTION THAT CAN HIDE A REAL ANSWER. Every rule here requires a
    disqualifying token (`adp`/`rank`/`allow`) to be present; nothing is excluded
    for merely looking unfamiliar. `test_nothing_that_could_be_a_real_ceiling_is_
    ever_suppressed` holds that line.
    """
    t = set(tokens(key))
    if key in _TEAM_CODES:
        return "an NFL team abbreviation appearing as a key, not a field"
    if "allow" in t:
        return "a DEF points/yards-allowed bucket"
    dispersion = t & {"std", "sd", "min", "max", "ave", "avg"}
    if "adp" in t and dispersion:
        return "dispersion of the draft PICK — pick space, not points"
    if "rank" in t and dispersion:
        return "dispersion of expert RANK — rank space, not points"
    if key == "pts_std":
        return "the STANDARD (non-PPR) scoring total — a format, not a deviation"
    return None


def walk_keys(payload, depth: int = 0, out: dict | None = None) -> dict:
    """Every dict key anywhere in the payload, WITH the number of times it appears.

    Counts matter: a key present on 3 of 600 rows is a different fact from one
    present on all 600, and "does FP publish a ceiling" has a different answer if
    it publishes one for six quarterbacks.
    """
    if out is None:
        out = {}
    if depth > 12:
        return out
    if isinstance(payload, dict):
        for k, v in payload.items():
            out[str(k)] = out.get(str(k), 0) + 1
            walk_keys(v, depth + 1, out)
    elif isinstance(payload, list):
        for v in payload:
            walk_keys(v, depth + 1, out)
    return out


def classify(keys: dict) -> dict:
    """Split the census into: a real points-range candidate, a known non-answer,
    and everything else. The middle bucket is the point of this function — the ADP
    census reported NULL while `rank_min`/`rank_max`/`rank_std` sat in its own
    `unclassified` list, and nobody read it for six days."""
    hits, known, rest = [], [], []
    for k in sorted(keys):
        if not RANGE_SHAPED.search(k):
            rest.append(k)
            continue
        why = why_not_a_point_range(k)
        if why:
            known.append({"key": k, "n": keys[k], "why_not": why})
        else:
            hits.append({"key": k, "n": keys[k]})
    return {"points_range_candidates": hits, "known_not_a_point_range": known,
            "other_keys": rest}


def sample_rows(payload, n: int = 3) -> list:
    """The first `n` player-shaped rows, VERBATIM and unedited.

    Not a summary. Every wrong conclusion this week came from reading a summary of
    a payload instead of the payload, so the artifact carries the real thing.
    """
    def rows_of(o, d=0):
        if d > 6:
            return []
        if isinstance(o, list):
            got = [x for x in o if isinstance(x, dict)]
            if got and any(("player" in str(k).lower() or str(k).lower() in
                            ("name", "pos", "position", "stats", "points"))
                           for k in got[0]):
                return got
            for x in o:
                r = rows_of(x, d + 1)
                if r:
                    return r
            return []
        if isinstance(o, dict):
            for key in ("players", "rows", "data", "items"):
                if key in o:
                    r = rows_of(o[key], d + 1)
                    if r:
                        return r
            for v in o.values():
                r = rows_of(v, d + 1)
                if r:
                    return r
        return []

    return rows_of(payload)[:n]


def census_one(name: str, url: str, text: str | None, err: str | None = None) -> dict:
    """Census a single endpoint's response. Pure — the fetching happens above it."""
    rec = {"source": name, "url": url}
    if err or not text:
        rec["error"] = err or "empty response"
        rec["verdict"] = "UNREACHABLE — no evidence either way, do not read as a null."
        return rec
    rec["bytes"] = len(text)
    try:
        payload = json.loads(text)
    except (ValueError, TypeError):
        rec["error"] = "not JSON"
        rec["raw_head"] = text[:1200]
        rec["verdict"] = ("NOT JSON — head retained above so the next run reads the real "
                          "structure instead of guessing at it.")
        return rec
    keys = walk_keys(payload)
    rec["key_count"] = len(keys)
    rec.update(classify(keys))
    rec["sample_rows_verbatim"] = sample_rows(payload)
    cands = rec["points_range_candidates"]
    if cands:
        rec["verdict"] = ("🎯 CANDIDATE FIELDS PRESENT: "
                          + ", ".join(f"{c['key']}(n={c['n']})" for c in cands[:12])
                          + " — read `sample_rows_verbatim` to confirm these are POINTS "
                            "around a projection and not another rank/format field.")
    elif rec["known_not_a_point_range"]:
        rec["verdict"] = ("NULL for a POINTS ceiling, but this endpoint DOES publish "
                          "per-player dispersion in another space: "
                          + ", ".join(k["key"] for k in rec["known_not_a_point_range"])
                          + ". That is real outside-sourced per-player information and it is "
                            "currently discarded.")
    else:
        rec["verdict"] = "NULL — no range-shaped key at any depth in this response."
    return rec


def summarise(records: list) -> dict:
    """The one paragraph a human should have to read."""
    hit = [r for r in records if r.get("points_range_candidates")]
    disp = [r for r in records if r.get("known_not_a_point_range")]
    dead = [r for r in records if r.get("error")]
    if hit:
        headline = ("A PUBLISHED POINTS RANGE EXISTS — " +
                    "; ".join(f"{r['source']}: " +
                              ", ".join(c["key"] for c in r["points_range_candidates"][:6])
                              for r in hit))
    elif disp:
        headline = ("NO SOURCE PROBED PUBLISHES A POINTS CEILING. The closest real thing is "
                    "per-player dispersion in RANK/PICK space (" +
                    "; ".join(f"{r['source']}: " +
                              ", ".join(k['key'] for k in r['known_not_a_point_range'])
                              for r in disp) +
                    "), which is per-player and outside-sourced but has to be mapped through "
                    "a rank->points curve before it is a ceiling.")
    else:
        headline = "NO RANGE-SHAPED FIELD ANYWHERE, and nothing reachable to reconsider."
    return {
        "headline": headline,
        "endpoints_probed": len(records),
        "endpoints_unreachable": [r["source"] for r in dead],
        "reminder": ("Unreachable is NOT a null. Any source in `endpoints_unreachable` is "
                     "unanswered, and register 4t stays open on it."),
    }


# ── EGRESS (CI only) ───────────────────────────────────────────────────────────

def candidates(year=YEAR):
    """(name, url) pairs. Kept as data so the test can assert the list without egress."""
    y = str(year)
    base = "https://api.fantasypros.com/v2/json/nfl/" + y
    return [
        ("fp_ecr_draft", base + "/consensus-rankings?type=draft&scoring=HALF&position=ALL&week=0"),
        ("fp_ecr_draft_experts", base + "/consensus-rankings?type=draft&scoring=HALF&position=ALL&week=0&experts=show"),
        ("fp_adp", base + "/consensus-rankings?type=adp&scoring=HALF&position=ALL&week=0"),
        ("fp_projections_season", base + "/projections?position=ALL&scoring=HALF&week=draft"),
        ("fp_projections_week1", base + "/projections?position=ALL&scoring=HALF&week=1"),
        ("sleeper_projections", "https://api.sleeper.com/projections/nfl/" + y +
         "?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=ppr"),
    ]


def run(year=YEAR, timeout=30):   # pragma: no cover  (egress, CI only)
    import fantasypros_adp as FP

    # Reuse FP's own self-discovering key hunt rather than reimplementing it — if the
    # key rotates, both paths break together instead of one silently degrading.
    key = None
    try:
        _t, _u, diag = FP.fetch(year, timeout=timeout)
        key = diag.get("api_key") or None
    except Exception as e:
        diag = {"key_hunt_error": type(e).__name__}
    if not key:
        try:
            html = FP._get(f"https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php?year={year}",
                           timeout)
            for bname in re.findall(r'//cdn\.fantasypros\.com/[^"\']*bundle-[^"\']+\.js', html)[:8]:
                b = FP._get("https:" + bname, timeout)
                m = FP._KEY_RE.search(b)
                if m:
                    key = m.group(1)
                    break
        except Exception:
            pass

    records = []
    for name, url in candidates(year):
        headers = {"x-api-key": key} if (key and "fantasypros" in url) else None
        try:
            text = FP._get(url, timeout, headers=headers)
            records.append(census_one(name, url, text))
        except Exception as e:
            records.append(census_one(name, url, None, err=f"{type(e).__name__}: {e}"))

    art = {
        "_territory": "TERRITORY: C — written by discovery_ceiling_sources.py",
        "_question": ("Cory 2026-08-18: 'ceiling is a projected score that we will have to "
                      "get from outside source' / 'we need to get them from somewhere!!!'"),
        "_already_known": ("FP's SEASON PROJECTIONS endpoint was captured in full on "
                           "2026-08-16 (draft/audit/proj_correctness_evidence_2026-08-16.json, "
                           "596 raw rows, unfiltered census) and carries NO ceiling/floor/high/"
                           "low key. It is re-probed here only so one artifact holds the whole "
                           "answer."),
        "year": year,
        "api_key_found": bool(key),
        "records": records,
        "summary": summarise(records),
    }
    OUT.write_text(json.dumps(art, indent=1))
    return art


def main() -> int:   # pragma: no cover
    art = run()
    print("=" * 72)
    print("CEILING SOURCE PROBE — register 4t")
    print("=" * 72)
    for r in art["records"]:
        print(f"\n[{r['source']}]  {r['url'][:110]}")
        print(f"  {r['verdict']}")
    print("\n" + "=" * 72)
    print(art["summary"]["headline"])
    print("=" * 72)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
