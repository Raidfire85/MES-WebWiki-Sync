# MES WebWiki Sync

Standalone sync tool for the official [MeridiusIX WebWiki](https://github.com/MeridiusIX/Modular-Encounters-Systems/tree/master/WebWiki). Everything needed to run a sync ships in `publisher/` — no other repos are required to **run** the CLI.

**Used in two places:**

1. **[MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki)** — community mirror that syncs and deploys automatically (weekly and on push).
2. **MeridiusIX/MES** — optional merge of `publisher/` into upstream `WebWiki/` for official-repo contributors ([HANDOFF.md](./HANDOFF.md)).

The CLI **dry-runs by default** (report only). Pass `--write` to apply file changes. Meridius prose **outside** sync markers is never edited.

## Quick start (Meridius fork)

After copying `publisher/` into the MES repo (`WebWiki/publisher/`), run these commands from **`WebWiki/publisher/`**:

```powershell
npm install --no-save
npx tsc -p tsconfig.json

# Dry-run (no file changes)
node publish.cjs `
  --docs ../docs `
  --mkdocs ../mkdocs.yml `
  --mes-source ../../Data/Scripts/ModularEncountersSystems

# Apply after reviewing the dry-run report
node publish.cjs `
  --docs ../docs `
  --mkdocs ../mkdocs.yml `
  --mes-source ../../Data/Scripts/ModularEncountersSystems `
  --write

# Preview (from WebWiki/)
cd ..
pip install mkdocs
mkdocs serve
```

Open http://127.0.0.1:8000 and review the site before opening a PR.

See [HANDOFF.md](./HANDOFF.md) for the full merge checklist and GitHub Actions setup.

## Optional: sandbox in this repo

Tool maintainers can clone this repo and run an isolated copy of the Meridius WebWiki under `local-test/` (not required for the MES merge):

```powershell
git clone https://github.com/Raidfire85/MES-WebWiki-Sync.git
cd MES-WebWiki-Sync
npm install
npm run setup-local-test
npm run test-local
npm run serve-html    # http://127.0.0.1:8000
```

Preview output is under `local-test/sandbox/site/`. Use a local server for navigation — MkDocs folder links (`Encounter-Guide/`) do not work via `file://`.

`npm run test-local` and `npm run sync-local` run `npm run build` automatically. If you call `publish.cjs` directly, run `npm run build` first so `publisher/out/` is up to date.

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run vendor-sync` | Refresh `publisher/src/sync/` from upstream sources (tool development only) |
| `npm run build` | `vendor-sync` + TypeScript compile to `publisher/out/` |
| `npm run publish` | Build, then run `publisher/publish.cjs` (pass CLI args after `--`) |
| `npm run setup-local-test` | Clone Meridius WebWiki + MES C# source into `local-test/` |
| `npm run test-local` | Dry-run → write → `mkdocs build` against the sandbox |
| `npm run sync-local` | Write-only publish to `local-test/sandbox/` |
| `npm run build-html` | Sync sandbox + build static site to `local-test/sandbox/site/` |
| `npm run serve-html` | Live MkDocs preview at http://127.0.0.1:8000 |

## How a sync run works

Each run scans MES C# under `ModularEncountersSystems` and updates only **marked** regions in the WebWiki tree.

1. **Resolve MES source** — `--mes-source` / `MES_SOURCE_PATH`, or download `Data/Scripts/ModularEncountersSystems` from MeridiusIX GitHub when omitted.
2. **Load tag descriptions** — `publisher/TagDescriptions.json` (or `--tag-descriptions` to override).
3. **Home + style** — Patch `index.md` intro and `style.css` inside their sync markers.
4. **Existing modding pages** — For each entry in `WEBWIKI_PAGE_MAP` (`Action.md`, `Trigger.md`, …), append only **missing** tags into the page sync block.
5. **Profile pages** — Discover `*Profile.cs` files, create or update `.md` pages, and migrate legacy `*-Profile.md` names when a Meridius nav slot exists.
6. **mkdocs.yml** — When `--mkdocs` is passed, add profile nav entries under Modding / Modder Resources (marked nav blocks), normalize nav paths, and update the marked validation section.
7. **External pages** — When `--mkdocs` is passed, fetch and localize external wiki links (gist/GitHub wiki content), patch cross-references, and update nav where needed.
8. **What's new** — Update `docs/mes-wiki-updates.json` (always refresh **Last synced**; append a changelog entry only when tags, profiles, or navigation change) and refresh the homepage embed in `index.md`.
9. **Changelog log** — Append a detailed entry to repo-root `LOG.md` (pages, tags, profiles, nav, skipped, errors) on every sync run.

## Profile and tag placement

On every sync run, the tool decides where new content belongs:

- **Tags on existing profile types** (Action, Trigger, Spawn, etc.) stay on their current **Modding** pages via `WEBWIKI_PAGE_MAP` — only missing tags are appended in the sync section.
- **New profile pages** get nav placement from `publisher/src/profilePlacementInference.ts`:
  - Meridius nav slots (e.g. Block Replacement under Manipulation) are filled in place
  - Economy/station blocks → **Modding → Economy & Station Blocks**
  - Spawn/manipulation/prefab tags → **Modding → Spawning → Manipulation**
  - Player/suit profiles → after **Player Conditions**
  - Faction/cosmetic reference → **Modder Resources**
  - Unknown future profiles → **Modding → Additional Profiles (MES Source Sync)** until a rule is added

You can override a specific profile with `WEBWIKI_PROFILE_PLACEMENT_OVERRIDES` in the same file.

Profiles that already have a Meridius nav leaf (Block Replacement, Loot, Dereliction, …) are listed in `WEBWIKI_MERIDIUS_PROFILE_CS` / `MERIDIUS_EXISTING_NAV` — the sync tool updates that page instead of adding a duplicate nav entry.

For step-by-step extension tasks (new profile type, new mapped page, intro copy), see **Extending the sync tool** in [HANDOFF.md](./HANDOFF.md).

## CLI reference

```text
node publisher/publish.cjs --docs <path/to/WebWiki/docs> [options]
```

| Option | Description |
|--------|-------------|
| `--docs <path>` | **Required.** Target `WebWiki/docs` folder |
| `--mkdocs <path>` | `mkdocs.yml` path (enables nav updates, external page localization, and mkdocs.yml sync markers) |
| `--mes-source <path>` | Local `ModularEncountersSystems` folder (must contain `ProfileManager.cs`) |
| `--tag-descriptions <path>` | `TagDescriptions.json` for human-written tag blurbs |
| `--write` | Apply file changes (default: dry-run report only) |
| `--help` | Show usage |

Environment: `MES_SOURCE_PATH` is used when `--mes-source` is omitted (before GitHub download).

## Sync markers

The sync tool only replaces content between these markers:

| Marker pair | File | Purpose |
|-------------|------|---------|
| `MES-WEBWIKI-SOURCE-SYNC-START/END` | `docs/*.md` | Tag tables on modding + profile pages |
| `MES-WEBWIKI-HOME-SYNC-START/END` | `docs/index.md` | Home intro (replaces Meridius placeholder) |
| `MES-WEBWIKI-UPDATES-SYNC-START/END` | `docs/index.md` | “What's new” + Last synced embed |
| `MES-WEBWIKI-STYLE-SYNC-START/END` | `docs/style.css` | Footer prev/next hide + update styles |
| `MES-WEBWIKI-SOURCE-SYNC-NAV-START/END` | `mkdocs.yml` | Auto-added profile nav entries |
| `MES-WEBWIKI-SOURCE-SYNC-VALIDATION-START/END` | `mkdocs.yml` | MkDocs validation settings (marked block) |

Defined in `publisher/src/constants.ts`. To roll back sync output, revert the git commit or manually restore the content between sync markers.

## Sync-managed files

| File | Managed by | Notes |
|------|------------|-------|
| `docs/mes-wiki-updates.json` | `mkDocsUpdates.ts` | `lastSynced` (replaced every run) + rolling changelog runs for real content changes |
| `LOG.md` (repo root) | `wikiSyncLog.ts` | Full per-run changelog — tags added/refreshed by name, profile + file, nav entries, sections updated (newest first) |
| `docs/discovered-profiles.json` | Optional input | If present, keeps previously discovered profiles in the scan set; not written by default |

## Layout

```
MES-WebWiki-Sync/
  HANDOFF.md              Contributor guide for Meridius merge
  LICENSE                 MIT (this tool)
  package.json
  publisher/
    publish.cjs           CLI entry
    TagDescriptions.json  Human-written tag blurbs (bundled)
    package.json          Build deps for tsc
    src/
      publisher.ts        Main orchestrator
      constants.ts        Page map, sync markers, Meridius profile filenames
      profilePlacementInference.ts   Nav group rules + overrides
      profilePlacements.ts           Resolved placement + managed page detection
      profileDiscovery.ts            Which profiles become wiki pages
      externalPageLocalization.ts    External gist/wiki page fetch + link rewrites
      mkDocsContent.ts / mkDocsTables.ts   Markdown + tag tables
      mkDocsYaml.ts       mkdocs.yml nav and settings edits
      mkDocsHome.ts / mkDocsUpdates.ts / mkDocsStyle.ts   Home, changelog, CSS
      syncSectionCopy.ts  Per-page intro text for sync sections
      sync/               Tag/profile parsing (committed with the package)
    out/                  Compiled JS (gitignored; run npm run build)
  handoff/                Workflow template for MES repo
  scripts/
    setup-local-test.ps1  Clone Meridius wiki into local-test/sandbox/
    test-local.ps1        End-to-end test
    build-html.ps1        Build static site preview
    publish-local-sandbox.ps1  Write-only sandbox sync
    vendor-sync.mjs       Refresh sync/ (tool development only)
  local-test/             Created by setup (gitignored)
```

## License and attribution

- **This sync tool** (`publisher/`, scripts, and related code) is licensed under the [MIT License](./LICENSE) (Copyright Raidfire85, 2026).
- **Output written into a WebWiki tree** (markdown pages, nav entries, synced tag tables) may include or merge material from MeridiusIX's WebWiki and MES C# source. That documentation remains attributed to [MeridiusIX / Modular Encounters Systems](https://github.com/MeridiusIX/Modular-Encounters-Systems) and its contributors — this LICENSE covers the tool, not a claim of ownership over Meridius wiki prose.
- For the deployed community mirror that uses this tool, see [MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki).

This project follows the same licensing approach as [MES-Reference-Library](https://github.com/Raidfire85/MES-Reference-Library).

## GitHub Actions (Meridius production)

This standalone repo does **not** deploy a public wiki by itself. Automated sync on GitHub runs in **[MES-WebWiki](https://github.com/Raidfire85/MES-WebWiki)**.

To enable the same workflow **upstream**, merge `publisher/` and `handoff/github-workflow/webwiki-sync-deploy.yml` into [MeridiusIX/Modular-Encounters-Systems](https://github.com/MeridiusIX/Modular-Encounters-Systems) (`WebWiki/` + `.github/workflows/`). That workflow then:

1. Builds `WebWiki/publisher` with `npm install` + `tsc`
2. Syncs docs from in-repo `Data/Scripts/ModularEncountersSystems` using bundled `TagDescriptions.json`
3. Commits wiki changes and deploys MkDocs to `gh-pages`

The workflow triggers on push to `master` when MES scripts or `WebWiki/publisher/**` change, or via **workflow_dispatch**.
