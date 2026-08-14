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

# ONE SET OF DISPERSION CONSTANTS. keepers.py owns them and is import-safe: it
# pulls in nothing local, so there is no cycle. See fitted_sd() for why this
# module used to carry its own copy and what that cost.
import keepers as _K

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

# THE SHARED TEAM VOCABULARY — every source's abbreviations, in ONE table.
#
# This used to say "FFC uses its own team abbreviations", and that framing was
# the bug: it read as an FFC-specific quirk table, so when C brought MFL in, the
# six abbreviations MFL uses and Sleeper does not had nowhere obvious to go. C
# declined to keep a private table in its own lane rather than split the
# vocabulary in two, which is right — two tables for one question is how the two
# come to disagree without either being wrong on its own terms.
#
# MFL (added 2026-08-11, found by C): the full MFL abbreviation set differs from
# Sleeper's for EIGHT franchises — GBP JAC KCC LVR NEP NOS SFO TBB. JAC and LVR
# were already here for FFC, so the six below are the exact remainder. C measured
# 956 pairs reporting as team disagreements where the sources agree and only the
# spelling differs; that count is C's, from MFL responses this sandbox cannot
# reach. What is verified here is the CAUSE — the delta is exactly these six.
#
# Applied to BOTH sides (build_index and match_player), so an entry can only
# relabel a key, never break a pair that already matched. test_team_aliases.py
# pins the two ways this table can go wrong: an alias whose target is not a real
# team, and an alias whose target is itself an alias key (a two-hop rename that
# silently half-applies, since _norm_team resolves exactly once).
TEAM_ALIASES = {
    "JAC": "JAX", "WSH": "WAS", "LA": "LAR", "STL": "LAR",
    "SD": "LAC", "OAK": "LV", "LVR": "LV", "ARZ": "ARI", "BLT": "BAL",
    "CLV": "CLE", "HST": "HOU", "SL": "LAR",
    # MFL
    "NEP": "NE", "GBP": "GB", "SFO": "SF", "KCC": "KC", "TBB": "TB", "NOS": "NO",
}

# The 32 codes Sleeper actually emits, as literals. Not derived from the player
# DB: a guard whose reference derives from the thing under test always agrees
# (rule 10d). The board is checked AGAINST this, not the other way round.
NFL_TEAMS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
    "TEN", "WAS",
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
    # FIRST-NAME DIMINUTIVES, routed by C 2026-08-13 with the decode measurement.
    # MFL carries the formal first name and the board carries the short one, so
    # these three never joined: Gainwell is INSIDE pick 150 (adp 135 on MFL, 108
    # on the board), the other two are deep. Nothing on the draft board was wrong
    # — FantasyPros prices Gainwell either way — what failed was the MFL/D3 join,
    # which is the market comparison and the 2027 replay.
    #
    # Fixed as table entries rather than by letting `_initials_key` win, which
    # would also have matched all three: the whitelist changes three names and
    # the key-precedence change changes every name. Nine days from a draft, the
    # narrow fix is the right one, and the broad one has no measurement behind it.
    "kenny gainwell": "kenneth gainwell",
    "andy borregales": "andres borregales",
    "matt hibner": "matthew hibner",
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
    # ⚠️ A FOURTH COPY OF THE RATE LIVED HERE AS THE LITERAL `0.15`.
    #
    # keepers.py carries ADP_SD_{FLOOR,RATE,CAP} and survival.js carries
    # CFG.ADP_SD_*, and `test_survival_parity.py` pins those two to each other by
    # parsing the JS. This line was in neither set — a third implementation of
    # the same rule that no parity test could see, in the file that actually
    # STAMPS the board. Changing the rate in keepers.py would have moved the
    # keeper optimizer and the war room and left the shipped `adp_sd` alone.
    #
    # Same shape as `picks` versus `my_picks` and as the four adp_sd formulas C
    # routed today: one rule, several copies, and the guard over it comparing two
    # of them to each other.
    return (min(_K.ADP_SD_CAP, max(_K.ADP_SD_FLOOR, _K.ADP_SD_RATE * adp_mean)),
            "clamped-linear")


