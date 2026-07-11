import type { TypeHint } from './sync/typeHints';

const EXTERNAL_ENUMS: Record<string, string[]> = {
  MySafeZoneShape: ['Sphere', 'Box'],
};

/** Maps TagParse check suffixes (from tag meta) to enum type names in profile source. */
const PARSE_TYPE_TO_ENUM: Record<string, string> = {
  SafeZoneShapeEnum: 'MySafeZoneShape',
  SafeZoneAccessTypeEnum: 'SafeZoneAccessType',
  SafeZoneActionEnum: 'SafeZoneAction',
};

const FLAGS_ENUMS = new Set(['SafeZoneAction']);

export function parseEnumsFromProfileSource(content: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {};

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
  }

  return enums;
}

function formatEnumValues(values: string[]): string {
  return values.map((value) => `<code>${value}</code>`).join('<br>');
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

  const enumName = PARSE_TYPE_TO_ENUM[parseType] ?? (parseType.endsWith('Enum') ? parseType.replace(/Enum$/, '') : null);
  if (!enumName) {
    return null;
  }

  const external = EXTERNAL_ENUMS[enumName];
  if (external) {
    return {
      allowedValuesHtml: formatEnumValues(external),
      multipleAllowed: false,
    };
  }

  if (!profileSource) {
    return null;
  }

  const enums = parseEnumsFromProfileSource(profileSource);
  const values = enums[enumName];
  if (!values || values.length === 0) {
    return null;
  }

  return {
    allowedValuesHtml: formatEnumValues(values),
    multipleAllowed: FLAGS_ENUMS.has(enumName),
  };
}