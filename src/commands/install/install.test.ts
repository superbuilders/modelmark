import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFileSync,
    existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { git } from '../../system/command'
import { HOOK_LINES } from '../../system/constants'
import { install, installCommand, uninstall, uninstallCommand } from './install'

/** The line a repository without modelmark as a dependency gets. */
const HOOK_LINE = HOOK_LINES.path

/**
 * Make an empty repository and run the test from inside it.
 * @param hooksPath - a `core.hooksPath` to set, such as Husky's `.husky/_`
 * @returns the repository's path
 */
async function enterRepo(hooksPath?: string): Promise<string> {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'modelmark-install-')))

    await git(['init', '-q'], repo)

    if (hooksPath) {
        await git(['config', 'core.hooksPath', hooksPath], repo)
    }

    vi.spyOn(process, 'cwd').mockReturnValue(repo)

    return repo
}

/**
 * The plain hook file's path in a repository.
 * @param repo - the repository
 * @returns the path
 */
function hookPath(repo: string): string {
    return join(repo, '.git', 'hooks', 'prepare-commit-msg')
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('install', () => {
    test('writes an executable hook that runs modelmark', async () => {
        const repo = await enterRepo()

        await install()

        expect(readFileSync(hookPath(repo), 'utf8')).toBe(`#!/bin/sh\n${HOOK_LINE}\n`)
        expect(statSync(hookPath(repo)).mode & 0o111).toBe(0o111)
    })

    test("writes Husky's hook into .husky, creating the folder", async () => {
        const repo = await enterRepo('.husky/_')

        const { hook } = await install()

        expect(hook.husky).toBe(true)
        expect(readFileSync(join(repo, '.husky', 'prepare-commit-msg'), 'utf8')).toContain(
            HOOK_LINE,
        )
    })

    test('leaves an installed hook as it is', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), `#!/bin/sh\necho mine\n${HOOK_LINE}\n`)
        await install()

        expect(readFileSync(hookPath(repo), 'utf8')).toBe(`#!/bin/sh\necho mine\n${HOOK_LINE}\n`)
    })

    test('refuses to change a hook that does something else, and shows the line to add', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), '#!/bin/sh\nexec other-tool "$@"\n')

        await expect(install()).rejects.toThrow(HOOK_LINE)
        expect(readFileSync(hookPath(repo), 'utf8')).toBe('#!/bin/sh\nexec other-tool "$@"\n')
    })
})

describe('uninstall', () => {
    test('deletes a hook that only ran modelmark', async () => {
        const repo = await enterRepo()

        await install()
        await uninstall()

        expect(existsSync(hookPath(repo))).toBe(false)
    })

    test('keeps the rest of a hook that does more', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), `#!/bin/sh\necho mine\n${HOOK_LINE}\n`)
        await uninstall()

        expect(readFileSync(hookPath(repo), 'utf8')).toBe('#!/bin/sh\necho mine\n')
    })

    test("is null when modelmark's hook isn't there", async () => {
        await enterRepo()

        expect(await uninstall()).toBeNull()
    })

    test('leaves a hook that never ran modelmark untouched', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), '#!/bin/sh\nexec other-tool "$@"\n')

        expect(await uninstall()).toBeNull()
        expect(readFileSync(hookPath(repo), 'utf8')).toBe('#!/bin/sh\nexec other-tool "$@"\n')
    })
})

describe('the commands', () => {
    test('install says where the hook went, and warns when modelmark is off PATH', async () => {
        await enterRepo('.husky/_')

        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(Bun, 'which').mockReturnValue(null)
        await installCommand()

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            'Installed the hook in .husky/prepare-commit-msg',
            'This repository uses Husky, so commit that file to mark everyone’s commits',
            'modelmark isn’t on PATH yet, so the hook does nothing; run bun link in the modelmark checkout',
        ])
    })

    test('install says so when the hook is already there', async () => {
        await enterRepo()

        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(Bun, 'which').mockReturnValue('/bin/modelmark')
        await installCommand()
        await installCommand()

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            'Installed the hook in .git/hooks/prepare-commit-msg',
            'Already installed in .git/hooks/prepare-commit-msg',
        ])
    })

    test('uninstall says what it did', async () => {
        await enterRepo()

        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        await install()
        await uninstallCommand()
        await uninstallCommand()

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            'Removed modelmark from .git/hooks/prepare-commit-msg',
            'modelmark’s hook isn’t installed here',
        ])
    })
})

describe('a repository that lists modelmark as a dependency', () => {
    test('gets the node_modules line, and install switches an older PATH line to it', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), `#!/bin/sh\necho mine\n${HOOK_LINE}\n`)
        writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"modelmark":"^0.1.0"}}')

        const result = await install()

        expect(result.outcome).toBe('switched')
        expect(readFileSync(hookPath(repo), 'utf8')).toBe(
            `#!/bin/sh\necho mine\n${HOOK_LINES.dependency}\n`,
        )
    })

    test('install says when node_modules has no modelmark yet', async () => {
        const repo = await enterRepo()

        writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"modelmark":"^0.1.0"}}')

        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        await installCommand()

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            'Installed the hook in .git/hooks/prepare-commit-msg',
            'modelmark isn’t in node_modules yet, so the hook does nothing until bun install runs',
        ])
    })

    test('install stays quiet once node_modules has it', async () => {
        const repo = await enterRepo()

        writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"modelmark":"^0.1.0"}}')
        mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true })
        writeFileSync(join(repo, 'node_modules', '.bin', 'modelmark'), '')

        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        await installCommand()

        expect(log.mock.calls.map(([line]) => line)).toEqual([
            'Installed the hook in .git/hooks/prepare-commit-msg',
        ])
    })

    test('uninstall removes either line', async () => {
        const repo = await enterRepo()

        writeFileSync(hookPath(repo), `#!/bin/sh\n${HOOK_LINES.dependency}\n`)
        await uninstall()

        expect(existsSync(hookPath(repo))).toBe(false)
    })
})