def build_adp_table(sleeper_players: dict, *, fmt: str, teams: int, year: int,
                    strict_top_n: int = STRICT_TOP_N) -> dict:
    """Fetch, match, and report. Raises if the top of the board is broken."""
    payload = fetch_adp(fmt, teams, year)
    desc = describe_payload(payload)
    sd_field = desc["stdev_field"]
    index = build_index(sleeper_players)

    # ── THE SAME SILENT-OVERWRITE THE FP TABLE HAD, ON THE PRIMARY CROSSWALK ──
    #
    # `rows[pid] = ...` keyed by Sleeper id. Two FFC entries crosswalking to one
    # id overwrite silently while `matched` counts the SURVIVORS, so the report
    # says success on a table that lost a row. The FP builder was hardened for
    # exactly this on 2026-08-12 and THIS ONE — the primary anchor, the table
    # that carries every bye week — was left without it.
    #
    # BOTH CLAIMANTS ARE DROPPED, not arbitrated: a collision means the crosswalk
    # cannot say whose ADP this is, and keeping either is a guess written into
    # the anchor. Counted as their own bucket so the identity below is exact.
    entries = payload.get("players") or []
    rows, unmatched = {}, []
    claims: dict = {}
    for i, entry in enumerate(entries):
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
        claims.setdefault(pid, []).append(str(entry.get("name") or f"rank {rank}"))
        adp = float(entry.get("adp") or rank)
        sd, sd_src = fitted_sd(adp, entry.get(sd_field) if sd_field else None)
        rows[pid] = {
            "adp": adp, "adp_sd": sd, "adp_sd_source": sd_src,
            "adp_source": "ffc", "match_method": method, "ffc_rank": rank,
            # FFC publishes the bye week and Sleeper's metadata.bye_week is
            # empty for every player in the preseason player dump. Carrying it
            # here is the whole reason the bye grid has data; see
            # apply_with_fallback for why it does not overwrite Sleeper's.
            "bye": entry.get("bye"),
        }

    contested = {pid: names for pid, names in claims.items() if len(names) > 1}
    dropped = 0
    for pid, names in contested.items():
        rows.pop(pid, None)
        dropped += len(names)

    # THE ACCOUNTING IDENTITY, ASSERTED RATHER THAN REPORTED. Every parsed entry
    # now lands in exactly one bucket, so a row that goes missing between the
    # payload and the table cannot hide in the difference. Clean today is not the
    # point — uncheckable tomorrow is.
    accounted = len(rows) + len(unmatched) + dropped
    if accounted != len(entries):
        raise SystemExit(
            f"REFUSING the ADP anchor: the crosswalk does not account for its own "
            f"rows. {len(rows)} matched + {len(unmatched)} unmatched + {dropped} "
            f"collided = {accounted}, but {len(entries)} were parsed. A row went "
            f"missing between the payload and the table; a board built on a table "
            f"that cannot count itself is worse than no board.")

    report = {
        "format": fmt, "teams": teams, "year": year,
        "payload": {k: desc[k] for k in ("meta_keys", "player_fields", "player_count", "stdev_field")},
        "matched": len(rows),
        "unmatched": unmatched,
        "unmatched_count": len(unmatched),
        "unmatched_in_top_n": [u for u in unmatched if u["rank"] <= strict_top_n],
        "parsed": len(entries),
        "collisions": len(contested),
        "dropped_to_collision": dropped,
        "collision_names": {p: n for p, n in list(contested.items())[:10]},
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


def build_fantasypros_table(sleeper_players: dict, *, year: int, half_ppr: bool = True,
                            min_rows: int = STRICT_TOP_N) -> tuple[dict | None, dict]:
    """FantasyPros ADP (our half-PPR format), crosswalked to Sleeper ids, shaped EXACTLY
    like build_adp_table's rows so it can be merged as the PRIMARY anchor over FFC.

    Returns (table, diag) — or (None, diag) when the fetch is too thin to trust, in which
    case the caller keeps FFC. That guard is the whole safety story: a bad FP fetch can
    never degrade the board below its FFC baseline.

    Why FP is primary: the 2023-24 source grade found FP orders realized value best AND is
    our exact format (half-PPR), de-confounding the full-PPR handicap MFL carried. The
    2026 board-coverage probe confirmed 98% of the top 150 crosswalk and ρ=0.885 vs FFC
    (the swap moves picks without being a wholesale re-rank). Egress — CI only.
    """
    import sys as _sys
    from pathlib import Path as _Path
    bt = str(_Path(__file__).resolve().parent / "backtest")
    if bt not in _sys.path:
        _sys.path.insert(0, bt)
    import fantasypros_adp as FP  # self-contained Lab fetcher (export-variant full board)

    text, url, _fdiag = FP.fetch(year, half_ppr=half_ppr)
    parsed = FP.parse(text) if text else []
    diag = {"fp_url": url, "fp_rows_parsed": len(parsed)}
    if len(parsed) < min_rows:
        diag["reason"] = f"only {len(parsed)} FP rows parsed (< {min_rows}); keeping FFC anchor"
        return None, diag

    # ── A DICT KEYED BY SLEEPER ID CAN LOSE A ROW WITHOUT SAYING SO ─────────
    #
    # C's finding, 2026-08-12. Two parsed FP entries that crosswalk to the SAME
    # Sleeper id used to overwrite silently, and `fp_matched` counted the
    # SURVIVORS — so the count reported success on a table that had quietly
    # dropped a player's ADP and replaced it with someone else's. Clean today
    # (343 of 343, zero collisions, verified) and UNCHECKABLE tomorrow, on the
    # table that feeds the value anchor. Nothing would have told us when it
    # changed, which is the whole defect: the numbers that would prove it sat
    # unread in the artifact (rule 14).
    #
    # BOTH CLAIMANTS ARE DROPPED, not arbitrated. A collision means the
    # crosswalk cannot say which player this ADP belongs to, and keeping either
    # one is a guess written into the anchor. A dropped row is a row we do not
    # have, counted as such — which makes the accounting identity below exact,
    # and lets the existing `min_rows` gate handle the volume question: a
    # handful of collisions costs a handful of players, a flood falls back to
    # the FFC anchor on its own. No new threshold, no hair trigger.
    index = build_index(sleeper_players)
    rows, unmatched = {}, 0
    claims: dict[str, list[str]] = {}
    for i, entry in enumerate(parsed):
        pid, method = match_player(entry, index)
        if not pid:
            unmatched += 1
            continue
        claims.setdefault(str(pid), []).append(str(entry.get("name") or f"row {i + 1}"))
        adp = float(entry.get("adp") or (i + 1))
        sd, sd_src = fitted_sd(adp, None)          # FP publishes no sd -> fit from the mean
        rows[str(pid)] = {
            "adp": adp, "adp_sd": sd, "adp_sd_source": sd_src,
            "adp_source": "fantasypros", "match_method": "fp:" + method, "fp_rank": i + 1,
        }
    contested = {pid: names for pid, names in claims.items() if len(names) > 1}
    dropped = 0
    for pid, names in contested.items():
        rows.pop(pid, None)
        dropped += len(names)
    diag.update({
        "fp_matched": len(rows), "fp_unmatched": unmatched,
        # THE THREE NUMBERS, WITH A CONSUMER. `fp_collisions` is the count of
        # Sleeper ids two or more FP rows both claimed; `fp_dropped_to_collision`
        # is how many parsed rows that cost. The identity below is asserted, not
        # merely reported — see test_fp_anchor.py.
        "fp_collisions": len(contested),
        "fp_dropped_to_collision": dropped,
        "fp_collision_names": {pid: names for pid, names in list(contested.items())[:10]},
    })
    # THE ACCOUNTING IDENTITY. Every parsed row is now in exactly one bucket, so
    # a silent loss cannot hide in the difference. app.js renders
    # `fp_matched + fp_unmatched` as the denominator of its coverage line, and
    # under a collision that denominator was quietly short — a wrong number on
    # a live surface, not just a wrong number in a file.
    accounted = len(rows) + unmatched + dropped
    if accounted != len(parsed):
        diag["reason"] = (f"FP crosswalk does not account for its own rows: "
                          f"{len(rows)} matched + {unmatched} unmatched + {dropped} "
                          f"collided = {accounted}, but {len(parsed)} were parsed. "
                          f"A row went missing between the parse and the table; "
                          f"keeping the FFC anchor rather than a table that cannot "
                          f"count itself")
        return None, diag
    if len(rows) < min_rows:
        diag["reason"] = f"only {len(rows)} FP rows crosswalked (< {min_rows}); keeping FFC anchor"
        return None, diag
    return rows, diag


def build_fantasypros_projections(sleeper_players: dict, *, year: int, scoring: dict,
                                  min_rows: int = 60) -> tuple[dict | None, dict]:
    """FantasyPros SEASON PROJECTIONS, scored under OUR league scoring and crosswalked to
    Sleeper ids — the SECOND projection source that turns the C3 sanity-check column from a
    single-source number (which can be wrong in the same direction our machinery is wrong)
    into a real consensus where two sources DISAGREEING is the informative event.

    Returns ({sleeper_id: our_points}, diag) or (None, diag) when the fetch/crosswalk is too
    thin to trust — in which case the caller attaches nothing and the board stays honestly
    single-source. Same coverage-gate safety story as build_fantasypros_table.

    Egress — CI only (FantasyPros is unreachable from the dev sandbox; it IS reachable in CI,
    which is how the FP ADP anchor already works). This runs there and records coverage as
    EVIDENCE: whether FP actually serves projections and how many crosswalk — the empirical
    test of 'is it obtainable', not an assumption from our empty archive.
    """
    import sys as _sys
    from pathlib import Path as _Path
    bt = str(_Path(__file__).resolve().parent / "backtest")
    if bt not in _sys.path:
        _sys.path.insert(0, bt)
    import fantasypros_adp as FP
    from scoring import score_stat_line

    text, url, fdiag = FP.fetch_projections(year)
    parsed = FP.parse_projections(text) if text else []
    diag = {"fp_proj_url": url, "fp_proj_rows_parsed": len(parsed), "fp_proj_fetch": fdiag}
    if len(parsed) < min_rows:
        diag["reason"] = f"only {len(parsed)} FP projection rows parsed (< {min_rows}); single-source"
        return None, diag

    index = build_index(sleeper_players)
    # Same silent-overwrite hazard as the ADP table above, same treatment: a
    # projection we cannot attribute to one player is a projection we do not
    # have. This one feeds the projection source grade, so a swapped row would
    # show up as a mis-graded SOURCE rather than as a missing player.
    out, unmatched, zero = {}, 0, 0
    claims: dict[str, list[str]] = {}
    for i, entry in enumerate(parsed):
        pid, method = match_player(entry, index)
        if not pid:
            unmatched += 1
            continue
        pts = score_stat_line(entry.get("stats") or {}, scoring)
        if not pts:            # a crosswalked player with no scorable stats adds no signal
            zero += 1
            continue
        claims.setdefault(str(pid), []).append(str(entry.get("name") or f"row {i + 1}"))
        out[str(pid)] = round(float(pts), 2)
    contested = {pid: names for pid, names in claims.items() if len(names) > 1}
    dropped = 0
    for pid, names in contested.items():
        out.pop(pid, None)
        dropped += len(names)
    diag.update({"fp_proj_matched": len(out), "fp_proj_unmatched": unmatched,
                 "fp_proj_zero": zero, "fp_proj_collisions": len(contested),
                 "fp_proj_dropped_to_collision": dropped,
                 "fp_proj_collision_names": {p: n for p, n in list(contested.items())[:10]}})
    accounted = len(out) + unmatched + zero + dropped
    if accounted != len(parsed):
        diag["reason"] = (f"FP projection crosswalk does not account for its own rows: "
                          f"{len(out)} + {unmatched} unmatched + {zero} zero + {dropped} "
                          f"collided = {accounted}, but {len(parsed)} were parsed; "
                          f"single-source rather than a table that cannot count itself")
        return None, diag
    if len(out) < min_rows:
        diag["reason"] = f"only {len(out)} FP projections crosswalked (< {min_rows}); single-source"
        return None, diag
    return out, diag


def merge_primary_over_ffc(ffc_table: dict, primary_table: dict) -> tuple[dict, dict]:
    """Merge a primary ADP table (e.g. FantasyPros) OVER the FFC table. The primary sets
    the price wherever it covers a player; FFC fills every player the primary misses;
    FFC's bye is preserved on primary rows (the primary source carries no bye). Returns
    (merged, stats). Same {pid: row} shape apply_with_fallback consumes — it then handles
    only the search_rank tier, so the fallback chain is primary -> FFC -> search_rank."""
    merged = dict(ffc_table)                        # FFC is the coverage backbone (+ bye + sd)
    for pid, prow in primary_table.items():
        row = dict(prow)
        base = ffc_table.get(pid, {})
        if base.get("bye") not in (None, "", 0):
            row["bye"] = base["bye"]
        # ⚠️ AND THE STANDARD DEVIATION, FOR THE SAME REASON AS THE BYE.
        #
        # The line above preserves FFC's bye onto a primary row because "the
        # primary source carries no bye". FANTASYPROS CARRIES NO STDEV EITHER,
        # and that half was missed — so every primary row fell back to
        # `fitted_sd(adp, None)`, a clamped linear rule, and the ONE source that
        # publishes real draft-position dispersion was used for FOUR players.
        #
        # WHY IT MATTERS MORE THAN IT SOUNDS: `adp_sd` is the entire shape of the
        # survival curve — "will he still be there at my next pick", which is the
        # question the war room exists to answer. With a fitted sd, two players
        # at the same ADP have IDENTICAL survival curves by construction; the
        # published stdev is the only thing that knows one of them is a
        # consensus pick and the other splits the room.
        #
        # The MEAN still comes from the primary source, which is the better ADP.
        # Only the dispersion is taken from FFC, and only where FFC published
        # one — a fitted value is never preferred over a measured one, and a
        # measured one is never invented where it does not exist.
        if base.get("adp_sd") is not None and base.get("adp_sd_source") == "ffc":
            row["adp_sd"] = base["adp_sd"]
            row["adp_sd_source"] = "ffc-published"
        merged[pid] = row
    primary_n = sum(1 for r in merged.values() if r.get("adp_source") == "fantasypros")
    ffc_n = sum(1 for r in merged.values() if r.get("adp_source") == "ffc")
    pub_sd = sum(1 for r in merged.values()
                 if str(r.get("adp_sd_source") or "").startswith("ffc"))
    return merged, {"primary_priced": primary_n, "ffc_gap_fill": ffc_n,
                    "total_in_table": len(merged),
                    # HOW MANY SURVIVAL CURVES ARE SHAPED BY A MEASUREMENT rather
                    # than by a clamped line. Reported because "the sd is fitted"
                    # and "the sd is published" are different claims and the
                    # board could not previously tell them apart at all.
                    "published_sd": pub_sd,
                    "fitted_sd": len(merged) - pub_sd}


def _print_report(report: dict, strict_top_n: int) -> None:
    print(f"  ADP: matched {report['matched']}, unmatched {report['unmatched_count']}")
    if report["unmatched"]:
        print(f"  unmatched players (first 25 of {report['unmatched_count']}):")
        for u in report["unmatched"][:25]:
            flag = "  <-- TOP" + str(strict_top_n) if u["rank"] <= strict_top_n else ""
            print(f"    #{u['rank']:>4} {u['name']} ({u['pos']} {u['team']}) adp={u['adp']}{flag}")


def apply_with_fallback(players: list, adp_table: dict, *, teams: int,
                        draft_picks: int | None = None,
                        relevant: int | None = None,
                        projections: dict | None = None) -> dict:
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

    ordered_by_proj = []
    unordered = []
    # ── THE TEAM FALLBACK, BECAUSE A BYE IS A PROPERTY OF THE TEAM ──────────
    #
    # Sleeper leaves bye_week empty in the preseason and FFC only publishes it
    # for players it prices. Everyone else kept bye=None — 564 players carrying a
    # TEAM and no bye, including 37% of the top-225 tight ends.
    #
    # THE DANGER IS THE SILENCE, NOT THE GAP. `byeStack` warns when three
    # starters share a bye; a null bye can never contribute to that count, so the
    # warning stays quiet, and a quiet warning is indistinguishable from one that
    # looked and found no conflict.
    #
    # A bye is a property of the TEAM, so it is fully derivable from any teammate
    # who has one. Measured on the 2026 board: all 32 teams show EXACTLY ONE bye
    # value among their known players and ZERO conflicts, and all 564 gaps fill.
    #
    # UNANIMITY IS REQUIRED RATHER THAN ASSUMED. A team showing two byes is
    # refused rather than resolved by a mode — a WRONG bye manufactures a
    # conflict warning about a week the player actually plays, which is worse
    # than a missing one.
    # ⚠️ THE MAP IS BUILT BELOW, AFTER THE FFC MERGE, AND THAT ORDER IS THE
    # WHOLE FIX. It used to be built HERE, from `p.get("bye")` — and at this
    # point in the function no player has a bye at all, because Sleeper's
    # metadata.bye_week is empty for all 1,737 (this file's own note, three
    # paragraphs up) and the FFC values have not been merged yet. So the map was
    # built from nothing, was empty, and the fill loop below had nothing to
    # apply. Measured on the shipped board: `bye_source` is `ffc` (215) or absent
    # (1,626) across all 1,841 rows and NOT ONE is `team-derived` — the fallback
    # had never fired once, while 35 rows inside the top-225 carried no bye and
    # their own team's bye sat on the same board. The comment above says "all 564
    # gaps fill"; zero did.

    for p in players:
        row = adp_table.get(str(p.get("player_id")))
        if row:
            # ⚠️ `adp_sd_source` IS COMPUTED AND WAS NEVER COPIED, so the board
            # carried it on ZERO of 1,841 rows. `fitted_sd` returns
            # ("ffc"|"clamped-linear") precisely so a consumer can tell a
            # MEASURED dispersion from a fitted one — and the field died here,
            # three lines from the artifact, exactly like `bye_source` and
            # `arithmetic_check.condition` before it.
            #
            # It matters because `adp_sd` is the whole SHAPE of the survival
            # curve. A published stdev knows that one player is a consensus pick
            # and another splits the room; a clamped line cannot, and gives them
            # identical curves at the same ADP. Without the provenance nothing
            # downstream — and nobody reading the board — could tell which of
            # those two things they were looking at.
            p.update({k: row[k] for k in ("adp", "adp_sd", "adp_source")})
            if row.get("adp_sd_source"):
                p["adp_sd_source"] = row["adp_sd_source"]
            # BYE WEEKS. Sleeper's /players/nfl dump carries metadata.bye_week,
            # and in the preseason it is empty for ALL of them — 0 of 1737 on
            # the 2026-08-07 build. So the bye grid and every bye-conflict
            # warning were computing over nulls and silently finding nothing:
            # three starters could share a bye and the tool would say so with
            # a straight face.
            #
            # FFC publishes bye alongside ADP. Fill from it ONLY where Sleeper
            # left a hole — Sleeper is the roster authority and wins whenever
            # it actually has a value, so this cannot overwrite good data with
            # a provider's guess. A player in neither source keeps bye=None,
            # which the grid already renders as unknown rather than as "clear".
            if p.get("bye") in (None, "", 0) and row.get("bye") not in (None, "", 0):
                p["bye"] = int(row["bye"])
                p["bye_source"] = "ffc"
            continue
        # ⚠️ THE DECLARED ORDERING NEVER HAPPENED. C found this and routed it.
        #
        # This said "search_rank orders these players relative to each other,
        # which is all we ask of it". THE BOARD DICTS DO NOT CARRY `search_rank`
        # — zero of them, verified on the shipped board — so `p.get()` returned
        # None, `rank` was 9999, `min(rank, 600.0)` was 600 for everybody, and
        # all 603 fallback players got the IDENTICAL price. `raw_adp` on the
        # shipped board takes exactly ONE distinct value across all of them.
        # A constant wearing the name of an ordering, with a comment asserting
        # the ordering, is the hardest version of this defect to see.
        #
        # ── AND PLUMBING `search_rank` THROUGH WOULD BE WORSE ────────────────
        #
        # Sleeper's search_rank is a POPULARITY rank — how often a name is typed
        # into a search box. That is not draft value, and using it here would
        # replace an honest tie with a confident wrong ordering, which is the
        # more expensive error. C flagged that too and they are right.
        #
        # SO IT IS ORDERED BY THE VALUE QUANTITY WE ACTUALLY HOLD, and only for
        # the players who have one. 274 of the 603 carry a projection; those are
        # ranked among themselves, best first. The remaining 329 have nothing to
        # rank them by, so they stay GENUINELY TIED at the back and say so via
        # `adp_unordered`, rather than being handed a spread that looks like
        # information. A consumer can now tell "ranked 41st of the deep pool"
        # from "one of 329 we cannot separate".
        #
        # THE DISTINCTION IS REPORTED IN PROVENANCE, NOT AS A ROW FIELD. A per-
        # player `adp_unordered` was the obvious shape and it is the wrong one:
        # `season_stamp` requires every board field to be declared with a season
        # classification and a purpose (default-is-violation, and it caught this
        # immediately, which is the guard working). That registry is C's file,
        # and a flag NO LIVE CONSUMER READS is not worth an override — every
        # fallback price starts past the relevant board, so nothing downstream
        # can reach one. The counts below carry the same information to anyone
        # who needs it, in the block that already describes how ADP was sourced.
        #
        # NOTHING HERE REACHES A DECISION TODAY, which is why this is a
        # correctness fix and not an urgent one: every fallback price starts at
        # `ffc_max + 1` by construction and the relevant board is 225 deep, so
        # no fallback player can rank inside it. That is C's measurement and it
        # is the reason this was safe to leave for a day.
        # ⚠️ THIS READ `p.get("proj_mean")` AND proj_mean DOES NOT EXIST YET.
        #
        # Confirmed at line level in build.py: `apply_with_fallback` is called at
        # :527, and `proj_mean` is first assigned inside `projections.blend()` —
        # projections.py:238 — which build.py does not call until :576. So at the
        # moment this loop runs, NO player carries the key. `ordered_by_proj` was
        # empty on every build, every fallback row took the unprojected branch,
        # and all 348 got `ffc_max + 600`.
        #
        # Measured on the shipped board: max real ADP 317, so the unprojected
        # branch writes 917 — and 917 is what all 348 rows carry, including the
        # 274 that DO end up with a projection once blend() runs. The ordering
        # this comment block describes at length has never once executed.
        #
        # THE SECOND VERSION OF THE SAME DEFECT. The paragraph above records the
        # first: `search_rank` was read here and no board dict carried it, so
        # everybody got 600. That was fixed by ordering on projection instead —
        # and the replacement reads a key that is equally absent at this point in
        # the pipeline. A constant wearing the name of an ordering, twice, with
        # the comment asserting the ordering both times.
        #
        # ── SO IT NOW READS WHAT THE CALLER HAS, NOT WHAT IT HOPES FOR ───────
        #
        # `projections` is the `baseline` map build.py already computes at :365 —
        # player_id -> points in our scoring — which EXISTS when this runs. The
        # value is passed in rather than fished out of the row, so "is it
        # populated yet" stops being a question this function can get wrong.
        # `_fallback_proj` reports how the caller answered, so a build that omits
        # it is visible in provenance instead of silently pricing 274 players at
        # a sentinel and calling them ranked.
        proj = None
        if projections:
            raw_proj = projections.get(str(p.get("player_id")))
            if isinstance(raw_proj, (int, float)) and raw_proj > 0:
                proj = float(raw_proj)
        if proj is None:                      # belt and braces: use the row if it has one
            row_proj = p.get("proj_mean")
            if isinstance(row_proj, (int, float)) and row_proj > 0:
                proj = float(row_proj)
        if proj is not None:
            ordered_by_proj.append((proj, p))
        else:
            p["adp"] = ffc_max + 600.0
            p["adp_sd"] = max(8.0, min(0.25 * p["adp"], 30.0))
            p["adp_sd_source"] = "fallback-clamped"   # never a measurement
            p["adp_source"] = "search_rank"
            unordered.append(p.get("player_id"))
        used_fallback.append(p.get("player_id"))

    # THE DEEP POOL, RANKED AMONG ITSELF. Best projection first, one slot apart,
    # starting immediately after the last real ADP — so the ordering is
    # INTERNAL to the fallback and cannot push a fallback player past anybody
    # the market actually priced. The players with no projection sit behind all
    # of them at a single shared price, which is the honest statement that we
    # cannot separate them.
    ordered_by_proj.sort(key=lambda t: -t[0])
    for i, (_proj, _p) in enumerate(ordered_by_proj):
        _p["adp"] = ffc_max + 1.0 + i
        _p["adp_sd"] = max(8.0, min(0.25 * _p["adp"], 30.0))
        _p["adp_sd_source"] = "fallback-clamped"      # never a measurement
        _p["adp_source"] = "search_rank"

    # THE TEAM BYE FALLBACK RUNS LAST, so Sleeper and FFC both win wherever they
    # actually have a value and this only ever fills a hole neither could.
    #
    # BUILT HERE rather than at the top of the function, because only now do the
    # players carry the FFC byes that are the sole source of bye data in the
    # preseason. Same logic, same unanimity refusal — only the position moved.
    team_bye, team_conflict = {}, {}
    for p in players:
        t, b = p.get("team"), p.get("bye")
        if not t or t == "FA" or b in (None, "", 0):
            continue
        prev = team_bye.get(t)
        if prev is None:
            team_bye[t] = int(b)
        elif prev != int(b):
            team_conflict[t] = True
    for t in team_conflict:
        team_bye.pop(t, None)
    if team_conflict:
        print(f"  ! {len(team_conflict)} team(s) report more than one bye week — "
              f"REFUSED rather than guessed: {sorted(team_conflict)}")

    filled = 0
    for q in players:
        if q.get("bye") in (None, "", 0):
            b = team_bye.get(q.get("team"))
            if b is not None:
                q["bye"] = b
                q["bye_source"] = "team-derived"
                filled += 1
    if filled:
        print(f"  bye: filled {filled} from the player's own team "
              f"({len(team_bye)} teams with a unanimous bye)")

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
        # HOW MUCH OF THE FALLBACK IS AN ORDERING AND HOW MUCH IS A TIE. Before
        # 2026-08-13 all of it was a tie and none of it said so: `search_rank` is
        # absent from every board row, so `min(rank, 600.0)` gave all 603 the
        # identical price while a comment claimed they were "ordered relative to
        # each other". Split here so the claim is countable rather than asserted.
        "fallback_ordered_by_projection": len(ordered_by_proj),
        "fallback_unordered_tied": len(unordered),
        "fallback_ordering_basis": (
            "the caller's projection map where present; the remainder share one "
            "price because nothing separates them. NOT search_rank — the board "
            "does not carry it, and it is a popularity rank rather than a value"),
        # ⚠️ THE COUNTS ABOVE WERE TRUE AND USELESS WITHOUT THIS ONE. They read
        # "0 ordered, 348 tied" on every build and nobody noticed, because a
        # deep pool that genuinely cannot be separated reports the same shape.
        # This says WHY it was 0: no projection map was supplied, so the ordering
        # had nothing to rank with. A silent zero and a legitimate zero are
        # different states and looked identical for as long as this existed.
        "fallback_projection_map_supplied": bool(projections),
        "fallback_projection_map_size": len(projections or {}),
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
