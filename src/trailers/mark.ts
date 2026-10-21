import { AGENT_SEPARATOR, EFFORT_SEPARATOR, TRAILER_KEY, UNKNOWN_MODEL } from './constants'

import type { MarkParts, MarkSource } from './types'

/**
 * The trailer value for a mark: `<agent>:<model>@<effort>`, or
 * `<agent>:<model>` when the agent records no effort.
 * @param mark - the agent, model and effort
 * @returns the value, with `unknown` for a model the log did not give
 */
export function markValue(mark: MarkSource): string {
    const value = `${mark.agent}${AGENT_SEPARATOR}${mark.model ?? UNKNOWN_MODEL}`

    return mark.effort ? `${value}${EFFORT_SEPARATOR}${mark.effort}` : value
}

/**
 * The full trailer line for a mark.
 * @param mark - the agent, model and effort
 * @returns `Assisted-by: <agent>:<model>@<effort>`
 */
export function markTrailer(mark: MarkSource): string {
    return `${TRAILER_KEY}: ${markValue(mark)}`
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
