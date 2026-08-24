/* THE DISPATCH — progressive enhancement for the transient league notices.
 *
 * These render as an inline dismissible stack at the top of the home feed on
 * every viewport. They used to become a page-blocking modal overlay when JS
 * was live; that ambushed the whole home page on load (the exact "too busy"
 * complaint, worst on a phone), so the overlay treatment is gone — JS now
 * only upgrades dismissal: each ✕ marks the card seen via fetch and removes
 * just that card, no reload. Dismissal is server-side either way, so a
 * dismissed dispatch stays gone.
 */
(function () {
  'use strict';
  var region = document.getElementById('dispatch-region');
  if (!region) return;

  function remaining() { return region.querySelectorAll('.dispatch-card').length; }
  function closeRegion() {
    region.classList.add('closing');
    setTimeout(function () { if (region.parentNode) region.parentNode.removeChild(region); }, 200);
  }
  function dropCard(card) {
    card.classList.add('gone');
    setTimeout(function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      if (remaining() === 0) closeRegion();
    }, 180);
  }

  region.querySelectorAll('.dispatch-dismiss-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var card = form.closest('.dispatch-card');
      var key = form.querySelector('input[name="key"]').value;
      dropCard(card); // optimistic — the read is done, the record follows
      fetch('/dispatch/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: 'ajax=1&key=' + encodeURIComponent(key),
      }).catch(function () { /* the redirect path still marks it next load */ });
    });
  });

  // Esc dismisses the top (oldest-shown) card — a keyboard read-and-clear.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var card = region.querySelector('.dispatch-card');
    if (card) { var f = card.querySelector('.dispatch-dismiss-form'); if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
})();
