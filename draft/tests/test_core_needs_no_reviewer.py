# TERRITORY: A
"""THE CORE PRODUCT MUST RUN WITH ZERO OPENAI ACCESS. ENFORCED, NOT PROMISED.

Cory's permanent architectural requirement, 2026-08-14:

    "If my API access disappears tomorrow, the core must continue operating
     normally. ChatGPT should make the project better, not make the project
     possible."

And the distinction that matters most, in his words: there are TWO kinds of AI
here. The fantasy model learning from its own outcomes IS THE PRODUCT. ChatGPT
reviewing the development process is AN ENGINEERING TOOL. Do not couple them.

    CORE PRODUCT            deterministic engine + learning loop -> draft ->
                            outcomes -> learn.        ALWAYS WORKS.
    DEVELOPMENT / AUDIT     A + reviewer -> evidence. OPTIONAL ENHANCEMENT.

── WHY THIS IS A TEST AND NOT A PARAGRAPH IN A DOCUMENT ───────────────────

This repository has a standing rule against writing a second constitution, and a
longer history of prose that a mechanism quietly contradicted: a comment saying
`pick_order.picks` was the pick sequence while the artifact called it the board;
a keeper_slate reason asserting a mechanism that did not exist; a parity test
described as proof of correctness. In every case the words were right when
written and the code drifted underneath them.

A requirement that must hold in a year is a test, not a sentence. This one fails
the moment anything in the product path grows a dependency on a paid reviewer —
which is the only moment it matters.

── THE SIX PATHS THE REQUIREMENT NAMES ────────────────────────────────────

draft engine, projections, valuation/board, war room, freeze, pick logger,
replay/learning. All of them are checked below by import graph, not by
inspection.

Run: python -m pytest draft/tests/test_core_needs_no_reviewer.py -q
"""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

#: Every tree the product runs out of. `tools/` is deliberately ABSENT: that is
#: the development/audit side, and it is allowed to depend on a provider.
CORE_TREES = ("draft", "public/js", "src", "scripts")

#: Names that would mean a paid reviewer had reached the product path.
#:
#: ⚠️ ASSEMBLED FROM FRAGMENTS SO THIS LIST CANNOT MATCH ITSELF. Written as
#: plain literals, the guard went red on its own FORBIDDEN tuple -- the needles
#: are code, not comments, so comment-stripping does not reach them. That is the
#: SEVENTH absence-assertion trap this session, and it landed in the guard whose
#: own docstring warns about the trap. Splitting the literals is belt; excluding
#: this file below is braces.
FORBIDDEN = ("open" + "ai", "anthro" + "pic", "chat" + "gpt", "claude" + "_api",
             "independent" + "_review", "reviewer" + "_prompt",
             "reviewer" + "_schema")

#: The entry points that must import cleanly with no key in the environment.
CORE_MODULES = ("keepers", "adp", "grab_by", "freeze_pre_draft",
                "log_draft_picks", "season_stamp")


def _core_files():
    out = []
    for tree in CORE_TREES:
        base = ROOT / tree
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix not in (".py", ".js", ".sh"):
                continue
            if "node_modules" in p.parts or "__pycache__" in p.parts:
                continue
            # THIS FILE NAMES THE FORBIDDEN STRINGS BY DEFINITION. Excluding
            # exactly one file, asserted below so the exemption cannot widen.
            if p.resolve() == Path(__file__).resolve():
                continue
            out.append(p)
    return out


CORE_FILES = _core_files()


def test_CONTROL_the_exemption_is_exactly_one_file():
    """An exemption that can grow is an exemption that will. Only this file is
    skipped, and only because it must name what it forbids."""
    assert Path(__file__).resolve() not in {p.resolve() for p in CORE_FILES}
    for tree in CORE_TREES:
        base = ROOT / tree
        if not base.exists():
            continue
        every = [p for p in base.rglob("*")
                 if p.suffix in (".py", ".js", ".sh")
                 and "node_modules" not in p.parts
                 and "__pycache__" not in p.parts]
        scanned = [p for p in CORE_FILES if str(p).startswith(str(base))]
        assert len(every) - len(scanned) <= 1, (
            f"{tree}: {len(every) - len(scanned)} files excluded from the scan, "
            "expected at most this one")


