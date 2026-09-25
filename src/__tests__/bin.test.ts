/**
 * End to end through the published shape: bundle src/index.ts the way the release does, then run
 * dist/index.js as a child process with the home folder pointed at the fixture, and read its
 * `--json` summary and exit code. This is the only test that exercises the bin entry, the bundle
 * and `os.homedir()` together.
 */
import { execFile } from 'node:child_process';
import { readFile, realpath, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFixture, PLANTED, type Fixture } from './fixture.js';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..', '..');
const bin = join(root, 'dist', 'index.js');

describe('dist/index.js', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    await run(process.execPath, [join(root, 'scripts', 'bundle.mjs')], { cwd: root, timeout: 120_000 });
    fixture = await buildFixture();
  }, 180_000);

  afterAll(async () => { await rm(fixture.tmp, { recursive: true, force: true }); });

  const env = (): NodeJS.ProcessEnv => ({ ...process.env, HOME: fixture.home, USERPROFILE: fixture.home, SHELL: '/bin/bash' });

  it('prints the version with its own sha256', async () => {
    const { stdout } = await run(process.execPath, [bin, '--version'], { env: env(), timeout: 60_000 });
    expect(stdout).toMatch(/^terum-skills-report \d+\.\d+\.\d+\S* \(sha256 [0-9a-f]{64}, commit \S+\)\n$/);
  });

  it('runs against the fixture home, writes the folder, prints the summary as JSON and exits 0', async () => {
    const out = join(fixture.home, 'Desktop', 'via-bin');
    const { stdout, stderr } = await run(process.execPath, [bin, '--out', out, '--json'], { env: env(), timeout: 120_000 });
    expect(stderr).toBe('');
    const summary = JSON.parse(stdout) as Record<string, unknown>;
    expect(summary).toMatchObject({ skills: 5, skillsUniqueByContent: 4, commands: 2, agents: 2, linkedCopied: 4, linkedMissing: 10 });
    expect((summary['usage'] as { firings: number }).firings).toBe(4);
    expect(resolve(fileURLToPath(summary['outputFolderUrl'] as string))).toBe(await realpath(out));
    expect((await stat(join(out, 'MANIFEST.md'))).isFile()).toBe(true);
    const manifest = await readFile(join(out, 'MANIFEST.md'), 'utf8');
    expect(manifest).not.toContain(PLANTED.username);
  });

  it('prints the screen with the exact usage sentence, the folder and the closing promise', async () => {
    const out = join(fixture.home, 'Desktop', 'via-bin-screen');
    const { stdout } = await run(process.execPath, [bin, '--out', out], { env: env(), timeout: 120_000 });
    expect(stdout).toContain('Runs offline. Nothing is sent anywhere. You review the folder, then zip and send it yourself.');
    expect(stdout).toContain('From sessions we gathered how often each skill was invoked.');
    expect(stdout).toContain('No raw session logs are sent out. All session logs were read locally, just for skill usage.');
    expect(stdout).toMatch(/Skills found\s+5\s+\(4 unique by content\)/);
    expect(stdout).toContain('This tool has not sent anything and will not. Nothing was installed or changed on this machine.');
    // The closing line is a file:// link to the real folder: the one place the username may appear on the screen (spec §5.5 governs the bundle, not the screen).
    const link = /^Written to  (file:\/\/\/\S+)$/m.exec(stdout)?.[1];
    expect(link).toBeDefined();
    expect(resolve(fileURLToPath(link!))).toBe(await realpath(out));
    expect(stdout).toContain('Click the link to open the folder');
    expect(stdout.replace(link!, '<link>')).not.toContain(PLANTED.username);
  });

  it('refuses an unknown flag with exit code 2 and writes nothing', async () => {
    await expect(run(process.execPath, [bin, '--upload'], { env: env(), timeout: 60_000 })).rejects.toMatchObject({ code: 2 });
  });
});
