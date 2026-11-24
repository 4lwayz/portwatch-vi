// Interface translations for the public pages (index.html, board.html).
// UI strings live in assets/i18n/<code>.json; en.json is the fallback for any key a language lacks.
// Tracker data (project summaries, news, changes) is written in English. Languages marked `data: true` also load
// data/i18n/<code>.json, which maps each English text to its translation (see td() and scripts/translate-data.mjs).
// Milestone, groundwork and stability names come from scoring.js in English and are translated under
// the ms.*, gw.* and stab.* keys of each non-English file. See assets/i18n/README.md.

export const LANGS = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'pt-BR', name: 'Português (Brasil)', short: 'PT' },
  { code: 'es', name: 'Español', short: 'ES' },
  { code: 'zh-CN', name: '简体中文', short: '简', data: true },
  { code: 'zh-TW', name: '繁體中文', short: '繁', data: true },
];
const KEY = 'pw-lang';
const CODES = LANGS.map((l) => l.code);

let lang = 'en';
let dict = {};
let en = {};
let content = {};

export const getLang = () => lang;
// For dates and numbers. English keeps the browser's own locale (en-GB, en-US…), as before.
export const locale = () => (lang === 'en' ? undefined : lang);

function savedLang() {
  try { const v = localStorage.getItem(KEY); return CODES.includes(v) ? v : null; } catch { return null; }
}

// Saved choice first, then the first browser language we have, else English.
export function pickLang() {
  const saved = savedLang();
  if (saved) return saved;
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language || 'en']) {
    const low = String(l).toLowerCase();
    if (low.startsWith('pt')) return 'pt-BR';
    if (low.startsWith('es')) return 'es';
    // Traditional script (zh-TW, zh-HK, zh-MO, zh-Hant…) gets zh-TW; any other Chinese gets zh-CN.
    if (low.startsWith('zh')) return /^zh-(tw|hk|mo)\b|hant/.test(low) ? 'zh-TW' : 'zh-CN';
    if (low.startsWith('en')) return 'en';
  }
  return 'en';
}

