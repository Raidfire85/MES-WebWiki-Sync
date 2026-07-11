import {
  WEBWIKI_EXAMPLE_SYNC_END,
  WEBWIKI_EXAMPLE_SYNC_START,
  WEBWIKI_SYNC_END,
  WEBWIKI_SYNC_START,
} from './constants';

export interface PageContentChangeAnalysis {
  tagsAdded: string[];
  tagsRemoved: string[];
  tagsRefreshed: string[];
  blurbChanged: boolean;
  exampleChanged: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkedBlock(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) {
    return '';
  }

  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex === -1) {
    return '';
  }

  return content.slice(startIndex + start.length, endIndex);
}

export function getTagsInSyncBlock(content: string): string[] {
  const block = extractMarkedBlock(content, WEBWIKI_SYNC_START, WEBWIKI_SYNC_END);
  if (!block) {
    return [];
  }

  const tags: string[] = [];
  for (const match of block.matchAll(/\|Tag:\|([^|]+)\|/g)) {
    tags.push(match[1].trim());
  }

  return [...new Set(tags)].sort();
}

function getTagTableSnippet(block: string, tag: string): string | null {
  const pattern = new RegExp(
    `\\|Tag:\\|${escapeRegex(tag)}\\|[\\s\\S]*?(?=\\n\\n\\|Tag:\\||\\s*$)`,
    'm'
  );
  return block.match(pattern)?.[0]?.trim() ?? null;
}

function normalizeForCompare(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function analyzePageContentChanges(
  existing: string,
  next: string,
  allTags: string[]
): PageContentChangeAnalysis {
  const existingSync = extractMarkedBlock(existing, WEBWIKI_SYNC_START, WEBWIKI_SYNC_END);
  const nextSync = extractMarkedBlock(next, WEBWIKI_SYNC_START, WEBWIKI_SYNC_END);
  const existingTags = getTagsInSyncBlock(existing);
  const nextTags = [...new Set(allTags)].sort();

  const tagsAdded = nextTags.filter((tag) => !existingTags.includes(tag));
  const tagsRemoved = existingTags.filter((tag) => !nextTags.includes(tag));
  const tagsRefreshed: string[] = [];

  for (const tag of nextTags) {
    if (tagsAdded.includes(tag)) {
      continue;
    }

    const before = getTagTableSnippet(existingSync, tag);
    const after = getTagTableSnippet(nextSync, tag);
    if (before !== after) {
      tagsRefreshed.push(tag);
    }
  }

  const existingExample = extractMarkedBlock(existing, WEBWIKI_EXAMPLE_SYNC_START, WEBWIKI_EXAMPLE_SYNC_END);
  const nextExample = extractMarkedBlock(next, WEBWIKI_EXAMPLE_SYNC_START, WEBWIKI_EXAMPLE_SYNC_END);

  return {
    tagsAdded,
    tagsRemoved,
    tagsRefreshed,
    blurbChanged: normalizeForCompare(stripIntroForCompare(existing)) !== normalizeForCompare(stripIntroForCompare(next)),
    exampleChanged: normalizeForCompare(existingExample) !== normalizeForCompare(nextExample),
  };
}

function stripIntroForCompare(content: string): string {
  let next = removeManagedBlocks(content);
  next = next.replace(/^#\s[^\n]+\n+/, '');
  next = next.replace(/^Profile header:[^\n]*\n+/m, '');
  return next.trim();
}

function removeManagedBlocks(content: string): string {
  return content
    .replace(
      new RegExp(
        `${escapeRegex(WEBWIKI_EXAMPLE_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_EXAMPLE_SYNC_END)}`,
        'g'
      ),
      ''
    )
    .replace(
      new RegExp(`${escapeRegex(WEBWIKI_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_SYNC_END)}`, 'g'),
      ''
    );
}

export function formatTagList(tags: string[]): string {
  if (tags.length === 0) {
    return '_(none)_';
  }

  return tags.map((tag) => `\`${tag}\``).join(', ');
}
