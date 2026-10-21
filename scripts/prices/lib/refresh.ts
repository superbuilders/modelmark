import { writeFileSync } from 'node:fs'

import { PRICES_FILE } from '../../../src/agents/constants'
import { CATALOG_URL } from './constants'
import { priceList } from './price-list'

import type { Catalog } from './types'

/**
 * Fetch models.dev's catalog and write the price list modelmark ships.
 */
export async function refreshPrices(): Promise<void> {
    const response = await fetch(CATALOG_URL)

    if (!response.ok) {
        throw new Error(`${CATALOG_URL} answered ${response.status}`)
    }

    const list = priceList((await response.json()) as Catalog)

    writeFileSync(PRICES_FILE, `${JSON.stringify(list, null, 4)}\n`)
    console.log(`${PRICES_FILE}: ${Object.keys(list).length} models`)
}
