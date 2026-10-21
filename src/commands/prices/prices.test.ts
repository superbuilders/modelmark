import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { CATALOG_URL } from '../../agents/constants'
import { refreshPricesCommand } from './prices'

afterEach(() => {
    vi.unstubAllGlobals()
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
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }))

    await expect(refreshPricesCommand({ XDG_CACHE_HOME: tmpdir() })).rejects.toThrow(/503/)
})
