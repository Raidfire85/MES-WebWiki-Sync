import * as fs from 'fs/promises';
import { findProfileFile } from './sync/tagMetaParser';
import { REQUIRED_PROFILE_TAGS } from './sync/profileHeaders';
import type { TagMetaMap } from './types';
import {
  WEBWIKI_EXAMPLE_SYNC_END,
  WEBWIKI_EXAMPLE_SYNC_START,
} from './constants';

const MAX_EXAMPLE_TAGS = 12;

/** Preferred starter tags for well-known sync-managed profiles. */
const PROFILE_EXAMPLE_TAGS: Record<string, string[]> = {
  'ShipyardProfile.cs': [
    'BlockName',
    'InteractionRadius',
    'AllowBlueprintBuilding',
    'AllowScrapPurchasing',
    'AllowRepairAndConstruction',
    'BlueprintBuildingCommissionPercentage',
  ],
  'MissionProfile.cs': ['Title', 'Description', 'Duration', 'MissionType', 'Reward', 'PlayerConditionIds'],
  'SafezoneProfile.cs': ['Enabled', 'Radius', 'Coordinates', 'PlayerAccess', 'GridAccess', 'IsVisible'],
  'StoreProfile.cs': ['FileSource', 'MinOfferItems', 'MaxOfferItems', 'Offers', 'Orders'],
  'BlockReplacementProfile.cs': ['OldBlock', 'NewBlock', 'Limit'],
  'ContractBlockProfile.cs': ['MinContracts', 'MaxContracts', 'MissionIds'],
  'FactionIconProfile.cs': ['Faction', 'Color', 'Background'],
  'PrefabGravityProfile.cs': ['PrefabIds', 'MaxGravityAtmo', 'MaxGravityVacuum'],
  'SuitUpgradesProfile.cs': [
    'BlockName',
    'AllowJetpackInhibitorMod',
    'AllowHandDrillInhibitorMod',
    'AllowSolarChargingMod',
    'AllowDamageReductionMod',
  ],
};

const PLACEHOLDER_STRINGS: Record<string, string> = {
  BlockName: 'NPC-ShipyardTerminal',
  StoreBlockName: 'NPC-StoreBlock',
  FileSource: 'YourStoreData.sbc',
  Title: 'Example Mission Title',
  Description: 'Example mission description text.',
  Reward: '10000',
  Faction: 'SPRT',
};

function exampleSubtypeId(title: string): string {
  const compact = title.replace(/[^A-Za-z0-9]+/g, '');
  return `MES-Example${compact || 'Profile'}`;
}

function parseConstructorDefaults(content: string): Record<string, string> {
  const defaults: Record<string, string> = {};
  const ctorMatch = content.match(/public\s+\w+\(\)\s*\{([\s\S]*?)\n\s*\}\s*;/);
  if (!ctorMatch) {
    return defaults;
  }

  for (const match of ctorMatch[1].matchAll(/^\s*(\w+)\s*=\s*([^;]+);/gm)) {
    const value = match[2].trim();
    if (/^new\s+/.test(value)) {
      continue;
    }
    defaults[match[1]] = value;
  }

  return defaults;
}

function isBoolType(parseType: string): boolean {
  return /^Bool/.test(parseType) || parseType === 'Contains';
}

function isListType(parseType: string): boolean {
  return /List|Dict/.test(parseType);
}

function formatExampleTagValue(
  tagName: string,
  parseType: string,
  defaults: Record<string, string>,
  forceTrueAllow = false
): string {
  if (PLACEHOLDER_STRINGS[tagName]) {
    return PLACEHOLDER_STRINGS[tagName];
  }

  if (tagName === 'OldBlock' || tagName === 'NewBlock') {
    return tagName === 'OldBlock'
      ? 'MyObjectBuilder_CubeBlock/LargeBlockSmallGenerator'
      : 'MyObjectBuilder_CubeBlock/LargeBlockSmallGeneratorUpgrade';
  }

  if (tagName === 'Limit') {
    return '-1';
  }

  if (isBoolType(parseType)) {
    if (forceTrueAllow && /^Allow|^Use|^Enable|^Enabled/.test(tagName)) {
      return 'true';
    }
    const raw = defaults[tagName];
    if (raw === 'true' || raw === 'false') {
      return raw;
    }
    return /^Allow|^Use|^Enable|^Enabled/.test(tagName) ? 'true' : 'false';
  }

  if (/Ids$/.test(tagName) || /Profiles$/.test(tagName)) {
    if (isListType(parseType)) {
      const stem = tagName.replace(/Ids$|Profiles$/, '').replace(/Profile$/, '');
      return `Example${stem}ProfileA,Example${stem}ProfileB`;
    }
    const stem = tagName.replace(/Ids$|Profiles$/, '').replace(/Profile$/, '');
    return `Example${stem}Profile`;
  }

  if (tagName.endsWith('Id') || tagName.endsWith('Ids')) {
    return `Example${tagName.replace(/Ids?$/, '')}`;
  }

  if (defaults[tagName] !== undefined) {
    return defaults[tagName].replace(/^"|"$/g, '');
  }

  if (/Double|Float|Int|Long/.test(parseType)) {
    if (/Radius$/.test(tagName)) {
      return '250';
    }
    if (/Percentage$/.test(tagName)) {
      return '100';
    }
    return '0';
  }

  if (/String/.test(parseType)) {
    return `Example${tagName}`;
  }

  if (/Enum|MyDefId|Vector/.test(parseType)) {
    return 'Value';
  }

  return 'Value';
}

