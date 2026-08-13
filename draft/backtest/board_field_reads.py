# TERRITORY: C
"""THE PYTHON HALF OF THE ORPHAN-FIELD SWEEP, WHICH DID NOT EXIST.

`draft/tools/orphan_field_sweep.js` catches this class in the JS modules: a field
READ from a board row that the board does not supply. It reports 3 orphans today,
all declared optional and guarded, 0 bare — the JS side is clean.

NOTHING DID THE SAME FOR THE PYTHON SIDE, and that is precisely where the live
instance was. `adp.py` builds the fallback ADP from `p.get("search_rank")`, and
board rows carry the Sleeper rank as `raw_adp` / `consensus_rank` /
`sleeper_rank` — never `search_rank`. The read always missed, `or 9999` supplied
a sentinel, and 1,503 players collapsed onto a single identical ADP while a
comment above the line described an ordering that never happened.

WHY A NAIVE SCAN CANNOT DO THIS, and my first one could not. The same modules
legitimately read RAW SLEEPER fields — `full_name`, `first_name`, `search_rank`
itself — from the players dump, where those names are correct. Grepping for
member names finds all of them and reports 100 false positives. The question is
never "is this name a board field", it is "IS THIS DICT A BOARD ROW".

SO IT READS THE AST AND FOLLOWS THE BINDING. A function that takes `players` (or
`board`) is taking board rows; a `for p in players:` inside it binds `p` to one.
Only `.get("...")` calls on THAT name, in THAT function, are judged. Everything
iterating something else is left alone, because it is answering a different
question about a different dict.

That is narrow on purpose. It is not a general orphan detector, it is the exact
shape the defect took — and the alternative, a scan that reports a hundred
plausible names, is one nobody reads twice.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BOARD = ROOT / "public" / "draft_data.json"

#: Parameter names that hold the board's player rows. Named rather than guessed:
#: a function taking `raw` or `sleeper_players` is holding the DUMP, where the
#: same field names mean something else and are correct.
BOARD_PARAMS = ("players", "board")

def board_vocabulary(path=None) -> set:
    """Every field name present on any row of the shipped board."""
    p = Path(path or BOARD)
    if not p.exists():
        return set()
    doc = json.loads(p.read_text())
    out = set()
    for key in ("players", "kept_players"):
        for row in (doc.get(key) or []):
            out |= set(row.keys())
    return out


def _board_row_names(fn: ast.FunctionDef) -> set:
    """Names bound to a single board row inside `fn`.

    `for p in players:` binds p. `for p in (players or []):` binds it too, and so
    does a comprehension — all three appear in this codebase.
    """
    params = {a.arg for a in fn.args.args} | {a.arg for a in fn.args.kwonlyargs}
    if not (params & set(BOARD_PARAMS)):
        return set()

    def iterates_board(node):
        for sub in ast.walk(node):
            if isinstance(sub, ast.Name) and sub.id in BOARD_PARAMS:
                return True
        return False

    out = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.For) and isinstance(node.target, ast.Name) \
                and iterates_board(node.iter):
            out.add(node.target.id)
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp,
                             ast.DictComp)):
            for gen in node.generators:
                if isinstance(gen.target, ast.Name) and iterates_board(gen.iter):
                    out.add(gen.target.id)
    return out


def reads(path) -> list:
    """`.get("field")` calls made on a board row, with the line they sit on."""
    src = Path(path).read_text(encoding="utf-8")
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    out = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        rows = _board_row_names(fn)
        if not rows:
            continue
        for node in ast.walk(fn):
            if not (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "get"
                    and isinstance(node.func.value, ast.Name)
                    and node.func.value.id in rows
                    and node.args
                    and isinstance(node.args[0], ast.Constant)
                    and isinstance(node.args[0].value, str)):
                continue
            out.append({"field": node.args[0].value, "line": node.lineno,
                        "function": fn.name, "file": str(path),
                        "has_default": len(node.args) > 1})
    return out


def sweep(paths, vocabulary=None) -> dict:
    """Board-row reads of names the board does not supply.

    `has_default` is carried but is NOT an exoneration, and that is the whole
    lesson of `search_rank`: `p.get("search_rank") or 9999` had a default, and
    the default is what made it invisible. A guarded read of a field that does
    not exist is a read that silently always takes the guard.
    """
    vocab = board_vocabulary() if vocabulary is None else set(vocabulary)
    if not vocab:
        return {"status": "unmeasured", "orphans": [], "checked": 0,
                "note": "no board to build a vocabulary from — this says nothing"}
    orphans, checked = [], 0
    for p in paths:
        rows = reads(p)
        # ⚠ A PARAMETER NAMED `board` IS NOT ALWAYS THE PLAYER BOARD, and the
        # first version of this reported two false alarms for exactly that.
        # `keepers.live_index_of(board, ...)` takes PICK-ORDER rows, where
        # `keeper_slot` and `overall` are real fields; judging them against the
        # player vocabulary accuses correct code.
        #
        # So each binding has to prove it holds a board row before its reads are
        # judged: at least ONE field read from that name must be a real board
        # field. A name from which nothing recognisable is read is answering a
        # different question about a different dict, and is left alone. This is
        # the same rule I have to apply by hand every time — read what the thing
        # actually IS before reporting that it behaves wrongly — moved into the
        # tool so it is not one more thing to remember.
        by_binding = {}
        for r in rows:
            by_binding.setdefault((r["file"], r["function"]), []).append(r)
        for group in by_binding.values():
            if not any(r["field"] in vocab for r in group):
                continue                       # not board rows; not our question
            for r in group:
                checked += 1
                if r["field"] not in vocab:
                    orphans.append(r)
    return {"status": "measured", "checked": checked,
            "orphans": sorted(orphans, key=lambda r: (r["file"], r["line"])),
            "vocabulary": len(vocab)}
