import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals } from './syncBridge';
import {
  LEGACY_PROFILE_NAV_END,
  LEGACY_PROFILE_NAV_START,
  MANAGED_PROFILE_NAV_GROUP_ORDER,
  PROFILE_NAV_SYNC_MARKERS,
  type WebWikiProfilePlacement,
} from './profilePlacements';
import {
  WEBWIKI_VALIDATION_END,
  WEBWIKI_VALIDATION_START,
} from './constants';

export interface ProfileNavEntry {
  profileCs: string;
  title: string;
  mdFile: string;
  placement: WebWikiProfilePlacement;
}

export interface MkDocsUpdateOptions {
  profileNavEntries: ProfileNavEntry[];
  docsDir: string;
  fixWarnings: boolean;
  write: boolean;
}

export interface MkDocsUpdateResult {
  changed: boolean;
  navPathsFixed: number;
  validationRelaxed: boolean;
  navEntriesAdded: number;
}

export async function updateMkDocsFile(
  mkdocsPath: string,
  options: MkDocsUpdateOptions
): Promise<MkDocsUpdateResult> {
  let content = normalizeNavHeaderContent(await fs.readFile(mkdocsPath, 'utf8'));
  const original = content;

  let navPathsFixed = 0;
  let validationRelaxed = false;
  let navEntriesAdded = 0;

  if (options.fixWarnings) {
    const normalized = await normalizeMkDocsNavPaths(content, options.docsDir);
    content = normalized.content;
    navPathsFixed = normalized.fixedCount;
    const relaxed = injectMkDocsValidationRelax(content);
    content = relaxed.content;
    validationRelaxed = relaxed.inserted || relaxed.updated;
  }

  const navResult = applyProfileNavPlacements(content, options.profileNavEntries, options.docsDir);
  content = navResult.content;
  navEntriesAdded = navResult.entriesPlaced;

  const result: MkDocsUpdateResult = {
    changed: !contentEquals(original, content),
    navPathsFixed,
    validationRelaxed,
    navEntriesAdded,
  };

  if (result.changed && options.write) {
    await fs.writeFile(mkdocsPath, content, 'utf8');
  }

  return result;
}

function applyProfileNavPlacements(
  content: string,
  entries: ProfileNavEntry[],
  docsDir: string
): { content: string; entriesPlaced: number } {
  let lines = normalizeNavHeader(content.split(/\r?\n/));
  lines = removeLegacyProfileNavBlock(lines);
  lines = removeManagedProfileNavBlocks(lines);

  const docsFiles = new Set(
    entries.map((entry) => entry.mdFile.toLowerCase())
  );

  let entriesPlaced = 0;

  for (const entry of entries) {
    if (!docsFiles.has(entry.mdFile.toLowerCase())) {
      continue;
    }

    if (entry.placement.navGroup !== 'existing-leaf') {
      continue;
    }

    const updated = updateExistingNavLeaf(lines, entry.placement, entry.mdFile);
    if (updated.changed) {
      lines = updated.lines;
      entriesPlaced++;
    }
  }

  for (const groupId of MANAGED_PROFILE_NAV_GROUP_ORDER) {
    if (groupId === 'existing-leaf') {
      continue;
    }

    const marker = PROFILE_NAV_SYNC_MARKERS[groupId];
    const groupEntries = entries
      .filter((entry) => entry.placement.navGroup === groupId)
      .filter((entry) => docsFiles.has(entry.mdFile.toLowerCase()))
      .sort((a, b) => a.placement.navTitle.localeCompare(b.placement.navTitle));

    if (groupEntries.length === 0) {
      continue;
    }

    const block = buildManagedNavBlock(
      marker,
      groupEntries.map((entry) => ({
        profileCs: entry.profileCs,
        title: entry.placement.navTitle,
        mdFile: entry.mdFile,
      }))
    );
    const inserted = insertManagedNavBlock(lines, marker, block);
    lines = inserted.lines;
    entriesPlaced += groupEntries.length;
  }

  return {
    content: `${lines.join('\n')}\n`,
    entriesPlaced,
  };
}

function removeLegacyProfileNavBlock(lines: string[]): string[] {
  return removeMarkedBlock(lines, LEGACY_PROFILE_NAV_START, LEGACY_PROFILE_NAV_END);
}

function removeManagedProfileNavBlocks(lines: string[]): string[] {
  let next = lines;
  for (const marker of Object.values(PROFILE_NAV_SYNC_MARKERS)) {
    next = removeMarkedBlock(next, marker.start, marker.end);
  }
  return next;
}

