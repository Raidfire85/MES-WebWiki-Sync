# MES WebWiki Sync — contributor handoff

This package adds **automatic wiki sync** to the official [MeridiusIX WebWiki](https://github.com/MeridiusIX/Modular-Encounters-Systems/tree/master/WebWiki). It preserves existing Meridius prose and only updates marked sync sections plus missing profile pages.

## What you get

| Piece | Purpose |
|-------|---------|
| `publisher/` | Standalone Node tool — scans MES C# and updates `docs/*.md` |
| `handoff/github-workflow/` | Optional GitHub Action for sync + `gh-pages` deploy |
| `local-test/` | Sandbox (created by setup script) — **test here before touching production** |
| Existing `docs/`, `mkdocs.yml`, `style.css` | Unchanged Meridius content — sync tool only appends sync blocks |

## Optional: sandbox test (tool maintainers)

If you cloned **this** handoff repo (not the MES repo), you can run an offline sandbox before copying `publisher/` into Meridius:

```powershell
git clone <this-repo-url>
cd mes-webwiki-sync
npm install
npm run setup-local-test    # clones Meridius WebWiki + MES source into local-test/
npm run test-local          # dry-run, write, mkdocs build
```

Preview:

```powershell
npm run build-html          # builds local-test/sandbox/site/
npm run serve-html          # http://127.0.0.1:8000
```

The sandbox is a **copy** of Meridius WebWiki — changes do not affect GitHub. **Meridius contributors can skip this** and test on a fork using the paths in [README.md](./README.md#quick-start-meridius-fork).

## How a sync run works

Orchestration lives in `publisher/src/publisher.ts`. A single run performs these steps in order:

1. **MES source** — Local folder (`--mes-source` / `MES_SOURCE_PATH`) or shallow GitHub download of `Data/Scripts/ModularEncountersSystems`.
2. **Tag descriptions** — `publisher/TagDescriptions.json` (or `--tag-descriptions` to override).
3. **`index.md` home** — Replace Meridius `hello world` placeholder inside `MES-WEBWIKI-HOME-SYNC` markers (skipped if you already wrote a custom home page).
4. **`style.css`** — Inject footer-hide and “What's new” styles inside `MES-WEBWIKI-STYLE-SYNC` markers.
5. **Mapped modding pages** — For each `WEBWIKI_PAGE_MAP` entry (`Action.md`, `Trigger.md`, …), parse tags from the linked `*Profile.cs` and append only **new** rows inside `MES-WEBWIKI-SOURCE-SYNC` on that page.
6. **Profile pages** — `discoverWebWikiProfiles()` finds `*Profile.cs` files not already handled by the page map. Creates new `.md` files or updates existing ones; migrates `*-Profile.md` → Meridius filenames (e.g. `Block-Replacement.md`) when applicable.
7. **`mkdocs.yml`** — When `--mkdocs` is passed: insert marked nav blocks for new profiles, normalize nav paths, and update the marked validation section.
8. **What's new** — Record run highlights in `docs/mes-wiki-updates.json` and refresh the HTML embed in `index.md` (`MES-WEBWIKI-UPDATES-SYNC`).

Dry-run (default) reports what would be created, updated, or skipped — without writing files.

## For Meridius contributors: merge into MES repo

### 1. Copy files into the MES repo

Merge `publisher/` into `Modular-Encounters-Systems/WebWiki/`:

```
WebWiki/
  docs/              (keep existing — do not delete)
  mkdocs.yml         (keep existing)
  readme.txt         (keep existing)
  publisher/         (add from this package — includes TagDescriptions.json)
```

Copy the workflow to repo root:

```
.github/workflows/webwiki-sync-deploy.yml   (from handoff/github-workflow/)
```

The `publisher/` folder is self-contained: tag parsing (`src/sync/`), tag descriptions (`TagDescriptions.json`), and the CLI. Meridius CI only needs `npm install` + `tsc` in `WebWiki/publisher`.

### 2. Test on a fork (recommended)

From the **MES repo root** on your fork:

```powershell
cd WebWiki/publisher
npm install --no-save
npx tsc -p tsconfig.json

# Dry-run first
node publish.cjs --docs ../docs --mkdocs ../mkdocs.yml `
  --mes-source ../../Data/Scripts/ModularEncountersSystems

# Apply when happy
node publish.cjs --docs ../docs --mkdocs ../mkdocs.yml `
  --mes-source ../../Data/Scripts/ModularEncountersSystems `
  --write

# Preview
cd ..
pip install mkdocs
mkdocs serve
```

### 3. Enable GitHub Actions (optional)

After merging the workflow:

- **Settings → Actions → General** — allow workflows
- **Settings → Pages** — deploy from `gh-pages` branch (same as today)
- Push to `master` when `Data/Scripts/ModularEncountersSystems/**` changes, or run **workflow_dispatch** manually

The workflow template builds with `tsc`, passes `--tag-descriptions`, and commits `docs/`, `mkdocs.yml`, and `docs/style.css` when changed. The existing `pages-build-deployment` action will still run when `gh-pages` updates.

### 4. What the sync tool changes

- **Existing pages**: appends/replaces only the block between:
  - `<!-- MES-WEBWIKI-SOURCE-SYNC-START -->`
  - `<!-- MES-WEBWIKI-SOURCE-SYNC-END -->`
- **New profiles** (e.g. Shipyard, Store): creates new `.md` files and updates `mkdocs.yml` nav under **Modding** (Economy & Station Blocks, Manipulation, Player profiles) or **Modder Resources**, using marked sync blocks
- **mkdocs.yml** (when `--mkdocs` is passed):
  - Appends `.md` to bare nav slugs when the matching file exists in `docs/`
  - Updates the marked `validation:` section between sync markers
- **Home page (`index.md`)**: replaces Meridius placeholder (`hello world`) with a proper intro adapted from the legacy wiki (marked `MES-WEBWIKI-HOME-SYNC` block). Skipped if you've written a custom home page without the placeholder.
- **What's new (`index.md`)**: injects a reader-facing changelog inside `MES-WEBWIKI-UPDATES-SYNC` markers — grouped highlights, linked page names, friendly source label (`MES master branch`, etc.). History stored in `docs/mes-wiki-updates.json` (rolling, last 8 runs).
- **style.css**: hides MkDocs footer Previous/Next buttons to match the [live site](https://meridiusix.github.io/Modular-Encounters-Systems/) (newer MkDocs adds them; Meridius's deployed build does not show them).

### 5. Extending the sync tool

Common maintenance tasks when MES adds new content:

#### New tags on an existing page (Action, Trigger, Spawn, …)

1. Ensure the page is in `EXTENSION_HTML_TO_WEBWIKI_MD` / `WEBWIKI_PAGE_MAP` in `publisher/src/constants.ts` (maps `.md` → C# profile via vendored `PAGE_MAP`).
2. Optionally add reader intro copy in `publisher/src/syncSectionCopy.ts` (`PAGE_SUPPLEMENT_COPY`).
3. Re-run sync — only missing tags are appended inside the sync block.

#### New profile type (new `SomethingProfile.cs`)

1. **Nav placement** — Add or adjust a rule in `publisher/src/profilePlacementInference.ts`:
   - `MERIDIUS_EXISTING_NAV` — profile already has a Meridius sidebar leaf; sync tool fills that page (`BlockReplacementProfile.cs` → Block Replacement).
   - `CATEGORY_RULES` — regex on filename/header picks Modding subgroup (economy, manipulation, player, …).
   - `WEBWIKI_PROFILE_PLACEMENT_OVERRIDES` — one-off nav title or group override.
   - Fallback: **Modding → Additional Profiles (MES Source Sync)**.
2. **Filename** — `getProfileMdFile()` in `profilePlacements.ts` picks `Block-Replacement.md` vs `Shipyard-Profile.md` style names.
3. **Blurb** — Known profiles: `NEW_PROFILE_PAGES` in vendored `sync/constants.ts`. Others get a generic intro from `profileDiscovery.ts`.

#### Meridius page exists but has no sync block yet

Add `<!-- MES-WEBWIKI-SOURCE-SYNC-START -->` / `END` to the page (or let the sync tool create a new file). For pages mapped in `WEBWIKI_MERIDIUS_PROFILE_CS`, the sync tool updates the existing Meridius `.md` file in place.

#### Per-page intro wording

Edit `publisher/src/syncSectionCopy.ts` — `PAGE_SUPPLEMENT_COPY` for tag supplements, `buildSyncSectionIntro()` for new profile pages.

### 6. Sync-managed JSON files

| File | Written by sync tool? | Purpose |
|------|----------------------|---------|
| `docs/mes-wiki-updates.json` | Yes | Changelog history (`version: 2`, `runs[]` with `highlights` and link segments). Drives homepage “What's new”. Safe to delete to reset history. |
| `docs/discovered-profiles.json` | No (optional input) | If present, profiles listed here stay in the discovery set even when heuristics would skip them. Useful for hand-maintained edge cases. |

### 7. Rollback

All sync tool changes are in git. Revert the commit or delete sync blocks from affected `.md` files.

## Maintenance (tool maintainers)

When improving tag parsing or descriptions, edit files under `publisher/` directly, then re-test:

```powershell
npm run build
npm run test-local
```

Copy the updated `publisher/` folder into the MES repo when ready.

## Contact

Built by Raidfire. Open an issue on this repo for questions.
