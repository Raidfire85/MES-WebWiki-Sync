import { getTypeHint } from './syncBridge';
import { getEnhancedTypeHint } from './profileEnumHints';
import { inferRichDescription } from './tagDescriptionGenerator';
import type { TagMetaMap, WikiTableStyle } from './types';
import type { TypeHint } from './sync/typeHints';

const TAG_SPECIFIC_HINTS: Record<string, TypeHint> = {
  WeaponsSystem: {
    allowedValuesHtml:
      'MES weapons system profile subtype ID (e.g. <code>MES-Weapons-GenericStandard</code>)',
    multipleAllowed: false,
  },
};

export function allowedValuesMarkdown(allowedValuesHtml: string): string {
  return allowedValuesHtml
    .replace(/<code>([^<]*)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, ' ')
    .trim();
}

export function buildMkDocsTagTable(
  tagName: string,
  description: string,
  allowedValues: string,
  multipleAllowed: string,
  style: WikiTableStyle,
  filterRequired?: string
): string {
  const rows: string[] = [
    `|Tag:|${tagName}|`,
    '|:----|:----|',
    `|Tag Format:|\`[${tagName}:Value]\`|`,
    `|Description:|${description}|`,
  ];

  if (style === 'Target' && filterRequired) {
    rows.push(`|Filter Required:|\`${filterRequired}\`|`);
  }

  if (style === 'Target') {
    rows.push(`|Allowed Values:|${allowedValues}|`);
    rows.push(`|Multiple Tag Allowed:|${multipleAllowed}|`);
  } else if (style === 'Prefab') {
    rows.push(`|Allowed Value(s):|${allowedValues}|`);
    rows.push(`|Default Value(s):|\`N/A\`|`);
    rows.push(`|Multiple Tags Allowed:|${multipleAllowed}|`);
  } else {
    rows.push(`|Allowed Value(s):|${allowedValues}|`);
    rows.push(`|Multiple Tags Allowed:|${multipleAllowed}|`);
  }

  return `\n${rows.join('\n')}\n`;
}

export function buildMkDocsTagTableFromMeta(
  tagName: string,
  meta: TagMetaMap,
  tagDescriptions: Record<string, string>,
  style: WikiTableStyle,
  profileSource?: string
): string {
  const parseType = meta[tagName] ?? 'Unknown';
  const hint =
    TAG_SPECIFIC_HINTS[tagName] ??
    getEnhancedTypeHint(parseType, profileSource) ??
    getTypeHint(parseType);
  const multipleAllowed = hint.multipleAllowed ? 'Yes' : 'No';
  const description = tagDescriptions[tagName] ?? inferRichDescription(tagName, parseType);

  return buildMkDocsTagTable(
    tagName,
    description,
    allowedValuesMarkdown(hint.allowedValuesHtml),
    multipleAllowed,
    style
  );
}
