/**
 * Session transcript parsing (spec §2.3, §3.1; walk D1, D2).
 *
 * Copied from terum-skills `src/lib/usage/transcripts.ts` (two-detector firing scanner, the
 * `entrypoint` noise filter, the builtin-command list, the one-level transcript glob) and the turn
 * machine of `src/lib/misses/harvest.ts` (what is a human message, what is injected, what is a tool
 * result), at commit ed9f38a of github.com/Terum-Inc/terum-skills. This copy adds what the
 * originals deliberately omit: tokens, model, timestamp, tool errors, interruptions and the nested
 * subagent transcripts, joined to the exchange that launched them by `agentId`.
 *
 * Two detectors, because a slash-invoked skill writes no `Skill` record at all:
 * - D1, the model chose it: an assistant `tool_use` block named `Skill`, skill name in `input.skill`.
 * - D2, a person typed it: a user message carrying `<command-name>/name</command-name>`.
 *
 * Field names verified against real transcripts on 2026-09-24 (docs/spec.md §13): the noise filter
 * is `entrypoint` (`cli` is a person at a terminal; `sdk-cli` is every eval sandbox and SDK run);
 * `userType` is `external` on both and is not the filter. Assistant usage repeats on every record
 * that shares one `message.id` (a text block and a tool_use block from the same response), so
 * tokens are counted once per message id. The record that launches a subagent is a user
 * tool_result whose `toolUseResult.agentId` names the nested transcript.
 *
 * Nothing in this file keeps text. Every function returns counts, names, ids and timestamps.
 */

export interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number }

export const ZERO: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
export const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output });
export const totalTokens = (u: Usage): number => u.input + u.cacheWrite + u.cacheRead + u.output;

export type Event =
  /** A person typed something. `commands` are the D2 skill names in it (builtins removed). */
  | { type: 'human'; ts: string; commands: string[] }
  /** One model response record. `messageId` groups records of one response; `usage` is present on the first record of each id only. */
  | { type: 'assistant'; ts: string; messageId: string; model: string; usage: Usage | undefined; skillCalls: string[] }
  /** A tool result record: how many blocks were errors, and which subagents it reports as launched. */
  | { type: 'tool_result'; ts: string; errors: number; agentIds: string[] }
  /** The person interrupted the model. */
  | { type: 'interruption'; ts: string };

export interface ParsedTranscript {
  events: Event[];
  /** Records that passed the noise filter and were a user or assistant message. */
  counted: number;
  /** Records that parsed but were dropped as headless (`entrypoint` other than `cli`). */
  headless: number;
  /** Lines that were not JSON objects. */
  badLines: number;
  /** Total lines that were JSON objects. */
  records: number;
  /** The `version` on the latest record. */
  version: string | undefined;
  /** `sessionId` on the records, when present. */
  sessionId: string | undefined;
}

/**
 * Claude Code's own slash commands. They travel in the same `<command-name>` envelope a skill does,
 * so counting them as skills would be an error. Copied from terum-skills, extended with the
 * commands seen since.
 */
export const BUILTIN_COMMANDS: ReadonlySet<string> = new Set([
  'add-dir', 'agents', 'bug', 'clear', 'compact', 'config', 'context', 'cost', 'doctor', 'exit',
  'export', 'help', 'hooks', 'ide', 'init', 'install-github-app', 'login', 'logout', 'mcp',
  'memory', 'migrate-installer', 'model', 'output-style', 'permissions', 'plan', 'pr-comments',
  'privacy-settings', 'release-notes', 'resume', 'review', 'rewind', 'status', 'statusline',
  'terminal-setup', 'todos', 'upgrade', 'usage', 'vim', 'workflows', 'artifacts', 'fast', 'effort',
  'insights', 'remote-control', 'tasks', 'theme', 'keybindings', 'reload-plugins', 'plugin',
  'security-review', 'stats', 'skills', 'passes', 'chrome', 'desktop', 'copy', 'branch', 'btw',
  'diff', 'files', 'feedback', 'issue', 'mobile', 'rename', 'sandbox', 'teleport', 'voice',
]);

const COMMAND_NAME = /<command-name>\/?([a-zA-Z0-9:_-]+)<\/command-name>/g;
const INTERRUPTED = /\[Request interrupted by user(?: for tool use)?\]/;
const TASK_NOTIFICATION = '<task-notification>';
/** Appended context and command plumbing, not the person's words. */
const NOT_SPOKEN = /<system-reminder>[\s\S]*?<\/system-reminder>|<local-command-stdout>[\s\S]*?<\/local-command-stdout>|<local-command-caveat>[\s\S]*?<\/local-command-caveat>|<command-message>[\s\S]*?<\/command-message>|<command-args>[\s\S]*?<\/command-args>/g;

type Rec = Record<string, unknown>;
const asObject = (v: unknown): Rec | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : undefined);

