# Site translations

The homepage and the board load their interface text from these files. `en.json` is the source and the
fallback: any key missing from another language shows in English.

- **Add a language:** copy `pt-BR.json`, translate the values (never the keys), save it as `<code>.json`
  (a BCP 47 code such as `fr` or `de`), then add it to `LANGS` and to `pickLang()` in `assets/js/i18n.js`.
- **Placeholders** such as `{n}`, `{ago}` or `{name}` are filled in by the page. Keep them as they are.
- **`_one` / `_other`** keys are the singular and plural forms of a count.
- **`ms.*`, `gw.*` and `stab.*`** translate the milestone, groundwork and stability names. Their English
  lives in `assets/js/scoring.js`, so `en.json` doesn't repeat them.
- **Text only:** translations are inserted as plain text, so HTML in a value shows up literally.
- **`auto.*`** (optional) translate the sentences the scout builds from fixed templates, such as
  “Scout spotted owner/repo (possible effort, substance 91).” The patterns are `AUTO` in `assets/js/i18n.js`;
  `{1}`, `{2}`… are the parts that vary, in order. A language without them shows these sentences in English.
- **Article pages** under `news/` stay in English.

## Content translations

Project summaries, news and other text from `data/tracker.json` are in English. A language marked
`data: true` in `LANGS` (Simplified Chinese so far) also loads `data/i18n/<code>.json`, which maps each English
text the homepage shows to its translation. An empty value means it isn't translated yet; the page shows the
English until it's filled in.

- `node scripts/translate-data.mjs` keeps those files in step with `data/tracker.json`: it drops texts the page
  no longer shows and adds new ones with an empty value. With `ANTHROPIC_API_KEY` set, Claude fills the empty
  values (the scout does this on every run when the key is set). Without it, the daily editor fills them in
  (see EDITOR.md).
- To translate by hand, fill in the empty values and never change a key. Translate faithfully: keep every
  number, name, hedge (“self-reported”, “unverified”) and warning, and reuse this file's terms (milestone names
  and so on). Add no links: a value with a link or domain its English doesn't have is emptied on the next run.
- To add content translations for another language, add `data: true` to it in `LANGS` and run the script.

Contributions are welcome through a pull request.
