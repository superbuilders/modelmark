import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { readSessionUse } from './usage'

/**
 * Write JSONL records to a file, creating its folders.
 * @param path - the file
 * @param records - one object per line
 * @returns the path
 */
function writeLog(path: string, records: object[]): string {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, `${records.map(record => JSON.stringify(record)).join('\n')}\n`)

    return path
}

/**
 * A fresh temporary folder.
 * @returns its path
 */
function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'modelmark-usage-'))
}

/**
 * Milliseconds since the epoch for a time on one test day.
 * @param time - `hh:mm`
 * @returns the time
 */
function at(time: string): number {
    return Date.parse(`2026-10-20T${time}:00.000Z`)
}

/*
 * Record shapes below are trimmed from real logs (Claude Code 2.1, Codex 0.154, Pi 1.1).
 */

/**
 * A Claude Code reply record.
 * @param time - `hh:mm`
 * @param id - the message id
 * @param usage - the usage fields
 * @returns the record
 */
function claudeReply(time: string, id: string, usage: object): object {
    return {
        type: 'assistant',
        timestamp: new Date(at(time)).toISOString(),
        requestId: `req_${id}`,
        message: { id, model: 'claude-opus-5-5', usage },
    }
}

/**
 * A Codex token count record.
 * @param time - `hh:mm`
 * @param total - the thread's running total
 * @param last - the reply's usage
 * @returns the record
 */
function codexCount(time: string, total: number, last: object): object {
    return {
        timestamp: new Date(at(time)).toISOString(),
        type: 'event_msg',
        payload: {
            type: 'token_count',
            info: { total_token_usage: { total_tokens: total }, last_token_usage: last },
        },
    }
}

/**
 * A Codex turn-start record.
 * @param time - `hh:mm`
 * @param model - the turn's model
 * @returns the record
 */
function codexTurn(time: string, model: string): object {
    return {
        timestamp: new Date(at(time)).toISOString(),
        type: 'turn_context',
        payload: { model },
    }
}

describe('Claude Code', () => {
    /**
     * A session with one reply in the main log and one in a subagent's.
     * @returns its environment
     */
    function session(): Record<string, string> {
        const config = scratch()
        const main = join(config, 'projects', '-repo', 's1.jsonl')

        writeLog(main, [
            claudeReply('10:00', 'm1', {
                input_tokens: 10,
                cache_read_input_tokens: 1000,
                cache_creation_input_tokens: 200,
                output_tokens: 50,
            }),
            claudeReply('10:00', 'm1', {
                input_tokens: 10,
                cache_read_input_tokens: 1000,
                cache_creation_input_tokens: 200,
                output_tokens: 50,
            }),
            claudeReply('11:00', 'm2', { input_tokens: 5, output_tokens: 7 }),
        ])
        writeLog(join(config, 'projects', '-repo', 's1', 'subagents', 'a.jsonl'), [
            claudeReply('10:30', 'm3', { input_tokens: 1, output_tokens: 2 }),
        ])

        return { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config }
    }

    test('counts each reply once across the main and subagent logs', () => {
        const use = readSessionUse('claude-code', session(), undefined)

        expect(use?.session).toBe('s1')
        expect(use?.through).toBe(at('11:00'))
        expect(use?.uses).toHaveLength(3)
        expect(use?.uses).toContainEqual({
            model: 'claude-opus-5-5',
            input: 10,
            cacheRead: 1000,
            cacheWrite: 200,
            output: 50,
        })
    })

    test('counts only replies after the point', () => {
        const use = readSessionUse('claude-code', session(), at('10:15'))

        expect(use?.uses.map(({ output }) => output).toSorted()).toEqual([2, 7])
    })

    test('a missing session gives nothing', () => {
        expect(readSessionUse('claude-code', {}, undefined)).toBeUndefined()
    })
})

describe('Codex', () => {
    /**
     * A thread whose second reply is repeated when only its rate limits changed.
     * @returns its environment
     */
    function thread(): Record<string, string> {
        const home = scratch()

        writeLog(join(home, 'sessions', '2026', '10', '20', 'rollout-x-t1.jsonl'), [
            codexTurn('09:00', 'gpt-5.6-terra'),
            codexCount('09:01', 110, {
                input_tokens: 100,
                cached_input_tokens: 0,
                output_tokens: 10,
            }),
            codexCount('10:01', 330, {
                input_tokens: 200,
                cached_input_tokens: 150,
                cache_write_input_tokens: 20,
                output_tokens: 20,
                reasoning_output_tokens: 5,
            }),
            codexCount('10:02', 330, {
                input_tokens: 200,
                cached_input_tokens: 150,
                output_tokens: 20,
            }),
            codexTurn('11:00', 'gpt-6.1-sol'),
            codexCount('11:01', 340, { input_tokens: 9, output_tokens: 1 }),
        ])

        return { CODEX_THREAD_ID: 't1', CODEX_HOME: home }
    }

    test('takes cached and written input out of input, and skips repeats', () => {
        const use = readSessionUse('codex', thread(), undefined)

        expect(use?.uses).toEqual([
            { model: 'gpt-5.6-terra', input: 100, cacheRead: 0, cacheWrite: 0, output: 10 },
            { model: 'gpt-5.6-terra', input: 30, cacheRead: 150, cacheWrite: 20, output: 20 },
            { model: 'gpt-6.1-sol', input: 9, cacheRead: 0, cacheWrite: 0, output: 1 },
        ])
        expect(use?.through).toBe(at('11:01'))
    })

    test("a repeat just after the point isn't counted again", () => {
        const use = readSessionUse('codex', thread(), at('10:01'))

        expect(use?.uses).toEqual([
            { model: 'gpt-6.1-sol', input: 9, cacheRead: 0, cacheWrite: 0, output: 1 },
        ])
    })

    test('a reply after the point takes the model of the turn before the point', () => {
        const use = readSessionUse('codex', thread(), at('09:30'))

        expect(use?.uses.map(({ model }) => model)).toEqual(['gpt-5.6-terra', 'gpt-6.1-sol'])
    })
})

describe('Pi', () => {
    test('reads each reply after the point', () => {
        const file = writeLog(join(scratch(), '2026-10-20_p1.jsonl'), [
            {
                type: 'message',
                timestamp: new Date(at('10:00')).toISOString(),
                message: {
                    role: 'assistant',
                    model: 'anthropic-primary/claude-opus-5-5',
                    usage: { input: 3, output: 4, cacheRead: 500, cacheWrite: 60 },
                },
            },
            {
                type: 'message',
                timestamp: new Date(at('10:05')).toISOString(),
                message: { role: 'user', content: [] },
            },
        ])

        expect(readSessionUse('pi', { PI_SESSION_FILE: file }, at('09:00'))).toEqual({
            session: '2026-10-20_p1',
            through: at('10:00'),
            uses: [
                {
                    model: 'anthropic-primary/claude-opus-5-5',
                    input: 3,
                    cacheRead: 500,
                    cacheWrite: 60,
                    output: 4,
                },
            ],
        })
    })
})
