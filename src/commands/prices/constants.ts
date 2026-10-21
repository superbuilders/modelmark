/** The ways `prices` can print. */
export const PRICE_FORMATS = ['text', 'json', 'table'] as const

/** The table's columns. */
export const PRICE_HEADER = ['Model', 'Context', 'Input', 'Output', 'Cache read', 'Cache write']

/** How many columns, from the left, hold words rather than prices. */
export const WORD_COLUMNS = 2

/** A cache price the list leaves out, which costing charges at the input price. */
export const INPUT_RATE = '=in'

/** What a model the list has no price for shows in the input column. */
export const NO_PRICE = 'no price'
