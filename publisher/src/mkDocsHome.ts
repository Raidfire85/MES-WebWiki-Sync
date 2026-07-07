import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals } from './syncBridge';
import { WEBWIKI_HOME_SYNC_END, WEBWIKI_HOME_SYNC_START } from './constants';

const HOME_FILE = 'index.md';

const HOME_INTRO_BODY = `# Welcome to the Modular Encounters Systems Wiki!

This mod is a combination of the Modular Encounters Spawner and RivalAI frameworks. In this wiki you will find resources for several topics relating to configuring the mod settings, resources for building your own mods using this framework, and troubleshooting resources.

If you are having issues with the mod framework, or any of the mods that utilize it, start with the **Player Support** section in the sidebar. That section answers common questions and provides troubleshooting steps for many of the more common issues people may encounter.

Here is what to expect in each section:

- **Player Support:** Common troubleshooting and FAQs for players and server admins.
- **Admin & Configuration:** Information on MES configuration options, where to find them, and how to activate them.
- **Modding:** Tags and profiles used in mods that utilize MES.
- **Template / Example Files:** SBC templates you can use to start building your own mod.
- **Modder Resources:** Pre-made profiles, scripting API, and other tips for developing MES-enabled mods.
- **Mod Repositories:** Example NPC mods you can study to see how profiles and tags come together.`;

export function buildHomePageContent(): string {
  return `${WEBWIKI_HOME_SYNC_START}
${HOME_INTRO_BODY.trim()}
${WEBWIKI_HOME_SYNC_END}
`;
}

export function isPlaceholderHomePage(content: string): boolean {
  const stripped = content.replace(/\s+/g, ' ').trim().toLowerCase();
  return (
    stripped === '#index.md hello world' ||
    stripped === 'hello world' ||
    stripped === '# index.md hello world' ||
    /^#\s*index\.md\s*hello world$/i.test(content.trim())
  );
}

export function removeHomeSyncBlock(content: string): string {
  if (!content.includes(WEBWIKI_HOME_SYNC_START)) {
    return content;
  }

  const pattern = new RegExp(
    `${escapeRegex(WEBWIKI_HOME_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_HOME_SYNC_END)}\\n?`,
    'g'
  );
  return content.replace(pattern, '').trimEnd();
}

export function injectHomePageIntro(content: string): string {
  const block = buildHomePageContent();
  if (content.includes(WEBWIKI_HOME_SYNC_START)) {
    const pattern = new RegExp(
      `${escapeRegex(WEBWIKI_HOME_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_HOME_SYNC_END)}`,
      'm'
    );
    return content.replace(pattern, block.trim());
  }

  if (isPlaceholderHomePage(content)) {
    return `${block.trim()}\n`;
  }

  return `${removeHomeSyncBlock(content).trimEnd()}\n\n${block.trim()}\n`;
}

export async function ensureHomePage(
  docsDir: string,
  write: boolean
): Promise<{ changed: boolean; action: 'created' | 'updated' | 'skipped' }> {
  const homePath = path.join(docsDir, HOME_FILE);
  let existing = '';

  try {
    existing = await fs.readFile(homePath, 'utf8');
  } catch {
    const next = buildHomePageContent().trim() + '\n';
    if (write) {
      await fs.writeFile(homePath, next, 'utf8');
    }
    return { changed: true, action: 'created' };
  }

  if (!isPlaceholderHomePage(existing) && !existing.includes(WEBWIKI_HOME_SYNC_START)) {
    return { changed: false, action: 'skipped' };
  }

  const next = injectHomePageIntro(existing);
  if (contentEquals(existing, next)) {
    return { changed: false, action: 'skipped' };
  }

  if (write) {
    await fs.writeFile(homePath, next, 'utf8');
  }

  return { changed: true, action: 'updated' };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
