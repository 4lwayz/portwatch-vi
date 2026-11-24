#!/usr/bin/env node
// Keeps data/i18n/<code>.json in step with data/tracker.json for every language marked `data: true` in
// assets/js/i18n.js: drops texts the homepage no longer shows and adds new ones with an empty value.
// With GEMINI_API_KEY set (Google AI Studio, free tier), Gemini fills the empty values; with ANTHROPIC_API_KEY,
// Claude does. Without either, fill them in by hand (EDITOR.md).
// Use only a free-tier Gemini key from a project without billing, and keep it in the environment of this one
// command, never in a file: README.md, "Content translations with a free Gemini key".
//
//   node scripts/translate-data.mjs           # sync (and translate, when a key is set)
//   node scripts/translate-data.mjs --check   # report only, write nothing
import { readFile } from 'node:fs/promises';
import { syncTranslations, translatorFromEnv } from './lib/translate.mjs';

const data = JSON.parse(await readFile(new URL('../data/tracker.json', import.meta.url), 'utf8'));
const check = process.argv.includes('--check');
const translate = check ? null : await translatorFromEnv(process.env);

for (const r of await syncTranslations({ data, translate, write: !check })) {
  console.log(`${r.file}: ${r.total} texts, ${r.missing.length} empty`);
}