function selectExampleTags(profileCs: string, meta: TagMetaMap, header: string | null): string[] {
  const allTags = Object.keys(meta);
  if (allTags.length === 0) {
    return [];
  }

  const selected: string[] = [];

  const push = (tag: string) => {
    if (meta[tag] && !selected.includes(tag) && selected.length < MAX_EXAMPLE_TAGS) {
      selected.push(tag);
    }
  };

  if (header) {
    for (const tag of REQUIRED_PROFILE_TAGS[header] ?? []) {
      push(tag);
    }
  }

  const curated = PROFILE_EXAMPLE_TAGS[profileCs];
  if (curated) {
    for (const tag of curated) {
      push(tag);
    }
    return selected;
  }

  const priorityPatterns = [
    /^BlockName$/,
    /^StoreBlockName$/,
    /^ProfileSubtypeId$/,
    /^Type$/,
    /^BehaviorName$/,
    /^Allow/,
    /^Use/,
    /^Enabled$/,
    /^Radius$/,
    /^InteractionRadius$/,
    /^Coordinates$/,
    /^Title$/,
    /^Description$/,
    /^Duration$/,
    /Ids$/,
    /Profiles$/,
  ];

  for (const pattern of priorityPatterns) {
    for (const tag of allTags.sort()) {
      if (pattern.test(tag)) {
        push(tag);
      }
    }
  }

  for (const tag of allTags.sort()) {
    push(tag);
  }

  return selected.slice(0, MAX_EXAMPLE_TAGS);
}

export function buildProfileExampleXml(options: {
  title: string;
  header: string | null;
  profileCs: string;
  meta: TagMetaMap;
  defaults: Record<string, string>;
}): string {
  const tags = selectExampleTags(options.profileCs, options.meta, options.header);
  if (tags.length === 0) {
    return '';
  }

  const subtypeId = exampleSubtypeId(options.title);
  const tagLines = tags.map((tag) => {
    const parseType = options.meta[tag] ?? 'String';
    const value = formatExampleTagValue(tag, parseType, options.defaults, true);
    return `      [${tag}:${value}]`;
  });

  const headerLine = options.header ? `\n      ${options.header}\n` : '';

  return `<?xml version="1.0"?>
<Definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <EntityComponents>

    <EntityComponent xsi:type="MyObjectBuilder_InventoryComponentDefinition">
      <Id>
          <TypeId>Inventory</TypeId>
          <SubtypeId>${subtypeId}</SubtypeId>
      </Id>
      <Description>
${headerLine}
${tagLines.join('\n')}

      </Description>
      
    </EntityComponent>

  </EntityComponents>
</Definitions>`;
}

export function buildProfileExampleSection(options: {
  title: string;
  header: string | null;
  profileCs: string;
  meta: TagMetaMap;
  defaults: Record<string, string>;
}): string {
  const xml = buildProfileExampleXml(options);
  if (!xml) {
    return '';
  }

  return `${WEBWIKI_EXAMPLE_SYNC_START}
Here is an example of how a ${options.title} profile definition is set up:

\`\`\`
${xml}
\`\`\`
${WEBWIKI_EXAMPLE_SYNC_END}`;
}

export async function buildProfileExampleSectionFromSource(options: {
  mesSourcePath: string;
  profileCs: string;
  title: string;
  header: string | null;
  meta: TagMetaMap;
}): Promise<string> {
  const filePath = await findProfileFile(options.mesSourcePath, options.profileCs);
  let defaults: Record<string, string> = {};

  if (filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    defaults = parseConstructorDefaults(content);
  }

  return buildProfileExampleSection({
    title: options.title,
    header: options.header,
    profileCs: options.profileCs,
    meta: options.meta,
    defaults,
  });
}
