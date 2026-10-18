import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { detect, markValue, parseMark } from './mark'

test('a walk that starts at the top finds no agent', async () => {
    expect(await detect({}, 1)).toBeNull()
})

test('a found agent comes back with the model from its log', async () => {
    const home = mkdtempSync(join(tmpdir(), 'modelmark-mark-'))
    const day = join(home, 'sessions', '2026', '10', '18')

    mkdirSync(day, { recursive: true })
    writeFileSync(
        join(day, 'rollout-t-th1.jsonl'),
        `${JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-terra', effort: 'high' } })}\n`,
    )

    expect(
        await detect({ CODEX_SANDBOX: 'seatbelt', CODEX_THREAD_ID: 'th1', CODEX_HOME: home }, 1),
    ).toEqual({
        agent: 'codex',
        via: 'environment',
        model: 'gpt-5.6-terra',
        effort: 'high',
    })
})

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
