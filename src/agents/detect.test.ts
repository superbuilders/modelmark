import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { parseProcessTable } from '../system/processes'
import { agentOfCommand, agentOfProcess, detect, findAgent } from './detect'

import type * as Processes from '../system/processes'
import type { ProcessTable } from '../system/types'

/** The hook (100) under a shell under Claude Code; a walk from 1 sees none of it. */
vi.mock('../system/processes', async importOriginal => {
    const original = await importOriginal<typeof Processes>()

    return {
        ...original,
        readProcessTable: async () =>
            original.parseProcessTable(
                '100 90 bun\n 90 40 /bin/bash\n 40 1 claude',
                '100 bun modelmark hook .git/COMMIT_EDITMSG\n 90 /bin/bash -c git commit -m test\n 40 claude --resume abc',
            ),
    }
})

/**
 * A process table from rows of `pid ppid name | command line`, as the two `ps` listings give them.
 * @param rows - one process per line
 * @returns the table
 */
function table(rows: string): ProcessTable {
    const lines = rows
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.split(' | '))

    return parseProcessTable(
        lines.map(([left = '']) => left).join('\n'),
        lines.map(([left = '', args = '']) => `${left.trim().split(/\s+/)[0]} ${args}`).join('\n'),
    )
}

/*
 * Shaped like the real process chains seen in Claude Code, Codex and Pi
 * sessions: the hook (100) under a shell under the agent.
 */
const NESTED = table(`
    100    90 bun | bun modelmark hook .git/COMMIT_EDITMSG
     90    80 bash | /bin/bash -lc git commit -m test
     80    70 codex | /home/u/.bun/install/global/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex exec hi
     70    60 MainThread | node /home/u/.bun/bin/codex exec hi
     60    50 pi | pi
     50    40 bash | /bin/bash -c source snapshot.sh
     40    30 claude | claude --resume abc
     30     1 tmux: server | tmux new-session -d
`)

const HUMAN = table(`
    100    90 bun | bun modelmark hook .git/COMMIT_EDITMSG
     90    80 git | git commit
     80    30 -bash | -bash
     30     1 tmux: server | tmux new-session -d
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

/** Where Claude's desktop app keeps `claude`, as macOS's `ps` names it: the path it was launched by. */
const DESKTOP_CLAUDE = '/Users/u/Library/Application Support/Claude/claude-code/2.1.301/claude'

describe('agentOfProcess', () => {
    test.each([
        [DESKTOP_CLAUDE, `${DESKTOP_CLAUDE} --output-format stream-json`, 'claude-code'],
        ['claude', '/home/u/.local/bin/claude --resume abc', 'claude-code'],
        ['/tmp/x/claude tools/codex', '/tmp/x/claude tools/codex exec hi', 'codex'],
        ['MainThread', 'node /home/u/n/bin/pi -p hi', 'pi'],
        ['node', 'node /home/u/.bun/bin/codex exec', 'codex'],
        ['/bin/zsh', `/bin/zsh -c ${DESKTOP_CLAUDE} --resume abc`, undefined],
        [
            '/Users/u/Application Support/claude-notes',
            '/Users/u/Application Support/claude-notes',
            undefined,
        ],
        ['disclaimer', `disclaimer --pgroup -- ${DESKTOP_CLAUDE}`, undefined],
    ])('named %s, running %s, is %s', (name, args, agent) => {
        expect(agentOfProcess({ ppid: 1, name, args })).toBe(agent)
    })
})

describe('findAgent', () => {
    test('the nearest agent wins when agents run inside each other', () => {
        expect(findAgent(NESTED, 100, {})).toEqual({ agent: 'codex', via: 'process-tree' })
    })

    test("Claude's desktop app is found, though its path has a space in it", () => {
        const desktop = table(`
            100    90 bun | bun modelmark hook .git/COMMIT_EDITMSG
             90    40 /bin/zsh | /bin/zsh -c git commit -m test
             40    30 ${DESKTOP_CLAUDE} | ${DESKTOP_CLAUDE} --output-format stream-json --verbose
             30    20 /Applications/Claude.app/Contents/Helpers/disclaimer | /Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${DESKTOP_CLAUDE}
             20     1 /Applications/Claude.app/Contents/MacOS/Claude | /Applications/Claude.app/Contents/MacOS/Claude
        `)

        expect(findAgent(desktop, 100, {})).toEqual({ agent: 'claude-code', via: 'process-tree' })
    })

    test("a person's commit has no agent, even with an agent's leftover markers", () => {
        expect(
            findAgent(HUMAN, 100, { CLAUDE_CODE_SESSION_ID: 'abc', AI_AGENT: 'claude-code' }),
        ).toBeNull()
    })

    test('a hidden parent falls back to the one agent that left markers', () => {
        const hidden = table('100 90 bun | bun modelmark hook msg')

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
        const sandboxed = table(
            '100 90 bun | bun modelmark hook msg\n 90 0 bash | /bin/bash -lc git commit',
        )

        expect(
            findAgent(sandboxed, 100, {
                CODEX_SANDBOX_NETWORK_DISABLED: '1',
                CLAUDE_CODE_SESSION_ID: 'x',
            }),
        ).toEqual({ agent: 'codex', via: 'environment' })
    })

    test('a process that is its own parent ends the walk instead of looping', () => {
        const loop = table('100 100 bun | bun modelmark hook msg')

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
