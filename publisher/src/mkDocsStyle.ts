import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals } from './syncBridge';
import { WEBWIKI_STYLE_SYNC_END, WEBWIKI_STYLE_SYNC_START } from './constants';

/** Hide MkDocs footer prev/next + style the home-page updates embed. */
const STYLE_SYNC_BLOCK = `${WEBWIKI_STYLE_SYNC_START}
/* Match live WebWiki: no footer Previous/Next buttons (newer MkDocs adds them by default). */
.rst-footer-buttons,
footer .rst-footer-buttons {
  display: none !important;
}

/* Home page — wiki updates callout (MES-WEBWIKI-UPDATES-SYNC block in index.md). */
.mes-wiki-updates {
  border: 1px solid #3d6f8f;
  border-left: 4px solid #55a5d9;
  background: linear-gradient(135deg, #2a3238 0%, #1f2a30 100%);
  padding: 1em 1.25em;
  margin: 1.5em 0 2em;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mes-wiki-updates-label {
  margin: 0 0 0.35em;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #55a5d9;
}

.mes-wiki-updates-summary {
  margin: 0 0 0.75em;
  color: #c8d4dc;
}

.mes-wiki-updates-meta {
  margin: 0 0 0.25em;
  color: #d9d9d9;
}

.mes-wiki-updates-source {
  margin: 0 0 0.75em;
  font-size: 0.92em;
  color: #9eb3c2;
}

.mes-wiki-updates a {
  color: #7ec8ff;
  text-decoration: none;
}

.mes-wiki-updates a:hover {
  text-decoration: underline;
}

.mes-wiki-updates-latest,
.mes-wiki-updates-history ul {
  margin: 0 0 0.75em 1.1em;
  padding: 0;
}

.mes-wiki-updates-history-entry {
  margin-bottom: 0.85em;
}

.mes-wiki-updates-history-date {
  margin: 0 0 0.35em;
  font-weight: 600;
  color: #c8d4dc;
}

.mes-wiki-updates-history summary {
  cursor: pointer;
  color: #55a5d9;
  margin-bottom: 0.5em;
}
${WEBWIKI_STYLE_SYNC_END}`;

export async function ensureWebWikiStylePatches(
  docsDir: string,
  write: boolean
): Promise<{ changed: boolean }> {
  const stylePath = path.join(docsDir, 'style.css');
  let existing = '';

  try {
    existing = await fs.readFile(stylePath, 'utf8');
  } catch {
    return { changed: false };
  }

  let next: string;
  const pattern = new RegExp(
    `${escapeRegex(WEBWIKI_STYLE_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_STYLE_SYNC_END)}`,
    'm'
  );

  if (pattern.test(existing)) {
    next = existing.replace(pattern, STYLE_SYNC_BLOCK.trim());
  } else {
    next = `${existing.trimEnd()}\n\n${STYLE_SYNC_BLOCK.trim()}\n`;
  }

  if (contentEquals(existing, next)) {
    return { changed: false };
  }

  if (write) {
    await fs.writeFile(stylePath, next, 'utf8');
  }

  return { changed: true };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
