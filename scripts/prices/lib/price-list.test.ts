import { expect, test } from 'vitest'

import { priceList } from './price-list'

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
