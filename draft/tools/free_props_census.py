#!/usr/bin/env python3
# TERRITORY: relay (Cory 2026-09-01: "make sure we are getting all the prop bets
# we need.. if we need to look for more free sources we should do that!")
"""FREE PLAYER-PROPS CENSUS — which keyless sources carry WHICH of the markets
the weekly props arm needs, counted per player, with controls.

THE QUESTION IS PER MARKET, NOT PER SOURCE. The arm (`fetch_weekly_props.py:
MARKET_TO_STAT`) needs eight markets — pass yds/tds/int, rush yds/tds,
receptions, rec yds/tds — and anytime-TD is the ninth we WANT (TDs are the
23–47% of points the yardage markets do not cover, `market_convert.py`). A
source that serves passing yards and nothing else is not "a props source";
it is one column. So the output is a NEED TABLE: for each market, which
sources carry it and how many distinct players each prices this week.

RULE 3e, BUILT IN. Two controls decide whether the census can be read at all:
  C1  reachability — Bovada's main NFL payload must carry a numeric game line
      (known positive since 08-27). If C1 fails the run is a network fact, not
      a props fact.
  C2  player-props positive — at least ONE source must yield a NAMED player
      with a NUMERIC line. If none does, every per-market "0" is UNTESTED
      (week-1 lines may not be posted yet), never "missing".
Every source stores its status, byte count, the first 300 chars of the raw
body, and up to three sample rows — so a wrong parse is visible, not silent
(the five false-negative market probes of 08-18, Rule 3e).

Runs in CI only (the sandbox gateway 403s these hosts):
    python3 draft/tools/free_props_census.py
Writes draft/backtest/free_props_census_2026.json.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "draft" / "backtest" / "free_props_census_2026.json"

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*"}

#: the arm's markets (fetch_weekly_props.MARKET_TO_STAT keys) + the one we want
NEED = ["player_pass_yds", "player_pass_tds", "player_pass_interceptions",
        "player_rush_yds", "player_rush_tds", "player_receptions",
        "player_reception_yds", "player_reception_tds", "player_anytime_td",
        "player_rush_rec_tds"]
#: a JOINT rush+rec TD line satisfies BOTH split TD markets: under this league's
#: scoring a rushing and a receiving touchdown are the same six points, so the
#: split is bookkeeping the arm does not need (found 09-02: Underdog prices
#: 'Rush + Rec TDs' at game week and never the split; the first census called
#: that two gaps).
JOINT_TD_COVERS = {"player_rush_tds", "player_reception_tds"}

#: label -> market key. Every source spells these differently; this is the ONE
#: crosswalk, unit-tested against real labels from each source's payload.
_LABEL_RULES = [
    # ORDER IS THE CROSSWALK. TD/scorer labels first (they contain 'rec'/'rush'
    # words that would otherwise match a yardage or receptions rule), then
    # yardage, then per-stat TDs/INTs, then receptions LAST and only as the
    # whole word — 'Longest Reception' and 'Rec Yds' must never read as
    # receptions (test_free_props_census pins both).
    (r"anytime\s*(touchdowns?|tds?)\b|to score a touchdown|\btd scorer|anytime scorer|touchdown scorer", "player_anytime_td"),
    (r"\brush(ing)?\s*\+\s*rec(eiving)?\s*(tds?|touchdowns)", "player_rush_rec_tds"),
    (r"receiv(ing)?\s*(yards|yds)|\brec\s*(yards|yds)", "player_reception_yds"),
    (r"pass(ing)?\s*(yards|yds)", "player_pass_yds"),
    (r"rush(ing)?\s*(yards|yds)", "player_rush_yds"),
    (r"pass(ing)?\s*(touchdowns|tds?)\b", "player_pass_tds"),
    (r"rush(ing)?\s*(touchdowns|tds?)\b", "player_rush_tds"),
    (r"receiv(ing)?\s*(touchdowns|tds?)\b|\brec\s*(touchdowns|tds?)\b", "player_reception_tds"),
    (r"interceptions?(\s*thrown)?\b|\bints?\s*thrown", "player_pass_interceptions"),
    (r"\breceptions?\b|^rec$", "player_receptions"),
]

#: Sleeper Picks speaks Sleeper's stat keys — the SAME keys our scoring table
#: uses — so its market_type maps directly, no prose parsing.
SLEEPER_STAT_KEYS = {
    "pass_yd": "player_pass_yds", "pass_td": "player_pass_tds", "pass_int": "player_pass_interceptions",
    "rush_yd": "player_rush_yds", "rush_td": "player_rush_tds", "rec": "player_receptions",
    "rec_yd": "player_reception_yds", "rec_td": "player_reception_tds",
    "rush_rec_td": "player_rush_rec_tds", "anytime_td": "player_anytime_td", "td": "player_anytime_td",
}


def market_of(label: str) -> str | None:
    """Normalise a source's market label to our key, or None (not a market we need)."""
    s = (label or "").lower().strip()
    if not s or "longest" in s:
        return None
    if s in SLEEPER_STAT_KEYS:
        return SLEEPER_STAT_KEYS[s]
    s = s.replace("_", " ")          # 'receiving_yards' / 'anytime_touchdowns' spellings
    for pat, key in _LABEL_RULES:
        if re.search(pat, s):
            return key
    return None


