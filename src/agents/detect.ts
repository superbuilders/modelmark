import { basename } from 'node:path'

import { readProcessTable } from '../system/processes'
import { parseMark } from '../trailers/mark'
import { DECLARED_MARK, HARNESS_COMMANDS, MAX_TREE_DEPTH, SCRIPT_RUNTIMES } from './constants'
import { readModelUse } from './models'

import type { Env, ProcessInfo, ProcessTable } from '../system/types'
import type { AgentId, Detection, FoundAgent } from './types'

/** Each harness's executable name (without its folder), to the agent it starts. */
const AGENTS_BY_EXECUTABLE = new Map(
    (Object.entries(HARNESS_COMMANDS) as [AgentId, string][]).map(([agent, command]) => [
        command,
        agent,
    ]),
)

/**
 * Name the agent a command line starts, if any, from its first word, or from
 * its second when the first is a script runtime (`node /path/to/codex`).
 * @param args - a full command line, executable first
 * @returns the agent, or undefined for any other program
 */
export function agentOfCommand(args: string): AgentId | undefined {
    const [first = '', second = ''] = args.trim().split(/\s+/)
    let executable = basename(first)

    if (SCRIPT_RUNTIMES.includes(executable)) {
        executable = basename(second)
    }

    return AGENTS_BY_EXECUTABLE.get(executable)
}

/**
 * Name the agent a process is, if any.
 *
 * Its name comes first: `ps` keeps it whole, while the command line's words
 * are joined with spaces, so a space inside a path (Claude's desktop app runs
 * `claude` from under `~/Library/Application Support`) can't be told from one
 * between words. The command line covers a runtime running an agent's script,
 * whose name is the runtime's.
 * @param info - the process's row in the table
 * @returns the agent, or undefined for any other program
 */
export function agentOfProcess(info: ProcessInfo): AgentId | undefined {
    return AGENTS_BY_EXECUTABLE.get(basename(info.name)) ?? agentOfCommand(info.args)
}

/**
 * Walk up from a process to the nearest ancestor that is an agent.
 *
 * The nearest one wins: Codex started from Pi started from Claude Code is
 * Codex's commit.
 * @param table - the process table
 * @param startPid - where the walk starts (this process's parent)
 * @returns the agent; `top` when the walk reached the top with none (a person's
 * terminal); `blocked` when a parent is missing from the table (a sandbox hiding it)
 */
function walkToAgent(table: ProcessTable, startPid: number): AgentId | 'top' | 'blocked' {
    let pid = startPid

    for (let depth = 0; pid > 1 && depth < MAX_TREE_DEPTH; depth++) {
        const info = table.get(pid)

        if (!info) {
            return 'blocked'
        }

        const agent = agentOfProcess(info)

        if (agent) {
            return agent
        }

        pid = info.ppid
    }

    return 'top'
}

/**
 * Name the agent from the markers agents leave in their commands' environment.
 *
 * Markers outlive their agent (a terminal opened from an agent inherits them,
 * and an inner agent keeps an outer one's), so this is only a fallback when the
 * process tree can't answer, and only when exactly one agent left markers.
 * @param env - the environment
 * @returns the agent, or undefined when none or several left markers
 */
function agentFromMarkers(env: Env): AgentId | undefined {
    const present: AgentId[] = []

    if (env.CLAUDE_CODE_SESSION_ID) {
        present.push('claude-code')
    }

    if (env.CODEX_THREAD_ID) {
        present.push('codex')
    }

    if (env.PI_SESSION_FILE || env.PI_MODEL) {
        present.push('pi')
    }

    return present.length === 1 ? present[0] : undefined
}

/**
 * Find the agent running this command.
 * @param table - the process table, or null when ps could not be read
 * @param startPid - where the walk starts (this process's parent)
 * @param env - the environment
 * @returns the agent and how it was found, or null for a person's own commit
 */
export function findAgent(
    table: ProcessTable | null,
    startPid: number,
    env: Env,
): FoundAgent | null {
    const walked = table ? walkToAgent(table, startPid) : 'blocked'

    if (walked !== 'top' && walked !== 'blocked') {
        return { agent: walked, via: 'process-tree' }
    }

    /*
     * Codex's sandbox runs commands in their own process namespace, so the walk
     * tops out without seeing Codex. Codex marks its sandboxed commands.
     */
    if (env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED) {
        return { agent: 'codex', via: 'environment' }
    }

    const marked = walked === 'blocked' ? agentFromMarkers(env) : undefined

    return marked ? { agent: marked, via: 'environment' } : null
}

/**
 * The mark an agent modelmark doesn't know declares in `MODELMARK`.
 * @param env - the environment
 * @returns the detection, or null when none is declared
 */
function declaredMark(env: Env): Detection | null {
    const value = env[DECLARED_MARK]?.trim()

    if (!value) {
        return null
    }

    const { agent, model, effort } = parseMark(value)

    return agent ? { agent, via: 'declared', model: model || null, effort: effort || null } : null
}

/**
 * Find the agent running this command, and the model and effort behind its latest reply.
 *
 * A known agent in the process tree wins over a declared mark, which an inner
 * process inherits like any other variable; a declared mark wins over the
 * environment markers known agents leave.
 * @param env - the environment (default: this process's)
 * @param startPid - where the process walk starts (default: this process's parent)
 * @returns the detection, or null when no agent is running this command
 */
export async function detect(
    env: Env = process.env,
    startPid = process.ppid,
): Promise<Detection | null> {
    const found = findAgent(await readProcessTable(), startPid, env)
    const declared = declaredMark(env)

    if (declared && found?.via !== 'process-tree') {
        return declared
    }

    return found ? { ...found, ...readModelUse(found.agent, env) } : null
}
