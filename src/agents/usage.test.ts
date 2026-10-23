import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { readSessionUse } from './usage'

/** The repository every reply below was made in. */
const REPO = mkdtempSync(join(tmpdir(), 'modelmark-usage-repo-'))

/** Another repository, whose work the replies above must not pay for. */
const OTHER = mkdtempSync(join(tmpdir(), 'modelmark-usage-other-'))

mkdirSync(join(REPO, '.git'))
mkdirSync(join(OTHER, '.git'))

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
        cwd: REPO,
        requestId: `req_${id}`,
        message: { id, model: 'claude-opus-5-5', usage },
    }
}

/**
 * A Codex reply's token record.
 * @param time - `hh:mm`
 * @param usage - the reply's usage
 * @returns the record
 */
function codexUsage(time: string, usage: object): object {
    return {
        timestamp: new Date(at(time)).toISOString(),
        type: 'token_usage_record',
        payload: { response_id: `resp_${time}`, usage, thread_token_usage: usage },
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
        payload: { model, cwd: REPO },
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

    test('reads the split of cache writes by lifetime', () => {
        const config = scratch()

        writeLog(join(config, 'projects', '-repo', 's2.jsonl'), [
            claudeReply('10:00', 'm1', {
                input_tokens: 2,
                cache_creation_input_tokens: 300,
                cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
                output_tokens: 9,
            }),
        ])

        expect(
            readSessionUse(
                'claude-code',
                { CLAUDE_CODE_SESSION_ID: 's2', CLAUDE_CONFIG_DIR: config },
                undefined,
                REPO,
            )?.uses,
        ).toEqual([
            {
                model: 'claude-opus-5-5',
                input: 2,
                cacheRead: 0,
                cacheWrite: 300,
                cacheWriteByTtl: { '5m': 100, '1h': 200 },
                output: 9,
            },
        ])
    })

    test('counts each reply once across the main and subagent logs', () => {
        const use = readSessionUse('claude-code', session(), undefined, REPO)

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
        const use = readSessionUse('claude-code', session(), at('10:15'), REPO)

        expect(use?.uses.map(({ output }) => output).toSorted()).toEqual([2, 7])
    })

    test('a reply with no time counts only before the first commit', () => {
        const config = scratch()
        const { timestamp: _, ...untimed } = claudeReply('10:00', 'm1', { output_tokens: 3 }) as {
            timestamp: string
        }

        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [untimed])

        const env = { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config }

        expect(readSessionUse('claude-code', env, undefined, REPO)?.uses).toHaveLength(1)
        expect(readSessionUse('claude-code', env, at('09:00'), REPO)?.uses).toEqual([])
    })

    test('a missing session gives nothing', () => {
        expect(readSessionUse('claude-code', {}, undefined, REPO)).toBeUndefined()
    })

    test('counts a reply with no message id, and a tool call with no input', () => {
        const config = scratch()
        const reply = claudeReply('10:00', 'm1', { output_tokens: 3 }) as {
            message: Record<string, unknown>
        }

        reply.message = {
            model: 'claude-opus-5-5',
            usage: { output_tokens: 3 },
            content: [{ type: 'tool_use' }],
        }
        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [reply, reply])

        const env = { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config }

        expect(readSessionUse('claude-code', env, undefined, REPO)?.uses).toHaveLength(2)
    })

    test('skips a log not written since the point', () => {
        expect(readSessionUse('claude-code', session(), Date.now() + 60_000, REPO)?.uses).toEqual(
            [],
        )
    })
})