def get(url, timeout=25, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except Exception as e:  # noqa: BLE001
        code = getattr(e, "code", None)
        return (code if code else f"{type(e).__name__}: {str(e)[:120]}"), b""


def _src(status, body):
    return {"status": status, "bytes": len(body),
            "raw_head": body[:300].decode("utf-8", "ignore") if body else "",
            "by_market": {}, "samples": [], "notes": []}


def _tally(out, players_by_market: dict[str, set], samples):
    out["by_market"] = {k: len(v) for k, v in players_by_market.items() if v}
    out["samples"] = samples[:3]
    out["players_total"] = len(set().union(*players_by_market.values())) if players_by_market else 0


# ── sources ──────────────────────────────────────────────────────────────────

BOV = "https://www.bovada.lv/services/sports/event/v2/events/A/description"


def bovada():
    """ALL upcoming NFL events, per-event payloads, player markets tallied."""
    st, body = get(BOV + "/football/nfl")
    out = _src(st, body)
    if st != 200:
        return out
    txt = body.decode("utf-8", "ignore")
    # C1 control lives here: a numeric game handicap on the main payload
    out["control_game_line"] = bool(re.search(r'"description":"(Point Spread|Total)".{0,400}?"handicap":"-?\d', txt))
    links = sorted(set(re.findall(r'"link":"(/football/nfl/[^"]+)"', txt)))
    out["events_found"] = len(links)
    pbm: dict[str, set] = {}
    samples = []
    descs: dict[str, int] = {}
    oc_sample: list = []
    for link in links[:20]:
        st2, b2 = get(BOV + link)
        if st2 != 200:
            out["notes"].append(f"{link}: {st2}")
            continue
        try:
            d = json.loads(b2.decode("utf-8", "ignore"))
        except ValueError:
            out["notes"].append(f"{link}: unparseable")
            continue

        def walk(x):
            if isinstance(x, dict):
                if "markets" in x:
                    for m in x.get("markets") or []:
                        desc = m.get("description") or ""
                        key = market_of(desc)
                        if not key:
                            continue
                        descs[desc[:70]] = descs.get(desc[:70], 0) + 1
                        if len(oc_sample) < 3 and key != "player_anytime_td" and (m.get("outcomes") or []):
                            oc_sample.append({"market": desc[:70], "outcome": json.dumps((m.get("outcomes") or [])[0])[:300]})
                        for oc in m.get("outcomes") or []:
                            nm = oc.get("description") or ""
                            hc = (oc.get("price") or {}).get("handicap")
                            # player markets: "Total Passing Yards - Josh Allen (BUF)" style or outcome=player
                            player = None
                            mm = re.search(r"-\s*([A-Z][\w.'\- ]+?)\s*\(", desc)
                            if mm:
                                player = mm.group(1).strip()
                            elif key == "player_anytime_td" and nm and nm.lower() not in ("over", "under", "yes", "no"):
                                player = nm
                            if not player:
                                continue
                            if key != "player_anytime_td" and hc is None:
                                continue
                            pbm.setdefault(key, set()).add(player)
                            if len(samples) < 6:
                                samples.append({"market": key, "player": player, "line": hc, "label": desc[:80]})
                for v in x.values():
                    walk(v)
            elif isinstance(x, list):
                for v in x:
                    walk(v)
        walk(d)
    out["market_descriptions_matched"] = dict(sorted(descs.items(), key=lambda kv: -kv[1])[:30])
    out["outcome_shape_sample"] = oc_sample[:3]
    _tally(out, pbm, samples)
    return out


def draftkings():
    """Public sportsbook JSON: eventgroup 88808 (NFL) -> categories -> offers."""
    base = "https://sportsbook.draftkings.com/sites/US-SB/api/v5/eventgroups/88808"
    hdr = {"Referer": "https://sportsbook.draftkings.com/leagues/football/nfl", "Origin": "https://sportsbook.draftkings.com",
           "Accept-Language": "en-US,en;q=0.9"}
    st, body = get(base + "?format=json", headers=hdr)
    out = _src(st, body)
    if st != 200:
        st3, b3 = get("https://sportsbook-nash.draftkings.com/api/sportscontent/dkusnj/v1/leagues/88808", headers=hdr)
        out["nash_status"], out["nash_bytes"], out["nash_head"] = st3, len(b3), b3[:200].decode("utf-8", "ignore")
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("eventgroup unparseable")
        return out
    cats = ((d.get("eventGroup") or {}).get("offerCategories") or [])
    out["categories"] = [{"id": c.get("offerCategoryId"), "name": c.get("name")} for c in cats][:30]
    pbm: dict[str, set] = {}
    samples = []
    for c in cats:
        name = (c.get("name") or "").lower()
        if not any(w in name for w in ("pass", "rush", "receiv", "td", "touchdown", "player", "prop")):
            continue
        st2, b2 = get(f"{base}/categories/{c.get('offerCategoryId')}?format=json")
        if st2 != 200:
            out["notes"].append(f"category {c.get('name')}: {st2}")
            continue
        try:
            d2 = json.loads(b2.decode("utf-8", "ignore"))
        except ValueError:
            continue
        for cat in ((d2.get("eventGroup") or {}).get("offerCategories") or []):
            for sub in cat.get("offerSubcategoryDescriptors") or []:
                sub_name = sub.get("name") or ""
                key = market_of(sub_name) or market_of(c.get("name") or "")
                for offers in ((sub.get("offerSubcategory") or {}).get("offers") or []):
                    for off in offers or []:
                        lab = off.get("label") or ""
                        k2 = key or market_of(lab)
                        if not k2:
                            continue
                        for oc in off.get("outcomes") or []:
                            player = oc.get("participant") or (lab if k2 == "player_anytime_td" else None)
                            line = oc.get("line")
                            if not player:
                                continue
                            if k2 != "player_anytime_td" and line is None:
                                continue
                            pbm.setdefault(k2, set()).add(str(player))
                            if len(samples) < 6:
                                samples.append({"market": k2, "player": player, "line": line, "label": (sub_name or lab)[:80]})
    _tally(out, pbm, samples)
    return out


def prizepicks():
    hdr = {"Referer": "https://app.prizepicks.com/", "Origin": "https://app.prizepicks.com",
           "Accept-Language": "en-US,en;q=0.9", "X-Device-ID": "census"}
    st, body = get("https://api.prizepicks.com/projections?league_id=9&per_page=2000&single_stat=true", headers=hdr)
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("unparseable")
        return out
    names = {i["id"]: (i.get("attributes") or {}).get("name") for i in d.get("included") or []
             if i.get("type") == "new_player"}
    pbm: dict[str, set] = {}
    samples = []
    stat_types = {}
    for row in d.get("data") or []:
        a = row.get("attributes") or {}
        stat = a.get("stat_type") or ""
        stat_types[stat] = stat_types.get(stat, 0) + 1
        key = market_of(stat)
        pid = ((row.get("relationships") or {}).get("new_player") or {}).get("data", {}).get("id")
        player = names.get(pid)
        if key and player and a.get("line_score") is not None:
            pbm.setdefault(key, set()).add(player)
            if len(samples) < 6:
                samples.append({"market": key, "player": player, "line": a.get("line_score"), "label": stat})
    out["stat_types_seen"] = dict(sorted(stat_types.items(), key=lambda kv: -kv[1])[:25])
    _tally(out, pbm, samples)
    return out


def underdog():
    st, body = get("https://api.underdogfantasy.com/beta/v5/over_under_lines")
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("unparseable")
        return out
    lines = d.get("over_under_lines") or []
    out["top_level_keys"] = sorted(d.keys())
    if lines:
        out["raw_line_shape"] = json.dumps(lines[0])[:900]
    # sport filter: the v5 payload mixes every sport; keep only lines whose
    # appearance/option resolves to NFL, else fall back to a football-stat allowlist
    apps = {a.get("id"): a for a in (d.get("appearances") or [])}
    games = {g.get("id"): g for g in (d.get("games") or [])}
    pbm_week: dict[str, set] = {}
    pbm_season: dict[str, set] = {}
    samples, samples_season = [], []
    stats = {}
    sports = {}
    for ln in lines:
        ou = ln.get("over_under") or {}
        title = ou.get("title") or ""
        ast = ou.get("appearance_stat") or {}
        stat = ast.get("display_stat") or ""
        app = apps.get(ast.get("appearance_id")) or {}
        game = games.get(app.get("match_id")) or {}
        sport = (game.get("sport_id") or app.get("sport_id") or "").upper()
        sports[sport or "?"] = sports.get(sport or "?", 0) + 1
        key = market_of(stat) or market_of(title)
        if not key:
            continue
        if sport and sport != "NFL":
            continue
        stats[stat] = stats.get(stat, 0) + 1
        if ln.get("stat_value") is None:
            continue
        player = title.replace(stat, "").strip(" -") if stat and stat in title else title
        is_season = ("season" in title.lower()) or ("season" in stat.lower()) or not game
        tgt = pbm_season if is_season else pbm_week
        tgt.setdefault(key, set()).add(player)
        smp = samples_season if is_season else samples
        if len(smp) < 6:
            smp.append({"market": key, "player": player, "line": ln.get("stat_value"),
                        "label": stat or title[:80], "game": (game.get("title") or "")[:60],
                        "kickoff": game.get("scheduled_at")})
    out["sports_seen"] = dict(sorted(sports.items(), key=lambda kv: -kv[1])[:10])
    out["stat_types_seen_nfl"] = dict(sorted(stats.items(), key=lambda kv: -kv[1])[:25])
    out["by_market_season"] = {k: len(v) for k, v in pbm_season.items() if v}
    out["samples_season"] = samples_season[:3]
    _tally(out, pbm_week, samples)          # by_market = GAME-WEEK lines only
    return out


def kalshi():
    """Player-stat series (KXNFL*REC*/PASS/RUSH/TD): open markets, distinct players."""
    st, body = get("https://api.elections.kalshi.com/trade-api/v2/series?category=Sports&limit=1000")
    out = _src(st, body)
    if st != 200:
        return out
    try:
        series = (json.loads(body.decode("utf-8", "ignore")) or {}).get("series") or []
    except ValueError:
        out["notes"].append("series unparseable")
        return out
    want = [s for s in series if str(s.get("ticker", "")).startswith("KXNFL")
            and re.search(r"PASS|RUSH|REC|TD|YDS|RECEPTION", s.get("ticker", ""))
            and "SEASON" not in s.get("ticker", "") and "RECORD" not in s.get("ticker", "")]   # game-week only
    out["player_series"] = [{"ticker": s.get("ticker"), "title": s.get("title")} for s in want][:20]
    pbm: dict[str, set] = {}
    samples = []
    for s in want[:12]:
        st2, b2 = get(f"https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker={s['ticker']}&status=open&limit=1000")
        if st2 != 200:
            out["notes"].append(f"{s['ticker']}: {st2}")
            continue
        try:
            mkts = (json.loads(b2.decode("utf-8", "ignore")) or {}).get("markets") or []
        except ValueError:
            continue
        key = market_of(s.get("title") or "") or market_of(s.get("ticker") or "")
        if not key:
            continue
        for m in mkts:
            title = m.get("title") or ""
            mm = re.match(r"(?:Will\s+)?([A-Z][\w.'\-]+(?:\s[A-Z][\w.'\-]+)+)", title)
            if not mm:
                continue
            pbm.setdefault(key, set()).add(mm.group(1))
            if len(samples) < 6:
                samples.append({"market": key, "player": mm.group(1), "line": m.get("floor_strike") or m.get("strike") or m.get("subtitle"), "label": title[:80]})
    _tally(out, pbm, samples)
    return out


def polymarket():
    st, body = get("https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=100")
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        return out
    pbm: dict[str, set] = {}
    samples = []
    for e in (d if isinstance(d, list) else []):
        t = e.get("title") or ""
        key = market_of(t)
        if not key:
            continue
        mm = re.match(r"(?:Will\s+)?([A-Z][\w.'\-]+(?:\s[A-Z][\w.'\-]+)+)", t)
        if not mm or mm.group(1).lower().startswith(("pro football", "nfl", "super bowl")):
            continue
        pbm.setdefault(key, set()).add(mm.group(1))
        if len(samples) < 6:
            samples.append({"market": key, "player": mm.group(1), "line": None, "label": t[:80]})
    _tally(out, pbm, samples)
    return out


def balldontlie():
    """Only meaningful with a key. Cory 09-01: 'we get free props from ... ball
    don't lie'. The 08-18 matrix found the ONE stored key 401 on odds and no
    props route; this re-probes the documented NFL routes each run so a new
    key or plan shows up here without anyone re-asking."""
    key = os.environ.get("BALL_DONT_LIE_API") or os.environ.get("BALLDONTLIE_API_KEY") or ""
    out = {"status": None, "bytes": 0, "raw_head": "", "by_market": {}, "samples": [], "notes": [],
           "key_present": bool(key)}
    if not key:
        out["notes"].append("no key in env — untested, not no")
        return out
    for path in ("nfl/v1/odds?season=2026&week=1", "nfl/v1/player_props?season=2026&week=1",
                 "nfl/v1/props?season=2026&week=1"):
        st, body = get("https://api.balldontlie.io/" + path, headers={"Authorization": key})
        out["notes"].append(f"{path}: {st} {body[:120].decode('utf-8','ignore')!r}")
        if st == 200 and body:
            out["status"], out["bytes"], out["raw_head"] = st, len(body), body[:300].decode("utf-8", "ignore")
    return out




# ── TIER 2 — more keyless doors (Cory 09-02: "Are there more free betting
# sources we can check and get"). Each stores status + raw head; a 403 is a
# bot wall (the headless-browser door is the next step), a 404 is a wrong
# route guess to correct, a 200 with zero markets is a parse to fix — all
# three are visible in the artifact, none reads as "no source".

def _key_census(obj, prefix="", depth=0, acc=None, limit=4):
    """Key-path histogram to depth `limit` — the map a parser is written from."""
    acc = {} if acc is None else acc
    if depth > limit:
        return acc
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            acc[path] = acc.get(path, 0) + 1
            _key_census(v, path, depth + 1, acc, limit)
    elif isinstance(obj, list):
        for v in obj[:50]:
            _key_census(v, prefix + "[]", depth + 1, acc, limit)
    return acc


def _matched_contexts(obj, n=3, acc=None):
    """The enclosing objects around the first few strings our crosswalk matches —
    so the NEXT run's parser reads the real shape, not a guess."""
    acc = [] if acc is None else acc
    if len(acc) >= n:
        return acc
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, str) and market_of(v) and len(acc) < n:
                acc.append(json.dumps(obj)[:700])
                break
        for v in obj.values():
            _matched_contexts(v, n, acc)
    elif isinstance(obj, list):
        for v in obj[:200]:
            _matched_contexts(v, n, acc)
    return acc


