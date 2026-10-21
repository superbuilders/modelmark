import { modelId, priceOf } from '../../pricing/cost'
import { loadPriceList, priceListFetchedAt, savePriceList } from '../../pricing/prices'
import { git, runCommand } from '../../system/command'
import { markdownTable } from '../../system/markdown'
import { UNKNOWN_MODEL } from '../../trailers/constants'
import { parseMark } from '../../trailers/mark'
import { marksIn } from '../../trailers/message'
import { INPUT_RATE, NO_PRICE, PRICE_HEADER, WORD_COLUMNS } from './constants'

import type { ModelPrice, Rates } from '../../pricing/types'
import type { Env } from '../../system/types'
import type { PricesOptions } from './types'

/**
 * Fetch the latest prices into the cache folder. The hook starts this in the
 * background, so nobody waits on it.
 * @param env - the environment
 */
export async function refreshPricesCommand(env = process.env): Promise<void> {
    await savePriceList(env)
}

/**
 * The models this repository's commits are marked with, each once: a
 * gateway's prefix (`anthropic-primary/`) is dropped, as costing drops it.
 * @param cwd - the repository (default: this process's folder)
 * @returns the models, sorted, or none in a repository with no commits yet
 */
async function markedModels(cwd?: string): Promise<string[]> {
    /*
     * With no HEAD, git exits 1 in a repository with no commits and 128
     * outside one.
     */
    const head = await runCommand(['git', 'rev-parse', '--verify', '--quiet', 'HEAD'], { cwd })

    if (head.exitCode === 1) {
        return []
    }

    if (head.exitCode !== 0) {
        throw new Error(
            'Not in a git repository; name a model, such as modelmark prices opus, or pass --all',
        )
    }

    const log = await git(['log', '--no-merges', '--format=%B', 'HEAD'], cwd)
    const models = marksIn(log).map(mark => modelId(parseMark(mark).model))

    return [...new Set(models)].filter(model => model && model !== UNKNOWN_MODEL).toSorted()
}

/** Prices with as many decimals as they need, from two up to four. */
const RATE_FORMAT = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: false,
})

/**
 * How long ago a time was, in words.
 * @param time - the time
 * @returns such as `12 minutes ago`, or `just now` within a minute
 */
function agoText(time: Date): string {
    const minutes = Math.round((Date.now() - time.getTime()) / 60_000)
    const words = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

    if (minutes < 1) {
        return 'just now'
    }

    if (minutes < 60) {
        return words.format(-minutes, 'minute')
    }

    return minutes < 48 * 60
        ? words.format(-Math.round(minutes / 60), 'hour')
        : words.format(-Math.round(minutes / 1440), 'day')
}

/**
 * A context size, short.
 * @param tokens - the size
 * @returns such as `272k` or `1M`
 */
function sizeText(tokens: number): string {
    return tokens >= 1_000_000 && tokens % 1_000_000 === 0
        ? `${tokens / 1_000_000}M`
        : `${Math.round(tokens / 1000)}k`
}

/**
 * A price per million tokens, with as many decimals as it needs, up to four.
 * @param rate - the price, or undefined when the list leaves it out
 * @returns such as `0.375`, or the input-price marker
 */
function rateText(rate: number | undefined): string {
    return rate === undefined ? INPUT_RATE : RATE_FORMAT.format(rate)
}

/**
 * A model's rows: one for its base prices, and one for each context tier.
 * @param model - the model
 * @param price - its prices, or undefined when the list lacks it
 * @returns the rows
 */
function priceRows(model: string, price: ModelPrice | undefined): string[][] {
    if (!price) {
        return [[model, '', NO_PRICE, '', '', '']]
    }

    const tiers = price.tiers ?? []
    const bands: [string, Rates][] = [
        [tiers[0] ? `<=${sizeText(tiers[0].above)}` : 'all', price],
        ...tiers.map((tier): [string, Rates] => [`>${sizeText(tier.above)}`, tier]),
    ]

    return bands.map(([context, rates], band) => [
        band === 0 ? model : '',
        context,
        rateText(rates.input),
        rateText(rates.output),
        rateText(rates.cacheRead),
        rateText(rates.cacheWrite),
    ])
}

