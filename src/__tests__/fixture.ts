/**
 * A planted home folder for the leak test (handoff step 2). Every string in `PLANTED` is something
 * that must never appear in the output: a username in every path, an Anthropic key in a script, a
 * private-key block, a `.env` file, prompts and tool output in transcripts, a hook command with a
 * full path, a subagent prompt, a machine id, an email. The transcript mirrors the record shapes
 * verified against real Claude Code transcripts on 2026-09-24 (docs/spec.md §2.3, §13).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PLANTED = {
  username: 'plantedusername',
  hostname: 'planted-host-9000',
  anthropicKey: 'sk-ant-api03-PLANTEDKEYVALUE0123456789abcdefghijklmnopqrstuvwxyz',
  openaiKey: 'sk-PLANTEDOPENAI0123456789abcdefghijklmn',
  githubToken: 'ghp_PLANTEDGITHUB0123456789abcdefghijklmnopqr',
  awsKey: 'AKIAPLANTED012345678',
  slackToken: 'xoxb-PLANTED-0123456789-abcdefghij',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJQTEFOVEVEIn0.PLANTEDSIGNATURE0123456789',
  privateKeyBody: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCPLANTEDPRIVATEKEYBODY',
  namedToken: 'PLANTEDTOKENVALUE123',
  namedPassword: 'PlantedHunter2Pass',
  dotenv: 'DOTENV_PLANTED_SECRET=abc',
  prompt: 'PLANTED_PROMPT_TEXT please run alpha on the payments module',
  prompt2: 'PLANTED_PROMPT_TEXT_2 thanks, now do it again',
  toolOutput: 'PLANTED_TOOL_OUTPUT: ls: cannot access',
  subagentPrompt: 'PLANTED_SUBAGENT_TEXT research the eligibility API',
  skillBodyInTranscript: 'PLANTED_SKILL_BODY_IN_TRANSCRIPT',
  hookCommand: 'node PLANTED_HOOK_PATH/.claude/hooks/capture.js',
  hookSecret: 'PLANTEDHOOKSECRET0123',
  machineId: 'PLANTED_MACHINE_ID_0000',
  userId: 'PLANTED_USER_ID_0000',
  email: 'planted@example.com',
  claudeMd: 'PLANTED_CLAUDE_MD internal instructions',
  appSource: 'PLANTED_APP_SOURCE',
  urlPassword: 'PlantedUrlPass22',
  dotenvInSkill: 'DOTENV_IN_SKILL=abc',
  rsaBody: 'PLANTED_RSA_BODY_LINE',
  logLine: 'PLANTED_LOG_LINE with a prompt in it',
  pycMarker: 'PLANTED_PYC_SOURCE_PATH',
  mcpCommand: 'PLANTED_MCP_COMMAND_PATH',
  sessionId: '1f910c4b-0929-482f-8eb2-b215ca4a17a2',
  sessionId4: '2a2a2a2a-0000-4000-8000-000000000004',
  agentId: 'agent1234567890ab',
  sdkSkill: 'noise-skill-from-sdk',
} as const;

export interface Fixture {
  /** The temp root; delete it after the test. */
  tmp: string;
  /** `<tmp>/Users/plantedusername` */
  home: string;
  projA: string;
  projB: string;
  pluginRoot: string;
}

async function write(path: string, text: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text, 'utf8');
}

const jsonl = (records: readonly unknown[]): string => records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';