def _generic_json(name, url, headers=None):
    st, body = get(url, headers=headers)
    out = _src(st, body)
    if st == 200 and body:
        txt = body.decode("utf-8", "ignore")
        hits = {}
        for pat, key in _LABEL_RULES:
            n = len(re.findall(pat, txt.lower()))
            if n:
                hits[key] = n
        out["label_hits_in_body"] = hits      # presence, NOT a player count
        out["nfl_mentions"] = txt.count("NFL") + txt.lower().count("football")
        try:
            d = json.loads(txt)
            kc = _key_census(d)
            out["key_paths_top"] = dict(sorted(kc.items(), key=lambda kv: -kv[1])[:40])
            out["matched_contexts"] = _matched_contexts(d)
        except ValueError:
            out["notes"].append("body is not JSON")
    return out


def fanduel():
    """Content page: the layout layer is coupons; the MARKETS live under
    attachments.markets[id] with runners (players) and handicaps. Discovery
    stores the distinct marketType values so the map is written from the
    real strings."""
    st, body = get("https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nfl&pbHorizontal=false&_ak=FhMFpcPWXMeyZxOx&timezone=America%2FNew_York",
                   headers={"Referer": "https://sportsbook.fanduel.com/", "Origin": "https://sportsbook.fanduel.com"})
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("unparseable"); return out
    att = d.get("attachments") or {}
    out["attachment_keys"] = {k: (len(v) if isinstance(v, (dict, list)) else 1) for k, v in att.items()}
    markets = att.get("markets") or {}
    mtypes = {}
    pbm: dict[str, set] = {}; samples = []; shape = None
    pbm_season: dict[str, set] = {}
    # game props live on per-event pages; the content page lists the events
    events = att.get("events") or {}
    ev_ids = [str(e.get("eventId") or k) for k, e in (events.items() if isinstance(events, dict) else enumerate(events))
              if (e.get("name") or "").count("@") or (e.get("name") or "").count(" v ")][:16]
    out["events_listed"] = len(events)
    ev_markets = []
    for eid in ev_ids[:16]:
        st2, b2 = get(f"https://sbapi.nj.sportsbook.fanduel.com/api/event-page?_ak=FhMFpcPWXMeyZxOx&eventId={eid}",
                      headers={"Referer": "https://sportsbook.fanduel.com/", "Origin": "https://sportsbook.fanduel.com"})
        if st2 != 200:
            out["notes"].append(f"event {eid}: {st2}"); continue
        try:
            d2 = json.loads(b2.decode("utf-8", "ignore"))
        except ValueError:
            continue
        for m in ((d2.get("attachments") or {}).get("markets") or {}).values():
            ev_markets.append(m)
    out["event_pages_read"] = len(ev_ids) - sum(1 for n in out["notes"] if n.startswith("event "))
    out["event_market_types_seen"] = {}
    for m in ev_markets:
        mt = m.get("marketType") or ""
        out["event_market_types_seen"][mt] = out["event_market_types_seen"].get(mt, 0) + 1
    out["event_market_types_seen"] = dict(sorted(out["event_market_types_seen"].items(), key=lambda kv: -kv[1])[:40])
    all_markets = [(True, m) for m in (markets.values() if isinstance(markets, dict) else markets)] + [(False, m) for m in ev_markets]
    for is_page, m in all_markets:
        mt = m.get("marketType") or ""
        if is_page:
            mtypes[mt] = mtypes.get(mt, 0) + 1
        key = market_of(mt.replace("_", " ")) or market_of(m.get("marketName") or "")
        if not key:
            continue
        is_season = ("REGULAR_SEASON" in mt) or ("regular season" in (m.get("marketName") or "").lower()) or is_page
        if shape is None:
            shape = json.dumps(m)[:900]
        for r in m.get("runners") or []:
            name = r.get("runnerName") or ""
            hc = r.get("handicap")
            if key != "player_anytime_td" and hc is None:
                continue
            if not name or name.lower() in ("over", "under", "yes", "no"):
                continue
            player = re.sub(r"\s*(over|under)\s*[\d.]+$", "", name, flags=re.I).strip()
            (pbm_season if is_season else pbm).setdefault(key, set()).add(player)
            if not is_season and len(samples) < 6:
                samples.append({"market": key, "player": player, "line": hc, "label": mt[:60], "name": (m.get("marketName") or "")[:60]})
    out["market_types_seen_page"] = dict(sorted(mtypes.items(), key=lambda kv: -kv[1])[:20])
    out["by_market_season"] = {k: len(v) for k, v in pbm_season.items() if v}
    out["market_shape"] = shape
    _tally(out, pbm, samples)
    return out


