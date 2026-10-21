import type { PRICE_FORMATS } from './constants'

/**
 * A way `prices` can print.
 */
export type PriceFormat = (typeof PRICE_FORMATS)[number]

/**
 * Options `prices` takes.
 */
export interface PricesOptions {
    /** Show every model the list has. */
    all?: boolean
    /** How to print. */
    format?: PriceFormat
    /** Shorthand for `format: 'json'`. */
    json?: boolean
}
