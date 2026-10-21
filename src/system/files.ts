import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { Dirent } from 'node:fs'

/**
 * Order one folder's entries by name, as a plain sort orders strings (not by
 * locale). Names in one folder are unique, so two never compare equal.
 * @param a - one entry
 * @param b - another
 * @returns negative when a comes first, otherwise positive
 */
function byName(a: Dirent, b: Dirent): number {
    return a.name < b.name ? -1 : 1
}

/**
 * Find a file under a folder tree, visiting names in reverse order at each
 * level so date-named folders (2026/10/18) are searched newest first.
 * @param root - the folder to search
 * @param matches - accepts a file name
 * @param depth - how many folder levels below root to descend
 * @returns the first matching file's path, or undefined
 */
export function findFileNewestFirst(
    root: string,
    matches: (name: string) => boolean,
    depth: number,
): string | undefined {
    if (!existsSync(root)) {
        return undefined
    }

    const entries = readdirSync(root, { withFileTypes: true }).toSorted(byName).toReversed()

    for (const entry of entries) {
        const { name } = entry
        const path = join(root, name)

        if (entry.isDirectory()) {
            const found = depth > 0 ? findFileNewestFirst(path, matches, depth - 1) : undefined

            if (found) {
                return found
            }
        } else if (matches(name)) {
            return path
        }
    }

    return undefined
}

/**
 * List the files directly in a folder whose names end with a suffix.
 * @param dir - the folder
 * @param suffix - the name ending to keep, such as an extension
 * @returns their paths; none when the folder is missing
 */
export function filesEndingWith(dir: string, suffix: string): string[] {
    if (!existsSync(dir)) {
        return []
    }

    return readdirSync(dir)
        .filter(name => name.endsWith(suffix))
        .map(name => join(dir, name))
}

/**
 * Order files from the most recently written.
 * @param paths - files that exist
 * @returns the same paths, newest first
 */
export function newestFirst(paths: string[]): string[] {
    return paths
        .map(path => ({ path, time: statSync(path).mtimeMs }))
        .toSorted((a, b) => b.time - a.time)
        .map(({ path }) => path)
}
