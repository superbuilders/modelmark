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
