import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { filesEndingWith, findFileNewestFirst, newestFirst } from './files'

/**
 * Create an empty file, with its folders.
 * @param path - the file
 * @param mtime - its modification time in milliseconds
 * @returns the path
 */
function touch(path: string, mtime = 1000): string {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '')
    utimesSync(path, new Date(mtime), new Date(mtime))

    return path
}

describe('findFileNewestFirst', () => {
    test('searches the newest dated folder first and stops at the depth limit', () => {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-files-'))

        touch(join(root, '2026', '09', 'a-x.jsonl'))

        const newer = touch(join(root, '2026', '10', 'b-x.jsonl'))

        touch(join(root, 'deep', 'er', 'than', 'c-y.jsonl'))

        expect(findFileNewestFirst(root, name => name.endsWith('-x.jsonl'), 2)).toBe(newer)
        expect(findFileNewestFirst(root, name => name.endsWith('-y.jsonl'), 2)).toBeUndefined()
        expect(findFileNewestFirst(root, name => name.endsWith('-x.jsonl'), 0)).toBeUndefined()
    })

    test('a missing folder finds nothing', () => {
        expect(findFileNewestFirst('/no/such/folder', () => true, 3)).toBeUndefined()
    })
})

describe('filesEndingWith', () => {
    test('lists matching files directly in the folder, and nothing for a missing one', () => {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-files-'))
        const log = touch(join(root, 'a.jsonl'))

        touch(join(root, 'b.txt'))

        expect(filesEndingWith(root, '.jsonl')).toEqual([log])
        expect(filesEndingWith(join(root, 'missing'), '.jsonl')).toEqual([])
    })
})

describe('newestFirst', () => {
    test('orders files from the most recently written', () => {
        const root = mkdtempSync(join(tmpdir(), 'modelmark-files-'))
        const first = touch(join(root, 'first'), 2000)
        const older = touch(join(root, 'older'), 1000)
        const newer = touch(join(root, 'newer'), 3000)

        expect(newestFirst([first, older, newer])).toEqual([newer, first, older])
    })
})
