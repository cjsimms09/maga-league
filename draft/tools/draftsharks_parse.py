# TERRITORY: C
"""Parses Draft Sharks' half-PPR rankings, captured as user-provided PDF
exports since the live site is blocked at CONNECT from both the agent
sandbox and GitHub Actions' network -- see draftsharks_discover.py and
register 116/117 in DEFECT-REGISTER.md.

Cory, 2026-08-19: "can you view this site, pull in all these projections,
score for our league and put them in our database" -- then, seeing a second
export, "This also has ceiling and floor projections!! Which we need".

TWO SOURCE FILES, SAME 250-PLAYER RANKING, DIFFERENT COLUMNS:
  draftsharks_pts_raw.txt   -- per-category HALF-PPR POINTS (pass/rush/rec/
                               kick/def totals) + a proprietary "3D Value"
  draftsharks_ceil_raw.txt  -- ADP, injury risk %, floor/consensus/DS/ceiling
                               point projections + the same "3D Value"

BOTH ARE ALREADY-SCORED HALF-PPR POINTS UNDER DRAFT SHARKS' OWN RULES, NOT
RAW STAT LINES (pass yards, rush yards, receptions, TDs, etc). This project's
own convention (register: "score raw stat lines under our own league
table") cannot be followed here -- there is nothing to rescore. This store
is honestly labelled as Draft Sharks' own half-PPR opinion, the same
pattern already used for FantasyPros' consensus ranks
(expert_spread_artifact.py), not blended into proj_mean.

PARSING NOTES, because pdftotext -layout reflows a multi-column table
across page breaks in ways that are NOT visually obvious:
  1. The literal digit inside a "TIER N" heading can collide with a rank
     number and must be excluded from the rank-marker search.
  2. A player's NAME can appear either immediately BEFORE its rank number
     (the common case) or immediately AFTER it (when a page break falls
     between the name and its row of numbers) -- both are handled.
  3. At some page breaks the LAST column (3D Value, or the rank number
     itself) reflows onto the name's line ahead of the other numbers,
     producing token order that does not match column order. Two such
     rows in the ceiling file (ranks 51, 247) were verified by hand
     against the raw text and are corrected via VERIFIED_OVERRIDES below
     -- never silently guessed.

Verified against the source text before trusting (rule 3e/3f): every
parsed row satisfies floor_proj <= ceil_proj (250/250), and known values
for players Gibbs/Robinson/Nacua/Chase/McCaffrey/Prescott/Fitzgerald/etc.
were hand-checked against the raw PDF text.

Run: python3 draft/tools/draftsharks_parse.py
"""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "draft" / "data"

TEAMS = {"ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
         "GB", "HOU", "IND", "JAC", "JAX", "KC", "LAC", "LAR", "LA", "LVR", "LV", "MIA",
         "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS", "UNS"}
POS_RE = re.compile(r"^(QB|RB|WR|TE|K|DEF)(\d+)$")
GLUED_RE = re.compile(r"^(\d)([A-Z]{2,4})$")

# pdftotext dropped the "fi" ligature glyph in this one name (matches the
# "No font in show" / "Missing language pack" warnings logged during
# extraction). Only one such corruption was found across all 250 names.
NAME_FIXES = {"B May_eld": "B Mayfield"}

