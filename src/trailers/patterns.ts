import { COST_TRAILER_KEY, TRAILER_KEY } from './constants'

/**
 * A mark line anywhere in a commit message, not only in git's trailer block:
 * a squash merge keeps each branch commit's mark in the middle of its body.
 */
export const MARK_LINE = new RegExp(`^${TRAILER_KEY}:[ \\t]*(\\S.*)$`, 'gim')

/** A cost line anywhere in a commit message, for the same reason: `Assisted-cost: $1.84`. */
export const COST_LINE = new RegExp(
    `^${COST_TRAILER_KEY}:[ \\t]*\\$?(\\d+(?:\\.\\d+)?)[ \\t]*$`,
    'gim',
)
