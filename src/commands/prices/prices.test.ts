import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { CATALOG_URL } from '../../agents/constants'
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
         */
        function commit(message: string): void {
            execFileSync(
                'git',
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
                { cwd: repo },
            )
        }

        execFileSync('git', ['init', '-q'], { cwd: repo })
        commit('One\n\nAssisted-by: codex:zz-tiered-1@high')
        commit('Two\n\nAssisted-by: pi:gateway/zz-plain-1\nAssisted-by: jojo:mystery-9')
        commit('Three\n\nAssisted-by: pi:unknown\nAssisted-by: pi:zz-plain-1')

        const output = await printed(undefined, { format: 'table' }, cached(), repo)

        expect(output.split('\n').map(line => line.split('|')[1]?.trim())).toEqual([
            'Model',
            '-----------',
            'mystery-9',
            'zz-plain-1',
            'zz-tiered-1',
            '',
        ])
        expect(output).toMatch(/mystery-9 +\| +\| no price/)
    })

    test('says how to see prices when no commit is marked', async () => {
        const repo = mkdtempSync(join(tmpdir(), 'modelmark-prices-repo-'))

        expect(await printed(undefined, {}, cached(), repo)).toMatch(
            /^No commits here carry a mark yet/,
        )
    })

    test('JSON has the rates as numbers and when they were fetched', async () => {
        const output = JSON.parse(await printed('zz-plain', { json: true }, cached()))

        expect(output.prices).toEqual({ 'zz-plain-1': { input: 0.3, output: 1.2 } })
        expect(Date.parse(output.fetched)).toBeGreaterThan(0)
    })
})
