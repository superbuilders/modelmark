import { readState, writeState } from '../system/state'
import { sessionName } from './logs'
import { readSessionUse } from './usage'

import type { Env } from '../system/types'
import type { AgentId, SessionUse } from './types'

/**
 * The name the point a session was counted up to is kept under.
 * @param agent - which agent
 * @param session - its session
 * @returns the state file's name
 */
function checkpointName(agent: AgentId, session: string): string {
    return `checkpoints/${agent}-${encodeURIComponent(session)}`
}

/**
 * The replies an agent's session made since its last commit: since the point
 * the last commit's cost was counted up to, or since the session started.
 * @param agent - which agent
 * @param env - the environment
 * @returns the replies, or undefined when the session's logs can't be read
 */
export function usesSinceLastCommit(agent: AgentId, env: Env): SessionUse | undefined {
    const session = sessionName(agent, env)

    if (!session) {
        return undefined
    }

    const saved = Number(readState(checkpointName(agent, session), env))

    const use = readSessionUse(agent, env, saved > 0 ? saved : undefined)

    return use && { session, ...use }
}

/**
 * Mark a session's replies as counted, so the next commit starts after them.
 * @param agent - which agent
 * @param use - the replies just counted
 * @param env - the environment
 */
export function markCounted(agent: AgentId, use: SessionUse, env: Env): void {
    if (use.through !== undefined) {
        writeState(checkpointName(agent, use.session), String(use.through), env)
    }
}
