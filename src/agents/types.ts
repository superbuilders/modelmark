/**
 * A coding agent modelmark recognizes, named as it appears in the trailer.
 */
export type AgentId = 'claude-code' | 'codex' | 'pi'

/**
 * How the agent was found: walking up the process tree, (when the walk could
 * not see far enough) the markers the agent leaves in the environment, or the
 * mark an agent modelmark doesn't know declares for itself.
 */
export type DetectionSource = 'process-tree' | 'environment' | 'declared'

/**
 * The agent running this command.
 */
export interface FoundAgent {
    /** Which agent. */
    agent: AgentId
    /** How it was found. */
    via: Exclude<DetectionSource, 'declared'>
}

/**
 * The model behind an agent's latest reply, and how hard it was asked to think.
 */
export interface ModelUse {
    /** The model id as the agent's log records it, or null when the log could not be read. */
    model: string | null
    /** The reasoning effort (such as `high`) as the agent records it, or null when it records none. */
    effort: string | null
}

/**
 * An agent modelmark doesn't know, named by the mark it declares.
 */
export interface DeclaredAgent {
    /** The agent, a plain string because modelmark doesn't know it. */
    agent: string
    /** How it was found. */
    via: Extract<DetectionSource, 'declared'>
}

/**
 * The agent running this command and the model behind its latest reply.
 */
export type Detection = (FoundAgent | DeclaredAgent) & ModelUse

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
 * An operating system modelmark runs on, named as the tested-versions record names it.
 */
export type Platform = 'linux' | 'macos'

/**
 * A harness version that passed every lab scenario run against it.
 */
export interface TestedVersion {
    /** The version, as the harness reports it. */
    version: string
    /** The day it passed, `yyyy-mm-dd`. */
    date: string
}

/**
 * The newest tested version of each harness on each platform.
 */
export type TestedRecord = Partial<Record<Platform, Partial<Record<AgentId, TestedVersion>>>>

/**
 * The tokens one model reply used, split so no token is in two buckets, since
 * each bucket has its own price.
 */
export interface TokenUse {
    /** The model as the agent's log names it. */
    model: string
    /** Input the model read fresh, not from the prompt cache. */
    input: number
    /** Input read back from the prompt cache. */
    cacheRead: number
    /** Input written to the prompt cache. */
    cacheWrite: number
    /** Output, thinking included. */
    output: number
}

/**
 * The replies an agent's logs hold after a point in time.
 */
export interface LoggedUse {
    /** Each reply's tokens. */
    uses: TokenUse[]
    /** When the newest of them was written (ms since the epoch), or undefined when there are none. */
    through: number | undefined
}

/**
 * The replies a session made after a point in time.
 */
export interface SessionUse extends LoggedUse {
    /** The session, named the same across its commits. */
    session: string
}

/**
 * A model's prices in US dollars per million tokens.
 */
export interface Rates {
    /** Fresh input. */
    input: number
    /** Output, thinking included. */
    output: number
    /** Input read from the prompt cache; input's price when the list gives none. */
    cacheRead?: number
    /** Input written to the prompt cache; input's price when the list gives none. */
    cacheWrite?: number
}

/**
 * A model's prices, with the dearer prices a reply pays once its input passes a size.
 */
export interface ModelPrice extends Rates {
    /** Each tier applies to a whole reply whose input (fresh plus cached) is more than `above` tokens. */
    tiers?: (Rates & { above: number })[]
}

/**
 * Prices by model id, as models.dev's first-party providers list them.
 */
export type PriceList = Readonly<Record<string, ModelPrice>>

/**
 * One model's prices as models.dev's catalog gives them, in US dollars per
 * million tokens. Any field may be missing.
 */
export interface CatalogCost {
    /** Fresh input. */
    input?: number
    /** Output, thinking included. */
    output?: number
    /** Input read from the prompt cache. */
    cache_read?: number
    /** Input written to the prompt cache, at the 5-minute rate. */
    cache_write?: number
    /** Dearer prices past a size; only `context` tiers (by input tokens) are kept. */
    tiers?: (CatalogCost & { tier?: { type?: string; size?: number } })[]
}

/**
 * models.dev's catalog: providers by id, each with its models by id.
 */
export type Catalog = Record<string, { models?: Record<string, { cost?: CatalogCost }> }>
