import * as fs from 'fs/promises';
import * as path from 'path';
import { parseTagMetaFromContent } from './sync/tagMetaParser';
import { splitPascalCase } from './sync/typeHints';
import type { TagMetaMap } from './types';

/** Curated overrides for tags where source comments or heuristics are insufficient. */
export const MANUAL_TAG_DESCRIPTIONS: Record<string, string> = {
  MaxTargetValue:
    'Maximum TargetValue (threat score) a target may have. <strong>Default in MES source is 1</strong> if omitted — use <code>[MaxTargetValue:-1]</code> to remove the upper cap.',
  MinTargetValue:
    'Minimum TargetValue (threat score) required for a target to be valid when using the <code>TargetValue</code> filter.',
  SwitchToBehavior:
    '<strong>OBSOLETE.</strong> Do not use. MES skips re-registering an already-registered Remote Control. Use <code>[ChangeBehaviorSubclass:true]</code> and <code>[NewBehaviorSubclass:Value]</code> instead.',
  NewBehavior:
    '<strong>OBSOLETE.</strong> Companion tag for deprecated <code>SwitchToBehavior</code>. Use <code>NewBehaviorSubclass</code> instead.',
  ChangeBehaviorSubclass:
    'When <code>true</code>, switches the behavior subclass (eg Fighter, Horsefly, Patrol) via <code>NewBehaviorSubclass</code>.',
  NewBehaviorSubclass:
    'BehaviorSubclass enum value to assign when <code>ChangeBehaviorSubclass</code> is true.',
  ToggleBlocksOfType:
    'When <code>true</code>, toggles blocks matching <code>BlockTypesToToggle</code> using <code>BlockTypeToggles</code> (On/Off).',
  HorseflyWaypointWaitTimeTrigger:
    'Remote Control tag. Seconds the Horsefly waits at an offset waypoint before moving again. Overrides autopilot <code>WaypointWaitTimeTrigger</code> when greater than zero.',
  HorseflyWaypointAbandonTimeTrigger:
    'Remote Control tag. Seconds before abandoning the current offset waypoint and generating a new one.',
  UseVanillaTargetLocking:
    'When <code>true</code>, uses Space Engineers vanilla turret/grid target locking.',
  UsePlayerConditionProfile:
    'When <code>true</code>, the trigger uses <code>PlayerConditionProfileIds</code> to filter which players can activate it.',
  ProcessAsAdminSpawn:
    'When <code>true</code>, treats the spawn action as an admin spawn (bypasses some spawn condition checks).',
  UseNoTargetTimer:
    'When <code>true</code>, the behavior starts a no-target despawn timer while idle without a valid target.',
  MatchAllFilters: 'Target must match ALL listed TargetFilterEnum values.',
  MatchAnyFilters: 'Target must match at least ONE listed TargetFilterEnum value.',
  MatchNoneFilters: 'Target is rejected if it matches ANY listed TargetFilterEnum value.',
  Score: 'Prefab threat/score value used by MES prefab data rules.',
  WeaponsSystem: 'SubtypeId of the MES weapons system profile attached to this behavior.',
  ActivateEvent:
    'When <code>true</code>, activates MES events whose ids or tags match <code>ActivateEventIds</code> / <code>ActivateEventTags</code>.',
  ActivateAssertiveAntennas:
    'When <code>true</code>, enables assertive antenna behavior on the NPC grid (antennas actively broadcast/track).',
  AllowBlueprintBuilding:
    'When <code>true</code>, players can build grids from blueprints at this shipyard terminal.',
  AllowScrapPurchasing:
    'When <code>true</code>, players can sell scrap grids to this shipyard.',
  AllowRepairAndConstruction:
    'When <code>true</code>, players can repair and weld incomplete blocks at this shipyard.',
  AllowCustomReplacement:
    'When <code>true</code>, players can pay to replace blocks using <code>OldBlock</code>/<code>NewBlock</code> or <code>BlockReplacementProfileIds</code>.',
  AllowGridTakeover:
    'When <code>true</code>, players can purchase ownership of an NPC grid through this shipyard.',
  BlockName: 'SubtypeId or name of the shipyard terminal block this profile applies to.',
  StoreBlockName: 'Optional store block name linked to shipyard transactions.',
  InteractionRadius:
    'Radius in meters around the shipyard block where players can interact. Source default: <code>250</code>.',
  MinReputation:
    'Minimum faction reputation required (may be unused in current MES build). Source default: <code>-500</code>.',
  ReputationNeededForDiscount:
    'Faction reputation at or above this value unlocks reputation-based discounts. Source default: <code>501</code>.',
  BlueprintBuildingCommissionPercentage:
    'Blueprint build price multiplier percentage (100 = raw cost). Source default: <code>115</code>.',
  ScrapPurchasingMaxPercentageValue:
    'Base percentage of scrap value paid to the player. Source default: <code>75</code>.',
  GridTakeoverPricePerComputerMultiplier:
    'Price multiplier per computer block when taking over a grid. Source default: <code>100</code>.',
};

