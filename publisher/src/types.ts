/** Local type definitions for the WebWiki sync tool. */

export type WikiTableStyle = 'Action' | 'Target' | 'Prefab';

export interface PageSyncConfig {
  profile: string | null;
  style: WikiTableStyle;
  extraTags?: string[];
}

export interface NewProfilePageConfig {
  file: string;
  title: string;
  profile: string;
  style: WikiTableStyle;
  blurb: string;
}

export type TagMetaMap = Record<string, string>;

export interface DiscoveredProfile {
  profileCs: string;
  header: string | null;
  htmlFile: string;
  title: string;
  blurb: string;
  tagCount: number;
  author: string;
}

export interface DiscoveredProfilesFile {
  version: 1;
  profiles: DiscoveredProfile[];
}

export interface WebWikiPublishOptions {
  mesSourcePath: string;
  docsDir: string;
  mkdocsPath?: string;
  tagDescriptionsPath?: string;
  sourceLabel: string;
  write: boolean;
  fixMkdocsWarnings?: boolean;
  /** One-time: clear mes-wiki-updates.json and homepage highlight history. */
  resetWhatsNew?: boolean;
}

import type { ExternalLinkAuditEntry } from './externalPageLocalization';

export type WikiSyncChangeKind =
  | 'page-created'
  | 'tag-update'
  | 'profile-update'
  | 'migration'
  | 'navigation'
  | 'external'
  | 'maintenance'
  | 'skipped'
  | 'error';

export interface WikiSyncNavEntry {
  title: string;
  mdFile: string;
  navGroup: string;
  profileCs?: string;
}

export interface WikiSyncChangeRecord {
  kind: WikiSyncChangeKind;
  file: string;
  profileCs?: string;
  profileTitle?: string;
  tagsAdded?: string[];
  tagsRemoved?: string[];
  tagsRefreshed?: string[];
  sectionsUpdated?: string[];
  navEntries?: WikiSyncNavEntry[];
  detail?: string;
}

export interface WebWikiPublishResult {
  updated: string[];
  created: string[];
  skipped: string[];
  navUpdated: boolean;
  errors: string[];
  sourceLabel: string;
  externalLinkAudit?: ExternalLinkAuditEntry[];
  changeLog: WikiSyncChangeRecord[];
}