def caesars():
    return _generic_json("caesars",
        "https://api.americanwagering.com/regions/us/locations/nj/brands/czr/sb/v3/sports/americanfootball/events/schedule?competitionIds=007d7c61-07a7-4e18-bb40-15104b6eac92",
        headers={"Referer": "https://sportsbook.caesars.com/", "Origin": "https://sportsbook.caesars.com"})


def actionnetwork():
    return _generic_json("actionnetwork",
        "https://api.actionnetwork.com/web/v1/scoreboard/nfl?bookIds=15&period=game",
        headers={"Referer": "https://www.actionnetwork.com/", "Origin": "https://www.actionnetwork.com"})


def parlayplay():
    st, body = get("https://parlayplay.io/api/v1/crossgame/search/?sport=NFL&league=NFL&includeAlt=true",
                   headers={"Referer": "https://parlayplay.io/", "Origin": "https://parlayplay.io", "X-Parlay-Request": "1", "X-ParlayPlay-Platform": "web"})
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("unparseable"); return out
    pbm: dict[str, set] = {}; samples = []; stats = {}
    for pl in d.get("players") or []:
        name = ((pl.get("player") or {}).get("fullName")) or pl.get("fullName") or ""
        for st_ in pl.get("stats") or []:
            lab = st_.get("statName") or st_.get("name") or ""
            stats[lab] = stats.get(lab, 0) + 1
            key = market_of(lab)
            if key and name and st_.get("statValue") is not None:
                pbm.setdefault(key, set()).add(name)
                if len(samples) < 6:
                    samples.append({"market": key, "player": name, "line": st_.get("statValue"), "label": lab})
    out["stat_types_seen"] = dict(sorted(stats.items(), key=lambda kv: -kv[1])[:20])
    if not pbm:
        out["raw_keys"] = sorted(d.keys())[:20] if isinstance(d, dict) else str(type(d))
    _tally(out, pbm, samples)
    return out


