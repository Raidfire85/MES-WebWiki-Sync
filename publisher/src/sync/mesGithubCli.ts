import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  GITHUB_RAW_BASE,
  GITHUB_TREE_API,
  MES_SCRIPTS_GITHUB_PATH,
} from './constants';
import { isValidMesSourceFolder, MES_SOURCE_FOLDER_NAME } from './mesSourceDiscovery';

const DOWNLOAD_CONCURRENCY = 12;

export interface AcquiredMesSource {
  sourcePath: string;
  cleanup: () => Promise<void>;
  label: string;
}

export interface ProgressReporter {
  report: (update: { message?: string }) => void;
}

interface GitHubTreeResponse {
  tree: Array<{
    path: string;
    type: 'blob' | 'tree';
  }>;
  truncated?: boolean;
}

export async function acquireMesSourceFromGithub(
  progress?: ProgressReporter
): Promise<AcquiredMesSource> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mes-webwiki-sync-'));
  const sourcePath = path.join(tempRoot, MES_SOURCE_FOLDER_NAME);

  const cleanup = async (): Promise<void> => {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  };

  const controller = new AbortController();

  try {
    progress?.report({ message: 'Fetching file list from GitHub...' });
    const filePaths = await listGithubScriptFiles(controller.signal);

    if (filePaths.length === 0) {
      throw new Error(`No files found under ${MES_SCRIPTS_GITHUB_PATH} on GitHub.`);
    }

    progress?.report({
      message: `Downloading ${filePaths.length} files from ${MES_SCRIPTS_GITHUB_PATH}...`,
    });

    await fs.mkdir(sourcePath, { recursive: true });
    await downloadGithubFiles(filePaths, sourcePath, controller.signal, (done, total) => {
      if (done % 25 === 0 || done === total) {
        progress?.report({ message: `Downloading MES scripts (${done}/${total})...` });
      }
    });

    if (!(await isValidMesSourceFolder(sourcePath))) {
      throw new Error(`MES source folder not found or invalid: ${sourcePath}`);
    }

    const csCount = filePaths.filter((p) => p.endsWith('.cs')).length;
    if (csCount === 0) {
      throw new Error('Downloaded MES source contains no .cs files.');
    }

    progress?.report({ message: `MES source ready (${csCount} .cs files)` });

    return {
      sourcePath,
      label: 'GitHub master',
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function listGithubScriptFiles(signal: AbortSignal): Promise<string[]> {
  const response = await fetch(GITHUB_TREE_API, {
    signal,
    headers: githubHeaders(),
  });

  if (!response.ok) {
    throw new Error(`GitHub file list failed (${response.status} ${response.statusText}).`);
  }

  const payload = (await response.json()) as GitHubTreeResponse;
  if (payload.truncated) {
    throw new Error('GitHub file list was truncated; cannot sync safely.');
  }

  const prefix = `${MES_SCRIPTS_GITHUB_PATH}/`;
  return payload.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .sort();
}

async function downloadGithubFiles(
  relativePaths: string[],
  sourcePath: string,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  const total = relativePaths.length;
  let index = 0;

  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, async () => {
    while (index < total) {
      if (signal.aborted) {
        throw new Error('Sync cancelled.');
      }

      const current = index++;
      const relativePath = relativePaths[current];
      const url = `${GITHUB_RAW_BASE}/${MES_SCRIPTS_GITHUB_PATH}/${relativePath}`;
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error(`Failed to download ${relativePath} (${response.status}).`);
      }

      const content = Buffer.from(await response.arrayBuffer());
      const outPath = path.join(sourcePath, relativePath);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, content);

      done++;
      onProgress?.(done, total);
    }
  });

  await Promise.all(workers);
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mes-webwiki-sync',
  };
}
