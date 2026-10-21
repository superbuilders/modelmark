import { HARNESS_NAMES } from './constants'

import type { AgentId } from './types'

/**
 * A harness's name as people write it, or the agent as the mark has it when
 * modelmark doesn't know it.
 * @param agent - the agent from a mark
 * @returns the name
 */
export function harnessName(agent: string): string {
    return Object.hasOwn(HARNESS_NAMES, agent) ? HARNESS_NAMES[agent as AgentId] : agent
}
