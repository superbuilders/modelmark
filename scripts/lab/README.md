# modelmark lab

The unit tests check modelmark against log records copied by hand. The lab
checks it against the harnesses themselves. Claude Code, Codex and Pi keep
their logs and variables for their own use, and they update themselves; when
one moves a field, commits quietly start saying `unknown`. The lab is how we
find out first.

```sh
bun scripts/lab list                          # the scenarios
bun scripts/lab run --all                     # every scenario on this machine
bun scripts/lab run pi nested --host mac      # two scenarios on the Mac
bun scripts/lab run --all --host both         # everything, here and on the Mac at once
bun scripts/lab status [--host both]          # installed versions vs. the ones that passed
bun scripts/lab probe -- gemini -p            # how a new harness shows itself
```

## Settings

The lab reads two optional settings from the environment. Bun loads them from
a git-ignored `.env` at the repository root; `.env.example` lists them.

- `MODELMARK_LAB_PI_PROVIDER`: the Pi provider the lab's Pi runs use. Unset,
  Pi uses its default. The provider must serve the Pi models in
  `lib/constants.ts`.
- `MODELMARK_LAB_MAC_HOST`: the SSH host `--host mac` runs on.

## What a run does

Each scenario gets a scratch repository under `/tmp/modelmark-lab/runs` with
the modelmark hook from this checkout installed. The scenario asks a real agent
to run one exact `git commit` (cheapest models, one-line prompts), then checks:

- the newest commit's `Assisted-by` trailers are exactly the expected ones;
- a marked commit has one `Assisted-cost` line and one `Assisted-tokens` line
  counting some output, and an unmarked one (or one with no log to price,
  like Pi without a session file) has neither;
- every hook run took at most 500 ms, Bun's startup included;
- the hook printed nothing (a warning means a commit went unmarked).

The `-elsewhere` and `-hidden` scenarios start the agent in a second
repository. In `-elsewhere` it commits here with `cd`, so the commit pays for
that reply; in `-hidden` a script commits for it, so nothing the agent did
names this repository and the commit gets no cost line.

Two scenarios need no model: `leaked-env` commits with an agent's variables set
but no agent above it in the process tree (expecting no mark), and `big-log`
reads and prices a 300 MB session log. They start the commit in a backgrounded subshell
whose parent exits, so the system's first process adopts it; that keeps the
agent you may be running the lab from out of the process tree.

A scenario is skipped when its harness isn't installed on that host. Folders of
failed scenarios are kept for reading (`output.log` holds every command's
output); `--keep` keeps them all. The exit code is 1 when a scenario failed and
2 when the lab could not start.

Real runs use your own logins, so Claude Code and Codex record their lab
sessions in your history (their folder is under `/tmp/modelmark-lab`). Pi's go
to the scratch folder. The models are in `lib/constants.ts`.

## Passing versions

When every scenario that ran a harness passes, the run records that harness's
version for the platform in `tested-versions.json` (at the repository root)
and rewrites the README's tested-versions table to match. Commit both.
`--no-record` leaves them alone. `lab status` compares what is installed with
that record and exits 1 when an installed version hasn't passed yet.
`modelmark doctor` reads the same record.

## The Mac

`--host mac` copies this checkout to `/tmp/modelmark-lab/checkout` on the
`MODELMARK_LAB_MAC_HOST` machine (without `node_modules`, `.git` and ignored
files), installs the pinned Bun
there once, checked against its release checksums, and runs the same lab in
the Mac owner's login shell. The Mac uses its own harness logins; the lab
never sends credentials. It passes the Pi provider setting along.

## Probing a new harness

`lab probe -- <command>` runs the agent once with a prompt asking it to run the
probe's own reporting command (`{prompt}` in the command marks where the
prompt goes; otherwise it goes last). It reports:

- the process chain from that command up, which shows what modelmark's
  process walk would need to match;
- the names of the environment variables the agent added, never their values;
- the files under your home folder written during the run that contain the
  prompt (the agent's own records), with the key layout of their last records.
  Only `type`, model, effort and level values are shown.

With that, a new harness needs a reader in `src/agents/models.ts`, an entry in
`HARNESS_COMMANDS`, and its scenarios here.
