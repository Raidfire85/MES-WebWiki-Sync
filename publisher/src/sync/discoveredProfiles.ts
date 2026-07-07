import * as fs from 'fs/promises';
import * as path from 'path';

export interface DiscoveredProfile {
  profileCs: string;
  header: string | null;
  htmlFile: string;
  title: string;
  blurb: string;
  tagCount: number;
  author: string;
}

export interface DiscoveredProfilesFile {
  version: 1;
  profiles: DiscoveredProfile[];
}

export async function loadDiscoveredProfilesFile(
  wikiDir: string
): Promise<DiscoveredProfilesFile> {
  const filePath = path.join(wikiDir, 'discovered-profiles.json');

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as DiscoveredProfilesFile;
    if (parsed?.version === 1 && Array.isArray(parsed.profiles)) {
      return parsed;
    }
  } catch {
    // No discovered profiles yet.
  }

  return { version: 1, profiles: [] };
}

export async function saveDiscoveredProfilesFile(
  wikiDir: string,
  profiles: DiscoveredProfile[]
): Promise<void> {
  const filePath = path.join(wikiDir, 'discovered-profiles.json');
  const payload: DiscoveredProfilesFile = { version: 1, profiles };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function discoveredProfilesToHeaderMap(
  profiles: DiscoveredProfile[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const profile of profiles) {
    if (profile.header) {
      map[profile.header] = profile.htmlFile;
    }
  }
  return map;
}