function removeMarkedBlock(lines: string[], start: string, end: string): string[] {
  const startIdx = lines.findIndex((line) => line.trim() === start);
  if (startIdx === -1) {
    return lines;
  }

  const endIdx = lines.findIndex((line, index) => index > startIdx && line.trim() === end);
  if (endIdx === -1) {
    return lines;
  }

  const without = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  return without.filter((line, index, array) => !(line === '' && array[index - 1] === ''));
}

function updateExistingNavLeaf(
  lines: string[],
  placement: WebWikiProfilePlacement,
  mdFile: string
): { lines: string[]; changed: boolean } {
  const matchTitle = placement.matchExistingTitle ?? placement.navTitle;
  const targetPath = [...placement.parentNavPath, matchTitle];
  let changed = false;

  const next = lines.map((line) => {
    const item = parseNavItemLine(line);
    if (!item) {
      return line;
    }

    const lineIdx = lines.indexOf(line);
    const path = getNavPathForLine(lines, lineIdx);
    if (!pathsEqual(path, targetPath)) {
      return line;
    }

    const desired = `${item.indent}- ${item.title}: ${mdFile}`;
    if (line === desired) {
      return line;
    }

    changed = true;
    return desired;
  });

  return { lines: next, changed };
}

function buildManagedNavBlock(
  marker: (typeof PROFILE_NAV_SYNC_MARKERS)[keyof typeof PROFILE_NAV_SYNC_MARKERS],
  entries: Array<{ title: string; mdFile: string }>
): string[] {
  const childLines = entries.map((entry) => {
    const childIndent = ' '.repeat(marker.childIndent);
    return `${childIndent}- ${entry.title}: ${entry.mdFile}`;
  });

  if ('sectionTitle' in marker && marker.sectionTitle) {
    const sectionIndent = ' '.repeat(marker.sectionIndent);
    return [
      marker.start,
      `${sectionIndent}- ${marker.sectionTitle}:`,
      ...childLines,
      marker.end,
    ];
  }

  return [marker.start, ...childLines, marker.end];
}

function insertManagedNavBlock(
  lines: string[],
  marker: (typeof PROFILE_NAV_SYNC_MARKERS)[keyof typeof PROFILE_NAV_SYNC_MARKERS],
  block: string[]
): { lines: string[] } {
  const anchorIdx = findNavAnchorIndex(lines, marker.insertAfterNavPath);
  if (anchorIdx === -1) {
    throw new Error(
      `mkdocs.yml: could not find nav anchor ${marker.insertAfterNavPath.join(' > ')}`
    );
  }

  const insertIdx =
    marker.insertMode === 'after-last-child'
      ? findLastChildIndex(lines, marker.insertAfterNavPath, anchorIdx)
      : findAfterAnchorInsertIndex(lines, anchorIdx);

  const next = [
    ...lines.slice(0, insertIdx + 1),
    ...block,
    ...lines.slice(insertIdx + 1),
  ];

  return { lines: next };
}

function findNavAnchorIndex(lines: string[], targetPath: readonly string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (!parseNavItemLine(lines[i])) {
      continue;
    }
    const path = getNavPathForLine(lines, i);
    if (pathsEqual(path, targetPath)) {
      return i;
    }
  }
  return -1;
}

function findAfterAnchorInsertIndex(lines: string[], anchorIdx: number): number {
  const anchorDepth = getNavDepth(lines[anchorIdx]);
  let insertIdx = anchorIdx;

  for (let i = anchorIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isSyncMarkerLine(line)) {
      const endIdx = lines.findIndex(
        (candidate, index) => index > i && candidate.trim().endsWith('-SYNC-END')
      );
      if (endIdx !== -1) {
        insertIdx = endIdx;
        i = endIdx;
        continue;
      }
    }

    const item = parseNavItemLine(line);
    if (!item) {
      if (line.trim() === '') {
        continue;
      }
      break;
    }

    const depth = getNavDepth(line);
    if (depth < anchorDepth) {
      break;
    }

    insertIdx = i;
  }

  return insertIdx;
}

function findLastChildIndex(
  lines: string[],
  parentPath: readonly string[],
  parentIdx: number
): number {
  const parentDepth = getNavDepth(lines[parentIdx]);
  let lastIdx = parentIdx;

  for (let i = parentIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!parseNavItemLine(line) && !isSyncMarkerLine(line)) {
      if (line.trim() === '') {
        continue;
      }
      break;
    }

    const depth = getNavDepth(line);
    if (depth <= parentDepth) {
      break;
    }

    lastIdx = i;
  }

  return lastIdx;
}

