"""Real ADP from Fantasy Football Calculator, plus the name matcher that binds
it to Sleeper player ids.

Why this exists
---------------
The engine previously used Sleeper's `search_rank` as an ADP proxy.
`search_rank` is an internal popularity ordering — it is not draft behaviour,
and every downstream quantity (adjusted ADP, all three survival layers, VONA,
the A1 manager metrics) inherited that error. This module replaces it with ADP
computed from real human drafts, in our scoring format, at our league size.

Source: https://fantasyfootballcalculator.com/api/v1/adp/{format}?teams=N&year=Y
Free for personal and commercial use; attribution is requested and is rendered
in the War Room footer.

Two hard rules, both from the work order:

1. **Verify, don't assume.** The first real call logs the full field set of the
   response so we can see what FFC actually returns — in particular whether it
   carries a per-player standard deviation. `describe_payload()` exists purely
   to answer that question in the build log.
2. **Fail loudly.** `search_rank` remains a declared fallback, never a silent
   one. Every player records which source produced its ADP, an unmatched-player
   report is emitted every build, and any unmatched player inside the top
   `STRICT_TOP_N` fails the build.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

FFC_BASE = "https://fantasyfootballcalculator.com/api/v1/adp"
CACHE = Path(__file__).parent / ".cache"
CACHE_TTL = 12 * 60 * 60  # FFC recomputes daily; one call per build is plenty.

# A player this early who cannot be matched to a Sleeper id is not an edge case,
# it is a broken matcher — and it would corrupt the top of the board.
STRICT_TOP_N = 150

# Above this share of fallback-sourced players the artifact carries a warning
# that the War Room renders; the market signal is too degraded to trust quietly.
FALLBACK_WARN_RATE = 0.15

# The rate is measured over the players who can actually be drafted, not the
# whole Sleeper pool and not an arbitrary depth.
#
# Two wrong denominators were tried before this one. Measured over all ~1700
# Sleeper "draftable" players the rate is 89%, because FFC only publishes the
# ~210 humans actually take. Measured over a flat top 250 it is 22%, because
# 250 is simply deeper than FFC publishes — the shortfall was arithmetic, not a
# data problem, and the warning fired on a perfectly healthy board.
#
# The honest denominator is the draft itself: the picks that will be made, plus
# half again for the players you are choosing between at each one. This league
# makes 90 picks after keeper forfeits, so ~135. Derived from the format so it
# stays right if the league changes shape.
RELEVANT_BOARD = 250          # fallback when the pick count is unknown
RELEVANT_BOARD_MULTIPLE = 1.5

# Sleeper's scoring keys -> FFC's format path segment. FFC publishes standard,
# ppr, half-ppr, 2qb and dynasty; we only ever need the redraft three.
FORMATS = {"standard": "standard", "half-ppr": "half-ppr", "ppr": "ppr"}

# FFC uses its own team abbreviations for a handful of franchises.
TEAM_ALIASES = {
    "JAC": "JAX", "WSH": "WAS", "LA": "LAR", "STL": "LAR",
    "SD": "LAC", "OAK": "LV", "LVR": "LV", "ARZ": "ARI", "BLT": "BAL",
    "CLV": "CLE", "HST": "HOU", "SL": "LAR",
}

# Position labels that mean the same thing on both sides.
POS_ALIASES = {"PK": "K", "DST": "DEF", "D/ST": "DEF", "DS": "DEF"}

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Nicknames FFC prints and Sleeper does not. Applied to BOTH sides, so an entry
# here can only ever relabel a key — it cannot break a pair that already
# matched. "hollywood brown" is the only one confirmed from a real unmatched
# report; the rest are known aliases added pre-emptively and should be treated
# as unverified until a build log names them.
NICKNAMES = {
    "hollywood brown": "marquise brown",   # confirmed: 2023 and 2024 reports
    "chig okonkwo": "chigoziem okonkwo",
    "gabe davis": "gabriel davis",
    "josh palmer": "joshua palmer",
    "cam akers": "cameron akers",
    "scotty miller": "scott miller",
}


# ---------------------------------------------------------------------------
# fetching
# ---------------------------------------------------------------------------

def _get(url: str, *, ttl: int = CACHE_TTL, retries: int = 3):
    """Cached GET. FFC is a free service doing us a favour — one call per build."""
    CACHE.mkdir(exist_ok=True)
    key = CACHE / ("ffc_" + re.sub(r"\W+", "_", url.split("/api/v1/")[-1]) + ".json")
    if key.exists() and (time.time() - key.stat().st_mtime) < ttl:
        return json.loads(key.read_text())

    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mfga-league-draft-tool/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read())
            key.write_text(json.dumps(data))
            return data
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    if key.exists():
        print(f"  ! FFC unreachable ({last}); using cached ADP")
        return json.loads(key.read_text())
    raise RuntimeError(f"FFC unreachable: {last}")


def fetch_adp(fmt: str, teams: int, year: int) -> dict:
    fmt = FORMATS.get(fmt, "half-ppr")
    return _get(f"{FFC_BASE}/{fmt}?teams={teams}&year={year}")


def describe_payload(payload: dict) -> dict:
    """What did FFC actually send us?

    Called once per build and printed. The work order asks specifically whether
    a standard-deviation field exists; this is how we find out from a real
    response instead of guessing. Any field we did not expect shows up here too.
    """
    players = payload.get("players") or []
    fields = sorted({k for p in players[:50] for k in p.keys()})
    sd_field = next((f for f in ("stdev", "std_dev", "sd", "adp_stdev", "deviation")
                     if f in fields), None)
    desc = {
        "meta_keys": sorted(k for k in payload.keys() if k != "players"),
        "player_fields": fields,
        "player_count": len(players),
        "stdev_field": sd_field,
        "sample": players[0] if players else None,
    }
    print("  FFC payload:")
    print(f"    meta         : {desc['meta_keys']}")
    print(f"    player fields: {fields}")
    print(f"    players      : {len(players)}")
    print(f"    stdev field  : {sd_field or 'NONE — falling back to fitted sd'}")
    if players:
        print(f"    sample       : {json.dumps(players[0])[:200]}")
    return desc


# ---------------------------------------------------------------------------
# name matching
# ---------------------------------------------------------------------------

def normalize_name(name: str) -> str:
    """Aggressive normalization for matching only — never for display.

    Handles the cases that actually break: initials written with and without
    periods ("D.K. Metcalf" / "DK Metcalf"), apostrophes ("Ja'Marr" / "JaMarr"),
    hyphens ("Amon-Ra" / "Amon Ra"), and generational suffixes.
    """
    s = (name or "").lower().strip()
    # Fold accents: FFC prints "Eddy Pineiro" as "Eddy Pineiro" with a tilde,
    # Sleeper does not. Without this the n splits the surname in two and the
    # match fails — which is exactly how the first real build died.
    s = "".join(c for c in unicodedata.normalize("NFKD", s)
                if not unicodedata.combining(c))
    s = s.replace("\u00f8", "o").replace("\u0142", "l").replace("\u00e6", "ae").replace("\u00df", "ss")
    s = s.replace("&", " and ")
    s = re.sub(r"[.'’`]", "", s)          # D.K. -> dk, Ja'Marr -> jamarr
    s = re.sub(r"[-/]", " ", s)            # Amon-Ra -> amon ra
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    parts = [p for p in s.split() if p and p not in _SUFFIXES]
    out = " ".join(parts)
    return NICKNAMES.get(out, out)


def _initials_key(name: str) -> str:
    """"dk metcalf" and "d k metcalf" and "dennis metcalf" all differ; this
    collapses only the first-token-is-initials case, which is the common one."""
    parts = normalize_name(name).split()
    if len(parts) < 2:
        return ""
    first, rest = parts[0], " ".join(parts[1:])
    return f"{first[0]}{rest}" if len(first) <= 3 else ""


def _norm_team(t: str | None) -> str:
    t = (t or "").upper().strip()
    return TEAM_ALIASES.get(t, t)


def _norm_pos(p: str | None) -> str:
    p = (p or "").upper().strip()
    return POS_ALIASES.get(p, p)


def build_index(sleeper_players: dict) -> dict:
    """Sleeper player DB -> lookup tables keyed by the things we can match on."""
    by_name: dict = defaultdict(list)
    by_initials: dict = defaultdict(list)
    for pid, p in sleeper_players.items():
        if not isinstance(p, dict):
            continue
        pos = _norm_pos(p.get("position"))
        if pos not in {"QB", "RB", "WR", "TE", "K", "DEF"}:
            continue
        full = p.get("full_name") or " ".join(
            filter(None, [p.get("first_name"), p.get("last_name")])) or p.get("last_name") or ""
        # Team defenses are keyed by team abbreviation in Sleeper, not a name.
        if pos == "DEF" and not full:
            full = p.get("team") or pid
        rank = p.get("search_rank")
        rank = None if rank is None or rank >= 9_999_999 else float(rank)
        rec = {"id": str(pid), "name": full, "pos": pos,
               "team": _norm_team(p.get("team")), "rank": rank}
        n = normalize_name(full)
        if n:
            by_name[n].append(rec)
        ik = _initials_key(full)
        if ik:
            by_initials[ik].append(rec)
    return {"by_name": dict(by_name), "by_initials": dict(by_initials)}


def match_player(entry: dict, index: dict) -> tuple[str | None, str]:
    """Match one FFC row to a Sleeper id.

    Returns `(player_id, method)`. `method` is recorded in the artifact so a
    later mismatch can be traced to how it was matched, not just that it was.
    """
    name = entry.get("name") or entry.get("player_name") or ""
    pos = _norm_pos(entry.get("position"))
    team = _norm_team(entry.get("team"))

    def pick(cands: list, method: str) -> tuple[str | None, str]:
        if not cands:
            return None, ""
        if len(cands) == 1:
            return cands[0]["id"], method
        # Ambiguity is resolved by position first (two players share a name far
        # more often than a name and a position), then team.
        same_pos = [c for c in cands if c["pos"] == pos] or cands
        if len(same_pos) == 1:
            return same_pos[0]["id"], method + "+pos"
        same_team = [c for c in same_pos if c["team"] == team]
        if len(same_team) == 1:
            return same_team[0]["id"], method + "+pos+team"
        # Historical rows name a team the player has since left, so the team
        # tiebreak can fail on a player who is not actually ambiguous today.
        # Fall back to the most prominent candidate — lowest search_rank —
        # and record that we did, so a wrong match is traceable.
        ranked = sorted((c for c in same_pos if c.get("rank") is not None),
                        key=lambda c: c["rank"])
        if ranked:
            return ranked[0]["id"], method + "+pos+prominence"
        return None, ""

    n = normalize_name(name)
    pid, method = pick(index["by_name"].get(n, []), "name")
    if pid:
        return pid, method

    ik = _initials_key(name)
    if ik:
        pid, method = pick(index["by_initials"].get(ik, []), "initials")
        if pid:
            return pid, method

    # Defenses: FFC writes "Bills" or "Buffalo Bills", Sleeper keys on "BUF".
    if pos == "DEF":
        for rec_list in index["by_name"].values():
            for rec in rec_list:
                if rec["pos"] == "DEF" and rec["team"] and rec["team"] == team:
                    return rec["id"], "def-team"
    return None, ""


# ---------------------------------------------------------------------------
# assembly
# ---------------------------------------------------------------------------

def fitted_sd(adp_mean: float, published_sd: float | None) -> tuple[float, str]:
    """Standard deviation of a player's draft position.

    The old heuristic was `max(3.0, 0.22 * adp)`, which put sd=22 at adp=100 —
    roughly double real mid-round dispersion. An over-wide sd flattens every
    survival curve, which compresses VONA differences and makes the tool
    under-react to exactly the positional cliffs it exists to catch.

    Preference order, per the audit: FFC's own published stdev, then a fitted
    curve, then a clamped linear rule that is at least the right magnitude.
    """
    if published_sd and published_sd > 0:
        return float(published_sd), "ffc"
    return max(3.0, min(0.15 * adp_mean, 15.0)), "clamped-linear"


def build_adp_table(sleeper_players: dict, *, fmt: str, teams: int, year: int,
                    strict_top_n: int = STRICT_TOP_N) -> dict:
    """Fetch, match, and report. Raises if the top of the board is broken."""
    payload = fetch_adp(fmt, teams, year)
    desc = describe_payload(payload)
    sd_field = desc["stdev_field"]
    index = build_index(sleeper_players)

    rows, unmatched = {}, []
    for i, entry in enumerate(payload.get("players") or []):
        rank = int(entry.get("adp_rank") or entry.get("rank") or (i + 1))
        pid, method = match_player(entry, index)
        if not pid:
            unmatched.append({
                "rank": rank,
                "name": entry.get("name"),
                "pos": entry.get("position"),
                "team": entry.get("team"),
                "adp": entry.get("adp"),
            })
            continue
        adp = float(entry.get("adp") or rank)
        sd, sd_src = fitted_sd(adp, entry.get(sd_field) if sd_field else None)
        rows[pid] = {
            "adp": adp, "adp_sd": sd, "adp_sd_source": sd_src,
            "adp_source": "ffc", "match_method": method, "ffc_rank": rank,
        }

    report = {
        "format": fmt, "teams": teams, "year": year,
        "payload": {k: desc[k] for k in ("meta_keys", "player_fields", "player_count", "stdev_field")},
        "matched": len(rows),
        "unmatched": unmatched,
        "unmatched_count": len(unmatched),
        "unmatched_in_top_n": [u for u in unmatched if u["rank"] <= strict_top_n],
    }
    _print_report(report, strict_top_n)

    blockers = report["unmatched_in_top_n"]
    if blockers:
        raise RuntimeError(
            f"{len(blockers)} of the top {strict_top_n} FFC players did not match a Sleeper id. "
            f"First: {blockers[0]['name']} ({blockers[0]['pos']} {blockers[0]['team']}). "
            "Fix the matcher or add an alias — do not fall back to search_rank for these."
        )
    return {"adp": rows, "report": report}


def _print_report(report: dict, strict_top_n: int) -> None:
    print(f"  ADP: matched {report['matched']}, unmatched {report['unmatched_count']}")
    if report["unmatched"]:
        print(f"  unmatched players (first 25 of {report['unmatched_count']}):")
        for u in report["unmatched"][:25]:
            flag = "  <-- TOP" + str(strict_top_n) if u["rank"] <= strict_top_n else ""
            print(f"    #{u['rank']:>4} {u['name']} ({u['pos']} {u['team']}) adp={u['adp']}{flag}")


def apply_with_fallback(players: list, adp_table: dict, *, teams: int,
                        draft_picks: int | None = None,
                        relevant: int | None = None) -> dict:
    """Attach ADP to the board, falling back to `search_rank` **on the record**.

    `players` is mutated in place: each gets `adp`, `adp_sd` and `adp_source`.
    Returns provenance the artifact carries and the UI renders.
    """
    # Where FFC's coverage ends. Everything it does not list goes BEHIND this,
    # never interleaved with it.
    #
    # The subtle bug this avoids: search_rank and ADP are different scales. A
    # player with search_rank 30 whom FFC does not list was getting adp=30 and
    # landing in the top 30 of the board — not "missing data" but confident
    # wrong data, sitting among genuinely elite players. And the absence is
    # itself informative: if hundreds of real drafters did not take him inside
    # FFC's published range, he goes after it.
    ffc_max = max((r["adp"] for r in adp_table.values()), default=0.0)

    used_fallback = []
    for p in players:
        row = adp_table.get(str(p.get("player_id")))
        if row:
            p.update({k: row[k] for k in ("adp", "adp_sd", "adp_source")})
            continue
        # Declared fallback: search_rank orders these players relative to each
        # other, which is all we ask of it. It does not get to set their price.
        rank = float(p.get("search_rank") or 9999)
        p["adp"] = ffc_max + min(rank, 600.0)
        p["adp_sd"] = max(8.0, min(0.25 * p["adp"], 30.0))
        p["adp_source"] = "search_rank"
        used_fallback.append(p.get("player_id"))

    # Rank by the ADP we just assigned and judge only the part of the board that
    # is genuinely in play. A deep-bench tight end with no FFC entry is not a
    # data problem; a top-100 player without one is.
    if relevant is None:
        relevant = (int(draft_picks * RELEVANT_BOARD_MULTIPLE) if draft_picks
                    else RELEVANT_BOARD)
    in_play = sorted(players, key=lambda p: p.get("adp") or 9999)[:relevant]
    fb_in_play = [p for p in in_play if p.get("adp_source") == "search_rank"]
    rate = len(fb_in_play) / max(len(in_play), 1)
    prov = {
        "adp_source": "ffc",
        "fallback_count": len(used_fallback),
        "fallback_count_in_play": len(fb_in_play),
        "relevant_board": len(in_play),
        "fallback_rate": round(rate, 4),
        "fallback_rate_whole_pool": round(len(used_fallback) / max(len(players), 1), 4),
        "fallback_warn_rate": FALLBACK_WARN_RATE,
        "warning": None,
    }
    print(f"  ADP coverage: {len(in_play) - len(fb_in_play)}/{len(in_play)} of the "
          f"draftable board priced by FFC ({rate:.0%} on search_rank)")
    if rate > FALLBACK_WARN_RATE:
        prov["warning"] = (
            f"{rate:.0%} of the top {len(in_play)} players are using search_rank "
            f"instead of real ADP (threshold {FALLBACK_WARN_RATE:.0%}). Market-based "
            "numbers — survival odds, VONA, run detection — are degraded."
        )
        print(f"  ! {prov['warning']}")
    return prov


def historical_adp(sleeper_players: dict, *, fmt: str, teams: int, years: list) -> dict:
    """ADP for prior seasons, used to de-proxy the A1 manager metrics.

    `reach_delta` and `bpa_vs_need` were computed against a present-day proxy,
    which is hindsight bias: a 2019 pick judged against 2026 popularity. With
    contemporaneous ADP they become real measurements, the `proxy` flag comes
    off, and the double shrinkage can relax from n/(n+4) to n/(n+2).
    """
    out = {}
    for y in years:
        try:
            table = build_adp_table(sleeper_players, fmt=fmt, teams=teams, year=y,
                                    strict_top_n=0)  # historical gaps are expected
            out[str(y)] = table["adp"]
            print(f"  historical ADP {y}: {len(table['adp'])} players")
        except Exception as exc:  # noqa: BLE001 — a missing old year is not fatal
            print(f"  ! historical ADP {y} unavailable: {exc}")
            out[str(y)] = {}
    return out
