# terum-skills-report

One offline command that gathers your Claude Code skills, the helper scripts they reference and
counts of how often each skill was used, and writes all of it to a folder on your desktop. You read
the folder, delete anything you do not want to send, zip it yourself and send it to your Terum
contact. Terum evaluates the skills and sends your company a free skills report.

```
npx -y terum-skills-report@1.0.0
```

The command names an exact version, never `latest`, so the code you read is the code that runs.
Releases are published with npm provenance, which links the published file to the source commit.

## What it does

- **Runs offline.** No telemetry, no update check, no upload. Nothing is installed or changed on
  your machine. The only footprint is npm's own download cache, as with anything run through npx.
- **Ignores the folder you run it in.** It starts from your home folder and finds your project
  repositories from the list Claude Code itself keeps in `~/.claude.json`.
- **Copies skill files.** `~/.claude/skills`, each project's `.claude/skills`, and the skills inside
  installed plugins, plus `commands/` and `agents/` at home and project level, plus scripts a skill's
  `SKILL.md` references by path. A referenced file in a project is copied only from skill machinery
  folders (`.claude/`, `scripts/`, `workflows/`, `hooks/`, `bin/`, `tools/`); application source a
  skill merely mentions is listed as found and not copied.
- **Never copies, whatever references them:** `.env` files, `settings.json` and MCP configuration,
  credential and key files, session transcripts, log files, and `CLAUDE.md` unless you pass
  `--include-claude-md`.
- **Reads session transcripts locally and writes counts only.** From `~/.claude/projects` it derives
  how often each skill fired, by whom, at what token cost, and per-session totals. No transcript
  content is copied. Session ids are hashed with a salt that is never written; transcript folder
  names, which contain project paths, are never written either.
- **Redacts secrets and reports every redaction.** A value with a known shape (Anthropic, OpenAI,
  GitHub, AWS and Slack keys, signed web tokens, private-key blocks, email addresses) or a
  secret-shaped literal assigned to a name like `password`, `api_key` or `Authorization` is replaced
  with `[REDACTED:<rule>]`. Only the value is replaced; the variable name and the line stay.
  `FLAGGED.md` lists file, line, rule, name and a short hint, never the value. A secret with no known
  shape under an innocent name is not caught: read the folder before you zip it.
- **Leaves no identity in the output.** No username, hostname, machine id, email or full home path,
  in any spelling.
- **Counts every failure and stops for none.** An unreadable file, a git command that times out, a
  script that is not where a skill said: each is listed with a reason in `MANIFEST.md`.
- **Git facts, no names.** For each copied skill file in a repository: first and last commit date
  and how many people committed it, as a number.

## The output folder

```
~/Desktop/terum-skills-report-<date>/
├── MANIFEST.md        read this first: what is inside, in plain English, with counts
├── manifest.json      the same, machine-readable, with a sha256 per file
├── FLAGGED.md         every redaction, by file and line, for you to confirm
├── collector.txt      collector version, its sha256, source commit, exact command, time
├── skills/            home/, project-<label>/, plugin-<marketplace>-<plugin>@<version>/
├── linked/            scripts a skill references, by label
├── commands/ agents/
└── usage/             summary.csv, firings.csv, sessions.csv
```

The screen ends with a `file://` link to this folder. Ctrl+click it (Cmd+click on a Mac) to open it
in Explorer or Finder.

## Flags

| Flag | Effect |
|---|---|
| `--out <dir>` | write somewhere other than the desktop |
| `--no-usage` | do not read session transcripts; the manifest says so |
| `--include-hooks` | include hook command lines from `settings.json` (off by default: they carry paths) |
| `--include-claude-md` | include project `CLAUDE.md` and rule files (off by default: internal context) |
| `--hash-labels` | name projects by a hash instead of the folder name |
| `--json` | print the summary as one JSON object |

## Verifying what you run

```
npm view terum-skills-report@1.0.0 dist.integrity
npm audit signatures
```

The published file is `dist/index.js`, one bundled JavaScript file with no dependencies. Its sha256
and source commit are printed on the first line of the run and written to `collector.txt`.

## Development

```
npm ci
npm run lint && npm run typecheck && npm test
npm run build            # dist/index.js
node dist/index.js --out /tmp/report
```

The contract is `docs/spec.md`; `docs/spec-readable.md` is its plain-English companion,
`docs/decision-walk.md` records every design fork and its ruling, and `docs/build-notes.md` records
what the build refined and what a first real run changed. Two modules are copied from
[terum-skills](https://github.com/Terum-Inc/terum-skills) with their origin in a comment.

The leak test (`src/__tests__/leak.test.ts`) runs the whole collector against a planted home folder
and asserts that nothing planted reaches the output. Keep it green.

## Licence

Apache-2.0.