DROP_MARKERS = [
    "https://www.draftsharks.com", "Page ", "GET OUR AWARD", "GET INSTANT ACCESS",
    "SELECT BILLING", "Monthly", "Semi-Annual", "Annual", "Save 60%", "TRADITIONAL LEAGUES",
    "PLUS KEEPER", "PLUS PERSONALIZED", "Unlimited Live-Draft", "Draft War Room",
    "Mock Draft Trainer", "Free Agent Finder", "Sit-Start Team Guide", "Trade Navigator",
    "Your prorated price", "Get Instant Access", "Keeper Tools", "Dynasty Tools",
    "Auction Tools", "Best Ball War Room", "Get personalized advice", "Draft questions",
    "Lineup decisions", "Trade and Waiver", "Really, any fantasy", "Via email", "Compare Plans",
    "ADVICE", "Perfect Draft Guide", "Best Way To Draft", "Sleepers", "Breakouts", "Best Draft Position",
    "Latest Podcast", "REDRAFT RANKINGS", "DS UNIVERSITY", "TOOLS EXPLAINED", "DYNASTY RANKINGS",
    "DRAFT SHARKS", "DOWNLOAD OUR APP", "PODCAST", "Privacy Policy", "Redraft", "Rankings >",
    "HALF-PPR", "RANKINGS", "FANTASY", "FOOTBALL", "By Draft Sharks Team", "Pass »", "RK    Player",
    "RKRK Player", "Total   Total", "Why Wouldn't You", "Dominate Your Draft",
    "$6", "$8", "$16", "$22", "$44", "billed semi", "Injury", "DSInjury",
    "SYNC DRAFT WAR ROOM",
]

# Two rows where a page break reflowed the LAST column ahead of the others,
# breaking token order. Verified by hand against draftsharks_ceil_raw.txt
# (register 117): "D Maye ... NE QB3 / 51 ... 33" and
# "K Miller ... 247 NO RB78 ... -6" -- the numbers are unambiguous in the raw
# text, only their association with the rank marker needed correcting.
CEIL_OVERRIDES = {
    39: {"name": "J Waddle", "team": "DEN", "position": "WR", "position_rank": 19,
         "adp": 4.09, "injury_risk_pct": 37, "floor_proj": 164, "cons_proj": 163,
         "ds_proj": 193, "ceil_proj": 247, "value_3d": 40},
    40: {"name": "K Williams", "team": "LAR", "position": "RB", "position_rank": 17,
         "adp": 3.04, "injury_risk_pct": 52, "floor_proj": 193, "cons_proj": 207,
         "ds_proj": 217, "ceil_proj": 282, "value_3d": 40},
    51: {"name": "D Maye", "team": "NE", "position": "QB", "position_rank": 3,
         "adp": 5.07, "injury_risk_pct": 35, "floor_proj": 296, "cons_proj": 315,
         "ds_proj": 340, "ceil_proj": 428, "value_3d": 33},
    247: {"name": "K Miller", "team": "NO", "position": "RB", "position_rank": 78,
          "adp": 36.06, "injury_risk_pct": 33, "floor_proj": 36, "cons_proj": 26,
          "ds_proj": 45, "ceil_proj": 158, "value_3d": -6},
}

PTS_OVERRIDES = {
    39: {"name": "J Waddle", "team": "DEN", "position": "WR", "position_rank": 19,
         "pts_pass": 0, "pts_rush": 4, "pts_rec": 189, "pts_kick": 0, "pts_def": 0,
         "value_3d_pts": 40},
    40: {"name": "K Williams", "team": "LAR", "position": "RB", "position_rank": 17,
         "pts_pass": 0, "pts_rush": 165, "pts_rec": 52, "pts_kick": 0, "pts_def": 0,
         "value_3d_pts": 40},
}


def load_tokens(path: Path) -> list[str]:
    lines = path.read_text().splitlines()
    text_lines = [ln for ln in lines
                  if ln.strip() and ln.strip() != ":"
                  and not any(m in ln for m in DROP_MARKERS)]
    return " ".join(text_lines).split()


def find_rank_markers(tokens: list[str], max_rank: int = 250) -> list[tuple[int, int]]:
    """The digit inside a "TIER N" heading is excluded -- otherwise it collides
    with a rank number. One further, genuine coincidence exists in this data
    and is NOT handled here: ranks 39 and 40 both carry a 3D Value of exactly
    40, so the naive search finds rank 39's OWN trailing value and mistakes it
    for rank 40's marker, corrupting both rows. Rather than guess a general
    heuristic (tried one; it silently broke a different, legitimate reflow
    at rank 247), both rows are corrected via explicit, hand-verified
    OVERRIDES below -- rule 3e/3f: verify the actual collision, don't paper
    over it with an untested rule."""
    found = []
    next_rank = 1
    for idx, tok in enumerate(tokens):
        if idx > 0 and tokens[idx - 1] == "TIER":
            continue  # the digit inside "TIER N", not a row rank
        if tok.isdigit() and int(tok) == next_rank and next_rank <= max_rank:
            found.append((next_rank, idx))
            next_rank += 1
    return found


