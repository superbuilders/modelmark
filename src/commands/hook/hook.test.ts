import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { detect } from '../../agents/mark'
import { hookCommand, markMessage } from './hook'

import type { Detection } from '../../agents/types'

vi.mock(import('../../agents/mark'), async importOriginal => ({
    ...(await importOriginal()),
    detect: vi.fn(),
}))

afterEach(() => {
    vi.restoreAllMocks()
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

describe('hookCommand', () => {
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
