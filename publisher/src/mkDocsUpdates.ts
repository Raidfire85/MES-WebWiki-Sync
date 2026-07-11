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
import { pageTitleFromMdFile } from './syncSectionCopy';

const HOME_FILE = 'index.md';
const HISTORY_FILE = 'mes-wiki-updates.json';
const MAX_HISTORY_RUNS = 8;

export interface WikiUpdateRun {
  date: string;
  source: string;
  highlights: WikiUpdateHighlight[];
}

/** Replaced on every sync run — not appended to history. */
export interface WikiLastSynced {
  date: string;
  source: string;
}

export interface WikiUpdatesHistoryV2 {
  version: 2;
  runs: WikiUpdateRun[];
  lastSynced?: WikiLastSynced;
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

  if (normalized.lastSynced) {
    lines.push(
      `<p class="mes-wiki-updates-meta"><strong>Last synced:</strong> ${escapeHtml(formatDisplayDate(normalized.lastSynced.date))} — ${escapeHtml(formatSourceDisplayLabel(normalized.lastSynced.source))}</p>`
    );
  }

  if (!latest) {
    lines.push(
      '<p class="mes-wiki-updates-meta">Documentation is up to date. No new profiles or tags since the last content update.</p>'
    );
    lines.push('</div>');
    return lines.join('\n');
  }

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

export function touchLastSynced(
  history: WikiUpdatesHistoryV2,
  result: WebWikiPublishResult
): WikiUpdatesHistoryV2 {
  return {
    ...normalizeHistory(history),
    lastSynced: {
      date: formatDateUtc(new Date()),
      source: result.sourceLabel,
    },
  };
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

  return normalizeHistory({ ...history, runs });
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

/** Clear homepage highlight history. Does not reset mes-wiki-sync-registry.json. */
export async function resetWhatsNewHistory(
  docsDir: string,
  write: boolean
): Promise<{ changed: boolean }> {
  const history: WikiUpdatesHistoryV2 = { version: 2, runs: [] };

  await saveUpdatesHistory(docsDir, history, write);

  const homePath = path.join(docsDir, HOME_FILE);
  let content = '';
  try {
    content = await fs.readFile(homePath, 'utf8');
  } catch {
    return { changed: false };
  }

  const next = injectUpdatesBlockIntoHome(content, history);
  if (contentEquals(content, next)) {
    return { changed: false };
  }

  if (write) {
    await fs.writeFile(homePath, next, 'utf8');
  }

  return { changed: true };
}

/** Profile pages under Modding → Economy & Station Blocks in mkdocs.yml. */
export const ECONOMY_STATION_BLOCK_PROFILES = [
  'Contract-Block-Profile.md',
  'Mission-Profile.md',
  'Safezone-Profile.md',
  'Shipyard-Profile.md',
  'Store-Profile.md',
] as const;

/** Profile pages under Modding → Suit Upgrades in mkdocs.yml. */
export const MODDING_SUIT_UPGRADE_PROFILES = ['Suit-Upgrades-Profile.md'] as const;

export async function announceProfilePagesInWhatsNew(
  docsDir: string,
  mdFiles: string[],
  options: {
    write: boolean;
    source: string;
    tagCountForPage: (mdFile: string) => number;
    navNote?: string;
  }
): Promise<{ changed: boolean }> {
  const highlights: WikiUpdateHighlight[] = mdFiles
    .filter((mdFile) => options.tagCountForPage(mdFile) > 0)
    .map((mdFile) => ({
      segments: [
        { type: 'text', value: 'New ' },
        { type: 'link', title: pageTitleFromMdFile(mdFile), mdFile },
        {
          type: 'text',
          value: ` profile page — ${options.tagCountForPage(mdFile)} tags documented.`,
        },
      ],
    }));

  if (options.navNote) {
    highlights.push({
      segments: [{ type: 'text', value: options.navNote }],
    });
  }

  if (highlights.length === 0) {
    return { changed: false };
  }

  const history = await loadUpdatesHistory(docsDir);
  const run: WikiUpdateRun = {
    date: formatDateUtc(new Date()),
    source: options.source,
    highlights,
  };

  const nextHistory = normalizeHistory({
    ...history,
    runs: [run, ...history.runs.filter((entry) => !sameRun(entry, run))],
    lastSynced: { date: run.date, source: options.source },
  });

  await saveUpdatesHistory(docsDir, nextHistory, options.write);

  const homePath = path.join(docsDir, HOME_FILE);
  let content = '';
  try {
    content = await fs.readFile(homePath, 'utf8');
  } catch {
    return { changed: false };
  }

  const next = injectUpdatesBlockIntoHome(content, nextHistory);
  if (contentEquals(content, next)) {
    return { changed: false };
  }

  if (options.write) {
    await fs.writeFile(homePath, next, 'utf8');
  }

  return { changed: true };
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
  const previewLastSynced: WikiLastSynced = {
    date: formatDateUtc(new Date()),
    source: result.sourceLabel,
  };

  if (write) {
    history = touchLastSynced(history, result);
    history = recordPublishRun(history, result);
    await saveUpdatesHistory(docsDir, history, write);
  }

  const embedHistory = write
    ? history
    : normalizeHistory({
        version: 2,
        lastSynced: previewLastSynced,
        runs: (() => {
          const highlights = summarizePublishRun(result);
          if (highlights.length === 0) {
            return history.runs;
          }
          return [
            {
              date: previewLastSynced.date,
              source: result.sourceLabel,
              highlights,
            },
            ...history.runs,
          ];
        })(),
      });

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
  const runs = mergeHistoryByDate(
    keepNovelHighlightsPerRun(
      dedupeRunsByHighlights(
        history.runs
          .map((run) => ({
            date: run.date,
            source: run.source,
            highlights: run.highlights.filter((highlight) => highlight.segments.length > 0),
          }))
          .filter((run) => run.highlights.length > 0)
      )
    )
  ).slice(0, MAX_HISTORY_RUNS);

  const normalized: WikiUpdatesHistoryV2 = { version: 2, runs };
  if (history.lastSynced) {
    normalized.lastSynced = history.lastSynced;
  }
  return normalized;
}

function dedupeRunsByHighlights(runs: WikiUpdateRun[]): WikiUpdateRun[] {
  const seen = new Set<string>();
  const deduped: WikiUpdateRun[] = [];

  for (const run of runs) {
    const fingerprint = runHighlightsFingerprint(run);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    deduped.push(run);
  }

  return deduped;
}

/** Drop highlight lines already shown in a newer run; remove runs that become empty. */
function keepNovelHighlightsPerRun(runs: WikiUpdateRun[]): WikiUpdateRun[] {
  const seenHighlights = new Set<string>();
  const pruned: WikiUpdateRun[] = [];

  for (const run of runs) {
    const novelHighlights = run.highlights.filter((highlight) => {
      const text = highlightToPlainText(highlight);
      return !seenHighlights.has(text);
    });

    if (novelHighlights.length === 0) {
      continue;
    }

    for (const highlight of run.highlights) {
      seenHighlights.add(highlightToPlainText(highlight));
    }

    pruned.push({ ...run, highlights: novelHighlights });
  }

  return pruned;
}

/** Merge older history entries that share the same date into one section. */
function mergeHistoryByDate(runs: WikiUpdateRun[]): WikiUpdateRun[] {
  if (runs.length <= 1) {
    return runs;
  }

  const [latest, ...history] = runs;
  const mergedByDate = new Map<string, WikiUpdateRun>();

  for (const run of history) {
    const existing = mergedByDate.get(run.date);
    if (!existing) {
      mergedByDate.set(run.date, { ...run, highlights: [...run.highlights] });
      continue;
    }

    existing.highlights.push(...run.highlights);
    existing.highlights = dedupeSimilarHighlights(existing.highlights);
  }

  const mergedHistory = [...mergedByDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, run]) => ({
      ...run,
      highlights: dedupeSimilarHighlights(run.highlights),
    }));

