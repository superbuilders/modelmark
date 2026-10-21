import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { detect } from '../../agents/mark'
import { costMessage, hookCommand, markMessage } from './hook'

import type { Detection, PriceList } from '../../agents/types'

vi.mock(import('node:child_process'), async importOriginal => ({
    ...(await importOriginal()),
    spawn: vi.fn(() => ({ unref: vi.fn() })) as unknown as typeof spawn,
}))

vi.mock(import('../../agents/mark'), async importOriginal => ({
    ...(await importOriginal()),
    detect: vi.fn(),
}))

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

const OPUS: Detection = {
    agent: 'claude-code',
    model: 'claude-opus-5-5',
    effort: 'medium',
    via: 'process-tree',
}
const TERRA: Detection = {
    agent: 'codex',
    model: 'gpt-5.6-terra',
    effort: 'high',
    via: 'process-tree',
}

/**
 * Write a commit message to a fresh temporary file.
 * @param text - the message
 * @returns the file's path
 */
function messageFile(text: string): string {
    const path = join(mkdtempSync(join(tmpdir(), 'modelmark-hook-')), 'COMMIT_EDITMSG')

    writeFileSync(path, text)

    return path
}

describe('markMessage', () => {
    test('appends the trailer after the message', async () => {
        const path = messageFile('Fix the login bug\n')

        expect(await markMessage(path, OPUS)).toBe(
            'Assisted-by: claude-code:claude-opus-5-5@medium',
        )
        expect(readFileSync(path, 'utf8')).toBe(
            'Fix the login bug\n\nAssisted-by: claude-code:claude-opus-5-5@medium\n',
        )
    })

    test("joins the message's existing trailers and keeps the editor's comment lines below", async () => {
        const path = messageFile(
            'Fix it\n\nCo-Authored-By: A <a@b>\n# Please enter the commit message\n#\n',
        )

        await markMessage(path, OPUS)

        expect(readFileSync(path, 'utf8')).toBe(
            'Fix it\n\nCo-Authored-By: A <a@b>\nAssisted-by: claude-code:claude-opus-5-5@medium\n# Please enter the commit message\n#\n',
        )
    })

    test('an amend adds a different agent once and never repeats one', async () => {
        const path = messageFile('Fix it\n\nAssisted-by: claude-code:claude-opus-5-5@medium\n')

        await markMessage(path, OPUS)
        await markMessage(path, TERRA)
        await markMessage(path, TERRA)

        expect(readFileSync(path, 'utf8')).toBe(
            'Fix it\n\nAssisted-by: claude-code:claude-opus-5-5@medium\nAssisted-by: codex:gpt-5.6-terra@high\n',
        )
    })

    test("leaves a person's own commit unmarked", async () => {
        const human = messageFile('By hand\n')

        expect(await markMessage(human, null)).toBeNull()
        expect(readFileSync(human, 'utf8')).toBe('By hand\n')
    })

    test('an unreadable model is recorded as unknown, keeping the agent', async () => {
        const path = messageFile('Fix\n')

        await markMessage(path, {
            agent: 'pi',
            model: null,
            effort: null,
            via: 'environment',
        })

        expect(readFileSync(path, 'utf8')).toContain('Assisted-by: pi:unknown')
    })
})

