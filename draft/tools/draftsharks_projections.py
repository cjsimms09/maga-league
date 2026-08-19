# TERRITORY: C (written by A on Cory's ruling, 2026-08-19)
"""Extract the Draft Sharks rankings table into a STORE.

Cory, 2026-08-19: "We want to use their ceiling not ours."

The technical case is register 119: our `proj_ceiling` is `mean + 1.28 x sd`
across three projection SOURCES, so it measures how much analysts disagree.
Measured cost -- in the ADP 90-250 band the mid-round receiver carries the
NARROWEST band on our board, which is absurd as volatility and exactly right
as agreement. Draft Sharks publishes a per-player Floor/Ceiling instead, which
is the quantity the equation actually needs.

The shape probe (draftsharks_shape.json) found the header:
  RK | Player | Games | ADP | Bye | SOS | InjuryRisk | Floor Proj |
  Consensus Proj | DS Proj | Ceiling Proj | 3D Value

This writes a STORE ONLY -- draft/data/draftsharks_projections.json. It does
NOT touch public/draft_data.json, does not join the crosswalk and does not
change any board field. The join and the swap are a separate, gated step
(draftsharks_join.js), because a PARTIAL ceiling swap is worse than none:
half the board on a modelled range and half on a cross-source band is not
comparable, and every VONA margin crosses positions.

Run: python3 draft/tools/draftsharks_projections.py
"""
from __future__ import annotations
import json, re, sys, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path

URL = "https://www.draftsharks.com/rankings/half-ppr"
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "draft" / "data" / "draftsharks_projections.json"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# header text -> our field name. Matched by SUBSTRING on a normalised header,
# never by fixed index: the live header carries doubled responsive labels
# ("CeilingProjCeil Proj"), so an index map would break the first time they
# reflow the table and would break SILENTLY, shifting ceiling into 3D Value.
FIELD_PATTERNS = [
    ("rank",        r"^rk$|^rank$"),
    ("player",      r"^player"),
    ("games",       r"^games"),
    ("adp",         r"^adp"),
    ("bye",         r"^bye"),
    ("sos",         r"^sos"),
    ("injury_risk", r"injuryrisk|injury risk"),
    ("floor",       r"floor"),
    ("consensus",   r"consensus|cons proj"),
    ("ds_proj",     r"^ds proj|\bds proj\b"),
    ("ceiling",     r"ceiling|ceil proj"),
    ("value_3d",    r"3d value"),
]


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self._t, self._r, self._c = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._t = []
        elif tag == "tr" and self._t is not None:
            self._r = []
        elif tag in ("td", "th") and self._r is not None:
            self._c = []
        elif self._c is not None:
            # ⛔ THE PLAYER NAME IS NOT TEXT. First capture returned 'DET 1'
            # for the Player cell -- team and bye -- and resolved 0 of 25
            # positions, caught by C3. The numeric columns were fine (C2
            # passed), so only this cell is special: the name lives in an
            # attribute on a nested element, not in a text node. Harvest the
            # attributes that carry human-readable names.
            d = dict(attrs)
            for k in ("alt", "title", "aria-label", "data-name", "data-player"):
                v = d.get(k)
                if v and len(v) > 1:
                    # \x00 delimits each attribute so they stay SEPARATE
                    # candidates. Joining them with a space made title=
                    # and alt= merge into one capitalised run and the
                    # name came out doubled.
                    self._c.append("\x00" + v + "\x00")

    def handle_endtag(self, tag):
        if tag == "table" and self._t is not None:
            self.tables.append(self._t); self._t = None
        elif tag == "tr" and self._r is not None:
            if self._r:
                self._t.append(self._r)
            self._r = None
        elif tag in ("td", "th") and self._c is not None:
            self._r.append(re.sub(r"[ \t\r\n]+", " ", "".join(self._c)).strip())
            self._c = None

    def handle_data(self, data):
        if self._c is not None:
            self._c.append(data)


def num(s):
    if s is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(s).replace(",", ""))
    return float(m.group(0)) if m else None


def map_columns(header):
    """header index -> field name, by substring. Reports what it could NOT map."""
    norm = [re.sub(r"\s+", " ", h or "").strip().lower() for h in header]
    col, used = {}, set()
    for field, pat in FIELD_PATTERNS:
        for i, h in enumerate(norm):
            if i in used:
                continue
            if re.search(pat, h):
                col[field] = i
                used.add(i)
                break
    return col, [h for i, h in enumerate(norm) if i not in used and h]


