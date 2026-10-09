/**
 * MANIFEST.md, manifest.json, FLAGGED.md and collector.txt (spec §3). The manifest is the list of
 * everything that leaves: a file that is not in it did not leave. It also carries the sentence
 * from spec §2.3 word for word, and the CSV columns beside it, because that sentence is a promise
 * about those columns.
 */
import type { WrittenFile } from './output.js';
import { redactedFiles, uniqueByContent, type Report } from './report.js';

/** Spec §2.3, locked 2026-09-24. Do not reword. */
export const USAGE_SENTENCE = 'From sessions we gathered how often each skill was invoked. No raw session logs are sent out. All session logs were read locally, just for skill usage.';

export const CSV_COLUMNS = {
  summary: ['skill', 'source', 'fires', 'fires_by_model', 'fires_by_human', 'sessions', 'first_day', 'last_day', 'avg_tokens_per_fire', 'skill_text_tokens'],
  firings: ['firing_id', 'session_id', 'day', 'skill', 'source', 'invoked_by', 'model', 'input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'turns_after', 'tool_errors_after', 'interrupted_after', 'refired_in_session'],
  sessions: ['session_id', 'day', 'turns', 'human_messages', 'interruptions', 'skill_fires', 'distinct_skills', 'input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'minutes', 'subagent_sessions'],
} as const;

/** Column meanings, for the manifest. Every column describes a skill firing or its session (spec §2.3). */
export const CSV_MEANINGS: Record<string, string> = {
  skill: 'skill name as it fired',
  source: 'where the skill was found (home, project-<label>, plugin-...); `unknown` when it fired but no copied skill has that name',
  fires: 'firings of this skill',
  fires_by_model: 'firings where the model chose the skill (a `Skill` tool call)',
  fires_by_human: 'firings where a person typed the slash command',
  sessions: 'sessions with at least one firing of this skill',
  first_day: 'date of the first firing, no time of day',
  last_day: 'date of the last firing, no time of day',
  avg_tokens_per_fire: 'all four token kinds summed over this skill\'s firings, divided by fires',
  skill_text_tokens: 'estimated size of SKILL.md at four characters per token',
  firing_id: 'hashed session id plus a running number within the session',
  session_id: 'sha256 of the session id with a per-run salt that is never written; cannot be joined across runs',
  day: 'date, no time of day',
  invoked_by: '`model` (a `Skill` tool call) or `human` (a typed slash command)',
  model: 'the model that fired the skill, or the first model to answer a typed command',
  input_tokens: 'input tokens of the model responses inside the firing\'s exchange, plus subagents launched in it',
  cache_read_tokens: 'cache-read input tokens, same window',
  cache_write_tokens: 'cache-creation input tokens, same window',
  output_tokens: 'output tokens, same window',
  turns_after: 'model responses in the exchange after the firing (a turn is one model response)',
  tool_errors_after: 'tool results marked as errors in the exchange after the firing',
  interrupted_after: 'times the person interrupted the model in the exchange after the firing',
  refired_in_session: 'true when the same skill fired again later in the session',
  turns: 'model responses in the session (one per API call), subagents included',
  human_messages: 'messages a person typed, including slash commands; injected skill text and tool results are not counted',
  interruptions: 'times the person interrupted the model',
  skill_fires: 'skill firings in the session',
  distinct_skills: 'different skills that fired',
  minutes: 'wall-clock minutes from the first record to the last, rounded',
  subagent_sessions: 'nested subagent transcripts folded into this session\'s totals',
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function renderManifest(report: Report, files: readonly WrittenFile[]): string {
  const lines: string[] = [];
  const h = (text: string): void => { lines.push('', `## ${text}`, ''); };
  lines.push(`# terum-skills-report ${report.version}`, '', `Written ${report.startedAt.slice(0, 10)} by \`${report.command}\`. This folder is everything the collector produced. Nothing was sent anywhere; you zip and send it yourself. Delete any file or row you do not want to send: the per-file checksums in \`manifest.json\` let Terum tell a deliberate deletion from a broken bundle.`);

  h('Skills');
  const bySource = new Map<string, number>();
  for (const skill of report.skills) bySource.set(skill.source, (bySource.get(skill.source) ?? 0) + 1);
  lines.push(`${plural(report.skills.length, 'skill')} found, ${uniqueByContent(report.skills)} unique by content.`, '');
  for (const location of report.locations) lines.push(`- ${location.location}: ${location.detail}`);
  if (report.skills.length > 0) {
    lines.push('', '| Skill | Source | Read from | Files | Content hash |', '|---|---|---|---|---|');
    for (const skill of report.skills) lines.push(`| ${skill.name} | ${skill.source} | ${skill.readFrom} | ${skill.files.length} | ${skill.contentHash.slice(0, 12)} |`);
  }
  const skippedInside = report.skills.flatMap((s) => s.skipped.map((p) => `- ${p.where}: ${p.reason}`));
  if (skippedInside.length > 0) lines.push('', 'Inside skill folders, not copied:', '', ...skippedInside);

  h('Commands and agents');
  const commands = report.extras.filter((e) => e.kind === 'command');
  const agents = report.extras.filter((e) => e.kind === 'agent');
  lines.push(`${plural(commands.length, 'command')}, ${plural(agents.length, 'agent definition')}.`);
  for (const extra of [...commands, ...agents]) lines.push(`- \`${extra.outputPath}\` from ${extra.readFrom}`);

  h('Linked scripts');
  const linked = report.extras.filter((e) => e.kind === 'linked');
  const missingScripts = report.linkedMisses.filter((m) => m.disqualifies).length;
  lines.push(`${plural(linked.length, 'file')} a skill references outside its own folder ${linked.length === 1 ? 'was' : 'were'} copied; ${plural(report.linkedMisses.length, 'reference')} could not be resolved, ${missingScripts} of them ${missingScripts === 1 ? 'a script' : 'scripts'} the skill runs. A skill whose script is missing is reported as *not evaluable*, never guessed at; those references are marked **not evaluable** below. The rest are listed for information and do not affect scoring.`);
  for (const extra of linked) lines.push(`- \`${extra.outputPath}\` from ${extra.readFrom}, referenced by ${(extra.referencedBy ?? []).join(', ')}`);
  if (report.linkedMisses.length > 0) {
    lines.push('', 'Referenced, not found:', '');
    for (const miss of report.linkedMisses) lines.push(`- ${miss.skill} (${miss.source}) references \`${miss.reference}\`: ${miss.reason}${miss.disqualifies ? ' · **not evaluable**' : ''}`);
  }

  h('Usage');
  const u = report.usage;
  if (u.status === 'skipped-by-flag') {
    lines.push('Session transcripts were **not read**: the run used `--no-usage`. The three CSV files carry headers only. This is a files-only bundle, not a machine with no sessions.');
  } else if (u.status === 'no-session-data') {
    lines.push('**No session data on this machine**: `~/.claude/projects` is missing or holds no transcripts. The three CSV files carry headers only.');
  } else {
    lines.push(USAGE_SENTENCE, '', `Read ${plural(u.projectFolders, 'project folder')} under \`~/.claude/projects\`: ${plural(u.sessions, 'session')} from ${u.firstDay ?? '?'} to ${u.lastDay ?? '?'}, ${plural(u.subagentTranscripts, 'nested subagent transcript')}, ${plural(u.firings, 'skill firing')} across ${plural(u.sessionsWithFirings, 'session')}.`);
    if (u.headlessSessionsSkipped > 0) lines.push(`${plural(u.headlessSessionsSkipped, 'transcript')} held only headless records (evals, SDK runs) and ${u.headlessSessionsSkipped === 1 ? 'was' : 'were'} not counted.`);
    if (u.linesSkipped > 0) lines.push(`${plural(u.linesSkipped, 'line')} could not be parsed and ${u.linesSkipped === 1 ? 'was' : 'were'} skipped.`);
    if (u.filesSkipped.length > 0) { lines.push('', 'Files skipped:', ''); for (const p of u.filesSkipped) lines.push(`- ${p.where}: ${p.reason}`); }
  }
  lines.push('', 'The exact columns, and what each means:', '');
  for (const [file, columns] of Object.entries(CSV_COLUMNS)) {
    lines.push(`\`usage/${file}.csv\``, '');
    for (const column of columns) lines.push(`- \`${column}\`: ${CSV_MEANINGS[column] ?? ''}`);
    lines.push('');
  }
  lines.push('Which tokens a firing owns: the exchange it fired in, from the firing to the next message a person typed, plus any subagent launched inside that window. Two skills that fire in the same exchange both own it, so firing rows can overlap; session rows never do.');

  h('Redactions');
  if (report.redactions.length === 0) lines.push('No line was redacted.');
  else lines.push(`${plural(report.redactions.length, 'value')} in ${plural(redactedFiles(report.redactions), 'file')} ${report.redactions.length === 1 ? 'was' : 'were'} replaced with \`[REDACTED:<rule>]\`. Only the value was replaced; the variable name and the line stay. See \`FLAGGED.md\`. A redacted script may no longer run; Terum then reports that skill as *not evaluable* rather than scoring it.`);
  lines.push('', 'Redaction catches values with a known shape (Anthropic, OpenAI, GitHub, AWS and Slack keys, signed web tokens, private-key blocks) and literals assigned to a name containing key, secret, token, password, passwd, credential or auth. A secret with no known shape under an innocent name is **not** caught. Please read the folder before you zip it.');
  if (report.unscanned.length > 0) { lines.push('', 'Copied without a redaction scan (binary):', ''); for (const p of report.unscanned) lines.push(`- \`${p}\``); }

  h('Git');
  lines.push(`For ${plural(report.git.length, 'copied file')} inside a git repository: first commit date, last commit date and the number of distinct authors, as an integer. No names or emails.`);
  if (report.gitProblems.length > 0) { lines.push('', 'Not available:', ''); for (const p of report.gitProblems) lines.push(`- ${p.where}: ${p.reason}`); }

  h('Environment');
  const env = report.environment;
  lines.push(`- Claude Code ${env.claudeCodeVersion ?? 'version unknown'}`, `- ${env.os}`, `- shell: ${env.shell ?? 'unknown'}`, `- Node ${env.node}`, `- MCP server names: ${env.mcpServers.length > 0 ? env.mcpServers.join(', ') : 'none'}`);
  for (const [label, servers] of Object.entries(env.mcpServersByProject)) if (servers.length > 0) lines.push(`- MCP server names in ${label}: ${servers.join(', ')}`);
  lines.push(`- hook events: ${env.hookEvents.length > 0 ? env.hookEvents.join(', ') : 'none'}`);
  if (env.hookCommands !== undefined) { lines.push('- hook commands (included by `--include-hooks`):'); for (const c of env.hookCommands) lines.push(`  - \`${c}\``); }
  else lines.push('- hook commands: not included (pass `--include-hooks`)');
  if (env.plugins.length > 0) { lines.push('- plugins:'); for (const p of env.plugins) lines.push(`  - ${p.id} ${p.version} (${p.scope}, ${p.enabled === undefined ? 'enabled state unknown' : p.enabled ? 'enabled' : 'disabled'}, ${plural(p.skills, 'skill')})`); }

  h('Not read');
  lines.push('Prompts, replies, tool output, file contents seen by the model, source code from your repositories, `.env` files, MCP configuration, permission lists, the transcript files themselves and the skill body as it appears inside a transcript. Nothing outside the folders named above was opened.');
  if (!report.flags.includeClaudeMd) lines.push('Project `CLAUDE.md` and rule files were not read (pass `--include-claude-md`).');

  if (report.problems.length > 0) {
    h('Problems');
    lines.push('Each was recorded and the run continued.', '');
    for (const p of report.problems) lines.push(`- ${p.where}: ${p.reason}`);
  }

  h('Files');
  lines.push(`${plural(files.length, 'file')}, each with its sha256 in \`manifest.json\`.`, '');
  for (const file of files) lines.push(`- \`${file.path}\` (${file.bytes} bytes)`);
  lines.push('');
  return lines.join('\n');
}

export function renderFlagged(report: Report): string {
  const lines = ['# Redactions to confirm', ''];
  if (report.redactions.length === 0) lines.push('No line was redacted.', '');
  else {
    lines.push(`${report.redactions.length} value${report.redactions.length === 1 ? '' : 's'} replaced with \`[REDACTED:<rule>]\`. The value itself is not recorded here; the hint is the rule's fixed prefix and the value's length. If a line below is not a secret, restore it from your own copy before you zip, or leave it and Terum will treat the skill as *not evaluable*.`, '', '| File | Line | Rule | Name | Hint |', '|---|---|---|---|---|');
    for (const r of report.redactions) lines.push(`| \`${r.outputPath}\` | ${r.line} | ${r.rule} | ${r.name || '—'} | ${r.hint} |`);
    lines.push('');
  }
  if (report.unscanned.length > 0) {
    lines.push('## Copied without a scan', '', `${report.unscanned.length} file${report.unscanned.length === 1 ? ' is' : 's are'} binary and could not be checked for secrets or identity. Please open ${report.unscanned.length === 1 ? 'it' : 'each'} or delete ${report.unscanned.length === 1 ? 'it' : 'them'} before you zip.`, '');
    for (const p of report.unscanned) lines.push(`- \`${p}\``);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderCollector(report: Report): string {
  return [
    `terum-skills-report ${report.version}`,
    `sha256 ${report.sha256}`,
    `source github.com/Terum-Inc/terum-skills-report @ ${report.commit}`,
    `command ${report.command}`,
    `started ${report.startedAt}`,
    `flags usage=${report.flags.usage} include-hooks=${report.flags.includeHooks} include-claude-md=${report.flags.includeClaudeMd} hash-labels=${report.flags.hashLabels}`,
    '',
  ].join('\n');
}

export function renderManifestJson(report: Report, files: readonly WrittenFile[]): string {
  const json = {
    collector: { name: 'terum-skills-report', version: report.version, sha256: report.sha256, commit: report.commit, command: report.command, startedAt: report.startedAt, flags: report.flags },
    usageSentence: USAGE_SENTENCE,
    csvColumns: CSV_COLUMNS,
    skills: report.skills.map((s) => ({ name: s.name, source: s.source, readFrom: s.readFrom, outputDir: s.outputDir, files: s.files, contentHash: s.contentHash, skillTextChars: s.skillTextChars, skipped: s.skipped })),
    extras: report.extras,
    linkedMisses: report.linkedMisses,
    redactions: report.redactions,
    unscanned: report.unscanned,
    git: report.git,
    gitProblems: report.gitProblems,
    usage: report.usage,
    environment: report.environment,
    problems: report.problems,
    files,
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}
