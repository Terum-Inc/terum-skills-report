/**
 * Linked scripts (spec §2.2): files a skill references outside its own folder, found by resolving
 * path-shaped tokens in SKILL.md against the skill folder, its base (project root or plugin root)
 * and `~/.claude`. This is a heuristic and it will miss some; every reference that could not be
 * resolved, or was resolved but not copied, is recorded so the eval marks the skill *not
 * evaluable* instead of guessing.
 *
 * Three guards keep this inside what the spec allows to leave:
 * - a resolved path must lie inside the base it was resolved against, so `../.env` cannot climb out;
 * - some names are never copied whatever references them (spec §2.6): `.env` files, settings and
 *   MCP configuration, credentials, transcripts, logs, key files, and CLAUDE.md unless asked;
 * - a file in a project is copied only from skill machinery folders (`.claude/`, `scripts/`,
 *   `workflows/`, `hooks/`, `bin/`, `tools/`). Application source a skill happens to mention
 *   (`lib/phase1.ts`) is the customer's code, which §2.6 says never leaves; it is listed as
 *   referenced and not copied. Measured on this machine 2026-09-24: without this, a skill that
 *   named an API route file would have shipped it.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Copier } from './copier.js';
import { displayPath } from './discover.js';
import type { Home } from './home.js';
import { neverCollected } from './never.js';
import type { CopiedExtra, Report, SkillEntry } from './report.js';

/** `https://…` and `file://…` are links, not files on this machine. */
const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

const SEGMENT = '[A-Za-z0-9_.-]+';
/** The last segment may be a dotfile (`.env`, `.eslintrc.json`): a name of any length, then `.ext`. */
const LAST_SEGMENT = '[A-Za-z0-9_.-]*\\.[A-Za-z][A-Za-z0-9]{0,7}';
/**
 * The skill's own folder: $CLAUDE_SKILL_DIR or $SKILL_DIR (with or without braces), {SKILL_DIR} and <skill-dir>.
 * <skill-path> is not one: skill-creator uses it for whichever skill is being edited.
 */
const SKILL_DIR = /^(?:\$\{?(?:CLAUDE_)?SKILL_DIR\}?|\{(?:CLAUDE_)?SKILL_DIR\}|<skill[-_]dir>|<SKILL[-_]DIR>)/;
/** Any shell variable or bracketed placeholder may start a path; what it means is decided when the token is resolved. */
const PREFIX = '(?:\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?|<[A-Za-z0-9_-]+>|\\{[A-Za-z0-9_-]+\\}|~|\\.\\.?|[A-Za-z]:)?';
/**
 * A path-shaped token: an optional prefix (`~`, `.`, `..`, a drive letter, any `$VARIABLE`, a
 * `<placeholder>` or `{placeholder}`), at least one separator, and a file extension that starts with a
 * letter. Without the placeholder prefixes, `<skill-dir>/scripts/x.js` was read as `/scripts/x.js`. `docs/spec.md`,
 * `./scripts/run.sh`, `.claude/workflows/x.js`, `$CLAUDE_PLUGIN_ROOT/scripts/g.py`, `C:\x\y.ps1`.
 */
const PATH_TOKEN = new RegExp(`(?<![A-Za-z0-9_@:])(${PREFIX}(?:[\\\\/]${SEGMENT})*[\\\\/]${LAST_SEGMENT}|${SEGMENT}(?:[\\\\/]${SEGMENT})*[\\\\/]${LAST_SEGMENT})(?![A-Za-z0-9_])`, 'g');
/** `api\.cohere\.ai` and `\.env\.local` are regular expressions in prose, not Windows paths. */
const REGEX_ESCAPE = /\\\.[A-Za-z]/;

const PLUGIN_ROOT = /^\$\{?CLAUDE_PLUGIN_ROOT\}?/;

export function pathTokens(text: string): string[] {
  const seen = new Set<string>();
  const cleaned = text.replace(URL, ' ');
  for (const match of cleaned.matchAll(PATH_TOKEN)) {
    const token = match[1]!.replace(/[.,;:)]+$/, '');
    if (token.length === 0) continue;
    if (REGEX_ESCAPE.test(token) && !/^(?:[A-Za-z]:|~|\.claude)/.test(token)) continue;
    seen.add(token);
  }
  return [...seen];
}

