"""Tests for the provenance census.

**THIS TOOL EXISTS BECAUSE OF AN ERROR OF MINE, AND ITS `readers()` REPRODUCED A
SECOND ONE THE SAME HOUR** — so it ships with controls in both directions rather
than with a demonstration that it runs.

  1. THE FOUNDING ERROR. I annotated register 4v claiming *"not one skill player
     in his range is affected"* by a non-per-player ceiling. `proj_ceiling_source`
     has THREE values; I had looked at two. The middle one,
     `measured-2023-25-p90`, is MEASURED and still a per-band constant — which is
     exactly what 4v complains about. Fifteen skill players, Malik Nabers at ADP
     28 among them. Printing the whole enum is the entire fix.

  2. THE SECOND ERROR, WHICH THIS TOOL FOUND IN MY OWN REGISTER TEXT. Annotating
     row 8b I wrote that `bye_source` and `variance_why` are *"read by 1 each, so
     the grep is not blind — those are the control."* `variance_why`'s only two
     appearances in the client tree are **inside a comment**, and that comment
     says it is deliberately NOT read. So my control was two thirds of a control.
     `readers()` strips comment lines for that reason.

A census that miscounts readers is worse than none, because its output looks
like an inventory.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import provenance_census as PC  # noqa: E402


def _js(tmp_path, rel, body):
    f = tmp_path / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(body, encoding="utf8")
    return f


# ── THE FOUNDING CASE, FIRST, BECAUSE IT IS THE ONE THAT WAS GOT WRONG ────────

def test_KNOWN_POSITIVE_proj_ceiling_source_really_does_have_three_values():
    """The enum whose third value I missed. If this ever reads 2, either the
    board changed (good — update the assertion in that commit) or the census has
    gone blind and would let the same mistake happen again."""
    doc = PC.board()
    vals = {p.get("proj_ceiling_source") for p in doc["players"]
            if p.get("proj_ceiling_source")}
    assert len(vals) >= 3, f"expected >=3 constructions, saw {sorted(vals)}"
    # ⚠️ THE LITERAL ENUM WAS REMOVED FROM THIS ASSERTION ON 2026-08-20, AND THE
    # REASON IS WORTH MORE THAN THE TEST. It used to pin
    # measured-2023-25-p90 / gaussian_z / *x-player-cv. Those are what
    # `projections.py` writes. A board that has been through
    # `attach_draftsharks.py` carries a COMPLETELY DIFFERENT enum —
    # draftsharks_pct 247, "pre-DS band %, rescaled to the blended mean" 363,
    # "none — no band..." 90, counted on the committed artifact.
    #
    # So no literal list can be true of both, because THE BOARD THE GATE READS
    # AND THE BOARD THAT GETS PUBLISHED ARE NOT THE SAME ARTIFACT.
    # `draft-data.yml` runs "Acceptance gate on the FRESH board" (full pytest)
    # at step 16 and "Re-apply the blend, the Draft Sharks bands and the source
    # sheet" at step 21 — the bands, the blend, the seat plan and the source
    # boards are all attached AFTER the gate that is supposed to protect
    # publication. Register 166.
    #
    # Pinning either enum here would therefore make this test a liar on one of
    # the two artifacts and would red the pipeline that repairs the board. What
    # is asserted instead is the property the founding defect was actually
    # about: the stamp is a real, non-empty CONSTRUCTION NAME on every row that
    # has one, and there are several of them, so a single silent construction
    # cannot hide behind a shared label.
    assert all(isinstance(v, str) and len(v) >= 4 for v in vals), sorted(vals)
    assert not any(v.strip().lower() in ("none", "n/a", "unknown", "-")
                   for v in vals), sorted(vals)


def test_every_player_Cory_can_actually_draft_carries_a_real_band():
    """WHY THE THIRD VALUE IS TOLERABLE. "none — no band from Draft Sharks or
    the prior board" is a legitimate construction only if it never lands on a
    player he might take. Cory, 2026-08-20: "if something doesnt affect any top
    150 picks.. why is it there" — the same question pointed at a gap instead of
    a feature. Measured: inside the top 150 by ADP, 148 carry draftsharks_pct
    and 2 carry the rescaled pre-DS band; ZERO carry none. This test is what
    keeps that true after the next rebuild.

    Deliberately written against the WORD rather than the enum, for the reason
    the test above documents: this must hold on the pre-band board the gate
    reads AND on the post-band board that ships, and the two carry different
    construction names."""
    doc = PC.board()
    top = sorted((p for p in doc["players"] if p.get("adp")),
                 key=lambda p: p["adp"])[:150]
    assert len(top) == 150, f"only {len(top)} players carry an adp"
    bandless = [(p["name"], p["position"], p["adp"]) for p in top
                if (p.get("proj_ceiling_source") or "").startswith("none")]
    assert not bandless, (
        f"{len(bandless)} of Cory's top 150 have no floor/ceiling band at all: "
        f"{bandless[:10]}. His ruling was that every source's band comes off "
        "the Draft Sharks percentage; a player inside his draft range with no "
        "band is that ruling failing silently where it matters most.")


def test_CONTROL_the_census_finds_several_stamps_and_not_everything():
    doc = PC.board()
    found = PC.stamps(doc["players"])
    assert len(found) >= 5, found
    #: it must be selecting, not returning every key on the row
    assert len(found) < len(doc["players"][0]) / 2, found
    assert all(PC.STAMP.search(f) for f in found), found


# ── readers(): COMMENTS ARE NOT CONSUMERS ────────────────────────────────────

def test_a_field_named_only_in_a_COMMENT_is_not_a_reader(tmp_path):
    """The exact shape that made my 8b control wrong."""
    _js(tmp_path, "public/js/a.js",
        "// the obvious source is the row's own variance_why, which names the\n"
        "// cell verbatim — but variance_why is NOT one of the 44 fields\n"
        "const x = 1;\n")
    assert PC.readers("variance_why", tmp_path) == []


def test_a_field_named_in_CODE_is_a_reader(tmp_path):
    """CONTROL for the comment strip — it must not exclude real code."""
    _js(tmp_path, "public/js/a.js", "const s = player.variance_why || [];\n")
    assert PC.readers("variance_why", tmp_path) == ["public/js/a.js"]


def test_a_longer_field_name_does_not_credit_a_shorter_one(tmp_path):
    """`adp_source` must not be credited to a file that only names
    `adp_sd_source` — the word boundary is doing real work here, and getting it
    wrong would make every stamp look read."""
    _js(tmp_path, "public/js/a.js", "if (p.adp_sd_source === 'ffc') go();\n")
    assert PC.readers("adp_sd_source", tmp_path) == ["public/js/a.js"]
    assert PC.readers("adp_source", tmp_path) == []


def test_the_test_tree_is_not_a_consumer(tmp_path):
    """A stamp read only by its own test is the produced-and-unread shape
    (register 8b), so SOURCE_DIRS excludes the test tree by construction."""
    assert not any(d.startswith("draft/tests") for d in PC.SOURCE_DIRS), PC.SOURCE_DIRS
    _js(tmp_path, "draft/tests/x.test.js", "expect(p.adp_source).toBe('ffc');\n")
    assert PC.readers("adp_source", tmp_path) == []


# ── AGAINST THE REAL REPO, IN BOTH DIRECTIONS ────────────────────────────────

def test_KNOWN_POSITIVE_adp_source_IS_read_and_proj_ceiling_source_IS_NOT():
    """Both halves against the live tree. Either one alone is unfalsifiable: all
    zeros means the search is broken, all non-zeros means the strip is."""
    assert PC.readers("adp_source"), "adp_source has real consumers; finding none " \
        "means the reader search is broken, not that nothing reads it"
    # RETIRED 2026-08-18, per this assertion's own instruction, the same hour
    # the reader appeared: E's dispersionCaveat (app.js) now genuinely reads
    # BOTH proj_floor_source and proj_ceiling_source — verified a real
    # consumer, not a comment: it branches the on-screen caveat on
    # /^measured-/ to tell a symmetric Gaussian band from a cohort p10/p90,
    # which is register 8b's ask delivered rather than its claim broken.
    # The known-positive half above still guards the search; the flip side
    # is now that the reader must KEEP existing:
    assert "public/js/draft/app.js" in PC.readers("proj_ceiling_source"), \
        "dispersionCaveat stopped reading proj_ceiling_source — the surface " \
        "caveat can no longer tell Gaussian from cohort bands (register 8b)"


def test_variance_why_is_unread_and_that_corrects_my_own_register_text():
    """Row 8b's annotation called it a control alongside `bye_source`. It is not
    read at all; `bye_source` is. Pinned so the corrected claim stays corrected.
    """
    assert PC.readers("bye_source"), "bye_source is the surviving half of that control"
    assert PC.readers("variance_why") == []


# ── THE FREE-TEXT CASE, WHICH CRASHED THE FIRST VERSION ──────────────────────

def test_a_list_valued_stamp_does_not_crash_the_census():
    """`variance_why` is a LIST of reasons. The first run raised
    `TypeError: unhashable type: 'list'` — a name-shaped rule (`_why$`) catching a
    field that is prose. Handled rather than excluded, because excluding it would
    hide that nothing reads it."""
    doc = PC.board()
    lists = [p["variance_why"] for p in doc["players"]
             if isinstance(p.get("variance_why"), list)]
    assert lists, "precondition: variance_why is list-valued on the live board"
    #: main([]) not main() — argparse must not be handed pytest's argv. The
    #: parameter exists for exactly this reason and the CLI default is unchanged.
    assert PC.main([]) == 0
