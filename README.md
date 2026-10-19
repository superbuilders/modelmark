# modelmark

Marks every git commit with the coding agent, model and effort level that made it.

```
Fix the login redirect

Assisted-by: claude-code:claude-opus-5-5@high
```

A pull request can then say which agents and models wrote it:

```sh
$ modelmark summary
origin/main..HEAD: 5 commits
  3  claude-code:claude-opus-5-5@high
  1  codex:gpt-5.6-terra@medium
  1  no mark
```

## How it works

- A `prepare-commit-msg` hook runs on every commit.
- It walks up the process tree to find the agent running `git commit`.
- It reads the model and effort from that agent's own session records, so it
  never asks the model to name itself.
- It adds an `Assisted-by` trailer. That takes about 0.2 s on Linux and 0.06 s
  on macOS, and a problem never blocks the commit.

## Setup

modelmark runs on [Bun](https://bun.sh).

### For a team (recommended)

Add it to the repository once, and everyone who runs `bun install` is set up:

```sh
bun add -d modelmark
bunx modelmark install
```

`install` adds one line to the repository's `prepare-commit-msg` hook that runs
the copy in `node_modules`. In a Husky repository it writes
`.husky/prepare-commit-msg`: commit it with `package.json`, and every
teammate's commits are marked after their next `bun install`. Everyone runs the
version the lockfile pins.

### For yourself

Install it globally, then add the hook to each repository you want marked:

```sh
bun add -g modelmark
modelmark install
```

### Either way

The hook line never blocks a commit. Where modelmark isn't installed, or can't
start, the commit goes through unmarked. If the repository already has a
`prepare-commit-msg` hook, `install` prints the line to add yourself.

`doctor` checks the setup and shows the mark a commit would get. Run it from
inside an agent to see that agent's mark.

## Commands

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `modelmark install`         | Adds the hook to this repository                         |
| `modelmark uninstall`       | Removes it                                               |
| `modelmark doctor`          | Checks the setup and shows the mark a commit would get   |
| `modelmark summary [range]` | Counts the marks across commits (default: this branch's) |

`summary` with no range covers the commits on this branch that aren't on the
default branch. `doctor` and `summary` take `--json`, and `summary` also takes
`--markdown`: a table to paste into a pull request, or to post from CI.

```sh
$ modelmark summary --markdown
| Harness     | Model           | Effort | Commits |
| ----------- | --------------- | ------ | ------- |
| Claude Code | claude-opus-5-5 | high   | 3       |
| Codex       | gpt-5.6-terra   | medium | 1       |
| No mark     |                 |        | 1       |
```

## Reading a mark

```
Assisted-by: claude-code:claude-opus-5-5@high
             ─────┬───── ───────┬─────── ─┬──
               harness        model     effort
```

- **No trailer:** the commit was made outside any supported agent, or it is a
  merge commit.
- **`unknown` model:** the agent was found but its records couldn't be read.
  Usually a harness update moved something (see [Tested versions](#tested-versions)).
- **No `@effort`:** the agent recorded no effort level.
- **Two trailers:** a second agent amended the commit, and both are kept.

## Supported harnesses

| Harness     | Mark          | Model from                                 | Effort from          |
| ----------- | ------------- | ------------------------------------------ | -------------------- |
| Claude Code | `claude-code` | its session log in `~/.claude/projects`    | the same log record  |
| Codex       | `codex`       | its session rollout in `~/.codex/sessions` | the same log record  |
| Pi          | `pi`          | its session file (`PI_SESSION_FILE`)       | `PI_REASONING_LEVEL` |

`CLAUDE_CONFIG_DIR` and `CODEX_HOME` move those folders, and modelmark follows
them.

### Tested versions

The newest version of each harness that passed every
[lab](scripts/lab/README.md) scenario. `bun scripts/lab run` updates this table.

<!-- lab:tested -->

| Harness     | Linux   | macOS   |
| ----------- | ------- | ------- |
| Claude Code | 2.1.303 | 2.1.299 |
| Codex       | 0.154.0 | 0.163.0 |
| Pi          | 0.85.1  | 0.84.3  |

<!-- /lab:tested -->

The harnesses keep these records for their own use and update themselves, so a
new version can break a mark without warning. `modelmark doctor` warns when an
installed version hasn't been tested, and `bun scripts/lab status` checks both
hosts.

## Development

```sh
bun install
bun run typecheck
bun run test <files>
bun scripts/lab run --all --host both   # real harnesses, here and on the Mac
```

[AGENTS.md](AGENTS.md) has the conventions, and
[scripts/lab](scripts/lab/README.md) explains the lab.
