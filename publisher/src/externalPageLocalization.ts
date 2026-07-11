import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals } from './syncBridge';
import { GITHUB_REPO } from './sync/constants';
import {
  BLOCK_REPLACEMENT_PROFILES_MD,
  mergeBlockReplacementProfilesPage,
} from './blockReplacementProfilesIntro';

const WIKI_BASE_URL = `https://github.com/${GITHUB_REPO}/wiki/`;
const WIKI_RAW_BASE = `https://raw.githubusercontent.com/wiki/${GITHUB_REPO}/`;
const GIST_USER = 'MeridiusIX';

/** Gist-backed pages that must be fetched when nav/sidebar still points at gist.github.com. */
export const GIST_FETCH_TARGETS: Record<
  string,
  { mdFile: string; title: string; wrapAsXml?: boolean }
> = {
  '415b45b53174c608c6486ce06bb58e2c': {
    mdFile: 'Block-Replacement-Profiles.md',
    title: 'Block Replacement Profiles',
  },
  '52fbf5679e67107a8cf37706205b5812': {
    mdFile: 'Threat-Score-Guide.md',
    title: 'Threat Score Guide',
  },
  '8888bbc06a623cac90f8362dd948033c': {
    mdFile: 'Random-Name-Generator-Guide.md',
    title: 'Random Name Generator Guide',
  },
  '1ae743505ec489d31e6ac17edf16e5e0': {
    mdFile: 'SpawnGroup.sbc.md',
    title: 'SpawnGroup.sbc',
    wrapAsXml: true,
  },
  'cd9b4decb58dea335290a05b728a7276': {
    mdFile: 'Factions.sbc.md',
    title: 'Factions.sbc',
    wrapAsXml: true,
  },
};

/** Wiki pages that must be fetched when not already present locally. */
export const WIKI_FETCH_TARGETS: Record<string, { mdFile: string; title: string }> = {
  'Modding:-Tutorial-&-Guidelines:-NPC-Grid-Setup-Guidelines': {
    mdFile: 'NPC-Grid-Setup-Guidelines.md',
    title: 'NPC Grid Setup Guidelines',
  },
  'Behaviors:-Getting-Started': {
    mdFile: 'Behaviors-Getting-Started.md',
    title: 'Behaviors (Getting Started)',
  },
  'Events:-Getting-Started': {
    mdFile: 'Events-Getting-Started.md',
    title: 'Events (Getting Started)',
  },
};

export type ExternalLinkStatus = 'fixed' | 'skipped' | 'broken';

export interface ExternalLinkAuditEntry {
  label: string;
  source: 'mkdocs.yml' | '_Sidebar.md';
  navPath: string;
  before: string;
  after: string;
  status: ExternalLinkStatus;
  detail?: string;
}

export interface ExternalPageLocalizationOptions {
  docsDir: string;
  mkdocsPath?: string;
  sidebarPath?: string;
  write: boolean;
}

export interface ExternalPageLocalizationResult {
  audit: ExternalLinkAuditEntry[];
  pagesCreated: string[];
  pagesUpdated: string[];
  docsPatched: string[];
  mkdocsChanged: boolean;
  sidebarChanged: boolean;
}

