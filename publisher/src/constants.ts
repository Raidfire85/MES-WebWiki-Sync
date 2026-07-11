import { PAGE_MAP } from './syncBridge';
import type { PageSyncConfig } from './types';

/** MkDocs sync markers — separate from extension HTML wiki markers. */
export const WEBWIKI_SYNC_START = '<!-- MES-WEBWIKI-SOURCE-SYNC-START -->';
export const WEBWIKI_SYNC_END = '<!-- MES-WEBWIKI-SOURCE-SYNC-END -->';
export const WEBWIKI_NAV_START = '# MES-WEBWIKI-SOURCE-SYNC-NAV-START';
export const WEBWIKI_NAV_END = '# MES-WEBWIKI-SOURCE-SYNC-NAV-END';
export const WEBWIKI_VALIDATION_START = '# MES-WEBWIKI-SOURCE-SYNC-VALIDATION-START';
export const WEBWIKI_VALIDATION_END = '# MES-WEBWIKI-SOURCE-SYNC-VALIDATION-END';
export const WEBWIKI_HOME_SYNC_START = '<!-- MES-WEBWIKI-HOME-SYNC-START -->';
export const WEBWIKI_HOME_SYNC_END = '<!-- MES-WEBWIKI-HOME-SYNC-END -->';
export const WEBWIKI_UPDATES_SYNC_START = '<!-- MES-WEBWIKI-UPDATES-SYNC-START -->';
export const WEBWIKI_UPDATES_SYNC_END = '<!-- MES-WEBWIKI-UPDATES-SYNC-END -->';
export const WEBWIKI_STYLE_SYNC_START = '/* MES-WEBWIKI-STYLE-SYNC-START */';
export const WEBWIKI_STYLE_SYNC_END = '/* MES-WEBWIKI-STYLE-SYNC-END */';
export const WEBWIKI_EXAMPLE_SYNC_START = '<!-- MES-WEBWIKI-EXAMPLE-SYNC-START -->';
export const WEBWIKI_EXAMPLE_SYNC_END = '<!-- MES-WEBWIKI-EXAMPLE-SYNC-END -->';
export const WEBWIKI_LOG_SYNC_START = '<!-- MES-WEBWIKI-LOG-SYNC-START -->';
export const WEBWIKI_LOG_SYNC_END = '<!-- MES-WEBWIKI-LOG-SYNC-END -->';
export const WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_START =
  '<!-- MES-WEBWIKI-BLOCK-REPLACEMENT-PROFILES-INTRO-START -->';
export const WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_END =
  '<!-- MES-WEBWIKI-BLOCK-REPLACEMENT-PROFILES-INTRO-END -->';

/** Extension bundled wiki HTML → official WebWiki/docs Markdown filenames. */
export const EXTENSION_HTML_TO_WEBWIKI_MD: Record<string, string> = {
  'Action.html': 'Action.md',
  'Target.html': 'Target.md',
  'Autopilot.html': 'Autopilot.md',
  'Condition.html': 'Condition.md',
  'Trigger.html': 'Trigger.md',
  'Spawning-Conditions.html': 'Spawn-Conditions.md',
  'Command.html': 'Command.md',
  'Chat.html': 'Chat.md',
  'Spawn.html': 'Spawn.md',
  'Weapons.html': 'Weapons.md',
  'Player-Condition-Profile.html': 'Player-Condition-Profile.md',
  'Core-Behavior.html': 'Core-Behavior.md',
  'Event-Action.html': 'Event-Action.md',
  'Event-Condition.html': 'Event-Conditions.md',
  'Bot-Spawn.html': 'Bot-Spawn.md',
  'Prefab-Data.html': 'Prefab-Data.md',
};

export const WEBWIKI_PAGE_MAP: Record<string, PageSyncConfig> = Object.fromEntries(
  Object.entries(EXTENSION_HTML_TO_WEBWIKI_MD).map(([htmlFile, mdFile]) => [
    mdFile,
    PAGE_MAP[htmlFile],
  ])
);

/** Profile .cs files documented on an existing Meridius WebWiki page. */
export const WEBWIKI_MERIDIUS_PROFILE_CS: Record<string, string> = {
  'BlockReplacementProfile.cs': 'Block-Replacement.md',
  'DerelictionProfile.cs': 'Dereliction.md',
  'EventProfile.cs': 'Event.md',
  'LootProfile.cs': 'Loot.md',
  'ManipulationProfile.cs': 'Manipulation.md',
  'ReplenishmentProfile.cs': 'Replenishment.md',
  'TriggerGroupProfile.cs': 'Trigger-Group.md',
  'WaypointProfile.cs': 'Waypoint.md',
  'WeaponModRulesProfile.cs': 'Weapon-Mod-Rules.md',
  'ZoneConditionsProfile.cs': 'Zone-Conditions-Profile.md',
};

export function extensionHtmlToWebWikiMd(htmlFile: string): string {
  return htmlFile.replace(/\.html$/i, '.md');
}
