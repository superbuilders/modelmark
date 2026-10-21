import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ABSOLUTE_PATH } from './patterns'

/**
 * The absolute paths a piece of text names, such as a shell command or a
 * tool's arguments. `~/` is read as the home folder.
 * @param text - the text
 * @param home - the home folder
 * @returns each path, in order
 */
export function absolutePaths(text: string, home: string): string[] {
    return [...text.matchAll(ABSOLUTE_PATH)].map(([, path = '']) =>
        path.startsWith('~') ? join(home, path.slice(1)) : path,
    )
}

/**
 * A lookup of the repository each path belongs to, remembering each answer
 * for as long as the lookup lives.
 * @returns a function from a path to the root of the nearest repository at
 *   or above it (with symlinks resolved), or undefined outside one
 */
export function repositoryFinder(): (path: string) => string | undefined {
    const known = new Map<string, string | undefined>()

    return path => {
        const absolute = resolve(path)

        if (!known.has(absolute)) {
            known.set(absolute, repositoryOf(absolute))
        }

        return known.get(absolute)
    }
}

/**
 * The root of the nearest repository at or above a path. The path need not
 * exist: a file a reply was about to create still belongs to its folder's
 * repository.
 * @param path - an absolute path
 * @returns the root, with symlinks resolved, or undefined outside a repository
 */
function repositoryOf(path: string): string | undefined {
    let dir = path

    while (!existsSync(dir)) {
        if (dirname(dir) === dir) {
            return undefined
        }

        dir = dirname(dir)
    }

    try {
        dir = realpathSync(dir)

        if (!statSync(dir).isDirectory()) {
            dir = dirname(dir)
        }
    } catch {
        return undefined
    }

    for (;;) {
        if (existsSync(join(dir, '.git'))) {
            return dir
        }

        if (dirname(dir) === dir) {
            return undefined
        }

        dir = dirname(dir)
    }
}
