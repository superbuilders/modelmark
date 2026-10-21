import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { CATALOG_URL } from '../../pricing/constants'
import { git } from '../../system/command'
import { pricesCommand, refreshPricesCommand } from './prices'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

test("writes models.dev's first-party prices to the cache folder", async () => {
    const cache = mkdtempSync(join(tmpdir(), 'modelmark-refresh-'))
    const fetch = vi.fn(async () =>
        Response.json({
            anthropic: { models: { 'claude-opus-5-5': { cost: { input: 4, output: 20 } } } },
        }),
    )

    vi.stubGlobal('fetch', fetch)
    await refreshPricesCommand({ XDG_CACHE_HOME: cache })

    expect(fetch).toHaveBeenCalledWith(CATALOG_URL, expect.anything())
    expect(JSON.parse(readFileSync(join(cache, 'modelmark', 'prices.json'), 'utf8'))).toEqual({
        'claude-opus-5-5': { input: 4, output: 20 },
    })
})

test('leaves the cached copy alone when models.dev fails', async () => {
    const cache = mkdtempSync(join(tmpdir(), 'modelmark-refresh-'))
    const cached = join(cache, 'modelmark', 'prices.json')

    mkdirSync(join(cache, 'modelmark'))
    writeFileSync(cached, '{"kept-1":{"input":1,"output":1}}\n')
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }))

    await expect(refreshPricesCommand({ XDG_CACHE_HOME: cache })).rejects.toThrow(/503/)
    expect(readFileSync(cached, 'utf8')).toBe('{"kept-1":{"input":1,"output":1}}\n')
})

