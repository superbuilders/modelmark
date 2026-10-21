/**
 * What a mark is written from: an agent, the model behind its reply, and how
 * hard it was asked to think.
 */
export interface MarkSource {
    /** The agent, such as `claude-code`. */
    agent: string
    /** The model, or null when it could not be read. */
    model: string | null
    /** The effort, or null when the agent records none. */
    effort: string | null
}

/**
 * A mark read back from a commit, split into its parts. The agent is a plain
 * string because a trailer may come from a tool modelmark doesn't know.
 */
export interface MarkParts {
    /** The agent, such as `claude-code`. */
    agent: string
    /** The model, or empty when the mark names none. */
    model: string
    /** The effort, or null when the mark has none. */
    effort: string | null
}

/**
 * What `git interpret-trailers` does when the message already has the key:
 * add the trailer unless that exact line is there, or replace the old one.
 */
export type IfTrailerExists = 'addIfDifferent' | 'replace'

/**
 * Tokens added up across replies, in four kinds that never overlap.
 */
export interface TokenCounts {
    /** Input the model read fresh, not from the prompt cache. */
    input: number
    /** Input written to the prompt cache. */
    cacheWrite: number
    /** Output, thinking included. */
    output: number
    /** Input read back from the prompt cache. */
    cacheRead: number
}
