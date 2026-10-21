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
