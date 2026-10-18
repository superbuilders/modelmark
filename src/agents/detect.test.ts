import { describe, expect, test } from 'vitest'

import { parseProcessTable } from '../system/processes'
import { agentOfCommand, findAgent } from './detect'

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
