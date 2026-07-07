import * as fs from 'fs/promises';
import * as path from 'path';
import {
  findAllProfileCsFiles,
  getPageMapProfileCsFiles,
  getTagMetaFromSource,
  isInternalProfileDuplicate,
  loadDiscoveredProfilesFile,
  NEW_PROFILE_PAGES,
  parseProfileManagerHeaders,
  profileCsToHtmlFile,
  profileCsToTitle,
  resolveHeaderForProfile,
  STATIC_PROFILE_HEADERS,
} from './syncBridge';
import type { DiscoveredProfile } from './types';
import {
  extensionHtmlToWebWikiMd,
  WEBWIKI_MERIDIUS_PROFILE_CS,
  WEBWIKI_SYNC_START,
} from './constants';
import { getProfileMdFile, isPublisherManagedProfilePage } from './profilePlacements';

const RUNTIME_ONLY_PROFILE_CS = new Set(['EventGroupProfile.cs']);

const KNOWN_PROFILE_BLURBS: Record<string, string> = Object.fromEntries(
  NEW_PROFILE_PAGES.map((page) => [page.profile, page.blurb])
);

function profileConfigForCs(profileCs: string) {
  return NEW_PROFILE_PAGES.find((page) => page.profile === profileCs);
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

function shouldSkipExistingWebWikiPage(
  profileCs: string,
  mdFile: string,
  header: string | null,
  wikiFiles: Set<string>,
  discoveredMdFiles: Set<string>
): boolean {
  if (discoveredMdFiles.has(mdFile)) {
    return false;
  }

  if (isPublisherManagedProfilePage(profileCs, mdFile)) {
    return false;
  }

  if (wikiFiles.has(mdFile)) {
    return true;
  }

  if (header && STATIC_PROFILE_HEADERS[header]) {
    const mapped = extensionHtmlToWebWikiMd(STATIC_PROFILE_HEADERS[header]);
    return wikiFiles.has(mapped) && mapped !== mdFile;
  }

  return false;
}

export async function discoverWebWikiProfiles(
  mesSourcePath: string,
  docsDir: string
): Promise<DiscoveredProfile[]> {
  const pageMapHandled = getPageMapProfileCsFiles();
  const managerHeaders = await parseProfileManagerHeaders(mesSourcePath);
  const wikiFiles = new Set<string>(
    (await fs.readdir(docsDir)).filter((file: string) => file.endsWith('.md'))
  );
  const existingDiscovered = await loadDiscoveredProfilesFile(docsDir);
  const discoveredMdFiles = new Set(
    existingDiscovered.profiles.map((profile) =>
      getProfileMdFile(profile.profileCs, profile.htmlFile, profile.header)
    )
  );
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
    const mdFile = getProfileMdFile(profileCs, htmlFile, header);

    const meridiusMd = WEBWIKI_MERIDIUS_PROFILE_CS[profileCs];
    if (meridiusMd && wikiFiles.has(meridiusMd) && meridiusMd === mdFile) {
      const meridiusPath = path.join(docsDir, meridiusMd);
      try {
        const meridiusContent = await fs.readFile(meridiusPath, 'utf8');
        if (!meridiusContent.includes(WEBWIKI_SYNC_START)) {
          continue;
        }
      } catch {
        continue;
      }
    }

    if (shouldSkipExistingWebWikiPage(profileCs, mdFile, header, wikiFiles, discoveredMdFiles)) {
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
