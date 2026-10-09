/**
 * The one screen the engineer sees (spec §4). Every count has a line they can check against a
 * folder they can open. Partial results print with counts, never disappear.
 */
import { USAGE_SENTENCE } from './manifest.js';
import { redactedFiles, uniqueByContent, type Report } from './report.js';

const num = (n: number, width = 6): string => String(n).padStart(width);

export function renderScreen(report: Report): string {
  const lines: string[] = [];
  // Locations are padded to the longest one so counts line up whatever the folder names are.
  const width = Math.max(40, ...report.locations.map((l) => l.location.length + 3));
  const pad = (label: string, w = width): string => label.padEnd(w);
  lines.push(`terum-skills-report ${report.version}  (sha256 ${report.sha256.slice(0, 4)}…${report.sha256.slice(-4)}, source: github.com/Terum-Inc/terum-skills-report @ ${report.commit.slice(0, 7)})`);
  lines.push('Runs offline. Nothing is sent anywhere. You review the folder, then zip and send it yourself.');
  lines.push('');
  lines.push('Reading');
  for (const location of report.locations) lines.push(`  ${pad(location.location)}${location.detail}`);
  const u = report.usage;
  if (u.status === 'skipped-by-flag') lines.push(`  ${pad('~/.claude/projects')}not read (--no-usage)`);
  else if (u.status === 'no-session-data') lines.push(`  ${pad('~/.claude/projects')}no session data on this machine`);
  else {
    lines.push(`  ${pad('~/.claude/projects')}${u.sessions} sessions, ${u.firstDay ?? '?'} to ${u.lastDay ?? '?'}`);
    if (u.filesSkipped.length > 0) lines.push(`  ${pad('')}  ${u.filesSkipped.length} file${u.filesSkipped.length === 1 ? '' : 's'} skipped   (reasons in MANIFEST.md)`);
    if (u.headlessSessionsSkipped > 0) lines.push(`  ${pad('')}  ${u.headlessSessionsSkipped} headless transcript${u.headlessSessionsSkipped === 1 ? '' : 's'} (evals, SDK) not counted`);
    lines.push(`  ${USAGE_SENTENCE.slice(0, USAGE_SENTENCE.indexOf('. ') + 1)}`);
    lines.push(`  ${USAGE_SENTENCE.slice(USAGE_SENTENCE.indexOf('. ') + 2)}`);
  }
  lines.push('');
  const linked = report.extras.filter((e) => e.kind === 'linked').length;
  lines.push(`${pad('Skills found', 18)}${num(report.skills.length)}   (${uniqueByContent(report.skills)} unique by content)`);
  const missingScripts = report.linkedMisses.filter((m) => m.disqualifies).length;
  lines.push(`${pad('Linked scripts', 18)}${num(linked)}   copied   ${report.linkedMisses.length} referenced but not found, ${missingScripts} missing script${missingScripts === 1 ? '' : 's'}   (listed in MANIFEST.md)`);
  if (u.status === 'read') lines.push(`${pad('Skill firings', 18)}${num(u.firings)}   across ${u.sessionsWithFirings} sessions`);
  lines.push(`${pad('Redacted lines', 18)}${num(report.redactions.length)}   in ${redactedFiles(report.redactions)} files   (see FLAGGED.md)`);
  if (report.problems.length > 0) lines.push(`${pad('Problems', 18)}${num(report.problems.length)}   recorded, none fatal   (listed in MANIFEST.md)`);
  lines.push('');
  lines.push(`Written to  ${report.outputFolderUrl}`);
  lines.push('  Click the link to open the folder (Ctrl+click on Windows, Cmd+click on a Mac).');
  if (report.desktopFallback) lines.push('  (no Desktop folder was found, so the folder is in your home folder)');
  lines.push('  MANIFEST.md   read this first');
  lines.push(`  FLAGGED.md    ${report.redactions.length} redaction${report.redactions.length === 1 ? '' : 's'} to confirm`);
  lines.push('  skills/  linked/  commands/  agents/  usage/summary.csv  usage/firings.csv  usage/sessions.csv');
  lines.push('');
  lines.push('Next');
  lines.push('  Open the folder. Delete anything you do not want to send.');
  lines.push('  Zip the folder and send it to your Terum contact.');
  lines.push('  This tool has not sent anything and will not. Nothing was installed or changed on this machine.');
  lines.push('  If your Desktop syncs to a cloud drive, this folder syncs with it; move it first if you would rather it did not.');
  lines.push('');
  return lines.join('\n');
}

/** `--json`: the same summary as one object (spec §4). */
export function renderJson(report: Report): string {
  const summary = {
    version: report.version,
    sha256: report.sha256,
    commit: report.commit,
    outputFolder: report.outputFolder,
    outputFolderUrl: report.outputFolderUrl,
    skills: report.skills.length,
    skillsUniqueByContent: uniqueByContent(report.skills),
    commands: report.extras.filter((e) => e.kind === 'command').length,
    agents: report.extras.filter((e) => e.kind === 'agent').length,
    linkedCopied: report.extras.filter((e) => e.kind === 'linked').length,
    linkedMissing: report.linkedMisses.length,
    linkedMissingScripts: report.linkedMisses.filter((m) => m.disqualifies).length,
    usage: report.usage,
    redactions: report.redactions.length,
    redactedFiles: redactedFiles(report.redactions),
    gitFiles: report.git.length,
    problems: report.problems.length,
  };
  return `${JSON.stringify(summary, null, 2)}\n`;
}