describe('prices', () => {
    /**
     * A cache folder whose price list adds two made-up models to the shipped one.
     * @returns its environment
     */
    function cached(): Record<string, string> {
        const cache = mkdtempSync(join(tmpdir(), 'modelmark-prices-'))

        mkdirSync(join(cache, 'modelmark'))
        writeFileSync(
            join(cache, 'modelmark', 'prices.json'),
            JSON.stringify({
                'zz-plain-1': { input: 0.3, output: 1.2 },
                'zz-full-1': { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
                'zz-long-1': {
                    input: 1,
                    output: 2,
                    cacheRead: 0.1,
                    cacheWrite: 1.25,
                    tiers: [
                        { input: 2, output: 4, cacheRead: 0.2, cacheWrite: 2.5, above: 1_000_000 },
                    ],
                },
                'zz-tiered-1': {
                    input: 2,
                    output: 12,
                    cacheRead: 0.2,
                    cacheWrite: 2.5,
                    tiers: [
                        { input: 4, output: 18, cacheRead: 0.4, cacheWrite: 5, above: 272_000 },
                    ],
                },
            }),
        )

        return { XDG_CACHE_HOME: cache }
    }

    /**
     * Run the command and collect what it prints.
     * @param args - its arguments
     * @returns the output
     */
    async function printed(...args: Parameters<typeof pricesCommand>): Promise<string> {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        log.mockClear()
        await pricesCommand(...args)

        return log.mock.calls.map(([line]) => String(line)).join('\n')
    }

    test('a filter lists the matching models, a row per context tier, with a note per marker', async () => {
        const output = await printed('ZZ-', {}, cached())

        expect(output).toContain('Models matching “ZZ-”')
        expect(output).toContain('fetched just now')
        expect(output).toContain('zz-plain-1   all       0.30    1.20         =in          =in')
        expect(output).toContain('zz-tiered-1  <=272k    2.00   12.00        0.20         2.50')
        expect(output).toContain('             >272k     4.00   18.00        0.40         5.00')
        expect(output).toContain('A reply past a context size')
        expect(output).toContain('=in: no cache price listed')
    })

    test("by default lists the models this repository's commits are marked with", async () => {
        const repo = mkdtempSync(join(tmpdir(), 'modelmark-prices-repo-'))

        /**
         * Commit with a message.
         * @param message - the message
         * @returns when it is made
         */
        async function commit(message: string): Promise<void> {
            await git(
                [
                    '-c',
                    'user.name=t',
                    '-c',
                    'user.email=t@t',
                    'commit',
                    '-q',
                    '--allow-empty',
                    '-m',
                    message,
                ],
                repo,
            )
        }

        await git(['init', '-q'], repo)
        await commit('One\n\nAssisted-by: codex:zz-tiered-1@high')
        await commit('Two\n\nAssisted-by: pi:gateway/zz-plain-1\nAssisted-by: jojo:mystery-9')
        await commit('Three\n\nAssisted-by: pi:unknown\nAssisted-by: pi:zz-plain-1')

        const output = await printed(undefined, { format: 'markdown' }, cached(), repo)

        expect(output.split('\n').map(line => line.split('|')[1]?.trim())).toEqual([
            'Model',
            '-----------',
            'mystery-9',
            'zz-plain-1',
            'zz-tiered-1',
            '',
        ])
        expect(output).toMatch(/mystery-9 +\| +\| no price/)
        expect(
            JSON.parse(await printed(undefined, { json: true }, cached(), repo)).prices[
                'mystery-9'
            ],
        ).toBeNull()
    })

    test('says when no model matches a filter', async () => {
        expect(await printed('no-such-model', {}, cached())).toMatch(/^No model matches/)
    })

    test('says how to see prices when no commit is marked', async () => {
        const repo = mkdtempSync(join(tmpdir(), 'modelmark-prices-repo-'))

        await git(['init', '-q'], repo)
        expect(await printed(undefined, {}, cached(), repo)).toMatch(
            /^No commits here carry a mark yet/,
        )
    })

    test('fails outside a repository unless given a model or --all', async () => {
        const folder = mkdtempSync(join(tmpdir(), 'modelmark-prices-folder-'))

        await expect(printed(undefined, {}, cached(), folder)).rejects.toThrow(
            /^Not in a git repository/,
        )
        expect(await printed('zz-plain', {}, cached(), folder)).toContain('zz-plain-1')
    })

    test('refuses a model and --all together', async () => {
        await expect(printed('zz', { all: true }, cached())).rejects.toThrow(
            'Name a model or pass --all, not both',
        )
    })

    test('Markdown stays a table when nothing matches', async () => {
        expect(await printed('no-such-model', { format: 'markdown' }, cached())).toMatch(
            /^\| Model +\| Context/,
        )
    })

    test('says how old the prices are, or that they are the shipped ones', async () => {
        const env = cached()
        const file = join(env.XDG_CACHE_HOME, 'modelmark', 'prices.json')

        for (const [minutes, words] of [
            [30, 'fetched 30 minutes ago'],
            [5 * 60, 'fetched 5 hours ago'],
            [3 * 24 * 60, 'fetched 3 days ago'],
        ] as const) {
            const time = new Date(Date.now() - minutes * 60_000)

            utimesSync(file, time, time)
            expect(await printed('zz-full', {}, env)).toContain(words)
        }

        const shipped = { XDG_CACHE_HOME: mkdtempSync(join(tmpdir(), 'modelmark-shipped-')) }

        expect(await printed('opus', {}, shipped)).toContain('as modelmark shipped them')
        expect(JSON.parse(await printed('opus', { json: true }, shipped)).fetched).toBeNull()
    })

    test('a model with every price and no tiers needs no notes', async () => {
        const output = await printed('zz-full', {}, cached())

        expect(output).toContain('zz-full-1')
        expect(output).not.toContain('=in:')
        expect(output).not.toContain('context size')
    })

    test('names a million-token context as 1M', async () => {
        expect(await printed('zz-long', {}, cached())).toContain('>1M')
    })

    test('--all lists every model', async () => {
        expect(await printed(undefined, { all: true }, cached())).toMatch(/^All \d+ models/)
    })

    test('JSON has the rates as numbers and when they were fetched', async () => {
        const output = JSON.parse(await printed('zz-plain', { json: true }, cached()))

        expect(output.prices).toEqual({ 'zz-plain-1': { input: 0.3, output: 1.2 } })
        expect(Date.parse(output.fetched)).toBeGreaterThan(0)
    })
})
