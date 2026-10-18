import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { readModelUse } from './models'

vi.mock(import('node:os'), async importOriginal => {
    const os = await importOriginal()

    return { ...os, homedir: vi.fn(os.homedir) }
})

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
    return mkdtempSync(join(tmpdir(), 'modelmark-models-'))
}

/*
 * Record shapes below are trimmed from real logs (Claude Code 2.1, Codex 0.154, Pi 0.85).
 */

/**
 * A Claude Code reply record.
 * @param model - the model that replied
 * @param effort - the session's effort
 * @returns the record
 */
function claudeReply(model: string, effort = 'medium'): object {
    return { type: 'assistant', effort, message: { id: 'm', model, content: [] } }
}

/**
 * A Codex turn-start record.
 * @param model - the model running the turn
 * @param effort - the turn's effort
 * @returns the record
 */
function codexTurn(model: string, effort = 'high'): object {
    return { type: 'turn_context', payload: { turn_id: 't', model, effort, cwd: '/r' } }
}

/**
 * A Pi reply record.
 * @param model - the model that replied
 * @returns the record
 */
function piReply(model: string): object {
    return {
        type: 'message',
        message: { role: 'assistant', provider: 'gateway', model, content: [] },
    }
}

afterEach(() => {
    vi.mocked(homedir).mockRestore()
})

describe('Claude Code', () => {
    test('reads the effort from the same reply as the model', () => {
        const config = scratch()

        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [
            claudeReply('claude-opus-5-5', 'medium'),
            claudeReply('claude-opus-5-5', 'xhigh'),
        ])

        expect(
            readModelUse('claude-code', {
                CLAUDE_CODE_SESSION_ID: 's1',
                CLAUDE_CONFIG_DIR: config,
            }),
        ).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
    })

    test('a reply that records no effort leaves the effort out', () => {
        const config = scratch()

        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [
            { type: 'assistant', message: { model: 'claude-opus-5-5' } },
        ])

        expect(
            readModelUse('claude-code', {
                CLAUDE_CODE_SESSION_ID: 's1',
                CLAUDE_CONFIG_DIR: config,
            }),
        ).toEqual({ model: 'claude-opus-5-5', effort: null })
    })

    test('reads the latest reply, ignoring synthetic records and user turns', () => {
        const config = scratch()

        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [
            claudeReply('claude-haiku-5-5'),
            claudeReply('claude-sonnet-5-5'),
            { type: 'user', message: { role: 'user' } },
            claudeReply('<synthetic>'),
        ])

        expect(
            readModelUse('claude-code', { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config })
                .model,
        ).toBe('claude-sonnet-5-5')
    })

    test('a subagent log written after the main log is the one running the commit', () => {
        const config = scratch()
        const main = writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [
            claudeReply('claude-opus-5-5'),
        ])
        const sub = writeLog(
            join(config, 'projects', '-repo', 's1', 'subagents', 'agent-a.jsonl'),
            [claudeReply('claude-sonnet-5')],
        )

        utimesSync(main, new Date(1000), new Date(1000))
        utimesSync(sub, new Date(2000), new Date(2000))

        expect(
            readModelUse('claude-code', { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config })
                .model,
        ).toBe('claude-sonnet-5')
    })

    test('without CLAUDE_CONFIG_DIR, the log is under ~/.claude', () => {
        const home = scratch()

        writeLog(join(home, '.claude', 'projects', '-repo', 's1.jsonl'), [
            claudeReply('claude-opus-5-5'),
        ])
        vi.mocked(homedir).mockReturnValue(home)

        expect(readModelUse('claude-code', { CLAUDE_CODE_SESSION_ID: 's1' }).model).toBe(
            'claude-opus-5-5',
        )
    })

    test('a record of the wrong shape is skipped, not trusted', () => {
        const config = scratch()

        writeLog(join(config, 'projects', '-repo', 's1.jsonl'), [
            claudeReply('claude-opus-5-5'),
            { type: 'assistant', message: 'not an object' },
            { type: 'assistant', message: { model: '' } },
        ])

        expect(
            readModelUse('claude-code', { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config })
                .model,
        ).toBe('claude-opus-5-5')
    })

    test('an unreadable config folder reads as null instead of failing', () => {
        const config = scratch()

        writeFileSync(join(config, 'projects'), 'not a folder')

        expect(
            readModelUse('claude-code', { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config })
                .model,
        ).toBeNull()
    })

    test('no session id or no log reads as null', () => {
        expect(readModelUse('claude-code', { CLAUDE_CONFIG_DIR: scratch() }).model).toBeNull()
        expect(
            readModelUse('claude-code', {
                CLAUDE_CODE_SESSION_ID: 'nope',
                CLAUDE_CONFIG_DIR: scratch(),
            }).model,
        ).toBeNull()
    })
})

