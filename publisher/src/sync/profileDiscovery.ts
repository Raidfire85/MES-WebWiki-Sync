import * as fs from 'fs/promises';
import * as path from 'path';
import { findProfileFile } from './tagMetaParser';
import { getTagMetaFromSource, TagMetaMap } from './tagMetaParser';
import { NEW_PROFILE_PAGES, PAGE_MAP } from './constants';
import {
  DiscoveredProfile,
  loadDiscoveredProfilesFile,
  saveDiscoveredProfilesFile,
} from './discoveredProfiles';
import { STATIC_PROFILE_HEADERS } from './profileHeaders';

const PROFILE_MANAGER = 'ProfileManager.cs';

/** Profile .cs files whose tags are documented on an existing Meridius wiki page. */
const MERIDIUS_WIKI_FOR_PROFILE_CS: Record<string, string> = {
  'BlockReplacementProfile.cs': 'Block-Replacement-Profiles.html',
  'DerelictionProfile.cs': 'Dereliction.html',
  'EventProfile.cs': 'Event.html',
  'LootProfile.cs': 'Loot.html',
  'ManipulationProfile.cs': 'Manipulation.html',
  'ReplenishmentProfile.cs': 'Replenishment.html',
  'TriggerGroupProfile.cs': 'Trigger-Group.html',
  'WaypointProfile.cs': 'Waypoint.html',
  'WeaponModRulesProfile.cs': 'Weapon-Mod-Rules.html',
  'ZoneConditionsProfile.cs': 'Zone-Conditions.html',
};

const RUNTIME_ONLY_PROFILE_CS = new Set(['EventGroupProfile.cs']);

const KNOWN_PROFILE_BLURBS: Record<string, string> = Object.fromEntries(
  NEW_PROFILE_PAGES.map((p) => [
    p.profile,
    p.blurb,
  ])
);

export function getPageMapProfileCsFiles(): Set<string> {
  const handled = new Set<string>();
  for (const cfg of Object.values(PAGE_MAP)) {
    if (cfg.profile) {
      handled.add(cfg.profile);
    }
  }
  return handled;
}

const AUTO_MANAGED_HTML = new Set(NEW_PROFILE_PAGES.map((page) => page.file));

export async function findAllProfileCsFiles(mesSourcePath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (/Profile\.cs$/i.test(entry.name)) {
        files.push(entry.name);
      }
    }
  }

  await walk(mesSourcePath);
  return [...new Set(files)].sort();
}

