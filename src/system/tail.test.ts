import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { findLast } from './tail'

/**
 * Write lines to a fresh temporary file.
 * @param lines - file content, one entry per line
 * @returns the file's path
 */
function logWith(lines: string[]): string {
    const path = join(mkdtempSync(join(tmpdir(), 'modelmark-tail-')), 'log.jsonl')

    writeFileSync(path, `${lines.join('\n')}\n`)

    return path
}

/**
 * The `n` field of a record, when it has one.
 * @param record - a parsed record
 * @returns the number, or undefined
 */
function pickN(record: unknown): number | undefined {
    const n = (record as { n?: unknown } | undefined)?.n

    return typeof n === 'number' ? n : undefined
}

describe('findLast', () => {
    const lines = Array.from({ length: 50 }, (_, index) =>
        JSON.stringify({ n: index, pad: 'x'.repeat(index) }),
    )

    test.each([1, 7, 64, 100_000])('finds the newest match with %i-byte chunks', chunk => {
        expect(findLast(logWith(lines), pickN, chunk)).toBe(49)
    })

    test('keeps searching back past records that do not match', () => {
        const path = logWith([
            JSON.stringify({ n: 3 }),
            ...Array.from({ length: 20 }, () => '{"other":true}'),
        ])

        expect(findLast(path, pickN, 16)).toBe(3)
    })

    test('skips a torn last line', () => {
        expect(findLast(logWith([JSON.stringify({ n: 1 }), '{"n": 2, "cut']), pickN)).toBe(1)
    })

    test('returns undefined when nothing matches, and for an empty file', () => {
        expect(findLast(logWith(['{"other":true}']), pickN)).toBeUndefined()
        expect(findLast(logWith([]), pickN)).toBeUndefined()
    })
})
