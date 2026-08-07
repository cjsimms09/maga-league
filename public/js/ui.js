/* Site-wide interaction polish.
 *
 * Everything here is progressive enhancement: the site is server-rendered
 * forms and links, and it works with this file blocked. Nothing in here is
 * load-bearing for a single feature.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Submit feedback.
   *
   * Every member action is a synchronous POST to a serverless function that
   * can cold-start. Without this, the user taps "claim your draft spot" and
   * gets no acknowledgement at all until the page reloads — so they tap again.
   *
   * The disable is deferred to a timeout so the button is still enabled while
   * the browser serialises the form. No submit button in this app carries a
   * name/value pair, but deferring costs nothing and removes the whole class
   * of bug if one ever does.
   * ------------------------------------------------------------------ */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.hasAttribute('data-no-busy')) return;
    if (form.dataset.busy === '1') { e.preventDefault(); return; }

    var btn = form.querySelector('button[type=submit], button:not([type]), input[type=submit]');
    if (!btn || btn.disabled) return;

    form.dataset.busy = '1';
    btn.dataset.idleLabel = btn.innerHTML;
    btn.classList.add('is-busy');
    // Short buttons ("✓ Paid") get a spinner only; wide ones get words.
    if (btn.offsetWidth >= 110) btn.innerHTML = '<span class="spin"></span> Working…';
    else btn.innerHTML = '<span class="spin"></span>';
    setTimeout(function () { btn.disabled = true; }, 0);
  }, true);

  // Back/forward cache hands you the page in its submitted state. Undo it, or
  // the user returns to a permanently disabled button.
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    document.querySelectorAll('form[data-busy="1"]').forEach(function (form) {
      delete form.dataset.busy;
      form.querySelectorAll('.is-busy').forEach(function (btn) {
        if (btn.dataset.idleLabel != null) btn.innerHTML = btn.dataset.idleLabel;
        btn.classList.remove('is-busy');
        btn.disabled = false;
      });
    });
  });

  /* ------------------------------------------------------------------
   * 2. The "More" sheet on the phone tab bar.
   *
   * It is a <details>, so it opens and closes without JS. All this adds is the
   * two dismissals people expect from a sheet: tap outside, and Escape.
   * ------------------------------------------------------------------ */
  var sheet = document.querySelector('.more-sheet');
  if (sheet) {
    document.addEventListener('click', function (e) {
      if (sheet.open && !sheet.contains(e.target)) sheet.open = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.open) {
        sheet.open = false;
        var s = sheet.querySelector('summary');
        if (s) s.focus();
      }
    });
  }

  /* ------------------------------------------------------------------
   * 3. Tiles that open a <details> elsewhere on the page.
   *
   * An anchor cannot open a collapsed <details>, so "tap the pot to see the
   * split" would scroll you to a closed box and look broken. Six lines fixes it,
   * and the link still navigates without JS — you just have to open the box.
   * ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-opens]');
    if (!trigger) return;
    var target = document.querySelector(trigger.getAttribute('data-opens'));
    if (!target) return;
    target.open = true;
    // Let the anchor do the scrolling; opening first means it scrolls to the
    // expanded box rather than to where the closed one used to be.
  });

  /* ------------------------------------------------------------------
   * 4. Horizontal-scroll affordance.
   *
   * Wide tables scroll inside their card. On a phone with overlay scrollbars
   * there is no visual cue that they do, so a table that is cut off reads as a
   * table that is broken. Mark the ones that actually overflow.
   * ------------------------------------------------------------------ */
  function markScrollers() {
    document.querySelectorAll('.scroll-x').forEach(function (el) {
      el.classList.toggle('can-scroll', el.scrollWidth - el.clientWidth > 4);
      el.classList.toggle('scrolled-end', el.scrollWidth - el.clientWidth - el.scrollLeft < 4);
    });
  }
  markScrollers();
  window.addEventListener('resize', markScrollers, { passive: true });
  document.querySelectorAll('.scroll-x').forEach(function (el) {
    el.addEventListener('scroll', markScrollers, { passive: true });
  });
})();