describe('Codex', () => {
    test("reads the latest turn's effort, after a mid-session change", () => {
        const home = scratch()

        writeLog(join(home, 'sessions', '2026', '10', '18', 'rollout-t-th1.jsonl'), [
            codexTurn('gpt-5.6-terra', 'low'),
            codexTurn('gpt-5.6-terra', 'xhigh'),
        ])

        expect(readModelUse('codex', { CODEX_THREAD_ID: 'th1', CODEX_HOME: home })).toEqual({
            model: 'gpt-5.6-terra',
            effort: 'xhigh',
        })
    })

    test("reads the latest turn's model from the thread's rollout, after a mid-session switch", () => {
        const home = scratch()

        writeLog(
            join(home, 'sessions', '2026', '10', '17', 'rollout-2026-10-17T09-00-00-other.jsonl'),
            [codexTurn('gpt-old')],
        )
        writeLog(
            join(home, 'sessions', '2026', '10', '18', 'rollout-2026-10-18T12-42-37-th1.jsonl'),
            [
                { type: 'session_meta', payload: { id: 'th1' } },
                codexTurn('gpt-5.6-sol'),
                { type: 'event_msg', payload: { type: 'task_complete' } },
                codexTurn('gpt-5.6-terra'),
                { type: 'response_item', payload: { type: 'message' } },
            ],
        )

        expect(readModelUse('codex', { CODEX_THREAD_ID: 'th1', CODEX_HOME: home }).model).toBe(
            'gpt-5.6-terra',
        )
    })

    test('without CODEX_HOME, the rollout is under ~/.codex', () => {
        const home = scratch()

        writeLog(join(home, '.codex', 'sessions', '2026', '10', '18', 'rollout-t-th1.jsonl'), [
            codexTurn('gpt-5.6-sol'),
        ])
        vi.mocked(homedir).mockReturnValue(home)

        expect(readModelUse('codex', { CODEX_THREAD_ID: 'th1' }).model).toBe('gpt-5.6-sol')
    })

    test('no thread id or no rollout reads as null', () => {
        expect(readModelUse('codex', { CODEX_HOME: scratch() }).model).toBeNull()
        expect(
            readModelUse('codex', { CODEX_THREAD_ID: 'nope', CODEX_HOME: scratch() }).model,
        ).toBeNull()
    })
})

describe('Pi', () => {
    test('reads the thinking level Pi sets on each command', () => {
        expect(readModelUse('pi', { PI_MODEL: 'kimi-k3', PI_REASONING_LEVEL: 'high' })).toEqual({
            model: 'kimi-k3',
            effort: 'high',
        })
        expect(readModelUse('pi', { PI_MODEL: 'kimi-k3' }).effort).toBeNull()
    })

    test("reads the latest reply's model from the session file", () => {
        const log = writeLog(join(scratch(), 's.jsonl'), [
            { type: 'session', cwd: '/r' },
            { type: 'model_change', provider: 'gateway', modelId: 'gpt-6.1-sol' },
            piReply('gpt-6.1-sol'),
            { type: 'message', message: { role: 'toolResult' } },
            piReply('kimi-k3'),
        ])

        expect(readModelUse('pi', { PI_SESSION_FILE: log, PI_MODEL: 'gpt-6.1-sol' }).model).toBe(
            'kimi-k3',
        )
    })

    test('a run with no session file uses the model it started with', () => {
        expect(readModelUse('pi', { PI_MODEL: 'gpt-5.6-luna' }).model).toBe('gpt-5.6-luna')
        expect(
            readModelUse('pi', { PI_SESSION_FILE: '/missing.jsonl', PI_MODEL: 'gpt-5.6-luna' })
                .model,
        ).toBe('gpt-5.6-luna')
    })

    test('neither a session file nor a start model reads as null', () => {
        expect(readModelUse('pi', {}).model).toBeNull()
        expect(readModelUse('pi', { PI_MODEL: '' }).model).toBeNull()
    })
})
