import * as fs from 'fs/promises';
import * as path from 'path';
import { findProfileFile } from './sync/tagMetaParser';
import { splitPascalCase } from './sync/typeHints';

const FEATURE_TAG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bAllowBlueprintBuilding\b/, label: 'blueprint building' },
  { pattern: /\bAllowScrapPurchasing\b/, label: 'scrap sales' },
  { pattern: /\bAllowRepairAndConstruction\b/, label: 'repairs and construction' },
  { pattern: /\bAllowCustomReplacement\b/, label: 'paid block replacement' },
  { pattern: /\bAllowGridTakeover\b/, label: 'grid takeover purchases' },
  { pattern: /\bUseSafezone\b/, label: 'safe zones' },
  { pattern: /\bUseStore\b/, label: 'NPC stores' },
  { pattern: /\bUseMission\b/, label: 'missions' },
  { pattern: /\bUseContract\b/, label: 'contracts' },
  { pattern: /\bUseDatapad\b/, label: 'datapads' },
  { pattern: /\bUseLoot\b/, label: 'loot tables' },
  { pattern: /\bUseReplenishment\b/, label: 'replenishment rules' },
  { pattern: /\bUseDereliction\b/, label: 'dereliction decay' },
  { pattern: /\bUseManipulation\b/, label: 'spawn manipulations' },
  { pattern: /\bUseBlockReplacement\b/, label: 'block replacement' },
];

function formatFeatureList(features: string[]): string {
  if (features.length === 0) {
    return '';
  }
  if (features.length === 1) {
    return features[0];
  }
  if (features.length === 2) {
    return `${features[0]} and ${features[1]}`;
  }
  return `${features.slice(0, -1).join(', ')}, and ${features[features.length - 1]}`;
}

function extractClassXmlSummary(content: string): string | null {
  const match = content.match(/\/\/\/\s*<summary>\s*([\s\S]*?)\s*<\/summary>/);
  if (!match) {
    return null;
  }
  const summary = match[1]
    .replace(/\/\/\/\s?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (summary.length < 12) {
    return null;
  }
  if (!/[.!?]$/.test(summary)) {
    return `${summary}.`;
  }
  return summary;
}

function extractSectionSummaries(content: string): string[] {
  const summaries: string[] = [];
  for (const match of content.matchAll(/^\s*\/\/(.+)$/gm)) {
    const line = match[1].trim();
    if (/^Imp\s*\/\/Doc\.?$/i.test(line)) {
      continue;
    }
    if (/^(OBSOLETE|Obsolete|Not used)/i.test(line)) {
      continue;
    }
    if (/ Config$| Settings$/.test(line) && line.length > 8) {
      summaries.push(line.replace(/\.$/, ''));
    }
  }
  return summaries;
}

function headerContextLabel(header: string | null): string {
  if (!header) {
    return 'MES';
  }
  return header
    .replace(/^\[|\]$/g, '')
    .replace(/^MES\s+/i, '')
    .replace(/^RivalAI\s+/i, 'RivalAI ')
    .trim();
}

function inferFromFeatures(title: string, content: string, header: string | null): string | null {
  const features = FEATURE_TAG_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
    ({ label }) => label
  );
  if (features.length === 0) {
    return null;
  }

  const context = headerContextLabel(header);
  const profileKind = context.toLowerCase().includes('shipyard')
    ? 'terminals'
    : context.toLowerCase().includes('store')
      ? 'store blocks'
      : 'profiles';

  return `${title} profiles configure NPC ${profileKind} for ${formatFeatureList(features)}.`;
}

/**
 * Build a short profile intro by reading the profile .cs file in MES source.
 */
export async function inferProfileBlurbFromSource(
  mesSourcePath: string,
  profileCs: string,
  header: string | null,
  title: string
): Promise<string> {
  const filePath = await findProfileFile(mesSourcePath, profileCs);
  if (!filePath) {
    return fallbackBlurb(title, header);
  }

  const content = await fs.readFile(filePath, 'utf8');
  const xmlSummary = extractClassXmlSummary(content);
  if (xmlSummary) {
    return xmlSummary;
  }

  const fromFeatures = inferFromFeatures(title, content, header);
  if (fromFeatures) {
    return fromFeatures;
  }

  const sections = extractSectionSummaries(content);
  if (sections.length > 0) {
    const context = headerContextLabel(header);
    return `${title} profiles define ${context} settings (${sections.slice(0, 3).join(', ')}).`;
  }

  return fallbackBlurb(title, header);
}

function fallbackBlurb(title: string, header: string | null): string {
  if (header) {
    return `${title} profiles use the ${header} header in SBC Description blocks.`;
  }
  return `${title} profile tags parsed from MES source (${splitPascalCase(title.replace(/Profile$/, ''))}).`;
}
