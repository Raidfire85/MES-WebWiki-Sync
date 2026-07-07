import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { WORKSHOP_MES_SOURCE_PATH } from './constants';

export const MES_SOURCE_FOLDER_NAME = 'ModularEncountersSystems';
const PROFILE_MANAGER = 'ProfileManager.cs';
const STEAM_APP_ID = '244850';

export interface DiscoveredMesSource {
  sourcePath: string;
  label: string;
}

export async function isValidMesSourceFolder(sourcePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  if (await fileExists(path.join(sourcePath, PROFILE_MANAGER))) {
    return true;
  }

  return (await findFileRecursive(sourcePath, PROFILE_MANAGER)) !== null;
}

/** Search local installs when GitHub sync is unavailable. */
export async function discoverLocalMesSource(
  configuredPath?: string
): Promise<DiscoveredMesSource | null> {
  const seen = new Set<string>();
  const candidates: Array<{ sourcePath: string; label: string }> = [];

  const addCandidate = (sourcePath: string, label: string): void => {
    const normalized = path.normalize(sourcePath).toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push({ sourcePath, label });
  };

  if (configuredPath?.trim()) {
    addCandidate(configuredPath.trim(), 'configured local folder');
  }

  addCandidate(WORKSHOP_MES_SOURCE_PATH, 'Steam workshop MES');

  for (const workshopRoot of await getSteamWorkshopRoots()) {
    await collectWorkshopCandidates(workshopRoot, addCandidate);
  }

  await collectLocalModCandidates(addCandidate);

  for (const candidate of candidates) {
    if (await isValidMesSourceFolder(candidate.sourcePath)) {
      return candidate;
    }
  }

  return null;
}

async function collectWorkshopCandidates(
  workshopRoot: string,
  addCandidate: (sourcePath: string, label: string) => void
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(workshopRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const mesPath = path.join(
      workshopRoot,
      entry.name,
      'Data',
      'Scripts',
      MES_SOURCE_FOLDER_NAME
    );
    addCandidate(mesPath, `Steam workshop (${entry.name})`);
  }
}

async function collectLocalModCandidates(
  addCandidate: (sourcePath: string, label: string) => void
): Promise<void> {
  const modsRoot = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
    'SpaceEngineers',
    'Mods'
  );

  let entries;
  try {
    entries = await fs.readdir(modsRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const mesPath = path.join(modsRoot, entry.name, 'Data', 'Scripts', MES_SOURCE_FOLDER_NAME);
    addCandidate(mesPath, `local mod (${entry.name})`);
  }
}

async function getSteamWorkshopRoots(): Promise<string[]> {
  const roots = new Set<string>();

  const defaultSteam = 'C:\\Program Files (x86)\\Steam\\steamapps';
  await addWorkshopRootFromSteamLibrary(roots, defaultSteam);

  const libraryFoldersVdf = path.join(defaultSteam, 'libraryfolders.vdf');
  try {
    const text = await fs.readFile(libraryFoldersVdf, 'utf8');
    for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      const libraryPath = match[1].replace(/\\\\/g, '\\');
      await addWorkshopRootFromSteamLibrary(roots, path.join(libraryPath, 'steamapps'));
    }
  } catch {
    // Single-library Steam install is enough.
  }

  return [...roots];
}

async function addWorkshopRootFromSteamLibrary(
  roots: Set<string>,
  steamAppsPath: string
): Promise<void> {
  try {
    const stat = await fs.stat(steamAppsPath);
    if (!stat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  roots.add(path.join(steamAppsPath, 'workshop', 'content', STEAM_APP_ID));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function findFileRecursive(root: string, fileName: string): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(full, fileName);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}
