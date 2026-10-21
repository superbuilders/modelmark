import { git } from '../system/command'
import { COST_LINE, MARK_LINE } from './patterns'

import type { IfTrailerExists } from './types'

/**
 * Every mark in a commit message, anywhere in it.
 * @param message - the message
 * @returns each mark's value, such as `codex:gpt-5.6-terra@high`
 */
export function marksIn(message: string): string[] {
    return Array.from(message.matchAll(MARK_LINE), ([, mark]) => mark.trim())
}

/**
 * The sum of every cost line in a commit message.
 * @param message - the message
 * @returns US dollars, or undefined when it has no cost line
 */
export function messageCost(message: string): number | undefined {
    const costs = Array.from(message.matchAll(COST_LINE), ([, value]) => Number(value))

    return costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) : undefined
}

/**
 * Add trailers to a commit message file, in git's trailer block, with one git call.
 * @param messageFile - the file
 * @param trailers - the whole lines, such as `Assisted-cost: $1.84`
 * @param ifExists - what to do when the message already has a trailer's key
 */
export async function writeTrailers(
    messageFile: string,
    trailers: readonly string[],
    ifExists: IfTrailerExists,
): Promise<void> {
    await git([
        'interpret-trailers',
        '--in-place',
        '--if-exists',
        ifExists,
        ...trailers.flatMap(trailer => ['--trailer', trailer]),
        messageFile,
    ])
}
