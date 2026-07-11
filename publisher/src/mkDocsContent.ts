import { WEBWIKI_SYNC_END, WEBWIKI_SYNC_START } from './constants';
import {
  pageTitleFromMdFile,
  resolveSyncSectionCopy,
  type SyncSectionContext,
} from './syncSectionCopy';

export type { SyncSectionContext } from './syncSectionCopy';
export { pageTitleFromMdFile } from './syncSectionCopy';

export function removeWebWikiSyncBlock(content: string): string {
  if (!content.includes(WEBWIKI_SYNC_START)) {
    return content;
  }

  const pattern = new RegExp(
    `${escapeRegex(WEBWIKI_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_SYNC_END)}`,
    'g'
  );
  return content.replace(pattern, '').trimEnd();
}

export function getUndocumentedTagsInMarkdown(markdown: string, sourceTags: string[]): string[] {
  const missing: string[] = [];

  for (const tag of sourceTags) {
    const hasFormat = markdown.includes(`[${tag}:`);
    const hasTableHeader = new RegExp(`\\|Tag:\\s*\\|${escapeRegex(tag)}\\|`, 'i').test(markdown);
    if (!hasFormat && !hasTableHeader) {
      missing.push(tag);
    }
  }

  return [...new Set(missing)].sort();
}

export function getSupplementTagsForMarkdown(content: string, sourceTags: string[]): string[] {
  return getUndocumentedTagsInMarkdown(removeWebWikiSyncBlock(content), sourceTags);
}

export function buildWebWikiSyncSection(
  tableRows: string,
  context: SyncSectionContext
): string {
  const copy = resolveSyncSectionCopy(context);
  const heading = copy.heading ? `## ${copy.heading}\n\n` : '';

  return `${WEBWIKI_SYNC_START}
${heading}${copy.intro}

${tableRows.trim()}
${WEBWIKI_SYNC_END}`;
}

export function injectWebWikiSyncSection(
  content: string,
  tableRows: string,
  context: SyncSectionContext
): string {
  const base = removeWebWikiSyncBlock(content).trimEnd();
  if (!tableRows.trim()) {
    return base;
  }

  return `${base}\n\n${buildWebWikiSyncSection(tableRows, context)}\n`;
}

export function updateProfilePageBlurb(content: string, title: string, blurb: string): string {
  const titleLine = `# ${title}`;
  const titleIndex = content.indexOf(titleLine);
  if (titleIndex === -1) {
    return content;
  }

  let cursor = titleIndex + titleLine.length;
  while (cursor < content.length && (content[cursor] === '\n' || content[cursor] === '\r')) {
    cursor++;
  }

  const rest = content.slice(cursor);
  const stopMatch = rest.match(
    /^(?:Profile header:|<!-- MES-WEBWIKI-SOURCE-SYNC-START -->|## )/m
  );
  const stopOffset = stopMatch?.index ?? rest.length;
  const afterBlurb = rest.slice(stopOffset).replace(/^\n+/, '');

  return `${content.slice(0, cursor)}${blurb.trim()}\n\n${afterBlurb}`;
}

export function buildNewProfileMarkdownPage(options: {
  title: string;
  blurb: string;
  header: string | null;
  tableRows: string;
}): string {
  const headerLine = options.header
    ? `\nProfile header: \`${options.header}\`\n`
    : '';

  const body = options.tableRows.trim()
    ? buildWebWikiSyncSection(options.tableRows, {
        pageTitle: options.title,
        mode: 'profile-page',
      })
    : '';

  return `# ${options.title}

${options.blurb.trim()}${headerLine}
${body ? `\n\n${body}\n` : '\n'}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
