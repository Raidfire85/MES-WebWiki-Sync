/**
 * Optional: refresh publisher/src/sync/ from an upstream checkout (MES-WebWiki-Sync development only).
 * Run after changing extension src/wikiSync or src/sbc/profileHeaders.ts.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extensionRepo = path.resolve(repoRoot, '..', 'VS MES Reference Library');
const syncOut = path.join(repoRoot, 'publisher', 'src', 'sync');

const copies = [
  ['src/wikiSync/constants.ts', 'constants.ts'],
  ['src/wikiSync/tagMetaParser.ts', 'tagMetaParser.ts'],
  ['src/wikiSync/typeHints.ts', 'typeHints.ts'],
  ['src/wikiSync/wikiHtml.ts', 'wikiHtml.ts'],
  ['src/wikiSync/discoveredProfiles.ts', 'discoveredProfiles.ts'],
  ['src/wikiSync/mesSourceDiscovery.ts', 'mesSourceDiscovery.ts'],
  ['src/sbc/profileHeaders.ts', 'profileHeaders.ts'],
];

const profileDiscoverySource = path.join(extensionRepo, 'src/wikiSync/profileDiscovery.ts');
const profileDiscoveryDest = path.join(syncOut, 'profileDiscovery.ts');

if (!(await pathExists(extensionRepo))) {
  console.warn(`Extension repo not found at ${extensionRepo}`);
  console.warn('Skipping vendor-sync — using bundled sync modules.');
  process.exit(0);
}

await fs.mkdir(syncOut, { recursive: true });

for (const [fromRel, toName] of copies) {
  const from = path.join(extensionRepo, fromRel);
  let text = await fs.readFile(from, 'utf8');
  text = text.replace(
    "from '../sbc/profileHeaders'",
    "from './profileHeaders'"
  );
  if (toName === 'wikiHtml.ts') {
    text = `export function normalizeContent(content: string): string {
  return content.replace(/\\r\\n/g, '\\n');
}

export function contentEquals(a: string, b: string): boolean {
  return normalizeContent(a) === normalizeContent(b);
}
`;
  }
  await fs.writeFile(path.join(syncOut, toName), text, 'utf8');
  console.log(`  copied ${fromRel} -> sync/${toName}`);
}

let profileDiscovery = await fs.readFile(profileDiscoverySource, 'utf8');
profileDiscovery = profileDiscovery.replace(
  "from '../sbc/profileHeaders'",
  "from './profileHeaders'"
);
await fs.writeFile(profileDiscoveryDest, profileDiscovery, 'utf8');
console.log('  copied src/wikiSync/profileDiscovery.ts -> sync/profileDiscovery.ts');

console.log('Vendor sync complete.');

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
