// Light / dark / system theme setting, shared by every page.
// Loaded as a plain (blocking) script in <head> so the saved theme applies before the first paint,
// then adds the theme menu to the page's nav bar once the DOM is ready.
(function () {
  var KEY = 'pw-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
  }
  function isDark(choice) { return choice === 'dark' || (choice === 'system' && !!(media && media.matches)); }
  function apply(choice) {
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark(choice) ? '#0b0c12' : '#ffffff');
  }
  apply(saved());

  var sprite = new URL('../img/tabler.svg', document.currentScript.src);
  var ICONS = { system: 'device-desktop', light: 'sun', dark: 'moon' };
  function themeIcon(choice) {
    return '<svg class="tabler-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="' + sprite.href + '#' + ICONS[choice] + '"/></svg>';
  }

  function mountNavigation(nav) {
    var button = nav.querySelector('.nav-menu-toggle');
    if (!button) return;
    var links = document.getElementById(button.getAttribute('aria-controls'));
    var narrow = window.matchMedia('(max-width: 1040px)');
    function expanded() { return button.getAttribute('aria-expanded') === 'true'; }
    function setExpanded(open) { button.setAttribute('aria-expanded', String(open)); }

    button.hidden = false;
    button.addEventListener('click', function () { setExpanded(!expanded()); });
    links.addEventListener('click', function (ev) { if (ev.target.closest('a')) setExpanded(false); });
    document.addEventListener('click', function (ev) {
      if (!button.contains(ev.target) && !links.contains(ev.target)) setExpanded(false);
    });
    nav.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && expanded()) {
        setExpanded(false);
        button.focus();
      }
    });
    if (narrow.addEventListener) narrow.addEventListener('change', function () { setExpanded(false); });
  }
  var LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
  var PREFIX = 'Theme';
  var relabel = null;

  // Called by i18n.js once the page's language has loaded, before or after the menu mounts.
  window.pwSetThemeLabels = function (labels, prefix) {
    ['system', 'light', 'dark'].forEach(function (k) { if (labels && labels[k]) LABELS[k] = labels[k]; });
    if (prefix) PREFIX = prefix;
    if (relabel) relabel();
  };

  function mount() {
    var nav = document.querySelector('.nav-inner');
    if (!nav || nav.querySelector('.theme-pick')) return;
    mountNavigation(nav);
    var wrap = document.createElement('div');
    wrap.className = 'theme-pick';
    wrap.innerHTML =
      '<button type="button" class="theme-btn" aria-haspopup="true" aria-expanded="false"></button>' +
      '<div class="theme-menu" role="menu" hidden>' +
      ['system', 'light', 'dark'].map(function (k) {
        return '<button type="button" role="menuitemradio" data-theme-choice="' + k + '">' + themeIcon(k) + '<span>' + LABELS[k] + '</span></button>';
      }).join('') + '</div>';
    nav.appendChild(wrap);
    var btn = wrap.querySelector('.theme-btn');
    var menu = wrap.querySelector('.theme-menu');

    function render() {
      var c = saved();
      btn.innerHTML = themeIcon(isDark(c) ? 'dark' : 'light');
      btn.setAttribute('aria-label', PREFIX + ': ' + LABELS[c]);
      btn.title = PREFIX + ': ' + LABELS[c];
      menu.querySelectorAll('[data-theme-choice]').forEach(function (b) {
        b.setAttribute('aria-checked', String(b.getAttribute('data-theme-choice') === c));
      });
    }
    function open(v) {
      menu.hidden = !v;
      btn.setAttribute('aria-expanded', String(v));
      if (v) (menu.querySelector('[aria-checked="true"]') || menu.firstChild).focus();
    }
    btn.addEventListener('click', function () { open(menu.hidden); });
    menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-theme-choice]');
      if (!b) return;
      var c = b.getAttribute('data-theme-choice');
      try { if (c === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch (e) {}
      apply(c); render(); open(false); btn.focus();
    });
    document.addEventListener('click', function (ev) { if (!wrap.contains(ev.target)) open(false); });
    wrap.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !menu.hidden) {
        ev.preventDefault();
        var items = Array.prototype.slice.call(menu.querySelectorAll('[data-theme-choice]'));
        var i = items.indexOf(document.activeElement);
        items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    if (media && media.addEventListener) media.addEventListener('change', function () { apply(saved()); render(); });
    relabel = function () {
      menu.querySelectorAll('[data-theme-choice]').forEach(function (b) {
        b.querySelector('span').textContent = LABELS[b.getAttribute('data-theme-choice')];
      });
      render();
    };
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
