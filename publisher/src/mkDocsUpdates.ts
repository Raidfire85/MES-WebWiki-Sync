import * as fs from 'fs/promises';
import * as path from 'path';
import { contentEquals } from './syncBridge';
import {
  WEBWIKI_UPDATES_SYNC_END,
  WEBWIKI_UPDATES_SYNC_START,
} from './constants';
import type { WebWikiPublishResult } from './types';
import {
  buildPublishHighlights,
  formatDisplayDate,
  formatSourceDisplayLabel,
  highlightToPlainText,
  legacyLineToHighlight,
  renderHighlightHtml,
  type WikiUpdateHighlight,
} from './wikiUpdatesFormat';

const HOME_FILE = 'index.md';
const HISTORY_FILE = 'mes-wiki-updates.json';
const MAX_HISTORY_RUNS = 8;

export interface WikiUpdateRun {
  date: string;
  source: string;
  highlights: WikiUpdateHighlight[];
}

export interface WikiUpdatesHistoryV2 {
  version: 2;
  runs: WikiUpdateRun[];
}

type WikiUpdatesHistoryFile = WikiUpdatesHistoryV2 | WikiUpdatesHistoryLegacy;

interface WikiUpdatesHistoryLegacy {
  version: 1;
  runs: Array<{
    date: string;
    source: string;
    lines?: string[];
    highlights?: WikiUpdateHighlight[];
  }>;
}

