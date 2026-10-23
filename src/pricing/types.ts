/**
 * The tokens one model reply used, split so no token is in two buckets, since
 * each bucket has its own price.
 */
export interface TokenUse {
    /** The model as the agent's log names it, or null when the log names none. */
    model: string | null
    /** Input the model read fresh, not from the prompt cache. */
    input: number
    /** Input read back from the prompt cache. */
    cacheRead: number
    /** Input written to the prompt cache. */
    cacheWrite: number

    /**
     * The part of `cacheWrite` the log splits by how long the cache keeps it,
     * by lifetime label (`5m`, `1h`). Writes it leaves out are at the
     * provider's default lifetime.
     */
    cacheWriteByTtl?: Readonly<Record<string, number>>

    /** Output, thinking included. */
    output: number
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
