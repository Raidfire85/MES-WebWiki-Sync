import type { ProfileNavGroup, WebWikiProfilePlacement } from './profilePlacementInference';
import {
  isPublisherManagedProfilePage,
  resolveProfileMdFile,
  resolveProfilePlacement,
} from './profilePlacementInference';

export type { ProfileNavGroup, ProfilePlacementContext, WebWikiProfilePlacement } from './profilePlacementInference';
export {
  inferProfileNavGroup,
  inferProfilePlacement,
  isPublisherManagedProfilePage,
  resolveProfileMdFile,
  resolveProfilePlacement,
  WEBWIKI_PROFILE_PLACEMENT_OVERRIDES,
} from './profilePlacementInference';

export const PROFILE_NAV_SYNC_MARKERS = {
  'modding-manipulation': {
    start: '# MES-WEBWIKI-NAV-MODDING-MANIPULATION-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-MANIPULATION-SYNC-END',
    insertAfterNavPath: ['Modding', 'Spawning', 'Manipulation'],
    insertMode: 'after-last-child' as const,
    childIndent: 14,
    sectionIndent: 0,
  },
  'modding-spawning': {
    start: '# MES-WEBWIKI-NAV-MODDING-SPAWNING-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-SPAWNING-SYNC-END',
    sectionTitle: 'Additional Spawning Profiles',
    insertAfterNavPath: ['Modding', 'Spawning'],
    insertMode: 'after-last-child' as const,
    childIndent: 10,
    sectionIndent: 6,
  },
  'modding-events': {
    start: '# MES-WEBWIKI-NAV-MODDING-EVENTS-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-EVENTS-SYNC-END',
    sectionTitle: 'Additional Event Profiles',
    insertAfterNavPath: ['Modding', 'Events (Getting Started)'],
    insertMode: 'after-last-child' as const,
    childIndent: 10,
    sectionIndent: 6,
  },
  'modding-behaviors': {
    start: '# MES-WEBWIKI-NAV-MODDING-BEHAVIORS-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-BEHAVIORS-SYNC-END',
    sectionTitle: 'Additional Behavior Profiles',
    insertAfterNavPath: ['Modding', 'Behaviors (Getting Started)'],
    insertMode: 'after-last-child' as const,
    childIndent: 10,
    sectionIndent: 6,
  },
  'modding-player': {
    start: '# MES-WEBWIKI-NAV-MODDING-PLAYER-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-PLAYER-SYNC-END',
    insertAfterNavPath: ['Modding', 'Player Conditions (New)'],
    insertMode: 'after-anchor' as const,
    childIndent: 6,
    sectionIndent: 0,
  },
  'modding-zone': {
    start: '# MES-WEBWIKI-NAV-MODDING-ZONE-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-ZONE-SYNC-END',
    insertAfterNavPath: ['Modding', 'Zone'],
    insertMode: 'after-anchor' as const,
    childIndent: 6,
    sectionIndent: 0,
  },
  'modding-economy': {
    start: '# MES-WEBWIKI-NAV-MODDING-ECONOMY-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-ECONOMY-SYNC-END',
    sectionTitle: 'Economy & Station Blocks',
    insertAfterNavPath: ['Modding', 'Zone'],
    insertMode: 'after-anchor' as const,
    childIndent: 10,
    sectionIndent: 6,
  },
  'modding-discovered': {
    start: '# MES-WEBWIKI-NAV-MODDING-DISCOVERED-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDING-DISCOVERED-SYNC-END',
    sectionTitle: 'Additional Profiles',
    insertAfterNavPath: ['Modding', 'Zone'],
    insertMode: 'after-anchor' as const,
    childIndent: 10,
    sectionIndent: 6,
  },
  'modder-resources': {
    start: '# MES-WEBWIKI-NAV-MODDER-RESOURCES-SYNC-START',
    end: '# MES-WEBWIKI-NAV-MODDER-RESOURCES-SYNC-END',
    insertAfterNavPath: ['Modder Resources'],
    insertMode: 'after-last-child' as const,
    childIndent: 4,
    sectionIndent: 0,
  },
} as const;

export const MANAGED_PROFILE_NAV_GROUP_ORDER: ProfileNavGroup[] = [
  'modding-manipulation',
  'modding-spawning',
  'modding-events',
  'modding-behaviors',
  'modding-player',
  'modding-zone',
  'modding-economy',
  'modding-discovered',
  'modder-resources',
];

/** Legacy top-level nav block — removed on publish. */
export const LEGACY_PROFILE_NAV_START = '# MES-WEBWIKI-SOURCE-SYNC-NAV-START';
export const LEGACY_PROFILE_NAV_END = '# MES-WEBWIKI-SOURCE-SYNC-NAV-END';

export function getProfilePlacement(
  profileCs: string,
  context: {
    header: string | null;
    title: string;
    htmlFile: string;
  }
): WebWikiProfilePlacement {
  return resolveProfilePlacement(profileCs, context);
}

export function getProfileMdFile(
  profileCs: string,
  htmlFile: string,
  header: string | null = null
): string {
  return resolveProfileMdFile(profileCs, htmlFile, header);
}