export async function buildFixture(): Promise<Fixture> {
  const tmp = join(tmpdir(), `tsr-fixture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const home = join(tmp, 'Users', PLANTED.username);
  const projA = join(home, 'dev', 'projA');
  const projB = join(tmp, 'elsewhere', 'projB');
  const pluginRoot = join(home, '.claude', 'plugins', 'cache', 'market', 'gamma', 'abc123def456');
  const gone = join(tmp, 'gone', 'deleted-project');
  const H = (...parts: string[]): string => join(home, ...parts);

  await mkdir(join(home, 'Desktop'), { recursive: true });

  await write(H('.claude.json'), JSON.stringify({
    userID: PLANTED.userId,
    machineID: PLANTED.machineId,
    oauthAccount: { emailAddress: PLANTED.email },
    mcpServers: { 'home-mcp': { command: PLANTED.mcpCommand, args: ['--x'] } },
    projects: {
      [projA]: { allowedTools: [], mcpServers: { 'planted-project-mcp': { command: PLANTED.mcpCommand } }, lastVersionBase: '2.1.280' },
      [projB]: { allowedTools: [] },
      [gone]: { allowedTools: [] },
      // The home folder opened as a project, and a folder above it: neither may become a copy of the
      // home skills, a label, or a display path that carries the username.
      [home]: { allowedTools: [] },
      [tmp]: { allowedTools: [] },
    },
  }, null, 2));

  await write(H('.claude', 'settings.json'), JSON.stringify({
    enabledPlugins: { 'gamma@market': true, 'off@market': false },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: `${PLANTED.hookCommand} --secret-header "x-control-secret: ${PLANTED.hookSecret}"` }] }],
      SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: `${PLANTED.hookCommand} --start` }] }],
    },
  }, null, 2));

  // Home skills. alpha references a script inside its folder and a workflow under ~/.claude.
  await write(H('.claude', 'skills', 'alpha', 'SKILL.md'), [
    '---', 'name: alpha', 'description: Runs the alpha workflow.', '---',
    '# alpha', '', 'Run `scripts/run.sh` first, then `node .claude/workflows/helper.js`.',
    'Never read `../.env`. Docs: https://example.com/alpha/guide.md', '',
    'Permissions live in `.claude/settings.json`; transcripts in `~/.claude/projects/x.jsonl`.', '',
    'Its own folder: `<skill-dir>/scripts/run.sh`; not there: `${CLAUDE_SKILL_DIR}/scripts/absent.py`; a placeholder: `<worktree>/report.json`.', '',
  ].join('\n'));
  await write(H('.claude', 'skills', 'alpha', 'scripts', 'run.sh'), [
    '#!/bin/sh',
    `ANTHROPIC_API_KEY=${PLANTED.anthropicKey}`,
    'export ANTHROPIC_API_KEY',
    'echo "$ANTHROPIC_API_KEY"   # reading a variable is never flagged',
    `curl -H "Authorization: Bearer ${PLANTED.jwt}" https://api.example.com`,
    `AWS_ACCESS_KEY_ID=${PLANTED.awsKey}`,
    `SLACK_TOKEN="${PLANTED.slackToken}"`,
    `password: ${PLANTED.namedPassword}`,
    'AUTH_MODE=$MODE',
    'author=someone',
    `DATABASE_URL=postgres://app:${PLANTED.urlPassword}@db.internal:5432/app`,
    '',
  ].join('\n'));
  // Inside the skill folder, files that never leave (spec §2.6) and a UTF-16 script that must still be scanned.
  await write(H('.claude', 'skills', 'alpha', '.env'), `${PLANTED.dotenvInSkill}\n`);
  await write(H('.claude', 'skills', 'alpha', 'id_rsa'), `-----BEGIN OPENSSH PRIVATE KEY-----\n${PLANTED.rsaBody}\n-----END OPENSSH PRIVATE KEY-----\n`);
  await write(H('.claude', 'skills', 'alpha', 'debug.log'), `${PLANTED.logLine}\n`);
  await writeFile(H('.claude', 'skills', 'alpha', 'helper.ps1'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`$env:ANTHROPIC_API_KEY = "${PLANTED.anthropicKey}"\r\nWrite-Host "ok"\r\n`, 'utf16le')]));
  await write(H('.claude', 'skills', 'alpha', '__pycache__', 'helper.cpython-312.pyc'), `\u0000\u0000binary${PLANTED.pycMarker}${home}\u0000`);
  await write(H('.claude', 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Beta.\n---\n# beta\n\nSay beta.\n');
  await write(H('.claude', 'skills', 'alpha', 'AUTHORS.md'), `Maintained by Planted Person <${PLANTED.email}>.\n`);
  await write(H('.claude', 'skills', 'not-a-skill', 'README.md'), 'no SKILL.md here\n');
  await write(H('.claude', 'workflows', 'helper.js'), `// helper\nconst GITHUB_TOKEN = "${PLANTED.githubToken}";\nconst token = process.env.TOKEN; // a variable read\nexport default 1;\n`);
  await write(H('.claude', 'commands', 'deploy.md'), '# deploy\n\nDeploy the thing.\n');
  await write(H('.claude', 'agents', 'reviewer.md'), '---\nname: reviewer\n---\nReview code.\n');
  await write(H('.claude', 'hooks', 'capture.js'), 'process.exit(0);\n');
  await write(H('.env'), `${PLANTED.dotenv}\n`);

  // Plugin gamma, cache folder keyed by a commit hash, not a version (handoff gotcha).
  await write(H('.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: {
      'gamma@market': [
        { scope: 'user', installPath: pluginRoot, version: 'abc123def456', installedAt: '2026-06-18T14:39:54.986Z' },
        { scope: 'project', projectPath: projA, installPath: pluginRoot, version: 'abc123def456' },
      ],
      'missing@market': [{ scope: 'user', installPath: join(home, '.claude', 'plugins', 'cache', 'market', 'missing', '1.0.0'), version: '1.0.0' }],
    },
  }, null, 2));
  await write(join(pluginRoot, 'skills', 'gamma-skill', 'SKILL.md'), '---\nname: gamma-skill\ndescription: Gamma.\n---\nRun `python $CLAUDE_PLUGIN_ROOT/scripts/g.py` and `${CLAUDE_PLUGIN_ROOT}/scripts/absent.py`, also `${CLAUDE_SKILL_DIR}/../../scripts/g.py`.\n');
  await write(join(pluginRoot, 'scripts', 'g.py'), [
    'import os',
    'KEY = os.environ["OPENAI_API_KEY"]  # variable read, not flagged',
    `OPENAI_API_KEY = "${PLANTED.openaiKey}"`,
    'PRIVATE = """-----BEGIN RSA PRIVATE KEY-----',
    PLANTED.privateKeyBody,
    `${PLANTED.privateKeyBody}2`,
    '-----END RSA PRIVATE KEY-----"""',
    'print(KEY)',
    '',
  ].join('\n'));

  // Project A: a skill that references a project workflow and a missing script; a CLAUDE.md; a .env.
  await write(join(projA, '.claude', 'skills', 'delta', 'SKILL.md'), '---\nname: delta\ndescription: Delta.\n---\nRuns `.claude/workflows/wf.js` then `scripts/missing.sh` and `scripts/deploy.sh`. Fix `lib/phase1.ts`. See `/etc/secrets.yaml` and `C:\\absolute\\nowhere.ps1`.\n');
  await write(join(projA, 'scripts', 'deploy.sh'), '#!/bin/sh\necho deploy\n');
  await write(join(projA, 'lib', 'phase1.ts'), 'export const PLANTED_APP_SOURCE = 1;\n');
  await write(join(projA, '.claude', 'workflows', 'wf.js'), `const token = "${PLANTED.namedToken}";\nconst apiKey = process.env.API_KEY;\nconsole.log(token, apiKey);\n`);
  await write(join(projA, '.claude', 'commands', 'pr.md'), '# pr\n\nOpen a PR.\n');
  await write(join(projA, 'CLAUDE.md'), `${PLANTED.claudeMd}\n`);
  await write(join(projA, '.env'), `${PLANTED.dotenv}\n`);
  // Project B: a skill identical in content to home beta, so "unique by content" is exercised.
  await write(join(projB, '.claude', 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Beta.\n---\n# beta\n\nSay beta.\n');
  await write(join(projB, '.claude', 'agents', 'planner.md'), 'Plan.\n');

  // Transcripts. One project folder, three sessions and one broken file.
  const slug = 'C--Users-plantedusername-dev-projA';
  const sid = PLANTED.sessionId;
  const base = { isSidechain: false, userType: 'external', entrypoint: 'cli', cwd: projA, sessionId: sid, version: '2.1.280', gitBranch: 'main' };
  const usage = (i: number, w: number, r: number, o: number) => ({ input_tokens: i, cache_creation_input_tokens: w, cache_read_input_tokens: r, output_tokens: o });
  const t = (s: number): string => new Date(Date.UTC(2026, 8, 20, 10, 0, s)).toISOString();
  const main = [
    { type: 'file-history-snapshot', messageId: 'x', snapshot: {}, isSnapshotUpdate: false },
    { ...base, type: 'user', uuid: 'u1', parentUuid: null, promptSource: 'typed', timestamp: t(0), message: { role: 'user', content: PLANTED.prompt } },
    { ...base, type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: t(5), requestId: 'req_1', message: { id: 'msg_1', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'text', text: 'Sure.' }], usage: usage(10, 100, 1000, 20) } },
    { ...base, type: 'assistant', uuid: 'a1b', parentUuid: 'a1', timestamp: t(5), requestId: 'req_1', message: { id: 'msg_1', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'alpha' } }], usage: usage(10, 100, 1000, 20) } },
    { ...base, type: 'user', uuid: 'u2', parentUuid: 'a1b', timestamp: t(6), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Launching skill: alpha' }] }, toolUseResult: { success: true } },
    { ...base, type: 'user', uuid: 'u3', parentUuid: 'u2', isMeta: true, timestamp: t(6), message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${H('.claude', 'skills', 'alpha')}\n\n${PLANTED.skillBodyInTranscript}` }] } },
    { ...base, type: 'assistant', uuid: 'a2', parentUuid: 'u3', timestamp: t(10), message: { id: 'msg_2', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Bash', input: { command: 'ls /nowhere' } }], usage: usage(1, 200, 2000, 30) } },
    { ...base, type: 'user', uuid: 'u4', parentUuid: 'a2', timestamp: t(11), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: PLANTED.toolOutput, is_error: true }] }, toolUseResult: `Error: ${PLANTED.toolOutput}` },
    { ...base, type: 'assistant', uuid: 'a3', parentUuid: 'u4', timestamp: t(15), message: { id: 'msg_3', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_3', name: 'Agent', input: { prompt: PLANTED.subagentPrompt, description: 'Research' } }], usage: usage(2, 300, 3000, 40) } },
    { ...base, type: 'user', uuid: 'u5', parentUuid: 'a3', timestamp: t(16), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_3', content: [{ type: 'text', text: `Async agent launched successfully.\nagentId: ${PLANTED.agentId} (internal ID)` }] }] }, toolUseResult: { isAsync: true, status: 'async_launched', agentId: PLANTED.agentId, description: 'Research', prompt: PLANTED.subagentPrompt } },
    { ...base, type: 'assistant', uuid: 'a4', parentUuid: 'u5', timestamp: t(20), message: { id: 'msg_4', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'text', text: 'Done with alpha.' }], usage: usage(3, 400, 4000, 50) } },
    // A headless record inside a human session: an eval sandbox or SDK call. Never counted.
    { ...base, entrypoint: 'sdk-cli', type: 'assistant', uuid: 'sdk1', parentUuid: 'a4', timestamp: t(21), message: { id: 'msg_sdk', model: 'claude-haiku-4-5-20251001', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_sdk', name: 'Skill', input: { skill: PLANTED.sdkSkill } }], usage: usage(9999, 9999, 9999, 9999) } },
    // Human types /beta: no Skill record exists for this (spec §2.3).
    { ...base, type: 'user', uuid: 'u6', parentUuid: 'a4', promptSource: 'typed', timestamp: t(60), message: { role: 'user', content: '<command-message>beta is running…</command-message>\n<command-name>/beta</command-name>' } },
    { ...base, type: 'user', uuid: 'u7', parentUuid: 'u6', isMeta: true, timestamp: t(60), message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${H('.claude', 'skills', 'beta')}\n\nSay beta.` }] } },
    { ...base, type: 'assistant', uuid: 'a5', parentUuid: 'u7', timestamp: t(65), message: { id: 'msg_5', model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text: 'Running beta.' }], usage: usage(4, 500, 5000, 60) } },
    { ...base, type: 'user', uuid: 'u8', parentUuid: 'a5', timestamp: t(66), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    // A built-in command: a human message, never a skill firing.
    { ...base, type: 'user', uuid: 'u9', parentUuid: 'u8', promptSource: 'typed', timestamp: t(120), message: { role: 'user', content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>' } },
    { ...base, type: 'user', uuid: 'u10', parentUuid: 'u9', promptSource: 'typed', timestamp: t(180), message: { role: 'user', content: [{ type: 'text', text: `${PLANTED.prompt2}\n<system-reminder>ignored</system-reminder>` }] } },
    { ...base, type: 'assistant', uuid: 'a6', parentUuid: 'u10', timestamp: t(185), message: { id: 'msg_6', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_6', name: 'Skill', input: { skill: 'alpha' } }], usage: usage(5, 600, 6000, 70) } },
    { ...base, type: 'user', uuid: 'u11', parentUuid: 'a6', timestamp: t(186), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_6', content: 'Launching skill: alpha' }] } },
    { ...base, type: 'assistant', uuid: 'a7', parentUuid: 'u11', timestamp: t(240), message: { id: 'msg_7', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: usage(6, 700, 7000, 80) } },
    '{"type":"assistant","this line is not valid json',
    { type: 'queue-operation', operation: 'enqueue', timestamp: t(241), sessionId: sid, content: `<task-notification><task-id>${PLANTED.agentId}</task-id></task-notification>` },
  ];
  await write(H('.claude', 'projects', slug, `${sid}.jsonl`), jsonl(main));
  const sub = { ...base, isSidechain: true, agentId: PLANTED.agentId };
  await write(H('.claude', 'projects', slug, sid, 'subagents', `agent-${PLANTED.agentId}.jsonl`), jsonl([
    { ...sub, type: 'user', uuid: 's0', parentUuid: null, timestamp: t(17), message: { role: 'user', content: PLANTED.subagentPrompt } },
    { ...sub, type: 'assistant', uuid: 's1', parentUuid: 's0', timestamp: t(18), message: { id: 'msg_s1', model: 'claude-sonnet-5', role: 'assistant', content: [{ type: 'text', text: 'sub result' }], usage: usage(7, 50, 500, 8) } },
  ]));
  // A second, short session: one exchange, one plugin-prefixed firing.
  const sid4 = PLANTED.sessionId4;
  await write(H('.claude', 'projects', slug, `${sid4}.jsonl`), jsonl([
    { ...base, sessionId: sid4, type: 'user', uuid: 'q1', parentUuid: null, promptSource: 'typed', timestamp: t(1000), message: { role: 'user', content: 'hello' } },
    // A plugin skill fires under its plugin prefix; the copied folder is named without it.
    { ...base, sessionId: sid4, type: 'assistant', uuid: 'q2', parentUuid: 'q1', timestamp: t(1002), message: { id: 'msg_q', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_q', name: 'Skill', input: { skill: 'gamma:gamma-skill' } }], usage: usage(1, 1, 1, 1) } },
  ]));
  // A headless session: every record sdk-cli. Skipped, counted.
  await write(H('.claude', 'projects', slug, '3b3b3b3b-0000-4000-8000-000000000003.jsonl'), jsonl([
    { ...base, entrypoint: 'sdk-cli', sessionId: '3b3b3b3b-0000-4000-8000-000000000003', type: 'user', uuid: 'h1', parentUuid: null, promptSource: 'typed', timestamp: t(2000), message: { role: 'user', content: 'eval prompt' } },
    { ...base, entrypoint: 'sdk-cli', sessionId: '3b3b3b3b-0000-4000-8000-000000000003', type: 'assistant', uuid: 'h2', parentUuid: 'h1', timestamp: t(2001), message: { id: 'msg_h', model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Skill', input: { skill: PLANTED.sdkSkill } }], usage: usage(1, 1, 1, 1) } },
  ]));
  await write(H('.claude', 'projects', slug, 'broken.jsonl'), 'this is not\njson at all\n');

  return { tmp, home, projA, projB, pluginRoot };
}

/**
 * Makes project A a git repository with two commits on the delta skill by two planted authors on
 * two dates, so the leak test can check dates and the author count and that no email leaks.
 * Returns false when git is not installed.
 */
export function commitProjectA(fixture: Fixture): boolean {
  const git = (args: string[], env: Record<string, string> = {}): void => {
    execFileSync('git', args, { cwd: fixture.projA, stdio: 'ignore', timeout: 20_000, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env } });
  };
  try { execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 20_000 }); } catch { return false; }
  const author = (name: string, email: string, date: string): Record<string, string> => ({ GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date });
  git(['init', '-q', '-b', 'main']);
  git(['add', '.claude/skills/delta/SKILL.md']);
  git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'add delta'], author('Planted One', PLANTED.email, '2026-08-01T10:00:00Z'));
  appendFileSync(join(fixture.projA, '.claude', 'skills', 'delta', 'SKILL.md'), '\nTouched by a second author.\n', 'utf8');
  git(['add', '.claude/skills/delta/SKILL.md', '.claude/commands/pr.md']);
  git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'touch delta'], author('Planted Two', `two.${PLANTED.email}`, '2026-09-01T10:00:00Z'));
  return true;
}
