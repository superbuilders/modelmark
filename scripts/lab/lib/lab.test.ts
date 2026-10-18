import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { HOOK_BUDGET_MS, README_FILE, README_MARKERS } from './constants'
import { codexThread } from './harnesses'
import {
    creditPasses,
    readPassed,
    statusLine,
    testedTable,
    versionStatuses,
    withTestedTable,
} from './passed'
import { keyPaths, redact } from './probe'
import { CHECKOUT } from './process'
import { verdict } from './verdict'

import type { HostResult } from './types'

describe('verdict', () => {
    const passing = {
        expected: ['pi:kimi-k3@low'],
        trailers: ['pi:kimi-k3@low'],
        hookMs: [80],
        hookErrors: '',
    }

    test('passes when the trailers match and the hook was quick and quiet', () => {
        expect(verdict(passing)).toBeNull()
        expect(verdict({ ...passing, expected: [/^pi:kimi-k3(@\w+)?$/] })).toBeNull()
    })

    test('names what went wrong', () => {
        expect(verdict({ ...passing, trailers: null })).toBe('no lab commit was made')
        expect(verdict({ ...passing, hookMs: [] })).toBe('the hook never ran')
        expect(verdict({ ...passing, trailers: ['pi:unknown@low'] })).toBe(
            'expected [pi:kimi-k3@low], got [pi:unknown@low]',
        )
        expect(verdict({ ...passing, trailers: [] })).toMatch(/^expected/)
        expect(verdict({ ...passing, hookMs: [80, HOOK_BUDGET_MS + 1] })).toMatch(/over the/)
        expect(verdict({ ...passing, hookErrors: 'modelmark: commit left unmarked' })).toMatch(
            /printed/,
        )
    })
})

describe('the record of passing versions', () => {
    const run: HostResult = {
        platform: 'linux',
        versions: { 'claude-code': '2.1.302', codex: '0.161.0', pi: '0.85.1' },
        scenarios: [
            { name: 'claude-code', harnesses: ['claude-code'], status: 'passed', seconds: 1 },
            { name: 'codex', harnesses: ['codex'], status: 'failed', seconds: 1 },
            { name: 'pi', harnesses: ['pi'], status: 'skipped', seconds: 0 },
            { name: 'nested', harnesses: ['claude-code', 'pi'], status: 'passed', seconds: 1 },
        ],
    }

    test('credits a harness only when every scenario that ran it passed', () => {
        const before = { linux: { codex: { version: '0.154.0', date: '2026-10-01' } } }

        expect(creditPasses(before, run, '2026-10-18')).toEqual({
            linux: {
                'claude-code': { version: '2.1.302', date: '2026-10-18' },
                codex: { version: '0.154.0', date: '2026-10-01' },
                pi: { version: '0.85.1', date: '2026-10-18' },
            },
        })
    })

    test('a harness whose scenarios were all skipped gets no credit', () => {
        const skipped = { ...run, scenarios: run.scenarios.slice(2, 3) }

        expect(creditPasses({}, skipped, '2026-10-18')).toEqual({ linux: {} })
    })

    test('the README table lists every harness on every platform', () => {
        expect(testedTable({ macos: { pi: { version: '0.84.3', date: '2026-10-18' } } })).toBe(
            [
                '| Harness     | Linux      | macOS      |',
                '| ----------- | ---------- | ---------- |',
                '| Claude Code | not tested | not tested |',
                '| Codex       | not tested | not tested |',
                '| Pi          | not tested | 0.84.3     |',
            ].join('\n'),
        )
    })

    test("the README's table matches the record", async () => {
        const readme = await readFile(join(CHECKOUT, README_FILE), 'utf8')

        expect(withTestedTable(readme, await readPassed(CHECKOUT))).toBe(readme)
    })

    test('a README without the markers is an error', () => {
        expect(() => withTestedTable('# no table', {})).toThrow(README_MARKERS.start)
    })

    test('status says whether each installed version has passed', () => {
        const record = {
            linux: {
                pi: { version: '0.85.1', date: '2026-10-18' },
                codex: { version: '0.154.0', date: '2026-10-01' },
            },
        }
        const lines = versionStatuses(record, 'linux', { pi: '0.85.1', codex: '0.161.0' }).map(
            status => statusLine(status),
        )

        expect(lines).toEqual([
            'Claude Code on Linux: not installed',
            'Codex on Linux 0.161.0: not tested yet (last passed: 0.154.0)',
            'Pi on Linux 0.85.1: passed on 2026-10-18',
        ])
    })
})

describe('harness output', () => {
    test("Codex's thread id comes from its first JSON event", () => {
        expect(
            codexThread('{"type":"thread.started","thread_id":"01a1"}\n{"type":"turn.started"}'),
        ).toBe('01a1')
        expect(() => codexThread('{"type":"turn.failed"}')).toThrow(/no thread id/)
    })
})

describe('probe reports', () => {
    test('hide secret-looking values in command lines', () => {
        expect(redact('agent --api-key sk-123 --model m TOKEN=abc run')).toBe(
            'agent --api-key … --model m TOKEN=… run',
        )
    })

    test("show a record's keys, with values only for its type, model and effort", () => {
        expect(
            keyPaths({
                type: 'message',
                message: {
                    model: 'kimi-k3',
                    content: [{ type: 'thinking', thinking: 'secret plan' }],
                },
                thinkingLevel: 'low',
                usage: { input: 3 },
            }),
        ).toEqual([
            'type=message',
            'message.model=kimi-k3',
            'message.content[].type=thinking',
            'message.content[].thinking',
            'thinkingLevel=low',
            'usage.input',
        ])
    })
})
