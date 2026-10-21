import { basename } from 'node:path'

import { HARNESS_COMMANDS, MAX_TREE_DEPTH, SCRIPT_RUNTIMES } from './constants'

import type { ProcessTable, Env } from '../system/types'
import type { AgentId, FoundAgent } from './types'

/** Each harness's executable name (the command's first word, without its folder), to the agent it starts. */
const AGENTS_BY_EXECUTABLE = new Map(
    (Object.entries(HARNESS_COMMANDS) as [AgentId, string][]).map(([agent, command]) => [
        command,
        agent,
    ]),
)

/**
 * Name the agent a command line starts, if any.
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

        const agent = agentOfCommand(info.args)

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