function getNavPathForLine(lines: string[], lineIndex: number): string[] {
  const stack: Array<{ depth: number; title: string }> = [];

  for (let i = 0; i <= lineIndex; i++) {
    const item = parseNavItemLine(lines[i]);
    if (!item) {
      continue;
    }

    const depth = getNavDepth(lines[i]);
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack.push({ depth, title: item.title });
  }

  return stack.map((entry) => entry.title);
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

function getNavDepth(line: string): number {
  const match = line.match(/^(\s*)-/);
  if (!match) {
    return 0;
  }
  return Math.floor(match[1].length / 2);
}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

function isSyncMarkerLine(line: string): boolean {
  return line.trim().startsWith('# MES-WEBWIKI-NAV-');
}

function normalizeNavHeaderContent(content: string): string {
  return normalizeNavHeader(content.split(/\r?\n/)).join('\n');
}

function normalizeNavHeader(lines: string[]): string[] {
  const navIdx = lines.findIndex((line) => /^nav:\s*/.test(line));
  if (navIdx === -1) {
    return lines;
  }

  const line = lines[navIdx];
  const inlineMatch = line.match(/^nav:\s+(-\s+.+)$/);
  if (!inlineMatch) {
    return lines;
  }

  return [
    ...lines.slice(0, navIdx),
    'nav:',
    `  ${inlineMatch[1]}`,
    ...lines.slice(navIdx + 1),
  ];
}

async function normalizeMkDocsNavPaths(
  content: string,
  docsDir: string
): Promise<{ content: string; fixedCount: number }> {
  const docsFiles = new Set(
    (await fs.readdir(docsDir))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.toLowerCase())
  );

  const navMatch = content.match(/^nav:\s*\r?\n([\s\S]*?)(?=^[^\s#].+?:\s*(?:\r?\n|$))/m);
  if (!navMatch || navMatch.index === undefined) {
    return { content, fixedCount: 0 };
  }

  const navBody = navMatch[1];
  let fixedCount = 0;

  const normalizedBody = navBody
    .split(/\r?\n/)
    .map((line) => {
      const updated = normalizeNavLine(line, docsFiles);
      if (updated !== line) {
        fixedCount++;
      }
      return updated;
    })
    .join('\n');

  const start = navMatch.index + 'nav:\n'.length;
  const end = start + navBody.length;

  return {
    content: `${content.slice(0, start)}${normalizedBody}${content.slice(end)}`,
    fixedCount,
  };
}

function normalizeNavLine(line: string, docsFiles: Set<string>): string {
  const match = line.match(/^(\s*-\s+[^:]+:\s*)(.+)$/);
  if (!match) {
    return line;
  }

  const [, prefix, rawValue] = match;
  const value = rawValue.trim();
  if (!value || isExternalNavTarget(value) || /\.md$/i.test(value)) {
    return line;
  }

  const mdName = `${value}.md`;
  if (!docsFiles.has(mdName.toLowerCase())) {
    return line;
  }

  return `${prefix}${mdName}`;
}

function isExternalNavTarget(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.includes('://');
}

function injectMkDocsValidationRelax(content: string): {
  content: string;
  inserted: boolean;
  updated: boolean;
} {
  const validationBlock = `${WEBWIKI_VALIDATION_START}
validation:
  nav:
    omitted_files: ignore
    not_found: ignore
  links:
    not_found: ignore
    anchors: ignore
    unrecognized_links: ignore
${WEBWIKI_VALIDATION_END}`;

  const validationPattern = new RegExp(
    `${escapeRegex(WEBWIKI_VALIDATION_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_VALIDATION_END)}`,
    'm'
  );

  if (validationPattern.test(content)) {
    const next = content.replace(validationPattern, validationBlock);
    return {
      content: next,
      inserted: false,
      updated: !contentEquals(content, next),
    };
  }

  const themeMatch = content.match(/\r?\n(?=theme:)/);
  if (!themeMatch || themeMatch.index === undefined) {
    throw new Error('mkdocs.yml: could not find theme: section for validation block');
  }

  return {
    content: `${content.slice(0, themeMatch.index)}\n\n${validationBlock}\n${content.slice(themeMatch.index)}`,
    inserted: true,
    updated: true,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