export async function localizeExternalPages(
  options: ExternalPageLocalizationOptions
): Promise<ExternalPageLocalizationResult> {
  const docsFiles = await listDocsMdFiles(options.docsDir);
  const titleToMd = options.mkdocsPath
    ? parseMkDocsTitleMap(await fs.readFile(options.mkdocsPath, 'utf8'))
    : new Map<string, string>();

  const urlToLocal = new Map<string, string>();
  const audit: ExternalLinkAuditEntry[] = [];
  const pagesCreated: string[] = [];
  const pagesUpdated: string[] = [];

  await fetchMissingExternalPages(options, docsFiles, pagesCreated, pagesUpdated);

  for (const [gistId, target] of Object.entries(GIST_FETCH_TARGETS)) {
    registerLocalMapping(urlToLocal, gistUrlVariants(gistId), target.mdFile);
  }
  for (const [wikiSlug, target] of Object.entries(WIKI_FETCH_TARGETS)) {
    registerLocalMapping(urlToLocal, wikiUrlVariants(wikiSlug), target.mdFile);
  }

  for (const mdFile of docsFiles) {
    const stem = mdFile.replace(/\.md$/i, '');
    registerLocalMapping(urlToLocal, wikiUrlVariants(stem), mdFile);
  }

  for (const [title, mdFile] of titleToMd) {
    const slugCandidates = titleToWikiSlugCandidates(title, mdFile);
    for (const slug of slugCandidates) {
      registerLocalMapping(urlToLocal, wikiUrlVariants(slug), mdFile);
    }
  }

  let mkdocsChanged = false;
  if (options.mkdocsPath) {
    const mkdocsContent = await fs.readFile(options.mkdocsPath, 'utf8');
    const { content, changed, entries } = rewriteMkDocsExternalLinks(
      mkdocsContent,
      docsFiles,
      titleToMd,
      urlToLocal
    );
    audit.push(...entries);
    if (changed && options.write) {
      await fs.writeFile(options.mkdocsPath, content, 'utf8');
    }
    mkdocsChanged = changed;
  }

  let sidebarChanged = false;
  const sidebarPath = options.sidebarPath ?? path.join(options.docsDir, '_Sidebar.md');
  try {
    const sidebarContent = await fs.readFile(sidebarPath, 'utf8');
    const { content, changed, entries } = rewriteSidebarExternalLinks(
      sidebarContent,
      docsFiles,
      titleToMd,
      urlToLocal
    );
    audit.push(...entries);
    if (changed && options.write) {
      await fs.writeFile(sidebarPath, content, 'utf8');
    }
    sidebarChanged = changed;
  } catch {
    // Sidebar is optional for MkDocs builds.
  }

  const docsPatched = await patchDocCrossReferences(
    options.docsDir,
    urlToLocal,
    docsFiles,
    options.write
  );

  return {
    audit,
    pagesCreated,
    pagesUpdated,
    docsPatched,
    mkdocsChanged,
    sidebarChanged,
  };
}

async function fetchMissingExternalPages(
  options: ExternalPageLocalizationOptions,
  docsFiles: Set<string>,
  pagesCreated: string[],
  pagesUpdated: string[]
): Promise<void> {
  for (const [gistId, target] of Object.entries(GIST_FETCH_TARGETS)) {
    const mdPath = path.join(options.docsDir, target.mdFile);
    const exists = docsFiles.has(target.mdFile.toLowerCase());
    const raw = await fetchGistRaw(gistId);
    const gistPage = formatFetchedPageContent(raw, target.title, target.wrapAsXml);
    const next =
      target.mdFile === BLOCK_REPLACEMENT_PROFILES_MD
        ? mergeBlockReplacementProfilesPage(
            exists ? await fs.readFile(mdPath, 'utf8') : null,
            gistPage
          )
        : gistPage;

    if (!exists) {
      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
      }
      docsFiles.add(target.mdFile.toLowerCase());
      pagesCreated.push(target.mdFile);
      continue;
    }

    const existing = await fs.readFile(mdPath, 'utf8');
    if (!contentEquals(existing, next)) {
      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
      }
      pagesUpdated.push(target.mdFile);
    }
  }

  for (const [wikiSlug, target] of Object.entries(WIKI_FETCH_TARGETS)) {
    const mdPath = path.join(options.docsDir, target.mdFile);
    const exists = docsFiles.has(target.mdFile.toLowerCase());
    const raw = await fetchWikiRaw(wikiSlug);
    const next = formatFetchedPageContent(raw, target.title, false);

    if (!exists) {
      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
      }
      docsFiles.add(target.mdFile.toLowerCase());
      pagesCreated.push(target.mdFile);
      continue;
    }

    const existing = await fs.readFile(mdPath, 'utf8');
    if (!contentEquals(existing, next)) {
      if (options.write) {
        await fs.writeFile(mdPath, next, 'utf8');
      }
      pagesUpdated.push(target.mdFile);
    }
  }
}

function formatFetchedPageContent(raw: string, title: string, wrapAsXml?: boolean): string {
  const trimmed = raw.replace(/\r\n/g, '\n').trim();
  if (wrapAsXml || trimmed.startsWith('<?xml')) {
    return `# ${title}\n\n\`\`\`xml\n${trimmed}\n\`\`\`\n`;
  }

  if (/^#\s/m.test(trimmed)) {
    return `${trimmed}\n`;
  }

  return `# ${title}\n\n${trimmed}\n`;
}