const REMOTE_CONTROL_EXTRA_TAGS = [
  'HorseFighterWaypointWaitTimeTrigger',
  'HorseFighterWaypointAbandonTimeTrigger',
  'HorseNauticalWaypointWaitTimeTrigger',
  'HorseNauticalWaypointAbandonTimeTrigger',
  'FighterEngageDistancePlanet',
  'FighterEngageDistanceSpace',
  'FighterDisengageDistancePlanet',
  'FighterDisengageDistanceSpace',
  'CustomWaypoints',
  'Routes',
  'GetSpeedFromSpawnGroup',
  'UsePauseAutopilotFromSpawnGroup',
];

function addDesc(map: Record<string, string>, tag: string, desc: string | null | undefined): void {
  if (!tag || !desc) {
    return;
  }
  const normalized = desc.replace(/\s+/g, ' ').trim();
  if (normalized.length < 8) {
    return;
  }
  if (!map[tag] || map[tag].length < normalized.length) {
    map[tag] = normalized;
  }
}

function formatComment(comment: string, tagName: string): string | null {
  let c = comment.trim().replace(/\.$/, '');
  if (c === tagName || c.length < 3) {
    return null;
  }
  if (/^[A-Z][a-z]+$/.test(c)) {
    return null;
  }
  if (!/[a-z]/.test(c)) {
    c = splitPascalCase(c);
  }
  if (c.length > 0) {
    c = c.charAt(0).toUpperCase() + c.slice(1);
  }
  if (!/[.!?]$/.test(c)) {
    c += '.';
  }
  return c;
}

