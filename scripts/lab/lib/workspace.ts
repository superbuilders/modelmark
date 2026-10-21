import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { AGENT_TIMEOUT_MS, COMMIT_MESSAGE } from './constants'
import { labEnv, shellQuote, spawn, tail } from './process'

import type { Env } from '../../../src/system/types'
import type { CommitTrailers, ScenarioWorkspace } from './types'

/** How often a detached command's exit is checked for. */
const POLL_MS = 100

/**
 * The prepare-commit-msg hook the lab installs: modelmark from this checkout,
 * timed with Perl (on every Linux and macOS) because macOS `date` has no milliseconds.
 * @param bun - the Bun binary
 * @param checkout - this repository
 * @returns the hook script
 */
function hookScript(bun: string, checkout: string): string {
    const now = `perl -MTime::HiRes=time -e 'printf "%d", time * 1000'`

    return `#!/bin/sh
dir=$(git rev-parse --git-dir)
start=$(${now})
${shellQuote(bun)} ${shellQuote(join(checkout, 'src/cli.ts'))} hook "$@" 2>>"$dir/modelmark-hook-errors"
status=$?
end=$(${now})
echo $((end - start)) >>"$dir/modelmark-hook-ms"
exit $status
`
}

/**
 * Read a file the hook may not have written yet.
 * @param path - the file
 * @returns its text, or empty
 */
async function readIfThere(path: string): Promise<string> {
    try {
        return await readFile(path, 'utf8')
    } catch {
        return ''
    }
}

/**
 * Wait for a file to appear.
 * @param path - the file
 * @param timeoutMs - how long to wait
 * @returns its text, or null when it never appeared
 */
async function waitForFile(path: string, timeoutMs: number): Promise<string | null> {
    for (let waited = 0; waited < timeoutMs; waited += POLL_MS) {
        const text = await readIfThere(path)

        if (text) {
            return text
        }

        await Bun.sleep(POLL_MS)
    }

    return null
}

/**
 * The values `git log` printed for one trailer key, one per line.
 * @param lines - the printed values
 * @returns them, trimmed, without blank lines
 */
function values(lines: string): string[] {
    return lines
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)
}

/**
 * One scenario's scratch folder: a repository with the hook installed, and the
 * output of everything the scenario ran.
 */
export class Workspace implements ScenarioWorkspace {
    /** The scenario's scratch folder. */
    readonly root: string
    /** The Bun binary running the lab. */
    readonly bun: string
    /** The scratch repository. */
    readonly repo: string
    /** Where everything the scenario runs writes its output. */
    private readonly log: string
    /** How many detached commands have run, to name each one's status file. */
    private detachedRuns = 0

    /**
     * @param root - the scenario's scratch folder
     * @param bun - the Bun binary running the lab
     */
    private constructor(root: string, bun: string) {
        this.root = root
        this.bun = bun
        this.repo = join(root, 'repo')
        this.log = join(root, 'output.log')
    }

    /**
     * Make the folder and its repository, and install the hook.
     * @param root - the scenario's scratch folder
     * @param checkout - this repository
     * @returns the workspace
     */
    static async create(root: string, checkout: string): Promise<Workspace> {
        const workspace = new Workspace(root, process.execPath)

        await mkdir(workspace.repo, { recursive: true })
        await spawn(['git', 'init', '-q', '-b', 'main'], { cwd: workspace.repo })
        await spawn(['git', 'config', 'user.name', 'modelmark lab'], { cwd: workspace.repo })
        await spawn(['git', 'config', 'user.email', 'lab@modelmark.invalid'], {
            cwd: workspace.repo,
        })
        await spawn(['git', 'config', 'commit.gpgsign', 'false'], { cwd: workspace.repo })

        const hook = join(workspace.repo, '.git', 'hooks', 'prepare-commit-msg')

        await writeFile(hook, hookScript(workspace.bun, checkout))
        await chmod(hook, 0o755)

        return workspace
    }

    /**
     * Run an agent's command in the repository.
     * @param argv - the command
     * @returns its output
     */
    async agent(argv: string[]): Promise<string> {
        const result = await spawn(argv, { cwd: this.repo, timeoutMs: AGENT_TIMEOUT_MS })
        const output = `${result.stdout}${result.stderr}`

        await appendFile(this.log, `$ ${argv[0]}\n${output}\n`)

        if (result.exitCode !== 0) {
            throw new Error(`${argv[0]} exited ${result.exitCode}: ${tail(output)}`)
        }

        return output
    }

    /**
     * Run a command with no agent above it: a backgrounded subshell whose parent
     * exits is adopted by the system's first process (systemd or launchd).
     * @param argv - the command
     * @param env - variables added to the lab's environment
     */
    async detached(argv: string[], env: Env): Promise<void> {
        const status = join(this.root, `detached-${++this.detachedRuns}.status`)

        await spawn(
            [
                'sh',
                '-c',
                '( "$@" >>"$LAB_OUTPUT" 2>&1; echo $? >"$LAB_STATUS" ) </dev/null >/dev/null 2>&1 &',
                'sh',
                ...argv,
            ],
            { cwd: this.repo, env: labEnv({ ...env, LAB_OUTPUT: this.log, LAB_STATUS: status }) },
        )

        const exitCode = await waitForFile(status, AGENT_TIMEOUT_MS)

        if (exitCode?.trim() !== '0') {
            throw new Error(
                `${argv[0]} ${exitCode === null ? 'never finished' : `exited ${exitCode.trim()}`}: ${tail(await this.output())}`,
            )
        }
    }

    /**
     * The Assisted-by and Assisted-cost values on the newest commit.
     * @returns them, in order, or null when no lab commit was made
     */
    async trailers(): Promise<CommitTrailers | null> {
        const result = await spawn(
            [
                'git',
                'log',
                '-1',
                '--format=%s%x1f%(trailers:key=Assisted-by,valueonly)%x1f%(trailers:key=Assisted-cost,valueonly)',
            ],
            { cwd: this.repo },
        )
        const [subject, marks = '', costs = ''] = result.stdout.split('\u001F')

        if (result.exitCode !== 0 || subject !== COMMIT_MESSAGE) {
            return null
        }

        return { marks: values(marks), costs: values(costs) }
    }

    /**
     * How long each hook run took.
     * @returns milliseconds, one per run
     */
    async hookTimes(): Promise<number[]> {
        const text = await readIfThere(join(this.repo, '.git', 'modelmark-hook-ms'))

        return text.split('\n').filter(Boolean).map(Number)
    }

    /**
     * What the hook printed to stderr, such as a commit left unmarked.
     * @returns the text, or empty
     */
    async hookErrors(): Promise<string> {
        const errors = await readIfThere(join(this.repo, '.git', 'modelmark-hook-errors'))

        return errors.trim()
    }

    /**
     * Everything the scenario's commands printed.
     * @returns the output
     */
    async output(): Promise<string> {
        return readIfThere(this.log)
    }
}