NAME_STOPWORDS = {"PROJ", "VALUE", "RISK", "ADP", "CONS", "CEIL", "FLOOR", "DS", "3D",
                  "TIER", "RK", "PLAYER", "TOTAL", "PASS", "RUSH", "REC", "KICK", "DEF"}


def clean_name(raw: str) -> str:
    """Keep only the trailing name-shaped tokens -- verified safe against all
    250 rows (only ranks 1 and 18 needed it; every other row's name was
    already clean and this is a no-op on those)."""
    toks = raw.split()
    kept = []
    for t in reversed(toks):
        bare = t.rstrip(".,")
        if bare.upper() in NAME_STOPWORDS or bare in TEAMS or POS_RE.match(bare):
            break
        kept.insert(0, t)
        if len(kept) >= 4:
            break
    return " ".join(kept) if kept else raw


def extract_team_pos(bucket: list[str]):
    for j, tok in enumerate(bucket):
        if tok in TEAMS and j + 1 < len(bucket) and POS_RE.match(bucket[j + 1]):
            m = POS_RE.match(bucket[j + 1])
            return tok, m.group(1), int(m.group(2)), {j, j + 1}
        m = GLUED_RE.match(tok)
        if m and m.group(2) in TEAMS and j + 1 < len(bucket) and POS_RE.match(bucket[j + 1]):
            pm = POS_RE.match(bucket[j + 1])
            return m.group(2), pm.group(1), int(pm.group(2)), {j, j + 1}
    return None, None, None, set()


def parse(tokens: list[str], numeric_pattern: str, n_numbers: int) -> list[dict]:
    marks = find_rank_markers(tokens)
    n = len(tokens)
    records = []
    consumed_upto = 0

    for k in range(len(marks)):
        rank, ridx = marks[k]
        next_ridx = marks[k + 1][1] if k + 1 < len(marks) else n

        pre_words = [t for t in tokens[consumed_upto:ridx] if not t.isdigit() and t != "TIER"]

        bucket = tokens[ridx + 1:next_ridx]
        cleaned = []
        j = 0
        while j < len(bucket):
            if bucket[j] == "TIER" and j + 1 < len(bucket) and bucket[j + 1].isdigit():
                j += 2
                continue
            cleaned.append(bucket[j])
            j += 1
        bucket = cleaned

        team, pos, posrank, used = extract_team_pos(bucket)
        first_used_idx = min(used) if used else None

        nums, leftover_words = [], []
        consumed_bucket_upto = 0
        for j, tok in enumerate(bucket):
            if j in used:
                consumed_bucket_upto = max(consumed_bucket_upto, j + 1)
                continue
            if re.match(numeric_pattern, tok) and len(nums) < n_numbers:
                nums.append(tok)
                consumed_bucket_upto = max(consumed_bucket_upto, j + 1)
                continue
            if len(nums) == 0 and (first_used_idx is None or j < first_used_idx):
                leftover_words.append(tok)
                consumed_bucket_upto = max(consumed_bucket_upto, j + 1)
                continue
            if len(nums) >= n_numbers:
                break

        name = " ".join(leftover_words) if leftover_words else " ".join(pre_words)
        rec = {"rank": rank, "name": name.strip(), "team": team, "position": pos,
               "position_rank": posrank}
        if len(nums) == n_numbers:
            rec["_nums"] = nums
        else:
            rec["_parse_error"] = f"got {len(nums)}/{n_numbers} nums: {nums}"

        records.append(rec)
        consumed_upto = ridx + 1 + consumed_bucket_upto

    return records


