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
    """Each arg is {path: blob_sha}. Returns a list of violation dicts (empty = clean)."""
    violations = []
    changed = [p for p in source if source.get(p) != merge_base.get(p)]
    for p in sorted(changed):
        if p not in merge_base:                                  # NEW file in source
            if p not in merged:
                violations.append({"path": p, "kind": "new_file_missing",
                                   "detail": "source added this file; merged does not contain it"})
        else:                                                     # MODIFICATION in source
            base_touched = base.get(p) != merge_base.get(p)
            if not base_touched:
                if merged.get(p) != source.get(p):
                    violations.append({"path": p, "kind": "modification_dropped",
                                       "detail": "base never touched it, so merged must equal source's "
                                                 "version — it does not, the edit was dropped"})
            else:
                if merged.get(p) == base.get(p):
                    violations.append({"path": p, "kind": "possible_union_drop",
                                       "detail": "both sides changed it and merged == base — source's "
                                                 "change was likely dropped; eyeball this file"})
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
    if not v:
        print(f"OK  merge complete: every file {source_tip} changed since {merge_base} "
              f"is reflected in {merged}")
        return 0
    print(f"FAIL  {len(v)} change(s) from {source_tip} not reflected in {merged}:")
    for x in v:
        print(f"  [{x['kind']}] {x['path']} — {x['detail']}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
