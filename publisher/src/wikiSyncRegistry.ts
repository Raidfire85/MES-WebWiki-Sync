import * as fs from 'fs/promises';
import * as path from 'path';
import { WEBWIKI_PAGE_MAP } from './constants';
import { getTagsInSyncBlock } from './wikiChangeDetails';

export const REGISTRY_FILE = 'mes-wiki-sync-registry.json';

export interface WikiSyncRegistryPage {
  kind: 'supplement' | 'profile';
  profileCs?: string;
  /** Profile page creation already announced on the homepage. */
  pageAnnounced?: boolean;
  /** Tags currently present in the wiki sync block. */
  syncedTags: string[];
  /** Tags already highlighted on the homepage or in reader-facing changelog. */
  announcedTags: string[];
}

export interface WikiSyncRegistry {
  version: 1;
  lastUpdated?: string;
  lastSource?: string;
  pages: Record<string, WikiSyncRegistryPage>;
  flags: {
    navigationAnnounced: boolean;
  };
}

export function createEmptyRegistry(): WikiSyncRegistry {
  return {
    version: 1,
    pages: {},
    flags: { navigationAnnounced: false },
  };
}

export async function loadSyncRegistry(docsDir: string): Promise<WikiSyncRegistry> {
  const filePath = path.join(docsDir, REGISTRY_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as WikiSyncRegistry;
    if (parsed.version !== 1 || !parsed.pages || !parsed.flags) {
      return bootstrapRegistryFromDocs(docsDir);
    }
    return normalizeRegistry(parsed);
  } catch {
    return bootstrapRegistryFromDocs(docsDir);
  }
}

export async function saveSyncRegistry(
  docsDir: string,
  registry: WikiSyncRegistry,
  write: boolean,
  sourceLabel?: string
): Promise<void> {
  if (!write) {
    return;
  }

  const normalized = normalizeRegistry(registry);
  if (sourceLabel) {
    normalized.lastSource = sourceLabel;
  }
  normalized.lastUpdated = new Date().toISOString();

  const filePath = path.join(docsDir, REGISTRY_FILE);
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

export async function bootstrapRegistryFromDocs(docsDir: string): Promise<WikiSyncRegistry> {
  const registry = createEmptyRegistry();
  let entries: string[];

  try {
    entries = await fs.readdir(docsDir);
  } catch {
    return registry;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry === 'index.md') {
      continue;
    }

    const mdFile = entry;
    const content = await fs.readFile(path.join(docsDir, mdFile), 'utf8');
    const syncedTags = getTagsInSyncBlock(content);
    if (syncedTags.length === 0) {
      continue;
    }

    const kind = inferPageKind(mdFile);
    registry.pages[mdFile] = {
      kind,
      profileCs: inferProfileCs(mdFile, kind),
      pageAnnounced: kind === 'profile',
      syncedTags: [...syncedTags],
      announcedTags: [...syncedTags],
    };
  }

  registry.flags.navigationAnnounced = Object.keys(registry.pages).length > 0;
  return registry;
}

export function ensureRegistryPage(
  registry: WikiSyncRegistry,
  mdFile: string,
  defaults: Partial<WikiSyncRegistryPage> = {}
): WikiSyncRegistryPage {
  if (!registry.pages[mdFile]) {
    registry.pages[mdFile] = {
      kind: defaults.kind ?? inferPageKind(mdFile),
      profileCs: defaults.profileCs,
      pageAnnounced: defaults.pageAnnounced ?? false,
      syncedTags: [],
      announcedTags: [],
    };
  }

  const page = registry.pages[mdFile];
  if (defaults.kind) {
    page.kind = defaults.kind;
  }
  if (defaults.profileCs) {
    page.profileCs = defaults.profileCs;
  }
  return page;
}

export function filterNovelTags(
  registry: WikiSyncRegistry,
  mdFile: string,
  tags: string[]
): string[] {
  const page = registry.pages[mdFile];
  if (!page) {
    return [...tags];
  }

  const announced = new Set(page.announcedTags);
  return tags.filter((tag) => !announced.has(tag));
}

export function isProfilePageAnnounced(registry: WikiSyncRegistry, mdFile: string): boolean {
  return registry.pages[mdFile]?.pageAnnounced === true;
}

export function shouldAnnounceNavigation(
  registry: WikiSyncRegistry,
  navEntriesAdded: number
): boolean {
  return navEntriesAdded > 0 && !registry.flags.navigationAnnounced;
}

export function markNavigationAnnounced(registry: WikiSyncRegistry): void {
  registry.flags.navigationAnnounced = true;
}

export function updateRegistryAfterWrite(
  registry: WikiSyncRegistry,
  mdFile: string,
  nextContent: string,
  options: {
    kind: 'supplement' | 'profile';
    profileCs?: string;
    announcedTags?: string[];
    markPageAnnounced?: boolean;
  }
): void {
  const page = ensureRegistryPage(registry, mdFile, {
    kind: options.kind,
    profileCs: options.profileCs,
  });

  page.syncedTags = getTagsInSyncBlock(nextContent);

  if (options.markPageAnnounced) {
    page.pageAnnounced = true;
  }

  const toAnnounce = options.announcedTags ?? [];
  const announced = new Set(page.announcedTags);
  for (const tag of toAnnounce) {
    announced.add(tag);
  }
  page.announcedTags = [...announced].sort();
}

function inferPageKind(mdFile: string): 'supplement' | 'profile' {
  if (mdFile in WEBWIKI_PAGE_MAP) {
    return 'supplement';
  }

  if (/Profile\.md$/i.test(mdFile)) {
    return 'profile';
  }

  return 'supplement';
}

function inferProfileCs(mdFile: string, kind: 'supplement' | 'profile'): string | undefined {
  if (kind === 'supplement') {
    return WEBWIKI_PAGE_MAP[mdFile as keyof typeof WEBWIKI_PAGE_MAP]?.profile ?? undefined;
  }

  const stem = mdFile.replace(/\.md$/i, '');
  const pascal = stem
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${pascal}.cs`;
}

function normalizeRegistry(registry: WikiSyncRegistry): WikiSyncRegistry {
  const pages: Record<string, WikiSyncRegistryPage> = {};

  for (const [mdFile, page] of Object.entries(registry.pages)) {
    pages[mdFile] = {
      kind: page.kind ?? inferPageKind(mdFile),
      profileCs: page.profileCs,
      pageAnnounced: page.pageAnnounced ?? false,
      syncedTags: [...new Set(page.syncedTags ?? [])].sort(),
      announcedTags: [...new Set(page.announcedTags ?? [])].sort(),
    };
  }

  return {
    version: 1,
    lastUpdated: registry.lastUpdated,
    lastSource: registry.lastSource,
    pages,
    flags: {
      navigationAnnounced: registry.flags?.navigationAnnounced ?? false,
    },
  };
}
