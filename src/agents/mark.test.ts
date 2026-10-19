import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { detect, markValue, parseMark } from './mark'

import type * as Processes from '../system/processes'

/** The hook (100) under a shell under Claude Code; a walk from 1 sees none of it. */
vi.mock('../system/processes', async importOriginal => {
    const original = await importOriginal<typeof Processes>()

    return {
        ...original,
        readProcessTable: async () =>
            original.parseProcessTable(`
                100    90 bun modelmark hook .git/COMMIT_EDITMSG
                 90    40 /bin/bash -c git commit -m test
                 40     1 claude --resume abc
            `),
    }
})

test('a walk that starts at the top finds no agent', async () => {
    expect(await detect({}, 1)).toBeNull()
})

describe('a mark declared in MODELMARK', () => {
    test('marks an agent modelmark does not know', async () => {
        expect(await detect({ MODELMARK: 'jojo:gpt-6.1-sol@high' }, 1)).toEqual({
            agent: 'jojo',
            via: 'declared',
            model: 'gpt-6.1-sol',
            effort: 'high',
        })
    })

    test('may leave out the model and the effort', async () => {
        expect(await detect({ MODELMARK: 'jojo' }, 1)).toEqual({
            agent: 'jojo',
            via: 'declared',
            model: null,
            effort: null,
        })
    })

    test('wins over the markers a known agent leaves', async () => {
        expect(await detect({ MODELMARK: 'jojo:m', CODEX_SANDBOX: 'seatbelt' }, 1)).toMatchObject({
            agent: 'jojo',
        })
    })

    test('loses to a known agent in the process tree', async () => {
        expect(await detect({ MODELMARK: 'jojo:m' }, 100)).toMatchObject({
            agent: 'claude-code',
            via: 'process-tree',
        })
    })

    test('is ignored when empty', async () => {
        expect(await detect({ MODELMARK: ' ' }, 1)).toBeNull()
    })
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
