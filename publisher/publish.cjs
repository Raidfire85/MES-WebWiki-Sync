const path = require('path');
const fs = require('fs');
const { acquireMesSourceFromGithub } = require('./out/sync/mesGithubCli');
const { isValidMesSourceFolder } = require('./out/sync/mesSourceDiscovery');
const { publishMesWebWiki } = require('./out/publisher');

const publisherRoot = path.resolve(__dirname);
const repoRoot = path.resolve(publisherRoot, '..');

function readArg(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printUsage() {
  console.log(`Sync MES official WebWiki Markdown from C# source.

Usage:
  node publisher/publish.cjs --docs <path/to/WebWiki/docs> [options]

Options:
  --docs <path>         Target WebWiki/docs folder (required)
  --mkdocs <path>       Path to WebWiki/mkdocs.yml (optional nav updates)
  --mes-source <path>   Local ModularEncountersSystems folder
  --tag-descriptions <path>
                        TagDescriptions.json (optional; defaults to publisher/TagDescriptions.json)
  --write               Apply file changes (default: dry-run report only)
  --reset-whats-new     Clear homepage What's new history (keeps sync registry)
  --no-fix-mkdocs-warnings
                        Skip mkdocs.yml nav .md fixes and validation relax block
  --help                Show this help
`);
}

function defaultTagDescriptionsPath() {
  const bundled = path.join(publisherRoot, 'TagDescriptions.json');
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  return undefined;
}

function formatMesSourceLabel(localPath) {
  const normalized = path.resolve(localPath).replace(/\\/g, '/');
  if (/local-test/i.test(normalized)) {
    return 'Local test sandbox';
  }
  if (
    /Data\/Scripts\/ModularEncountersSystems/i.test(normalized) ||
    /\/ModularEncountersSystems\/?$/i.test(normalized)
  ) {
    return 'MES master branch';
  }
  return 'Local MES source';
}

async function resolveMesSource() {
  const localPath = readArg('mes-source') ?? process.env.MES_SOURCE_PATH;
  if (localPath) {
    if (!(await isValidMesSourceFolder(localPath))) {
      throw new Error(`Invalid MES source path (missing ProfileManager.cs): ${localPath}`);
    }
    return {
      sourcePath: localPath,
      label: formatMesSourceLabel(localPath),
      cleanup: async () => {},
    };
  }

  const acquired = await acquireMesSourceFromGithub({
    report: ({ message }) => {
      if (message) {
        console.log(`  ${message}`);
      }
    },
  });

  return {
    sourcePath: acquired.sourcePath,
    label: acquired.label,
    cleanup: acquired.cleanup,
  };
}

async function main() {
  if (hasFlag('help')) {
    printUsage();
    process.exit(0);
  }

  const docsDir = readArg('docs');
  if (!docsDir) {
    printUsage();
    throw new Error('Missing required --docs <WebWiki/docs path>');
  }

  const mkdocsPath = readArg('mkdocs');
  const tagDescriptionsPath = readArg('tag-descriptions') ?? defaultTagDescriptionsPath();
  const write = hasFlag('write');
  const fixMkdocsWarnings = !hasFlag('no-fix-mkdocs-warnings');
  const resetWhatsNew = hasFlag('reset-whats-new');

  console.log(`MES WebWiki sync (${write ? 'write' : 'dry-run'})`);
  console.log(`Docs: ${path.resolve(docsDir)}`);
  if (mkdocsPath) {
    console.log(`mkdocs.yml: ${path.resolve(mkdocsPath)}`);
  }
  if (tagDescriptionsPath) {
    console.log(`Tag descriptions: ${path.resolve(tagDescriptionsPath)}`);
  }

  const acquired = await resolveMesSource();
  try {
    const result = await publishMesWebWiki({
      mesSourcePath: acquired.sourcePath,
      docsDir: path.resolve(docsDir),
      mkdocsPath: mkdocsPath ? path.resolve(mkdocsPath) : undefined,
      tagDescriptionsPath: tagDescriptionsPath ? path.resolve(tagDescriptionsPath) : undefined,
      sourceLabel: acquired.label,
      write,
      fixMkdocsWarnings,
      resetWhatsNew,
    });

    console.log(`\nSource: ${result.sourceLabel}`);

    if (result.created.length > 0) {
      console.log('\nNew profile pages:');
      for (const line of result.created) {
        console.log(`  + ${line}`);
      }
    }

    if (result.updated.length > 0) {
      console.log('\nUpdated:');
      for (const line of result.updated) {
        console.log(`  ~ ${line}`);
      }
    }

    if (result.skipped.length > 0) {
      console.log('\nSkipped:');
      for (const line of result.skipped) {
        console.log(`  - ${line}`);
      }
    }

    if (result.navUpdated) {
      console.log('\nmkdocs.yml nav block would be updated for new profile pages.');
    }

    if (result.errors.length > 0) {
      console.error('\nErrors:');
      for (const line of result.errors) {
        console.error(`  ! ${line}`);
      }
      process.exit(1);
    }

    if (!write) {
      console.log('\nDry-run only. Re-run with --write to apply changes.');
    } else {
      console.log('\nWebWiki sync complete.');
      if (mkdocsPath) {
        console.log('Next: cd <WebWiki folder> && mkdocs build');
      }
    }
  } finally {
    await acquired.cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
