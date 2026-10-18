import { readProcessTable } from '../system/processes'
import { AGENT_SEPARATOR, EFFORT_SEPARATOR, TRAILER_KEY, UNKNOWN_MODEL } from './constants'
import { findAgent } from './detect'
import { readModelUse } from './models'

import type { Detection, Env, MarkParts } from './types'

/**
 * Find the agent running this command, and the model and effort behind its latest reply.
 * @param env - the environment (default: this process's)
 * @param startPid - where the process walk starts (default: this process's parent)
 * @returns the detection, or null when no agent is running this command
 */
export async function detect(
    env: Env = process.env,
    startPid = process.ppid,
): Promise<Detection | null> {
    const found = findAgent(await readProcessTable(), startPid, env)

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
