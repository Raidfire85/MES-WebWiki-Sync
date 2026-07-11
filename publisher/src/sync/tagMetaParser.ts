import * as fs from 'fs/promises';
import * as path from 'path';

const TAG_PARSE_REGEX = /\{\s*"([A-Za-z][A-Za-z0-9_-]*)", \(s, o\) => TagParse\.Tag(\w+)Check/g;
const CONTAINS_TAG_PARSE_REGEX =
  /tag\.Contains\(\s*"\[([A-Za-z0-9_-]+):[^"]*"\)[\s\S]*?TagParse\.Tag(\w+)Check/g;
const STARTS_WITH_TAG_PARSE_REGEX =
  /tag\.StartsWith\(\s*"\[([A-Za-z0-9_-]+):[^"]*"\)[\s\S]*?TagParse\.Tag(\w+)Check/g;
const CONTAINS_REGEX = /tag\.Contains\("\[([A-Za-z0-9_-]+):/g;
const STARTS_WITH_REGEX = /tag\.StartsWith\("\[([A-Za-z0-9_-]+)/g;
const CUSTOM_DATA_CONTAINS_REGEX = /customData\.Contains\("\[([A-Za-z0-9_-]+):/g;

export type TagMetaMap = Record<string, string>;

export async function findProfileFile(
  mesSourcePath: string,
  profileFileName: string
): Promise<string | null> {
  return findFileRecursive(mesSourcePath, profileFileName);
}

async function findFileRecursive(dir: string, fileName: string): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileRecursive(fullPath, fileName);
      if (found) {
        return found;
      }
      continue;
    }

    if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
  }

  return null;
}

export async function getTagMetaFromSource(
  mesSourcePath: string,
  profileFileName: string
): Promise<TagMetaMap> {
  const filePath = await findProfileFile(mesSourcePath, profileFileName);
  if (!filePath) {
    return {};
  }

  const content = await fs.readFile(filePath, 'utf8');
  return parseTagMetaFromContent(content);
}

/** Resolve parse types for extra tags declared outside the primary profile file (e.g. behavior subclasses). */
export async function getExtraTagMetaFromMesSource(
  mesSourcePath: string,
  tagNames: string[]
): Promise<TagMetaMap> {
  const wanted = new Set(tagNames.filter(Boolean));
  if (wanted.size === 0) {
    return {};
  }

  const meta: TagMetaMap = {};
  await scanMesSourceForTags(mesSourcePath, wanted, meta);
  return meta;
}

async function scanMesSourceForTags(
  dir: string,
  wanted: Set<string>,
  meta: TagMetaMap
): Promise<void> {
  if (wanted.size === 0) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (wanted.size === 0) {
      return;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanMesSourceForTags(fullPath, wanted, meta);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.cs')) {
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    const parsed = parseTagMetaFromContent(content);
    for (const tagName of wanted) {
      if (parsed[tagName] && !meta[tagName]) {
        meta[tagName] = parsed[tagName];
        wanted.delete(tagName);
      }
    }
  }
}

export async function buildPageTagMeta(
  mesSourcePath: string,
  profileFileName: string | null | undefined,
  extraTags?: string[]
): Promise<TagMetaMap> {
  const meta: TagMetaMap = profileFileName
    ? await getTagMetaFromSource(mesSourcePath, profileFileName)
    : {};

  const missingExtra = (extraTags ?? []).filter((tag) => !meta[tag]);
  if (missingExtra.length === 0) {
    return meta;
  }

  const extraMeta = await getExtraTagMetaFromMesSource(mesSourcePath, missingExtra);
  return { ...meta, ...extraMeta };
}

export function parseTagMetaFromContent(content: string): TagMetaMap {
  const meta: TagMetaMap = {};

  for (const match of content.matchAll(TAG_PARSE_REGEX)) {
    meta[match[1]] = match[2];
  }

  for (const match of content.matchAll(CONTAINS_TAG_PARSE_REGEX)) {
    if (!meta[match[1]]) {
      meta[match[1]] = match[2];
    }
  }

  for (const match of content.matchAll(STARTS_WITH_TAG_PARSE_REGEX)) {
    if (!meta[match[1]]) {
      meta[match[1]] = match[2];
    }
  }

  for (const match of content.matchAll(CONTAINS_REGEX)) {
    if (!meta[match[1]]) {
      meta[match[1]] = 'Contains';
    }
  }

  for (const match of content.matchAll(STARTS_WITH_REGEX)) {
    if (!meta[match[1]]) {
      meta[match[1]] = 'StartsWith';
    }
  }

  for (const match of content.matchAll(CUSTOM_DATA_CONTAINS_REGEX)) {
    if (!meta[match[1]]) {
      meta[match[1]] = 'CustomDataContains';
    }
  }

  return meta;
}
