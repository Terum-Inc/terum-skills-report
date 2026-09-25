---
title: skills report collector decision walk
date: 2026-09-24
north_star: Three engineers hand over their skills and honest usage numbers in ten minutes because they can see, in plain files, exactly what leaves their machine.
status: complete
deferred: []
---

# Skills report collector — Decision Walk

**North Star:** Three engineers hand over their skills and honest usage numbers in ten minutes because they can see, in plain files, exactly what leaves their machine.
**Field:** collecting files and usage counts from a customer's laptop for a free skills report. Watch words: "audit" (here, our offer's name, not an accounting review), "turn" (one exchange between a person and the model), "transcript" (Claude Code's saved record of a session), "hash" (a fixed-length fingerprint of a name that cannot be turned back into it).

Spec: `docs/spec.md` §11 forks F1–F5 and §2.4 opt-ins.

**Addendum, 2026-09-25 (Decisions 8–13):** publishing the package to npm from CI. Second North Star for that batch: Ajay pastes one command on his Mac and gets the folder, and anyone can check that the file he ran is the one built from the repo commit it names. Watch words: "provenance" (a signed note on npm saying which repo commit and CI run built the file), "trusted publishing" (npm letting a GitHub Actions run publish with no stored password or token), "tag" (a named bookmark on one commit in git), "unpublish" (removing a version from npm).

## Decision Ledger

| # | Decision | Impact | Importance | Verdict | Rationale (plain) | Trigger / Pointer |
|---|---|---|---|---|---|---|
| 1 | Usage counts: always on, or a flag (F5) | 6/10 | 6/10 | LOCK | Always read session records; `--no-usage` skips them and the manifest says so. | — |
| 2 | Which tokens belong to a firing (F1) | 7/10 | 6/10 | LOCK | The exchange it fired in, to the next human message; helper (subagent) work attached by agent id. | — |
| 3 | Package name (F4) | 6/10 | 5/10 | LOCK | `terum-skills-report`; matches the offer's name and reads as a report, not an inspection. | claim the npm name before build |
| 4 | Redaction: replace-and-report or flag-only (F3) | 5/10 | 4/10 | LOCK | Replace the secret value only, never the variable name or the line; report file, line, rule, name and a hint. | — |
| 5 | Project labels: folder name or hash (F2) | 3/10 | 3/10 | LOCK | Obvious — the report's ownership section needs the repo name; a hash gives nothing to hang a finding on. `--hash-labels` exists for a nervous customer. | — |
| 6 | Hook commands: off by default (§2.4) | 3/10 | 2/10 | LOCK | Obvious — hook commands carry paths, and the spec bans paths from the bundle by default. | — |
| 7 | Project CLAUDE.md files: off by default (§2.4) | 3/10 | 2/10 | LOCK | Obvious — project instructions are internal context, and the spec's default is that only skill material leaves. | — |
| 8 | How the package first comes to exist on npm | 9/10 | 8/10 | LOCK | A placeholder 0.0.1 published by login holds the name; 1.0.0 is published by the workflow with trusted publishing, no token stored. | remove the placeholder within 72 h (D10) |
| 9 | Verify the registry before tagging | 4/10 | 4/10 | LOCK | The workflow reads the commit back from npm and tags only when it equals the released commit. | — |
| 10 | Placeholder cleanup | 3/10 | 2/10 | LOCK | Remove 0.0.1 within 72 hours of publishing, while still logged in; deprecate only if the window is missed. | within 72 h of the placeholder publish |
| 11 | Which npm CLI version the workflow installs | 2/10 | 1/10 | LOCK | Obvious — 11.11.1 is the pin terum-skills' releases prove every week; newest is a guess. | — |
| 12 | A human approve step on the `npm` environment | 2/10 | 2/10 | LOCK | Obvious — matches the terum-skills ruling that a release has provenance and a human approval. | — |
| 13 | What the placeholder does if run unpinned | 1/10 | 1/10 | LOCK | Obvious — prints the pinned command and exits with an error rather than silently doing nothing. | — |
| 14 | How the screen points at the output folder | 3/10 | 2/10 | LOCK | Obvious — a plain `file://` link is the one form every common terminal makes clickable; the bundle is unchanged. | — |

---

## Decision 1 — Usage counts: always on, or a flag (F5)

**Verdict: LOCK** · **Impact: 6/10** — shapes what the command opens on every customer machine and what every report can claim · **Importance: 6/10** — both options defensible; the wrong one loses the cost story or an engineer's trust

### Plain English
- **Where we are:** the command reads the engineer's saved session records to count skill firings and their cost. Those are the most private files on the machine; the rule is they are opened only to produce counts.
- **The question:** read them every run, or only when asked?
- **Options:**
  - **A — Always read, `--no-usage` to skip.** Counts on every run; the wary engineer has an exit. *(decides: cost and time in the report by default)*
  - **B — Only read with `--usage`.** Files-only default. *(decides: least-trusting engineer never sees the records touched; most reports arrive without cost numbers)*
- **Recommendation:** A. Without usage the report is an inventory, and the North Star names honest usage numbers as half of what we collect.
- **Impact (6/10):** every customer machine and every report claim · **Importance (6/10):** a real trade between the cost story and trust at the screen
- **The call:** Ryan, 2026-09-24: always read. Fits the North Star; the skip switch keeps the ask honest.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — always read, skip switch | 3 — spec §2.3 reads by default; Terum ruling 2026-09-24 accepted locally derived usage counts as a target | 1 — a skipped run writes header-only CSVs, the same path as a missing transcripts folder | the cost story sells the report |
| B — only with `--usage` | 1 — spec silent on a files-only default; the plan's headline needs hours and spend | 1 — same fallback | first customers refuse to let records be opened |

### Technical
- **Files / code paths:** transcript scanner and the three CSV writers behind one boolean; manifest records which way it ran so a files-only bundle is labelled, not mistaken for a machine with no sessions.
- **Migration / schema:** none.
- **Effort / blast radius:** a flag and a manifest line either way.
- **Grounding findings:** none — conceptual.

---

## Decision 2 — Which tokens belong to a firing (F1)

**Verdict: LOCK** · **Impact: 7/10** — the definition is baked into every bundle and report headline; changing it later makes old and new numbers incomparable · **Importance: 6/10** — the options produce very different numbers and a plausible person could pick any

### Plain English
- **Where we are:** each firings row says what a skill firing cost in tokens. Tokens are spent continuously, so a line must be drawn around the part that counts as the skill's. Helpers the skill launches (subagents) do work in separate records that link back to the parent by an agent id.
- **The question:** which tokens does a firing own?
- **Options:**
  - **A — The exchange it fired in.** From the firing to the next message the human types, plus helper work launched inside that window. Injected skill text and tool results do not count as the human speaking. *(decides: charged only for work it could have touched; a floor, never an accusation)*
  - **B — Until the next skill fires.** *(decides: long sessions inflate the number with unrelated work)*
  - **C — Rest of the session.** *(decides: a minute-one firing owns a two-hour session; two firings overlap)*
- **Recommendation:** A. The cost claim survives a sceptical tech lead only if every number is one they cannot argue down.
- **Impact (7/10):** every bundle and headline · **Importance (6/10):** very different numbers, all plausible
- **The call:** Ryan, 2026-09-24: A. Fits the North Star: the numbers stay honest.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — the exchange, helpers by agent id | 3 — spec §3.1 default; §5.6 never imply fuller coverage than was read | 2 — new turn-boundary logic; injected skill text mistaken for a human message closes the window early and undercounts | the report must survive a hostile reader |
| B — until next skill fires | 1 — spec silent; against §2.3's rule that every column describes a firing | 1 — simple scan | one skill per session |
| C — rest of session | 1 — same; overlapping ownership | 1 — simplest | nobody reads per-firing numbers |

### Technical
- **Files / code paths:** the turn machine copied from `src/lib/misses/harvest.ts` (human message = user record with `promptSource` and no `isMeta`; tool-result-only records are plumbing) defines the window. Helper transcripts at `<session>/subagents/agent-<id>.jsonl` carry `sessionId` and `agentId`; the parent record referencing that `agentId` sits inside a turn and places the helper's tokens.
- **Migration / schema:** the `firings.csv` columns are now fixed; `sessions.csv` gains `subagent_sessions`.
- **Effort / blast radius:** turn logic exists; the agent-id join is new, about a day inside the two-day usage estimate.
- **Grounding findings:** verified 2026-09-24 on this machine against a session with five helper launches; helper files carried the parent session id and an agent id, and the parent transcript referenced each agent id.

---

## Decision 3 — Package name (F4)

**Verdict: LOCK** · **Impact: 6/10** — a public package name is hard to move once it is in customer documents and pasted commands · **Importance: 5/10** — brand intent, which only Ryan holds; the code does not differ

### Plain English
- **Where we are:** the package name is the first word of ours the engineer reads. The 2026-09-23 decision named the offer a Skills Report or Health Check, not an audit, so the customer feels helped rather than judged.
- **The question:** what does the engineer type?
- **Options:**
  - **A — `terum-skills-report`.** Names what they get back. *(decides: matches the offer's name; reads as a report, not an inspection)*
  - **B — `terum-audit`.** Shorter. *(decides: honest to an engineer, but a forwarded command reads as being inspected)*
- **Recommendation:** A. The person typing is the person whose trust we most need, and length is not a cost when the command is pasted.
- **Impact (6/10):** every customer instruction points at the name · **Importance (5/10):** brand intent
- **The call:** Ryan, 2026-09-24: "report is better." Fits the North Star.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — `terum-skills-report` | 3 — Terum record 2026-09-23, present as a Skills Report or Health Check rather than lead with audit | 0 — a name | first impression outweighs brevity |
| B — `terum-audit` | 1 — that decision was about the offer's name; the spec carried this as a default only | 0 — a name | sales conversations already say audit |

### Technical
- **Files / code paths:** package name, the output folder `terum-skills-report-<date>/`, `collector.txt`, every command in the spec and the customer page. Spec §4, §8.1 and §3 need the rename in rev 2.
- **Migration / schema:** none.
- **Effort / blast radius:** none; a find-and-replace in the spec before build.
- **Grounding findings:** `terum-skills-report` returned not-found on npm 2026-09-24; re-check and publish a placeholder to hold it.

---

## Decision 4 — Redaction: replace-and-report or flag-only (F3)

**Verdict: LOCK** · **Impact: 5/10** — shapes what leaves on every run; the code is reversible, a leaked secret is not · **Importance: 4/10** — one option plainly safer; the loser costs a few not-evaluable skills

### Plain English
- **Where we are:** before a copied file goes into the folder, each line is checked against patterns for passwords, keys and tokens. Secrets never leave; the engineer's own review is the second line of defence, never the only one.
- **The question:** on a match, change the copy or only point at it?
- **Options:**
  - **A — Replace and report.** The matched value becomes a placeholder; `FLAGGED.md` lists it. *(decides: a secret the engineer misses in review still does not leave; a wrong match makes that skill not evaluable)*
  - **B — Flag only.** Copy untouched; the engineer edits by hand. *(decides: scripts arrive intact, but a skimmed-past secret is on our side)*
- **Recommendation:** A. A leaked credential is the customer's irreversible problem; a broken script is a skill honestly marked not evaluable.
- **Impact (5/10):** every run · **Importance (4/10):** mild preference
- **The call:** Ryan, 2026-09-24: A, refined. Replace the **value only**, never the variable name or the whole line. Detection is two tests on literal values: a known value shape from a published pattern list (Anthropic `sk-ant-`, OpenAI `sk-`, GitHub `ghp_`, AWS `AKIA`, Slack `xoxb-`, signed web tokens `eyJ`, private-key blocks), or a name containing key, secret, token, password, passwd, credential or auth followed by `=` or `:` and a literal. Reading a variable (`$ANTHROPIC_API_KEY`, `os.environ[...]`, `process.env.X`) is never flagged. Placeholder is `[REDACTED:<rule>]` in the value span; private-key body lines are replaced one for one so line numbers hold. `FLAGGED.md` records file, line, rule, variable name and a recognisable hint (prefix and length), never the value. A secret with no known shape and an innocent name is not caught; the manifest says so.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — replace value, report | 3 — spec §5.4 default; §2.6 secrets never collected; Terum ruling 2026-09-23, the collector itself excludes secrets | 2 — a false match on a value assigned to a name like `password` breaks a script that then reads not evaluable | a leaked secret is worse than a lost eval |
| B — flag only | 1 — relies on the human alone, against the 2026-09-23 ruling | 1 — no file change; failure is a missed line leaving | every script must arrive runnable |

### Technical
- **Files / code paths:** redaction pass over every copied file before it is written to the output folder; `FLAGGED.md` writer; manifest marks redacted files so the eval treats those skills as not evaluable.
- **Migration / schema:** none.
- **Effort / blast radius:** about a day; the pattern list is vendored from a published set (gitleaks is the candidate; licence to check), plus the name-based assignment rule and private-key blocks.
- **Grounding findings:** none — conceptual.

---

## Decision 5 — Project labels: folder name or hash (settled without asking)

**Verdict: LOCK** · **Impact: 3/10** — a label string in the manifest and folder names; re-running the command changes it · **Importance: 3/10** — mild preference; the loser costs one finding

Folder name picked, with a `--hash-labels` flag for a customer who asks, because the report's ownership and duplicates findings need to say which repository a skill lives in, and a repo name is not personal identity under the spec's no-identity rule.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| Folder base name (picked) | 3 — matches the collection plan's report sections "inventory, ownership, duplicates" and spec §5.5 "project labels are the folder's base name" | 0 — a string swap |
| Hash | 1 — spec §5.5 bans username, hostname, machine id and home path, and is silent on repo names | 0 — a string swap |

### Technical
- **Files / code paths:** manifest writer, folder naming in `skills/project-<label>/` and `linked/<label>/`.
- **Effort / blast radius:** one function; the flag is a boolean.

---

## Decision 6 — Hook commands: off by default (settled without asking)

**Verdict: LOCK** · **Impact: 3/10** — one flag; reversible by re-running · **Importance: 2/10** — one option is plainly right

Off by default, on with `--include-hooks`, because hook command lines carry file paths and sometimes credentials, and the spec's no-identity and never-collected rules exclude paths and secrets by default; the eval loses some token attribution accuracy, which the report states.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| Off by default, flag to include (picked) | 3 — spec §2.4 "the hook commands themselves are opt-in"; §2.6 never collects `.env` and configuration | 0 — a default |
| On by default | 1 — spec silent on hooks as a default target; §5.5 bans full home paths, which hook commands routinely contain | 0 — a default |

### Technical
- **Files / code paths:** settings reader; `hooks` key of `~/.claude/settings.json`, event names only unless flagged.

---

## Decision 7 — Project CLAUDE.md files: off by default (settled without asking)

**Verdict: LOCK** · **Impact: 3/10** — one flag · **Importance: 2/10** — one option is plainly right

Off by default, on with `--include-claude-md`, because project instruction files are internal context about the customer's codebase, and the 2026-09-24 ruling accepted skill files, referenced scripts, usage counts and limited environment metadata as the collection targets, not project instructions.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| Off by default, flag to include (picked) | 3 — spec §2.4 "opt-in [default: off]"; Terum ruling 2026-09-24 on accepted collection targets | 0 — a default |
| On by default | 1 — spec silent; the eval benefits, but the ruling's target list does not include them | 0 — a default |

### Technical
- **Files / code paths:** project scanner; reads `<project>/CLAUDE.md` and `.claude/rules/` only when flagged.

---

## Decision 8 — How the package first comes to exist on npm (2026-09-25)

**Verdict: LOCK** · **Impact: 9/10** — a published version is permanent public record and its number can never be reused · **Importance: 8/10** — a visible placeholder, a stored publish token, or a broken promise pull in different directions, and only Ryan can weigh the account actions

### Plain English
- **Where we are:** npm refuses trusted publishing (a GitHub Actions run publishing with no stored password or token) for a package that does not exist yet; the Trusted Publisher setting lives on the package's settings page. Spec §5.1 promises the published file carries a signed note (provenance) linking it to the source commit, which only a publish from CI can produce.
- **The question:** how does `terum-skills-report` first come to exist?
- **Options:**
  - **A — Placeholder first, then the real release from CI.** Ryan logs in to npm on his machine, a 0.0.1 that only prints the pinned command is published, Ryan allows the workflow on npmjs.com, 1.0.0 is dispatched. *(decides: 1.0.0 ships as designed and no publish token is ever stored; a throwaway version is visible for a few hours)*
  - **B — A publish token in GitHub for the first release only.** *(decides: no placeholder ever exists; a token with publish rights sits in GitHub until revoked, plus two workflow edits)*
  - **C — Publish 1.0.0 from the laptop.** *(decides: fastest, but no provenance is possible from a laptop; breaks §5.1 for the pinned version)*
- **Recommendation:** A — the team's standing choice (publish only through the workflow with trusted publishing, ryanliu, 2026-09-25), what Ryan did for terum-skills itself on 2026-09-05, and Decision 3's grounding note already said to publish a placeholder to hold the name.
- **Impact (9/10):** permanent public record · **Importance (8/10):** only Ryan can weigh the account actions
- **The call:** Ryan, 2026-09-25: A. Fits the North Star: 1.0.0 is built and published by CI, so the signed note names the commit, and nothing with publish rights is stored anywhere.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — placeholder, then CI | 4 — §5.1 "published with npm provenance so the package links to the exact source commit"; the 2026-09-25 workflow-only ruling | 1 — forgetting to remove the placeholder, which only prints the real command | Ryan can spend ten minutes at the keyboard |
| B — token in CI | 3 — provenance and the CI publish match §5.1, but a stored token is what trusted publishing was chosen to avoid | 2 — a publish-capable token in GitHub secrets until revoked; two workflow edits | no placeholder is acceptable under the name |
| C — laptop publish | 0 — contradicts §5.1 | 1 — the README's verification claim is false until fixed | speed beats the commit link |

### Technical
- **Files / code paths:** none in the repo. The placeholder is three files outside it: `package.json` at 0.0.1 with a `bin`, `index.js` that prints `npx -y terum-skills-report@1.0.0` and exits 1, a README saying the same. `release.yml` is unchanged; PR #9 pinned npm 11.11.1 so trusted publishing works on the Node 22 runner (Node 22 bundles npm 10.9.9, below the 11.5.1 minimum).
- **Migration / schema:** none.
- **Effort / blast radius:** Ryan: `npm login`, one two-factor prompt for the placeholder publish, one npmjs.com setting (GitHub Actions; user `ryanliu-terum`; repository `terum-skills-report`; workflow `release.yml`; environment `npm`; allow `npm publish`, since entries created after 2026-09-03 default to stage-only), one approve click on the run, then `npm logout`. Decision 10 removes the placeholder.
- **Grounding findings:** npm docs (trusted publishing needs npm 11.5.1+; stage-only default), npm/cli#8544 (a first publish through trusted publishing is not supported), local npm is 11.11.0 (`npm trust` needs 11.15 and an existing package anyway), `npm view terum-skills-report` returned 404 on 2026-09-25 so the name is still free.

---

## Decision 9 — Verify the registry before tagging (2026-09-25)

**Verdict: LOCK** · **Impact: 4/10** — one workflow step, reversible in minutes, no data involved · **Importance: 4/10** — mild: A's failure is loud and fixable with one command; B's failure is a tag nobody verified, which the by-hand check would catch anyway

### Plain English
- **Where we are:** the workflow created the `v<version>` tag the moment `npm publish` returned success. terum-skills' own workflow first waits until npm serves the version with the released commit recorded against it, then tags. Rule: §5.1, the package links to the exact source commit.
- **The question:** should the workflow read the commit back from npm before it tags, or tag on publish success and leave the check to a person afterwards?
- **Options:**
  - **A — The workflow asks npm before it tags.** After publishing, it reads the new version's recorded commit from npm and waits up to two minutes for it to equal the commit being released; only then does it tag. *(decides: the tag can never point at a commit npm does not name; a slow registry could leave the version published but untagged until someone tags by hand)*
  - **B — Tag on publish success; check by hand after the run.** *(decides: no new workflow logic; the check depends on a person remembering it on every release)*
- **Recommendation:** A, narrowly — the repo rule is "prefer a gate to a paragraph", and terum-skills already does this. Belt and braces: a misconfigured Trusted Publisher fails the publish itself.
- **Impact (4/10):** one step · **Importance (4/10):** mild either way
- **The call:** Ryan, 2026-09-25: A. Fits the North Star: the workflow itself proves the published file names the released commit before it bookmarks that commit.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — workflow checks npm before tagging | 3 — §5.1 "links to the exact source commit"; "prefer a gate to a paragraph"; terum-skills' release workflow does exactly this | 3 — new shell logic only a real publish exercises; a false timeout leaves the version published and untagged, a re-dispatch cannot fix it because the version exists, so the tag is pushed by hand | every release should prove the link, not just this one |
| B — tag on success, check by hand | 2 — publishing from the checkout is what records the commit; the hand check is a paragraph, not a gate | 0 — no change | the first run should be as simple as possible |

### Technical
- **Files / code paths:** `.github/workflows/release.yml`, one step between `npm publish` and `Tag`: read `npm view terum-skills-report@$EXPECTED gitHead` up to twelve times, ten seconds apart, until it equals `$GITHUB_SHA`, and require a non-empty `dist.integrity`; fail the job otherwise so no tag is created.
- **Migration / schema:** none.
- **Effort / blast radius:** one PR before the 1.0.0 dispatch; CI is trivially green; the step cannot be exercised without a real publish. Recovery if it false-fails: check npm by hand, then `git tag v<version> <sha> && git push origin v<version>`.
- **Grounding findings:** terum-skills `docs/contributing/release.md`: the publish job "waits until the registry serves this version with the integrity digest build recorded, a gitHead equal to the released commit, and an attestation". The collector's tag step ran unconditionally after publish.

---

## Decision 10 — Placeholder cleanup (2026-09-25)

**Verdict: LOCK** · **Impact: 3/10** — one registry entry, no code; only what the package page shows changes · **Importance: 2/10** — cosmetic either way; missing the window falls back to deprecation

### Plain English
- **Where we are:** once 1.0.0 is on npm, 0.0.1 is a leftover under the name. npm lets a version be removed within 72 hours of publishing if nothing depends on it; after that the usual path is marking it deprecated, which keeps it listed with a warning. A removed number can never be reused, which nobody wants here anyway.
- **The question:** after 1.0.0 is confirmed, remove 0.0.1 or mark it deprecated?
- **Options:**
  - **A — Remove it within 72 hours.** `npm unpublish terum-skills-report@0.0.1` while Ryan is still logged in, then `npm logout`. *(decides: the version list shows only real releases; a deadline and an irreversible command, for a version nobody wants back)*
  - **B — Mark it deprecated.** *(decides: nothing irreversible and no deadline; a stray version stays visible forever on a package whose pitch is "read exactly what you run")*
- **Recommendation:** A — the engineer who inspects the package page should see nothing to ask about. The pinned command is unaffected either way.
- **Impact (3/10):** one registry entry · **Importance (2/10):** cosmetic
- **The call:** Ryan, 2026-09-25: A. Fits the North Star: the package anyone inspects lists only the version they were told to run.

### Scores
| Option | Fit (0-4) | Bug risk (0-4) | Wins if |
|---|---|---|---|
| A — remove within 72 hours | 2 — implied by §5.1 "the version the engineer read is the version that runs" and the clean-inspection pitch; the spec is silent on cleanup | 1 — missing the window; falls back to B | the package page should show only real releases |
| B — deprecate | 1 — spec silent; a guess that a warning is enough | 0 — nothing irreversible | never run an irreversible npm command by hand |

### Technical
- **Files / code paths:** none. After the 1.0.0 run is verified: `npm unpublish terum-skills-report@0.0.1`, confirm `npm view terum-skills-report versions` lists only 1.0.0 and `dist-tags.latest` is 1.0.0, then `npm logout`.
- **Migration / schema:** none.
- **Effort / blast radius:** one command. If the window is missed: `npm deprecate terum-skills-report@0.0.1 "placeholder; run npx -y terum-skills-report@1.0.0"`.
- **Grounding findings:** docs.npmjs.com/policies/unpublish: a new package with no dependents can be unpublished "anytime within the first 72 hours after publishing"; "Once package@version has been used, you can never use it again."

---

## Decision 11 — Which npm CLI version the workflow installs (settled without asking)

**Verdict: LOCK** · **Impact: 2/10** — one pinned number in the workflow · **Importance: 1/10** — it decides itself

Pinned npm 11.11.1, the version terum-skills' release workflow installs, because it is proven with npm's token-free publish on this account every release; "newest" is a guess about a CLI nobody here has run. Node 22 bundles npm 10.9.9, below the 11.5.1 trusted publishing needs, so some pin was required (PR #9).

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| 11.11.1 (picked) | 3 — the pin terum-skills' release.yml exercises for every release | 0 — a version number |
| newest (`npm@latest`) | 1 — spec silent; assumes an untried CLI | 1 — an untested CLI on the publish path |

---

## Decision 12 — A human approve step on the `npm` environment (settled without asking)

**Verdict: LOCK** · **Impact: 2/10** — a repo setting, reversible in a minute · **Importance: 2/10** — the terum-skills ruling already made the call

Ryan is the required reviewer on the GitHub environment `npm` (deployment branch policy `main` only), so every release run waits for one approve click, matching the 2026-09-07 terum-skills ruling that a release provides provenance and human approval.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| required reviewer (picked) | 3 — Terum record 2026-09-07, "the release policy was intended to provide provenance and human approval" | 0 — a setting |
| no reviewer | 1 — the handoff called it optional; the spec is silent | 0 — a setting |

---

## Decision 13 — What the placeholder does if someone runs it unpinned (settled without asking)

**Verdict: LOCK** · **Impact: 1/10** — a throwaway file · **Importance: 1/10** — it decides itself

The placeholder prints the pinned command and exits with an error, so an unpinned `npx terum-skills-report` in the hours between the two publishes tells the person what to run instead of silently doing nothing.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| prints the command, exits 1 (picked) | 3 — §5.1 "the version the engineer read is the version that runs" | 0 — a print statement |
| empty package, no command | 1 — spec silent; silently does nothing | 0 — nothing runs |

---

## Decision 14 — How the screen points at the output folder (settled without asking)

**Verdict: LOCK** · **Impact: 3/10** — one line on the screen; nothing in the bundle changes · **Importance: 2/10** — one option works on every common terminal and the others do not

The `Written to` line prints a `file://` link to the real folder, because every common terminal (Windows Terminal, Terminal.app, iTerm2, VS Code) turns a URL into something to click and none of them did that for the `~/` spelling (Ryan asked for a clickable link, 2026-09-24). The link is the one place the real home path appears on the screen; §5.5 governs the bundle, which keeps the scrubbed spelling, and the bin test now allows the username on stdout inside that line only.

| Option | Fit (0-4) | Bug risk (0-4) |
|---|---|---|
| plain `file://` link (picked) | 3 — §4 "a folder they can open"; §5.5 bans identity in the bundle, not on the screen | 0 — Node's `pathToFileURL` builds it and the bin test pins it |
| hidden link codes some terminals understand (OSC 8) over the `~/` spelling | 1 — spec silent; Terminal.app and the plain Windows console show nothing to click | 1 — a terminal that prints the codes as text |
| keep the `~/` spelling | 0 — the ask was a link | 0 — no change |
