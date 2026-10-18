import { HARNESS_COMMANDS } from '../../../src/agents/constants'
import { installedVersion } from '../../../src/agents/versions'
import { COMMIT_MESSAGE, PI_PROVIDER_VARIABLE } from './constants'
import { shellQuote } from './process'

import type { AgentId } from '../../../src/agents/types'
import type { CommandResult } from '../../../src/system/types'

/**
 * A model and how hard it should think.
 */
interface ModelChoice {
    /** The model id, as the harness takes it. */
    model: string
    /** The effort or thinking level. */
    effort: string
}

/**
 * Codex's options for a first turn.
 */
interface CodexChoice extends ModelChoice {
    /** Run in Codex's sandbox instead of without one. */
    sandbox?: boolean
    /** Continue this thread (from the first turn's JSON events) instead of starting one. */
    thread?: string
}

/**
 * Pi's options for one turn.
 */
interface PiChoice extends ModelChoice {
    /** The folder Pi keeps its session in, or null to keep none. */
    sessions: string | null
    /** Continue the session in that folder. */
    continued?: boolean
}

/** The commit every lab agent is asked to make. */
export const COMMIT = `git commit --allow-empty -m ${shellQuote(COMMIT_MESSAGE)}`

/** The amend the second agent in the amend scenario makes. */
export const AMEND = 'git commit --amend --no-edit --allow-empty'

/**
 * A prompt asking the agent to run one exact shell command.
 * @param command - the command
 * @returns the prompt
 */
export function runPrompt(command: string): string {
    return `Run this exact shell command in the current directory, then reply with the single word done: ${command}`
}

/** A prompt that makes the agent reply without running anything, for the first turn of a switch. */
export const HELLO = 'Reply with the single word ok.'

/**
 * Claude Code's command for one prompt.
 * @param prompt - the prompt
 * @param choice - model and effort
 * @param extra - more arguments, such as `--continue`
 * @returns the command
 */
export function claude(prompt: string, choice: ModelChoice, extra: string[] = []): string[] {
    return [
        HARNESS_COMMANDS['claude-code'],
        '-p',
        '--model',
        choice.model,
        '--effort',
        choice.effort,
        '--dangerously-skip-permissions',
        ...extra,
        prompt,
    ]
}

/**
 * Codex's command for one turn. A first turn prints its events as JSON, so
 * the thread can be continued; a later turn names that thread.
 * @param prompt - the prompt
 * @param choice - model, effort, sandbox and thread
 * @returns the command
 */
export function codex(prompt: string, choice: CodexChoice): string[] {
    const sandbox = choice.sandbox
        ? ['--sandbox', 'workspace-write']
        : ['--dangerously-bypass-approvals-and-sandbox']
    const turn = choice.thread ? ['resume'] : ['--json']

    return [
        HARNESS_COMMANDS.codex,
        'exec',
        ...turn,
        '--skip-git-repo-check',
        ...sandbox,
        '-m',
        choice.model,
        '-c',
        `model_reasoning_effort=${choice.effort}`,
        ...(choice.thread ? [choice.thread] : []),
        prompt,
    ]
}

/**
 * The thread id in Codex's JSON events.
 * @param output - what `codex exec --json` printed
 * @returns the id
 */
export function codexThread(output: string): string {
    const match = /"thread_id":"([^"]+)"/.exec(output)

    if (!match?.[1]) {
        throw new Error('Codex printed no thread id')
    }

    return match[1]
}

/**
 * Pi's command for one prompt.
 * @param prompt - the prompt
 * @param choice - model, thinking level and session
 * @returns the command
 */
export function pi(prompt: string, choice: PiChoice): string[] {
    const session = choice.sessions ? ['--session-dir', choice.sessions] : ['--no-session']
    const provider = process.env[PI_PROVIDER_VARIABLE]

    return [
        HARNESS_COMMANDS.pi,
        '-p',
        ...(provider ? ['--provider', provider] : []),
        '--model',
        choice.model,
        '--thinking',
        choice.effort,
        ...session,
        ...(choice.continued ? ['--continue'] : []),
        prompt,
    ]
}

/**
 * The installed version of each harness asked about.
 * @param run - runs one command on the host being checked
 * @param agents - the harnesses to ask (default: all of them)
 * @returns the versions; a harness that is missing has no entry
 */
export async function readVersions(
    run: (argv: string[]) => Promise<CommandResult>,
    agents = Object.keys(HARNESS_COMMANDS) as AgentId[],
): Promise<Partial<Record<AgentId, string>>> {
    const found = await Promise.all(
        agents.map(async agent => [agent, await installedVersion(agent, run)] as const),
    )
    const versions: Partial<Record<AgentId, string>> = {}

    for (const [agent, version] of found) {
        if (version) {
            versions[agent] = version
        }
    }

    return versions
}
