/* Contact directory — the shared card, opened from anywhere a person appears.
 *
 * One component, many call sites (contact-directory.md): any element with
 * data-contact="<owner_id>" becomes a tap target that opens a card built from
 * the login-gated JSON blob embedded once per page (#contact-data). No card
 * markup is duplicated per call site — the standings, settlement, side-bet rows
 * and franchise pages all just tag a name and share this one popover.
 */
(function () {
  'use strict';
  var dataEl = document.getElementById('contact-data');
  if (!dataEl) return;
  var contacts = {};
  try {
    (JSON.parse(dataEl.textContent) || []).forEach(function (c) { contacts[String(c.id)] = c; });
  } catch (e) { return; }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var telHref = function (p) { return 'tel:' + String(p).replace(/[^\d+]/g, ''); };
  var smsHref = function (p) { return 'sms:' + String(p).replace(/[^\d+]/g, ''); };

  // one overlay, reused
  var overlay = document.createElement('div');
  overlay.className = 'contact-overlay';
  overlay.setAttribute('hidden', '');
  overlay.innerHTML = '<div class="contact-card" role="dialog" aria-modal="true" aria-label="Contact card"></div>';
  var card = overlay.querySelector('.contact-card');
  document.body.appendChild(overlay);

  function close() { overlay.setAttribute('hidden', ''); }
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function row(icon, label, valueHtml) {
    return '<div class="cc-row"><span class="cc-ico" aria-hidden="true">' + icon + '</span>'
      + '<span class="cc-body"><span class="cc-label">' + label + '</span>' + valueHtml + '</span></div>';
  }

  function open(id) {
    var c = contacts[String(id)];
    if (!c) return;
    var html = '<button class="cc-close" aria-label="Close">✕</button>';
    html += '<div class="cc-name">' + esc(c.name) + (c.flag ? ' <span class="flag">' + esc(c.flag) + '</span>' : '') + '</div>';
    if (c.team_name) html += '<div class="cc-team">' + esc(c.team_name) + '</div>';

    if (c.phone) {
      html += row('📞', 'Phone',
        '<a href="' + esc(telHref(c.phone)) + '">' + esc(c.phone) + '</a>'
        + ' <a class="cc-act" href="' + esc(smsHref(c.phone)) + '">Text</a>');
    } else { html += row('📞', 'Phone', '<span class="cc-none">not on file</span>'); }

    if (c.email) {
      html += row('✉️', 'Email',
        '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
    } else { html += row('✉️', 'Email', '<span class="cc-none">not on file</span>'); }

    if (c.venmo) {
      var vh = String(c.venmo).replace(/^@+/, '');
      html += row('💸', 'Venmo',
        '<a href="https://venmo.com/u/' + encodeURIComponent(vh) + '" target="_blank" rel="noopener">@' + esc(vh) + '</a>');
    } else { html += row('💸', 'Venmo', '<span class="cc-none">no Venmo on file</span>'); }

    card.innerHTML = html;
    card.querySelector('.cc-close').addEventListener('click', close);
    overlay.removeAttribute('hidden');
  }

  // Delegate: works for tap targets rendered now or later.
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-contact]') : null;
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-contact'));
  });
})();
