"""The drift alarm must BITE — proven on a real git fixture, not asserted in prose.

Cory's requirement, verbatim: "test it by deliberately skipping a deploy and
confirming the alarm fires. A silent stale site during mock #3 would be worse
than the minutes problem we're solving."

So the central test below builds a real repository, deploys a commit, then makes
further commits WITHOUT deploying — the exact sequence the gate now produces —
and asserts the alarm goes red for the changes that matter and stays quiet for
the ones that do not.
"""
import subprocess
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools'))
import deploy_drift as D  # noqa: E402


def git(repo, *args):
    return subprocess.run(('git',) + args, cwd=repo, capture_output=True,
                          text=True, check=True).stdout.strip()


def make_repo(tmp_path):
    r = tmp_path / 'repo'
    r.mkdir()
    git(r, 'init', '-q')
    git(r, 'config', 'user.email', 't@t')
    git(r, 'config', 'user.name', 't')
    (r / 'public').mkdir()
    (r / 'public' / 'js').mkdir()
    (r / 'public' / 'js' / 'draft').mkdir()
    (r / 'docs').mkdir()
    (r / 'public' / 'app.css').write_text('a{}')
    git(r, 'add', '-A')
    git(r, 'commit', '-qm', 'base [deploy]')
    return r


def changed_since(repo, ref):
    out = git(repo, 'diff', '--name-only', f'{ref}..HEAD')
    return [ln for ln in out.splitlines() if ln.strip()]


# ---------------------------------------------------------------------------
# THE CENTRAL TEST: deliberately skip a deploy, confirm the alarm fires.
# ---------------------------------------------------------------------------

def test_skipping_a_deploy_of_draft_code_fires_the_alarm(tmp_path):
    repo = make_repo(tmp_path)
    deployed = git(repo, 'rev-parse', 'HEAD')

    # ...now do exactly what the gate encourages: keep committing, do not deploy.
    (repo / 'public' / 'js' / 'draft' / 'app.js').write_text('// a war-room fix')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'fix the tap target')

    head = git(repo, 'rev-parse', 'HEAD')
    behind = int(git(repo, 'rev-list', '--count', f'{deployed}..HEAD'))
    v = D.assess(changed_since(repo, deployed), deployed, head, behind)

    assert v['level'] == 'red', v
    assert v['draft'] == ['public/js/draft/app.js']
    # It must say the thing that matters, not merely be red.
    assert 'WAR ROOM' in v['message']
    assert 'stale' in v['message'].lower()


def test_one_undeployed_draft_file_is_enough(tmp_path):
    """A count-based threshold would sleep through this. Path-based must not."""
    repo = make_repo(tmp_path)
    deployed = git(repo, 'rev-parse', 'HEAD')
    (repo / 'public' / 'js' / 'draft' / 'survival.js').write_text('// one file')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'one commit, one file')
    v = D.assess(changed_since(repo, deployed), deployed, git(repo, 'rev-parse', 'HEAD'), 1)
    assert v['level'] == 'red'


def test_forty_doc_commits_stay_quiet(tmp_path):
    """The gate exists so this is normal. Crying wolf here teaches him to ignore it."""
    repo = make_repo(tmp_path)
    deployed = git(repo, 'rev-parse', 'HEAD')
    for i in range(40):
        (repo / 'docs' / f'note{i}.md').write_text(f'# {i}')
        git(repo, 'add', '-A')
        git(repo, 'commit', '-qm', f'spec {i}')
    v = D.assess(changed_since(repo, deployed), deployed, git(repo, 'rev-parse', 'HEAD'), 40)
    assert v['level'] == 'ok', v
    assert not v['served'] and not v['draft']
    assert len(v['inert']) == 40


def test_a_deployed_site_that_matches_head_is_silent(tmp_path):
    repo = make_repo(tmp_path)
    head = git(repo, 'rev-parse', 'HEAD')
    v = D.assess([], head, head, 0)
    assert v['level'] == 'ok'


def test_served_but_non_draft_drift_is_still_red(tmp_path):
    repo = make_repo(tmp_path)
    deployed = git(repo, 'rev-parse', 'HEAD')
    (repo / 'public' / 'app.css').write_text('a{color:red}')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'restyle')
    v = D.assess(changed_since(repo, deployed), deployed, git(repo, 'rev-parse', 'HEAD'), 1)
    assert v['level'] == 'red'
    assert v['served'] == ['public/app.css']
    assert not v['draft']


def test_mixed_drift_reports_the_draft_path_first(tmp_path):
    repo = make_repo(tmp_path)
    deployed = git(repo, 'rev-parse', 'HEAD')
    (repo / 'docs' / 'x.md').write_text('x')
    (repo / 'public' / 'js' / 'draft' / 'engine.js').write_text('// e')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'both')
    v = D.assess(changed_since(repo, deployed), deployed, git(repo, 'rev-parse', 'HEAD'), 1)
    assert v['level'] == 'red'
    assert 'WAR ROOM' in v['message']       # the draft path dominates the message


# --------------------------------- classification ---------------------------

def test_paths_classify_into_the_right_buckets():
    assert D.classify('public/js/draft/app.js') == 'draft'
    assert D.classify('public/draft_data.json') == 'draft'
    assert D.classify('public/css/style.css') == 'served'
    assert D.classify('views/admin/warroom.ejs') == 'served'
    assert D.classify('src/predledger.js') == 'served'
    assert D.classify('netlify.toml') == 'served'
    assert D.classify('netlify/functions/app.js') == 'served'
    assert D.classify('docs/queued/the-lab.md') == 'inert'
    assert D.classify('draft/backtest/money_grade.py') == 'inert'
    assert D.classify('.github/workflows/ci.yml') == 'inert'
    assert D.classify('STATUS.md') == 'inert'


# ------------------------------------ budget --------------------------------

def test_the_draft_week_reserve_is_held_back_before_the_daily_rate():
    """Ordinary work must not be able to drift into the reserve a little each day."""
    b = D.budget(limit_minutes=300, pct_used=0.75, days_left=12)
    assert b['remaining_minutes'] == 75.0
    assert b['reserve_builds'] == 15
    assert b['reserve_minutes'] == 9.6
    assert b['spendable_minutes'] == 65.4
    # 65.4 / 0.64 = 102 builds over 12 days
    assert b['spendable_builds'] == 102
    assert b['safe_builds_per_day'] == 8.5
    assert b['reserve_at_risk'] is False


def test_reserve_at_risk_flips_when_the_budget_cannot_cover_draft_week():
    b = D.budget(limit_minutes=300, pct_used=0.98, days_left=5)
    assert b['reserve_at_risk'] is True
    assert b['spendable_builds'] == 0


def test_alert_thresholds_are_the_ones_cory_asked_for():
    assert D.alert_level(0.80) == 'ok'
    assert D.alert_level(0.85) == 'warn'
    assert D.alert_level(0.94) == 'warn'
    assert D.alert_level(0.95) == 'critical'
    assert D.alert_level(0.99) == 'critical'
