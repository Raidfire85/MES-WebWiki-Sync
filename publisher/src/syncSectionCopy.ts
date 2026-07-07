export type SyncSectionMode = 'supplement' | 'profile-page';

export interface SyncSectionContext {
  pageTitle: string;
  mdFile?: string;
  mode: SyncSectionMode;
}

interface SyncSectionCopy {
  heading?: string;
  intro: string;
}

const PAGE_SUPPLEMENT_COPY: Record<string, SyncSectionCopy> = {
  'Block-Replacement.md': {
    intro: 'Below are the tags you can use to swap blocks on spawned grids during manipulation.',
  },
  'Action.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add behaviors and effects that an Action profile can run when its linked Trigger conditions are satisfied.',
  },
  'Trigger.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add extra trigger types, timing options, and checks that can start or stop profile logic on an NPC grid.',
  },
  'Condition.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add extra requirements a Condition profile can evaluate before an Action is allowed to run.',
  },
  'Target.md': {
    heading: 'Additional Tags',
    intro:
      'These tags extend how a Target profile chooses, filters, and tracks entities for RivalAI behaviors.',
  },
  'Autopilot.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add movement, pathing, and flight-control options for Autopilot profiles.',
  },
  'Command.md': {
    heading: 'Additional Tags',
    intro:
      'These tags extend the orders and control options a Command profile can issue to NPC grids.',
  },
  'Chat.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add broadcast, message, and player-notification options for Chat profiles.',
  },
  'Spawn.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add spawning rules and reinforcement options that a Spawn profile can trigger during encounters.',
  },
  'Weapons.md': {
    heading: 'Additional Tags',
    intro:
      'These tags extend weapon control, targeting, and combat-system options for Weapons profiles.',
  },
  'Spawn-Conditions.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add spawn filters, limits, and placement rules for Spawn Condition profiles.',
  },
  'Core-Behavior.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add behavior modes, movement settings, and encounter rules for Core Behavior profiles.',
  },
  'Event.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add scheduling, activation, and control options for Event profiles.',
  },
  'Event-Action.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add actions and world effects that an Event Action profile can run when an event fires.',
  },
  'Event-Conditions.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add checks and prerequisites an Event Condition profile can use before an event runs.',
  },
  'Bot-Spawn.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add bot spawning, loadout, and deployment options for Bot Spawn profiles.',
  },
  'Prefab-Data.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add prefab targeting, scoring, and modification rules for Prefab Data profiles.',
  },
  'Player-Condition-Profile.md': {
    heading: 'Additional Tags',
    intro:
      'These tags add player-state checks and requirements for Player Condition profiles.',
  },
};

export function resolveSyncSectionCopy(context: SyncSectionContext): SyncSectionCopy {
  if (context.mdFile && PAGE_SUPPLEMENT_COPY[context.mdFile]) {
    return PAGE_SUPPLEMENT_COPY[context.mdFile];
  }

  if (context.mode === 'profile-page') {
    return {
      intro: `Below are the tags you can use in your ${context.pageTitle} profiles.`,
    };
  }

  return {
    heading: 'Additional Tags',
    intro: `These tags extend the options documented above for ${context.pageTitle} profiles.`,
  };
}

export function pageTitleFromMdFile(mdFile: string): string {
  let stem = mdFile.replace(/\.md$/i, '');
  if (stem.endsWith('-Profile')) {
    stem = stem.slice(0, -'-Profile'.length);
  }

  const known: Record<string, string> = {
    'Spawn-Conditions': 'Spawn Condition',
    'Event-Conditions': 'Event Condition',
    'Event-Action': 'Event Action',
    'Player-Condition-Profile': 'Player Condition',
    'Prefab-Data': 'Prefab Data',
    'Bot-Spawn': 'Bot Spawn',
    'Core-Behavior': 'Core Behavior',
  };

  if (known[stem]) {
    return known[stem];
  }

  return stem
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