/** Rich fallback when no C# comment exists — ported from Build-TagDescriptions.ps1. */
export function inferRichDescription(tagName: string, parseType: string): string {
  const isList = /List|Dict/.test(parseType);
  const isBool = /^Bool/.test(parseType) || parseType === 'Contains';

  const verbMatch = tagName.match(
    /^(Use|Enable|Allow|Activate|Apply|Include|Register|Preserve|Append|Broadcast|Highlight|Ignore|Overwrite|Manual|Prioritize|Only|Try|Force|Link|Save|Remove|Add|Increase|Decrease|End|Start|Clear|Disable|Reset|Set|Change|Create|Process|Play|Spawn|Teleport|Transfer|Switch|Refresh|Repair|Build|Recalculate|Check|Compare|Match|Has|Is|Can|Must|DoNot|No)(.*)$/
  );

  if (verbMatch && isBool) {
    const verb = verbMatch[1].toLowerCase();
    const rest = splitPascalCase(verbMatch[2] || tagName);
    switch (verb) {
      case 'allow':
        return `When <code>true</code>, allows ${rest}.`;
      case 'activate':
        return `When <code>true</code>, activates ${rest}.`;
      case 'disable':
        return `When <code>true</code>, disables ${rest}.`;
      case 'clear':
        return `When <code>true</code>, clears ${rest}.`;
      case 'reset':
        return `When <code>true</code>, resets ${rest}.`;
      case 'change':
        return `When <code>true</code>, changes ${rest}.`;
      case 'set':
        return `When <code>true</code>, sets ${rest}.`;
      case 'check':
        return `When <code>true</code>, checks ${rest}.`;
      case 'compare':
        return `When <code>true</code>, compares ${rest}.`;
      case 'match':
        return `When <code>true</code>, requires ${rest} to match.`;
      case 'try':
        return `When <code>true</code>, attempts ${rest}.`;
      case 'force':
        return `When <code>true</code>, forces ${rest}.`;
      case 'spawn':
        return `When <code>true</code>, spawns ${rest}.`;
      case 'teleport':
        return `When <code>true</code>, teleports ${rest}.`;
      case 'switch':
        return `When <code>true</code>, switches ${rest}.`;
      case 'refresh':
        return `When <code>true</code>, refreshes ${rest}.`;
      case 'broadcast':
        return `When <code>true</code>, broadcasts ${rest}.`;
      case 'process':
        return `When <code>true</code>, processes ${rest}.`;
      case 'play':
        return `When <code>true</code>, plays ${rest}.`;
      case 'repair':
        return `When <code>true</code>, repairs ${rest}.`;
      case 'build':
        return `When <code>true</code>, builds ${rest}.`;
      case 'use':
        return `When <code>true</code>, uses ${rest}.`;
      case 'enable':
        return `When <code>true</code>, enables ${rest}.`;
      case 'must':
        return `When <code>true</code>, requires ${rest}.`;
      case 'donot':
      case 'no':
        return `When <code>true</code>, prevents ${rest}.`;
      default:
        return `When <code>true</code>, enables or applies ${rest}.`;
    }
  }

  const minMax = tagName.match(/^(Min|Max)(.+)$/);
  if (minMax) {
    const kind = minMax[1] === 'Min' ? 'Minimum' : 'Maximum';
    return `${kind} value for ${splitPascalCase(minMax[2])}.`;
  }

  const newOld = tagName.match(/^(New|Old)(.+)$/);
  if (newOld) {
    const kind = newOld[1] === 'New' ? 'New' : 'Previous';
    return `${kind} value used for ${splitPascalCase(newOld[2])}.`;
  }

  if (/Ids?$/.test(tagName) || /Names$/.test(tagName) || /Profiles$/.test(tagName)) {
    const what = splitPascalCase(tagName.replace(/Ids?$|Names$|Profiles$/, ''));
    if (isList) {
      return `One or more ${what} profile or id values (comma-separated).`;
    }
    return `A ${what} profile or id value.`;
  }

  if (/Radius$/.test(tagName)) {
    return `Radius in meters for ${splitPascalCase(tagName.replace(/Radius$/, ''))}.`;
  }
  if (/Distance$/.test(tagName)) {
    return `Distance in meters for ${splitPascalCase(tagName.replace(/Distance$/, ''))}.`;
  }
  if (/Altitude$/.test(tagName)) {
    return `Altitude in meters for ${splitPascalCase(tagName.replace(/Altitude$/, ''))}.`;
  }
  if (/Timer$|TimeTrigger$|Cooldown$|Duration$/.test(tagName)) {
    return `Time in seconds for ${splitPascalCase(tagName)}.`;
  }
  if (/Amount$|Percentage$|Percent$/.test(tagName)) {
    return `Numeric amount for ${splitPascalCase(tagName)}.`;
  }
  if (/Speed$/.test(tagName)) {
    return `Speed value for ${splitPascalCase(tagName)}.`;
  }

  if (isBool) {
    return `When <code>true</code>, activates ${splitPascalCase(tagName)}.`;
  }
  if (isList) {
    return `List of values for ${splitPascalCase(tagName)}.`;
  }
  if (/Enum/.test(parseType)) {
    return `Enum value for ${splitPascalCase(tagName)}.`;
  }
  if (/Double|Float|Int|Long/.test(parseType)) {
    return `Numeric value for ${splitPascalCase(tagName)}.`;
  }
  if (/String/.test(parseType)) {
    return `Text value for ${splitPascalCase(tagName)}.`;
  }
  if (/Vector/.test(parseType)) {
    return `Vector3D coordinates for ${splitPascalCase(tagName)}.`;
  }

  return `Configures ${splitPascalCase(tagName)}.`;
}

async function findAllCsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.cs')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function findFileByName(dir: string, fileName: string): Promise<string | null> {
  const files = await findAllCsFiles(dir);
  return files.find((file) => path.basename(file) === fileName) ?? null;
}

function scanActionSystemComments(content: string, descriptions: Record<string, string>): void {
  for (const match of content.matchAll(/\/\/([^\r\n]+)\r?\n\s*lastAction = "([A-Za-z0-9_-]+)"/g)) {
    const comment = formatComment(match[1], match[2]);
    addDesc(descriptions, match[2], comment);
  }
}