  return [latest, ...mergedHistory];
}

function dedupeSimilarHighlights(highlights: WikiUpdateHighlight[]): WikiUpdateHighlight[] {
  const kept: WikiUpdateHighlight[] = [];

  for (const highlight of highlights) {
    const text = highlightToPlainText(highlight);
    const similarIndex = kept.findIndex((entry) =>
      areSimilarHighlights(highlightToPlainText(entry), text)
    );

    if (similarIndex === -1) {
      kept.push(highlight);
      continue;
    }

    const existingText = highlightToPlainText(kept[similarIndex]);
    if (shouldPreferHighlight(text, existingText)) {
      kept[similarIndex] = highlight;
    }
  }

  return kept;
}

function areSimilarHighlights(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }

  return normalizeHighlightCompareKey(a) === normalizeHighlightCompareKey(b);
}

function normalizeHighlightCompareKey(text: string): string {
  return text.replace(/\d+/g, '#').trim();
}

function shouldPreferHighlight(candidate: string, existing: string): boolean {
  return extractTagCount(candidate) > extractTagCount(existing);
}

function extractTagCount(text: string): number {
  const match =
    text.match(/(\d+)\s+new tags documented/i) ?? text.match(/(\d+)\s+tags documented/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function runHighlightsFingerprint(run: WikiUpdateRun): string {
  return run.highlights.map(highlightToPlainText).join('|');
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sameRun(a: WikiUpdateRun, b: WikiUpdateRun): boolean {
  return runHighlightsFingerprint(a) === runHighlightsFingerprint(b);
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
