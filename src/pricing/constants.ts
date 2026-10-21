/** The price list modelmark ships, relative to modelmark's own folder; the fresher copy in the user's cache folder has the same name. */
export const PRICES_FILE = 'prices.json'

/** Where models.dev publishes its catalog. */
export const CATALOG_URL = 'https://models.dev/api.json'

/**
 * The providers whose own prices are kept, in the order a model id two of them
 * share is taken from. Resellers and gateways are left out: their prices carry
 * their markup, and a gateway's model id ends in the first-party id anyway.
 */
export const FIRST_PARTY_PROVIDERS = [
    'anthropic',
    'openai',
    'google',
    'xai',
    'deepseek',
    'moonshotai',
    'mistral',
    'alibaba',
    'zai',
    'minimax',
    'meta',
] as const

/** Set to anything to turn off price downloads; prices already downloaded still apply. */
export const OFFLINE_VARIABLE = 'MODELMARK_OFFLINE'

/**
 * The variables CI services set; a refresh there is skipped, since the
 * machine and its cache are thrown away after the job. The check is
 * sindresorhus/is-in-ci's, which update-notifier uses: set, and not `0` or
 * `false`.
 */
export const CI_VARIABLES: readonly string[] = ['CI', 'CONTINUOUS_INTEGRATION']

/** How old the last price refresh may be before a commit starts another. */
export const PRICE_REFRESH_MS = 3_600_000

/** The longest a price refresh waits for models.dev. */
export const PRICE_FETCH_TIMEOUT_MS = 20_000

/** Where the time of the last price refresh is kept, under the state folder. */
export const PRICE_REFRESH_STATE = 'prices-refreshed'
