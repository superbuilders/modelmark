import { CACHE_LIFETIMES } from './constants'

import type { ModelPrice, PriceList, Rates, TokenUse } from './types'

/**
 * A model's id in the price list. A gateway names a model with its own prefix
 * (`anthropic-primary/claude-opus-5-5`), so only the part after the last `/`
 * counts.
 * @param model - the model as a log or a mark names it
 * @returns the id, such as `claude-opus-5-5`
 */
export function modelId(model: string): string {
    return model.slice(model.lastIndexOf('/') + 1)
}

/**
 * A model's prices.
 * @param model - the model as a log names it
 * @param prices - the price list
 * @returns its prices, or undefined when the list doesn't have it
 */
export function priceOf(model: string, prices: PriceList): ModelPrice | undefined {
    const id = modelId(model)

    return Object.hasOwn(prices, id) ? prices[id] : undefined
}

/**
 * What a reply's cache writes cost: those at a longer lifetime at its
 * multiple of the input price, the rest at the cache-write price.
 * @param use - the reply's tokens
 * @param rates - the prices that apply to it, per million tokens
 * @returns the writes' tokens times their prices (US dollars times a million), or null when a lifetime has no known price
 */
function cacheWriteCost(use: TokenUse, rates: Rates): number | null {
    const defaultRate = rates.cacheWrite ?? rates.input
    let atDefault = use.cacheWrite
    let cost = 0

    for (const [ttl, tokens] of Object.entries(use.cacheWriteByTtl ?? {})) {
        const lifetime = Object.hasOwn(CACHE_LIFETIMES, ttl) ? CACHE_LIFETIMES[ttl] : undefined

        if (lifetime === undefined) {
            return null
        }

        if (lifetime !== 'default') {
            atDefault -= tokens
            cost += tokens * rates.input * lifetime
        }
    }

    return cost + atDefault * defaultRate
}

/**
 * What one reply cost. A tier's prices apply to the whole reply once its input
 * passes the tier's size, not only to the tokens past it.
 * @param use - the reply's tokens
 * @param price - its model's prices
 * @returns US dollars, or null when its cache writes name a lifetime with no known price
 */
function replyCost(use: TokenUse, price: ModelPrice): number | null {
    const context = use.input + use.cacheRead + use.cacheWrite
    const rates = (price.tiers ?? []).reduce<ModelPrice>(
        (chosen, tier) => (context > tier.above ? tier : chosen),
        price,
    )
    const writes = cacheWriteCost(use, rates)

    if (writes === null) {
        return null
    }

    return (
        (use.input * rates.input +
            use.cacheRead * (rates.cacheRead ?? rates.input) +
            writes +
            use.output * rates.output) /
        1_000_000
    )
}

/**
 * What a set of replies cost at list prices.
 * @param uses - the replies
 * @param prices - the price list
 * @returns US dollars, or null when any reply can't be priced (a partial sum would read as the whole)
 */
export function usesCost(uses: TokenUse[], prices: PriceList): number | null {
    let total = 0

    for (const use of uses) {
        const price = use.model === null ? undefined : priceOf(use.model, prices)
        const cost = price && replyCost(use, price)

        if (cost === undefined || cost === null) {
            return null
        }

        total += cost
    }

    return total
}