def sleeper_picks():
    """Sleeper's pick'em lines, keyed by subject_id = SLEEPER PLAYER ID — our
    pipeline's native id, so no name crosswalk at all. Discovered 09-02
    (4.3MB, structured). Lines: options[].outcome_value; market_type is a
    Sleeper stat key (pass_yd, rec, rush_td ...)."""
    st, body = get("https://api.sleeper.app/lines/available?sport=nfl")
    out = _src(st, body)
    if st != 200:
        return out
    try:
        d = json.loads(body.decode("utf-8", "ignore"))
    except ValueError:
        out["notes"].append("unparseable"); return out
    rows = d if isinstance(d, list) else (d.get("lines") or d.get("data") or [])
    mtypes = {}; sports = {}; wtypes = {}; wtypes_szn = {}
    pbm: dict[str, set] = {}; samples = []
    for r in rows:
        sport = str(r.get("sport") or "").lower()
        sports[sport] = sports.get(sport, 0) + 1
        wt = str(r.get("wager_type") or "")
        if sport == "nfl_szn":
            wtypes_szn[wt] = wtypes_szn.get(wt, 0) + 1
        if sport != "nfl":
            continue
        wtypes[wt] = wtypes.get(wt, 0) + 1          # NFL game-week stat keys ONLY
        mt = wt
        key = market_of(wt) or market_of(wt.replace("_", " "))
        if not key:
            continue
        pid = str(r.get("subject_id") or "")
        opts = r.get("options") or []
        line = next((o.get("outcome_value") for o in opts if o.get("outcome_value") is not None), None)
        if not pid or line is None:
            continue
        pbm.setdefault(key, set()).add(pid)
        if len(samples) < 6:
            samples.append({"market": key, "player": pid, "line": line, "label": mt,
                            "pos": (opts[0].get("subject_position") if opts else None),
                            "team": (opts[0].get("subject_team") if opts else None),
                            "game_id": r.get("game_id"), "payouts": [o.get("payout_multiplier") for o in opts][:2]})
    out["sports_seen"] = sports
    out["wager_types_nfl_gameweek"] = dict(sorted(wtypes.items(), key=lambda kv: -kv[1])[:40])
    out["wager_types_nfl_season"] = dict(sorted(wtypes_szn.items(), key=lambda kv: -kv[1])[:20])
    if rows:
        out["row_shape"] = json.dumps(rows[0])[:900]
    _tally(out, pbm, samples)
    return out


