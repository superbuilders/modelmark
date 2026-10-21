import { HOOK_BUDGET_MS } from './constants'

import type { ExpectedMark } from './types'

/**
 * What a scenario left behind, for judging it.
 */
interface Evidence {
    /** The trailers the scenario expects. */
    expected: ExpectedMark[]
    /** The newest commit's Assisted-by values, or null when no lab commit was made. */
    trailers: string[] | null
    /** Whether the commit should carry a cost: true whenever it should carry a mark. */
    costed: boolean
    /** The newest commit's Assisted-cost values. */
    costs: string[]
    /** How long each hook run took. */
    hookMs: number[]
    /** What the hook printed to stderr. */
    hookErrors: string
}

/**
 * Whether one trailer value is what a scenario expects.
 * @param expected - an exact value or a pattern
 * @param actual - the value
 * @returns true when it matches
 */
function matches(expected: ExpectedMark, actual: string | undefined): boolean {
    if (actual === undefined) {
        return false
    }

    return typeof expected === 'string' ? expected === actual : expected.test(actual)
}

/**
 * Judge a scenario from what it left behind.
 * @param evidence - the commit's trailers and cost, and the hook's timings and errors
 * @returns why it failed, or null when it passed
 */
export function verdict(evidence: Evidence): string | null {
    const { expected, trailers, costed, costs, hookMs, hookErrors } = evidence

    if (trailers === null) {
        return 'no lab commit was made'
    }

    if (hookMs.length === 0) {
        return 'the hook never ran'
    }

    if (
        trailers.length !== expected.length ||
        expected.some((mark, index) => !matches(mark, trailers[index]))
    ) {
        return `expected [${expected.map(String).join(', ')}], got [${trailers.join(', ')}]`
    }

    if (costs.length !== (costed ? 1 : 0)) {
        return `expected ${costed ? 'one cost line' : 'no cost line'}, got [${costs.join(', ')}]`
    }

    const slowest = Math.max(...hookMs)

    if (slowest > HOOK_BUDGET_MS) {
        return `the hook took ${slowest} ms, over the ${HOOK_BUDGET_MS} ms budget`
    }

    return hookErrors ? `the hook printed: ${hookErrors}` : null
}
