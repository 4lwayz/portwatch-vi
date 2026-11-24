# PortWatch VI

**Does GTA VI run on PC yet?** A static GitHub Pages site that tracks every serious community effort to recompile, emulate or port the leaked Xbox Series build of GTA VI to PC. All efforts are scored on one ladder, and a scout refreshes the data every 3 hours.

- One headline progress bar shows the closest effort, with the top projects pinned to it.
- A live countdown runs to the missing executable's expected drop.
- A leaderboard card per effort shows its own bar, milestone ladder, groundwork breakdown, what works and what's blocking.
- Further sections cover the watchlist of early projects, a toolkit of asset tools, the scout's inbox of new candidates, and fake-download warnings.

No game files, keys or executables are hosted or linked, ever.

## Deploy on GitHub Pages

1. Create a new GitHub repository and push this folder to its `main` branch.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings → Actions → General** and make sure workflows are allowed.
4. Open **Actions → Scout → Run workflow** to run the first scout. It commits fresh data and deploys the site.

Each deploy also runs `scripts/build-site.mjs`, which turns `data/tracker.json` into pages search engines can read: one page per news story (`news/<id>.html`), a news archive, an RSS feed (`news/feed.xml`) and `sitemap.xml`. It then pings [IndexNow](https://www.indexnow.org/) (Bing, Yandex and others; no account needed) with the URLs that changed since the last deploy. For Google, add the site in Search Console and submit `sitemap.xml`.

From then on, `Scout` runs every 3 hours (00:17, 03:17, 06:17 … UTC) on GitHub's servers, so no computer of yours needs to be on. Any push to `main` redeploys the site through `Deploy site`. To change the frequency, edit the `cron` line in `.github/workflows/scout.yml`. For example, `17 6 * * *` runs it once a day. GitHub can delay scheduled runs by a few minutes when it's busy.

## What the scout does (`scripts/scout.mjs`)

1. **Refreshes** every tracked repo: stars, forks, issues, last push, commits in the last 7 days, and whether it's gone (404, or 451 for a DMCA block). It also hashes each README to notice changes.
2. **Spots claims.** If a README newly says GTA VI boots, reaches the menu or runs at some FPS, the card shows an "unverified claim" banner and the change feed records it.
3. **Discovers** new repos from GitHub and GitLab searches (`scout.queries` in `data/tracker.json`), Hacker News, Bluesky, Mastodon, Lemmy and 4chan, plus Reddit and X when keys are set, by pulling GitHub links out of posts. It also gathers **headlines** from the Google News and Bing News feeds, keeping only stories about the leak, ports, takedowns, scams or official news. And it **watches GitHub's public DMCA log** for new Take-Two or Rockstar notices, flagging any tracked project they name. On 4chan it uses the free read-only API, at one request per second. It opens only /v/ threads that mention GTA VI together with port terms (recomp, emulator, leak, executable, GitHub…), plus /vg/'s /gtag/ and /emugen/ generals. Change the boards with `scout.chan.boards`. Nothing from 4chan is shown on the site except, indirectly, repo names that pass every filter.
4. **Filters out spam** such as clone networks, download lures and "PC installer" repos. Their names are counted under *There is no download*, never linked.
5. **Filters out copies.** Re-uploads of tracked projects are flagged when they reuse a tracked project's name or have a README that is 60% or more identical, renamed copies included. Original fan games and repos without a real README are skipped too. Candidates already waiting are re-checked every run.
6. **Scores substance** from code language, size, technical depth, status tables, tests and commit activity. Repos with real code go to **New candidates**, shown as plain text and not linked until reviewed. Thin or off-topic ones are remembered and skipped.
7. **Writes news** (needs `ANTHROPIC_API_KEY`). Claude searches the web for takedowns, bans, confirmed leaks, legal news, scams and official announcements, then writes up to two short original articles. It runs at most every 11 hours, not on every 3-hourly scout run, to keep costs down. A source is kept only if it came up in Claude's own search. Each article's image is the source's preview image, credited and linked back; it falls back to a generated cover.
8. **Records** a change feed, the day's leader score for the sparkline, and a run summary.

### Optional secrets (Settings → Secrets and variables → Actions)

| Secret | What it enables |
|---|---|
| `ANTHROPIC_API_KEY` | **Claude review.** When a tracked README changes, or a new candidate shows up, Claude (`claude-opus-5-5`) reads the README and recent commits and re-scores the effort. It also promotes or rejects candidates automatically. Guardrails clamp the output: a GTA VI milestone only counts if Claude quotes text that really appears in the repo, and groundwork can rise at most 0.3 per run. Reviews are capped at 12 per run. Each costs very roughly $0.05–0.20, depending on README size. |
| `GEMINI_API_KEY` | **Content translations** (project summaries, news and so on) for every language marked `data: true`, with a **free-tier** Google AI Studio key. ⚠️ Use only a key from a Google Cloud project **without billing**, or translations can be charged. Setup, cost and key safety: [Content translations with a free Gemini key](#content-translations-with-a-free-gemini-key). Takes precedence over `ANTHROPIC_API_KEY` for translations only. |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit search. Reddit blocks anonymous API and RSS access, so Reddit is skipped without these. The API is free for small non-commercial use, but since late 2025 every new app needs Reddit's manual approval. Create a "script" app at reddit.com/prefs/apps, request access, and paste the client ID and secret here once approved. |
| `X_BEARER_TOKEN` | X recent search. This needs a paid X API tier. |

Without any secrets the scout still runs on every keyless source, and new finds wait in *New candidates* for review.

### Content translations with a free Gemini key

Languages marked `data: true` in `assets/js/i18n.js` (Simplified and Traditional Chinese so far) also show the
tracker's content in that language: project summaries, what works and what's blocking, the change log, news,
headlines, the toolkit and the fake-download warnings. `data/i18n/<code>.json` maps each English text to its
translation, and only new or changed text needs translating. With a `GEMINI_API_KEY` secret, each scout run sends
that new text, for every language at once, to Gemini in a single request (none when nothing is new). Without the
secret, nothing is sent and the daily editor fills the gaps (EDITOR.md, step 6b); the page shows English meanwhile.

> [!WARNING]
> **Use a free-tier key only, from a Google Cloud project with no billing account.** On such a project Google
> can't charge anything: when a model's free daily quota is used up, Google refuses further requests (HTTP 429)
> and the translator moves to the next model or waits for the next run. Once billing is enabled on the project,
> it is on the paid tier and every translation request is billed. So don't reuse a key from a project that has
> billing, and don't enable billing on this project later. If billing can't be avoided, set a budget alert in
> Google Cloud Billing; an alert warns you, it doesn't stop spending.

**Limits the translator keeps to.** At most 3 quota-using requests per run, and the scout runs 8 times a day. A
normal run uses one request, or none. The step's log ends with the number used, for example
`Gemini: 1 of at most 3 quota-using requests this run`. Free-tier quotas are small (about 20 requests a day has
been reported for recent models) and are counted per model, so when a model's daily quota runs out, the next one
takes over: the newest Gemini Hydrogen first, then each Flash model from the newest to the oldest, as the API lists them
at run time. A model reporting "high demand" gets one more try after 20 seconds. Translation stops starting new
requests after 12 minutes, so the scout still commits its data.

**Setup**

1. In [Google AI Studio](https://aistudio.google.com/), create an API key in a new project that has no billing
   account. A project just for this site keeps its quota and its risk separate.
2. Recommended: in the Google Cloud console (APIs & Services → Credentials), restrict the key to the
   *Generative Language API*. A leaked key then can't be used for any other Google service.
3. In this repository: **Settings → Secrets and variables → Actions → Secrets → New repository secret**, name
   `GEMINI_API_KEY`. Use a *secret*, never a *variable*: variables are stored and shown in plain text.
4. Optional: a repository *variable* `GEMINI_MODELS` (for example `gemini-4-hydrogen,gemini-3.8-flash`) replaces
   the automatic model order. Only `gemini-…` model ids are accepted. Never put the key there.
5. Run **Actions → Scout → Run workflow** and read the *Translate content (Gemini)* step's log.

**How the key is kept safe**

- The key reaches one workflow step only, *Translate content (Gemini)*, which runs `scripts/translate-data.mjs`.
  That step runs nothing but this repository's code: the translator uses Node's built-in `fetch`, so no npm
  package ever sees the key. The scout step, which reads untrusted READMEs, posts and news, gets only a yes/no
  flag (`GEMINI_TRANSLATES`) saying that the key exists.
- It goes only to `generativelanguage.googleapis.com`, in the `x-goog-api-key` request header, never in a URL.
  The host is fixed in the code; `GEMINI_MODELS` can only name a model.
- It's never logged. Error text from Google passes through a filter that removes keys and project numbers before
  it reaches the log, since the Actions logs of a public repository are public. GitHub also masks secrets in logs.
- The workflows that see secrets run on a schedule, by hand, or on pushes to `main`, never on pull requests, so
  forks and pull requests can't read the key. Keep it that way: don't add `pull_request_target` to a workflow that
  uses `GEMINI_API_KEY`, and don't pass the key to any other step.
- Only public site text is sent to Gemini. On the free tier Google may use prompts and replies to improve its
  products. If you're in the EEA, the UK or Switzerland, check Google's Gemini API terms for the free tier first.
- If the key ever leaks: delete it in AI Studio or the Cloud console at once, create a new one, and update the
  secret.

**Running it on your own computer** (the daily editor, or a first full translation). Keep the key in the current
terminal session only, never in a file in the repository, and remove it when done:

```powershell
$env:GEMINI_API_KEY = Read-Host -MaskInput 'Gemini API key'   # PowerShell 7; the input isn't shown
node scripts/translate-data.mjs
Remove-Item Env:GEMINI_API_KEY
```

```sh
read -rs -p 'Gemini API key: ' GEMINI_API_KEY && export GEMINI_API_KEY   # bash; the input isn't shown
node scripts/translate-data.mjs
unset GEMINI_API_KEY
```

### Daily Claude editor (alternative to an API key)

Instead of `ANTHROPIC_API_KEY`, a scheduled Claude session on the maintainer's PC can run once a day, following [EDITOR.md](EDITOR.md). It re-scores changed projects, reviews candidates, verifies leads, keeps the countdown accurate and writes news, then commits `data/tracker.json`. It also reads 4chan's /v/, /vg/ and /g/ in full through `tools/chan-scan.ps1`, which gathers GTA VI port discussion from live threads and the public archives into a local digest (`.chan/`, never committed). The scout only picks GitHub links out of those threads. It uses the maintainer's Claude plan and needs no separate billing. It runs while the Claude desktop app is open; a missed run happens on the next launch.

## Editing the data by hand

Everything lives in `data/tracker.json`:

- `efforts[]`: each effort has a `tier` (`tracked` puts it in the race, `watchlist` lists it below). Each also carries `groundwork` (four 0–1 values), `gta` (`loads`/`boots`/`menu`/`ingame` are 0, 0.5 or 1, plus `fps` and `stability`), and short `highlights` and `blockers`.
- `exe`: drives the countdown. If the release time is announced, set `expectedAt` (ISO time) and `timeAnnounced: true`. When it drops, set `status: "released"` and `releasedAt`, and the countdown turns into a "time since release" clock.
- `candidates[]`: move one into `efforts` to promote it, or into `ignored` to dismiss it.
- `site.heroImage` / `site.heroCredit`: hero artwork (see below).

Translations of this text for the homepage live in `data/i18n/` (see [assets/i18n/README.md](assets/i18n/README.md)).

Scoring is in `assets/js/scoring.js`, shared by the site and the scout. Groundwork fills 0–25%. After that, milestones sit at Exe runs 25, First frame 40, Main menu 55, In-game 70, 30 FPS 85 and Stable 100.

## Hero artwork

The hero shows an original sunset illustration until you add a photo. To use official GTA VI artwork, download a wallpaper or artwork image from Rockstar's official GTA VI site and save it as `assets/img/hero.jpg`, ideally about 2400px wide. The site finds it automatically and shows the credit line from `site.heroCredit`.

## Local preview

Any static server works. On Windows without Node or Python:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
```

Then open http://localhost:8080. To try the scout locally with Node 20+, run `node scripts/scout.mjs --dry-run`. Setting `GITHUB_TOKEN` avoids the 60-requests-per-hour anonymous limit.

## Disclaimer

Fan-made and unofficial. Not affiliated with Rockstar Games, Take-Two or Microsoft. Scores are editorial estimates from public READMEs, commits and issues, and self-reported claims are labelled. Maintainers who think their project is mis-scored can open an issue with evidence.
