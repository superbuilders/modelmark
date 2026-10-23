import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { detect } from '../../agents/detect'
import { git } from '../../system/command'
import { hookCommand, markMessage, usageMessage } from './hook'

import type { Detection, FoundAgent, ModelUse } from '../../agents/types'
import type { PriceList } from '../../pricing/types'

vi.mock(import('node:child_process'), async importOriginal => ({
    ...(await importOriginal()),
    spawn: vi.fn(() => {
        const child = { on: vi.fn(() => child), unref: vi.fn() }

        return child
    }) as unknown as typeof spawn,
}))

vi.mock(import('../../agents/detect'), async importOriginal => ({
    ...(await importOriginal()),
    detect: vi.fn(),
}))

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

const OPUS: FoundAgent & ModelUse = {
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

describe('usageMessage', () => {
    const PRICES: PriceList = { 'claude-opus-5-5': { input: 4, output: 20 } }
    const MARK = 'Assisted-by: claude-code:claude-opus-5-5@medium'
    const refresh = vi.fn<() => void>()

    /**
     * The tokens line for replies that only wrote output.
     * @param output - the output tokens
     * @returns the line
     */
    function tokens(output: number): string {
        return `Assisted-tokens: 0 input, 0 cache-write, ${output} output, 0 cache-read`
    }

    /**
     * A Claude Code session with fresh state, committing in a fresh repository
     * that the hook runs in.
     * @returns its environment, a function that appends a reply made in the
     *   repository (or another folder), and one that commits a message file
     */
    async function session(): Promise<{
        env: Record<string, string>
        reply: (output: number, cwd?: string) => void
        commit: (messageFile: string) => Promise<void>
    }> {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-cost-'))
        const repo = join(root, 'repo')
        const log = join(root, 'config', 'projects', '-repo', 's1.jsonl')
        const identity = ['-c', 'user.name=T', '-c', 'user.email=t@t']
        let replies = 0

        mkdirSync(repo)
        await git(['init', '-q'], repo)
        await git([...identity, 'commit', '-q', '--allow-empty', '-m', 'Start'], repo)
        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, '')

        return {
            env: {
                CLAUDE_CODE_SESSION_ID: 's1',
                CLAUDE_CONFIG_DIR: join(root, 'config'),
                XDG_STATE_HOME: join(root, 'state'),
            },
            reply: (output, cwd = repo) => {
                replies++
                writeFileSync(
                    log,
                    `${JSON.stringify({
                        type: 'assistant',
                        timestamp: new Date(Date.UTC(2026, 9, 20, 10, replies)).toISOString(),
                        cwd,
                        message: {
                            id: `m${replies}`,
                            model: 'claude-opus-5-5',
                            usage: { output_tokens: output },
                        },
                    })}\n`,
                    { flag: 'a' },
                )
            },
            commit: async path => {
                await git([...identity, 'commit', '-q', '--allow-empty', '-F', path], repo)
            },
        }
    }

    test("adds the cost of the session's replies, then counts only new ones", async () => {
        const { env, reply, commit } = await session()
        const first = messageFile(`One\n\n${MARK}\n`)
        const second = messageFile(`Two\n\n${MARK}\n`)

        reply(100_000)
        expect(await usageMessage(first, OPUS, env, PRICES, refresh)).toEqual([
            'Assisted-cost: $2.00',
            tokens(100_000),
        ])
        await commit(first)

        reply(50_000)
        await usageMessage(second, OPUS, env, PRICES, refresh)

        expect(readFileSync(first, 'utf8')).toBe(
            `One\n\n${MARK}\nAssisted-cost: $2.00\n${tokens(100_000)}\n`,
        )
        expect(readFileSync(second, 'utf8')).toBe(
            `Two\n\n${MARK}\nAssisted-cost: $1.00\n${tokens(50_000)}\n`,
        )
    })

    test("a declared agent's usage log prices its commit, 1-hour cache writes at their own rate", async () => {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-declared-'))
        const repo = join(root, 'repo')
        const log = join(root, 'jojo.jsonl')
        const jojo: Detection = {
            agent: 'jojo',
            model: 'claude-opus-5-5',
            effort: null,
            via: 'declared',
        }

        mkdirSync(repo)
        await git(['init', '-q'], repo)
        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        writeFileSync(
            log,
            [
                { modelmark: 'usage', version: 1, session: 'c1' },
                {
                    at: '2026-10-20T10:00:00Z',
                    model: 'claude-opus-5-5',
                    input: 1_000_000,
                    cacheRead: 0,
                    cacheWrite: 1_000_000,
                    cacheWriteByTtl: { '1h': 1_000_000 },
                    output: 0,
                    cwd: repo,
                },
            ]
                .map(line => `${JSON.stringify(line)}\n`)
                .join(''),
        )

        expect(
            await usageMessage(
                messageFile('One\n'),
                jojo,
                { MODELMARK_USAGE: log, XDG_STATE_HOME: join(root, 'state') },
                { 'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5 } },
                refresh,
            ),
        ).toEqual([
            'Assisted-cost: $8.00',
            'Assisted-tokens: 0 input, 1000000 cache-write, 0 output, 0 cache-read',
        ])
    })

    test('a commit git drops leaves its replies to the next try', async () => {
        const { env, reply } = await session()
        const path = messageFile(`One\n\n${MARK}\n`)

        reply(100_000)
        await usageMessage(path, OPUS, env, PRICES, refresh)

        reply(50_000)
        writeFileSync(path, `One\n\n${MARK}\n`)
        await usageMessage(path, OPUS, env, PRICES, refresh)
        expect(readFileSync(path, 'utf8')).toBe(
            `One\n\n${MARK}\nAssisted-cost: $3.00\n${tokens(150_000)}\n`,
        )
    })

    test('replies made in another repository are not charged here', async () => {
        const { env, reply } = await session()
        const elsewhere = mkdtempSync(join(tmpdir(), 'modelmark-elsewhere-'))

        mkdirSync(join(elsewhere, '.git'))
        reply(100_000, elsewhere)
        expect(await usageMessage(messageFile('One\n'), OPUS, env, PRICES, refresh)).toEqual([])
    })

    test('a commit outside a repository gets no cost', async () => {
        const { env, reply } = await session()

        vi.spyOn(process, 'cwd').mockReturnValue(tmpdir())
        reply(100_000)
        expect(await usageMessage(messageFile('One\n'), OPUS, env, PRICES, refresh)).toEqual([])
    })

    test('an amend adds its new replies to the cost and tokens already there', async () => {
        const { env, reply } = await session()
        const path = messageFile(`One\n\nAssisted-cost: $2.00\n${tokens(100_000)}\n`)

        reply(50_000)
        await usageMessage(path, OPUS, env, PRICES, refresh)

        expect(readFileSync(path, 'utf8')).toBe(`One\n\nAssisted-cost: $3.00\n${tokens(150_000)}\n`)
    })

    test('a cheap commit still gets its cost', async () => {
        const { env, reply } = await session()

        reply(100)
        expect(await usageMessage(messageFile('One\n'), OPUS, env, PRICES, refresh)).toEqual([
            'Assisted-cost: $0.0020',
            tokens(100),
        ])
    })

    test('an amend with no new replies keeps its cost and tokens', async () => {
        const { env, reply, commit } = await session()
        const path = messageFile(`One\n\n${MARK}\n`)

        reply(50_000)
        await usageMessage(path, OPUS, env, PRICES, refresh)
        await commit(path)
        expect(await usageMessage(path, OPUS, env, PRICES, refresh)).toEqual([])
        expect(readFileSync(path, 'utf8')).toBe(
            `One\n\n${MARK}\nAssisted-cost: $1.00\n${tokens(50_000)}\n`,
        )
    })

    test('starts one background price refresh when due, and none offline', async () => {
        const { env, reply } = await session()

        vi.mocked(spawn).mockClear()
        reply(100)
        await usageMessage(messageFile('One\n'), OPUS, env, PRICES)
        reply(100)
        await usageMessage(messageFile('Two\n'), OPUS, env, PRICES)
        expect(spawn).toHaveBeenCalledOnce()
        expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain('refresh-prices')

        const offline = await session()

        offline.reply(100)
        await usageMessage(
            messageFile('One\n'),
            OPUS,
            { ...offline.env, MODELMARK_OFFLINE: '1' },
            PRICES,
        )
        expect(spawn).toHaveBeenCalledOnce()
    })

    test('replies without a price get tokens but no cost, and still count as used', async () => {
        const { env, reply, commit } = await session()
        const path = messageFile(`One\n\n${MARK}\n`)

        reply(100_000)
        expect(await usageMessage(path, OPUS, env, {}, refresh)).toEqual([tokens(100_000)])
        await commit(path)
        expect(await usageMessage(path, OPUS, env, PRICES, refresh)).toEqual([])
        expect(readFileSync(path, 'utf8')).toBe(`One\n\n${MARK}\n${tokens(100_000)}\n`)
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

    test('skips a commit made with MODELMARK_DISABLE set', async () => {
        const path = messageFile('By hand\n')

        vi.mocked(detect).mockClear()
        await hookCommand(path, undefined, { MODELMARK_DISABLE: '1' })
        await hookCommand(path, undefined, { MODELMARK_DISABLE: '0' })

        expect(detect).toHaveBeenCalledOnce()
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
