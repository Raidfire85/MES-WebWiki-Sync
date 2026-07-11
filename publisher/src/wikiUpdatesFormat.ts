import type { WebWikiPublishResult } from './types';
import { pageTitleFromMdFile } from './syncSectionCopy';

const MAX_HIGHLIGHTS = 6;
const GROUP_TAG_UPDATES_AFTER = 4;

export type WikiUpdateSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; title: string; mdFile: string };

export interface WikiUpdateHighlight {
  segments: WikiUpdateSegment[];
}

export function mkdocsPageHref(mdFile: string): string {
  const stem = mdFile.replace(/\.md$/i, '');
  return `${encodeURI(stem)}/`;
}

export function renderHighlightHtml(highlight: WikiUpdateHighlight): string {
  return highlight.segments
    .map((segment) => {
      if (segment.type === 'text') {
        return escapeHtml(segment.value);
      }

      return `<a href="${escapeHtml(mkdocsPageHref(segment.mdFile))}">${escapeHtml(segment.title)}</a>`;
    })
    .join('');
}

export function highlightToPlainText(highlight: WikiUpdateHighlight): string {
  return highlight.segments
    .map((segment) => (segment.type === 'text' ? segment.value : segment.title))
    .join('');
}

export function formatSourceDisplayLabel(source: string): string {
  if (!source.includes('\\') && !source.startsWith('local folder (')) {
    return source;
  }

  if (source === 'GitHub master') {
    return 'MES GitHub (master branch)';
  }

  if (source.startsWith('local folder (')) {
    const rawPath = source.slice('local folder ('.length, -1).replace(/\\/g, '/');
    if (/local-test/i.test(rawPath)) {
      return 'Local test sandbox';
    }
    if (
      /Data\/Scripts\/ModularEncountersSystems/i.test(rawPath) ||
      /\/ModularEncountersSystems\/?$/i.test(rawPath)
    ) {
      return 'MES master branch';
    }
    return 'Local MES source';
  }

  if (/^MES WebWiki (publisher|sync)$/i.test(source)) {
    return 'MES wiki documentation';
  }

  return 'MES framework source';
}

export function formatDisplayDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildPublishHighlights(result: WebWikiPublishResult): WikiUpdateHighlight[] {
  const highlights: WikiUpdateHighlight[] = [];
  const createdHighlights: WikiUpdateHighlight[] = [];
  const tagUpdates: Array<{ title: string; mdFile: string; count: number }> = [];
  let navUpdated = false;

  for (const record of result.changeLog) {
    if (record.kind === 'skipped' || record.kind === 'error' || record.kind === 'maintenance') {
      continue;
    }

    if (record.kind === 'navigation') {
      navUpdated = true;
      continue;
    }

    if (record.kind === 'page-created') {
      const mdFile = record.file;
      const count = record.tagsAdded?.length ?? 0;
      const highlight = highlightCreatedPayload(
        count > 0 ? `${stripMdExtension(mdFile)} (${count} tags)` : stripMdExtension(mdFile)
      );
      if (highlight) {
        createdHighlights.push(highlight);
      }
      continue;
    }

    if (record.kind === 'migration') {
      highlights.push({
        segments: [
          { type: 'link', title: pageTitleFromMdFile(record.file), mdFile: record.file },
          { type: 'text', value: ' page added to the wiki.' },
        ],
      });
      continue;
    }

    if (record.kind === 'tag-update' || record.kind === 'profile-update') {
      const added = record.tagsAdded ?? [];
      if (added.length === 0) {
        continue;
      }

      tagUpdates.push({
        title: record.profileTitle ?? pageTitleFromMdFile(record.file),
        mdFile: record.file,
        count: added.length,
      });
    }
  }

  if (createdHighlights.length > 0) {
    highlights.push(...groupCreatedHighlights(createdHighlights));
  }

  highlights.push(...buildGroupedTagHighlights(tagUpdates));

  if (navUpdated) {
    highlights.push({
      segments: [{ type: 'text', value: 'Sidebar navigation updated for new profile pages.' }],
    });
  }

  return highlights.slice(0, MAX_HIGHLIGHTS);
}

function stripMdExtension(mdFile: string): string {
  return mdFile.replace(/\.md$/i, '');
}

