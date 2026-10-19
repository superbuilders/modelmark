# AGENTS.md

Instructions for coding agents working in this repository.

## What modelmark is

`modelmark` records which coding agent (Claude Code, Codex, Pi) and which model
made each git commit. A `prepare-commit-msg` hook finds the agent by walking up
the process tree, reads the model and effort from the end of that agent's session log,
and appends an `Assisted-by: <agent>:<model>@<effort>` trailer. A pull request summary then
counts those trailers across the branch's commits. This is a single-package
Bun + TypeScript CLI.

## Commands

```bash
bun install                                # Install dependencies and prepare Husky
bun run typecheck                          # tsgo; allowed anywhere
bun run test <files or dirs>               # Named tests while working
bun run check                              # Hooks/CI only: typecheck, lint, format check
bun run check --pre-push                   # Also type-aware lint and knip
bun run knip                               # Compact unused-code report; config hints fail
bun src/cli.ts --version                   # Package version
bun src/cli.ts install|uninstall           # Add or remove the hook (node_modules line when package.json lists modelmark)
bun src/cli.ts doctor [--json]             # Check the setup and show the mark a commit would get
bun src/cli.ts summary [range] [--format F] # Count trailers across commits (default: this branch's); F is text, json, table or badges
bun src/cli.ts hook <msg-file> [source]    # Hidden: what the hook runs to append the trailer
bun run bump                               # Release: bump the version, commit, tag v<version>, push
bun scripts/lab list|run|status|probe      # Real-harness checks, here and on the Mac (scripts/lab/README.md)
```

## Validation Workflow

Hooks gate validation: pre-commit checks lockfile sync when dependency files
are staged, then secret-scans, lints and formats staged files. Pre-push runs
typecheck, lint, format validation, type-aware lint and knip in parallel.
Tests do not run in hooks: CI runs the full suite on every pull request and
push to `main`.

`bun run check` and unscoped test runs refuse outside hooks (`MODELMARK_HOOK`)
and CI (`CI=true`), naming the narrower commands to run instead. Mid-work, use
`bun run typecheck` and the test files for the code you changed. Do not repeat
the full linter/formatter passes before committing: the staged-file hook
fixes what it can.

Push with plain `git push`, not piped through `tail`, `head` or `grep`, which
can hide the hook's last result line. Read `tmp/pre-push.log` for complete
failure output rather than rerunning the checks. The check runner returns
3 for reported check failures; the pre-push hook distinguishes that from a
runner crash.

Never invoke `tsc` directly: use `bun run typecheck` (tsgo). Never bypass git
hooks with `--no-verify` without explicit permission.

## Tests

Unit tests colocate with their sources as `*.test.ts` using Vitest. The root
`vitest.config.ts` owns this single project's include glob and shared
invariants, not per-scenario configuration. Passing tests are silent; failing
tests retain console diagnostics.

### Test-support layout and doubles

Every `tests/` tree follows one depth rule: plumbing at the root, one concern
directory for an extra Vitest project, and other files in role directories:
`fakes/`, `stubs/`, `abilities/`, `questions/`, `tasks/`. Role directories hold
files, not further subtrees. Never create `mocks/` or a `helpers.ts` kitchen
sink. A concern root holds only `env.d.ts`, `setup.ts`, `global-setup.ts`,
`actors.ts`, `harness.ts`, or `seed.ts`.