export function buildUpdatesEmbed(history: WikiUpdatesHistoryV2): string {
  const normalized = normalizeHistory(history);
  const latest = normalized.runs[0];
  const lines: string[] = [];

  lines.push('<div class="mes-wiki-updates">');
  lines.push('<p class="mes-wiki-updates-label">What\'s new</p>');
  lines.push(
    '<p class="mes-wiki-updates-summary">Recent changes to profile pages, tags, and sidebar navigation from the MES framework.</p>'
  );

  if (!latest) {
    lines.push(
      '<p class="mes-wiki-updates-meta">Documentation is up to date. New changes will be listed here when the wiki is refreshed.</p>'
    );
    lines.push('</div>');
    return lines.join('\n');
  }

  lines.push(
    `<p class="mes-wiki-updates-meta"><strong>Last updated:</strong> ${escapeHtml(formatDisplayDate(latest.date))}</p>`
  );
  lines.push(
    `<p class="mes-wiki-updates-source">${escapeHtml(formatSourceDisplayLabel(latest.source))}</p>`
  );
  lines.push('<ul class="mes-wiki-updates-latest">');
  for (const highlight of latest.highlights) {
    lines.push(`<li>${renderHighlightHtml(highlight)}</li>`);
  }
  lines.push('</ul>');

  if (normalized.runs.length > 1) {
    lines.push('<details class="mes-wiki-updates-history">');
    lines.push('<summary>Earlier updates</summary>');
    for (const run of normalized.runs.slice(1)) {
      lines.push('<div class="mes-wiki-updates-history-entry">');
      lines.push(
        `<p class="mes-wiki-updates-history-date">${escapeHtml(formatDisplayDate(run.date))}</p>`
      );
      lines.push('<ul>');
      for (const highlight of run.highlights) {
        lines.push(`<li>${renderHighlightHtml(highlight)}</li>`);
      }
      lines.push('</ul>');
      lines.push('</div>');
    }
    lines.push('</details>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

export function buildUpdatesSyncBlock(history: WikiUpdatesHistoryV2): string {
  return `${WEBWIKI_UPDATES_SYNC_START}
${buildUpdatesEmbed(history)}
${WEBWIKI_UPDATES_SYNC_END}`;
}

export function summarizePublishRun(result: WebWikiPublishResult): WikiUpdateHighlight[] {
  return buildPublishHighlights(result);
}

export function recordPublishRun(
  history: WikiUpdatesHistoryV2,
  result: WebWikiPublishResult
): WikiUpdatesHistoryV2 {
  const highlights = summarizePublishRun(result);

  if (highlights.length === 0) {
    return normalizeHistory(history);
  }

  const run: WikiUpdateRun = {
    date: formatDateUtc(new Date()),
    source: result.sourceLabel,
    highlights,
  };

  const runs = [run, ...history.runs.filter((entry) => !sameRun(entry, run))].slice(
    0,
    MAX_HISTORY_RUNS
  );

  return normalizeHistory({ version: 2, runs });
}

export async function loadUpdatesHistory(docsDir: string): Promise<WikiUpdatesHistoryV2> {
  const filePath = path.join(docsDir, HISTORY_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as WikiUpdatesHistoryFile;
    return normalizeHistory(migrateHistory(parsed));
  } catch {
    // First run.
  }

  return { version: 2, runs: [] };
}

export async function saveUpdatesHistory(
  docsDir: string,
  history: WikiUpdatesHistoryV2,
  write: boolean
): Promise<void> {
  if (!write) {
    return;
  }

  const filePath = path.join(docsDir, HISTORY_FILE);
  await fs.writeFile(filePath, `${JSON.stringify(normalizeHistory(history), null, 2)}\n`, 'utf8');
}

export function injectUpdatesBlockIntoHome(content: string, history: WikiUpdatesHistoryV2): string {
  const block = buildUpdatesSyncBlock(history).trim();
  const updatesPattern = new RegExp(
    `${escapeRegex(WEBWIKI_UPDATES_SYNC_START)}[\\s\\S]*?${escapeRegex(WEBWIKI_UPDATES_SYNC_END)}`,
    'm'
  );

  if (updatesPattern.test(content)) {
    return content.replace(updatesPattern, block);
  }

  const marker = 'Here is what to expect in each section:';
  const markerIndex = content.indexOf(marker);
  if (markerIndex !== -1) {
    return `${content.slice(0, markerIndex).trimEnd()}\n\n${block}\n\n${content.slice(markerIndex)}`;
  }

  return `${content.trimEnd()}\n\n${block}\n`;
}

export async function applyHomeUpdates(
  docsDir: string,
  result: WebWikiPublishResult,
  write: boolean
): Promise<{ changed: boolean }> {
  const homePath = path.join(docsDir, HOME_FILE);
  let content = '';

  try {
    content = await fs.readFile(homePath, 'utf8');
  } catch {
    return { changed: false };
  }

  let history = await loadUpdatesHistory(docsDir);
  const embedHistory = write
    ? recordPublishRun(history, result)
    : normalizeHistory({
        version: 2,
        runs: [
          {
            date: formatDateUtc(new Date()),
            source: result.sourceLabel,
            highlights: summarizePublishRun(result),
          },
          ...history.runs,
        ],
      });

  if (write) {
    history = embedHistory;
    await saveUpdatesHistory(docsDir, history, write);
  }

  const next = injectUpdatesBlockIntoHome(content, embedHistory);
  if (contentEquals(content, next)) {
    return { changed: false };
  }

  if (write) {
    await fs.writeFile(homePath, next, 'utf8');
  }

  return { changed: true };
}

function migrateHistory(history: WikiUpdatesHistoryFile): WikiUpdatesHistoryV2 {
  if (history.version === 2) {
    return history;
  }

  return {
    version: 2,
    runs: history.runs.map((run) => ({
      date: run.date,
      source: run.source,
      highlights:
        run.highlights ??
        (run.lines ?? [])
          .map((line) => legacyLineToHighlight(line))
          .filter((highlight): highlight is WikiUpdateHighlight => Boolean(highlight)),
    })),
  };
}

function normalizeHistory(history: WikiUpdatesHistoryV2): WikiUpdatesHistoryV2 {
  const runs = history.runs
    .map((run) => ({
      date: run.date,
      source: run.source,
      highlights: run.highlights.filter((highlight) => highlight.segments.length > 0),
    }))
    .filter((run) => run.highlights.length > 0)
    .slice(0, MAX_HISTORY_RUNS);

  return { version: 2, runs };
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sameRun(a: WikiUpdateRun, b: WikiUpdateRun): boolean {
  return (
    a.date === b.date &&
    a.highlights.map(highlightToPlainText).join('|') ===
      b.highlights.map(highlightToPlainText).join('|')
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