async function load(code) {
  const res = await fetch(new URL(`../i18n/${code}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${code}.json: HTTP ${res.status}`);
  return res.json();
}

// Same per-minute cache-buster as data/tracker.json in app.js, so both come from the same scout run.
async function loadContent(code) {
  const res = await fetch(new URL(`../../data/i18n/${code}.json?ts=${Math.floor(Date.now() / 6e4)}`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data/i18n/${code}.json: HTTP ${res.status}`);
  return res.json();
}

// Never throws: if a language file can't load, the page stays in English.
export async function initI18n() {
  lang = pickLang();
  const withContent = LANGS.some((l) => l.code === lang && l.data);
  const [base, own, data] = await Promise.all([
    load('en').catch(() => ({})),
    lang === 'en' ? null : load(lang).catch(() => null),
    withContent ? loadContent(lang).catch(() => ({})) : {},
  ]);
  en = base;
  if (lang !== 'en' && !own) lang = 'en';
  dict = lang === 'en' ? en : own;
  content = lang === 'en' ? {} : data;
  document.documentElement.lang = lang;
  if (lang !== 'en') applyStatic();
  if (typeof window.pwSetThemeLabels === 'function') {
    window.pwSetThemeLabels({ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }, t('theme.label'));
  }
  mountPicker();
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Active language, then English, then the key itself.
export function t(key, vars) {
  return fill(dict[key] ?? en[key] ?? key, vars);
}

// For strings whose English lives in code (scoring.js): the active language's translation, else that English.
export function tr(key, english, vars) {
  return fill(lang !== 'en' && typeof dict[key] === 'string' ? dict[key] : english, vars);
}

// Counted strings: key_one for exactly 1, key_other otherwise (right for en, pt-BR and es; zh-* uses the same text for both).
export function tn(key, n, vars) {
  return t(`${key}_${n === 1 ? 'one' : 'other'}`, { n, ...vars });
}

// Tracker text (summaries, news, changes…) in the active language: its data/i18n entry, else a scout template
// below, else the English. An empty entry means "not translated yet".
export function td(s) {
  if (lang === 'en' || typeof s !== 'string') return s;
  return (Object.hasOwn(content, s) && content[s]) || auto(s) || s;
}

// Text the scout builds from fixed templates (scripts/lib/pipeline.mjs, core.mjs). A language that defines the
// auto.* key gets it translated at once, without waiting for data/i18n. {1}, {2}… are the groups; a third entry
// names the group that holds a milestone key (shown with that language's ms.*.label).
export const AUTO = [
  ['auto.spotted', /^Scout spotted (\S+) \(possible effort, substance (\d+)\)\.$/],
  ['auto.spottedTool', /^Scout spotted (\S+) \(tool, substance (\d+)\)\.$/],
  ['auto.spottedGitlab', /^Scout spotted (\S+) \(substance (\d+)\)\.$/],
  ['auto.gone', /^(.+) is no longer reachable on GitHub \(HTTP (\d+)\)\.$/],
  ['auto.goneBlocked', /^(.+) is no longer reachable on GitHub \(HTTP (\d+), blocked\)\.$/],
  ['auto.moved', /^(.+) moved to (\S+\/\S+)\.$/],
  ['auto.claim', /^(.+)'s README may claim a new milestone \((\w+)\): “([\s\S]*)”$/, 2],
  ['auto.dmcaNamed', /^(.+) is named in a new DMCA notice \(([\d-]+)\)\.$/],
  ['auto.dmcaNew', /^New (Rockstar|Take-Two) DMCA notice on GitHub \((\d+) repos\)\.$/],
  ['auto.dmcaNewGta', /^New (Rockstar|Take-Two) DMCA notice on GitHub \((\d+) repos, mentions GTA VI\)\.$/],
  ['auto.rose', /^(.+) rose ([\d.]+) pts to ([\d.]+)%\.$/],
  ['auto.fell', /^(.+) fell ([\d.]+) pts to ([\d.]+)%\.$/],
  ['auto.lead', /^(.+) takes the lead at ([\d.]+)%\.$/],
  ['auto.summary', /^(\d+) refreshed, (\d+) READMEs changed, (\d+) new candidates, (\d+) flagged\.$/],
  ['auto.summaryErrors', /^(\d+) refreshed, (\d+) READMEs changed, (\d+) new candidates, (\d+) flagged, (\d+) errors\.$/],
  ['auto.terms', /^(\d+) technical terms$/],
  ['auto.statusTable', /^status table$/],
  ['auto.tests', /^tests$/],
  ['auto.commits', /^(\d+\+?) commits\/7d$/],
];
export const autoKey = (s) => AUTO.find(([, re]) => re.test(s))?.[0] ?? null;

function auto(s) {
  for (const [key, re, ms] of AUTO) {
    const m = typeof dict[key] === 'string' ? re.exec(s) : null;
    if (!m) continue;
    if (ms && typeof dict[`ms.${m[ms]}.label`] === 'string') m[ms] = dict[`ms.${m[ms]}.label`];
    return fill(dict[key], m);
  }
  return null;
}

// Static markup: data-i18n="key" sets the text; data-i18n-attr="title:key;aria-label:key2" sets attributes.
// Translations are always inserted as text, never as HTML.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

const GLOBE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.8 8h12.4M8 1.6c1.8 1.9 2.6 4 2.6 6.4S9.8 12.5 8 14.4M8 1.6C6.2 3.5 5.4 5.6 5.4 8s.8 4.5 2.6 6.4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Language menu in the nav bar, next to the theme menu and styled like it. Choosing a language saves it and reloads.
function mountPicker() {
  const nav = document.querySelector('.nav-inner');
  if (!nav || nav.querySelector('.lang-pick')) return;
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  const label = `${t('lang.label')}: ${cur.name}`;
  const wrap = document.createElement('div');
  wrap.className = 'lang-pick';
  wrap.innerHTML =
    `<button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="${escText(label)}" title="${escText(label)}">${GLOBE}<span>${cur.short}</span></button>` +
    '<div class="theme-menu lang-menu" role="menu" hidden>' +
    LANGS.map((l) => `<button type="button" role="menuitemradio" lang="${l.code}" data-lang="${l.code}" aria-checked="${l.code === lang}"><span>${escText(l.name)}</span></button>`).join('') +
    `<p class="lang-note">${escText(t('lang.note'))}</p></div>`;
  nav.insertBefore(wrap, nav.querySelector('.theme-pick'));

  const btn = wrap.querySelector('.lang-btn');
  const menu = wrap.querySelector('.lang-menu');
  const items = () => [...menu.querySelectorAll('[data-lang]')];
  const open = (v) => {
    menu.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    if (v) (menu.querySelector('[aria-checked="true"]') || items()[0]).focus();
  };
  btn.addEventListener('click', () => open(menu.hidden));
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-lang]');
    if (!b) return;
    const code = b.dataset.lang;
    try { localStorage.setItem(KEY, code); } catch { /* the choice lasts for this page only */ }
    if (code === lang) { open(false); btn.focus(); return; }
    location.reload();
  });
  document.addEventListener('click', (ev) => { if (!wrap.contains(ev.target)) open(false); });
  wrap.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !menu.hidden) {
      ev.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement);
      list[(i + (ev.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
    }
  });
}