export function legacyLineToHighlight(line: string): WikiUpdateHighlight | null {
  if (/^Wiki maintenance:/i.test(line)) {
    return null;
  }

  if (/MES Source Sync|Automatic wiki sync|publish run|publisher/i.test(line)) {
    return null;
  }

  if (/^No content changes/i.test(line)) {
    return null;
  }

  let payload = line.trim();

  if (/^Updated:\s*/i.test(payload)) {
    payload = payload.replace(/^Updated:\s*/i, '');
    return highlightUpdatedPayload(payload) ?? highlightCreatedPayload(payload);
  }

  if (/^New profile page:\s*/i.test(payload)) {
    payload = payload.replace(/^New profile page:\s*/i, '');
    return highlightCreatedPayload(payload);
  }

  const repaired = payload.match(
    /^New New profile page:\s*(.+?)\s+profile page — (\d+) tags documented\.$/i
  );
  if (repaired) {
    payload = `${slugFromTitle(repaired[1])}.md (${repaired[2]} tags)`;
    return highlightCreatedPayload(payload);
  }

  return inferLinksFromPlainLine(payload);
}

function groupCreatedHighlights(created: WikiUpdateHighlight[]): WikiUpdateHighlight[] {
  if (created.length === 1) {
    return created;
  }

  if (created.length <= 4) {
    return [joinHighlightsWithSeparator(created, ', ', ' and ')];
  }

  const named = created.slice(0, 5);
  const remaining = created.length - 5;
  const lead = joinHighlightsWithSeparator(named, ', ', ', and ');
  return [
    {
      segments: [
        ...lead.segments,
        { type: 'text', value: `, and ${remaining} more profile pages.` },
      ],
    },
  ];
}

function joinHighlightsWithSeparator(
  highlights: WikiUpdateHighlight[],
  separator: string,
  lastSeparator: string
): WikiUpdateHighlight {
  const segments: WikiUpdateSegment[] = [{ type: 'text', value: 'New ' }];

  highlights.forEach((highlight, index) => {
    if (index > 0) {
      const sep = index === highlights.length - 1 ? lastSeparator : separator;
      segments.push({ type: 'text', value: sep });
    }
    segments.push(...stripLeadingNewPrefix(highlight.segments));
  });

  return { segments };
}

function stripLeadingNewPrefix(segments: WikiUpdateSegment[]): WikiUpdateSegment[] {
  if (segments[0]?.type === 'text' && segments[0].value.startsWith('New ')) {
    const rest = segments[0].value.slice(4);
    if (!rest) {
      return segments.slice(1);
    }
    return [{ type: 'text', value: rest }, ...segments.slice(1)];
  }
  return segments;
}

function highlightCreatedLine(line: string): WikiUpdateHighlight | null {
  return highlightCreatedPayload(line);
}

function highlightCreatedPayload(line: string): WikiUpdateHighlight | null {
  const match = line.match(/^(.+?)\.md(?:\s*\((\d+)\s*tags?\))?$/i);
  if (!match) {
    return null;
  }

  const mdFile = `${match[1]}.md`;
  const title = pageTitleFromMdFile(mdFile);
  const count = match[2];

  return {
    segments: [
      { type: 'text', value: 'New ' },
      { type: 'link', title, mdFile },
      {
        type: 'text',
        value: count ? ` profile page — ${count} tags documented.` : ' profile page.',
      },
    ],
  };
}

function highlightUpdatedPayload(line: string): WikiUpdateHighlight | null {
  const parsed = parseTagUpdateLine(line);
  if (!parsed) {
    return null;
  }

  return {
    segments: [
      { type: 'link', title: parsed.title, mdFile: parsed.mdFile },
      { type: 'text', value: ` — ${parsed.count} new tags documented.` },
    ],
  };
}

function parseTagUpdateLine(
  line: string
): { title: string; mdFile: string; count: number } | null {
  const patterns = [
    /^(.+?)\.md \(\+(\d+) tags?\)$/i,
    /^(.+?)\.md \(profile,\s*(\d+) tags?\)$/i,
    /^(.+?)\.md \((\d+) tags?\)$/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const mdFile = `${match[1]}.md`;
      return {
        title: pageTitleFromMdFile(mdFile),
        mdFile,
        count: Number.parseInt(match[2], 10),
      };
    }
  }

  return null;
}

