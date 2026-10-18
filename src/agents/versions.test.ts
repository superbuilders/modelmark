import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { runCommand } from '../system/command'
import {
    currentPlatform,
    installedVersion,
    parseVersion,
    readTestedRecord,
    testedVersion,
} from './versions'

vi.mock(import('../system/command'), async importOriginal => ({
    ...(await importOriginal()),
    runCommand: vi.fn(),
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('parseVersion', () => {
    test.each([
        ['2.1.302 (Claude Code)', '2.1.302'],
        ['codex-cli 0.154.0', '0.154.0'],
        ['0.85.1\n', '0.85.1'],
        ['command not found', null],
    ])('%s has version %s', (output, version) => {
        expect(parseVersion(output)).toBe(version)
    })
})

describe('installedVersion', () => {
    test('runs the harness with --version', async () => {
        vi.mocked(runCommand).mockResolvedValue({
            exitCode: 0,
            stdout: 'codex-cli 0.154.0',
            stderr: '',
        })

        expect(await installedVersion('codex')).toBe('0.154.0')
        expect(runCommand).toHaveBeenCalledWith(['codex', '--version'])
    })

    test('is null when the harness is missing', async () => {
        vi.mocked(runCommand).mockResolvedValue({ exitCode: 127, stdout: '', stderr: '' })

        expect(await installedVersion('pi')).toBeNull()
    })
})

describe('currentPlatform', () => {
    test('names a Mac macos and anything else linux', () => {
        const platform = vi.spyOn(process, 'platform', 'get')

        platform.mockReturnValue('darwin')
        expect(currentPlatform()).toBe('macos')
        platform.mockReturnValue('linux')
        expect(currentPlatform()).toBe('linux')
    })
})

describe('the tested-versions record', () => {
    test('ships beside the source with a version for every harness on Linux', () => {
        const record = readTestedRecord()

        expect(testedVersion(record, 'claude-code', 'linux')?.version).toMatch(/^\d+\.\d+\.\d+$/)
    })

    test('reads as empty when the file is missing or broken', () => {
        const broken = join(mkdtempSync(join(tmpdir(), 'modelmark-tested-')), 'broken.json')

        writeFileSync(broken, '{')

        expect(readTestedRecord('/nonexistent/tested-versions.json')).toEqual({})
        expect(readTestedRecord(broken)).toEqual({})
    })

    test('has no version for a harness never tested on a platform', () => {
        expect(testedVersion({ linux: {} }, 'pi', 'linux')).toBeNull()
        expect(testedVersion({}, 'pi', 'macos')).toBeNull()
    })
})
