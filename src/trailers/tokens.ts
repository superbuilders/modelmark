import { TOKEN_KINDS, TOKENS_TRAILER_KEY } from './constants'
import { TOKEN_COUNT, TOKENS_LINE } from './patterns'

import type { TokenCounts } from './types'

/** No tokens. */
const NO_TOKENS: TokenCounts = { input: 0, cacheWrite: 0, output: 0, cacheRead: 0 }

/** Each kind by the name the tokens trailer gives it, for reading a line back. */
const KIND_BY_NAME: Readonly<Record<string, keyof TokenCounts>> = Object.fromEntries(
    Object.entries(TOKEN_KINDS).map(([kind, name]) => [name, kind as keyof TokenCounts]),
)

/**
 * Add up token counts.
 * @param counts - the counts, such as each reply's
 * @returns their sum
 */
export function addTokens(counts: readonly TokenCounts[]): TokenCounts {
    return counts.reduce(
        (sum, count) => ({
            input: sum.input + count.input,
            cacheWrite: sum.cacheWrite + count.cacheWrite,
            output: sum.output + count.output,
            cacheRead: sum.cacheRead + count.cacheRead,
        }),
        NO_TOKENS,
    )
}

/**
 * The tokens a model took in or wrote anew: everything but cache reads,
 * which re-read context already counted and would swamp the rest.
 * @param counts - the counts
 * @returns fresh input, cache writes and output together
 */
export function newTokens(counts: TokenCounts): number {
    return counts.input + counts.cacheWrite + counts.output
}

/**
 * The full tokens trailer line.
 * @param counts - the counts
 * @returns `Assisted-tokens: 12000 input, 80000 cache-write, 45000 output, 3100000 cache-read`
 */
export function tokensTrailer(counts: TokenCounts): string {
    const parts = Object.entries(TOKEN_KINDS).map(
        ([kind, name]) => `${counts[kind as keyof TokenCounts]} ${name}`,
    )

    return `${TOKENS_TRAILER_KEY}: ${parts.join(', ')}`
}

/**
 * The sum of every tokens line in a commit message.
 * @param message - the message
 * @returns the counts, or undefined when it has no tokens line
 */
export function messageTokens(message: string): TokenCounts | undefined {
    let counts: TokenCounts | undefined

    for (const [, value] of message.matchAll(TOKENS_LINE)) {
        counts ??= { ...NO_TOKENS }

        for (const [, count, name] of value.matchAll(TOKEN_COUNT)) {
            counts[KIND_BY_NAME[name.toLowerCase()]] += Number(count)
        }
    }

    return counts
}
