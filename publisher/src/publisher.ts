import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals, getTagMetaFromSource } from './syncBridge';
import { buildPageTagMeta, findProfileFile } from './sync/tagMetaParser';
import type { NewProfilePageConfig, WebWikiPublishOptions, WebWikiPublishResult, WikiSyncChangeRecord } from './types';
import {
  buildNewProfileMarkdownPage,
  getSupplementTagsForMarkdown,
  injectProfileExampleSection,
  injectWebWikiSyncSection,
  pageTitleFromMdFile,
  updateProfilePageBlurb,
} from './mkDocsContent';
import { buildMkDocsTagTableFromMeta } from './mkDocsTables';
import {
  WEBWIKI_PAGE_MAP,
  extensionHtmlToWebWikiMd,
} from './constants';
import { discoverWebWikiProfiles } from './profileDiscovery';
import { inferProfileBlurbFromSource } from './profileBlurbGenerator';
import { buildProfileExampleSectionFromSource } from './profileExampleGenerator';
import {
  buildTagDescriptionsFromMesSource,
  mergeTagDescriptionMaps,
} from './tagDescriptionGenerator';
import { updateMkDocsFile } from './mkDocsYaml';
import { ensureHomePage } from './mkDocsHome';
import { ensureWebWikiStylePatches } from './mkDocsStyle';
import { applyHomeUpdates, announceProfilePagesInWhatsNew, ECONOMY_STATION_BLOCK_PROFILES, MODDING_SUIT_UPGRADE_PROFILES, resetWhatsNewHistory } from './mkDocsUpdates';
import { applySyncLog } from './wikiSyncLog';
import {
  filterNovelTags,
  isProfilePageAnnounced,
  loadSyncRegistry,
  markNavigationAnnounced,
  saveSyncRegistry,
  shouldAnnounceNavigation,
  updateRegistryAfterWrite,
} from './wikiSyncRegistry';
import {
  getProfileMdFile,
  getProfilePlacement,
} from './profilePlacements';
import { localizeExternalPages } from './externalPageLocalization';
import { analyzePageContentChanges } from './wikiChangeDetails';

interface TagDescriptionEntry {
  Tag: string;
  Description: string;
}

