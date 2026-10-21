import { newTokens } from '../../trailers/tokens'

import type { TokenCounts } from '../../trailers/types'

/**
 * A count of commits, in words.
 * @param count - how many
 * @returns `1 commit` or `N commits`
 */
export function commitsText(count: number): string {
    return count === 1 ? '1 commit' : `${count} commits`
}

/**
 * An estimated cost, in words.
 * @param usd - US dollars
 * @returns `~$1.84`
 */
export function costText(usd: number): string {
    return `~$${usd.toFixed(2)}`
}

/**
 * A token count, short: whole numbers under a thousand, then thousands and
 * millions, with one decimal under ten.
 * @param count - how many tokens
 * @returns `950`, `4.2k`, `62k`, `3.1M`
 */
export function tokenCountText(count: number): string {
    for (const [size, unit] of [
        [1e9, 'B'],
        [1e6, 'M'],
        [1e3, 'k'],
    ] as const) {
        if (count >= size) {
            const scaled = count / size

            return `${scaled < 10 ? Number(scaled.toFixed(1)) : Math.round(scaled)}${unit}`
        }
    }

    return String(Math.round(count))
}

/**
 * The tokens a model took in or wrote anew, in words.
 * @param tokens - the counts
 * @returns `137k tokens`
 */
export function newTokensText(tokens: TokenCounts): string {
    return `${tokenCountText(newTokens(tokens))} tokens`
}

/**
 * What a badge's token piece says on hover: the tokens, and the cache reads
 * left out of them.
 * @param tokens - the counts
 * @returns `156k new tokens, plus 3.1M read from cache`
 */
export function tokensHover(tokens: TokenCounts): string {
    return `${tokenCountText(newTokens(tokens))} new tokens, plus ${tokenCountText(tokens.cacheRead)} read from cache`
}

/**
 * The tokens read back from the prompt cache, in words.
 * @param tokens - the counts
 * @returns `3.1M cached`
 */
export function cachedText(tokens: TokenCounts): string {
    return `${tokenCountText(tokens.cacheRead)} cached`
}