def betmgm():
    return _generic_json("betmgm",
        "https://sports.nj.betmgm.com/cds-api/bettingoffer/fixtures?x-bwin-accessid=NTEwNjkzZDgtZmZlNy00ZjM4LWI4NDktZGJkY2VjZjMzMWFm&lang=en-us&country=US&userCountry=US&sportIds=11&regionIds=9&competitionIds=35&fixtureTypes=Standard&state=Latest&offerMapping=Filtered&offerCategories=Gridable&skip=0&take=50",
        headers={"Referer": "https://sports.nj.betmgm.com/", "Origin": "https://sports.nj.betmgm.com"})


# ── main ─────────────────────────────────────────────────────────────────────

def need_table(sources: dict) -> dict:
    table = {}
    for mk in NEED:
        carriers = {name: s["by_market"][mk] for name, s in sources.items()
                    if isinstance(s, dict) and s.get("by_market", {}).get(mk)}
        row = {"carriers": dict(sorted(carriers.items(), key=lambda kv: -kv[1])),
               "best": max(carriers.values()) if carriers else 0}
        if mk in JOINT_TD_COVERS and not carriers:
            joint = {name: s["by_market"]["player_rush_rec_tds"] for name, s in sources.items()
                     if isinstance(s, dict) and s.get("by_market", {}).get("player_rush_rec_tds")}
            if joint:
                row = {"carriers": dict(sorted(joint.items(), key=lambda kv: -kv[1])),
                       "best": max(joint.values()), "covered_by": "player_rush_rec_tds (joint line; same 6 pts either way)"}
        table[mk] = row
    return table


