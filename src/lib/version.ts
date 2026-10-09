/**
 * Version, source commit and the sha256 of the file that is running (spec §5.1, collector.txt).
 * `__VERSION__` and `__COMMIT__` are baked in by scripts/bundle.mjs; under vitest and tsc they are
 * undefined and the fallbacks apply.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

declare const __VERSION__: string | undefined;
declare const __COMMIT__: string | undefined;

export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
export const COMMIT: string = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'unknown';
export const SOURCE = 'github.com/Terum-Inc/terum-skills-report';

/** sha256 of the running entry file, or `unavailable` when it cannot be read (never fatal). */
export async function selfSha256(entry: string | URL = import.meta.url): Promise<string> {
  try {
    const path = typeof entry === 'string' && entry.startsWith('file:') ? fileURLToPath(entry) : entry instanceof URL ? fileURLToPath(entry) : entry;
    return createHash('sha256').update(await readFile(path)).digest('hex');
  } catch {
    return 'unavailable';
  }
}