export async function publishMesWebWiki(
  options: WebWikiPublishOptions
): Promise<WebWikiPublishResult> {
  const result: WebWikiPublishResult = {
    updated: [],
    created: [],
    skipped: [],
    navUpdated: false,
    errors: [],
    sourceLabel: options.sourceLabel,
    changeLog: [],
  };

  const fileTagDescriptions = await loadTagDescriptions(options.tagDescriptionsPath);
  const sourceTagDescriptions = await buildTagDescriptionsFromMesSource(options.mesSourcePath);
  const tagDescriptions = mergeTagDescriptionMaps(sourceTagDescriptions, fileTagDescriptions);
  await fs.mkdir(options.docsDir, { recursive: true });

  const syncRegistry = await loadSyncRegistry(options.docsDir);

  if (options.resetWhatsNew) {
    try {
      const resetResult = await resetWhatsNewHistory(options.docsDir, options.write);
      if (resetResult.changed) {
        result.updated.push('index.md (What\'s new history reset)');
        logChange(result, {
          kind: 'maintenance',
          file: 'index.md',
          detail: 'Homepage What\'s new history cleared (mes-wiki-updates.json)',
        });
      }
    } catch (error) {
      result.errors.push(`What's new reset: ${formatError(error)}`);
      logChange(result, { kind: 'error', file: 'index.md', detail: formatError(error) });
    }
  }

  const HINT_SUPPLEMENTAL_FILES = [
    'Enums.cs',
    'GridEntity.cs',
    'EntityEvaluator.cs',
    'AutoPilotSystem.cs',
    'CommandHelper.cs',
    'SpawnRequest.cs',
    'WaypointProfile.cs',
    'TriggerProfile.cs',
    'EventConditions.cs',
  ];

  async function loadHintSource(profileCs: string | null | undefined): Promise<string | undefined> {
    if (!profileCs) {
      return undefined;
    }

    const parts: string[] = [];
    const profilePath = await findProfileFile(options.mesSourcePath, profileCs);
    if (profilePath) {
      parts.push(await fs.readFile(profilePath, 'utf8'));
    }

    for (const fileName of HINT_SUPPLEMENTAL_FILES) {
      const filePath = await findProfileFile(options.mesSourcePath, fileName);
      if (filePath) {
        parts.push(await fs.readFile(filePath, 'utf8'));
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  try {
    const homeResult = await ensureHomePage(options.docsDir, options.write);
    if (homeResult.changed) {
      result.updated.push(`index.md (home intro ${homeResult.action})`);
      logChange(result, {
        kind: 'maintenance',
        file: 'index.md',
        detail: `Home intro ${homeResult.action}`,
      });
    } else if (homeResult.action === 'skipped') {
      result.skipped.push('index.md (custom home page preserved)');
      logChange(result, { kind: 'skipped', file: 'index.md', detail: 'Custom home page preserved' });
    }
  } catch (error) {
    result.errors.push(`index.md: ${formatError(error)}`);
    logChange(result, { kind: 'error', file: 'index.md', detail: formatError(error) });
  }

  try {
    const styleResult = await ensureWebWikiStylePatches(options.docsDir, options.write);
    if (styleResult.changed) {
      result.updated.push('style.css (hide footer prev/next to match live site)');
      logChange(result, {
        kind: 'maintenance',
        file: 'docs/style.css',
        detail: 'Style sync block updated',
      });
    }
  } catch (error) {
    result.errors.push(`style.css: ${formatError(error)}`);
    logChange(result, { kind: 'error', file: 'docs/style.css', detail: formatError(error) });
  }

  for (const [mdFile, cfg] of Object.entries(WEBWIKI_PAGE_MAP)) {
    try {
      const mdPath = path.join(options.docsDir, mdFile);
      let existing = '';
      try {
        existing = await fs.readFile(mdPath, 'utf8');
      } catch {
        result.skipped.push(`${mdFile} (page not present in WebWiki/docs)`);
        logChange(result, { kind: 'skipped', file: mdFile, detail: 'Page not present in WebWiki/docs' });
        continue;
      }

      const pageMeta = await buildPageTagMeta(
        options.mesSourcePath,
        cfg.profile,
        cfg.extraTags
      );
      const sourceTags: string[] = [...(cfg.extraTags ?? []), ...Object.keys(pageMeta)];

      const uniqueSourceTags = [...new Set(sourceTags)];
      const syncManagedTags = getSupplementTagsForMarkdown(existing, uniqueSourceTags);

      let renderedRows = '';
      if (syncManagedTags.length > 0) {
        const meta = pageMeta;
        const profileSource = await loadHintSource(cfg.profile);
        renderedRows = syncManagedTags
          .map((tag) =>
            buildMkDocsTagTableFromMeta(tag, meta, tagDescriptions, cfg.style, profileSource)
          )
          .join('\n');
      }

      const next = injectWebWikiSyncSection(existing, renderedRows, {
        pageTitle: pageTitleFromMdFile(mdFile),
        mdFile,
        mode: 'supplement',
      });

      if (contentEquals(existing, next)) {
        result.skipped.push(`${mdFile} (already up to date)`);
        logChange(result, { kind: 'skipped', file: mdFile });
        continue;
      }

      const analysis = analyzePageContentChanges(existing, next, uniqueSourceTags);
      const novelTags = filterNovelTags(syncRegistry, mdFile, analysis.tagsAdded);

      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
        updateRegistryAfterWrite(syncRegistry, mdFile, next, {
          kind: 'supplement',
          profileCs: cfg.profile ?? undefined,
          announcedTags: novelTags,
        });
      }

      if (novelTags.length === 0 && analysis.tagsRefreshed.length === 0) {
        continue;
      }

      result.updated.push(
        `${mdFile} (${novelTags.length > 0 ? `+${novelTags.length}` : `${analysis.tagsRefreshed.length} refreshed`} tags)`
      );
      logChange(result, {
        kind: 'tag-update',
        file: mdFile,
        profileCs: cfg.profile ?? undefined,
        profileTitle: pageTitleFromMdFile(mdFile),
        tagsAdded: novelTags,
        tagsRemoved: analysis.tagsRemoved,
        tagsRefreshed: analysis.tagsRefreshed,
      });
    } catch (error) {
      result.errors.push(`${mdFile}: ${formatError(error)}`);
      logChange(result, { kind: 'error', file: mdFile, detail: formatError(error) });
    }
  }

  const profiles = await discoverWebWikiProfiles(options.mesSourcePath, options.docsDir);
  const profileNavEntries: Array<{
    profileCs: string;
    title: string;
    mdFile: string;
    placement: ReturnType<typeof getProfilePlacement>;
  }> = [];

  for (const profile of profiles) {
    const mdFile = getProfileMdFile(profile.profileCs, profile.htmlFile, profile.header);
    const mdPath = path.join(options.docsDir, mdFile);
    const legacyMdFile = extensionHtmlToWebWikiMd(profile.htmlFile);
    const legacyPath =
      legacyMdFile !== mdFile ? path.join(options.docsDir, legacyMdFile) : undefined;

    try {
      const meta = await getTagMetaFromSource(options.mesSourcePath, profile.profileCs);
      const profileSource = await loadHintSource(profile.profileCs);
      const style = profileConfigStyle(profile.profileCs);
      const tableRows = Object.keys(meta)
        .sort()
        .map((tag) =>
          buildMkDocsTagTableFromMeta(tag, meta, tagDescriptions, style, profileSource)
        )
        .join('\n');

      let existing = '';
      let isNew = false;
      try {
        existing = await fs.readFile(mdPath, 'utf8');
      } catch {
        if (legacyPath) {
          try {
            existing = await fs.readFile(legacyPath, 'utf8');
          } catch {
            isNew = true;
          }
        } else {
          isNew = true;
        }
      }

      const blurb = await inferProfileBlurbFromSource(
        options.mesSourcePath,
        profile.profileCs,
        profile.header,
        profile.title
      );
      const exampleSection = await buildProfileExampleSectionFromSource({
        mesSourcePath: options.mesSourcePath,
        profileCs: profile.profileCs,
        title: profile.title,
        header: profile.header,
        meta,
      });

      let next = isNew
        ? buildNewProfileMarkdownPage({
            title: profile.title,
            blurb,
            header: profile.header,
            exampleSection,
            tableRows,
          })
        : updateProfilePageBlurb(
            injectProfileExampleSection(
              injectWebWikiSyncSection(existing, tableRows, {
                pageTitle: profile.title,
                mdFile,
                mode: 'profile-page',
              }),
              exampleSection
            ),
            profile.title,
            blurb
          );

      const metaTags = Object.keys(meta).sort();
      const analysis = analyzePageContentChanges(existing, next, metaTags);
      const sectionsUpdated: string[] = [];
      if (analysis.blurbChanged) {
        sectionsUpdated.push('intro/blurb');
      }
      if (analysis.exampleChanged) {
        sectionsUpdated.push('inline XML example');
      }

      if (contentEquals(existing, next)) {
        result.skipped.push(`${mdFile} (profile page up to date)`);
        logChange(result, {
          kind: 'skipped',
          file: mdFile,
          profileCs: profile.profileCs,
          profileTitle: profile.title,
        });
        if (options.write && legacyPath) {
          try {
            await fs.access(mdPath);
          } catch {
            await fs.writeFile(mdPath, next, 'utf8');
            try {
              await fs.unlink(legacyPath);
            } catch {
              // Legacy filename may already be gone.
            }
            result.updated.push(`${mdFile} (migrated from ${legacyMdFile})`);
            logChange(result, {
              kind: 'migration',
              file: mdFile,
              profileCs: profile.profileCs,
              profileTitle: profile.title,
              detail: `Migrated from \`${legacyMdFile}\``,
            });
          }
        }
      } else if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
        if (legacyPath) {
          try {
            await fs.unlink(legacyPath);
          } catch {
            // Legacy filename may already be gone.
          }
        }

        logProfileRegistryChange({
          syncRegistry,
          result,
          mdFile,
          profile,
          metaTags,
          analysis,
          sectionsUpdated,
          isNew,
          next,
          write: true,
        });
      } else {
        logProfileRegistryChange({
          syncRegistry,
          result,
          mdFile,
          profile,
          metaTags,
          analysis,
          sectionsUpdated,
          isNew,
          next,
          write: false,
        });
      }

      const placement = getProfilePlacement(profile.profileCs, {
        header: profile.header,
        title: profile.title,
        htmlFile: profile.htmlFile,
      });
      profileNavEntries.push({
        profileCs: profile.profileCs,
        title: placement.navTitle,
        mdFile,
        placement,
      });
    } catch (error) {
      result.errors.push(`${mdFile}: ${formatError(error)}`);
      logChange(result, {
        kind: 'error',
        file: mdFile,
        profileCs: profile.profileCs,
        profileTitle: profile.title,
        detail: formatError(error),
      });
    }
  }

  if (options.mkdocsPath) {
    try {
      const localizationResult = await localizeExternalPages({
        docsDir: options.docsDir,
        mkdocsPath: options.mkdocsPath,
        sidebarPath: path.join(options.docsDir, '_Sidebar.md'),
        write: options.write,
      });

      result.externalLinkAudit = localizationResult.audit;

      for (const mdFile of localizationResult.pagesCreated) {
        result.created.push(`${mdFile} (external page localized)`);
        logChange(result, {
          kind: 'external',
          file: mdFile,
          detail: 'Localized from external gist/wiki source (new page)',
        });
      }
      for (const mdFile of localizationResult.pagesUpdated) {
        result.updated.push(`${mdFile} (external page refreshed)`);
        logChange(result, {
          kind: 'external',
          file: mdFile,
          detail: 'Refreshed from external gist/wiki source',
        });
      }
      if (localizationResult.mkdocsChanged) {
        result.navUpdated = true;
        result.updated.push('mkdocs.yml (external nav links localized)');
        logChange(result, {
          kind: 'navigation',
          file: 'mkdocs.yml',
          detail: 'External nav links localized to local pages',
        });
      }
      if (localizationResult.sidebarChanged) {
        result.updated.push('_Sidebar.md (external links localized)');
        logChange(result, {
          kind: 'navigation',
          file: 'docs/_Sidebar.md',
          detail: 'External sidebar links localized to local pages',
        });
      }
      for (const mdFile of localizationResult.docsPatched) {
        result.updated.push(`${mdFile} (cross-reference links localized)`);
        logChange(result, {
          kind: 'external',
          file: mdFile,
          detail: 'Cross-reference links localized to local pages',
        });
      }
    } catch (error) {
      result.errors.push(`external page localization: ${formatError(error)}`);
      logChange(result, {
        kind: 'error',
        file: 'external page localization',
        detail: formatError(error),
      });
    }

    try {
      const mkdocsResult = await updateMkDocsFile(options.mkdocsPath, {
        profileNavEntries,
        docsDir: options.docsDir,
        fixWarnings: options.fixMkdocsWarnings !== false,
        write: options.write,
      });

      if (mkdocsResult.changed) {
        result.navUpdated = mkdocsResult.navEntriesAdded > 0;
        const details: string[] = [];
        if (mkdocsResult.navEntriesAdded > 0) {
          details.push(`+${mkdocsResult.navEntriesAdded} profile nav entries`);
        }
        if (mkdocsResult.navPathsFixed > 0) {
          details.push(`${mkdocsResult.navPathsFixed} nav paths → .md`);
        }
        if (mkdocsResult.validationRelaxed) {
          details.push('validation relaxed for legacy wiki warnings');
        }
        const announceNav =
          mkdocsResult.navEntriesAdded > 0 &&
          shouldAnnounceNavigation(syncRegistry, mkdocsResult.navEntriesAdded);
        result.updated.push(`mkdocs.yml (${details.join(', ') || 'mkdocs warning fixes'})`);
        logChange(result, {
          kind: announceNav ? 'navigation' : 'maintenance',
          file: 'mkdocs.yml',
          detail: details.join('; ') || 'MkDocs warning fixes',
          navEntries: announceNav
            ? profileNavEntries
                .filter((entry) => entry.placement.navGroup !== 'existing-leaf')
                .map((entry) => ({
                  title: entry.placement.navTitle,
                  mdFile: entry.mdFile,
                  navGroup: entry.placement.navGroup,
                  profileCs: entry.profileCs,
                }))
            : undefined,
        });
        if (options.write && announceNav) {
          markNavigationAnnounced(syncRegistry);
        }
      } else if (options.fixMkdocsWarnings !== false) {
        result.skipped.push('mkdocs.yml (already up to date)');
        logChange(result, { kind: 'skipped', file: 'mkdocs.yml' });
      }
    } catch (error) {
      result.errors.push(`mkdocs.yml: ${formatError(error)}`);
      logChange(result, { kind: 'error', file: 'mkdocs.yml', detail: formatError(error) });
    }
  }

  try {
    const updatesResult = await applyHomeUpdates(options.docsDir, result, options.write);
    if (updatesResult.changed) {
      result.updated.push('index.md (wiki updates embed)');
      logChange(result, {
        kind: 'maintenance',
        file: 'index.md',
        detail: 'Homepage What\'s new / Last synced embed refreshed',
      });
    }
  } catch (error) {
    result.errors.push(`index.md updates: ${formatError(error)}`);
    logChange(result, { kind: 'error', file: 'index.md updates', detail: formatError(error) });
  }

  if (options.announceEconomySuitProfiles) {
    try {
      const profilePages = [
        ...ECONOMY_STATION_BLOCK_PROFILES,
        ...MODDING_SUIT_UPGRADE_PROFILES,
      ];
      const announceResult = await announceProfilePagesInWhatsNew(
        options.docsDir,
        [...profilePages],
        {
          write: options.write,
          source: options.sourceLabel,
          tagCountForPage: (mdFile) => syncRegistry.pages[mdFile]?.syncedTags.length ?? 0,
          navNote:
            'Economy & Station Blocks and Suit Upgrades profile pages added under Modding.',
        }
      );
      if (announceResult.changed) {
        result.updated.push('index.md (Economy & Station Blocks + Suit Upgrades announced)');
        logChange(result, {
          kind: 'maintenance',
          file: 'index.md',
          detail: `Homepage What's new updated for ${profilePages.length} profile pages`,
        });
      }
    } catch (error) {
      result.errors.push(`Economy/Suit profile announcement: ${formatError(error)}`);
      logChange(result, {
        kind: 'error',
        file: 'index.md',
        detail: formatError(error),
      });
    }
  }

  try {
    const wikiRoot = path.resolve(options.docsDir, '..');
    const logResult = await applySyncLog(wikiRoot, result, options.write);
    if (logResult.changed) {
      result.updated.push('LOG.md (sync changelog entry)');
    }
  } catch (error) {
    result.errors.push(`LOG.md: ${formatError(error)}`);
    logChange(result, { kind: 'error', file: 'LOG.md', detail: formatError(error) });
  }

  try {
    await saveSyncRegistry(options.docsDir, syncRegistry, options.write, options.sourceLabel);
  } catch (error) {
    result.errors.push(`mes-wiki-sync-registry.json: ${formatError(error)}`);
    logChange(result, {
      kind: 'error',
      file: 'mes-wiki-sync-registry.json',
      detail: formatError(error),
    });
  }

  return result;
}

function logProfileRegistryChange(options: {
  syncRegistry: import('./wikiSyncRegistry').WikiSyncRegistry;
  result: WebWikiPublishResult;
  mdFile: string;
  profile: { profileCs: string; title: string };
  metaTags: string[];
  analysis: import('./wikiChangeDetails').PageContentChangeAnalysis;
  sectionsUpdated: string[];
  isNew: boolean;
  next: string;
  write: boolean;
}): void {
  const {
    syncRegistry,
    result,
    mdFile,
    profile,
    metaTags,
    analysis,
    sectionsUpdated,
    isNew,
    next,
    write,
  } = options;

  const pageAlreadyAnnounced = isProfilePageAnnounced(syncRegistry, mdFile);
  const candidateTags = isNew && !pageAlreadyAnnounced ? metaTags : analysis.tagsAdded;
  const novelTags = filterNovelTags(syncRegistry, mdFile, candidateTags);

  if (write) {
    updateRegistryAfterWrite(syncRegistry, mdFile, next, {
      kind: 'profile',
      profileCs: profile.profileCs,
      announcedTags: novelTags,
      markPageAnnounced: isNew || pageAlreadyAnnounced || novelTags.length > 0,
    });
  }

  const hasMeaningfulChange =
    novelTags.length > 0 ||
    analysis.tagsRefreshed.length > 0 ||
    sectionsUpdated.length > 0 ||
    analysis.tagsRemoved.length > 0;

  if (!hasMeaningfulChange) {
    return;
  }

  if (isNew && !pageAlreadyAnnounced && novelTags.length > 0) {
    result.created.push(`${mdFile} (${novelTags.length} tags)`);
    logChange(result, {
      kind: 'page-created',
      file: mdFile,
      profileCs: profile.profileCs,
      profileTitle: profile.title,
      tagsAdded: novelTags,
    });
    return;
  }

  if (novelTags.length === 0 && analysis.tagsRefreshed.length === 0) {
    return;
  }

  result.updated.push(`${mdFile} (profile, ${novelTags.length > 0 ? `+${novelTags.length}` : `${analysis.tagsRefreshed.length} refreshed`} tags)`);
  logChange(result, {
    kind: 'profile-update',
    file: mdFile,
    profileCs: profile.profileCs,
    profileTitle: profile.title,
    tagsAdded: novelTags,
    tagsRemoved: analysis.tagsRemoved,
    tagsRefreshed: analysis.tagsRefreshed,
    sectionsUpdated,
  });
}

function logChange(result: WebWikiPublishResult, record: WikiSyncChangeRecord): void {
  result.changeLog.push(record);
}

function profileConfigStyle(profileCs: string): NewProfilePageConfig['style'] {
  const known = [
    { profile: 'ShipyardProfile.cs', style: 'Prefab' as const },
    { profile: 'SafezoneProfile.cs', style: 'Prefab' as const },
    { profile: 'StoreProfile.cs', style: 'Prefab' as const },
    { profile: 'MissionProfile.cs', style: 'Prefab' as const },
  ].find((entry) => entry.profile === profileCs);
  return known?.style ?? 'Prefab';
}

async function loadTagDescriptions(
  tagDescriptionsPath?: string
): Promise<Record<string, string>> {
  if (!tagDescriptionsPath) {
    return {};
  }

  try {
    const raw = await fs.readFile(tagDescriptionsPath, 'utf8');
    const entries = JSON.parse(raw.replace(/^\uFEFF/, '')) as TagDescriptionEntry[];
    return Object.fromEntries(entries.map((entry) => [entry.Tag, entry.Description]));
  } catch {
    return {};
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
