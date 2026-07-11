import {
  WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_END,
  WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_START,
} from './constants';

export const BLOCK_REPLACEMENT_PROFILES_MD = 'Block-Replacement-Profiles.md';

const INTRO_BODY = `MES ships with ready-made **Block Replacement profiles** — named swap rules (for example, light armor to heavy armor, or gatling turrets to missile turrets). You do **not** add these as SBC files in your mod. You **reference the profile name** wherever MES reads block-replacement settings.

The table at the bottom of this page lists every built-in profile name and what it does.

## Where to put profile names (so they take effect)

### 1. Server-wide — Global Block Replacer (most common)

This is the main server-side setting. It applies block replacement to **all NPC grids spawned through MES** (unless a SpawnGroup opts out).

**File:** \`MySaveWorldFolder\\Storage\\1521905890.sbm_ModularEncountersSpawner\\Config-Grids.xml\`

**Steps:**

1. Set \`UseGlobalBlockReplacer\` to \`true\`.
2. Add one or more profile names under \`GlobalBlockReplacerProfiles\`.

**Example:**

\`\`\`xml
<UseGlobalBlockReplacer>true</UseGlobalBlockReplacer>
<GlobalBlockReplacerProfiles>
  <string>MES-Armor-LightToHeavy</string>
  <string>MES-ProprietaryValuableBlocks</string>
</GlobalBlockReplacerProfiles>
\`\`\`

You can also change these in-game with chat commands — see [Admin Config → Grid](AdminConfig_Grid.md) (\`UseGlobalBlockReplacer\`, \`GlobalBlockReplacerProfiles\`).

**Note:** \`GlobalBlockReplacerReference\` is a separate option for one-off \`OldBlock|NewBlock\` pairs (block subtype IDs), not named profiles. Use \`GlobalBlockReplacerProfiles\` when you want the presets listed below.

---

### 2. Per SpawnGroup — only certain spawns

Use this when only **specific spawn groups** should run block replacement, instead of the whole server.

**File:** Your SpawnGroup \`.sbc\` — tags go in the SpawnGroup **Description** block (Manipulation tags).

**Example:**

\`\`\`
[UseBlockReplacerProfile:true]
[BlockReplacerProfileNames:MES-Armor-LightToHeavy,MES-Turret-GatlingToMissile]
\`\`\`

See [Manipulation → Block-Replacement](Manipulation.md#Block-Replacement) for related tags (\`IgnoreGlobalBlockReplacer\`, \`RelaxReplacedBlocksSize\`, etc.).

If the global server setting is enabled, a SpawnGroup can skip it with:

\`\`\`
[IgnoreGlobalBlockReplacer:true]
\`\`\`

---

### 3. Shipyard terminal — player-paid block swap

For NPC shipyards that let players pay to replace blocks using preset rules:

**File:** Your Shipyard profile EntityComponent SBC (see [Shipyard Profile](Shipyard-Profile.md)).

**Example:**

\`\`\`
[AllowCustomReplacement:true]
[BlockReplacementProfileIds:MES-ProprietaryValuableBlocks]
\`\`\`

---

## Built-in vs custom profiles

| What you want | What to do |
|:----|:----|
| Use an MES preset from the table below | Reference its **Name** in one of the places above — no extra SBC required. |
| Define your own swap rules | Create a Block Replacement profile SBC with \`[MES Block Replacement]\` and tags like \`OldBlock\` / \`NewBlock\` / \`Limit\`. See [Block Replacement](Block-Replacement.md). Then reference your profile's **SubtypeId** the same way as the built-in names. |
| Swap one block pair on a single SpawnGroup | Use \`[UseBlockReplacer:true]\` with \`[ReplaceBlockOld:…]\` and \`[ReplaceBlockNew:…]\` on that SpawnGroup instead of a named profile. See [Manipulation](Manipulation.md#Block-Replacement). |`;

export function buildBlockReplacementProfilesIntroBlock(): string {
  return `${WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_START}
${INTRO_BODY}
${WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_END}`;
}

function extractCatalogTables(markdown: string): string {
  const match = markdown.match(/\|Name:\|[\s\S]*/);
  return match ? match[0].trimEnd() : markdown.trimEnd();
}

function extractIntroBlock(markdown: string): string | null {
  const match = markdown.match(
    new RegExp(
      `${WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_START}[\\s\\S]*?${WEBWIKI_BLOCK_REPLACEMENT_PROFILES_INTRO_END}`
    )
  );
  return match?.[0] ?? null;
}

export function mergeBlockReplacementProfilesPage(existing: string | null, gistPage: string): string {
  const intro = (existing && extractIntroBlock(existing)) || buildBlockReplacementProfilesIntroBlock();
  const catalog = extractCatalogTables(gistPage);
  return `# Block Replacement Profiles

${intro}

---

## Available profiles

${catalog}
`;
}