/**
 * Folders whose files a skill runs (walk D16). hooks is not here on purpose: Claude Code runs hooks on
 * events, the skill does not, and hook configuration is never collected by default.
 */
const RUNNABLE_FOLDERS: ReadonlySet<string> = new Set(['scripts', 'bin', 'tools', 'workflows']);
/**
 * Folders a project or a plugin keeps skill machinery in. A referenced file elsewhere is application
 * source (spec §2.6); a plugin whose cache folder is a whole repository has the same shape.
 */
const MACHINERY = new Set([...RUNNABLE_FOLDERS, '.claude', '.claude-plugin', 'hooks', 'skills', 'agents', 'commands']);
/**
 * Extensions of files that are run, never merely read. .js, .ts and .py are not here on purpose:
 * skills name application source (lib/phase1.ts) and prose examples (path/to/file.ts) with them.
 */
const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd']);

/**
 * A reference the skill runs rather than talks about: any file under a scripts-type folder, or a
 * shell script anywhere (walk D16). Only such a reference, when it is not in the bundle, makes the
 * skill not evaluable; every other miss is listed for information.
 */
export function isScriptLike(reference: string): boolean {
  const segments = reference.split(/[\\/]/).filter((s) => s.length > 0);
  const last = segments.pop() ?? '';
  if (segments.some((s) => RUNNABLE_FOLDERS.has(s.toLowerCase()))) return true;
  const dot = last.lastIndexOf('.');
  return dot > 0 && SCRIPT_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

/** Why a reference is not in the bundle. A script-like reference in the first three kinds disqualifies the skill (walk D16). */
export type MissCategory = 'not-found' | 'not-opened' | 'not-copied' | 'never-collected' | 'placeholder' | 'folder';
const DISQUALIFYING: ReadonlySet<MissCategory> = new Set(['not-found', 'not-opened', 'not-copied']);
export const disqualifies = (reference: string, category: MissCategory): boolean => DISQUALIFYING.has(category) && isScriptLike(reference);

function insideMachinery(base: string, disk: string): boolean {
  const segments = relative(base, disk).split(sep);
  return segments.slice(0, -1).some((s) => MACHINERY.has(s.toLowerCase()));
}

/** `inside(base, path)`: the resolved path is `base` or below it, never a sibling or a parent. */
function inside(base: string, path: string): boolean {
  const rel = relative(resolve(base), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

type Resolution =
  | { ok: true; disk: string; base: string; label: string; kind: 'skill' | 'project' | 'plugin' | 'home' }
  | { ok: false; reason: string; category: MissCategory };

async function isFile(path: string): Promise<boolean | 'folder'> {
  try { const s = await stat(path); return s.isFile() ? true : s.isDirectory() ? 'folder' : false; } catch { return false; }
}

async function resolveToken(token: string, skill: SkillEntry, home: Home, projectLabel: string | undefined): Promise<Resolution> {
  const claudeDir = home.claudeDir;
  const isPlugin = skill.source.startsWith('plugin-');
  const baseKind = skill.source === 'home' ? 'home' : isPlugin ? 'plugin' : 'project';
  const baseLabel = skill.source === 'home' ? 'home' : isPlugin ? skill.source : projectLabel ?? skill.source;
  // A file next to the skill, in the same plugin, project or skills folder. Home siblings are reported against ~/.claude so the output path keeps its skills/ segment.
  const siblingBase = baseKind === 'home' ? claudeDir : skill.baseDir;
  const describe = (kind: boolean | 'folder', where: string): Resolution => (kind === 'folder' ? { ok: false, reason: 'is a folder', category: 'folder' } : { ok: false, reason: `not found ${where}`, category: 'not-found' });

  if (SKILL_DIR.test(token)) {
    const rest = token.replace(SKILL_DIR, '').replace(/^[\\/]+/, '');
    const disk = resolve(skill.diskPath, ...rest.split(/[\\/]/));
    if (inside(skill.diskPath, disk)) {
      const kind = await isFile(disk);
      return kind === true ? { ok: true, disk, base: skill.diskPath, label: baseLabel, kind: 'skill' } : describe(kind, 'under the skill folder');
    }
    // $CLAUDE_SKILL_DIR/../other/scripts/x.mjs: a sibling skill in the same plugin or skills folder.
    if (inside(skill.baseDir, disk)) {
      const kind = await isFile(disk);
      return kind === true ? { ok: true, disk, base: siblingBase, label: baseLabel, kind: baseKind } : describe(kind, 'next to the skill folder');
    }
    return { ok: false, reason: 'resolves outside the skill folder, its project and ~/.claude; not opened', category: 'not-opened' };
  }
  // <worktree>/report.json: a placeholder nobody can resolve. It is listed as one, never as the absolute path after the >.
  if (token.startsWith('<')) return { ok: false, reason: 'a placeholder in angle brackets, not a path on this machine', category: 'placeholder' };
  if (token.startsWith('{')) return { ok: false, reason: 'a placeholder in braces, not a path on this machine', category: 'placeholder' };

  if (PLUGIN_ROOT.test(token)) {
    if (!isPlugin) return { ok: false, reason: 'CLAUDE_PLUGIN_ROOT referenced outside a plugin', category: 'not-found' };
    const rest = token.replace(PLUGIN_ROOT, '').replace(/^[\\/]+/, '');
    const disk = join(skill.baseDir, ...rest.split(/[\\/]/));
    if (!inside(skill.baseDir, disk)) return { ok: false, reason: 'resolves outside the plugin folder', category: 'not-opened' };
    const kind = await isFile(disk);
    return kind === true ? { ok: true, disk, base: skill.baseDir, label: skill.source, kind: 'plugin' } : describe(kind, 'under the plugin folder');
  }
  // $BT_DIR/scripts/x.mjs: a shell variable the skill sets at run time, not a path on this machine.
  if (token.startsWith('$')) return { ok: false, reason: 'a shell variable, not a path on this machine', category: 'placeholder' };

  const expanded = token.startsWith('~') ? join(home.root, token.slice(1)) : token;
  if (isAbsolute(expanded) || /^[A-Za-z]:[\\/]/.test(expanded)) {
    const disk = resolve(expanded);
    if (inside(skill.baseDir, disk)) {
      const kind = await isFile(disk);
      return kind === true ? { ok: true, disk, base: skill.baseDir, label: baseLabel, kind: baseKind } : describe(kind, '');
    }
    if (inside(claudeDir, disk)) {
      const kind = await isFile(disk);
      return kind === true ? { ok: true, disk, base: claudeDir, label: 'home', kind: 'home' } : describe(kind, 'under ~/.claude');
    }
    return { ok: false, reason: 'absolute path outside the project and ~/.claude; not opened', category: 'not-opened' };
  }

  const parts = token.split(/[\\/]/);
  // Each attempt resolves against `resolveBase`; a hit is reported against `base`, so a file reached two ways gets one output path.
  const attempts: { resolveBase: string; base: string; label: string; kind: 'skill' | 'project' | 'plugin' | 'home' }[] = [
    { resolveBase: skill.diskPath, base: skill.diskPath, label: baseLabel, kind: 'skill' },
    { resolveBase: skill.baseDir, base: skill.baseDir, label: baseLabel, kind: baseKind },
    { resolveBase: claudeDir, base: claudeDir, label: 'home', kind: 'home' },
  ];
  // `skills/<name>/scripts/x.py` written from the project's `.claude` folder, where the skill lives.
  const dotClaude = dirname(dirname(skill.diskPath));
  if (baseKind === 'project' && dotClaude !== skill.baseDir) attempts.splice(2, 0, { resolveBase: dotClaude, base: skill.baseDir, label: baseLabel, kind: 'project' });
  // `.claude/workflows/x.js` written from a home folder's point of view.
  if (parts[0] === '.claude') attempts.push({ resolveBase: home.root, base: claudeDir, label: 'home', kind: 'home' });
  let sawFolder = false;
  let climbed = false;
  let stayedNearby = false;
  for (const attempt of attempts) {
    const disk = resolve(attempt.resolveBase, ...parts);
    if (!inside(attempt.resolveBase, disk)) {
      // `../other/scripts/x.sh` from the skill folder: a sibling in the same plugin, project or skills folder is fine.
      if (attempt.kind === 'skill' && inside(skill.baseDir, disk)) {
        stayedNearby = true;
        const kind = await isFile(disk);
        if (kind === true) return { ok: true, disk, base: siblingBase, label: baseLabel, kind: baseKind };
        if (kind === 'folder') sawFolder = true;
      } else climbed = true;
      continue;
    }
    if (attempt.resolveBase === home.root && !inside(claudeDir, disk)) { climbed = true; continue; }
    const kind = await isFile(disk);
    if (kind === true) return { ok: true, disk, base: attempt.base, label: attempt.label, kind: attempt.kind };
    if (kind === 'folder') sawFolder = true;
  }
  if (climbed && !stayedNearby) return { ok: false, reason: 'resolves outside the skill folder, its project and ~/.claude; not opened', category: 'not-opened' };
  return sawFolder ? { ok: false, reason: 'is a folder', category: 'folder' } : { ok: false, reason: 'not found in the skill folder, its project or ~/.claude', category: 'not-found' };
}

async function skillText(skill: SkillEntry): Promise<string> {
  try { return await readFile(join(skill.diskPath, 'SKILL.md'), 'utf8'); }
  catch { return ''; } // copied a moment ago; if it vanished, the skill's own copy records that
}

export async function collectLinked(skills: readonly SkillEntry[], home: Home, copier: Copier, report: Report, options: { includeClaudeMd: boolean }): Promise<number> {
  const byDisk = new Map<string, CopiedExtra>();
  const labelByRoot = new Map(home.projects.map((p) => [p.root, p.label] as const));
  for (const skill of skills) {
    const projectLabel = labelByRoot.get(skill.baseDir);
    const miss = (reference: string, reason: string, category: MissCategory): void => { report.linkedMisses.push({ skill: skill.name, source: skill.source, reference, reason, disqualifies: disqualifies(reference, category) }); };
    for (const token of pathTokens(await skillText(skill))) {
      const banned = neverCollected(token, options.includeClaudeMd);
      if (banned !== undefined) { miss(token, banned, 'never-collected'); continue; }
      const resolution = await resolveToken(token, skill, home, projectLabel);
      if (!resolution.ok) { miss(token, resolution.reason, resolution.category); continue; }
      const bannedDisk = neverCollected(resolution.disk, options.includeClaudeMd);
      if (bannedDisk !== undefined) { miss(token, bannedDisk, 'never-collected'); continue; }
      if (inside(skill.diskPath, resolution.disk)) continue; // already copied with the skill
      if ((resolution.kind === 'project' || resolution.kind === 'plugin') && !insideMachinery(resolution.base, resolution.disk)) { miss(token, 'found, not copied: application source outside .claude, scripts, workflows, hooks, bin or tools', 'not-copied'); continue; }
      const existing = byDisk.get(resolution.disk);
      const who = `${skill.name} (${skill.source})`;
      if (existing !== undefined) { if (!existing.referencedBy!.includes(who)) existing.referencedBy!.push(who); continue; }
      const relInBase = relative(resolution.base, resolution.disk).split(sep).join('/');
      const outputPath = `linked/${resolution.label}/${relInBase}`;
      const outcome = await copier.copy(resolution.disk, outputPath);
      const readFrom = displayPath(home, resolution.disk);
      if (!outcome.ok) { miss(token, outcome.reason, 'not-copied'); continue; }
      const extra: CopiedExtra = { kind: 'linked', source: resolution.label, readFrom, outputPath, referencedBy: [who] };
      byDisk.set(resolution.disk, extra);
      report.extras.push(extra);
    }
  }
  return byDisk.size;
}
