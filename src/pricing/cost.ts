import type { ModelPrice, PriceList, TokenUse } from './types'

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
 * What one reply cost. A tier's prices apply to the whole reply once its input
 * passes the tier's size, not only to the tokens past it.
 * @param use - the reply's tokens
 * @param price - its model's prices
 * @returns US dollars
 */
function replyCost(use: TokenUse, price: ModelPrice): number {
    const context = use.input + use.cacheRead + use.cacheWrite
    const rates = (price.tiers ?? []).reduce<ModelPrice>(
        (chosen, tier) => (context > tier.above ? tier : chosen),
        price,
    )

    return (
        (use.input * rates.input +
            use.cacheRead * (rates.cacheRead ?? rates.input) +
            use.cacheWrite * (rates.cacheWrite ?? rates.input) +
            use.output * rates.output) /
        1_000_000
    )
}

/**
 * What a set of replies cost at list prices.
 * @param uses - the replies
 * @param prices - the price list
 * @returns US dollars, or null when any reply's model has no price (a partial sum would read as the whole)
 */
export function usesCost(uses: TokenUse[], prices: PriceList): number | null {
    let total = 0

    for (const use of uses) {
        const price = priceOf(use.model, prices)

        if (!price) {
            return null
        }

        total += replyCost(use, price)
    }

    return total
}
