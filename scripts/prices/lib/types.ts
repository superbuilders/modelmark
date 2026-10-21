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