/**
 * Rows laid out in aligned columns: words to the left, prices to the right.
 * @param rows - the header, then the body
 * @returns the table
 */
function alignedTable(rows: string[][]): string {
    const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)))

    return rows
        .map(row =>
            row
                .map((cell, column) =>
                    column < WORD_COLUMNS
                        ? cell.padEnd(widths[column])
                        : cell.padStart(widths[column]),
                )
                .join('  ')
                .trimEnd(),
        )
        .join('\n')
}

/**
 * The price table for a terminal: what it covers, where the prices come from,
 * the table, and a note for each marker it uses.
 * @param subject - what the table covers
 * @param rows - its body
 * @param fetched - when the cached prices were fetched, or undefined for the shipped list
 * @returns the text
 */
function pricesText(subject: string, rows: string[][], fetched: Date | undefined): string {
    const source = fetched ? `fetched ${agoText(fetched)}` : 'as modelmark shipped them'
    const notes = [
        rows.some(row => row[1].startsWith('>')) &&
            'A reply past a context size pays that row’s prices for all its tokens.',
        rows.some(row => row.includes(INPUT_RATE)) &&
            `${INPUT_RATE}: no cache price listed, so modelmark charges the input price.`,
    ].filter(Boolean)

    return [
        subject,
        `US dollars per million tokens, list prices from models.dev, ${source}`,
        '',
        alignedTable([PRICE_HEADER, ...rows]),
        ...(notes.length > 0 ? ['', ...notes] : []),
    ].join('\n')
}

/**
 * The models to show, and what the table says it covers.
 * @param filter - part of a model id, matched without regard to case
 * @param all - show every model
 * @param catalog - every model the price list has
 * @param cwd - the repository (default: this process's folder)
 * @returns the models and the table's subject
 */
async function chosenModels(
    filter: string | undefined,
    all: boolean,
    catalog: string[],
    cwd?: string,
): Promise<{ models: string[]; subject: string }> {
    if (filter) {
        const needle = filter.toLowerCase()

        return {
            models: catalog.filter(id => id.toLowerCase().includes(needle)),
            subject: `Models matching “${filter}”`,
        }
    }

    if (all) {
        return { models: catalog, subject: `All ${catalog.length} models` }
    }

    return {
        models: await markedModels(cwd),
        subject: 'Models this repository’s commits are marked with',
    }
}

/**
 * Print the prices modelmark costs commits with: for the models this
 * repository's commits are marked with, the models a filter matches, or all.
 * @param filter - part of a model id, matched without regard to case
 * @param options - which models and how to print
 * @param options.all - show every model the list has
 * @param options.format - how to print
 * @param options.json - shorthand for `format: 'json'`
 * @param env - the environment
 * @param cwd - the repository (default: this process's folder)
 */
export async function pricesCommand(
    filter: string | undefined,
    { all = false, format = 'text', json = false }: PricesOptions,
    env: Env = process.env,
    cwd?: string,
): Promise<void> {
    if (filter && all) {
        throw new Error('Name a model or pass --all, not both')
    }

    const prices = loadPriceList(env)
    const catalog = Object.keys(prices)
    const { models, subject } = await chosenModels(filter, all, catalog, cwd)

    if (json || format === 'json') {
        console.log(
            JSON.stringify({
                fetched: priceListFetchedAt(env)?.toISOString() ?? null,
                prices: Object.fromEntries(
                    models.map(model => [model, priceOf(model, prices) ?? null]),
                ),
            }),
        )

        return
    }

    const rows = models.flatMap(model => priceRows(model, priceOf(model, prices)))

    if (format === 'markdown') {
        console.log(markdownTable(PRICE_HEADER, rows))

        return
    }

    if (models.length === 0) {
        console.log(
            filter
                ? `No model matches “${filter}”; modelmark prices --all lists all ${catalog.length}`
                : `No commits here carry a mark yet; name a model, such as modelmark prices opus, or pass --all to list all ${catalog.length}`,
        )

        return
    }

    console.log(pricesText(subject, rows, priceListFetchedAt(env)))
}
