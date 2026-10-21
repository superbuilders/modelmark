import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { writeState } from '../system/state'
import { PRICE_REFRESH_STATE } from './constants'
import { loadPriceList, priceList, priceRefreshDue } from './prices'

test('keeps first-party prices by model id, with context tiers', () => {
    const list = priceList({
        openrouter: {
            models: {
                'gpt-6.1-sol': { cost: { input: 9, output: 9 } },
                'resold-1': { cost: { input: 9, output: 9 } },
            },
        },
        openai: {
            models: {
                'gpt-6.1-sol': {
                    cost: {
                        input: 2,
                        output: 10,
                        cache_read: 0.1,
                        tiers: [
                            { input: 4, output: 15, tier: { type: 'context', size: 272_000 } },
                            { input: 1, output: 1, tier: { type: 'time' } },
                        ],
                    },
                },
                'no-price': {},
            },
        },
        anthropic: { models: { 'claude-opus-5-5': { cost: { input: 4, output: 20 } } } },
    })

    expect(list).toEqual({
        'claude-opus-5-5': { input: 4, output: 20 },
        'gpt-6.1-sol': {
            input: 2,
            output: 10,
            cacheRead: 0.1,
            tiers: [{ input: 4, output: 15, above: 272_000 }],
        },
    })
    expect(Object.keys(list)).toEqual(['claude-opus-5-5', 'gpt-6.1-sol'])
})

describe('loadPriceList', () => {
    test('the cached copy updates the shipped list, which stays underneath', () => {
        const cache = mkdtempSync(join(tmpdir(), 'modelmark-prices-'))

        mkdirSync(join(cache, 'modelmark'))
        writeFileSync(
            join(cache, 'modelmark', 'prices.json'),
            JSON.stringify({
                'brand-new-1': { input: 1, output: 2 },
                'claude-opus-5-5': { input: 3, output: 9 },
            }),
        )

        const prices = loadPriceList({ XDG_CACHE_HOME: cache })

        expect(prices['brand-new-1']).toEqual({ input: 1, output: 2 })
        expect(prices['claude-opus-5-5']).toEqual({ input: 3, output: 9 })
        expect(prices['gpt-5.6-terra']).toBeDefined()
    })
})

describe('priceRefreshDue', () => {
    const now = 10 * 86_400_000

    /**
     * An environment whose last refresh was some time ago.
     * @param ago - how long ago (ms), or undefined for never
     * @returns the environment
     */
    function refreshedAgo(ago?: number): Record<string, string> {
        const env = { XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'modelmark-prices-')) }

        if (ago !== undefined) {
            writeState(PRICE_REFRESH_STATE, String(now - ago), env)
        }

        return env
    }

    test('a day after the last refresh, or never refreshed', () => {
        expect(priceRefreshDue(refreshedAgo(), false, now)).toBe(true)
        expect(priceRefreshDue(refreshedAgo(23 * 3_600_000), false, now)).toBe(false)
        expect(priceRefreshDue(refreshedAgo(25 * 3_600_000), false, now)).toBe(true)
    })

    test('an hour after it when a model had no price', () => {
        expect(priceRefreshDue(refreshedAgo(30 * 60_000), true, now)).toBe(false)
        expect(priceRefreshDue(refreshedAgo(2 * 3_600_000), true, now)).toBe(true)
    })

    test('never when offline', () => {
        expect(priceRefreshDue({ ...refreshedAgo(), MODELMARK_OFFLINE: '1' }, true, now)).toBe(
            false,
        )
    })
})