Name a double for what it is. A `Fake*` class lives in a tests-tree `fakes/`
directory or inline in a test. Each shared fake module starts with a docblock
holding exactly one of `@fake owned` (fakes this repository's code),
`@fake platform` (a standard platform API) or `@fake vendor` (a third-party
API). An owned fake also declares `@certifiedBy <repo-relative path>`, a
`*.test.ts` contract suite that runs against the real code. Platform and vendor
fakes pin the type of the interface they replace and say in prose which tests
exercise the real thing. The three generic boundary rules enforce the layout,
the tags and where fakes live.

## Architectural Principles

- DRY: one source of truth for state; derive a value once. Before adding code,
  ask whether something can be deleted instead.
- Minimize code: delete stale code immediately, with no commented-out code
  "for later". Wait until the third use for a business-logic abstraction.
- Explicit over implicit: name things for what they do; prefer explicit
  parameters to global state. Comments explain why, not what.
- Minimize rules: prefer a deterministic rule that applies everywhere over
  thresholds and judgment calls.
- Fix warnings now; refactor as you go.
- TypeScript files use `kebab-case.ts`. Types live with their owner in
  `types.ts`, exported individually; do not invent a shared package in
  anticipation of consumers.
- A `constants.ts` holds pure values: literals and as-const derivations.
  Type-only imports are the one sanctioned edge. No value imports, calls or
  constructions: these run at import time and can bind the file to one
  runtime. Runtime objects live with their consumers (e.g. `patterns.ts`);
  derived types live in the sibling `types.ts`, never in `constants.ts`.

## Source layout

`src/` is layered, and each layer imports only from the layers below it:
`cli.ts`, then `commands/` (one folder per command), `agents/` (finding the
agent and reading its model), and `system/` (helpers with no agent knowledge:
the process table, reading a log from its end, git). Sibling folders do not
import each other unless `.oxlint/boundaries/layers.json` names the edge. The
`boundaries/layer-imports` rule enforces that map. A new folder inherits the
edges of its mapped ancestors; give it its own entry only when it needs an edge
they lack. Move code down a layer rather than adding an upward edge.

## How detection works

The agent is the nearest `claude`, `codex` or `pi` process above the hook,
from one `ps` call. Environment markers are only a fallback when the walk is
blocked, because they outlive their agent: a terminal opened from an agent, or
an agent started inside another, inherits them. Codex's sandbox hides its
parent processes, so its sandbox markers name it when the walk tops out.
An agent modelmark doesn't know names itself in `MODELMARK` (a whole mark,
`jojo:gpt-6.1-sol@high`). It wins over the markers but not over a supported
harness in the process tree, since a command run inside one inherits it.

The model comes from the agent's own session log, read from its end
(`system/tail.ts`), never from the model: Claude Code's
`<config>/projects/*/<CLAUDE_CODE_SESSION_ID>.jsonl` (or a newer subagent log
beside it), Codex's `sessions/**/rollout-*-<CODEX_THREAD_ID>.jsonl`
(`turn_context` records), and Pi's `PI_SESSION_FILE`, else `PI_MODEL`. The
effort sits in the same record as the model for Claude Code (`effort`) and Codex
(`payload.effort`); Pi sets `PI_REASONING_LEVEL` on each command. These formats
are undocumented; when one changes, the model reads as `unknown` (or the effort
is left off) and the agent is still recorded.

The hook never fails a commit. Merge commits get no trailer.

## Scripts

Scripts run under Bun, with one commander entrypoint per `scripts/<name>/index.ts`.
Keep entrypoints and `commands/` wiring thin. Logic and colocated tests live
in the program-root `lib/`, never a `lib/` nested in `commands/`. Private
helpers stay in that program's `lib/`; `scripts/lib/` is for helpers shared
across programs/configs. Read environment variables inside functions, not
at import time or in option defaults.

## The lab

`scripts/lab` drives the real harnesses (Claude Code, Codex, Pi) through
`git commit` in scratch repositories and checks the trailer each commit gets.
Unit tests use log records copied by hand; only the lab notices when a harness
update moves a field. Run `bun scripts/lab status` after a harness updates, and
`bun scripts/lab run --all --host both` before relying on a new version. A run
records the versions that passed in `tested-versions.json` and the README's
tested-versions table; commit both. Adding a harness starts with
`bun scripts/lab probe -- <its command>`.

## Linting & Formatting

- oxlint: `.oxlintrc.json` extends `.oxlint/base.json`, which composes spacing,
  JSDoc, generic overrides and generic boundaries. oxfmt: `.oxfmtrc.json`.
- JSDoc is required on every function declaration, class and method in
  `src/**` and `scripts/**`, exported or not (not on arrow functions or
  const/type/enum declarations). Include described `@param` and `@returns`
  tags.
- For a destructured parameter, document a meaningful object name and its
  keys (`@param event` and `@param event.locals`, not `root0`).
- Property docs are JSDoc for IDE hover; comments inside function bodies are
  multiline plain starred blocks. Type members document their constraints.
- `@stylistic/padding-line-between-statements` enforces statement spacing.
- An intentionally unconsumed export carries `@public` in its JSDoc so knip
  skips it.
- When a catch shadows an in-scope `error`, name the parameter `error_`.

## Secrets

- The commit hook rejects any staged `.env*` file except `.example` templates.
  Never print secret values.

## Releases

modelmark is published to npm as `modelmark` from GitHub Actions with trusted
publishing (no npm token). A pushed `v<version>` tag is the release: pushing
`main` alone publishes nothing. On an up-to-date `main`, run `bun run bump`
(bumpp): it asks for the new version, updates `package.json`, commits
`Release v<version>`, tags `v<version>`, and pushes both.
`.github/workflows/release.yml` then checks that the tag matches
`package.json`, runs the checks and tests, and publishes. The package ships
`src` without tests, and `tested-versions.json`.
