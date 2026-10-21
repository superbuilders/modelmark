import { writeFileSync } from 'node:fs'

import { Command } from 'commander'

import { CATALOG_URL, PRICES_FILE } from './lib/constants'
import { priceList } from './lib/price-list'

import type { Catalog } from './lib/types'

new Command()
    .name('prices')
    .description(`Refresh ${PRICES_FILE} from models.dev's catalog`)
    .action(async () => {
        const response = await fetch(CATALOG_URL)

        if (!response.ok) {
            throw new Error(`${CATALOG_URL} answered ${response.status}`)
        }

        const list = priceList((await response.json()) as Catalog)

        writeFileSync(PRICES_FILE, `${JSON.stringify(list, null, 4)}\n`)
        console.log(`${PRICES_FILE}: ${Object.keys(list).length} models`)
    })
    .parseAsync()
