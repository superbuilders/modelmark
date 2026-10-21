import { describe, expect, test } from 'vitest'

import { addTokens, messageTokens, newTokens, tokensTrailer } from './tokens'

const COUNTS = { input: 12_000, cacheWrite: 80_000, output: 45_000, cacheRead: 3_100_000 }

test('tokensTrailer writes every kind, cache reads last', () => {
    expect(tokensTrailer(COUNTS)).toBe(
        'Assisted-tokens: 12000 input, 80000 cache-write, 45000 output, 3100000 cache-read',
    )
})

test('newTokens leaves out cache reads', () => {
    expect(newTokens(COUNTS)).toBe(137_000)
})

test('addTokens adds each kind', () => {
    expect(addTokens([COUNTS, COUNTS])).toEqual({
        input: 24_000,
        cacheWrite: 160_000,
        output: 90_000,
        cacheRead: 6_200_000,
    })
})

describe('messageTokens', () => {
    test('reads back what tokensTrailer writes', () => {
        expect(messageTokens(`Fix it\n\n${tokensTrailer(COUNTS)}\n`)).toEqual(COUNTS)
    })

    test('adds up every tokens line, anywhere in the message, in any order', () => {
        expect(
            messageTokens(
                'Squash\n\nAssisted-tokens: 5 output, 1 input\n\n* two\n\nassisted-tokens: 2 Cache-Read, 3 input\n',
            ),
        ).toEqual({ input: 4, cacheWrite: 0, output: 5, cacheRead: 2 })
    })

    test('a message without one has no tokens', () => {
        expect(messageTokens('Fix it\n\nAssisted-cost: $1.84\n')).toBeUndefined()
    })
})
