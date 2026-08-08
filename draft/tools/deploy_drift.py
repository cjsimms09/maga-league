"""DEPLOY DRIFT — is the live site the site we think it is?

Deploys are gated on explicit intent (`netlify-ignore.sh`) because auto-deploying
every push consumed 75% of August's build minutes, and exhausting them suspends
the site until Sept 1 — which would take the war room down on draft day.

That trade buys minutes and INVERTS the failure mode. Instead of burning budget
we now risk rehearsing a mock on a STALE SITE while the repo is already fixed.
A silent stale site during mock #3 is worse than the minutes problem it solves,
so the gate is only half a mechanism; this is the other half.

THE THRESHOLD IS *WHAT* CHANGED, NOT *HOW MANY* COMMITS.

Counting commits is the wrong instrument: forty spec commits behind is fine and
expected under the gate, while ONE undeployed fix to `public/js/draft/app.js`
means the war room being rehearsed on is not the war room in the repo. So drift
is classified by path:

    SERVED   public/, views/, netlify/, src/, netlify.toml  -> the live site
    DRAFT    public/js/draft/, public/draft_data.json       -> the war room
    INERT    docs/, draft/ (Lab), .github/, *.md, tests     -> not served

  any DRAFT-path drift            -> RED   (mock-critical: rehearsing stale code)
  any other SERVED-path drift     -> RED   (the site is not what the repo says)
  INERT-only drift                -> OK    (exactly what the gate is for)

Pure functions so the rule is testable without Netlify, a network, or a deploy;
`draft/tests/test_deploy_drift.py` drives a real git fixture through it,
including the deliberate skipped-deploy case that must fire the alarm.
"""

SERVED_PREFIXES = ('public/', 'views/', 'netlify/', 'src/')
SERVED_FILES = ('netlify.toml',)
# The war-room surface. A subset of SERVED, called out because stale draft code
# during a mock is the specific disaster this exists to prevent.
DRAFT_PREFIXES = ('public/js/draft/',)
DRAFT_FILES = ('public/draft_data.json',)


def classify(path):
    """One path -> 'draft' | 'served' | 'inert'."""
    p = (path or '').strip().lstrip('./')
    if not p:
        return 'inert'
    if p in DRAFT_FILES or p.startswith(DRAFT_PREFIXES):
        return 'draft'
    if p in SERVED_FILES or p.startswith(SERVED_PREFIXES):
        return 'served'
    return 'inert'


def assess(changed_paths, deployed_commit=None, head_commit=None, behind=None):
    """Classify a set of undeployed paths into a verdict.

    Returns {level, draft[], served[], inert[], message} where level is
    'red' | 'ok'. 'red' means the live site is materially not the repo.
    """
    draft, served, inert = [], [], []
    for p in changed_paths or ():
        k = classify(p)
        (draft if k == 'draft' else served if k == 'served' else inert).append(p)

    dep = (deployed_commit or '?')[:8]
    head = (head_commit or '?')[:8]
    n = f'{behind} commit(s)' if behind is not None else 'some commits'

    if draft:
        return {'level': 'red', 'draft': draft, 'served': served, 'inert': inert,
                'message': (f'THE WAR ROOM ON THE LIVE SITE IS STALE — {len(draft)} '
                            f'undeployed draft-path file(s) (deployed {dep}, main {head}). '
                            f'Rehearsing a mock against this is rehearsing the wrong code. '
                            f'Deploy with [deploy] before the next mock.')}
    if served:
        return {'level': 'red', 'draft': draft, 'served': served, 'inert': inert,
                'message': (f'the live site is behind the repo on {len(served)} served '
                            f'file(s) (deployed {dep}, main {head})')}
    return {'level': 'ok', 'draft': draft, 'served': served, 'inert': inert,
            'message': (f'live site is {n} behind main, all of it non-served '
                        f'(docs/Lab/CI) — exactly what the deploy gate is for')}


# ---------------------------------------------------------------- budget ----

# Measured 2026-08-08: 349 build-triggering pushes Aug 1-8 against 75% of the
# monthly allowance. The build command is a file copy, so this is overhead, not
# work — the lever is build COUNT, never per-build cost.
MIN_PER_BUILD = 0.64
DRAFT_WEEK_RESERVE_BUILDS = 15          # Aug 20-22, untouchable


def budget(limit_minutes, pct_used, days_left, reserve_builds=DRAFT_WEEK_RESERVE_BUILDS,
           min_per_build=MIN_PER_BUILD):
    """Remaining budget and a safe daily rate, with the draft-week reserve held back.

    The reserve is subtracted BEFORE the daily rate is computed, so ordinary work
    can never eat into it by drifting a little over each day.
    """
    remaining = limit_minutes * (1.0 - pct_used)
    reserve_min = reserve_builds * min_per_build
    spendable = remaining - reserve_min
    builds = int(spendable / min_per_build) if spendable > 0 else 0
    per_day = (builds / days_left) if days_left > 0 else 0.0
    return {
        'remaining_minutes': round(remaining, 1),
        'reserve_minutes': round(reserve_min, 1),
        'reserve_builds': reserve_builds,
        'spendable_minutes': round(spendable, 1),
        'spendable_builds': builds,
        'safe_builds_per_day': round(per_day, 1),
        'reserve_at_risk': spendable <= 0,
    }


def alert_level(pct_used):
    """Cory asked for alerts at 85% and 95%."""
    if pct_used >= 0.95:
        return 'critical'
    if pct_used >= 0.85:
        return 'warn'
    return 'ok'
