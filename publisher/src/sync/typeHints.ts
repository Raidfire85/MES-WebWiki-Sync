export interface TypeHint {
  allowedValuesHtml: string;
  multipleAllowed: boolean;
}

export function getTypeHint(parseType: string): TypeHint {
  if (/^Bool/.test(parseType)) {
    return { allowedValuesHtml: '<code>true</code><br><code>false</code>', multipleAllowed: false };
  }
  if (/^Int|^Long|^Short|^Uint/.test(parseType)) {
    return { allowedValuesHtml: 'Any Integer Value', multipleAllowed: false };
  }
  if (/^Float|^Double/.test(parseType)) {
    return { allowedValuesHtml: 'Any Number Value', multipleAllowed: false };
  }
  if (parseType === 'String') {
    return { allowedValuesHtml: 'Any String Value', multipleAllowed: false };
  }
  if (parseType === 'Guid') {
    return { allowedValuesHtml: 'GUID value (e.g. <code>00000000-0000-0000-0000-000000000000</code>)', multipleAllowed: false };
  }
  if (/^StringList|^IntList|^LongList|^BoolList/.test(parseType)) {
    return { allowedValuesHtml: 'Comma-separated list of values', multipleAllowed: true };
  }
  if (/^StringDict|^StringIntDict/.test(parseType)) {
    return { allowedValuesHtml: 'Comma-separated key,value pairs', multipleAllowed: true };
  }
  if (parseType === 'BehaviorSubclass') {
    return {
      allowedValuesHtml: 'BehaviorSubclass enum (Horsefly, Patrol, Fighter, Strike, etc.)',
      multipleAllowed: false,
    };
  }
  if (/^TargetFilter|^TargetSort|^TargetType|^TargetOwner|^TargetRelation|^CheckEnum/.test(parseType)) {
    return {
      allowedValuesHtml: 'MES enum value (see Threat Score / Target guides)',
      multipleAllowed: false,
    };
  }
  if (parseType === 'SwitchEnum') {
    return { allowedValuesHtml: '<code>On</code><br><code>Off</code>', multipleAllowed: false };
  }
  if (parseType === 'ModifierEnum') {
    return { allowedValuesHtml: 'Modifier enum value', multipleAllowed: false };
  }
  if (parseType === 'MyDefId') {
    return {
      allowedValuesHtml: 'Block definition ID (subtype/name, e.g. LargeBlockSmallGenerator)',
      multipleAllowed: true,
    };
  }
  if (parseType === 'MDIDictionary') {
    return {
      allowedValuesHtml: 'Comma-separated oldBlock,newBlock definition ID pairs',
      multipleAllowed: false,
    };
  }
  if (parseType === 'Int') {
    return { allowedValuesHtml: 'Any Integer Value', multipleAllowed: false };
  }
  if (parseType === 'Vector3DList') {
    return {
      allowedValuesHtml: 'Comma-separated Vector3D values (e.g. {X:0 Y:0 Z:0})',
      multipleAllowed: true,
    };
  }
  if (parseType === 'Vector3I') {
    return {
      allowedValuesHtml: 'Vector3I integer coordinates (e.g. {X:0 Y:0 Z:0})',
      multipleAllowed: false,
    };
  }
  if (parseType === 'Vector3Dictionary' || parseType === 'Vector3StringDictionary') {
    return { allowedValuesHtml: 'Comma-separated key,value pairs', multipleAllowed: true };
  }
  if (parseType === 'Contains' || parseType === 'StartsWith' || parseType === 'CustomDataContains') {
    return { allowedValuesHtml: 'Tag presence flag (no value required)', multipleAllowed: false };
  }
  if (/^StringStringDict|^StringDict|^StringIntDict/.test(parseType)) {
    return { allowedValuesHtml: 'Comma-separated key,value pairs', multipleAllowed: true };
  }
  if (/^UlongList|^LongList/.test(parseType)) {
    return { allowedValuesHtml: 'Comma-separated unsigned long values (e.g. mod IDs)', multipleAllowed: true };
  }
  if (parseType === 'TextTemplate') {
    return { allowedValuesHtml: 'Text template profile reference', multipleAllowed: true };
  }
  if (/Profile$|ProfileList$/.test(parseType)) {
    return { allowedValuesHtml: 'MES profile subtype ID reference', multipleAllowed: /List$/.test(parseType) };
  }
  if (parseType === 'Unknown') {
    return { allowedValuesHtml: 'Value per tag format (see MES behavior/profile source)', multipleAllowed: false };
  }
  return { allowedValuesHtml: 'See MES source / enum definition', multipleAllowed: false };
}

export function splitPascalCase(text: string): string {
  if (!text?.trim()) {
    return text;
  }
  let s = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return s.replace(/_/g, ' ').toLowerCase();
}

export function inferDescription(tagName: string, parseType: string): string {
  const words = splitPascalCase(tagName);
  return `Configures ${words}.`;
}
