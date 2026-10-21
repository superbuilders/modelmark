import { describe, expect, test } from 'vitest'

import { markTrailer, markValue, parseMark } from './mark'

describe('parseMark', () => {
    test.each([
        [
            'claude-code:claude-opus-5-5@high',
            { agent: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
        ],
        ['pi:kimi-k3', { agent: 'pi', model: 'kimi-k3', effort: null }],
        ['other-tool', { agent: 'other-tool', model: '', effort: null }],
    ])('splits %s', (value, parts) => {
        expect(parseMark(value)).toEqual(parts)
    })

    test('reverses markValue', () => {
        const detection = {
            agent: 'codex',
            via: 'process-tree',
            model: 'gpt-5.6-terra',
            effort: 'medium',
        } as const

        expect(parseMark(markValue(detection))).toEqual({
            agent: 'codex',
            model: 'gpt-5.6-terra',
            effort: 'medium',
        })
    })
})

test('markTrailer writes the whole line, with unknown for a model the log did not give', () => {
    expect(markTrailer({ agent: 'pi', model: null, effort: null })).toBe('Assisted-by: pi:unknown')
})
