export const SYNC_START = '<!-- MES-WIKI-SOURCE-SYNC-START -->';
export const SYNC_END = '<!-- MES-WIKI-SOURCE-SYNC-END -->';
export const HOME_NOTICE_START = '<!-- MES-WIKI-NOTICE-START -->';
export const HOME_NOTICE_END = '<!-- MES-WIKI-NOTICE-END -->';
export const SIDEBAR_PATTERN = /<div class=['"]wiki-sidebar['"]>/;

export const GITHUB_REPO = 'MeridiusIX/Modular-Encounters-Systems';
export const GITHUB_BRANCH = 'master';
export const MES_SCRIPTS_GITHUB_PATH = 'Data/Scripts/ModularEncountersSystems';
export const GITHUB_TREE_API = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
export const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

/** Known Steam workshop install path for MES (used in offline fallback search). */
export const WORKSHOP_MES_SOURCE_PATH =
  'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\244850\\1521905890\\Data\\Scripts\\ModularEncountersSystems';

export type WikiTableStyle = 'Action' | 'Target' | 'Prefab';

export interface PageSyncConfig {
  profile: string | null;
  style: WikiTableStyle;
  extraTags?: string[];
}

export const PAGE_MAP: Record<string, PageSyncConfig> = {
  'Target.html': { profile: 'TargetProfile.cs', style: 'Target' },
  'Action.html': { profile: 'ActionReferenceProfile.cs', style: 'Action' },
  'Autopilot.html': { profile: 'AutoPilotProfile.cs', style: 'Action' },
  'Condition.html': { profile: 'ConditionReferenceProfile.cs', style: 'Action' },
  'Trigger.html': { profile: 'TriggerProfile.cs', style: 'Action' },
  'Spawning-Conditions.html': { profile: 'SpawnConditionsProfile.cs', style: 'Prefab' },
  'Command.html': { profile: 'CommandProfile.cs', style: 'Action' },
  'Chat.html': { profile: 'ChatProfile.cs', style: 'Action' },
  'Spawn.html': { profile: 'SpawnProfile.cs', style: 'Action' },
  'Weapons.html': { profile: 'WeaponSystemReference.cs', style: 'Action', extraTags: ['WeaponsSystem'] },
  'Player-Condition-Profile.html': { profile: 'PlayerConditionProfile.cs', style: 'Action' },
  'Core-Behavior.html': {
    profile: null,
    style: 'Action',
    extraTags: [
      'HorseflyWaypointWaitTimeTrigger',
      'HorseflyWaypointAbandonTimeTrigger',
      'HorseFighterWaypointWaitTimeTrigger',
      'HorseFighterWaypointAbandonTimeTrigger',
      'HorseNauticalWaypointWaitTimeTrigger',
      'HorseNauticalWaypointAbandonTimeTrigger',
      'HorseFighterEngageDistancePlanet',
      'HorseFighterEngageDistanceSpace',
      'HorseFighterDisengageDistancePlanet',
      'HorseFighterDisengageDistanceSpace',
      'FighterEngageDistancePlanet',
      'FighterEngageDistanceSpace',
      'FighterDisengageDistancePlanet',
      'FighterDisengageDistanceSpace',
      'FighterPlaneBeginPlanetAttackRunDistance',
      'FighterPlaneBeginSpaceAttackRunDistance',
      'FighterPlaneBreakawayDistance',
      'FighterPlaneEngageUseSafePlanetPathing',
      'FighterPlaneOffsetRecalculationTime',
      'CustomWaypoints',
      'Routes',
      'GetSpeedFromSpawnGroup',
      'UsePauseAutopilotFromSpawnGroup',
    ],
  },
  'Event-Action.html': { profile: 'EventActionReference.cs', style: 'Action' },
  'Event-Condition.html': { profile: 'EventConditions.cs', style: 'Action' },
  'Bot-Spawn.html': { profile: 'BotSpawnProfile.cs', style: 'Prefab' },
  'Prefab-Data.html': { profile: 'PrefabDataProfile.cs', style: 'Prefab', extraTags: ['Score'] },
};

export interface NewProfilePageConfig {
  file: string;
  title: string;
  profile: string;
  style: WikiTableStyle;
  blurb: string;
}

export const NEW_PROFILE_PAGES: NewProfilePageConfig[] = [
  {
    file: 'Shipyard-Profile.html',
    title: 'Shipyard',
    profile: 'ShipyardProfile.cs',
    style: 'Prefab',
    blurb:
      'Shipyard profiles configure NPC shipyard blocks (blueprint building, repairs, scrap, grid takeover).',
  },
  {
    file: 'Safezone-Profile.html',
    title: 'Safezone',
    profile: 'SafezoneProfile.cs',
    style: 'Prefab',
    blurb: 'Safezone profiles define safe zones spawned or linked via MES actions.',
  },
  {
    file: 'Store-Profile.html',
    title: 'Store',
    profile: 'StoreProfile.cs',
    style: 'Prefab',
    blurb: 'Store profiles configure economy store block offers and orders.',
  },
  {
    file: 'Mission-Profile.html',
    title: 'Mission',
    profile: 'MissionProfile.cs',
    style: 'Prefab',
    blurb: 'Mission profiles define contract/mission data used by MES contract blocks.',
  },
];