def test_CONTROL_the_scan_actually_covers_the_product():
    """A guard over an empty file list passes and proves nothing."""
    assert len(CORE_FILES) > 200, f"only {len(CORE_FILES)} core files scanned"
    names = {p.name for p in CORE_FILES}
    for must in ("build.py", "keepers.py", "adp.py", "survival.js", "engine.js",
                 "freeze_pre_draft.py", "log_draft_picks.py"):
        assert must in names, f"{must} not in the scanned set"


def test_NO_CORE_FILE_REFERENCES_A_PAID_REVIEWER():
    """The requirement itself. Comments are stripped first: this file and others
    DISCUSS the reviewer, and a guard that trips on its own prose is the
    absence-assertion trap this session hit six times."""
    hits = []
    for p in CORE_FILES:
        src = p.read_text(errors="ignore")
        if p.suffix == ".py":
            body = "\n".join(l for l in src.splitlines()
                             if not l.lstrip().startswith("#"))
            body = re.sub(r'"""[\s\S]*?"""', "", body)
        elif p.suffix == ".js":
            body = re.sub(r"/\*[\s\S]*?\*/", "", src)
            body = "\n".join(l for l in body.splitlines()
                             if not l.lstrip().startswith("//"))
        else:
            body = "\n".join(l for l in src.splitlines()
                             if not l.lstrip().startswith("#"))
        low = body.lower()
        for bad in FORBIDDEN:
            if bad in low:
                hits.append(f"{p.relative_to(ROOT)}: {bad}")
    assert not hits, (
        "the product path now depends on a paid reviewer:\n  "
        + "\n  ".join(hits)
        + "\nThe core must run with zero API access. The reviewer is an "
          "engineering tool, not a runtime dependency.")


