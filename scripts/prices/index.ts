import { Command } from 'commander'

import { PRICES_FILE } from '../../src/pricing/constants'
import { refreshPrices } from './lib/refresh'

new Command()
    .name('prices')
    .description(`Refresh ${PRICES_FILE} from models.dev's catalog`)
    .action(refreshPrices)
    .parseAsync()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
