import { readProcessTable } from '../system/processes'
import {
    AGENT_SEPARATOR,
    DECLARED_MARK,
    EFFORT_SEPARATOR,
    HARNESS_NAMES,
    TRAILER_KEY,
    UNKNOWN_MODEL,
} from './constants'
import { findAgent } from './detect'
import { readModelUse } from './models'

import type { Env } from '../system/types'
import type { AgentId, Detection, MarkParts } from './types'

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

/**
 * The trailer value for a detection: `<agent>:<model>@<effort>`, or
 * `<agent>:<model>` when the agent records no effort.
 * @param detection - the agent, model and effort
 * @returns the value, with `unknown` for a model the log did not give
 */
export function markValue(detection: Detection): string {
    const value = `${detection.agent}${AGENT_SEPARATOR}${detection.model ?? UNKNOWN_MODEL}`

    return detection.effort ? `${value}${EFFORT_SEPARATOR}${detection.effort}` : value
}

/**
 * The full trailer line for a detection.
 * @param detection - the agent, model and effort
 * @returns `Assisted-by: <agent>:<model>@<effort>`
 */
export function markTrailer(detection: Detection): string {
    return `${TRAILER_KEY}: ${markValue(detection)}`
}

/**
 * Split a mark back into its parts: the reverse of markValue.
 * @param value - a trailer value, such as `codex:gpt-5.6-terra@high`
 * @returns the agent, model and effort
 */
export function parseMark(value: string): MarkParts {
    const split = value.indexOf(AGENT_SEPARATOR)
    const agent = split === -1 ? value : value.slice(0, split)
    const rest = split === -1 ? '' : value.slice(split + AGENT_SEPARATOR.length)
    const at = rest.lastIndexOf(EFFORT_SEPARATOR)

    if (at === -1) {
        return { agent, model: rest, effort: null }
    }

    return { agent, model: rest.slice(0, at), effort: rest.slice(at + EFFORT_SEPARATOR.length) }
}

/**
 * A harness's name as people write it, or the agent as the mark has it when
 * modelmark doesn't know it.
 * @param agent - the agent from a mark
 * @returns the name
 */
export function harnessName(agent: string): string {
    return Object.hasOwn(HARNESS_NAMES, agent) ? HARNESS_NAMES[agent as AgentId] : agent
}
