import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals, getTagMetaFromSource } from './syncBridge';
import type { NewProfilePageConfig, WebWikiPublishOptions, WebWikiPublishResult } from './types';
import {
  buildNewProfileMarkdownPage,
  getSupplementTagsForMarkdown,
  injectWebWikiSyncSection,
  pageTitleFromMdFile,
} from './mkDocsContent';
import { buildMkDocsTagTableFromMeta } from './mkDocsTables';
import {
  WEBWIKI_PAGE_MAP,
  extensionHtmlToWebWikiMd,
} from './constants';
import { discoverWebWikiProfiles } from './profileDiscovery';
import { updateMkDocsFile } from './mkDocsYaml';
import { ensureHomePage } from './mkDocsHome';
import { ensureWebWikiStylePatches } from './mkDocsStyle';
import { applyHomeUpdates } from './mkDocsUpdates';
import {
  getProfileMdFile,
  getProfilePlacement,
} from './profilePlacements';

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
  };

  const tagDescriptions = await loadTagDescriptions(options.tagDescriptionsPath);
  await fs.mkdir(options.docsDir, { recursive: true });

  try {
    const homeResult = await ensureHomePage(options.docsDir, options.write);
    if (homeResult.changed) {
      result.updated.push(`index.md (home intro ${homeResult.action})`);
    } else if (homeResult.action === 'skipped') {
      result.skipped.push('index.md (custom home page preserved)');
    }
  } catch (error) {
    result.errors.push(`index.md: ${formatError(error)}`);
  }

  try {
    const styleResult = await ensureWebWikiStylePatches(options.docsDir, options.write);
    if (styleResult.changed) {
      result.updated.push('style.css (hide footer prev/next to match live site)');
    }
  } catch (error) {
    result.errors.push(`style.css: ${formatError(error)}`);
  }

  for (const [mdFile, cfg] of Object.entries(WEBWIKI_PAGE_MAP)) {
    try {
      const mdPath = path.join(options.docsDir, mdFile);
      let existing = '';
      try {
        existing = await fs.readFile(mdPath, 'utf8');
      } catch {
        result.skipped.push(`${mdFile} (page not present in WebWiki/docs)`);
        continue;
      }

      const sourceTags: string[] = [...(cfg.extraTags ?? [])];
      if (cfg.profile) {
        const meta = await getTagMetaFromSource(options.mesSourcePath, cfg.profile);
        sourceTags.push(...Object.keys(meta));
      }

      const uniqueSourceTags = [...new Set(sourceTags)];
      const supplementTags = getSupplementTagsForMarkdown(existing, uniqueSourceTags);

      let renderedRows = '';
      if (supplementTags.length > 0) {
        const meta = cfg.profile
          ? await getTagMetaFromSource(options.mesSourcePath, cfg.profile)
          : {};
        renderedRows = supplementTags
          .map((tag) => buildMkDocsTagTableFromMeta(tag, meta, tagDescriptions, cfg.style))
          .join('\n');
      }

      const next = injectWebWikiSyncSection(existing, renderedRows, {
        pageTitle: pageTitleFromMdFile(mdFile),
        mdFile,
        mode: 'supplement',
      });
      if (contentEquals(existing, next)) {
        result.skipped.push(`${mdFile} (already up to date)`);
        continue;
      }

      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
      }

      result.updated.push(`${mdFile} (+${supplementTags.length} tags)`);
    } catch (error) {
      result.errors.push(`${mdFile}: ${formatError(error)}`);
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
      const style = profileConfigStyle(profile.profileCs);
      const tableRows = Object.keys(meta)
        .sort()
        .map((tag) => buildMkDocsTagTableFromMeta(tag, meta, tagDescriptions, style))
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

      const next = isNew
        ? buildNewProfileMarkdownPage({
            title: profile.title,
            blurb: profile.blurb,
            header: profile.header,
            tableRows,
          })
        : injectWebWikiSyncSection(existing, tableRows, {
            pageTitle: profile.title,
            mdFile,
            mode: 'profile-page',
          });

      if (contentEquals(existing, next)) {
        result.skipped.push(`${mdFile} (profile page up to date)`);
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

        if (isNew) {
          result.created.push(`${mdFile} (${Object.keys(meta).length} tags)`);
        } else {
          result.updated.push(`${mdFile} (profile, ${Object.keys(meta).length} tags)`);
        }
      } else if (isNew) {
        result.created.push(`${mdFile} (${Object.keys(meta).length} tags)`);
      } else {
        result.updated.push(`${mdFile} (profile, ${Object.keys(meta).length} tags)`);
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
    }
  }

  if (options.mkdocsPath) {
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
        result.updated.push(`mkdocs.yml (${details.join(', ') || 'mkdocs warning fixes'})`);
      } else if (options.fixMkdocsWarnings !== false) {
        result.skipped.push('mkdocs.yml (already up to date)');
      }
    } catch (error) {
      result.errors.push(`mkdocs.yml: ${formatError(error)}`);
    }
  }

  try {
    const updatesResult = await applyHomeUpdates(options.docsDir, result, options.write);
    if (updatesResult.changed) {
      result.updated.push('index.md (wiki updates embed)');
    }
  } catch (error) {
    result.errors.push(`index.md updates: ${formatError(error)}`);
  }

  return result;
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
    const entries = JSON.parse(raw) as TagDescriptionEntry[];
    return Object.fromEntries(entries.map((entry) => [entry.Tag, entry.Description]));
  } catch {
    return {};
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
