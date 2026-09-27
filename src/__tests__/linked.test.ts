import { describe, expect, it } from 'vitest';
import { isScriptLike, pathTokens } from '../lib/linked.js';

describe('pathTokens', () => {
  it('finds relative, dotted, home, plugin-root and absolute path tokens once each', () => {
    const text = [
      'Run `scripts/run.sh` first, then `node .claude/workflows/helper.js` and ./scripts/run.sh again.',
      'Python: `python $CLAUDE_PLUGIN_ROOT/scripts/g.py` or `${CLAUDE_PLUGIN_ROOT}/scripts/absent.py`.',
      'Home: ~/.claude/hooks/x.js; parent: ../shared/schema.json; windows: C:\\tools\\run.ps1 and /etc/secrets.yaml. Never ../.env or .claude/.env.local.',
      'Skill folder: `<skill-dir>/scripts/run.sh`, `${CLAUDE_SKILL_DIR}/scripts/absent.py` and `$SKILL_DIR/../sibling/s.sh`; a placeholder: `<worktree>/report.json`; an argument: `<skill-path>` alone.',
      'Variables and braces: `$BT_DIR/scripts/bb-capture.mjs`, `{SKILL_DIR}/scripts/extract_page.mjs`, `{WORKSPACE}/notes.md`.',
      'Docs: https://example.com/alpha/guide.md and file:///tmp/x.sh are links, not files.',
      'Not paths: e.g. v1.2, Node.js, npm/cli, src/lib (no extension), 1.2/3.4, user@host:path/x.sh.',
    ].join('\n');
    expect(pathTokens(text).sort()).toEqual([
      '$BT_DIR/scripts/bb-capture.mjs',
      '$CLAUDE_PLUGIN_ROOT/scripts/g.py',
      '$SKILL_DIR/../sibling/s.sh',
      '${CLAUDE_PLUGIN_ROOT}/scripts/absent.py',
      '${CLAUDE_SKILL_DIR}/scripts/absent.py',
      '../.env',
      '../shared/schema.json',
      './scripts/run.sh',
      '.claude/.env.local',
      '.claude/workflows/helper.js',
      '/etc/secrets.yaml',
      '<skill-dir>/scripts/run.sh',
      '<worktree>/report.json',
      'C:\\tools\\run.ps1',
      'scripts/run.sh',
      '{SKILL_DIR}/scripts/extract_page.mjs',
      '{WORKSPACE}/notes.md',
      '~/.claude/hooks/x.js',
    ]);
  });

  it('strips trailing punctuation and ignores globs and placeholders in angle brackets', () => {
    expect(pathTokens('See docs/spec.md, then (scripts/a.sh); and <path/to/file.md> or src/**/*.ts')).toEqual(['docs/spec.md', 'scripts/a.sh', 'path/to/file.md']);
  });
});

describe('isScriptLike', () => {
  it('counts files under scripts-type folders and shell scripts anywhere, whatever the case', () => {
    for (const ref of ['scripts/run.sh', '<skill-dir>/scripts/harden-state.mjs', '$CLAUDE_PLUGIN_ROOT/scripts/g.py', 'scripts/codex/rules/adversarial-tests.md', '{SKILL_DIR}/scripts/extract_page.mjs', '~/.claude/workflows/wf.js', 'bin/cli.js', 'Tools/Gen.PY', './deploy.sh', '~/bin/deploy.sh', 'C:\\absolute\\nowhere.ps1', 'ops/nightly.BAT']) {
      expect(isScriptLike(ref), ref).toBe(true);
    }
  });

  it('does not count application source, prose examples, data files or folders', () => {
    for (const ref of ['path/to/file.ts', 'lib/foo.ts', 'src/background.js', 'lib/phase1.ts', 'app/api/surfaces/route.ts', 'likely/source/file.py', '.planning/debug/CONVENTIONS.md', '~/.codex/config.toml', '/etc/secrets.yaml', '~/.pyenv', 'scripts.md/notes.txt', 'my-scripts/run.js', '<worktree>/report.json', '.claude/hooks/pre-write-checks.js', '.sh']) {
      expect(isScriptLike(ref), ref).toBe(false);
    }
  });
});
