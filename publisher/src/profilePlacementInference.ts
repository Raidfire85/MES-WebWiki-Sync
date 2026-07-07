import {
  extensionHtmlToWebWikiMd,
  WEBWIKI_MERIDIUS_PROFILE_CS,
} from './constants';
import { profileCsToTitle } from './syncBridge';

export type ProfileNavGroup =
  | 'existing-leaf'
  | 'modding-economy'
  | 'modding-manipulation'
  | 'modding-player'
  | 'modding-spawning'
  | 'modding-events'
  | 'modding-behaviors'
  | 'modding-zone'
  | 'modding-discovered'
  | 'modder-resources';

/** Where auto-managed profile pages belong in mkdocs.yml (under Modding / Modder Resources). */
export interface WebWikiProfilePlacement {
  mdFile: string;
  navTitle: string;
  navGroup: ProfileNavGroup;
  parentNavPath: string[];
  matchExistingTitle?: string;
}

export interface ProfilePlacementContext {
  header: string | null;
  title: string;
  htmlFile: string;
}

/** Optional per-profile overrides (filename, nav title, or placement tweaks). */
export const WEBWIKI_PROFILE_PLACEMENT_OVERRIDES: Partial<
  Record<string, Partial<WebWikiProfilePlacement>>
> = {
  'FactionIconProfile.cs': {
    navTitle: 'Faction Icon Profiles',
  },
};

/** Meridius wiki already lists these under Modding — sync tool fills the page, not a new nav leaf. */
const MERIDIUS_EXISTING_NAV: Record<
  string,
  { matchExistingTitle: string; parentNavPath: string[] }
