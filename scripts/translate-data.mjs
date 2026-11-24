#!/usr/bin/env node
// Keeps data/i18n/<code>.json in step with data/tracker.json for every language marked `data: true` in
// assets/js/i18n.js: drops texts the homepage no longer shows and adds new ones with an empty value.
// With ANTHROPIC_API_KEY set, Claude fills the empty values. Without it, fill them in by hand (EDITOR.md).
//
//   node scripts/translate-data.mjs           # sync (and translate, when ANTHROPIC_API_KEY is set)
//   node scripts/translate-data.mjs --check   # report only, write nothing
import { readFile } from 'node:fs/promises';
import { syncTranslations, makeTranslator } from './lib/translate.mjs';

const data = JSON.parse(await readFile(new URL('../data/tracker.json', import.meta.url), 'utf8'));
const check = process.argv.includes('--check');
const apiKey = process.env.ANTHROPIC_API_KEY;
const translate = apiKey && !check ? await makeTranslator({ apiKey }) : null;

for (const r of await syncTranslations({ data, translate, write: !check })) {
  console.log(`${r.file}: ${r.total} texts, ${r.missing.length} empty`);
}
