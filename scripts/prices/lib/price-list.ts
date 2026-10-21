import { FIRST_PARTY_PROVIDERS } from './constants'

import type { ModelPrice, PriceList, Rates } from '../../../src/agents/types'
import type { Catalog, CatalogCost } from './types'

/**
 * A catalog cost as modelmark's rates, or undefined when it lacks an input or output price.
 * @param cost - the catalog's cost
 * @returns the rates
 */
function rates(cost: CatalogCost): Rates | undefined {
    if (cost.input === undefined || cost.output === undefined) {
        return undefined
    }

    return {
        input: cost.input,
        output: cost.output,
        ...(cost.cache_read !== undefined && { cacheRead: cost.cache_read }),
        ...(cost.cache_write !== undefined && { cacheWrite: cost.cache_write }),
    }
}

/**
 * A catalog cost as a model price, keeping only tiers set by input size.
 * @param cost - the catalog's cost
 * @returns the price, or undefined when the base rates are incomplete
 */
function modelPrice(cost: CatalogCost): ModelPrice | undefined {
    const base = rates(cost)

    if (!base) {
        return undefined
    }

    const tiers = (cost.tiers ?? []).flatMap(tier => {
        const tierRates = rates(tier)

        return tierRates && tier.tier?.type === 'context' && tier.tier.size !== undefined
            ? [{ ...tierRates, above: tier.tier.size }]
            : []
    })

    return tiers.length > 0 ? { ...base, tiers } : base
}

/**
 * The price list modelmark ships: every first-party model's prices by model
 * id, sorted so a refresh shows only real changes.
 * @param catalog - models.dev's catalog
 * @returns the list
 */
export function priceList(catalog: Catalog): PriceList {
    const list: Record<string, ModelPrice> = {}

    for (const provider of FIRST_PARTY_PROVIDERS) {
        for (const [id, model] of Object.entries(catalog[provider]?.models ?? {})) {
            const price = model.cost && modelPrice(model.cost)

            if (price && !Object.hasOwn(list, id)) {
                list[id] = price
            }
        }
    }

    return Object.fromEntries(Object.entries(list).toSorted(([a], [b]) => (a < b ? -1 : 1)))
}