/** Message content is a bare string or a block array; only text blocks carry prose. */
function messageText(message: unknown): string {
  const content = asObject(message)?.['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => { const text = asObject(block)?.['text']; return typeof text === 'string' ? text : ''; }).filter((t) => t.length > 0).join('\n');
}

function blocks(message: unknown): Rec[] {
  const content = asObject(message)?.['content'];
  return Array.isArray(content) ? content.map(asObject).filter((b): b is Rec => b !== undefined) : [];
}

/** True when every block is a tool_result: the record is plumbing, not a person talking. */
function isToolResult(message: unknown): boolean {
  const list = blocks(message);
  return list.length > 0 && list.every((b) => b['type'] === 'tool_result');
}

function skillCalls(message: unknown): string[] {
  const names: string[] = [];
  for (const b of blocks(message)) {
    if (b['type'] !== 'tool_use' || b['name'] !== 'Skill') continue;
    const skill = asObject(b['input'])?.['skill'];
    if (typeof skill === 'string' && skill.length > 0) names.push(skill);
  }
  return names;
}

function commandNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(COMMAND_NAME)) {
    const name = match[1];
    if (name !== undefined && !BUILTIN_COMMANDS.has(name)) names.push(name);
  }
  return names;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function usageOf(message: unknown): Usage | undefined {
  const u = asObject(asObject(message)?.['usage']);
  if (u === undefined) return undefined;
  return { input: num(u['input_tokens']), cacheWrite: num(u['cache_creation_input_tokens']), cacheRead: num(u['cache_read_input_tokens']), output: num(u['output_tokens']) };
}

/** The subagents a tool_result record reports as launched: `toolUseResult.agentId`, or `agentId: <id>` in its text. */
function agentIdsOf(record: Rec, message: unknown): string[] {
  const ids = new Set<string>();
  const result = record['toolUseResult'];
  const direct = asObject(result)?.['agentId'];
  if (typeof direct === 'string' && direct.length > 0) ids.add(direct);
  for (const b of blocks(message)) {
    if (b['type'] !== 'tool_result') continue;
    const text = typeof b['content'] === 'string' ? b['content'] : Array.isArray(b['content']) ? b['content'].map((c) => { const t = asObject(c)?.['text']; return typeof t === 'string' ? t : ''; }).join('\n') : '';
    for (const m of text.matchAll(/\bagentId:\s*([A-Za-z0-9_-]{6,})/g)) ids.add(m[1]!);
  }
  return [...ids];
}

/** `cli` is a person at a terminal. A record with no `entrypoint` predates the field and is kept. */
const isHumanSession = (record: Rec): boolean => record['entrypoint'] === undefined || record['entrypoint'] === 'cli';

/**
 * One transcript's events, in order. Pure and exported: it is the whole parser. A malformed or
 * half-written line (Claude Code appends while we read) is one more bad line, never fatal.
 *
 * `nested` is true for a subagent transcript, where every record is `isSidechain: true` and is kept;
 * in a main transcript sidechain records are dropped because their work is read from the nested file.
 */
export function parseTranscript(text: string, nested = false): ParsedTranscript {
  const out: ParsedTranscript = { events: [], counted: 0, headless: 0, badLines: 0, records: 0, version: undefined, sessionId: undefined };
  const seenIds = new Set<string>();
  let latestTs = '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let record: Rec;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const obj = asObject(parsed);
      if (obj === undefined) { out.badLines++; continue; }
      record = obj;
    } catch { out.badLines++; continue; }
    out.records++;
    const type = record['type'];
    if (type !== 'user' && type !== 'assistant') continue;
    if (!isHumanSession(record)) { out.headless++; continue; }
    if (!nested && record['isSidechain'] === true) continue;
    const ts = typeof record['timestamp'] === 'string' ? record['timestamp'] : '';
    if (ts >= latestTs) {
      latestTs = ts;
      if (typeof record['version'] === 'string') out.version = record['version'];
    }
    if (out.sessionId === undefined && typeof record['sessionId'] === 'string') out.sessionId = record['sessionId'];
    out.counted++;
    const message = record['message'];

    if (type === 'assistant') {
      const messageId = typeof asObject(message)?.['id'] === 'string' ? (asObject(message)!['id'] as string) : `record-${out.records}`;
      const model = typeof asObject(message)?.['model'] === 'string' ? (asObject(message)!['model'] as string) : '';
      const first = !seenIds.has(messageId);
      seenIds.add(messageId);
      out.events.push({ type: 'assistant', ts, messageId, model, usage: first ? usageOf(message) ?? ZERO : undefined, skillCalls: skillCalls(message) });
      continue;
    }

    if (isToolResult(message)) {
      const errors = blocks(message).filter((b) => b['is_error'] === true).length;
      out.events.push({ type: 'tool_result', ts, errors, agentIds: agentIdsOf(record, message) });
      continue;
    }
    const body = messageText(message);
    if (record['isMeta'] === true || body.includes(TASK_NOTIFICATION)) continue; // injected skill text or a harness notice
    const commands = commandNames(body);
    const spoken = body.replace(NOT_SPOKEN, '').replace(COMMAND_NAME, '').trim();
    if (INTERRUPTED.test(spoken)) { out.events.push({ type: 'interruption', ts }); continue; }
    if (commands.length === 0 && !/<command-name>/.test(body) && spoken.length === 0) continue; // nothing a person said
    out.events.push({ type: 'human', ts, commands });
  }
  return out;
}