function scanProfileFieldComments(lines: string[], descriptions: Record<string, string>): void {
  let pendingTag: string | null = null;
  let pendingSection: string | null = null;

  for (const line of lines) {
    const fieldWithComment = line.match(
      /^\s*public\s+\w[\w<>,\s]*\s+([A-Za-z0-9_]+)\s*;\s*\/\/(.+)$/
    );
    if (fieldWithComment) {
      const tag = fieldWithComment[1];
      const comment = fieldWithComment[2].trim();
      if (/OBSOLETE|Obsolete|Not used|Implement/i.test(comment)) {
        addDesc(descriptions, tag, `<strong>OBSOLETE.</strong> ${formatComment(comment, tag) ?? comment}`);
      } else {
        addDesc(descriptions, tag, formatComment(comment, tag));
      }
      pendingTag = null;
      continue;
    }

    const tagOnlyComment = line.match(/^\s*\/\/([A-Za-z][A-Za-z0-9_-]+)\s*$/);
    if (tagOnlyComment) {
      pendingTag = tagOnlyComment[1];
      continue;
    }

    if (pendingTag && line.includes(`tag.Contains("[${pendingTag}:`)) {
      addDesc(descriptions, pendingTag, `Configures ${splitPascalCase(pendingTag)}.`);
      pendingTag = null;
      continue;
    }

    const sectionComment = line.match(/^\s*\/\/(.+ Config|.+ Settings|Profile|Speed Config|Planet Config)\s*$/);
    if (sectionComment) {
      pendingSection = sectionComment[1].trim();
      continue;
    }

    const fieldOptionalComment = line.match(/^\s*public\s+\w[\w<>,\s]*\s+([A-Za-z0-9_]+)\s*;(?:\s*\/\/(.*))?$/);
    if (fieldOptionalComment) {
      const tag = fieldOptionalComment[1];
      const inlineComment = fieldOptionalComment[2]?.trim();
      if (inlineComment) {
        addDesc(descriptions, tag, formatComment(inlineComment, tag));
      } else if (pendingSection) {
        addDesc(descriptions, tag, `${pendingSection} setting: ${splitPascalCase(tag)}.`);
      }
    }
  }
}

function scanClassXmlSummary(content: string, descriptions: Record<string, string>): void {
  const summaryMatch = content.match(/\/\/\/\s*<summary>\s*([\s\S]*?)\s*<\/summary>/);
  if (!summaryMatch) {
    return;
  }
  const summary = summaryMatch[1]
    .replace(/\/\/\/\s?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (summary.length >= 12) {
    addDesc(descriptions, '__class_summary__', summary);
  }
}

/**
 * Scan MES C# source and build tag descriptions from comments, field names, and heuristics.
 * Manual overrides always win.
 */
export async function buildTagDescriptionsFromMesSource(
  mesSourcePath: string
): Promise<Record<string, string>> {
  const descriptions: Record<string, string> = {};
  const csFiles = await findAllCsFiles(mesSourcePath);

  const actionSystemPath = await findFileByName(mesSourcePath, 'ActionSystem.cs');
  if (actionSystemPath) {
    const content = await fs.readFile(actionSystemPath, 'utf8');
    scanActionSystemComments(content, descriptions);
  }

  for (const filePath of csFiles) {
    const baseName = path.basename(filePath);
    if (!/Profile\.cs$/i.test(baseName) && baseName !== 'RemoteControl.cs') {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    scanProfileFieldComments(content.split(/\r?\n/), descriptions);
    scanClassXmlSummary(content, descriptions);
  }

  for (const [tag, desc] of Object.entries(MANUAL_TAG_DESCRIPTIONS)) {
    addDesc(descriptions, tag, desc);
  }

  const tagMetaByTag: TagMetaMap = {};
  for (const filePath of csFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const meta = parseTagMetaFromContent(content);
    for (const [tag, parseType] of Object.entries(meta)) {
      if (!tagMetaByTag[tag]) {
        tagMetaByTag[tag] = parseType;
      }
    }
  }

  for (const [tag, parseType] of Object.entries(tagMetaByTag)) {
    if (!descriptions[tag]) {
      addDesc(descriptions, tag, inferRichDescription(tag, parseType));
    }
  }

  for (const tag of REMOTE_CONTROL_EXTRA_TAGS) {
    if (!descriptions[tag]) {
      addDesc(descriptions, tag, inferRichDescription(tag, 'Int'));
    }
  }

  return descriptions;
}

export function mergeTagDescriptionMaps(
  ...maps: Array<Record<string, string> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [tag, desc] of Object.entries(map)) {
      if (tag.startsWith('__')) {
        continue;
      }
      addDesc(merged, tag, desc);
    }
  }
  return merged;
}