def _pts_plausible(position: str, p: int, ru: int, rec_: int, k: int, d: int) -> bool:
    """A ranked player's own category is never entirely absent, and no other
    position carries pass/kick/def points at all. The first version of this
    check only forbade impossible categories and let a QB through with
    ZERO passing points, which is how rank 217 (a real QB, 214 pass points)
    stayed silently mismapped after that column also reflowed -- verified
    against the raw text, not assumed: this is the same page-break cause as
    the ceiling file, corrupting this file's category split too. No
    format-distinguishable anchor exists here (all six columns are plain
    integers, unlike ADP's decimal shape), so football structure is the
    fallback signal."""
    if position == "QB":
        return p > 0 and k == 0
    if position == "RB":
        return p == 0 and k == 0 and (ru > 0 or rec_ > 0)
    if position in ("WR", "TE"):
        return p == 0 and k == 0
    if position == "K":
        return k > 0 and p == 0 and ru == 0 and rec_ == 0 and d == 0
    if position == "DEF":
        return d > 0 and p == 0 and ru == 0 and rec_ == 0 and k == 0
    return True


def parse_pts() -> dict[int, dict]:
    tokens = load_tokens(DATA / "draftsharks_pts_raw.txt")
    recs = parse(tokens, r"^-?\d+$", 6)
    out = {}
    for r in recs:
        rank = r["rank"]
        if rank in PTS_OVERRIDES:
            r.pop("_nums", None)
            r.pop("_parse_error", None)
            r.update(PTS_OVERRIDES[rank])
        elif "_nums" in r:
            vals = [int(x) for x in r.pop("_nums")]
            p, ru, rec_, k, d, v = vals
            if not _pts_plausible(r["position"], p, ru, rec_, k, d):
                # The value column reflowed to print FIRST (same page-break
                # cause as the ceiling file): vals[0] is really the value,
                # and the true pass/rush/rec/kick/def are vals[1:6]. Accept
                # only if that specific move fixes it -- never guess past
                # what's demonstrably true of this one row.
                new_v, new_p, new_ru, new_rec, new_k, new_d = vals[0], *vals[1:6]
                if _pts_plausible(r["position"], new_p, new_ru, new_rec, new_k, new_d):
                    p, ru, rec_, k, d, v = new_p, new_ru, new_rec, new_k, new_d, new_v
                else:
                    r["_parse_error"] = f"implausible either order: {vals} pos={r['position']}"
                    p, ru, rec_, k, d, v = (int(x) for x in vals)
            r.update(pts_pass=p, pts_rush=ru, pts_rec=rec_, pts_kick=k, pts_def=d, value_3d_pts=v)
        out[rank] = r
    return out


def parse_ceil() -> dict[int, dict]:
    tokens = load_tokens(DATA / "draftsharks_ceil_raw.txt")
    recs = parse(tokens, r"^-?\d+(\.\d+)?%?$", 7)
    out = {}
    for r in recs:
        rank = r["rank"]
        if rank in CEIL_OVERRIDES:
            r.pop("_nums", None)
            r.pop("_parse_error", None)
            r.update(CEIL_OVERRIDES[rank])
        elif "_nums" in r:
            n = r.pop("_nums")
            adp_tok = next((x for x in n if re.match(r"^\d+\.\d+$", x)), None)
            risk_tok = next((x for x in n if x.endswith("%")), None)
            rest = [x for x in n if x not in (adp_tok, risk_tok)]
            if adp_tok and risk_tok and len(rest) == 5:
                # At some page breaks the LAST column (3D Value) reflows onto
                # the name's own line, printing BEFORE adp/risk/floor/etc in
                # the token stream instead of after. This checks the NUMBERS'
                # OWN relative order (is ADP the first of the 7 collected, as
                # header order says it always is when unwrapped?) rather than
                # where the numbers-block sits relative to team/pos, which
                # varies normally either way and is not the signal (an
                # earlier version of this check used that and would have
                # corrupted every row using the equally-common
                # numbers-then-team/pos layout -- caught before shipping by
                # re-deriving from the header's own stated column order
                # rather than trusting the first fix that ran clean).
                if n[0] != adp_tok:
                    rest = rest[1:] + rest[:1]
                r["adp"] = float(adp_tok)
                r["injury_risk_pct"] = int(risk_tok[:-1])
                r["floor_proj"], r["cons_proj"], r["ds_proj"], r["ceil_proj"], r["value_3d"] = (
                    int(x) for x in rest)
            else:
                r["_parse_error"] = f"adp={adp_tok} risk={risk_tok} rest={rest}"
        out[rank] = r
    return out


