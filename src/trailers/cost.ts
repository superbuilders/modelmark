import { COST_TRAILER_KEY } from './constants'

/**
 * A cost as the trailer writes it: dollars and cents, or four places under a
 * cent so a cheap commit's cost still adds up in a summary.
 * @param usd - US dollars
 * @returns `$1.84`, or `$0.0031`
 */
export function costValue(usd: number): string {
    return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`
}

/**
 * The full cost trailer line.
 * @param usd - US dollars
 * @returns `Assisted-cost: $1.84`
 */
export function costTrailer(usd: number): string {
    return `${COST_TRAILER_KEY}: ${costValue(usd)}`
}