def main():
    res = {
        "_territory": "relay census; C consumes for the free props writer (ROUTES TO: C, 09-01)",
        "_ask": "Cory 2026-09-01: make sure we are getting all the prop bets we need; look for more free sources if needed",
        "_need": NEED,
        "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "sources": {},
    }
    for name, fn in [("bovada", bovada), ("draftkings", draftkings), ("prizepicks", prizepicks),
                     ("underdog", underdog), ("kalshi", kalshi), ("polymarket", polymarket),
                     ("balldontlie", balldontlie),
                     ("fanduel", fanduel), ("caesars", caesars), ("actionnetwork", actionnetwork),
                     ("parlayplay", parlayplay), ("sleeper_picks", sleeper_picks), ("betmgm", betmgm)]:
        try:
            res["sources"][name] = fn()
        except Exception as e:  # noqa: BLE001
            res["sources"][name] = {"error": f"{type(e).__name__}: {str(e)[:200]}", "by_market": {}}
    # controls
    c1 = bool((res["sources"].get("bovada") or {}).get("control_game_line"))
    c2 = any(s.get("samples") for s in res["sources"].values() if isinstance(s, dict))
    res["controls"] = {
        "C1_reachability_bovada_game_line": c1,
        "C2_any_source_named_player_numeric_line": c2,
    }
    res["need_table"] = need_table(res["sources"])
    if not c1:
        verdict = "VOID — C1 failed: the network did not reach a known-positive game line; nothing below is a props fact"
    elif not c2:
        verdict = "UNTESTED — no source returned a named player with a numeric line (week lines may not be posted); zeros are NOT 'missing'"
    else:
        missing = [mk for mk, row in res["need_table"].items() if row["best"] == 0]
        thin = [mk for mk, row in res["need_table"].items() if 0 < row["best"] < 20]
        verdict = ("COVERED — every needed market has a free GAME-WEEK carrier" if not missing else
                   f"GAPS — no free carrier for: {', '.join(missing)} -> find more sources (Cory's rule)")
        if thin:
            verdict += f" | THIN (<20 players): {', '.join(thin)}"
    res["verdict"] = verdict
    OUT.write_text(json.dumps(res, indent=1))
    print("FREE PLAYER-PROPS CENSUS —", res["captured_at"])
    print(" controls:", res["controls"])
    for name, s in res["sources"].items():
        print(f"  {name:12} status={s.get('status')} bytes={s.get('bytes')} markets={s.get('by_market')}")
    print(" NEED TABLE:")
    for mk, row in res["need_table"].items():
        print(f"  {mk:28} best={row['best']:4}  carriers={row['carriers']}")
    print(" VERDICT:", verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