async function fetchGistRaw(gistId: string): Promise<string> {
  const url = `https://gist.githubusercontent.com/${GIST_USER}/${gistId}/raw`;
  const response = await fetch(url, { headers: { 'User-Agent': 'mes-webwiki-sync' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch gist ${gistId} (${response.status}).`);
  }
  return response.text();
}

async function fetchWikiRaw(wikiSlug: string): Promise<string> {
  const encodedSlug = encodeURIComponent(wikiSlug);
  const url = `${WIKI_RAW_BASE}${encodedSlug}.md`;
  const response = await fetch(url, { headers: { 'User-Agent': 'mes-webwiki-sync' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch wiki page ${wikiSlug} (${response.status}).`);
  }
  return response.text();
}

function rewriteMkDocsExternalLinks(
  content: string,
  docsFiles: Set<string>,
  titleToMd: Map<string, string>,
  urlToLocal: Map<string, string>
): { content: string; changed: boolean; entries: ExternalLinkAuditEntry[] } {
  const navMatch = content.match(/^nav:\s*\r?\n([\s\S]*?)(?=^[^\s#].+?:\s*(?:\r?\n|$))/m);
  if (!navMatch || navMatch.index === undefined) {
    return { content, changed: false, entries: [] };
  }

  const navStart = navMatch.index + 'nav:\n'.length;
  const navBody = navMatch[1];
  const lines = navBody.split(/\r?\n/);
  const entries: ExternalLinkAuditEntry[] = [];
  let changed = false;

  const rewritten = lines.map((line, index) => {
    const item = parseNavItemLine(line);
    if (!item?.value) {
      return line;
    }

    const navPath = getNavPathForLines(lines, index).join(' > ');
    const resolution = resolveExternalTarget(item.title, item.value, docsFiles, titleToMd, urlToLocal);
    entries.push({
      label: item.title,
      source: 'mkdocs.yml',
      navPath,
      before: item.value,
      after: resolution.after,
      status: resolution.status,
      detail: resolution.detail,
    });

    if (resolution.status !== 'fixed' || resolution.after === item.value) {
      return line;
    }

    changed = true;
    return `${item.indent}- ${item.title}: ${resolution.after}`;
  });

  if (!changed) {
    return { content, changed: false, entries };
  }

  const next =
    content.slice(0, navStart) + rewritten.join('\n') + content.slice(navStart + navBody.length);
  return { content: next, changed: true, entries };
}

function rewriteSidebarExternalLinks(
  content: string,
  docsFiles: Set<string>,
  titleToMd: Map<string, string>,
  urlToLocal: Map<string, string>
): { content: string; changed: boolean; entries: ExternalLinkAuditEntry[] } {
  const entries: ExternalLinkAuditEntry[] = [];
  let changed = false;

  const linkPattern = /^(\s*\*\s*\[[^\]]+\]\()([^)]+)(\)\s*)$/;
  const nextLines = content.split(/\r?\n/).map((line) => {
    const match = line.match(linkPattern);
    if (!match) {
      return line;
    }

    const title = extractMarkdownLinkTitle(line);
    const target = match[2].trim();
    const resolution = resolveExternalTarget(title, target, docsFiles, titleToMd, urlToLocal);
    entries.push({
      label: title,
      source: '_Sidebar.md',
      navPath: title,
      before: target,
      after: resolution.after,
      status: resolution.status,
      detail: resolution.detail,
    });

    if (resolution.status !== 'fixed' || resolution.after === target) {
      return line;
    }

    changed = true;
    return `${match[1]}${resolution.after}${match[3]}`;
  });

  return {
    content: changed ? `${nextLines.join('\n')}\n` : content,
    changed,
    entries,
  };
}

function resolveExternalTarget(
  title: string,
  target: string,
  docsFiles: Set<string>,
  titleToMd: Map<string, string>,
  urlToLocal: Map<string, string>
): { after: string; status: ExternalLinkStatus; detail?: string } {
  const normalizedTitle = normalizeLinkTitle(title);

  const titleMd = titleToMd.get(normalizedTitle);
  if (titleMd) {
    const resolved = normalizeExistingLocalTarget(titleMd, docsFiles);
    return finalizeResolution(target, resolved, docsFiles, 'matched mkdocs nav title');
  }

  if (!isExternalNavTarget(target)) {
    const wikiFetch = WIKI_FETCH_TARGETS[target];
    if (wikiFetch) {
      return finalizeResolution(target, wikiFetch.mdFile, docsFiles, 'wiki slug mapped to local page');
    }

    for (const fetchTarget of Object.values(WIKI_FETCH_TARGETS)) {
      if (fetchTarget.title === normalizedTitle) {
        return finalizeResolution(target, fetchTarget.mdFile, docsFiles, 'wiki page fetched to docs/');
      }
    }

    if (/\.md$/i.test(target)) {
      if (docsFiles.has(target.toLowerCase())) {
        return { after: target, status: 'skipped', detail: 'already local' };
      }
      return { after: target, status: 'broken', detail: 'local nav target missing from docs/' };
    }

    const local = normalizeExistingLocalTarget(target, docsFiles);
    return finalizeResolution(target, local, docsFiles, local !== target ? 'added .md extension' : 'already local');
  }

  if (isModRepositoryLink(target)) {
    return { after: target, status: 'skipped', detail: 'mod repository link kept external' };
  }

  const mapped = lookupUrlMapping(urlToLocal, target, docsFiles);
  if (mapped) {
    return finalizeResolution(target, mapped, docsFiles, 'mapped external URL to local page');
  }

  const wikiSlug = extractWikiSlug(target);
  if (wikiSlug) {
    const fetchTarget = WIKI_FETCH_TARGETS[wikiSlug];
    if (fetchTarget) {
      return finalizeResolution(target, fetchTarget.mdFile, docsFiles, 'wiki page fetched to docs/');
    }
  }

  const gistId = extractGistId(target);
  if (gistId && GIST_FETCH_TARGETS[gistId]) {
    return finalizeResolution(
      target,
      GIST_FETCH_TARGETS[gistId].mdFile,
      docsFiles,
      'gist page fetched to docs/'
    );
  }

  if (wikiSlug) {
    const slugMd = `${wikiSlug}.md`;
    if (docsFiles.has(slugMd.toLowerCase())) {
      return finalizeResolution(target, slugMd, docsFiles, 'wiki slug matches existing docs file');
    }
  }

  return { after: target, status: 'broken', detail: 'no local page or fetch target' };
}

function finalizeResolution(
  before: string,
  after: string,
  docsFiles: Set<string>,
  fixedDetail: string
): { after: string; status: ExternalLinkStatus; detail?: string } {
  const localFile = /\.md$/i.test(after) ? after : `${after}.md`;
  const isLocalFile = docsFiles.has(localFile.toLowerCase());

  if (!isExternalNavTarget(before) && before === after && (isLocalFile || /\.md$/i.test(before))) {
    return { after, status: 'skipped', detail: 'already local' };
  }

  if (isExternalNavTarget(before) && before !== after && isLocalFile) {
    return { after, status: 'fixed', detail: fixedDetail };
  }

  if (!isExternalNavTarget(before) && before !== after && isLocalFile) {
    return { after, status: 'fixed', detail: fixedDetail };
  }

  if (isLocalFile && before === after) {
    return { after, status: 'skipped', detail: 'already local' };
  }

  if (isLocalFile) {
    return { after, status: 'fixed', detail: fixedDetail };
  }

  return { after, status: 'broken', detail: fixedDetail };
}

async function patchDocCrossReferences(
  docsDir: string,
  urlToLocal: Map<string, string>,
  docsFiles: Set<string>,
  write: boolean
): Promise<string[]> {
  const patched: string[] = [];
  const entries = await fs.readdir(docsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === '_Sidebar.md') {
      continue;
    }

    const filePath = path.join(docsDir, entry.name);
    const original = await fs.readFile(filePath, 'utf8');
    let next = original;

    for (const [externalUrl, mdFile] of urlToLocal) {
      next = replaceAllLiteral(next, externalUrl, mdFile);
      next = replaceAllLiteral(next, externalUrl.replace(/&/g, '&amp;'), mdFile);
    }

    next = next.replace(
      new RegExp(`${escapeRegex(WIKI_BASE_URL)}([^)\\s"']+)`, 'g'),
      (_match, rawSlug: string) => {
        const slug = decodeURIComponent(String(rawSlug).replace(/&amp;/g, '&'));
        const mapped = lookupUrlMapping(urlToLocal, `${WIKI_BASE_URL}${slug}`, docsFiles);
        if (mapped) {
          return mapped;
        }
        const slugMd = `${slug}.md`;
        if (docsFiles.has(slugMd.toLowerCase())) {
          return slugMd;
        }
        return _match;
      }
    );

    next = next.replace(
      /https?:\/\/gist\.github\.com\/MeridiusIX\/([0-9a-f]+)(?:[^\s)"']*)?/gi,
      (_match, gistId: string) => GIST_FETCH_TARGETS[gistId]?.mdFile ?? _match
    );

    if (!contentEquals(original, next)) {
      if (write) {
        await fs.writeFile(filePath, next, 'utf8');
      }
      patched.push(entry.name);
    }
  }

  return patched;
}

function parseMkDocsTitleMap(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const navMatch = content.match(/^nav:\s*\r?\n([\s\S]*?)(?=^[^\s#].+?:\s*(?:\r?\n|$))/m);
  if (!navMatch) {
    return map;
  }

  for (const line of navMatch[1].split(/\r?\n/)) {
    const item = parseNavItemLine(line);
    if (!item?.value) {
      continue;
    }
    map.set(normalizeLinkTitle(item.title), item.value);
  }

  return map;
}

function parseNavItemLine(line: string): { indent: string; title: string; value?: string } | null {
  const match = line.match(/^(\s*)-\s+([^:]+):\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    indent: match[1],
    title: match[2].trim(),
    value: match[3].trim(),
  };
}

function getNavPathForLines(lines: string[], lineIndex: number): string[] {
  const stack: Array<{ depth: number; title: string }> = [];

  for (let i = 0; i <= lineIndex; i++) {
    const item = parseNavItemLine(lines[i]);
    if (!item) {
      continue;
    }

    const depth = Math.floor(item.indent.length / 2);
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack.push({ depth, title: item.title });
  }

  return stack.map((entry) => entry.title);
}

function normalizeExistingLocalTarget(target: string, docsFiles: Set<string>): string {
  if (/\.md$/i.test(target)) {
    return target;
  }

  const mdName = `${target}.md`;
  if (docsFiles.has(mdName.toLowerCase())) {
    return mdName;
  }

  return target;
}

function isExternalNavTarget(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isModRepositoryLink(value: string): boolean {
  if (!/^https:\/\/github\.com\/MeridiusIX\//i.test(value)) {
    return false;
  }
  return !value.includes('/Modular-Encounters-Systems/');
}

function extractWikiSlug(url: string): string | undefined {
  if (!url.startsWith(WIKI_BASE_URL)) {
    return undefined;
  }
  return decodeURIComponent(url.slice(WIKI_BASE_URL.length).replace(/&amp;/g, '&'));
}

function extractGistId(url: string): string | undefined {
  const match = url.match(/gist\.github(?:usercontent)?\.com\/MeridiusIX\/([0-9a-f]+)/i);
  return match?.[1];
}

function wikiUrlVariants(slug: string): string[] {
  const decoded = decodeURIComponent(slug);
  const encoded = encodeURIComponent(decoded).replace(/%20/g, '-');
  return [`${WIKI_BASE_URL}${decoded}`, `${WIKI_BASE_URL}${encoded}`];
}

function gistUrlVariants(gistId: string): string[] {
  return [
    `https://gist.github.com/${GIST_USER}/${gistId}`,
    `https://gist.github.com/${GIST_USER}/${gistId}?ts=2`,
    `https://gist.githubusercontent.com/${GIST_USER}/${gistId}/raw`,
  ];
}

function registerLocalMapping(urlToLocal: Map<string, string>, urls: string[], mdFile: string): void {
  for (const url of urls) {
    urlToLocal.set(url, mdFile);
  }
}

function lookupUrlMapping(
  urlToLocal: Map<string, string>,
  url: string,
  docsFiles: Set<string>
): string | undefined {
  const direct = urlToLocal.get(url);
  if (direct) {
    return direct;
  }

  const gistId = extractGistId(url);
  if (gistId) {
    return GIST_FETCH_TARGETS[gistId]?.mdFile;
  }

  const wikiSlug = extractWikiSlug(url);
  if (wikiSlug) {
    const mapped = urlToLocal.get(`${WIKI_BASE_URL}${wikiSlug}`);
    if (mapped) {
      return mapped;
    }
    const slugMd = `${wikiSlug}.md`;
    if (docsFiles.has(slugMd.toLowerCase())) {
      return slugMd;
    }
  }

  return undefined;
}

function titleToWikiSlugCandidates(title: string, mdFile: string): string[] {
  const stem = mdFile.replace(/\.md$/i, '');
  const candidates = new Set<string>([stem]);

  if (stem.startsWith('AdminConfig_')) {
    const suffix = stem.slice('AdminConfig_'.length);
    candidates.add(`Admin-&-Configuration:-${suffix.replace(/ /g, '-')}`);
  }

  if (title.includes('Getting Started')) {
    candidates.add(title.replace(/\s+\(Getting Started\)/i, ':-Getting-Started').replace(/\s+/g, '-'));
  }

  return [...candidates];
}

function normalizeLinkTitle(title: string): string {
  return title.replace(/\*\*/g, '').trim();
}

function extractMarkdownLinkTitle(line: string): string {
  const match = line.match(/\*\*\[(.+?)\]\(/);
  if (match) {
    return match[1];
  }
  const plain = line.match(/\*\s*\[(.+?)\]\(/);
  return plain?.[1]?.trim() ?? line;
}

function stripMdExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

async function listDocsMdFiles(docsDir: string): Promise<Set<string>> {
  const entries = await fs.readdir(docsDir);
  return new Set(entries.filter((file) => file.endsWith('.md')).map((file) => file.toLowerCase()));
}

function replaceAllLiteral(content: string, search: string, replacement: string): string {
  if (!search) {
    return content;
  }
  return content.split(search).join(replacement);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