> = {
  'BlockReplacementProfile.cs': {
    matchExistingTitle: 'Block Replacement',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'DerelictionProfile.cs': {
    matchExistingTitle: 'Dereliction',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'LootProfile.cs': {
    matchExistingTitle: 'Loot',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'ManipulationProfile.cs': {
    matchExistingTitle: 'Manipulation Groups',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'ReplenishmentProfile.cs': {
    matchExistingTitle: 'Replenishment',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'WeaponModRulesProfile.cs': {
    matchExistingTitle: 'Weapon Mod Rules',
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'TriggerGroupProfile.cs': {
    matchExistingTitle: 'Trigger Group',
    parentNavPath: ['Modding', 'Behaviors (Getting Started)'],
  },
  'WaypointProfile.cs': {
    matchExistingTitle: 'Waypoint',
    parentNavPath: ['Modding', 'Behaviors (Getting Started)'],
  },
  'ZoneConditionsProfile.cs': {
    matchExistingTitle: 'Zone Conditions',
    parentNavPath: ['Modding', 'Spawning'],
  },
  'EventProfile.cs': {
    matchExistingTitle: 'Event',
    parentNavPath: ['Modding', 'Events (Getting Started)'],
  },
};

type CategoryRule = {
  navGroup: ProfileNavGroup;
  matchHeader?: (header: string) => boolean;
  matchProfileCs?: (profileCs: string) => boolean;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    navGroup: 'modding-manipulation',
    matchHeader: (header) =>
      /\[MES (Block Replacement|Dereliction|Loot|Manipulation|Prefab|Replenishment|Weapon Mod Rules)\]/i.test(
        header
      ) || /\[MES Prefab Gravity\]/i.test(header),
    matchProfileCs: (profileCs) =>
      /(BlockReplacement|Dereliction|Loot|Manipulation|Prefab|Replenishment|WeaponModRules|Gravity)/i.test(
        profileCs
      ),
  },
  {
    navGroup: 'modding-economy',
    matchHeader: (header) =>
      /\[MES (Shipyard|Store|SafeZone|Mission|Contract Block)\]/i.test(header),
    matchProfileCs: (profileCs) =>
      /(Shipyard|Store|Safezone|SafeZone|Mission|ContractBlock)/i.test(profileCs),
  },
  {
    navGroup: 'modding-player',
    matchHeader: (header) => /\[MES (Player Condition|Suit Upgrades)\]/i.test(header),
    matchProfileCs: (profileCs) => /(PlayerCondition|SuitUpgrade)/i.test(profileCs),
  },
  {
    navGroup: 'modder-resources',
    matchHeader: (header) => /\[MES Faction Icon\]/i.test(header),
    matchProfileCs: (profileCs) => /FactionIcon/i.test(profileCs),
  },
  {
    navGroup: 'modding-zone',
    matchHeader: (header) => /\[MES Zone( Conditions)?\]/i.test(header),
    matchProfileCs: (profileCs) => /Zone(Conditions)?Profile/i.test(profileCs),
  },
  {
    navGroup: 'modding-spawning',
    matchHeader: (header) =>
      /\[MES (Spawn Conditions|Spawn Conditions Group|Static Encounter|Bot Spawn)\]/i.test(
        header
      ) || /\[Modular Encounters SpawnGroup\]/i.test(header),
    matchProfileCs: (profileCs) =>
      /(SpawnCondition|SpawnGroup|StaticEncounter|BotSpawn)/i.test(profileCs),
  },
  {
    navGroup: 'modding-events',
    matchHeader: (header) => /\[MES Event/i.test(header),
    matchProfileCs: (profileCs) => /Event/i.test(profileCs),
  },
  {
    navGroup: 'modding-behaviors',
    matchHeader: (header) => /(\[RivalAI|\[MES AI )/i.test(header),
    matchProfileCs: (profileCs) =>
      /(Action|Autopilot|Behavior|Chat|Command|Condition|Spawn|Target|Trigger|Weapon|Waypoint)/i.test(
        profileCs
      ),
  },
];

const NAV_GROUP_DEFAULTS: Record<
  Exclude<ProfileNavGroup, 'existing-leaf'>,
  Pick<WebWikiProfilePlacement, 'parentNavPath'>
> = {
  'modding-manipulation': {
    parentNavPath: ['Modding', 'Spawning', 'Manipulation'],
  },
  'modding-economy': {
    parentNavPath: ['Modding'],
  },
  'modding-player': {
    parentNavPath: ['Modding'],
  },
  'modder-resources': {
    parentNavPath: ['Modder Resources'],
  },
  'modding-zone': {
    parentNavPath: ['Modding'],
  },
  'modding-spawning': {
    parentNavPath: ['Modding', 'Spawning'],
  },
  'modding-events': {
    parentNavPath: ['Modding', 'Events (Getting Started)'],
  },
  'modding-behaviors': {
    parentNavPath: ['Modding', 'Behaviors (Getting Started)'],
  },
  'modding-discovered': {
    parentNavPath: ['Modding'],
  },
};

export function resolveProfileMdFile(
  profileCs: string,
  htmlFile: string,
  header: string | null = null
): string {
  const override = WEBWIKI_PROFILE_PLACEMENT_OVERRIDES[profileCs]?.mdFile;
  if (override) {
    return override;
  }

  const meridiusMd = WEBWIKI_MERIDIUS_PROFILE_CS[profileCs];
  if (meridiusMd) {
    return meridiusMd;
  }

  return extensionHtmlToWebWikiMd(htmlFile);
}

export function inferProfileNavGroup(
  profileCs: string,
  context: ProfilePlacementContext
): ProfileNavGroup {
  if (MERIDIUS_EXISTING_NAV[profileCs] || WEBWIKI_MERIDIUS_PROFILE_CS[profileCs]) {
    return 'existing-leaf';
  }

  const header = context.header ?? '';
  for (const rule of CATEGORY_RULES) {
    if (rule.matchHeader?.(header) || rule.matchProfileCs?.(profileCs)) {
      return rule.navGroup;
    }
  }

  return 'modding-discovered';
}

export function inferProfilePlacement(
  profileCs: string,
  context: ProfilePlacementContext
): WebWikiProfilePlacement {
  const mdFile = resolveProfileMdFile(profileCs, context.htmlFile, context.header);
  const navTitle = context.title || profileCsToTitle(profileCs);
  const navGroup = inferProfileNavGroup(profileCs, context);

  if (navGroup === 'existing-leaf') {
    const existingNav = MERIDIUS_EXISTING_NAV[profileCs];
    if (existingNav) {
      return {
        mdFile,
        navTitle: existingNav.matchExistingTitle,
        navGroup,
        parentNavPath: existingNav.parentNavPath,
        matchExistingTitle: existingNav.matchExistingTitle,
      };
    }

    const derivedTitle = navTitleFromMdFile(mdFile);
    return {
      mdFile,
      navTitle: derivedTitle,
      navGroup,
      parentNavPath: ['Modding'],
      matchExistingTitle: derivedTitle,
    };
  }

  const defaults = NAV_GROUP_DEFAULTS[navGroup];
  return {
    mdFile,
    navTitle,
    navGroup,
    parentNavPath: defaults.parentNavPath,
  };
}

export function resolveProfilePlacement(
  profileCs: string,
  context: ProfilePlacementContext
): WebWikiProfilePlacement {
  const inferred = inferProfilePlacement(profileCs, context);
  const override = WEBWIKI_PROFILE_PLACEMENT_OVERRIDES[profileCs];
  if (!override) {
    return inferred;
  }

  return {
    ...inferred,
    ...override,
    parentNavPath: override.parentNavPath ?? inferred.parentNavPath,
  };
}

export function isPublisherManagedProfilePage(profileCs: string, mdFile: string): boolean {
  if (WEBWIKI_PROFILE_PLACEMENT_OVERRIDES[profileCs]) {
    return true;
  }

  if (WEBWIKI_MERIDIUS_PROFILE_CS[profileCs]) {
    return true;
  }

  if (/Profile\.cs$/i.test(profileCs) && mdFile.endsWith('.md')) {
    return true;
  }

  return false;
}

function navTitleFromMdFile(mdFile: string): string {
  const stem = mdFile.replace(/\.md$/i, '');
  return stem
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