_SUFFIX_RE = re.compile(r"\b(jr\.?|sr\.?|ii|iii|iv|v)\b", re.IGNORECASE)


def _has_suffix(name: str) -> bool:
    return bool(_SUFFIX_RE.search(name))


def _first_initial_key(name: str, ADP) -> str:
    """Draft Sharks abbreviates EVERY first name to a single initial ("M
    Stafford", not "Matthew Stafford"). `adp._initials_key` only collapses
    the SLEEPER side's own name when ITS first token is already <=3 chars
    (built for genuine short names like "DK Metcalf"), so it does not fire
    for "Matthew" and cannot bridge this gap. Reuses `normalize_name` (rule
    11 — same suffix/punctuation handling on both sides) but always takes
    just the first letter, regardless of the real first name's length."""
    parts = ADP.normalize_name(name).split()
    if len(parts) < 2:
        return ""
    return parts[0][0] + " ".join(parts[1:])


def build_board_index():
    """`adp.build_index` expects a raw Sleeper players dict; the full Sleeper
    API is blocked from this sandbox (same as the site itself), but the live
    board already carries 700 real rostered players with sleeper_id/name/
    team/position, drawn from Sleeper originally. Use it as the crosswalk
    source rather than inventing a second one (rule 11) -- pulling from BOTH
    `players` and `kept_players`, since register 80 is exactly the bug of a
    join walking only `players` and silently missing keepers."""
    import sys
    sys.path.insert(0, str(ROOT / "draft"))
    import adp as ADP

    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    sleeper_players = {}
    for p in board.get("players", []) + board.get("kept_players", []):
        pid = p.get("player_id")
        if not pid:
            continue
        sleeper_players[pid] = {
            "full_name": p.get("name"),
            "position": p.get("position"),
            "team": p.get("team"),
            "search_rank": p.get("overall_rank"),
        }
    index = ADP.build_index(sleeper_players)

    by_first_initial = collections.defaultdict(list)
    for pid, p in sleeper_players.items():
        k = _first_initial_key(p["full_name"] or "", ADP)
        if k:
            by_first_initial[k].append({
                "id": pid, "name": p["full_name"], "has_suffix": _has_suffix(p["full_name"] or ""),
                "pos": ADP._norm_pos(p["position"]), "team": ADP._norm_team(p["team"]),
                "rank": p.get("search_rank")})
    index["by_first_initial"] = dict(by_first_initial)

    by_last_name = collections.defaultdict(list)
    for pid, p in sleeper_players.items():
        parts = ADP.normalize_name(p["full_name"] or "").split()
        if len(parts) >= 2:
            by_last_name[parts[-1]].append({
                "id": pid, "name": p["full_name"],
                "pos": ADP._norm_pos(p["position"]), "team": ADP._norm_team(p["team"]),
                "rank": p.get("search_rank")})
    index["by_last_name"] = dict(by_last_name)
    return index, ADP


