# CONTACT DIRECTORY — one record, many readers

**Gate: NONE.** No draft dependency, no season dependency. Re-audited
2026-08-08 (`docs/POST-DRAFT-LABEL-AUDIT.md`). Build order position **#8**.

## What

Collect **email and phone alongside the existing Venmo handle** — same profile
store, same **one-record-many-readers** rule, same login-prompt pattern already
used for Venmo.

## Collection

- A **dismissible-but-recurring banner** for anyone with incomplete info. It
  comes back; it does not nag within a session.
- The commissioner's **missing-info view** — who is incomplete, at a glance.
- **Each owner edits his own record any time.**

## Surface it where it is useful, not as its own page

This is the whole design point: a directory page is a page nobody opens. Contact
info should be **one tap from wherever you are already looking at a person.**

**The home page's team list becomes tappable.** Tap an owner → a card with:

- team name
- Venmo handle
- email
- phone
- **quick actions**: `tel:` call, `sms:` text, `mailto:` email, Venmo deep link

**The same card renders from:**

- the standings
- the settlement page
- side-bet rows
- (and, once the chronicle ships, franchise pages)

One component, one data source, four call sites. If a fifth place shows a person,
it gets the same card rather than its own markup.

## Privacy

- **League-visible only, behind login. No public exposure.**
- Not in any unauthenticated route, not in `draft_data.json`, not in the build
  stamp, not in any artifact `site-check` can fetch — that check runs
  unauthenticated by design, and it must stay that way.
- Each owner controls his own record.

## Notes for the build

- The Venmo write path already restricts itself to four payment fields
  (`venmo.test.js`: *"wiring: only the four payment fields can be written through
  this path"*). **Extend that allow-list deliberately** rather than loosening it
  — the test exists to stop exactly this kind of widening from happening by
  accident.
- Phone and email are **PII in a way a Venmo handle is not.** Worth one explicit
  test that neither ever appears in an unauthenticated response.
