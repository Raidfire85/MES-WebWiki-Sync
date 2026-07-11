import type { TypeHint } from './sync/typeHints';

const EXTERNAL_ENUMS: Record<string, string[]> = {
  MySafeZoneShape: ['Sphere', 'Box'],
  DayOfWeek: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
};

/** Maps TagParse check suffixes (from tag meta) to enum type names in MES source. */
const PARSE_TYPE_TO_ENUM: Record<string, string> = {
  SafeZoneShapeEnum: 'MySafeZoneShape',
  SafeZoneAccessTypeEnum: 'SafeZoneAccessType',
  SafeZoneActionEnum: 'SafeZoneAction',
  DirectionEnum: 'Direction',
  GridConfiguration: 'GridConfigurationEnum',
  AutoPilotProfileMode: 'AutoPilotDataMode',
  TargetOwnerEnum: 'OwnerTypeEnum',
  TargetRelationEnum: 'RelationTypeEnum',
  SpawningTypeEnum: 'SpawningType',
  PrefabSpawnModeEnum: 'PrefabSpawnMode',
  RelativeEntityEnum: 'RelativeEntityType',
  WaypointTypeEnum: 'WaypointType',
  CommandTransmissionTypeEnum: 'CommandTransmissionType',
  ActionExecution: 'ActionExecutionEnum',
  BroadcastTypeEnum: 'BroadcastType',
  BehaviorModeEnum: 'BehaviorMode',
  BehaviorSubclassEnum: 'BehaviorSubclass',
  BlockTargetTypes: 'BlockTypeEnum',
  DayOfWeekEnum: 'DayOfWeek',
};

const KNOWN_FLAGS_ENUMS = new Set([
  'SafeZoneAction',
  'BroadcastType',
  'BlockTargetTypes',
  'TargetObstructionEnum',
  'TargetRelationEnum',
  'TargetOwnerEnum',
  'TriggerAction',
  'TriggerType',
  'WaypointModificationEnum',
  'GridOwnershipEnum',
  'NewAutoPilotMode',
  'OwnerTypeEnum',
  'RelationTypeEnum',
  'BlockTypeEnum',
]);

export interface ParsedEnums {
  enums: Record<string, string[]>;
  flagsEnums: Set<string>;
}

export function parseEnumsFromProfileSource(content: string): ParsedEnums {
  const enums: Record<string, string[]> = {};
  const flagsEnums = new Set<string>(KNOWN_FLAGS_ENUMS);

  for (const match of content.matchAll(/public\s+enum\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const enumName = match[1];
    const body = match[2];
    const members: string[] = [];

    for (const memberMatch of body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^,}]*)?(?:,)?\s*$/gm)) {
      members.push(memberMatch[1]);
    }

    if (members.length > 0) {
      enums[enumName] = members;
    }

    const before = content.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
    if (/\[Flags\]/.test(before)) {
      flagsEnums.add(enumName);
    }
  }

  return { enums, flagsEnums };
}

function formatEnumValues(values: string[]): string {
  return values.map((value) => `<code>${value}</code>`).join('<br>');
}

function resolveEnumNames(parseType: string): string[] {
  const candidates: string[] = [];

  const mapped = PARSE_TYPE_TO_ENUM[parseType];
  if (mapped) {
    candidates.push(mapped);
  }

  candidates.push(parseType);

  if (parseType.endsWith('Enum')) {
    candidates.push(parseType.slice(0, -4));
  } else {
    candidates.push(`${parseType}Enum`);
  }

  return [...new Set(candidates)];
}

function lookupEnumValues(
  parseType: string,
  parsed: ParsedEnums
): { values: string[]; multipleAllowed: boolean } | null {
  for (const enumName of resolveEnumNames(parseType)) {
    const external = EXTERNAL_ENUMS[enumName];
    if (external) {
      return { values: external, multipleAllowed: false };
    }

    const values = parsed.enums[enumName];
    if (values && values.length > 0) {
      return {
        values,
        multipleAllowed: parsed.flagsEnums.has(enumName),
      };
    }
  }

  return null;
}

export function getEnhancedTypeHint(parseType: string, profileSource?: string): TypeHint | null {
  if (parseType === 'Vector3D') {
    return {
      allowedValuesHtml: 'Vector3D coordinates<br>eg: <code>{X:0 Y:0 Z:0}</code>',
      multipleAllowed: false,
    };
  }

  if (parseType === 'Vector3') {
    return {
      allowedValuesHtml: 'Vector3 value (RGB color or coordinates)<br>eg: <code>{X:0 Y:0 Z:0}</code>',
      multipleAllowed: false,
    };
  }

  if (parseType === 'Vector3I') {
    return {
      allowedValuesHtml: 'Vector3I integer coordinates<br>eg: <code>{X:0 Y:0 Z:0}</code>',
      multipleAllowed: false,
    };
  }

  if (parseType === 'Vector3DList') {
    return {
      allowedValuesHtml:
        'Comma-separated Vector3D values<br>eg: <code>{X:0 Y:0 Z:0},{X:1 Y:1 Z:1}</code>',
      multipleAllowed: true,
    };
  }

  if (parseType === 'Vector3Dictionary') {
    return {
      allowedValuesHtml: 'Comma-separated from-color,to-color Vector3 pairs',
      multipleAllowed: true,
    };
  }

  if (parseType === 'Vector3StringDictionary') {
    return {
      allowedValuesHtml: 'Comma-separated Vector3:skinName pairs',
      multipleAllowed: true,
    };
  }

  if (parseType === 'MyDefId') {
    return {
      allowedValuesHtml:
        'Block definition ID (subtype/name)<br>eg: <code>LargeBlockSmallGenerator</code>',
      multipleAllowed: true,
    };
  }

  if (parseType === 'MDIDictionary') {
    return {
      allowedValuesHtml: 'Comma-separated oldBlock,newBlock definition ID pairs',
      multipleAllowed: false,
    };
  }

  const enumLike =
    PARSE_TYPE_TO_ENUM[parseType] !== undefined ||
    parseType.endsWith('Enum') ||
    /^(GridConfiguration|MissionType|AutoPilotProfileMode|DirectionEnum|ModifierEnum|SwitchEnum|CheckEnum|BoolEnum|BehaviorSubclass|BehaviorMode|ActionExecution)$/.test(
      parseType
    );

  if (!enumLike) {
    return null;
  }

  if (!profileSource) {
    const externalOnly = lookupEnumValues(parseType, { enums: {}, flagsEnums: KNOWN_FLAGS_ENUMS });
    if (externalOnly) {
      return {
        allowedValuesHtml: formatEnumValues(externalOnly.values),
        multipleAllowed: externalOnly.multipleAllowed,
      };
    }
    return null;
  }

  const parsed = parseEnumsFromProfileSource(profileSource);
  const resolved = lookupEnumValues(parseType, parsed);
  if (!resolved) {
    return null;
  }

  return {
    allowedValuesHtml: formatEnumValues(resolved.values),
    multipleAllowed: resolved.multipleAllowed,
  };
}
