import { afterEach, describe, expect, test, vi } from 'vitest'

import { detect } from '../../agents/mark'
import { installedVersion } from '../../agents/versions'
import { HOOK_LINES } from '../../system/constants'
import { findHookFile } from '../../system/hooks'
import { doctorChecks, doctorCommand } from './doctor'

import type { HookFile } from '../../system/types'
import type { DoctorFacts } from './types'

vi.mock(import('../../agents/mark'), async importOriginal => ({
    ...(await importOriginal()),
    detect: vi.fn(),
}))

vi.mock(import('../../agents/versions'), async importOriginal => ({
    ...(await importOriginal()),
    installedVersion: vi.fn(),
}))

vi.mock(import('../../system/hooks'), async importOriginal => ({
    ...(await importOriginal()),
    findHookFile: vi.fn(),
}))

/** The installed hook on a healthy machine. */
const HOOK: HookFile = {
    path: `${process.cwd()}/.git/hooks/prepare-commit-msg`,
    root: process.cwd(),
    husky: false,
    text: `#!/bin/sh\n${HOOK_LINES.path}\n`,
}

/** A machine where everything is set up and every harness passed the lab. */
const HEALTHY: DoctorFacts = {
    onPath: true,
    hook: HOOK,
    wanted: 'path',
    localBin: false,
    detection: { agent: 'pi', via: 'process-tree', model: 'kimi-k3', effort: 'high' },
    platform: 'linux',
    versions: { 'claude-code': null, codex: null, pi: '0.85.1' },
    tested: { linux: { pi: { version: '0.85.1', date: '2026-10-18' } } },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('doctorChecks', () => {
    test('passes a healthy setup and shows the mark', () => {
        expect(doctorChecks(HEALTHY)).toEqual([
            { level: 'ok', text: 'modelmark is on PATH' },
            { level: 'ok', text: 'The hook is installed in .git/hooks/prepare-commit-msg' },
            { level: 'ok', text: 'Found Pi in the process tree' },
            { level: 'ok', text: 'A commit here gets Assisted-by: pi:kimi-k3@high' },
            { level: 'ok', text: 'Pi 0.85.1 passed the lab on Linux' },
        ])
    })

    test('fails when modelmark is off PATH or the hook is missing, with a fix for each', () => {
        const checks = doctorChecks({
            ...HEALTHY,
            onPath: false,
            hook: {
                path: '/r/.git/hooks/prepare-commit-msg',
                root: '/r',
                husky: false,
                text: null,
            },
        })

        expect(checks.filter(check => check.level === 'fail')).toEqual([
            {
                level: 'fail',
                text: 'modelmark isn’t on PATH, so the hook does nothing',
                fix: 'run bun link in the modelmark checkout',
            },
            {
                level: 'fail',
                text: 'The hook isn’t installed in this repository',
                fix: 'run modelmark install',
            },
        ])
    })

    test('only notes a missing repository or agent', () => {
        const checks = doctorChecks({ ...HEALTHY, hook: null, detection: null })

        expect(checks.slice(1, 3)).toEqual([
            { level: 'info', text: 'Not in a git repository, so there is no hook to check' },
            { level: 'info', text: 'No agent is running this, so a commit here gets no mark' },
        ])
    })

    test('warns when the model could not be read, and names the environment fallback', () => {
        const checks = doctorChecks({
            ...HEALTHY,
            detection: { agent: 'codex', via: 'environment', model: null, effort: null },
        })

        expect(checks.slice(2, 4)).toEqual([
            {
                level: 'ok',
                text: 'Found Codex from its environment variables (the process tree was cut short)',
            },
            {
                level: 'warn',
                text: 'Its model couldn’t be read, so a commit here gets Assisted-by: codex:unknown',
                fix: 'check that this harness version passed the lab',
            },
        ])
    })

    test('warns about an installed version the lab has not passed', () => {
        const checks = doctorChecks({
            ...HEALTHY,
            platform: 'macos',
            versions: { 'claude-code': '2.1.400', codex: null, pi: '0.85.1' },
            tested: { macos: { pi: { version: '0.84.3', date: '2026-10-01' } } },
        })

        expect(checks.slice(4)).toEqual([
            {
                level: 'warn',
                text: 'Claude Code 2.1.400 hasn’t been tested on macOS, so its marks may be wrong',
                fix: 'run bun scripts/lab run --all in the modelmark checkout',
            },
            {
                level: 'warn',
                text: 'Pi 0.85.1 hasn’t been tested on macOS (the newest tested is 0.84.3), so its marks may be wrong',
                fix: 'run bun scripts/lab run --all in the modelmark checkout',
            },
        ])
    })
})

describe('a repository that lists modelmark as a dependency', () => {
    const dependencyHook = { ...HOOK, text: `#!/bin/sh\n${HOOK_LINES.dependency}\n` }

    test('checks node_modules instead of PATH', () => {
        const facts = {
            ...HEALTHY,
            onPath: false,
            hook: dependencyHook,
            wanted: 'dependency',
        } as const

        expect(doctorChecks({ ...facts, localBin: true })[0]).toEqual({
            level: 'ok',
            text: 'modelmark is installed in node_modules',
        })
        expect(doctorChecks(facts)[0]).toEqual({
            level: 'fail',
            text: 'modelmark isn’t in node_modules, so the hook does nothing',
            fix: 'run bun install',
        })
    })

    test('warns when the hook still runs modelmark from PATH', () => {
        expect(doctorChecks({ ...HEALTHY, wanted: 'dependency', localBin: true })[1]).toEqual({
            level: 'warn',
            text: 'The hook in .git/hooks/prepare-commit-msg runs modelmark from PATH, but this repository wants it from node_modules',
            fix: 'run modelmark install to switch it',
        })
    })
})

describe('doctorCommand', () => {
    test('prints each check with its fix and exits 1 on a failure', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(Bun, 'which').mockReturnValue(null)
        vi.mocked(findHookFile).mockRejectedValue(new Error('not a git repository'))
        vi.mocked(detect).mockResolvedValue(null)
        vi.mocked(installedVersion).mockResolvedValue(null)
        await doctorCommand({})

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            '✖ modelmark isn’t on PATH, so the hook does nothing',
            '  fix: run bun link in the modelmark checkout',
            '– Not in a git repository, so there is no hook to check',
            '– No agent is running this, so a commit here gets no mark',
        ])
        expect(process.exitCode).toBe(1)
        process.exitCode = 0
    })

    test('prints the facts and checks as JSON', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(Bun, 'which').mockReturnValue('/bin/modelmark')
        vi.mocked(findHookFile).mockResolvedValue(HOOK)
        vi.mocked(detect).mockResolvedValue(null)
        vi.mocked(installedVersion).mockResolvedValue(null)
        await doctorCommand({ json: true })

        const report = JSON.parse(String(log.mock.calls[0]?.[0])) as DoctorFacts & {
            checks: unknown[]
        }

        expect(report.onPath).toBe(true)
        expect(report.checks).toHaveLength(3)
        expect(process.exitCode).toBe(0)
    })
})
