import { describe, expect, test } from 'vitest'

import { costValue, messageCost, readPriceList, usesCost } from './cost'

import type { PriceList, TokenUse } from './types'

const PRICES: PriceList = {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    'gpt-6.1-sol': {
        input: 2,
        output: 10,
        tiers: [{ input: 4, output: 15, cacheRead: 0.2, above: 272_000 }],
    },
}

/**
 * One reply's tokens.
 * @param model - the model
 * @param tokens - the counts that aren't zero
 * @returns the reply
 */
function reply(model: string, tokens: Partial<Omit<TokenUse, 'model'>>): TokenUse {
    return { model, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, ...tokens }
}

describe('usesCost', () => {
    test('prices each kind of token at its own rate', () => {
        const uses = [
            reply('claude-opus-5-5', {
                input: 1_000_000,
                cacheRead: 1_000_000,
                cacheWrite: 1_000_000,
                output: 1_000_000,
            }),
        ]

        expect(usesCost(uses, PRICES)).toBeCloseTo(4 + 0.2 + 5 + 20)
    })

    test("looks up a gateway's model by the part after its prefix", () => {
        expect(
            usesCost([reply('anthropic-primary/claude-opus-5-5', { output: 1_000_000 })], PRICES),
        ).toBeCloseTo(20)
    })

    test('a tier prices the whole reply once its input passes the size', () => {
        const small = reply('gpt-6.1-sol', { input: 272_000, output: 1_000_000 })
        const large = reply('gpt-6.1-sol', { input: 200_000, cacheRead: 72_001, output: 1_000_000 })

        expect(usesCost([small], PRICES)).toBeCloseTo(0.544 + 10)
        expect(usesCost([large], PRICES)).toBeCloseTo(0.8 + 72_001 * 0.2e-6 + 15)
    })

    test('a cache price the list lacks falls back to the input price', () => {
        expect(usesCost([reply('gpt-6.1-sol', { cacheWrite: 100_000 })], PRICES)).toBeCloseTo(0.2)
    })

    test('a model without a price makes the whole cost unknown', () => {
        expect(
            usesCost(
                [reply('claude-opus-5-5', { output: 1 }), reply('mystery-1', { output: 1 })],
                PRICES,
            ),
        ).toBeNull()
    })

    test('no replies cost nothing', () => {
        expect(usesCost([], PRICES)).toBe(0)
    })
})

describe('messageCost', () => {
    test('adds up every cost line, anywhere in the message', () => {
        expect(
            messageCost('Squash\n\n* one\n\nAssisted-cost: $1.25\n\n* two\n\nassisted-cost: 0.5\n'),
        ).toBeCloseTo(1.75)
    })

    test('a message without one has no cost', () => {
        expect(messageCost('Fix it\n\nAssisted-by: pi:kimi-k3\n')).toBeUndefined()
    })
})

test('costValue writes dollars and cents', () => {
    expect(costValue(1.844)).toBe('$1.84')
})

test('the shipped price list has the models modelmark is tested with', () => {
    const prices = readPriceList()

    expect(prices['claude-opus-5-5']?.input).toBeGreaterThan(0)
    expect(prices['gpt-5.6-terra']?.output).toBeGreaterThan(0)
})