def match_draftsharks_player(row: dict, index: dict, ADP) -> tuple[str | None, str]:
    """Try adp.match_player's normal paths first (full name, DEF-by-team),
    then fall back to the first-initial collapse this source specifically
    needs. Position is required to break a tie 1:1, same discipline as
    `adp.match_player`'s own `pick()` — never guess past that."""
    pid, method = ADP.match_player(
        {"name": row["name"], "position": row["position"], "team": row["team"]}, index)
    if pid:
        return pid, method

    pos = ADP._norm_pos(row["position"])
    team = ADP._norm_team(row["team"])
    key = _first_initial_key(row["name"], ADP)
    cands = index.get("by_first_initial", {}).get(key, [])
    if cands:
        same_pos = [c for c in cands if c["pos"] == pos] or cands
        if len(same_pos) == 1:
            return same_pos[0]["id"], "first-initial+pos"
        same_team = [c for c in same_pos if c["team"] == team]
        if len(same_team) == 1:
            return same_team[0]["id"], "first-initial+pos+team"
        # A same-team same-position same-initial collision (e.g. Bijan
        # Robinson vs. Brian Robinson, both ATL RB) needs a real
        # disambiguator: picking the more-prominent candidate is wrong
        # whenever the LESS prominent one is the row actually being
        # matched, since it would pick the same (wrong) candidate for
        # every row that collides on this key. Try the suffix Draft
        # Sharks itself writes ("Jr."/etc) first; it is not stored on the
        # board for every player (Brian Robinson Jr. is stored as plain
        # "Brian Robinson" here) so it will not always resolve one.
        pool = same_team if len(same_team) > 1 else same_pos
        if len(pool) > 1:
            wants_suffix = _has_suffix(row["name"])
            suffix_match = [c for c in pool if c["has_suffix"] == wants_suffix]
            if len(suffix_match) == 1:
                return suffix_match[0]["id"], "first-initial+pos+suffix"
        # Otherwise: this row's own DS rank is a rough prominence proxy in
        # its own right — pick the candidate whose board rank sits closest
        # to it, rather than always the single most prominent candidate
        # (verified: Bijan's board rank 2 vs. Brian's 189, against DS rows
        # at rank 2 and rank 153 respectively — each picks correctly).
        ranked_pool = [c for c in pool if c.get("rank") is not None]
        if ranked_pool:
            best = min(ranked_pool, key=lambda c: abs(c["rank"] - row["rank"]))
            return best["id"], "first-initial+pos+closest-rank"

    # Last resort: last-name-only, e.g. a hyphenated first name ("Amon-Ra")
    # that splits into two tokens on the Sleeper side, defeating the
    # first-initial collapse. Requires BOTH team and position to agree —
    # a looser bar here risks a wrong match, which this source's own
    # position_rank field would then silently contradict.
    last_tok = ADP.normalize_name(row["name"]).split()[-1] if row["name"].split() else ""
    lcands = [c for c in index.get("by_last_name", {}).get(last_tok, [])
              if c["pos"] == pos and c["team"] == team]
    if len(lcands) == 1:
        return lcands[0]["id"], "last-name+pos+team"
    return None, ""