function buildGroupedTagHighlights(
  updates: Array<{ title: string; mdFile: string; count: number }>
): WikiUpdateHighlight[] {
  if (updates.length === 0) {
    return [];
  }

  if (updates.length === 1) {
    const [only] = updates;
    return [
      {
        segments: [
          { type: 'link', title: only.title, mdFile: only.mdFile },
          { type: 'text', value: ` — ${only.count} new tags documented.` },
        ],
      },
    ];
  }

  if (updates.length <= GROUP_TAG_UPDATES_AFTER) {
    return updates.map((entry) => ({
      segments: [
        { type: 'link', title: entry.title, mdFile: entry.mdFile },
        { type: 'text', value: ` — ${entry.count} new tags documented.` },
      ],
    }));
  }

  const sorted = [...updates].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 3);
  const remaining = sorted.length - 3;
  const totalTags = sorted.reduce((sum, entry) => sum + entry.count, 0);
  const segments: WikiUpdateSegment[] = [];

  top.forEach((entry, index) => {
    if (index > 0) {
      segments.push({ type: 'text', value: ', ' });
    }
    segments.push({ type: 'link', title: entry.title, mdFile: entry.mdFile });
  });

  segments.push({
    type: 'text',
    value: `, and ${remaining} more pages — ${totalTags} new tags documented.`,
  });

  return [{ segments }];
}

function inferLinksFromPlainLine(line: string): WikiUpdateHighlight | null {
  const knownPages = getKnownWikiPages();
  let segments: WikiUpdateSegment[] = [{ type: 'text', value: line }];
  let linked = false;

  for (const page of knownPages) {
    const next = linkTitleInSegments(segments, page.title, page.mdFile);
    if (next !== segments) {
      segments = next;
      linked = true;
    }
  }

  if (!linked) {
    return line.trim() ? { segments: [{ type: 'text', value: line }] } : null;
  }

  return { segments };
}

function linkTitleInSegments(
  segments: WikiUpdateSegment[],
  title: string,
  mdFile: string
): WikiUpdateSegment[] {
  const next: WikiUpdateSegment[] = [];

  for (const segment of segments) {
    if (segment.type !== 'text' || !segment.value.includes(title)) {
      next.push(segment);
      continue;
    }

    const parts = segment.value.split(title);
    parts.forEach((part, index) => {
      if (part) {
        next.push({ type: 'text', value: part });
      }
      if (index < parts.length - 1) {
        next.push({ type: 'link', title, mdFile });
      }
    });
  }

  return next;
}

function getKnownWikiPages(): Array<{ title: string; mdFile: string }> {
  const mdFiles = [
    'Action.md',
    'Target.md',
    'Autopilot.md',
    'Condition.md',
    'Trigger.md',
    'Spawn-Conditions.md',
    'Command.md',
    'Chat.md',
    'Spawn.md',
    'Weapons.md',
    'Player-Condition-Profile.md',
    'Core-Behavior.md',
    'Event-Action.md',
    'Event-Conditions.md',
    'Bot-Spawn.md',
    'Prefab-Data.md',
    'Block-Replacement.md',
    'Contract-Block-Profile.md',
    'Faction-Icon-Profile.md',
    'Mission-Profile.md',
    'Prefab-Gravity-Profile.md',
    'Safezone-Profile.md',
    'Shipyard-Profile.md',
    'Store-Profile.md',
    'Suit-Upgrades-Profile.md',
  ];

  return mdFiles
    .map((mdFile) => ({ title: pageTitleFromMdFile(mdFile), mdFile }))
    .sort((a, b) => b.title.length - a.title.length);
}

function slugFromTitle(title: string): string {
  return title.trim().replace(/\s+/g, '-');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @deprecated Use buildPublishHighlights */
export function humanizePublishResult(result: WebWikiPublishResult): string[] {
  return buildPublishHighlights(result).map(highlightToPlainText);
}

/** @deprecated Use legacyLineToHighlight */
export function humanizeLegacyLine(line: string): string | null {
  const highlight = legacyLineToHighlight(line);
  return highlight ? highlightToPlainText(highlight) : null;
}
