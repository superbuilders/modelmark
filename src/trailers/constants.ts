/**
 * The commit trailer modelmark writes. The Linux kernel introduced it for
 * naming an AI tool, then stopped asking for it; the `@effort` part and the
 * cost trailer are modelmark's own.
 */
export const TRAILER_KEY = 'Assisted-by'

/** The commit trailer holding the estimated cost of the replies behind a commit. */
export const COST_TRAILER_KEY = 'Assisted-cost'

/** Written in place of the model when the agent's log could not be read. */
export const UNKNOWN_MODEL = 'unknown'

/** Separates the agent from the model in a mark: `codex:gpt-5.6-terra`. */
export const AGENT_SEPARATOR = ':'

/** Separates the model from its effort in a mark: `codex:gpt-5.6-terra@high`. */
export const EFFORT_SEPARATOR = '@'

/** The commit trailer holding the tokens the replies behind a commit used. */
export const TOKENS_TRAILER_KEY = 'Assisted-tokens'

/**
 * Each kind of token as the tokens trailer names it, in the order it writes
 * them: `Assisted-tokens: 12000 input, 80000 cache-write, 45000 output, 3100000 cache-read`.
 */
export const TOKEN_KINDS = {
    input: 'input',
    cacheWrite: 'cache-write',
    output: 'output',
    cacheRead: 'cache-read',
} as const