describe('Codex', () => {
    /**
     * A thread of three replies over two turns.
     * @returns its environment
     */
    function thread(): Record<string, string> {
        const home = scratch()

        writeLog(join(home, 'sessions', '2026', '10', '20', 'rollout-x-t1.jsonl'), [
            codexTurn('09:00', 'gpt-5.6-terra'),
            codexUsage('09:01', {
                input_tokens: 100,
                cached_input_tokens: 0,
                output_tokens: 10,
            }),
            {
                timestamp: new Date(at('09:02')).toISOString(),
                type: 'event_msg',
                payload: { type: 'token_count' },
            },
            codexUsage('10:01', {
                input_tokens: 200,
                cached_input_tokens: 150,
                cache_write_input_tokens: 20,
                output_tokens: 20,
                reasoning_output_tokens: 5,
            }),
            codexTurn('11:00', 'gpt-6.1-sol'),
            codexUsage('11:01', { input_tokens: 9, output_tokens: 1 }),
        ])

        return { CODEX_THREAD_ID: 't1', CODEX_HOME: home }
    }

    test('takes cached and written input out of input', () => {
        const use = readSessionUse('codex', thread(), undefined, REPO)

        expect(use?.uses).toEqual([
            { model: 'gpt-5.6-terra', input: 100, cacheRead: 0, cacheWrite: 0, output: 10 },
            { model: 'gpt-5.6-terra', input: 30, cacheRead: 150, cacheWrite: 20, output: 20 },
            { model: 'gpt-6.1-sol', input: 9, cacheRead: 0, cacheWrite: 0, output: 1 },
        ])
        expect(use?.through).toBe(at('11:01'))
    })

    test('counts only replies after the point', () => {
        const use = readSessionUse('codex', thread(), at('10:01'), REPO)

        expect(use?.uses).toEqual([
            { model: 'gpt-6.1-sol', input: 9, cacheRead: 0, cacheWrite: 0, output: 1 },
        ])
    })

    test('a missing thread gives nothing', () => {
        expect(readSessionUse('codex', {}, undefined, REPO)).toBeUndefined()
    })

    test('charges a reply only for the repository its tool calls worked in', () => {
        const home = scratch()

        /**
         * A tool call record.
         * @param time - `hh:mm`
         * @param payload - the call
         * @returns the record
         */
        function call(time: string, payload: object): object {
            return { timestamp: new Date(at(time)).toISOString(), type: 'response_item', payload }
        }

        writeLog(join(home, 'sessions', '2026', '10', '20', 'rollout-x-t2.jsonl'), [
            codexTurn('09:00', 'gpt-6.1-sol'),
            call('09:01', {
                type: 'function_call',
                arguments: JSON.stringify({ cmd: `cat ${OTHER}/a.txt` }),
            }),
            codexUsage('09:02', { input_tokens: 1, output_tokens: 1 }),
            call('09:03', { type: 'custom_tool_call', input: `*** Update File: ${REPO}/b.ts` }),
            codexUsage('09:04', { input_tokens: 2, output_tokens: 2 }),
            call('09:05', {
                type: 'local_shell_call',
                action: { type: 'exec', command: ['ls'], working_directory: OTHER },
            }),
            codexUsage('09:06', { input_tokens: 3, output_tokens: 3 }),
        ])

        const env = { CODEX_THREAD_ID: 't2', CODEX_HOME: home, HOME: home }

        expect(readSessionUse('codex', env, undefined, REPO)?.uses.map(use => use.output)).toEqual([
            2,
        ])
    })

    test('a reply after the point takes the model of the turn before the point', () => {
        const use = readSessionUse('codex', thread(), at('09:30'), REPO)

        expect(use?.uses.map(({ model }) => model)).toEqual(['gpt-5.6-terra', 'gpt-6.1-sol'])
    })
})

describe('Pi', () => {
    test('a missing session file gives nothing', () => {
        expect(readSessionUse('pi', {}, undefined, REPO)).toBeUndefined()
    })

    test('a reply with no time counts only before the first commit', () => {
        const file = writeLog(join(scratch(), '2026-10-20_p2.jsonl'), [
            { type: 'session', cwd: REPO },
            {
                type: 'message',
                message: { role: 'assistant', model: 'kimi-k3', usage: { output: 5 } },
            },
        ])
        const env = { PI_SESSION_FILE: file }

        expect(readSessionUse('pi', env, undefined, REPO)?.uses).toHaveLength(1)
        expect(readSessionUse('pi', env, at('09:00'), REPO)?.uses).toEqual([])
    })

    test('reads each reply after the point', () => {
        const file = writeLog(join(scratch(), '2026-10-20_p1.jsonl'), [
            { type: 'session', cwd: REPO },
            {
                type: 'message',
                timestamp: new Date(at('09:00')).toISOString(),
                message: { role: 'assistant', model: 'kimi-k3', usage: { output: 99 } },
            },
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

        expect(readSessionUse('pi', { PI_SESSION_FILE: file }, at('09:00'), REPO)).toEqual({
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

describe('usage log', () => {
    test('reads each reply after the point, its fresh input what the cache left over', () => {
        const file = writeLog(join(scratch(), 'jojo.jsonl'), [
            { modelmark: 'usage', version: 1, session: 'c1' },
            {
                at: new Date(at('09:00')).toISOString(),
                model: 'claude-opus-5-5',
                input: 9,
                cacheRead: 0,
                cacheWrite: 0,
                output: 1,
                cwd: REPO,
            },
            {
                at: new Date(at('10:00')).toISOString(),
                model: 'claude-opus-5-5',
                input: 1000,
                cacheRead: 700,
                cacheWrite: 200,
                cacheWriteByTtl: { '1h': 200 },
                output: 40,
                cwd: REPO,
            },
            {
                at: new Date(at('10:05')).toISOString(),
                model: 'claude-opus-5-5',
                input: 5,
                cacheRead: 0,
                cacheWrite: 0,
                output: 5,
                cwd: OTHER,
            },
        ])

        expect(readSessionUse('usage-log', { MODELMARK_USAGE: file }, at('09:00'), REPO)).toEqual({
            through: at('10:00'),
            uses: [
                {
                    model: 'claude-opus-5-5',
                    input: 100,
                    cacheRead: 700,
                    cacheWrite: 200,
                    cacheWriteByTtl: { '1h': 200 },
                    output: 40,
                },
            ],
        })
    })
})
