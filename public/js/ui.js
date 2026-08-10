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

  // Same idea for a plain card: jump to it and mark it, so a tile that scrolls
  // you somewhere makes it obvious where it landed you.
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-flash]');
    if (!trigger) return;
    var target = document.querySelector(trigger.getAttribute('data-flash'));
    if (!target) return;
    target.classList.add('flash-card');
    setTimeout(function () { target.classList.remove('flash-card'); }, 1800);
  });

  /* ------------------------------------------------------------------
   * 4. Tap-to-copy payment handles.
   *
   * The point of the directory is getting a handle into Venmo with as few
   * steps as possible. Selecting text on a phone to copy it is four fiddly
   * ones. Falls back to leaving the text visible and selectable, which is
   * exactly what it was before.
   * ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-copy]');
    if (!chip || !navigator.clipboard) return;
    navigator.clipboard.writeText(chip.getAttribute('data-copy')).then(function () {
      var was = chip.innerHTML;
      chip.classList.add('copied');
      chip.textContent = '✓ Copied';
      setTimeout(function () { chip.innerHTML = was; chip.classList.remove('copied'); }, 1400);
    }).catch(function () { /* clipboard denied — the text is still on screen */ });
  });

  /* ------------------------------------------------------------------
   * 5. Horizontal-scroll affordance.
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

  /* ------------------------------------------------------------------
   * 6. Derive — tap any number to see how it was computed.
   *
   * A site-wide pattern: any figure wrapped in partials/_derive.ejs becomes a
   * trigger that opens an inline panel showing the real parts it is built from.
   * Never a modal, never navigation. The panel is fixed-positioned here (not in
   * flow) so it escapes any overflow:auto scroll container — the money board and
   * standings tables would otherwise clip it. One open at a time; outside-click,
   * Escape, and scroll-out all close it; the panel tracks its number on scroll.
   * ------------------------------------------------------------------ */
  var deriveOpen = null; // { trigger, panel }

  function closeDerive() {
    if (!deriveOpen) return;
    deriveOpen.trigger.setAttribute('aria-expanded', 'false');
    deriveOpen.panel.hidden = true;
    deriveOpen = null;
  }

  function positionDerive() {
    if (!deriveOpen) return;
    var t = deriveOpen.trigger, p = deriveOpen.panel;
    var r = t.getBoundingClientRect();
    // Scrolled out of view (e.g. behind a sticky bar or off a scroll container) → close.
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      closeDerive();
      return;
    }
    // Measure while visible, then clamp to the viewport with an 8px gutter.
    p.style.left = '0px'; p.style.top = '0px';
    var pw = p.offsetWidth, ph = p.offsetHeight, gut = 8;
    var left = Math.min(Math.max(gut, r.left), window.innerWidth - pw - gut);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - gut) {
      var above = r.top - ph - 6;
      if (above >= gut) top = above; // flip above when there is no room below
      else top = Math.max(gut, window.innerHeight - ph - gut);
    }
    p.style.left = Math.round(left) + 'px';
    p.style.top = Math.round(top) + 'px';
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.derive-trigger');
    if (trigger) {
      e.preventDefault();
      var wrap = trigger.closest('.derive');
      var panel = wrap && wrap.querySelector('.derive-panel');
      if (!panel) return;
      var wasOpen = deriveOpen && deriveOpen.trigger === trigger;
      closeDerive();
      if (wasOpen) return; // second tap on the same number closes it
      trigger.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      deriveOpen = { trigger: trigger, panel: panel };
      positionDerive();
      return;
    }
    if (deriveOpen && !e.target.closest('.derive-panel')) closeDerive();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && deriveOpen) {
      var t = deriveOpen.trigger;
      closeDerive();
      if (t && t.focus) t.focus();
    }
  });

  window.addEventListener('scroll', positionDerive, { passive: true, capture: true });
  window.addEventListener('resize', positionDerive, { passive: true });
})();
