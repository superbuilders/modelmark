import { writeFileSync } from 'node:fs'

import { PRICES_FILE } from '../../../src/agents/constants'
import { fetchPriceList } from '../../../src/agents/prices'

/**
 * Fetch models.dev's catalog and write the price list modelmark ships.
 */
export async function refreshPrices(): Promise<void> {
    const list = await fetchPriceList()

    writeFileSync(PRICES_FILE, `${JSON.stringify(list, null, 4)}\n`)
    console.log(`${PRICES_FILE}: ${Object.keys(list).length} models`)
}
