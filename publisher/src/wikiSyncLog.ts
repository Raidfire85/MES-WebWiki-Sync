import * as fs from 'fs/promises';
import * as path from 'path';
import { WEBWIKI_LOG_SYNC_END, WEBWIKI_LOG_SYNC_START } from './constants';
import type { WebWikiPublishResult, WikiSyncChangeKind, WikiSyncChangeRecord } from './types';
import { formatSourceDisplayLabel } from './wikiUpdatesFormat';
import { formatTagList } from './wikiChangeDetails';

const LOG_FILE = 'LOG.md';

const STATIC_HEADER = `# MES-WebWiki Changelog

Full history of wiki sync runs and publisher-driven documentation updates for this repository.
Newest entries appear first. For a short public summary, see the homepage **What's new** embed (\`docs/index.md\`).

Machine-readable homepage history (last 8 highlight runs): \`docs/mes-wiki-updates.json\`.

## Historical note (before automated LOG.md)

The community mirror was first published **July 9, 2026**. Major work through **July 11, 2026** included:

- Initial MES source sync — hundreds of tag supplements across Action, Trigger, Spawn, and related modding pages
- Nine new sync-managed profile pages (Shipyard, Mission, Safezone, Store, Suit Upgrades, and others)
- Sidebar navigation updates under **Modding** and **Modder Resources**
- Tag descriptions generated from MES C# source on each sync
- Inline XML examples on sync-managed profile pages
- Block Replacement Profiles usage guide (server config, SpawnGroup, Shipyard)

`;

const SECTION_TITLES: Record<WikiSyncChangeKind, string> = {
  'page-created': 'Pages created',
  'tag-update': 'Tag updates (modding pages)',
  'profile-update': 'Profile page updates',
  migration: 'Page migrations',
  navigation: 'Navigation & sidebar',
  external: 'External pages & link localization',
  maintenance: 'Site maintenance',
  skipped: 'Skipped (unchanged)',
  error: 'Errors',
};

function formatTimestampUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatRecord(record: WikiSyncChangeRecord): string[] {
  const lines: string[] = [];
  const heading =
    record.profileTitle && record.profileCs
      ? `**${record.profileTitle}** (\`${record.profileCs}\` → \`${record.file}\`)`
      : record.profileTitle
        ? `**${record.profileTitle}** (\`${record.file}\`)`
        : `**\`${record.file}\`**`;

  lines.push(heading);

  if (record.detail) {
    lines.push(`- ${record.detail}`);
  }

  if (record.tagsAdded && record.tagsAdded.length > 0) {
    lines.push(`- Tags added: ${formatTagList(record.tagsAdded)}`);
  }

  if (record.tagsRemoved && record.tagsRemoved.length > 0) {
    lines.push(`- Tags removed: ${formatTagList(record.tagsRemoved)}`);
  }

  if (record.tagsRefreshed && record.tagsRefreshed.length > 0) {
    lines.push(`- Tags refreshed (tables/descriptions): ${formatTagList(record.tagsRefreshed)}`);
  }

  if (record.sectionsUpdated && record.sectionsUpdated.length > 0) {
    lines.push(`- Sections updated: ${record.sectionsUpdated.join(', ')}`);
  }

  if (record.navEntries && record.navEntries.length > 0) {
    for (const entry of record.navEntries) {
      const profile = entry.profileCs ? ` — \`${entry.profileCs}\`` : '';
      lines.push(
        `- Nav: **${entry.navGroup}** → ${entry.title} (\`${entry.mdFile}\`)${profile}`
      );
    }
  }

  if (lines.length === 1 && record.kind === 'skipped') {
    lines.push('- Already up to date');
  }

  if (lines.length === 1 && record.kind === 'error') {
    lines.push(`- ${record.detail ?? 'Unknown error'}`);
  }

  return lines;
}

function buildDetailedSections(changeLog: WikiSyncChangeRecord[]): string {
  const grouped = new Map<WikiSyncChangeKind, WikiSyncChangeRecord[]>();

  for (const record of changeLog) {
    const bucket = grouped.get(record.kind) ?? [];
    bucket.push(record);
    grouped.set(record.kind, bucket);
  }

  const order: WikiSyncChangeKind[] = [
    'page-created',
    'tag-update',
    'profile-update',
    'migration',
    'navigation',
    'external',
    'maintenance',
    'skipped',
    'error',
  ];

  const sections: string[] = [];

  for (const kind of order) {
    const records = grouped.get(kind);
    if (!records || records.length === 0) {
      continue;
    }

    sections.push(`### ${SECTION_TITLES[kind]}\n`);
    for (const record of records) {
      sections.push(`${formatRecord(record).join('\n')}\n`);
    }
  }

  return sections.join('\n').trimEnd();
}

export function buildSyncLogEntry(result: WebWikiPublishResult, timestamp = new Date()): string {
  const source = formatSourceDisplayLabel(result.sourceLabel);
  const meaningfulChanges = result.changeLog.filter((record) => record.kind !== 'skipped');
  const summary =
    meaningfulChanges.length === 0 && result.errors.length === 0
      ? 'No content changes (sync completed; pages already up to date).'
      : `${meaningfulChanges.length} change record(s), ${result.skipped.length} skipped, ${result.errors.length} error(s).`;

  const body =
    result.changeLog.length > 0
      ? buildDetailedSections(result.changeLog)
      : '### Details\n\n- Sync run completed with no categorized changes.';

  return `## ${formatTimestampUtc(timestamp)} — ${source}

**Summary:** ${summary}

${body}

---
`;
}

export function mergeSyncLogContent(existing: string, newEntry: string): string {
  const startIndex = existing.indexOf(WEBWIKI_LOG_SYNC_START);
  const endIndex = existing.indexOf(WEBWIKI_LOG_SYNC_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return `${STATIC_HEADER.trimEnd()}\n\n${WEBWIKI_LOG_SYNC_START}\n${newEntry}\n${WEBWIKI_LOG_SYNC_END}\n`;
  }

  const before = existing.slice(0, startIndex + WEBWIKI_LOG_SYNC_START.length);
  const after = existing.slice(endIndex);
  const currentBody = existing
    .slice(startIndex + WEBWIKI_LOG_SYNC_START.length, endIndex)
    .trim();

  const mergedBody = currentBody ? `${newEntry.trimEnd()}\n\n${currentBody}\n` : `${newEntry.trimEnd()}\n`;
  return `${before}\n${mergedBody}${after}`;
}

export async function applySyncLog(
  wikiRoot: string,
  result: WebWikiPublishResult,
  write: boolean
): Promise<{ changed: boolean }> {
  const logPath = path.join(wikiRoot, LOG_FILE);
  const entry = buildSyncLogEntry(result);
  let existing = '';

  try {
    existing = await fs.readFile(logPath, 'utf8');
  } catch {
    existing = '';
  }

  const next = mergeSyncLogContent(existing, entry);
  const changed = existing !== next;

  if (write && changed) {
    await fs.writeFile(logPath, next, 'utf8');
  }

  return { changed };
}

/** @deprecated Use changeLog on WebWikiPublishResult */
export function categorizePublishResult(result: WebWikiPublishResult) {
  return result.changeLog;
}
