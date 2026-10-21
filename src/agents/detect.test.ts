import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { parseProcessTable } from '../system/processes'
import { agentOfCommand, detect, findAgent } from './detect'

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

/*
 * Shaped like the real process chains seen in Claude Code, Codex and Pi
 * sessions: the hook (100) under a shell under the agent.
 */
const NESTED = parseProcessTable(`
    100    90 bun modelmark hook .git/COMMIT_EDITMSG
     90    80 /bin/bash -lc git commit -m test
     80    70 /home/u/.bun/install/global/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex exec hi
     70    60 node /home/u/.bun/bin/codex exec hi
     60    50 pi
     50    40 /bin/bash -c source snapshot.sh
     40    30 claude --resume abc
     30     1 tmux new-session -d
`)

const HUMAN = parseProcessTable(`
    100    90 bun modelmark hook .git/COMMIT_EDITMSG
     90    80 git commit
     80    30 -bash
     30     1 tmux new-session -d
`)

describe('agentOfCommand', () => {
    test.each([
        ['claude -p hi --model haiku', 'claude-code'],
        ['/home/u/.local/bin/claude', 'claude-code'],
        ['node /home/u/.bun/bin/codex exec', 'codex'],
        ['/opt/vendor/bin/codex exec', 'codex'],
        ['pi', 'pi'],
        ['bun /x/pi -p', 'pi'],
        ['claude-notes --help', undefined],
        ['vim pi.ts', undefined],
        ['node server.js', undefined],
        ['', undefined],
    ])('%s is %s', (args, agent) => {
        expect(agentOfCommand(args)).toBe(agent)
    })
})

describe('findAgent', () => {
    test('the nearest agent wins when agents run inside each other', () => {
        expect(findAgent(NESTED, 100, {})).toEqual({ agent: 'codex', via: 'process-tree' })
    })

    test("a person's commit has no agent, even with an agent's leftover markers", () => {
        expect(
            findAgent(HUMAN, 100, { CLAUDE_CODE_SESSION_ID: 'abc', AI_AGENT: 'claude-code' }),
        ).toBeNull()
    })

    test('a hidden parent falls back to the one agent that left markers', () => {
        const hidden = parseProcessTable('100 90 bun modelmark hook msg')

        expect(findAgent(hidden, 100, { PI_SESSION_FILE: '/s.jsonl' })).toEqual({
            agent: 'pi',
            via: 'environment',
        })
        expect(findAgent(null, 100, { CLAUDE_CODE_SESSION_ID: 'abc' })).toEqual({
            agent: 'claude-code',
            via: 'environment',
        })
    })

    test('a hidden parent with several agents’ markers stays unknown', () => {
        expect(
            findAgent(null, 100, { CLAUDE_CODE_SESSION_ID: 'abc', CODEX_THREAD_ID: 'def' }),
        ).toBeNull()
    })

    test("Codex's sandbox marker names Codex when the walk tops out inside the sandbox", () => {
        const sandboxed = parseProcessTable(
            '100 90 bun modelmark hook msg\n 90 0 /bin/bash -lc git commit',
        )

        expect(
            findAgent(sandboxed, 100, {
                CODEX_SANDBOX_NETWORK_DISABLED: '1',
                CLAUDE_CODE_SESSION_ID: 'x',
            }),
        ).toEqual({ agent: 'codex', via: 'environment' })
    })

    test('a process that is its own parent ends the walk instead of looping', () => {
        const loop = parseProcessTable('100 100 bun modelmark hook msg')

        expect(findAgent(loop, 100, { CLAUDE_CODE_SESSION_ID: 'abc' })).toBeNull()
    })
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
