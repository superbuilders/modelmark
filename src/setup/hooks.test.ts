import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { git } from '../system/command'
import { HOOK_LINES } from './constants'
import { findHookFile, hookStyle, wantedStyle } from './hooks'

/**
 * Make an empty repository.
 * @returns its path
 */
async function emptyRepo(): Promise<string> {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'modelmark-hooks-')))

    await git(['init', '-q'], repo)

    return repo
}

describe('findHookFile', () => {
    test("finds git's own hooks folder", async () => {
        const repo = await emptyRepo()

        expect(await findHookFile(repo)).toEqual({
            path: join(repo, '.git', 'hooks', 'prepare-commit-msg'),
            root: repo,
            husky: false,
            text: null,
        })
    })

    test("puts the hook in Husky's folder, not its generated _ folder", async () => {
        const repo = await emptyRepo()

        await git(['config', 'core.hooksPath', '.husky/_'], repo)

        expect(await findHookFile(repo)).toMatchObject({
            path: join(repo, '.husky', 'prepare-commit-msg'),
            husky: true,
        })
    })

    test('reads a hook that is already there', async () => {
        const repo = await emptyRepo()

        writeFileSync(join(repo, '.git', 'hooks', 'prepare-commit-msg'), 'echo hi\n')

        const hook = await findHookFile(repo)

        expect(hook.text).toBe('echo hi\n')
    })

    test('fails outside a repository', async () => {
        await expect(findHookFile(tmpdir())).rejects.toThrow()
    })
})

describe('hookStyle', () => {
    const hook = { path: '/h', root: '/', husky: false }

    test("names which of modelmark's lines a hook holds", () => {
        expect(hookStyle({ ...hook, text: `#!/bin/sh\n${HOOK_LINES.path}\n` })).toBe('path')
        expect(hookStyle({ ...hook, text: `#!/bin/sh\n${HOOK_LINES.dependency}\n` })).toBe(
            'dependency',
        )
    })

    test('is null for a hook without one of them', () => {
        expect(hookStyle({ ...hook, text: `# ${HOOK_LINES.path}\n` })).toBeNull()
        expect(hookStyle({ ...hook, text: null })).toBeNull()
    })
})

describe('wantedStyle', () => {
    test('is dependency when package.json lists modelmark, in either list', async () => {
        const repo = await emptyRepo()

        writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"modelmark":"^0.1.0"}}')
        expect(await wantedStyle(repo)).toBe('dependency')

        writeFileSync(join(repo, 'package.json'), '{"dependencies":{"modelmark":"^0.1.0"}}')
        expect(await wantedStyle(repo)).toBe('dependency')
    })

    test("is path when it doesn't, or there is no package.json", async () => {
        const repo = await emptyRepo()

        expect(await wantedStyle(repo)).toBe('path')

        writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"other":"1.0.0"}}')
        expect(await wantedStyle(repo)).toBe('path')
    })
})