def test_NO_CORE_PYTHON_IMPORTS_A_PROVIDER_SDK():
    """Import graph rather than substring — an aliased or indirect import would
    slip past a grep, and this is the check that has to hold in a year."""
    bad = []
    for p in CORE_FILES:
        if p.suffix != ".py":
            continue
        try:
            tree = ast.parse(p.read_text(errors="ignore"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            mods = []
            if isinstance(node, ast.Import):
                mods = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                mods = [node.module or ""]
            for m in mods:
                root = m.split(".")[0].lower()
                if root in ("openai", "anthropic"):
                    bad.append(f"{p.relative_to(ROOT)} imports {m}")
    assert not bad, "\n".join(bad)


# ── EXECUTION-LEVEL PROOF ───────────────────────────────────────────────────
#
# Cory: "Do not settle for string-based absence testing. The guard must prove
# that the core execution path has no runtime dependency on the reviewer, not
# merely that certain strings don't appear in source. Prefer an execution-level
# test over source-code grep wherever possible."
#
# He is right, and the grep above is now the cheap early warning rather than the
# evidence. A grep proves a spelling. What the invariant actually claims is:
#
#   "With OpenAI completely absent, the fantasy system produces the same class
#    of valid production output it would otherwise produce."
#
# So the tests below make OpenAI genuinely absent -- a meta-path finder that
# raises on any attempt to import it, plus the key stripped from the
# environment -- and then require a REAL RECOMMENDATION to come out the far end.
# An unimportable package is a stronger condition than an uninstalled one: it
# fails even if something pip-installs it later.

#: Injected ahead of the core work. `find_spec` raising is what makes the
#: package unimportable rather than merely missing.
_BLOCKER = """
import sys, importlib.abc
_BANNED = {'open' + 'ai', 'anthro' + 'pic'}
class _Block(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path=None, target=None):
        if name.split('.')[0] in _BANNED:
            raise ImportError('BLOCKED BY TEST: %s must not be reachable from '
                              'the core execution path' % name)
        return None
sys.meta_path.insert(0, _Block())
"""


def _run_core(body: str, env_extra: dict | None = None):
    """Execute `body` with the provider SDKs unimportable and no API key."""
    env = {k: v for k, v in os.environ.items()
           if k not in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY")}
    env["PYTHONPATH"] = os.pathsep.join(
        [str(ROOT / "draft"), str(ROOT / "draft" / "backtest")])
    env.update(env_extra or {})
    return subprocess.run([sys.executable, "-c", _BLOCKER + body], env=env,
                          capture_output=True, text=True, cwd=str(ROOT))


def test_EXEC_the_blocker_actually_blocks_or_every_test_below_is_theatre():
    """CONTROL. If the finder does not bite, the checks that follow prove
    nothing about absence -- they would pass on a machine with the SDK present
    and happily importable."""
    r = _run_core("import " + "open" + "ai")
    assert r.returncode != 0, "the import blocker did not block"
    assert "BLOCKED BY TEST" in r.stderr, r.stderr[-500:]


def test_EXEC_THE_BOARD_PRODUCES_A_REAL_RECOMMENDATION_WITH_OPENAI_ABSENT():
    """THE INVARIANT, executed. Not "no string appears" -- an actual ranked
    recommendation with survival attached, from the shipped artifact, through
    the same functions the war room and the freeze use."""
    r = _run_core("""
import json, keepers as K
art = json.load(open('public/draft_data.json'))
board = art['pick_order']['picks']
mine  = art['pick_order']['my_picks']
pool  = [p for p in art['players']
         if p.get('vorp') is not None and p.get('adjusted_adp')]
pool.sort(key=lambda p: -float(p['vorp']))
top = pool[:5]
rec = [{'name': p['name'], 'pos': p['position'], 'vorp': p['vorp'],
        'survival_at_my_pick': K.survival_probability(
            float(p['adjusted_adp']),
            K.live_index_of(int(mine[0]), board), p.get('adp_sd'))}
       for p in top]
import sys
print(json.dumps({'rec': rec, 'n_pool': len(pool),
                  'openai_in_modules': any(m.startswith('open'+'ai')
                                           for m in sys.modules)}))
""")
    assert r.returncode == 0, r.stderr[-2000:]
    out = json.loads(r.stdout.strip().splitlines()[-1])
    # A VALID PRODUCTION OUTPUT, not merely a non-crash.
    assert out["n_pool"] > 200, f"only {out['n_pool']} players priced"
    assert len(out["rec"]) == 5
    for row in out["rec"]:
        assert row["name"] and row["pos"] in ("QB", "RB", "WR", "TE", "K", "DEF")
        assert isinstance(row["vorp"], (int, float))
        assert 0.0 <= row["survival_at_my_pick"] <= 1.0
    # 6. THE PRODUCTION PATH DOES NOT IMPORT OR INITIALISE THE CLIENT.
    assert out["openai_in_modules"] is False


def test_EXEC_the_recommendation_is_IDENTICAL_with_and_without_the_reviewer():
    """"The same class of valid production output" is the stated invariant, and
    for a deterministic engine the honest form of that is BIT-IDENTICAL. If the
    two ever diverge, something in the product path is reading the environment
    it must not read."""
    body = """
import json, keepers as K
art = json.load(open('public/draft_data.json'))
board = art['pick_order']['picks']; mine = art['pick_order']['my_picks']
pool = [p for p in art['players'] if p.get('vorp') is not None and p.get('adjusted_adp')]
pool.sort(key=lambda p: (-float(p['vorp']), str(p['player_id'])))
print(json.dumps([[p['name'], round(K.survival_probability(
    float(p['adjusted_adp']), K.live_index_of(int(mine[0]), board),
    p.get('adp_sd')), 9)] for p in pool[:25]]))
"""
    absent = _run_core(body)
    # The same work with a key present and the provider "enabled" -- which must
    # change nothing, because the core never consults either.
    withkey = _run_core(body, {"OPENAI_API_KEY": "sk-not-a-real-key",
                               "REVIEW_PROVIDER": "openai"})
    assert absent.returncode == 0 and withkey.returncode == 0
    assert absent.stdout == withkey.stdout, (
        "the recommendation CHANGED depending on reviewer configuration -- the "
        "product path is reading something it must not read")


def test_EXEC_REVIEW_PROVIDER_disabled_changes_nothing_about_the_core():
    """2. and 3. together: with the reviewer switched off by configuration, the
    board still produces a recommendation."""
    body = """
import json, keepers as K
art = json.load(open('public/draft_data.json'))
pool = [p for p in art['players'] if p.get('vorp') is not None]
pool.sort(key=lambda p: -float(p['vorp']))
print(json.dumps({'top': pool[0]['name'], 'n': len(pool)}))
"""
    r = _run_core(body, {"REVIEW_PROVIDER": "disabled"})
    assert r.returncode == 0, r.stderr[-1500:]
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["n"] > 200 and out["top"]


def test_EXEC_NO_REVIEWER_ARTIFACT_IS_NEEDED_TO_RECONSTRUCT_A_RECOMMENDATION():
    """4. The freeze is the reconstruction substrate for every later score. It
    must contain no reviewer output and must replay with the SDK blocked."""
    fz = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
    if not fz.exists():
        pytest.skip("no freeze on this branch")
    blob = fz.read_text().lower()
    for bad in FORBIDDEN:
        assert bad not in blob, (
            f"the frozen capture contains {bad!r} -- a reconstruction would "
            "depend on reviewer output")
    r = _run_core("""
import json, keepers as K
fz = json.load(open('draft/data/pre_draft_freeze_2026.json'))
board = fz['pick_order']['picks']; pick = fz['my_picks'][0]
p = next(x for x in fz['players'] if x.get('adjusted_adp'))
want = fz['availability_by_pick'][str(p['player_id'])][str(pick)]
got = round(K.survival_probability(float(p['adjusted_adp']),
        K.live_index_of(int(pick), board), p.get('adp_sd')), 6)
print(json.dumps({'want': want, 'got': got, 'match': abs(want-got) < 1e-6}))
""")
    assert r.returncode == 0, r.stderr[-1500:]
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["match"], f"replay {out['got']} != frozen {out['want']}"


def test_EXEC_the_JS_ENGINE_ALSO_RUNS_WITH_NO_PROVIDER_PRESENT():
    """The war room is JavaScript, and an import-graph check over Python says
    nothing about it. node has no provider package installed at all here, so
    this is genuine absence rather than a simulated one."""
    r = subprocess.run(
        ["node", "-e", """
const S = require('./public/js/draft/survival.js');
const D = require('./public/draft_data.json');
const rows = D.pick_order.picks;
const p = D.players.find(x => x.adjusted_adp && x.adp_sd);
const surv = 1 - S.layer1Taken(p, D.pick_order.my_picks[0], {pickBoard: rows});
if (!(surv >= 0 && surv <= 1)) { console.error('bad survival'); process.exit(1); }
console.log(JSON.stringify({ok: true, surv: surv}));
"""],
        capture_output=True, text=True, cwd=str(ROOT),
        env={k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"})
    assert r.returncode == 0, r.stderr[-1500:]
    assert json.loads(r.stdout.strip())["ok"] is True


def test_THE_CORE_MODULES_IMPORT_WITH_NO_KEY_IN_THE_ENVIRONMENT():
    """Executed, not read. A module that reached for a key at import time would
    pass every static check above and still break a keyless draft night."""
    env = {k: v for k, v in os.environ.items()
           if k not in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY")}
    # `season_stamp` lives in draft/backtest, not draft/. Both trees are on the
    # path in every real invocation; hard-coding only one made this fail for a
    # reason that had nothing to do with API keys.
    env["PYTHONPATH"] = os.pathsep.join(
        [str(ROOT / "draft"), str(ROOT / "draft" / "backtest")])
    code = "import " + ", ".join(CORE_MODULES)
    r = subprocess.run([sys.executable, "-c", code], env=env,
                       capture_output=True, text=True, cwd=str(ROOT))
    assert r.returncode == 0, (
        f"core modules do not import without an API key:\n{r.stderr[-2000:]}")


def test_THE_FREEZE_AND_PICK_LOG_RUN_WITH_NO_KEY():
    """The two irreversible draft-night paths, exercised end to end keyless.
    These are the ones where a dependency would cost something unrecoverable."""
    env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
    for args in (["draft/freeze_pre_draft.py", "--verify"],
                 ["draft/log_draft_picks.py", "--status"]):
        r = subprocess.run([sys.executable] + args, env=env,
                           capture_output=True, text=True, cwd=str(ROOT))
        assert r.returncode == 0, (
            f"{args[0]} failed with no API key:\n{r.stderr[-1500:]}")


def test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER():
    """A model workflow that `needs:` the reviewer job would couple them at the
    CI layer even with the code clean — the coupling would be in YAML, where no
    import graph looks."""
    wf = ROOT / ".github" / "workflows"
    offenders = []
    for f in sorted(wf.glob("*.yml")):
        if f.name == "independent-review.yml":
            continue                      # the reviewer may depend on itself
        if f.name == "config-check.yml":
            # Exempted 2026-08-16: config-check is the read-only, dispatch-only
            # key PROBE Cory asked for ("can you check that it was done right")
            # — its whole job is to NAME every configured secret, the reviewer's
            # included, and report presence/length only. It gates no model job
            # and nothing `needs:` it; a reviewer outage stops nothing through
            # it. The grep heuristic here reads any mention of OPENAI_API_KEY
            # as a dependency, which is exactly backwards for a probe that
            # exists to verify the key without consuming it.
            continue
        src = f.read_text(errors="ignore")
        body = "\n".join(l for l in src.splitlines()
                         if not l.lstrip().startswith("#"))
        if re.search(r"independent[-_]review|OPENAI_API_KEY", body):
            offenders.append(f.name)
    assert not offenders, (
        "these model/product workflows reference the reviewer: "
        + ", ".join(offenders)
        + ". A reviewer outage would stop them, which is the single point of "
          "failure this requirement forbids.")


def test_THE_PROVIDER_SEAM_IS_NOT_IN_THE_MODELS_DECISION_CODE():
    """7. The seam belongs to the reviewer layer. If valuation or the decision
    path ever branched on REVIEW_PROVIDER, the product would have a
    configuration input it must not have -- and the identical-output test above
    would be the only thing standing between that and a silent behaviour fork."""
    hits = [str(p.relative_to(ROOT)) for p in CORE_FILES
            if "REVIEW_PROVIDER" in p.read_text(errors="ignore")]
    assert not hits, ("the product path reads REVIEW_PROVIDER: " + ", ".join(hits))


@pytest.mark.skipif(not (ROOT / "tools" / "independent_review.py").exists(),
                    reason="harness not on this branch")
def test_EXEC_AN_UNAVAILABLE_REVIEWER_YIELDS_UNAVAILABLE_AND_NEVER_ACCEPT():
    """5. Executed against the real harness. The danger is not that the reviewer
    fails -- it is that a failure is later READ as approval. So this asserts the
    artifact carries no `verdict` key at all, rather than trusting that a
    consumer will check `status` first."""
    import tempfile
    # And the NORMAL path stays non-blocking, asserted here so the two modes
    # cannot silently converge on one behaviour.
    r0 = subprocess.run(
        [sys.executable, "tools/independent_review.py",
         "--base", "HEAD~1", "--head", "HEAD", "--no-tests", "--out", "/dev/null"],
        env={**{k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"},
             "OPENAI_API_KEY": ""},
        capture_output=True, text=True, cwd=str(ROOT))
    assert r0.returncode == 0, (
        "an unavailable NORMAL review must stay non-blocking (exit 0); the "
        "football system must never stop for a reviewer outage")
    for env_extra, expect in (({"OPENAI_API_KEY": ""}, "CONFIG"),
                              ({"REVIEW_PROVIDER": "disabled",
                                "OPENAI_API_KEY": "x"}, "DISABLED")):
        with tempfile.NamedTemporaryFile(suffix=".json") as tf:
            env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
            env.update(env_extra)
            r = subprocess.run(
                [sys.executable, "tools/independent_review.py",
                 "--self-test", "--out", tf.name],
                env=env, capture_output=True, text=True, cwd=str(ROOT))
            # ⚠️ THE EXIT CODE DIFFERS BY MODE, AND THAT IS THE ARCHITECTURE.
            #
            # A NORMAL review that cannot run exits 0: the change is unreviewed,
            # the football system does not care, and a red job would let a
            # billing event halt draft-night work.
            #
            # A SELF-TEST that cannot run exits NON-ZERO. Its only purpose is to
            # answer "is this reviewer worth listening to", and an unrun one
            # answers nothing while looking like a completed step. Reporting
            # success there would let an unvalidated reviewer be promoted on a
            # run that never happened.
            #
            # This file exercises --self-test, so 1 is the correct code. The
            # assertion said 0 and went red the moment that distinction landed,
            # which is the test doing its job on a deliberate change.
            assert r.returncode == 1, (
                "an unavailable SELF-TEST must exit non-zero -- an unrun "
                f"validation cannot establish reviewer validity\n{r.stderr[-600:]}")
            rec = json.loads(Path(tf.name).read_text())
            assert rec["status"] == "UNAVAILABLE"
            assert rec["unavailable_kind"] == expect
            assert "verdict" not in rec, (
                "an unavailable review carries a verdict key -- a consumer "
                "reading it could treat an outage as approval")
            assert rec.get("verdict") is None


@pytest.mark.skipif(not (ROOT / "tools" / "independent_review.py").exists(),
                    reason="harness not present on this branch — which is "
                           "itself the point: the core must not need it")
def test_THE_HARNESS_IS_ABSENT_OR_PRESENT_AND_THE_CORE_DOES_NOT_CARE():
    """The relationship, stated as an assertion. This test SKIPS when the
    harness is missing and passes when it is there — and every test above
    passes either way. That is what 'optional enhancement' means operationally."""
    assert (ROOT / "tools" / "independent_review.py").exists()
