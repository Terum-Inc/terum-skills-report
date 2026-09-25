/**
 * What the run learned, accumulated by every stage and written out by the manifest writers and the
 * screen. Nothing in here may carry a full path, a username, a hostname, a session id or any
 * transcript content (spec §5.5, §2.6); every stage writes `~`-relative or label-relative names.
 */
import type { Problem } from './home.js';

export interface SkillEntry {
  name: string;
  /** `home`, `project-<label>` or `plugin-<marketplace>-<plugin>@<version>`. */
  source: string;
  /** Where it was read, written for a human: `~/.claude/skills/<name>` or `<label>/.claude/skills/<name>`. */
  readFrom: string;
  /** Folder inside the output, forward slashes. */
  outputDir: string;
  /** Files copied, output-relative. */
  files: string[];
  /** sha256 over the sorted (relative path, file sha256) pairs; two skills with equal hashes are identical. */
  contentHash: string;
  /** Characters in SKILL.md, for `skill_text_tokens` (spec §3.1). */
  skillTextChars: number;
  /** Files inside the folder that were not copied, with the reason. */
  skipped: Problem[];
  /** Full path of the folder on disk. Read only; never written out. */
  diskPath: string;
  /** Full path of the base for relative references (project root, plugin root, or home .claude). */
  baseDir: string;
}

export interface CopiedExtra {
  kind: 'command' | 'agent' | 'claude-md' | 'linked';
  source: string;
  readFrom: string;
  outputPath: string;
  /** For `linked`: the skills that referenced it. */
  referencedBy?: string[];
}

export interface LinkedMiss {
  skill: string;
  source: string;
  reference: string;
  reason: string;
}

export interface Redaction {
  outputPath: string;
  line: number;
  rule: string;
  name: string;
  hint: string;
}

export interface GitFacts {
  outputPath: string;
  firstCommit: string;
  lastCommit: string;
  authors: number;
}

export interface UsageSummary {
  /** `read`, `skipped-by-flag` or `no-session-data`. */
  status: 'read' | 'skipped-by-flag' | 'no-session-data';
  projectFolders: number;
  sessions: number;
  headlessSessionsSkipped: number;
  subagentTranscripts: number;
  filesSkipped: Problem[];
  linesSkipped: number;
  firings: number;
  sessionsWithFirings: number;
  firstDay: string | undefined;
  lastDay: string | undefined;
}

export interface LocationCount {
  /** For the screen's "Reading" block: `~/.claude/skills`, `~/dev/api/.claude/skills`, ... */
  location: string;
  detail: string;
}

export interface Environment {
  claudeCodeVersion: string | undefined;
  os: string;
  shell: string | undefined;
  node: string;
  mcpServers: string[];
  mcpServersByProject: Record<string, string[]>;
  hookEvents: string[];
  hookCommands: string[] | undefined;
  plugins: { id: string; version: string; scope: string; enabled: boolean | undefined; skills: number }[];
}

export interface Report {
  version: string;
  commit: string;
  sha256: string;
  command: string;
  startedAt: string;
  flags: { usage: boolean; includeHooks: boolean; includeClaudeMd: boolean; hashLabels: boolean };
  outputFolder: string;
  /** A `file://` link to the real output folder, for the screen only: it carries the real home path, so it is never written into the bundle (spec §5.5). */
  outputFolderUrl: string;
  desktopFallback: boolean;
  skills: SkillEntry[];
  extras: CopiedExtra[];
  linkedMisses: LinkedMiss[];
  redactions: Redaction[];
  /** Files copied without a redaction scan (binary), output-relative. */
  unscanned: string[];
  git: GitFacts[];
  gitProblems: Problem[];
  usage: UsageSummary;
  environment: Environment;
  locations: LocationCount[];
  problems: Problem[];
}

export const uniqueByContent = (skills: readonly SkillEntry[]): number => new Set(skills.map((s) => s.contentHash)).size;

export const redactedFiles = (redactions: readonly Redaction[]): number => new Set(redactions.map((r) => r.outputPath)).size;
