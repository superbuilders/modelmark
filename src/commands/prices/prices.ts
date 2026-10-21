import { PRICES_FILE } from '../../agents/constants'
import { fetchPriceList } from '../../agents/prices'
import { cachePath, writeWhole } from '../../system/state'

/**
 * Fetch the latest prices into the cache folder, where every later commit
 * finds them. The hook starts this in the background, so nobody waits on it.
 * @param env - the environment
 */
export async function refreshPricesCommand(env = process.env): Promise<void> {
    writeWhole(cachePath(PRICES_FILE, env), `${JSON.stringify(await fetchPriceList())}\n`)
}
