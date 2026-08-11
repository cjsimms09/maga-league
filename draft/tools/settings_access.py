#!/usr/bin/env python3
"""WHERE ELSE A SLEEPER SETTING IS READ — path B, the one Python cannot perturb.

`settings_influence.py` perturbs the import and watches league_config.json, which
covers path A. The web app never goes through that file: `src/sleeper.js` caches
the raw league object and the routes read `sData.league.settings.playoff_teams`
straight off it. A setting can therefore be genuinely used while path A calls it
inert, and calling it unused on path A's evidence alone would be wrong.

THIS IS SOURCE INSPECTION AND IT INHERITS THE WEAKNESS. A scan cannot tell an
implementation from a comment describing one (rule 11e), and every naive version
of this check was fooled by the repo as it stands:

  · `leg`           — Sleeper's leg number, and also a side-bet PAYMENT leg
  · `draft_rounds`  — Sleeper's setting, and also `config_schema.draft_rounds()`,
                      OUR derivation, which exists BECAUSE Sleeper's is wrong
  · `draft_rounds`  — and again in an app.js comment recording that very fact

All three would pass "the name appears in a .js file". So the scan strips
comments first, then requires the key to occur on a line that also mentions
`settings` — i.e. as a read OF the settings object, not as a word. Evidence that
survives only the weaker bar is reported separately as `nearby`, never as proof.

What it still cannot do: prove the value is USED once read, or catch a read
assembled at runtime (`settings[key]` with a computed key). Both are named in
the reconciliation rather than papered over.

Run: python3 draft/tools/settings_access.py [--json]
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# The import itself is path A and is measured by perturbation, not by reading it.
# The probe and the registry mention every key by construction; counting them
# would make the check pass on its own paperwork.
SKIP_FILES = {
    os.path.join("draft", "sleeper_import.py"),
    os.path.join("draft", "sleeper_league_probe.py"),
    os.path.join("draft", "tools", "settings_access.py"),
    os.path.join("draft", "tools", "settings_influence.py"),
}
SKIP_DIRS = ("node_modules", ".git", ".cache", os.path.join("draft", "data"),
             os.path.join("draft", "tests"), os.path.join("draft", "config"),
             "tests", "coverage")
EXTS = (".js", ".py", ".html")


def _blank(m) -> str:
    """Erase a multi-line region WITHOUT collapsing it.

    Replacing a 16-line docstring with one space shifts every line number after
    it, and a citation you cannot open is not evidence — the first run of this
    tool cited exp_discoverability.py:49 for a read that is on line 68.
    """
    return "\n" * m.group(0).count("\n")


def _strip_js_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", _blank, src, flags=re.S)
    return re.sub(r"(?m)^(.*?)//.*$", r"\1", src)


def _strip_py_comments(src: str) -> str:
    src = re.sub(r'""".*?"""', _blank, src, flags=re.S)
    src = re.sub(r"'''.*?'''", _blank, src, flags=re.S)
    return re.sub(r"(?m)^(.*?)#.*$", r"\1", src)


def _files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = os.path.relpath(dirpath, ROOT)
        if any(rel == d or rel.startswith(d + os.sep) for d in SKIP_DIRS):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git", ".cache")]
        for fn in filenames:
            if not fn.endswith(EXTS):
                continue
            r = os.path.relpath(os.path.join(dirpath, fn), ROOT)
            if r in SKIP_FILES:
                continue
            yield r


def _access_pat(k: str) -> re.Pattern:
    """The shape of a READ, not the presence of a word.

    Line-proximity to `settings` alone was not enough: exp_route_probe.py has
    `settings_readable = {..., "error": type(e).__name__}` — the word `type` is
    Sleeper's league-type setting AND a Python builtin, on a line that mentions
    settings. It was cited as a read of `settings.type` and it is not one.

    So a read must LOOK like a read: `.get("k")`, `["k"]`, or `x.k` where x is
    something. A bare `type(` is none of those.
    """
    e = re.escape(k)
    return re.compile(
        r"""\.get\(\s*["']%s["']\s*\)"""   # settings.get("k")
        r"""|\[\s*["']%s["']\s*\]"""       # settings["k"]
        r"""|[\w\)\]]\s*\.\s*%s\b""" % (e, e, e))   # settings.k / (...).k


def scan(keys, *, require_settings: bool = True) -> dict:
    """-> {key: {"reads": [file:line], "nearby": [file:line]}}

    `require_settings=False` asks the second question: not "is this SETTING
    read" but "is this CONFIG FIELD read". `cfg["waivers"]` is a field of our
    own config, so demanding the word `settings` on the line would report it
    unread for the wrong reason.

    AND THAT MODE IS THE WEAK ONE — it has already produced a false positive.
    Dropping the `settings` requirement leaves only the access SHAPE, so a
    generic field name matches any dict in the repo with the same key:
    `cfg["trades"]` was reported read by `out["trades"]` in
    import_master_sheet.py, the master sheet's trade NOTES. There is no fix
    inside a text scan — the answer is to name config fields distinctively
    (that one became `trade_window`), and to spot-check any `reads` this mode
    returns before believing it.
    """
    out = {k: {"reads": [], "nearby": []} for k in keys}
    pats = {k: re.compile(r"\b" + re.escape(k) + r"\b") for k in keys}
    acc = {k: _access_pat(k) for k in keys}
    for rel in _files():
        try:
            src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        src = _strip_py_comments(src) if rel.endswith(".py") else _strip_js_comments(src)
        for i, line in enumerate(src.split("\n"), 1):
            if not line.strip():
                continue
            has_settings = (not require_settings) or "settings" in line or "setting" in line
            for k, pat in pats.items():
                if not pat.search(line):
                    continue
                is_read = has_settings and acc[k].search(line) is not None
                out[k]["reads" if is_read else "nearby"].append("%s:%d" % (rel, i))
    return out


if __name__ == "__main__":
    dump = json.load(open(os.path.join(ROOT, "draft", "data",
                                       "sleeper_league_settings.json"), encoding="utf-8"))
    res = scan(sorted((dump.get("settings") or {}).keys()))
    if "--json" in sys.argv:
        print(json.dumps(res, indent=2, sort_keys=True))
    else:
        read = {k: v for k, v in res.items() if v["reads"]}
        print("\n%d/%d settings are read off a settings object outside the import\n"
              % (len(read), len(res)))
        for k, v in sorted(read.items()):
            print("  READ     %-24s %s" % (k, ", ".join(v["reads"][:4])))
        weak = {k: v for k, v in res.items() if not v["reads"] and v["nearby"]}
        print("\n  NAME APPEARS BUT NOT AS A SETTINGS READ (proves nothing):")
        for k, v in sorted(weak.items()):
            print("    %-24s %s" % (k, ", ".join(v["nearby"][:3])))
