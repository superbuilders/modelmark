import { Command } from 'commander'

import { PRICES_FILE } from '../../src/agents/constants'
import { refreshPrices } from './lib/refresh'

new Command()
    .name('prices')
    .description(`Refresh ${PRICES_FILE} from models.dev's catalog`)
    .action(refreshPrices)
    .parseAsync()
