#!/usr/bin/env python3
"""MERGE COMPLETENESS GUARD — a half-landed merge must fail loudly, not read as success.

The bug (2026-08-09): merging B's branch committed B's NEW files but silently dropped
B's EDITS to existing files. voteenact.js shipped with nothing requiring it; the new
routes shipped with no CSS/nav. The merge reported success. That is the FOURTH
"reads-as-success" failure this month (vacuous tests, CI not running its own tests, a
buried deploy marker, now a half-merge).

THE INVARIANT. After merging SOURCE into BASE to produce MERGED, for every file the
SOURCE branch changed since the MERGE-BASE, MERGED must reflect that change:

  * file NEW in source (absent at merge-base) -> must EXIST in merged.
  * file MODIFIED by source, and BASE did NOT touch it since merge-base
    (base[f] == merge_base[f]) -> merged[f] MUST equal source[f]. A clean take; any
    other content means the edit was dropped. (This is the admin.js case exactly.)
  * file MODIFIED by BOTH -> a real 3-way/union merge; exact equality can't be
    asserted, but merged[f] == base[f] means source's change was very likely dropped,
    so flag it for eyeballing rather than passing it silently.

Pure `assess(merge_base, base, source, merged)` over blob maps {path: blob_sha}; the CLI
resolves those maps from git (ls-tree) for any four commits. Unit-tested in
draft/tests/test_merge_completeness.py, including the exact dropped-modification case.

CLI: python draft/tools/merge_completeness.py <merge_base> <base_tip> <source_tip> [<merged=HEAD>]
     exit 0 = complete; exit 2 = a change was dropped (prints each).
"""
from __future__ import annotations
import subprocess
import sys


def assess(merge_base, base, source, merged):
    """Each arg is {path: blob_sha}. Returns a list of violation dicts (empty = clean).
    Each carries severity: 'fail' = a definite drop (must block); 'warn' = needs an
    eyeball but can be a legitimate outcome (a branch simply behind main on that file)."""
    violations = []
    changed = [p for p in source if source.get(p) != merge_base.get(p)]
    for p in sorted(changed):
        if p not in merge_base:                                  # NEW file in source
            if p not in merged:
                violations.append({"path": p, "kind": "new_file_missing", "severity": "fail",
                                   "detail": "source added this file; merged does not contain it"})
        else:                                                     # MODIFICATION in source
            base_touched = base.get(p) != merge_base.get(p)
            if not base_touched:
                # Base never touched it, so a 3-way merge must take source verbatim. If it
                # didn't, the edit was DEFINITELY dropped — this is the admin.js bug exactly.
                if merged.get(p) != source.get(p):
                    violations.append({"path": p, "kind": "modification_dropped", "severity": "fail",
                                       "detail": "base never touched it, so merged must equal source's "
                                                 "version — it does not, the edit was dropped"})
            else:
                # Both sides changed it. merged == base can mean either (a) source's change
                # was dropped, or (b) source is simply BEHIND base on this file and base's
                # newer version legitimately won. Can't tell from blobs alone -> WARN, eyeball.
                if merged.get(p) == base.get(p):
                    violations.append({"path": p, "kind": "possible_union_drop", "severity": "warn",
                                       "detail": "both sides changed it and merged == base — either "
                                                 "source's change was dropped OR source is behind base "
                                                 "here; eyeball (is base==merge-base? then it's a drop)"})
    return violations


def _tree(ref):   # pragma: no cover  (git I/O)
    """{path: blob_sha} for every file in a commit's tree."""
    out = subprocess.run(["git", "ls-tree", "-r", ref], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"git ls-tree {ref} failed: {out.stderr.strip()}")
    tree = {}
    for line in out.stdout.splitlines():
        # "<mode> blob <sha>\t<path>"
        meta, _, path = line.partition("\t")
        parts = meta.split()
        if len(parts) >= 3 and parts[1] == "blob":
            tree[path] = parts[2]
    return tree


def main(argv):   # pragma: no cover  (CLI)
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[-1])
        return 1
    merge_base, base_tip, source_tip = argv[0], argv[1], argv[2]
    merged = argv[3] if len(argv) > 3 else "HEAD"
    v = assess(_tree(merge_base), _tree(base_tip), _tree(source_tip), _tree(merged))
    fails = [x for x in v if x.get("severity") == "fail"]
    warns = [x for x in v if x.get("severity") == "warn"]
    if not v:
        print(f"OK  merge complete: every file {source_tip} changed since {merge_base} "
              f"is reflected in {merged}")
        return 0
    if warns:
        print(f"WARN  {len(warns)} file(s) need an eyeball (merged==base where both sides changed):")
        for x in warns:
            print(f"  [{x['kind']}] {x['path']} — {x['detail']}")
    if fails:
        print(f"FAIL  {len(fails)} change(s) from {source_tip} DEFINITELY dropped in {merged}:")
        for x in fails:
            print(f"  [{x['kind']}] {x['path']} — {x['detail']}")
        return 2
    print("no definite drops — warnings only (verify the branch is merely behind base on those files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