def parse_rows(table, col):
    """Rows whose width matches the header. Tier separators are 1 cell wide and
    are skipped, counted, never silently merged into a player row."""
    width = len(table[0])
    out, tiers, odd = [], 0, 0
    for r in table[1:]:
        if len(r) == 1:
            tiers += 1
            continue
        if len(r) != width:
            odd += 1
            continue
        rec = {}
        for f, i in col.items():
            v = r[i] if i < len(r) else None
            # injury_risk is CATEGORICAL ("Low"/"Medium"/"High") -- num() would
            # null it silently and we would ship a column of Nones that looks
            # like missing data rather than like a type error.
            rec[f] = v if f in ("player", "injury_risk") else num(v)
        # the player cell carries name + team + pos in one blob on this site
        raw = r[col["player"]] if "player" in col else ""
        rec["player_raw"] = (raw or "").replace("\x00", " | ")
        m = re.search(r"\b(QB|RB|WR|TE|K|DEF|DST)\b", raw or "")
        rec["position"] = ("DEF" if m and m.group(1) in ("DEF", "DST") else
                           (m.group(1) if m else None))
        # the cell is a soup of team, bye and (from attributes) the name. Take
        # the longest run that looks like a person's name rather than the first
        # fragment -- the first fragment is what produced 'DET 1'.
        cands = []
        for chunk in re.split(r"\x00", raw or ""):
            for c in re.findall(r"[A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+)+", chunk):
                # drop a trailing position or team token: "Jahmyr Gibbs RB" -> name
                c = re.sub(r"\s+(QB|RB|WR|TE|K|DEF|DST)\b.*$", "", c).strip()
                if c and not re.fullmatch(r"[A-Z]{2,4}(\s+\d+)?", c) and c not in cands:
                    cands.append(c)
        # SHORTEST multi-word candidate: the name itself, not a name plus suffixes
        multi = [c for c in cands if len(c.split()) >= 2]
        rec["player"] = (min(multi, key=len)[:60] if multi
                         else (cands[0][:60] if cands else ""))
        if rec.get("ceiling") is not None or rec.get("ds_proj") is not None:
            out.append(rec)
    return out, tiers, odd


def main() -> int:
    req = urllib.request.Request(URL, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            status, html = r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        html = e.read().decode("utf-8", errors="replace") if e.fp else ""

    p = Tables(); p.feed(html)
    best = max(p.tables, key=len) if p.tables else []
    # If the name extraction fails again, the answer must be IN the artifact
    # rather than requiring another round trip to a host we cannot reach.
    m_row = re.search(r"<tr[^>]*>(?:(?!</tr>).){200,}?</tr>", html, re.DOTALL)
    sample_row_html = (m_row.group(0)[:3000] if m_row else None)
    col, unmapped = (map_columns(best[0]) if best else ({}, []))
    rows, tiers, odd = (parse_rows(best, col) if col.get("player") is not None
                        else ([], 0, 0))

    ctl = {}
    ctl["C1_required_columns_mapped"] = {
        "ok": all(f in col for f in ("player", "floor", "ceiling", "ds_proj")),
        "mapped": col, "unmapped_headers": unmapped,
        "why": "matched by SUBSTRING, never by index -- the live header carries "
               "doubled responsive labels, so an index map would silently shift "
               "ceiling into 3D Value the first time they reflow the table"}
    ctl["C2_ceiling_above_proj_above_floor"] = (lambda bad: {
        "ok": len(rows) > 0 and not bad, "violations": bad[:5],
        "why": "a row where ceiling <= projection <= floor does not hold means "
               "the columns are crossed -- this is the check that catches a "
               "mis-map that C1 cannot, because a wrong-but-numeric column "
               "still maps"})([
        r["player"] for r in rows
        if None not in (r.get("floor"), r.get("ds_proj"), r.get("ceiling"))
        and not (r["floor"] <= r["ds_proj"] <= r["ceiling"])])
    ctl["C3_positions_resolved"] = {
        "ok": sum(1 for r in rows if r.get("position")) >= 0.8 * max(1, len(rows)),
        "resolved": sum(1 for r in rows if r.get("position")), "rows": len(rows)}
    ctl["C4_tier_rows_excluded_not_merged"] = {
        "ok": True, "tier_separator_rows_skipped": tiers, "odd_width_rows": odd}

    all_ok = all(c["ok"] for c in ctl.values())
    doc = {
        "_territory": "TERRITORY: C — written by draftsharks_projections.py",
        "_what": "STORE ONLY. Cory ruled 2026-08-19 'we want to use their ceiling "
                 "not ours' (register 119). This does NOT touch "
                 "public/draft_data.json and does not join the crosswalk.",
        "_ruling": "CORY-ASKS A19 / A20",
        "url": URL, "status": status, "bytes": len(html),
        "controls": ctl, "controls_all_passed": all_ok,
        "n_players": len(rows),
        "coverage_note": "the page server-renders only its first page of "
                         "rankings; the remainder is behind pagination/XHR "
                         "(register 120, routed to C)",
        "sample_row_html": sample_row_html,
        "players": rows,
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"status={status} players={len(rows)} tiers_skipped={tiers} controls_ok={all_ok}")
    for k, v in ctl.items():
        print(("  OK  " if v["ok"] else "  FAIL") + " " + k)
    if rows:
        r = rows[0]
        print(f"  sample: {r.get('player')!r} pos={r.get('position')} "
              f"floor={r.get('floor')} ds={r.get('ds_proj')} ceil={r.get('ceiling')}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
