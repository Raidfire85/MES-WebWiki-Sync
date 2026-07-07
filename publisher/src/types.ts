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
}

export interface WebWikiPublishResult {
  updated: string[];
  created: string[];
  skipped: string[];
  navUpdated: boolean;
  errors: string[];
  sourceLabel: string;
}
