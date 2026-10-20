import { TRAILER_KEY } from '../../agents/constants'

/**
 * A mark line anywhere in a commit message, not only in git's trailer block:
 * a squash merge keeps each branch commit's mark in the middle of its body.
 */
export const MARK_LINE = new RegExp(`^${TRAILER_KEY}:[ \\t]*(\\S.*)$`, 'gim')
