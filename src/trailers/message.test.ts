import { describe, expect, test } from 'vitest'

import { marksIn, messageCost } from './message'

test('marksIn finds every mark, anywhere in the message', () => {
    expect(
        marksIn(
            'Squash\n\nAssisted-by: pi:kimi-k3\n\n* two\n\nassisted-by:  codex:gpt-5.6-terra@high \n',
        ),
    ).toEqual(['pi:kimi-k3', 'codex:gpt-5.6-terra@high'])
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
