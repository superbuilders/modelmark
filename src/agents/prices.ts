import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { cachePath, readState } from '../system/state'
import {
    CATALOG_URL,
    CI_VARIABLES,
    FIRST_PARTY_PROVIDERS,
    OFFLINE_VARIABLE,
    PRICE_FETCH_TIMEOUT_MS,
    PRICE_REFRESH_MS,
    PRICE_REFRESH_STATE,
    PRICES_FILE,
} from './constants'

import type { Env } from '../system/types'
import type { Catalog, CatalogCost, ModelPrice, PriceList, Rates } from './types'

/** The price list modelmark ships, beside its source. */
export const SHIPPED_PRICES = fileURLToPath(new URL(`../../${PRICES_FILE}`, import.meta.url))

/**
 * Read a price list file.
 * @param path - the file
 * @returns the prices, or none when the file can't be read
 */
export function readPriceList(path: string): PriceList {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as PriceList
    } catch {
        return {}
    }
}

/**
 * The prices a commit is costed with: the list modelmark shipped with, updated
 * by the fresher copy a refresh left in the cache folder. The shipped list
 * stays underneath, so a cached copy that can't be read loses nothing.
 * @param env - the environment
 * @returns the prices
 */
export function loadPriceList(env: Env): PriceList {
    return { ...readPriceList(SHIPPED_PRICES), ...readPriceList(cachePath(PRICES_FILE, env)) }
}

/**
 * Whether a CI variable says this is CI: set, and not `0` or `false`.
 * @param value - the variable's value
 * @returns true in CI
 */
function inCi(value: string | undefined): boolean {
    return value !== undefined && value !== '0' && value !== 'false'
}

/**
 * Whether a commit should start a price refresh: never when offline or in CI,
 * else when the last one is an hour old.
 * @param env - the environment
 * @param now - the time (ms since the epoch)
 * @returns true when a refresh is due
 */
export function priceRefreshDue(env: Env, now = Date.now()): boolean {
    if (env[OFFLINE_VARIABLE] || CI_VARIABLES.some(key => inCi(env[key]))) {
        return false
    }

    const age = now - Number(readState(PRICE_REFRESH_STATE, env) ?? 0)

    return age > PRICE_REFRESH_MS
}

/**
 * Fetch models.dev's catalog as a price list.
 * @returns the prices
 */
export async function fetchPriceList(): Promise<PriceList> {
    const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
        throw new Error(`${CATALOG_URL} answered ${response.status}`)
    }

    return priceList((await response.json()) as Catalog)
}

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
 * The price list from models.dev's catalog: every first-party model's prices
 * by model id, sorted so a refresh shows only real changes.
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
