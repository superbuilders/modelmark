import { HARNESS_NAMES } from '../../agents/constants'

import type { AgentId } from '../../agents/types'

/**
 * A count of commits, in words.
 * @param count - how many
 * @returns `1 commit` or `N commits`
 */
export function commitsText(count: number): string {
    return count === 1 ? '1 commit' : `${count} commits`
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
