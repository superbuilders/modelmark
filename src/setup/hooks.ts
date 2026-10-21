import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { git } from '../system/command'
import { HOOK_LINES, HOOK_NAME, PACKAGE_NAME } from './constants'

import type { HookFile, HookStyle } from './types'

/**
 * The dependency lists of a package.json.
 */
interface PackageManifest {
    /** Runtime dependencies. */
    dependencies?: Record<string, string>
    /** Development dependencies. */
    devDependencies?: Record<string, string>
}

/**
 * Find where this repository's prepare-commit-msg hook lives. Husky points
 * `core.hooksPath` at `_` inside its folder (`.husky/_` unless the repository
 * names another) and runs the scripts in that folder itself, so a Husky
 * repository's hook is `.husky/prepare-commit-msg`.
 * @param cwd - a folder inside the repository (default: this process's)
 * @returns the hook file, and whether it is installed there
 */
export async function findHookFile(cwd?: string): Promise<HookFile> {
    const output = await git(
        ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-path', 'hooks'],
        cwd,
    )
    const [root = '', hooks = ''] = output.trim().split('\n')
    const husky = basename(hooks) === '_'
    const path = join(husky ? dirname(hooks) : hooks, HOOK_NAME)

    return { path, root, husky, text: await readFile(path, 'utf8').catch(() => null) }
}

/**
 * Which of modelmark's lines a hook file holds.
 * @param hook - the hook file
 * @returns the line's style, or null when the hook doesn't run modelmark
 */
export function hookStyle(hook: HookFile): HookStyle | null {
    const lines = hook.text?.split('\n') ?? []
    const styles = Object.keys(HOOK_LINES) as HookStyle[]

    return styles.find(style => lines.includes(HOOK_LINES[style])) ?? null
}

/**
 * The hook style a repository should use: `dependency` when its package.json
 * lists modelmark, so everyone gets the version the repository pins.
 * @param root - the repository's root folder
 * @returns the style
 */
export async function wantedStyle(root: string): Promise<HookStyle> {
    try {
        const manifest = JSON.parse(
            await readFile(join(root, 'package.json'), 'utf8'),
        ) as PackageManifest
        const listed = { ...manifest.dependencies, ...manifest.devDependencies }

        return Object.hasOwn(listed, PACKAGE_NAME) ? 'dependency' : 'path'
    } catch {
        return 'path'
    }
}