export async function parseProfileManagerHeaders(
  mesSourcePath: string
): Promise<Map<string, string>> {
  const managerPath = await findProfileFile(mesSourcePath, PROFILE_MANAGER);
  const map = new Map<string, string>();

  if (!managerPath) {
    return map;
  }

  const content = await fs.readFile(managerPath, 'utf8');
  const blocks = content.split(/\r?\n\s*if\s*\(/);

  for (const block of blocks) {
    const profileMatch = block.match(/(\w+?)Profiles/);
    const headerMatch = block.match(/DescriptionText\.Contains\("(\[[^\]]+\])"\)/);
    if (!profileMatch || !headerMatch) {
      continue;
    }

    map.set(profileMatch[1], headerMatch[1]);
  }

  return map;
}

export function profileCsToHtmlFile(profileCs: string): string {
  const base = profileCs.replace(/\.cs$/i, '').replace(/Profile$/i, '');
  const parts = base.split(/(?=[A-Z])/).filter(Boolean);
  const titled = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('-');
  return `${titled}-Profile.html`;
}

export function profileCsToTitle(profileCs: string): string {
  const base = profileCs.replace(/\.cs$/i, '').replace(/Profile$/i, '');
  const parts = base.split(/(?=[A-Z])/).filter(Boolean);
  return parts.join(' ');
}

export function resolveHeaderForProfile(
  profileCs: string,
  managerHeaders: Map<string, string>
): string | null {
  const stem = normalizeProfileStem(profileCs.replace(/\.cs$/i, '').replace(/Profile$/i, ''));

  for (const [dictionaryStem, header] of managerHeaders) {
    if (normalizeProfileStem(dictionaryStem) === stem) {
      return header;
    }
  }

  return null;
}

function normalizeProfileStem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isInternalProfileDuplicate(profileCs: string, handled: Set<string>): boolean {
  if (profileCs.endsWith('ReferenceProfile.cs') || profileCs.endsWith('Reference.cs')) {
    return false;
  }

  const variants = [
    profileCs.replace(/Profile\.cs$/i, 'ReferenceProfile.cs'),
    profileCs.replace(/Profile\.cs$/i, 'Reference.cs'),
  ];

  return variants.some((variant) => handled.has(variant));
}

function shouldSkipExistingWikiPage(
  htmlFile: string,
  header: string | null,
  wikiFiles: Set<string>,
  discoveredHtmlFiles: Set<string>
): boolean {
  if (AUTO_MANAGED_HTML.has(htmlFile) || discoveredHtmlFiles.has(htmlFile)) {
    return false;
  }

  if (wikiFiles.has(htmlFile)) {
    return true;
  }

  if (header && STATIC_PROFILE_HEADERS[header]) {
    const mapped = STATIC_PROFILE_HEADERS[header];
    return wikiFiles.has(mapped) && mapped !== htmlFile;
  }

  return false;
}

function profileConfigForCs(profileCs: string): (typeof NEW_PROFILE_PAGES)[number] | undefined {
  return NEW_PROFILE_PAGES.find((page) => page.profile === profileCs);
}

export async function discoverAutoManagedProfiles(
  mesSourcePath: string,
  wikiDir: string
): Promise<DiscoveredProfile[]> {
  const pageMapHandled = getPageMapProfileCsFiles();
  const managerHeaders = await parseProfileManagerHeaders(mesSourcePath);
  const wikiFiles = new Set(
    (await fs.readdir(wikiDir)).filter((file) => file.endsWith('.html'))
  );
  const existingDiscovered = await loadDiscoveredProfilesFile(wikiDir);
  const discoveredHtmlFiles = new Set(existingDiscovered.profiles.map((p) => p.htmlFile));
  const profileCsFiles = await findAllProfileCsFiles(mesSourcePath);

  const candidateCs = new Set<string>();
  for (const page of NEW_PROFILE_PAGES) {
    candidateCs.add(page.profile);
  }
  for (const profileCs of profileCsFiles) {
    candidateCs.add(profileCs);
  }
  for (const profile of existingDiscovered.profiles) {
    candidateCs.add(profile.profileCs);
  }

  const results: DiscoveredProfile[] = [];

  for (const profileCs of [...candidateCs].sort()) {
    if (RUNTIME_ONLY_PROFILE_CS.has(profileCs)) {
      continue;
    }

    if (pageMapHandled.has(profileCs) || isInternalProfileDuplicate(profileCs, pageMapHandled)) {
      continue;
    }

    const meta = await getTagMetaFromSource(mesSourcePath, profileCs);
    if (Object.keys(meta).length === 0) {
      continue;
    }

    const knownPage = profileConfigForCs(profileCs);
    const header = resolveHeaderForProfile(profileCs, managerHeaders);
    const htmlFile = knownPage?.file ?? profileCsToHtmlFile(profileCs);

    if (MERIDIUS_WIKI_FOR_PROFILE_CS[profileCs] && wikiFiles.has(MERIDIUS_WIKI_FOR_PROFILE_CS[profileCs])) {
      continue;
    }

    if (shouldSkipExistingWikiPage(htmlFile, header, wikiFiles, discoveredHtmlFiles)) {
      continue;
    }

    results.push({
      profileCs,
      header,
      htmlFile,
      title: knownPage?.title ?? profileCsToTitle(profileCs),
      blurb: buildBlurb(profileCs, header),
      tagCount: Object.keys(meta).length,
      author: 'MeridiusIX',
    });
  }

  return results;
}

/** @deprecated Use discoverAutoManagedProfiles */
export async function discoverNewProfiles(
  mesSourcePath: string,
  wikiDir: string
): Promise<DiscoveredProfile[]> {
  return discoverAutoManagedProfiles(mesSourcePath, wikiDir);
}

function buildBlurb(profileCs: string, header: string | null): string {
  if (KNOWN_PROFILE_BLURBS[profileCs]) {
    return KNOWN_PROFILE_BLURBS[profileCs];
  }

  const title = profileCsToTitle(profileCs);
  if (header) {
    return `${title} profiles use the ${header} header in SBC Description blocks.`;
  }

  return `${title} profile tags parsed from MES source.`;
}

export { saveDiscoveredProfilesFile } from './discoveredProfiles';

export async function getTagMetaForProfile(
  mesSourcePath: string,
  profileCs: string
): Promise<TagMetaMap> {
  return getTagMetaFromSource(mesSourcePath, profileCs);
}
