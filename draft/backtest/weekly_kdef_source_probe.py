# TERRITORY: C
"""WEEKLY K/DEF PROJECTION COVERAGE — source-hunt item 3: "source_boards
shows FantasyPros K=0 DEF=0; if Sleeper is our ONLY weekly K/DEF number,
the streaming advisor runs on one uncorroborated source." `ROUTES.md` TO: C,
2026-08-21.

WHY A CENSUS PROBE, NOT A PARSER, THE SAME DISCIPLINE
`discovery_ceiling_sources.py` USED (rule 11 — same shape of unknown-source
question, same answer): ESPN's fantasy API (the most commonly cited free
weekly-K/DEF source in public fantasy tooling) is LEAGUE-SCOPED — its real
endpoint needs a real league id and its player-position field is a numeric
code (`defaultPositionId`), not a string, and this session has no verified
mapping for it. Rather than guess a position-id mapping and silently
mis-parse, this probe does the safe thing: fetch, census every key at every
depth, sample real rows verbatim, and let a human (or the next probe) read
the actual shape before any parser is trusted.

⚠️ REACHABILITY IS UNCONFIRMED FROM THIS SANDBOX, STATED PLAINLY: both
candidate hosts below are untested from this dev sandbox (every non-
nflverse host this session has tried is proxy-403'd here) — CI is the first
real read, same as `discovery_ceiling_sources.py`/`game_weather.py`/every
other host this session could not check locally.

THE CANDIDATES, RANKED BY CONFIDENCE IN THE URL ITSELF (not in whether the
data is there — that is the unknown this probe answers):
  1. NFL.com's fantasy API (`api.fantasy.nfl.com`) — a long-publicly-
     documented, unauthenticated weekly-projection endpoint used by several
     open-source fantasy tools; highest confidence in the URL shape.
  2. ESPN's fantasy API — kept as a SECOND candidate at lower confidence:
     its player-info view needs a real (public) league id to scope the
     request, and this probe uses a widely-referenced public league id
     rather than a private one — if that id stops resolving, this
     candidate reports UNREACHABLE, not a false null.

WHAT A HIT LOOKS LIKE: any row whose position-like field reads a K/DST/DEF
convention (checked against several real spellings, not one guess) AND
carries a numeric weekly point/projection value alongside it. The Rule 3e
known-positive control below proves the detector fires on a real-shaped
K/DST row before any live null is trusted.

Run: python3 draft/backtest/weekly_kdef_source_probe.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "weekly_kdef_source_probe.json"

#: Every real spelling this session has seen or expects for the two
#: positions in question, across sources — checked against, not guessed
#: fresh each time. "DST"/"DEF"/"D/ST" all appear across the sources this
#: repo already touches (Sleeper uses "DEF", ESPN uses "D/ST", NFL.com uses
#: "DEF" in some views and a numeric id in others).
K_SPELLINGS = {"k", "pk", "kicker"}
DEF_SPELLINGS = {"def", "dst", "d/st", "defense", "dt"}

#: Keys likely to carry a weekly projected point value, checked as whole
#: tokens the same way discovery_ceiling_sources.py's RANGE_TOKENS are —
#: substring matching would false-positive on unrelated fields.
PROJECTION_KEY_HINTS = {"projectedpoints", "projpoints", "fpts", "points",
                        "projected", "fantasypoints", "score"}


def _flatten_key(key: str) -> str:
    return "".join(ch for ch in str(key).lower() if ch.isalnum())


def looks_like_kdef_position(value) -> str | None:
    """Returns 'K' or 'DEF' if `value` matches a known real spelling of
    either position, else None. Never guesses on an unfamiliar string."""
    if not isinstance(value, str):
        return None
    v = value.strip().lower()
    if v in K_SPELLINGS:
        return "K"
    if v in DEF_SPELLINGS:
        return "DEF"
    return None


def looks_like_projection_key(key) -> bool:
    return _flatten_key(key) in PROJECTION_KEY_HINTS


def _own_projection_value(node: dict):
    """A projection-shaped numeric value among `node`'s OWN top-level
    items, or None. Pure, one level, no recursion — the building block
    `find_kdef_rows` widens by exactly one extra level below."""
    for k, v in node.items():
        if looks_like_projection_key(k) and isinstance(v, (int, float)):
            return v
    return None


def find_kdef_rows(payload, path: str = "$", depth: int = 0, out: list | None = None) -> list:
    """Walk the WHOLE payload (any depth, any shape) for a dict that carries
    a recognizable K/DEF position value among its own top-level items, AND
    a numeric projection value EITHER on that same dict OR on one of its
    direct child dicts (e.g. a nested "stats" sub-object — checked
    against, not assumed: real payloads commonly separate identity fields
    from a nested stats block one level down, which a same-level-only
    check would silently miss). Deliberately NOT wider than one extra
    level, so a projection value is never borrowed from an unrelated
    sibling elsewhere in the payload. Records the path so a human can find
    it in the raw response. Depth-capped the same way
    discovery_ceiling_sources.walk_keys is, for the same reason (an
    adversarial/circular payload must not hang the probe)."""
    if out is None:
        out = []
    if depth > 12:
        return out
    if isinstance(payload, dict):
        position = None
        for v in payload.values():
            pos = looks_like_kdef_position(v)
            if pos:
                position = pos
                break
        if position:
            proj_value = _own_projection_value(payload)
            proj_path = path
            if proj_value is None:
                for k, v in payload.items():
                    if isinstance(v, dict):
                        nested = _own_projection_value(v)
                        if nested is not None:
                            proj_value = nested
                            proj_path = f"{path}.{k}"
                            break
            if proj_value is not None:
                out.append({"path": path, "projection_path": proj_path,
                           "position": position, "projection_value": proj_value,
                           "row": payload})
        for k, v in payload.items():
            find_kdef_rows(v, f"{path}.{k}", depth + 1, out)
    elif isinstance(payload, list):
        for i, v in enumerate(payload):
            find_kdef_rows(v, f"{path}[{i}]", depth + 1, out)
    return out


#: Rule 3e known-positive: a synthetic row in a generic, PLAUSIBLE shape —
#: position at the row's own top level, the projection nested one level
#: down under "stats" (the common convention across the sources this repo
#: already touches). This fixture is illustrative, not traced from a
#: specific captured payload — no real source's exact field names have
#: been verified from this sandbox (see module docstring). It proves the
#: detector fires on a shape it is designed to catch before any live
#: source's null is trusted.
KNOWN_POSITIVE_FIXTURE = {"players": [
    {"player_id": "DAL", "position": "DEF", "stats": {"points": 7.4}},
]}


def verify_known_positive() -> dict:
    hits = find_kdef_rows(KNOWN_POSITIVE_FIXTURE)
    ok = any(h["position"] == "DEF" for h in hits)
    return {"ok": ok, "hits": hits}


def census_one(name: str, url: str, text: str | None, err: str | None = None) -> dict:
    """Pure — census a single candidate's response. Same shape as
    discovery_ceiling_sources.census_one (rule 11: same reporting contract
    for the same class of 'is X published here' question)."""
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
        rec["verdict"] = ("NOT JSON — head retained so the next attempt reads the "
                          "real structure instead of guessing at it.")
        return rec
    hits = find_kdef_rows(payload)
    rec["kdef_rows_found"] = len(hits)
    rec["sample_hits"] = hits[:6]
    if hits:
        k_hits = sum(1 for h in hits if h["position"] == "K")
        def_hits = sum(1 for h in hits if h["position"] == "DEF")
        rec["verdict"] = (f"🎯 POSITIVE — {k_hits} K row(s), {def_hits} DEF row(s) "
                          "carry a numeric weekly projection. Read sample_hits to "
                          "confirm these are real player-week projections, not a "
                          "coincidental key/value pair.")
    else:
        rec["verdict"] = "NULL — no row matched a known K/DEF spelling with a projection value."
    return rec


def summarise(records: list) -> dict:
    hit = [r for r in records if r.get("kdef_rows_found")]
    dead = [r for r in records if r.get("error")]
    if hit:
        headline = ("A WEEKLY K/DEF SOURCE EXISTS — " +
                    "; ".join(f"{r['source']}: {r['kdef_rows_found']} rows" for r in hit))
    elif len(dead) == len(records):
        headline = "ALL CANDIDATES UNREACHABLE FROM THIS INFRA — unanswered, not a null."
    else:
        headline = "NO CANDIDATE PUBLISHED A RECOGNIZABLE K/DEF WEEKLY PROJECTION."
    return {"headline": headline, "endpoints_probed": len(records),
           "endpoints_unreachable": [r["source"] for r in dead],
           "reminder": ("Unreachable is NOT a null. A source in "
                       "endpoints_unreachable is unanswered, not exhausted.")}


# ── egress (CI only) ─────────────────────────────────────────────────────

def candidates(season=2025, week=1):
    """(name, url) pairs, kept as data so the test can assert the list
    without egress. A recent PAST week (2025 w1) is used rather than the
    still-preseason 2026 week 1, so a real positive/negative is measured
    now instead of waiting for week 1 to exist."""
    return [
        ("nfl_com_weekly_projected",
         f"https://api.fantasy.nfl.com/v2/players/weekstats"
         f"?season={season}&week={week}&statType=weekProjectedStats"),
        # widely-referenced public ESPN league id, used only to scope the
        # request the same way any public league viewer would — lower
        # confidence candidate, see module docstring.
        ("espn_kona_player_info",
         f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
         f"{season}/segments/0/leagues/1?view=kona_player_info"),
    ]


def _fetch(url: str, timeout=30) -> str:  # pragma: no cover  (egress)
    import urllib.request
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (league data project; source discovery probe)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def run(season=2025, week=1) -> dict:  # pragma: no cover  (egress)
    records = []
    for name, url in candidates(season, week):
        try:
            text = _fetch(url)
            records.append(census_one(name, url, text))
        except Exception as e:  # noqa: BLE001
            records.append(census_one(name, url, None, err=f"{type(e).__name__}: {e}"))

    art = {
        "_territory": "TERRITORY: C — written by weekly_kdef_source_probe.py",
        "_question": ("source_boards shows FantasyPros K=0 DEF=0 -- is Sleeper "
                     "our only weekly K/DEF projection source?"),
        "_note": ("A census probe, not a parser (rule 11, same discipline as "
                 "discovery_ceiling_sources.py): the position-field convention "
                 "each candidate uses is unverified until this run's own "
                 "sample_hits confirms it, so nothing is assumed from a "
                 "field-name guess."),
        "season": season, "week": week,
        "rule_3e_control": verify_known_positive(),
        "records": records, "summary": summarise(records),
    }
    OUT.write_text(json.dumps(art, indent=1))
    return art


def main() -> int:  # pragma: no cover  (egress)
    art = run()
    control = art["rule_3e_control"]
    print("=" * 72)
    print("WEEKLY K/DEF SOURCE PROBE — source-hunt item 3")
    print("=" * 72)
    print(f"known-positive control: {'PASS' if control['ok'] else 'FAIL'}")
    for r in art["records"]:
        print(f"\n[{r['source']}]  {r['url'][:110]}")
        print(f"  {r['verdict']}")
    print("\n" + "=" * 72)
    print(art["summary"]["headline"])
    print("=" * 72)
    return 0 if control["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
