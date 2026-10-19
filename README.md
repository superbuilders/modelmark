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
default branch. `doctor` takes `--json`. `summary` takes `--format`: `text` (the
default), `json` (or just `--json`), and two for a pull request or a CI comment,
`table` and `badges`.

`--format badges` prints one [shields.io](https://shields.io) badge per mark,
as HTML for Markdown. It prints nothing when no commit has a mark:

<img alt="Claude Code" src="https://img.shields.io/badge/Claude_Code-30363D?style=flat-square&logo=claude&logoColor=white"><img alt="claude-opus-5-5" src="https://img.shields.io/badge/claude--opus--5--5-D97757?style=flat-square"><img alt="high" src="https://img.shields.io/badge/high-B34A28?style=flat-square"><img alt="3 commits" src="https://img.shields.io/badge/3_commits-30363D?style=flat-square"><br>
<img alt="Codex" src="https://img.shields.io/badge/Codex-30363D?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMi4yODE5IDkuODIxMWE1Ljk4NDcgNS45ODQ3IDAgMCAwLS41MTU3LTQuOTEwOCA2LjA0NjIgNi4wNDYyIDAgMCAwLTYuNTA5OC0yLjlBNi4wNjUxIDYuMDY1MSAwIDAgMCA0Ljk4MDcgNC4xODE4YTUuOTg0NyA1Ljk4NDcgMCAwIDAtMy45OTc3IDIuOSA2LjA0NjIgNi4wNDYyIDAgMCAwIC43NDI3IDcuMDk2NiA1Ljk4IDUuOTggMCAwIDAgLjUxMSA0LjkxMDcgNi4wNTEgNi4wNTEgMCAwIDAgNi41MTQ2IDIuOTAwMUE1Ljk4NDcgNS45ODQ3IDAgMCAwIDEzLjI1OTkgMjRhNi4wNTU3IDYuMDU1NyAwIDAgMCA1Ljc3MTgtNC4yMDU4IDUuOTg5NCA1Ljk4OTQgMCAwIDAgMy45OTc3LTIuOTAwMSA2LjA1NTcgNi4wNTU3IDAgMCAwLS43NDc1LTcuMDcyOXptLTkuMDIyIDEyLjYwODFhNC40NzU1IDQuNDc1NSAwIDAgMS0yLjg3NjQtMS4wNDA4bC4xNDE5LS4wODA0IDQuNzc4My0yLjc1ODJhLjc5NDguNzk0OCAwIDAgMCAuMzkyNy0uNjgxM3YtNi43MzY5bDIuMDIgMS4xNjg2YS4wNzEuMDcxIDAgMCAxIC4wMzguMDUydjUuNTgyNmE0LjUwNCA0LjUwNCAwIDAgMS00LjQ5NDUgNC40OTQ0em0tOS42NjA3LTQuMTI1NGE0LjQ3MDggNC40NzA4IDAgMCAxLS41MzQ2LTMuMDEzN2wuMTQyLjA4NTIgNC43ODMgMi43NTgyYS43NzEyLjc3MTIgMCAwIDAgLjc4MDYgMGw1Ljg0MjgtMy4zNjg1djIuMzMyNGEuMDgwNC4wODA0IDAgMCAxLS4wMzMyLjA2MTVMOS43NCAxOS45NTAyYTQuNDk5MiA0LjQ5OTIgMCAwIDEtNi4xNDA4LTEuNjQ2NHpNMi4zNDA4IDcuODk1NmE0LjQ4NSA0LjQ4NSAwIDAgMSAyLjM2NTUtMS45NzI4VjExLjZhLjc2NjQuNzY2NCAwIDAgMCAuMzg3OS42NzY1bDUuODE0NCAzLjM1NDMtMi4wMjAxIDEuMTY4NWEuMDc1Ny4wNzU3IDAgMCAxLS4wNzEgMGwtNC44MzAzLTIuNzg2NUE0LjUwNCA0LjUwNCAwIDAgMSAyLjM0MDggNy44NzJ6bTE2LjU5NjMgMy44NTU4TDEzLjEwMzggOC4zNjQgMTUuMTE5MiA3LjJhLjA3NTcuMDc1NyAwIDAgMSAuMDcxIDBsNC44MzAzIDIuNzkxM2E0LjQ5NDQgNC40OTQ0IDAgMCAxLS42NzY1IDguMTA0MnYtNS42NzcyYS43OS43OSAwIDAgMC0uNDA3LS42Njd6bTIuMDEwNy0zLjAyMzFsLS4xNDItLjA4NTItNC43NzM1LTIuNzgxOGEuNzc1OS43NzU5IDAgMCAwLS43ODU0IDBMOS40MDkgOS4yMjk3VjYuODk3NGEuMDY2Mi4wNjYyIDAgMCAxIC4wMjg0LS4wNjE1bDQuODMwMy0yLjc4NjZhNC40OTkyIDQuNDk5MiAwIDAgMSA2LjY4MDIgNC42NnpNOC4zMDY1IDEyLjg2M2wtMi4wMi0xLjE2MzhhLjA4MDQuMDgwNCAwIDAgMS0uMDM4LS4wNTY3VjYuMDc0MmE0LjQ5OTIgNC40OTkyIDAgMCAxIDcuMzc1Ny0zLjQ1MzdsLS4xNDIuMDgwNUw4LjcwNCA1LjQ1OWEuNzk0OC43OTQ4IDAgMCAwLS4zOTI3LjY4MTN6bTEuMDk3Ni0yLjM2NTRsMi42MDItMS40OTk4IDIuNjA2OSAxLjQ5OTh2Mi45OTk0bC0yLjU5NzQgMS40OTk3LTIuNjA2Ny0xLjQ5OTdaIi8%2BPC9zdmc%2B&logoColor=white"><img alt="gpt-5.6-terra" src="https://img.shields.io/badge/gpt--5.6--terra-10A37F?style=flat-square"><img alt="medium" src="https://img.shields.io/badge/medium-0C755B?style=flat-square"><img alt="1 commit" src="https://img.shields.io/badge/1_commit-30363D?style=flat-square"><br>
<img alt="No mark" src="https://img.shields.io/badge/No_mark-30363D?style=flat-square"><img alt="1 commit" src="https://img.shields.io/badge/1_commit-57606A?style=flat-square">

`--format table` prints the same counts as a Markdown table:

```sh
$ modelmark summary --format table
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

### Other agents

An agent modelmark doesn't know can name itself. Set `MODELMARK` to its mark in
the environment its shell commands run in, and its commits get that mark:

```sh
MODELMARK=jojo:gpt-6.1-sol@high
```

The model and the effort are optional (`MODELMARK=jojo` works). A supported
harness found in the process tree still wins, since a command run inside it
inherits the variable.

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
