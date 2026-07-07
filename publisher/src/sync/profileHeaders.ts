/** Profile header line in Description → primary wiki HTML file (built-in pages). */
export const STATIC_PROFILE_HEADERS: Record<string, string> = {
  '[RivalAI Behavior]': 'Core-Behavior.html',
  '[RivalAI Autopilot]': 'Autopilot.html',
  '[RivalAI Trigger]': 'Trigger.html',
  '[RivalAI TriggerGroup]': 'Trigger-Group.html',
  '[RivalAI Action]': 'Action.html',
  '[RivalAI Chat]': 'Chat.html',
  '[RivalAI Command]': 'Command.html',
  '[RivalAI Condition]': 'Condition.html',
  '[RivalAI Target]': 'Target.html',
  '[RivalAI Waypoint]': 'Waypoint.html',
  '[RivalAI Spawn]': 'Spawn.html',
  '[RivalAI Weapons]': 'Weapons.html',
  '[Modular Encounters SpawnGroup]': 'SpawnGroup.html',
  '[MES Zone]': 'Zone.html',
  '[MES Zone Conditions]': 'Zone-Conditions.html',
  '[MES Spawn Conditions]': 'Spawning-Conditions.html',
  '[MES Spawn Conditions Group]': 'Spawning-Conditions-Groups.html',
  '[MES Manipulation]': 'Manipulation.html',
  '[MES Manipulation Group]': 'Manipulation-Groups.html',
  '[MES Loot]': 'Loot.html',
  '[MES Loot Group]': 'Loot-Profile-Group.html',
  '[MES Weapon Mod Rules]': 'Weapon-Mod-Rules.html',
  '[MES Replenishment]': 'Replenishment.html',
  '[MES Prefab Data]': 'Prefab-Data.html',
  '[MES Player Condition]': 'Player-Condition-Profile.html',
  '[MES Dereliction]': 'Dereliction.html',
  '[MES Event]': 'Event.html',
  '[MES Event Action]': 'Event-Action.html',
  '[MES Event Condition]': 'Event-Condition.html',
  '[MES Shipyard]': 'Shipyard-Profile.html',
  '[MES SafeZone]': 'Safezone-Profile.html',
  '[MES Store]': 'Store-Profile.html',
  '[MES Mission]': 'Mission-Profile.html',
};

/** @deprecated Use getProfileHeaders() */
export const PROFILE_HEADERS = STATIC_PROFILE_HEADERS;

let discoveredHeaders: Record<string, string> = {};

export function setDiscoveredProfileHeaders(headers: Record<string, string>): void {
  discoveredHeaders = headers;
}

export function getProfileHeaders(): Record<string, string> {
  return { ...STATIC_PROFILE_HEADERS, ...discoveredHeaders };
}

export const KNOWN_INVALID_TAGS = new Set([
  'MaxEngagementDistance',
  'IdealTargetDistance',
  'IdealMinimumDistance',
  'OffensiveApproachSpeed',
  'OffensiveRetreatSpeed',
  'AutopilotFlags',
  'RemoveGridOnDespawn',
  'TimeUntilDespawn',
  'IgnoreDespawnRules',
  'BroadcastCurrentTarget',
  'BroadcastDespawnMessage',
  'MaximumWeaponRange',
  'IgnoreOtherCombatFlags',
  'MaxDistanceFromDefenseTerritory',
  'TerritoryToDefend',
  'PatrolRouteDistanceIncrement',
  'PatrolRouteMinDistance',
  'PatrolRouteMaxDistance',
  'DisengageOnNoTarget',
  'MaxTimeToWaitForTarget',
]);

const REFERENCE_TAG_SUFFIXES = [
  'Profiles',
  'Data',
  'Groups',
  'Group',
  'Names',
  'Override',
];

/** Tag names ending in "Profile" that are bool toggles or enums — not SubtypeId references. */
const NON_REFERENCE_TAG_NAMES = new Set([
  'AutopilotProfile',
  'ChangeAutopilotProfile',
  'OverwriteAutopilotProfile',
  'UseBlockReplacerProfile',
]);

export function isLikelyReferenceTag(tagName: string): boolean {
  if (NON_REFERENCE_TAG_NAMES.has(tagName) || tagName === 'BehaviorName') {
    return false;
  }

  return REFERENCE_TAG_SUFFIXES.some((suffix) => tagName.endsWith(suffix));
}

export function normalizeHeader(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\[(?:RivalAI|MES|Modular Encounters)[^\]]+\])/);
  return match?.[1] ?? null;
}

export const REQUIRED_PROFILE_TAGS: Record<string, string[]> = {
  '[RivalAI Behavior]': ['BehaviorName'],
  '[RivalAI Trigger]': ['Type'],
};
