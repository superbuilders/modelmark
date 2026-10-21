# modelmark

Marks each git commit with the coding agent and model that made it, what the
agent's work cost at list prices, and the tokens it used.

```
Fix the login redirect

Assisted-by: claude-code:claude-opus-5-5@high
Assisted-cost: $1.84
Assisted-tokens: 6200 input, 31000 cache-write, 14800 output, 1020000 cache-read
```

Works with Claude Code, Codex and Pi. Needs [Bun](https://bun.sh).

## Install

For a whole team, add it to the repository:

```sh
bun add -d modelmark
bunx modelmark install
```

With Husky, `install` writes to `.husky/prepare-commit-msg`. Commit that file
and everyone gets the hook. Without Husky, the hook lives in `.git/hooks`,
which git doesn't share, so add `modelmark install` to the `prepare` script in
`package.json`. Then everyone who runs `bun install` gets it:

```json
"scripts": { "prepare": "modelmark install" }
```

Just for you:

```sh
bun add -g modelmark
modelmark install    # in each repository
```

Installed this way, it also runs as a git command: `git modelmark summary`,
or `git -C ../other-repo modelmark doctor` for another repository. Use
`git modelmark -h` for help: git turns `--help` into a search for a manual
page that doesn't exist.

`install` adds one line to the `prepare-commit-msg` hook (Husky's, if the
repository uses Husky). The hook never blocks a commit: if anything goes wrong,
the commit goes through unmarked. Run `modelmark doctor` to check the setup.

To leave one commit unmarked, set `MODELMARK_DISABLE=1`:

```sh
MODELMARK_DISABLE=1 git commit
```

It gets no cost or tokens line either; its replies count toward the next commit.
`git commit --no-verify` doesn't skip modelmark: git runs this hook even then.

## Commands

| Command                     | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `modelmark install`         | Add the hook to this repository                         |
| `modelmark uninstall`       | Remove it                                               |
| `modelmark doctor`          | Check the setup and show the mark a commit would get    |
| `modelmark summary [range]` | Count the marks across commits (default: this branch's) |
| `modelmark prices [filter]` | Show the prices commits are costed with                 |

`summary` and `prices` take `--format text|json|markdown` (`--json` for short).
`summary` also takes `--format badges`, HTML badges for a pull request:

```sh
$ modelmark summary
origin/main..HEAD: 5 commits
  3  claude-code:claude-opus-5-5@high  ~$6.20  156k tokens, 3.1M cached
  1  codex:gpt-5.6-terra@medium  ~$0.85  62k tokens, 1.4M cached
  1  no mark
```

<img alt="Claude Code" src="https://img.shields.io/badge/Claude_Code-30363D?style=flat-square&logo=claude&logoColor=white"><img alt="claude-opus-5-5" src="https://img.shields.io/badge/claude--opus--5--5-D97757?style=flat-square"><img alt="high" src="https://img.shields.io/badge/high-B34A28?style=flat-square"><img alt="3 commits" src="https://img.shields.io/badge/3_commits-30363D?style=flat-square"><img alt="156k tokens" title="156k new tokens, plus 3.1M read from cache" src="https://img.shields.io/badge/156k_tokens-444C56?style=flat-square"><img alt="~$6.20" src="https://img.shields.io/badge/~%246.20-57606A?style=flat-square"><br>
<img alt="Codex" src="https://img.shields.io/badge/Codex-30363D?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMi4yODE5IDkuODIxMWE1Ljk4NDcgNS45ODQ3IDAgMCAwLS41MTU3LTQuOTEwOCA2LjA0NjIgNi4wNDYyIDAgMCAwLTYuNTA5OC0yLjlBNi4wNjUxIDYuMDY1MSAwIDAgMCA0Ljk4MDcgNC4xODE4YTUuOTg0NyA1Ljk4NDcgMCAwIDAtMy45OTc3IDIuOSA2LjA0NjIgNi4wNDYyIDAgMCAwIC43NDI3IDcuMDk2NiA1Ljk4IDUuOTggMCAwIDAgLjUxMSA0LjkxMDcgNi4wNTEgNi4wNTEgMCAwIDAgNi41MTQ2IDIuOTAwMUE1Ljk4NDcgNS45ODQ3IDAgMCAwIDEzLjI1OTkgMjRhNi4wNTU3IDYuMDU1NyAwIDAgMCA1Ljc3MTgtNC4yMDU4IDUuOTg5NCA1Ljk4OTQgMCAwIDAgMy45OTc3LTIuOTAwMSA2LjA1NTcgNi4wNTU3IDAgMCAwLS43NDc1LTcuMDcyOXptLTkuMDIyIDEyLjYwODFhNC40NzU1IDQuNDc1NSAwIDAgMS0yLjg3NjQtMS4wNDA4bC4xNDE5LS4wODA0IDQuNzc4My0yLjc1ODJhLjc5NDguNzk0OCAwIDAgMCAuMzkyNy0uNjgxM3YtNi43MzY5bDIuMDIgMS4xNjg2YS4wNzEuMDcxIDAgMCAxIC4wMzguMDUydjUuNTgyNmE0LjUwNCA0LjUwNCAwIDAgMS00LjQ5NDUgNC40OTQ0em0tOS42NjA3LTQuMTI1NGE0LjQ3MDggNC40NzA4IDAgMCAxLS41MzQ2LTMuMDEzN2wuMTQyLjA4NTIgNC43ODMgMi43NTgyYS43NzEyLjc3MTIgMCAwIDAgLjc4MDYgMGw1Ljg0MjgtMy4zNjg1djIuMzMyNGEuMDgwNC4wODA0IDAgMCAxLS4wMzMyLjA2MTVMOS43NCAxOS45NTAyYTQuNDk5MiA0LjQ5OTIgMCAwIDEtNi4xNDA4LTEuNjQ2NHpNMi4zNDA4IDcuODk1NmE0LjQ4NSA0LjQ4NSAwIDAgMSAyLjM2NTUtMS45NzI4VjExLjZhLjc2NjQuNzY2NCAwIDAgMCAuMzg3OS42NzY1bDUuODE0NCAzLjM1NDMtMi4wMjAxIDEuMTY4NWEuMDc1Ny4wNzU3IDAgMCAxLS4wNzEgMGwtNC44MzAzLTIuNzg2NUE0LjUwNCA0LjUwNCAwIDAgMSAyLjM0MDggNy44NzJ6bTE2LjU5NjMgMy44NTU4TDEzLjEwMzggOC4zNjQgMTUuMTE5MiA3LjJhLjA3NTcuMDc1NyAwIDAgMSAuMDcxIDBsNC44MzAzIDIuNzkxM2E0LjQ5NDQgNC40OTQ0IDAgMCAxLS42NzY1IDguMTA0MnYtNS42NzcyYS43OS43OSAwIDAgMC0uNDA3LS42Njd6bTIuMDEwNy0zLjAyMzFsLS4xNDItLjA4NTItNC43NzM1LTIuNzgxOGEuNzc1OS43NzU5IDAgMCAwLS43ODU0IDBMOS40MDkgOS4yMjk3VjYuODk3NGEuMDY2Mi4wNjYyIDAgMCAxIC4wMjg0LS4wNjE1bDQuODMwMy0yLjc4NjZhNC40OTkyIDQuNDk5MiAwIDAgMSA2LjY4MDIgNC42NnpNOC4zMDY1IDEyLjg2M2wtMi4wMi0xLjE2MzhhLjA4MDQuMDgwNCAwIDAgMS0uMDM4LS4wNTY3VjYuMDc0MmE0LjQ5OTIgNC40OTkyIDAgMCAxIDcuMzc1Ny0zLjQ1MzdsLS4xNDIuMDgwNUw4LjcwNCA1LjQ1OWEuNzk0OC43OTQ4IDAgMCAwLS4zOTI3LjY4MTN6bTEuMDk3Ni0yLjM2NTRsMi42MDItMS40OTk4IDIuNjA2OSAxLjQ5OTh2Mi45OTk0bC0yLjU5NzQgMS40OTk3LTIuNjA2Ny0xLjQ5OTdaIi8%2BPC9zdmc%2B&logoColor=white"><img alt="gpt-5.6-terra" src="https://img.shields.io/badge/gpt--5.6--terra-10A37F?style=flat-square"><img alt="medium" src="https://img.shields.io/badge/medium-0C755B?style=flat-square"><img alt="1 commit" src="https://img.shields.io/badge/1_commit-30363D?style=flat-square"><img alt="62k tokens" title="62k new tokens, plus 1.4M read from cache" src="https://img.shields.io/badge/62k_tokens-444C56?style=flat-square"><img alt="~$0.85" src="https://img.shields.io/badge/~%240.85-57606A?style=flat-square"><br>
<img alt="No mark" src="https://img.shields.io/badge/No_mark-30363D?style=flat-square"><img alt="1 commit" src="https://img.shields.io/badge/1_commit-57606A?style=flat-square">

Give an agent modelmark doesn't know a color and logo with
`--badge-color jojo=E73A2C --badge-logo jojo=jojo.svg`.

## Reading a mark

```
Assisted-by: claude-code:claude-opus-5-5@high
             ─────┬───── ───────┬─────── ─┬──
               harness        model     effort
```

- **No mark:** made outside a supported agent, or a merge commit.
- **`unknown` model:** the agent was found but its log couldn't be read,
  usually after a harness update.
- **Two marks:** a second agent amended the commit.
- **Squash merges** keep every mark, and `summary` counts each one.

## Cost

`Assisted-cost` prices the agent's replies in this repository since its last
commit here, at the model maker's list prices from
[models.dev](https://models.dev). It's an estimate, not your bill: a
subscription costs something else.

- A reply belongs to the repository its tool calls name (a file it edited, a
  `cd` into it), or else to the folder the agent was in. One session working
  in two repositories pays in each for its own work there.
- A commit by a session that never worked in this repository gets no cost.
- Every token is priced at its own rate: fresh input, cache reads, cache
  writes and output.
- A model with no price gets no cost, never a wrong one.
- Prices update in the background at most once an hour, without slowing the
  commit. CI skips this; `MODELMARK_OFFLINE=1` turns it off.
- An amend adds to the cost already there.

## Tokens

`Assisted-tokens` counts the same replies' tokens in four kinds: fresh input,
cache writes, output (thinking included) and cache reads. `summary` adds them
up and shows two numbers:

- **Tokens:** fresh input, cache writes and output. This grows with the work
  the agent did.
- **Cached:** cache reads. On every reply the agent re-reads the conversation
  so far, mostly from the cache, so this number is large and cheap. It's kept
  apart so it doesn't swamp the first. On a badge, it shows when you hover
  over the token count.

Like the cost, an amend adds to the tokens already there. A model with no
price still gets its tokens.

## Prices

`modelmark prices` shows the prices for the models your commits use:

```console
$ modelmark prices
Models this repository’s commits are marked with
US dollars per million tokens, list prices from models.dev, fetched 22 minutes ago

Model             Context  Input  Output  Cache read  Cache write
claude-haiku-5-5  <=100k    0.10    0.50        0.01        0.125
                  >100k     0.50    2.50        0.05        0.625
kimi-k3           all       3.00   15.00        0.30         3.00

A reply past a context size pays that row’s prices for all its tokens.
```

## Supported agents

| Harness     | Mark          | Reads                                   |
| ----------- | ------------- | --------------------------------------- |
| Claude Code | `claude-code` | its session log in `~/.claude/projects` |
| Codex       | `codex`       | its rollout in `~/.codex/sessions`      |
| Pi          | `pi`          | its session file and `PI_*` variables   |

Any other agent can name itself by setting `MODELMARK` in the environment its
commands run in, such as `MODELMARK=jojo:gpt-6.1-sol@high`. It gets a mark but
no cost or tokens.

The harnesses change their logs without notice, so each release is tested
against the real tools. The newest versions that passed:

<!-- lab:tested -->

| Harness     | Linux   | macOS   |
| ----------- | ------- | ------- |
| Claude Code | 2.1.306 | 2.1.304 |
| Codex       | 0.154.0 | 0.163.0 |
| Pi          | 1.3.0   | 0.84.3  |

<!-- /lab:tested -->

`modelmark doctor` warns when your installed version hasn't been tested.

## Development

```sh
bun install
bun run typecheck
bun run test <files>
bun scripts/lab run --all   # against the real harnesses
```

See [AGENTS.md](AGENTS.md) for conventions and [scripts/lab](scripts/lab/README.md)
for the lab.
