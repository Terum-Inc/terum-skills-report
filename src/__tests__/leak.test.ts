/**
 * The leak test (handoff step 2; docs/spec.md §5.5, §2.6). Runs the whole collector against a
 * planted home folder and asserts that nothing planted appears in any output file, that the
 * `.partial` staging folder is gone, and that the manifest's counts match the fixture. Every later
 * change keeps this green.
 */
import { realpath } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run, type RunResult } from '../run.js';
import { buildFixture, commitProjectA, PLANTED, type Fixture } from './fixture.js';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out.sort();
}

describe('leak test on a planted home folder', () => {
  let fixture: Fixture;
  let result: RunResult;
  let outDir: string;
  let contents: Map<string, string>;

  let hasGit = false;

  beforeAll(async () => {
    fixture = await buildFixture();
    hasGit = commitProjectA(fixture);
    outDir = join(fixture.home, 'Desktop', 'report');
    result = await run({
      home: fixture.home,
      hostname: PLANTED.hostname,
      platform: { platform: process.platform, release: '10.0.0', nodeVersion: process.version, env: { SHELL: '/bin/zsh' } },
      argv: ['--out', outDir],
      options: { out: outDir, json: false, usage: true, includeHooks: false, includeClaudeMd: false, hashLabels: false, help: false, version: false },
      now: new Date('2026-09-24T12:00:00Z'),
      version: '1.0.0-test',
      commit: 'abcdef0',
      sha256: 'deadbeef',
    });
    contents = new Map();
    for (const file of await walk(outDir)) {
      const bytes = await readFile(file);
      // A UTF-16 file is read as its text, so a secret in it would be found by the checks below.
      const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
      contents.set(relative(outDir, file).replaceAll('\\', '/'), text);
    }
  });

  afterAll(async () => {
    await rm(fixture.tmp, { recursive: true, force: true });
  });

  it('writes the final folder and removes the staging folder', async () => {
    expect((await stat(outDir)).isDirectory()).toBe(true);
    await expect(stat(`${outDir}.partial`)).rejects.toThrow();
  });

  it('leaves nothing planted in any output file', async () => {
    const realHome = await promisify(realpath.native)(fixture.home).catch(() => fixture.home);
    const never: [string, string][] = [
      ['username', PLANTED.username],
      ['hostname', PLANTED.hostname],
      ['home path', fixture.home],
      ['home path, forward slashes', fixture.home.replaceAll('\\', '/')],
      ['home path, resolved spelling', realHome],
      ['home path, resolved spelling, forward slashes', realHome.replaceAll('\\', '/')],
      ['Anthropic key', PLANTED.anthropicKey],
      ['OpenAI key', PLANTED.openaiKey],
      ['GitHub token', PLANTED.githubToken],
      ['AWS key', PLANTED.awsKey],
      ['Slack token', PLANTED.slackToken],
      ['JWT', PLANTED.jwt],
      ['private key body', PLANTED.privateKeyBody],
      ['named token literal', PLANTED.namedToken],
      ['named password literal', PLANTED.namedPassword],
      ['.env content', PLANTED.dotenv],
      ['prompt', 'PLANTED_PROMPT_TEXT'],
      ['tool output', 'PLANTED_TOOL_OUTPUT'],
      ['subagent prompt', 'PLANTED_SUBAGENT_TEXT'],
      ['skill body in transcript', PLANTED.skillBodyInTranscript],
      ['hook command', 'PLANTED_HOOK_PATH'],
      ['hook secret', PLANTED.hookSecret],
      ['machine id', PLANTED.machineId],
      ['user id', PLANTED.userId],
      ['email', PLANTED.email],
      ['CLAUDE.md content', 'PLANTED_CLAUDE_MD'],
      ['application source a skill mentions', PLANTED.appSource],
      ['password inside a connection string', PLANTED.urlPassword],
      ['.env inside a skill folder', 'DOTENV_IN_SKILL'],
      ['ssh key inside a skill folder', PLANTED.rsaBody],
      ['log file inside a skill folder', 'PLANTED_LOG_LINE'],
      ['compiled Python inside a skill folder', PLANTED.pycMarker],
      ['temp folder name (a folder above home listed as a project)', fixture.tmp.split(/[\\/]/).pop()!],
      ['MCP command', PLANTED.mcpCommand],
      ['raw session id', PLANTED.sessionId],
      ['raw session id (no firings)', PLANTED.sessionId4],
      ['agent id', PLANTED.agentId],
      ['headless skill name', PLANTED.sdkSkill],
    ];
    const leaks: string[] = [];
    for (const [path, text] of contents) {
      for (const [what, needle] of never) if (text.includes(needle)) leaks.push(`${what} in ${path}`);
    }
    expect(leaks).toEqual([]);
    expect(contents.size).toBeGreaterThan(0);
  });

  it('links the screen to the real folder and keeps that link out of every output file', async () => {
    const url = result.report.outputFolderUrl;
    expect(url.startsWith('file:///')).toBe(true);
    expect(resolve(fileURLToPath(url))).toBe(await promisify(realpath.native)(outDir));
    for (const [, text] of contents) expect(text).not.toContain(url);
  });

  it('lists every written file in manifest.json with a matching sha256', async () => {
    const manifest = JSON.parse(contents.get('manifest.json')!) as { files: { path: string; sha256: string }[] };
    const listed = new Set(manifest.files.map((f) => f.path));
    // manifest.json and MANIFEST.md are written after the list is taken; every other file is in it.
    for (const path of contents.keys()) if (path !== 'manifest.json' && path !== 'MANIFEST.md') expect(listed.has(path), `${path} is in the output but not in manifest.json`).toBe(true);
    for (const file of manifest.files) expect(contents.has(file.path), `${file.path} is in manifest.json but not in the output`).toBe(true);
    const { createHash } = await import('node:crypto');
    for (const file of manifest.files) {
      const actual = createHash('sha256').update(await readFile(join(outDir, file.path))).digest('hex');
      expect(actual, `sha256 of ${file.path}`).toBe(file.sha256);
    }
  });

  it('carries the usage sentence word for word and the exact CSV columns', () => {
    const sentence = 'From sessions we gathered how often each skill was invoked. No raw session logs are sent out. All session logs were read locally, just for skill usage.';
    // The sentence is a claim about the CSV rows, so it appears only when transcripts were read.
    if (result.report.usage.status === 'read') expect(contents.get('MANIFEST.md')).toContain(sentence);
    else expect(contents.get('MANIFEST.md')).toMatch(/not read|No session data/);
    expect(contents.get('usage/summary.csv')!.split('\n')[0]).toBe('skill,source,fires,fires_by_model,fires_by_human,sessions,first_day,last_day,avg_tokens_per_fire,skill_text_tokens');
    expect(contents.get('usage/firings.csv')!.split('\n')[0]).toBe('firing_id,session_id,day,skill,source,invoked_by,model,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,turns_after,tool_errors_after,interrupted_after,refired_in_session');
    expect(contents.get('usage/sessions.csv')!.split('\n')[0]).toBe('session_id,day,turns,human_messages,interruptions,skill_fires,distinct_skills,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,minutes,subagent_sessions');
  });

  it('writes collector.txt with the version, sha256, commit and the command as typed, home path scrubbed', () => {
    const collector = contents.get('collector.txt')!;
    expect(collector).toContain('terum-skills-report 1.0.0-test');
    expect(collector).toContain('sha256 deadbeef');
    expect(collector).toContain('@ abcdef0');
    expect(collector).toMatch(/command terum-skills-report --out ~[\\/]Desktop[\\/]report\n/);
  });

  it('records the environment as names only', () => {
    const env = result.report.environment;
    expect(env.mcpServers).toEqual(['home-mcp']);
    expect(env.mcpServersByProject).toEqual({ projA: ['planted-project-mcp'] });
    expect(env.hookEvents).toEqual(['SessionStart', 'Stop']);
    expect(env.hookCommands).toBeUndefined();
    expect(env.shell).toBe('zsh');
    expect(env.plugins.map((p) => p.id)).toEqual(['gamma@market', 'missing@market']);
  });

  it('labels projects by folder name and skips a project folder that no longer exists', () => {
    expect(result.report.problems.map((p) => p.where)).not.toContain(expect.stringContaining('deleted-project'));
  });

  it('finds every skill folder at home, in projects and in plugins, and counts identical content once', () => {
    const skills = result.report.skills.map((s) => `${s.source}/${s.name}`).sort();
    expect(skills).toEqual(['home/alpha', 'home/beta', 'plugin-market-gamma@abc123def456/gamma-skill', 'project-projA/delta', 'project-projB/beta']);
    expect(new Set(result.report.skills.map((s) => s.contentHash)).size).toBe(4);
    expect(result.report.skills.find((s) => s.name === 'alpha')!.readFrom).toBe('~/.claude/skills/alpha');
    expect(result.report.skills.find((s) => s.name === 'delta')!.readFrom).toBe('~/dev/projA/.claude/skills/delta');
    expect(result.report.skills.find((s) => s.source === 'project-projB')!.readFrom).toBe('projB/.claude/skills/beta');
    expect(contents.has('skills/home/alpha/SKILL.md')).toBe(true);
    expect(contents.has('skills/home/alpha/scripts/run.sh')).toBe(true);
    expect([...contents.keys()].filter((p) => p.includes('not-a-skill'))).toEqual([]);
  });

  it('copies commands and agents at home and project level, and nothing else from those folders', () => {
    const extras = result.report.extras.map((e) => `${e.kind}:${e.outputPath}`).sort();
    expect(extras.filter((e) => e.startsWith('command') || e.startsWith('agent'))).toEqual(['agent:agents/home/reviewer.md', 'agent:agents/project-projB/planner.md', 'command:commands/home/deploy.md', 'command:commands/project-projA/pr.md']);
    expect([...contents.keys()].filter((p) => p.startsWith('claude-md/'))).toEqual([]);
  });

  it('redacts only the value, keeps variable reads, and lists every redaction in FLAGGED.md', () => {
    const script = contents.get('skills/home/alpha/scripts/run.sh')!;
    expect(script).toContain('ANTHROPIC_API_KEY=[REDACTED:anthropic-key]\n');
    expect(script).toContain('echo "$ANTHROPIC_API_KEY"');
    expect(script).toContain('AUTH_MODE=$MODE');
    expect(script).toContain('author=someone');
    expect(script).toContain('password: [REDACTED:named-secret]');
    expect(script).toContain('DATABASE_URL=postgres://app:[REDACTED:url-credentials]@db.internal:5432/app');
    expect(script.split('\n').length).toBe(12);
    const rules = result.report.redactions.filter((r) => r.outputPath === 'skills/home/alpha/scripts/run.sh').map((r) => `${r.line}:${r.rule}:${r.name}`);
    expect(rules).toEqual(['2:anthropic-key:ANTHROPIC_API_KEY', '5:jwt:Authorization', '6:aws-access-key:AWS_ACCESS_KEY_ID', '7:slack-token:SLACK_TOKEN', '8:named-secret:password', '11:url-credentials:DATABASE_URL']);
    const flagged = contents.get('FLAGGED.md')!;
    expect(flagged).toContain('| `skills/home/alpha/scripts/run.sh` | 2 | anthropic-key | ANTHROPIC_API_KEY | sk-ant-… (');
    expect(flagged).toContain('| `skills/home/alpha/scripts/run.sh` | 8 | named-secret | password | 18 chars |');
    expect(flagged).not.toContain('PLANTED');
    expect(flagged).not.toMatch(/Pl… |hu… /);
    expect(contents.get('skills/home/alpha/AUTHORS.md')).toBe('Maintained by Planted Person <[REDACTED:email]>.\n');
    // The UTF-16 PowerShell script was decoded, scanned and written back as UTF-16 with its mark.
    const ps1 = contents.get('skills/home/alpha/helper.ps1')!;
    expect(ps1).toBe('$env:ANTHROPIC_API_KEY = "[REDACTED:anthropic-key]"\r\nWrite-Host "ok"\r\n');
    expect(result.report.unscanned).toEqual([]);
    // Never-collected names inside the skill folder are skipped and listed, not copied.
    const alpha = result.report.skills.find((s) => s.name === 'alpha')!;
    expect(alpha.skipped.map((p) => `${p.where.split('/').pop()}: ${p.reason}`).sort()).toEqual([
      '.env: .env files are never collected',
      '__pycache__: folder not copied',
      'debug.log: log files are never collected',
      'id_rsa: credential and key files are never collected',
    ]);
    for (const name of ['.env', 'id_rsa', 'debug.log', '__pycache__/helper.cpython-312.pyc']) expect(contents.has(`skills/home/alpha/${name}`), name).toBe(false);
  });

  it('copies the scripts skills reference, refuses .env and paths that climb out, and records every miss', () => {
    const linked = result.report.extras.filter((e) => e.kind === 'linked').map((e) => `${e.outputPath} <- ${(e.referencedBy ?? []).join(',')}`).sort();
    expect(linked).toEqual([
      'linked/home/workflows/helper.js <- alpha (home)',
      'linked/plugin-market-gamma@abc123def456/scripts/g.py <- gamma-skill (plugin-market-gamma@abc123def456)',
      'linked/projA/.claude/workflows/wf.js <- delta (project-projA)',
      'linked/projA/scripts/deploy.sh <- delta (project-projA)',
    ]);
    const misses = result.report.linkedMisses.map((m) => `${m.skill}: ${m.reference} -> ${m.reason}`).sort();
    expect(misses).toEqual([
      'alpha: ../.env -> .env files are never collected',
      'alpha: .claude/settings.json -> settings and MCP configuration are never collected',
      'alpha: ~/.claude/projects/x.jsonl -> session transcripts are never collected',
      'delta: /etc/secrets.yaml -> absolute path outside the project and ~/.claude; not opened',
      'delta: C:\\absolute\\nowhere.ps1 -> absolute path outside the project and ~/.claude; not opened',
      'delta: lib/phase1.ts -> found, not copied: application source outside .claude, scripts, workflows, hooks, bin or tools',
      'delta: scripts/missing.sh -> not found in the skill folder, its project or ~/.claude',
      'gamma-skill: ${CLAUDE_PLUGIN_ROOT}/scripts/absent.py -> not found under the plugin folder',
    ]);
    const g = contents.get('linked/plugin-market-gamma@abc123def456/scripts/g.py')!;
    expect(g.split('\n').length).toBe(9);
    expect(g).toContain('KEY = os.environ["OPENAI_API_KEY"]');
    expect(g).toContain('OPENAI_API_KEY = "[REDACTED:openai-key]"');
    expect(g).toContain('-----BEGIN RSA PRIVATE KEY-----\n[REDACTED:private-key]\n[REDACTED:private-key]\n-----END RSA PRIVATE KEY-----');
    const wf = contents.get('linked/projA/.claude/workflows/wf.js')!;
    expect(wf).toContain('const token = "[REDACTED:named-secret]";');
    expect(wf).toContain('const apiKey = process.env.API_KEY;');
    expect(contents.get('MANIFEST.md')).toContain('Referenced, not found:');
  });

  it('derives usage rows: firings own their exchange plus subagent work, sessions carry totals, headless and broken files are counted', () => {
    const u = result.report.usage;
    expect(u).toMatchObject({ status: 'read', projectFolders: 1, sessions: 2, headlessSessionsSkipped: 1, subagentTranscripts: 1, linesSkipped: 3, firings: 4, sessionsWithFirings: 2, firstDay: '2026-09-20', lastDay: '2026-09-20' });
    expect(u.filesSkipped).toHaveLength(1);
    expect(u.filesSkipped[0]!.where).toMatch(/^~\/\.claude\/projects\/<folder 1>\/[0-9a-f]{16}\.jsonl$/);
    expect(u.filesSkipped[0]!.reason).toBe('could not parse');
    expect(result.report.environment.claudeCodeVersion).toBe('2.1.280');

    const rows = (name: string): string[][] => contents.get(`usage/${name}.csv`)!.trim().split('\n').slice(1).map((l) => l.split(','));
    const firings = rows('firings');
    expect(firings).toHaveLength(4);
    // Both sessions fall on one day, so their order follows the per-run hash; look rows up by skill.
    const gamma = firings.find((f) => f[3] === 'gamma:gamma-skill')!;
    const main = firings.filter((f) => f[1] !== gamma[1]);
    const [alpha1, beta, alpha2] = main as [string[], string[], string[]];
    // firing_id, session_id, day, skill, source, invoked_by, model, input, cache_read, cache_write, output, turns_after, tool_errors_after, interrupted_after, refired
    expect(alpha1.slice(2)).toEqual(['2026-09-20', 'alpha', 'home', 'model', 'claude-fable-5-1', '23', '10500', '1050', '148', '4', '1', '0', 'true']);
    expect(beta.slice(2)).toEqual(['2026-09-20', 'beta', 'home|project-projB', 'human', 'claude-opus-5-5', '4', '5000', '500', '60', '1', '0', '1', 'false']);
    expect(alpha2.slice(2)).toEqual(['2026-09-20', 'alpha', 'home', 'model', 'claude-fable-5-1', '11', '13000', '1300', '150', '1', '0', '0', 'false']);
    expect(gamma.slice(2)).toEqual(['2026-09-20', 'gamma:gamma-skill', 'plugin-market-gamma@abc123def456', 'model', 'claude-fable-5-1', '1', '1', '1', '1', '0', '0', '0', 'false']);
    expect(alpha1[1]).toMatch(/^[0-9a-f]{16}$/);
    expect(alpha1[0]).toBe(`${alpha1[1]}-1`);
    expect(alpha2[0]).toBe(`${alpha1[1]}-3`);

    const sessions = rows('sessions');
    expect(sessions).toHaveLength(2);
    const withFirings = sessions.find((s) => s[0] === alpha1[1])!;
    // session_id, day, turns, human_messages, interruptions, skill_fires, distinct_skills, input, cache_read, cache_write, output, minutes, subagent_sessions
    expect(withFirings.slice(1)).toEqual(['2026-09-20', '8', '4', '1', '3', '2', '38', '28500', '2850', '358', '4', '1']);
    const quiet = sessions.find((s) => s[0] === gamma[1])!;
    expect(quiet.slice(1)).toEqual(['2026-09-20', '1', '1', '0', '1', '1', '1', '1', '1', '1', '0', '0']);

    const chars = (name: string): string => String(Math.ceil(result.report.skills.find((s) => s.name === name)!.skillTextChars / 4));
    const summary = rows('summary');
    expect(summary).toEqual([
      ['alpha', 'home', '2', '2', '0', '1', '2026-09-20', '2026-09-20', '13091', chars('alpha')],
      ['beta', 'home|project-projB', '1', '0', '1', '1', '2026-09-20', '2026-09-20', '5564', chars('beta')],
      ['gamma:gamma-skill', 'plugin-market-gamma@abc123def456', '1', '1', '0', '1', '2026-09-20', '2026-09-20', '4', chars('gamma-skill')],
    ]);
  });

  it('records git dates and an author count per committed skill file, and nothing for files outside a repository', () => {
    if (!hasGit) return;
    expect(result.report.git).toEqual([{ outputPath: 'skills/project-projA/delta/SKILL.md', firstCommit: '2026-08-01', lastCommit: '2026-09-01', authors: 2 }]);
    expect(result.report.gitProblems).toEqual([]);
    expect(contents.get('MANIFEST.md')).toContain('For 1 copied file inside a git repository');
  });

  it('reports what it read on the screen, with a count per location', () => {
    const locations = Object.fromEntries(result.report.locations.map((l) => [l.location, l.detail]));
    expect(locations['~/.claude/skills']).toBe('2 skills');
    expect(locations['~/dev/projA/.claude/skills']).toBe('1 skill');
    expect(locations['projB/.claude/skills']).toBe('1 skill   (1 identical to ~/.claude/skills copies)');
    expect(locations['~/.claude/plugins']).toBe('1 skill from 1 plugin');
    expect(locations['~/.claude/commands, .claude/agents']).toBe('2 commands, 2 agents');
    // The home folder listed as a project in ~/.claude.json is not a second source or a label.
    expect(result.report.locations.filter((l) => l.location === '~/.claude/skills')).toHaveLength(1);
    expect(result.report.skills.map((s) => s.source)).not.toContain(`project-${PLANTED.username}`);
    expect(result.report.environment.plugins.find((p) => p.id === 'gamma@market')!.skills).toBe(1);
    expect(result.report.problems).toContainEqual({ where: '~/.claude/plugins/cache/market/missing/1.0.0', reason: 'plugin folder listed in installed_plugins.json is not on disk' });
  });
});