def main() -> dict:
    pts = parse_pts()
    ceil = parse_ceil()

    pts_errs = {k: v["_parse_error"] for k, v in pts.items() if "_parse_error" in v}
    ceil_errs = {k: v["_parse_error"] for k, v in ceil.items() if "_parse_error" in v}

    # The two exports were captured minutes apart (Cory sent them separately)
    # and Draft Sharks' "3D" ranking is live -- for 8 marginal players
    # (RB58/TE19/DEF11-13/QB30/K13/RB59) the ORDER genuinely differs between
    # the two captures, verified against both raw files directly, not
    # assumed: the same 8 identities appear in both, just reshuffled.
    # Joining by raw rank number therefore silently pairs one player's
    # floor/ceiling with a DIFFERENT player's category split in that range.
    # (team, position, position_rank) is the reliable join key -- already
    # verified collision-free across all 250 players, unlike name (ligature
    # corruption differs per export) or rank number (this bug).
    pts_by_identity = {}
    for r in pts.values():
        if r.get("team") and r.get("position") and r.get("position_rank"):
            pts_by_identity[(r["team"], r["position"], r["position_rank"])] = r

    join_mismatches = []
    players = []
    for rank in sorted(ceil):
        c = ceil[rank]
        if not c.get("team") or not c.get("position") or c.get("position_rank") is None:
            continue
        ident = (c["team"], c["position"], c["position_rank"])
        p = pts_by_identity.get(ident)
        if p is None:
            join_mismatches.append({"ceil_rank": rank, "identity": ident,
                                     "ceil_name": c.get("name")})
            p = {}
        elif p.get("rank") != rank:
            join_mismatches.append({"ceil_rank": rank, "pts_rank": p.get("rank"),
                                     "identity": ident, "note": "matched by identity, "
                                     "not rank -- the two captures disagree on order here"})

        name_c, name_p = clean_name(c.get("name") or ""), clean_name(p.get("name") or "")
        raw_name = name_c or name_p or (c.get("name") or p.get("name") or "")
        row = {
            "rank": rank,
            "name": NAME_FIXES.get(raw_name, raw_name),
            "team": c.get("team"), "position": c.get("position"),
            "position_rank": c.get("position_rank"),
            "adp": c.get("adp"), "injury_risk_pct": c.get("injury_risk_pct"),
            "floor_proj": c.get("floor_proj"), "cons_proj": c.get("cons_proj"),
            "ds_proj": c.get("ds_proj"), "ceil_proj": c.get("ceil_proj"),
            "value_3d": c.get("value_3d"),
            "pts_pass": p.get("pts_pass"), "pts_rush": p.get("pts_rush"),
            "pts_rec": p.get("pts_rec"), "pts_kick": p.get("pts_kick"),
            "pts_def": p.get("pts_def"),
        }
        players.append(row)

    order_violations = sum(1 for r in players
                            if r["floor_proj"] is not None and r["ceil_proj"] is not None
                            and not (r["floor_proj"] <= r["ceil_proj"]))

    index, ADP = build_board_index()
    unmatched = []
    match_methods = collections.Counter()
    for r in players:
        pid, method = match_draftsharks_player(r, index, ADP)
        r["sleeper_id"] = pid
        r["match_method"] = method or None
        if pid:
            match_methods[method] += 1
        else:
            unmatched.append({"rank": r["rank"], "name": r["name"],
                               "team": r["team"], "position": r["position"]})

    doc = {
        "_territory": "TERRITORY: C — written by draftsharks_parse.py",
        "_what": "Draft Sharks' own half-PPR redraft rankings, ADP, injury risk, "
                 "floor/consensus/DS/ceiling point projections and their proprietary "
                 "'3D Value' index, for 250 players. THESE ARE ALREADY-SCORED HALF-PPR "
                 "POINTS UNDER DRAFT SHARKS' OWN RULES, NOT RAW STAT LINES — there is "
                 "nothing to rescore under this league's specific weights. Display data, "
                 "same pattern as expert_spread_2026.json.",
        "_source": "https://www.draftsharks.com/rankings/half-ppr",
        "_captured_via": "user-provided PDF export (site blocked at CONNECT from both "
                          "the agent sandbox and, unverified, GitHub Actions)",
        "_captured_at": "2026-08-19",
        "_join_note": "The two source exports were captured minutes apart and the "
                       "live ranking shifted for a handful of marginal players in "
                       "between (verified, not assumed: the same identities appear "
                       "in both files, reordered) -- rows are joined on "
                       "(team, position, position_rank), not on matching rank number "
                       "across files. `rank` is the ceiling/floor export's own order "
                       "(the file with the data Cory actually asked for); the pts-"
                       "category export's rank for the same player can differ where "
                       "they disagree. See join_mismatches for every row affected.",
        "n_players": len(players),
        "n_parse_errors_pts_file": len(pts_errs),
        "n_parse_errors_ceil_file": len(ceil_errs),
        "n_floor_ceil_order_violations": order_violations,
        "n_join_mismatches": len(join_mismatches),
        "join_mismatches": join_mismatches,
        "n_matched": sum(match_methods.values()),
        "n_unmatched": len(unmatched),
        "match_methods": dict(match_methods),
        "unmatched": unmatched,
        "players": players,
    }

    out_path = DATA / "draftsharks_projections_2026.json"
    out_path.write_text(json.dumps(doc, indent=1))
    print(f"wrote {out_path.name}: {len(players)} players, "
          f"{len(pts_errs)} pts errors, {len(ceil_errs)} ceil errors, "
          f"{order_violations} floor>ceil violations, "
          f"{doc['n_matched']}/{len(players)} crosswalk-matched "
          f"({dict(match_methods)})")
    return doc


if __name__ == "__main__":
    main()