describe('costMessage', () => {
    const PRICES: PriceList = { 'claude-opus-5-5': { input: 4, output: 20 } }
    const refresh = vi.fn<() => void>()

    /**
     * A Claude Code session with fresh state, and a way to add replies to it.
     * @returns its environment and a function that appends a reply
     */
    function session(): { env: Record<string, string>; reply: (output: number) => void } {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-cost-'))
        const log = join(root, 'config', 'projects', '-repo', 's1.jsonl')
        let replies = 0

        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, '')

        return {
            env: {
                CLAUDE_CODE_SESSION_ID: 's1',
                CLAUDE_CONFIG_DIR: join(root, 'config'),
                XDG_STATE_HOME: join(root, 'state'),
            },
            reply: output => {
                replies++
                writeFileSync(
                    log,
                    `${JSON.stringify({
                        type: 'assistant',
                        timestamp: new Date(Date.UTC(2026, 9, 20, 10, replies)).toISOString(),
                        message: {
                            id: `m${replies}`,
                            model: 'claude-opus-5-5',
                            usage: { output_tokens: output },
                        },
                    })}\n`,
                    { flag: 'a' },
                )
            },
        }
    }

    test("adds the cost of the session's replies, then counts only new ones", async () => {
        const { env, reply } = session()
        const first = messageFile('One\n')
        const second = messageFile('Two\n')

        reply(100_000)
        expect(await costMessage(first, 'claude-code', env, PRICES, refresh)).toBe(
            'Assisted-cost: $2.00',
        )

        reply(50_000)
        await costMessage(second, 'claude-code', env, PRICES, refresh)

        expect(readFileSync(first, 'utf8')).toBe('One\n\nAssisted-cost: $2.00\n')
        expect(readFileSync(second, 'utf8')).toBe('Two\n\nAssisted-cost: $1.00\n')
    })

    test('an amend adds its new replies to the cost already there', async () => {
        const { env, reply } = session()
        const path = messageFile('One\n\nAssisted-cost: $2.00\n')

        reply(50_000)
        await costMessage(path, 'claude-code', env, PRICES, refresh)

        expect(readFileSync(path, 'utf8')).toBe('One\n\nAssisted-cost: $3.00\n')
    })

    test('a cheap commit still gets its cost', async () => {
        const { env, reply } = session()
        const path = messageFile('One\n')

        reply(100)
        expect(await costMessage(path, 'claude-code', env, PRICES, refresh)).toBe(
            'Assisted-cost: $0.0020',
        )
    })

    test('an amend with no new replies keeps its cost', async () => {
        const { env, reply } = session()
        const path = messageFile('One\n')

        reply(50_000)
        await costMessage(path, 'claude-code', env, PRICES, refresh)
        expect(await costMessage(path, 'claude-code', env, PRICES, refresh)).toBeNull()
        expect(readFileSync(path, 'utf8')).toBe('One\n\nAssisted-cost: $1.00\n')
    })

    test('starts one background price refresh when due, and none offline', async () => {
        const { env, reply } = session()

        vi.mocked(spawn).mockClear()
        reply(100)
        await costMessage(messageFile('One\n'), 'claude-code', env, PRICES)
        reply(100)
        await costMessage(messageFile('Two\n'), 'claude-code', env, PRICES)
        expect(spawn).toHaveBeenCalledOnce()
        expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain('refresh-prices')

        const offline = session()

        offline.reply(100)
        await costMessage(
            messageFile('One\n'),
            'claude-code',
            { ...offline.env, MODELMARK_OFFLINE: '1' },
            PRICES,
        )
        expect(spawn).toHaveBeenCalledOnce()
    })

    test('replies without a price get no cost, and still count as used', async () => {
        const { env, reply } = session()
        const path = messageFile('One\n')

        reply(100_000)
        expect(await costMessage(path, 'claude-code', env, {}, refresh)).toBeNull()
        expect(await costMessage(path, 'claude-code', env, PRICES, refresh)).toBeNull()
        expect(readFileSync(path, 'utf8')).toBe('One\n')
    })
})

describe('hookCommand', () => {
    beforeEach(() => {
        vi.stubEnv('CLAUDE_CODE_SESSION_ID', '')
    })

    test('marks the message with the detected agent', async () => {
        const path = messageFile('Fix the login bug\n')

        vi.mocked(detect).mockResolvedValue(OPUS)
        await hookCommand(path)

        expect(readFileSync(path, 'utf8')).toContain(
            'Assisted-by: claude-code:claude-opus-5-5@medium',
        )
    })

    test('skips a merge without looking for an agent', async () => {
        const merge = messageFile("Merge branch 'dev'\n")

        vi.mocked(detect).mockClear()
        await hookCommand(merge, 'merge')

        expect(detect).not.toHaveBeenCalled()
        expect(readFileSync(merge, 'utf8')).toBe("Merge branch 'dev'\n")
    })

    test('a failure warns and leaves the commit to go ahead', async () => {
        const warn = vi.spyOn(console, 'error').mockImplementation(() => {})

        vi.mocked(detect).mockResolvedValue(OPUS)
        await hookCommand('/no/such/COMMIT_EDITMSG')

        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^modelmark: commit left unmarked/))
    })
})
