import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

import { TAIL_CHUNK_BYTES } from './constants'

/**
 * Parse one JSONL line, skipping lines that are not JSON (a torn last write).
 * @param line - one line of the log
 * @returns the parsed value, or undefined
 */
function parseLine(line: string): unknown {
    try {
        return JSON.parse(line)
    } catch {
        return undefined
    }
}

/**
 * Read a JSONL log's records from its end, newest first.
 *
 * Session logs are append-only and can reach hundreds of megabytes, while
 * what a caller wants is almost always in the last few records. Reading
 * backwards one chunk at a time makes the usual case a single small read; the
 * whole file is read only when the caller keeps going to the start.
 * @param path - the log file
 * @param keep - parse only lines holding one of these texts (default: every line), since decoding and parsing are most of the work
 * @param chunkBytes - read size per step
 * @yields each parsed record, newest first (undefined for a line that is not JSON)
 */
export function* recordsFromEnd(
    path: string,
    keep: readonly string[] = [],
    chunkBytes = TAIL_CHUNK_BYTES,
): Generator {
    const fd = openSync(path, 'r')
    /*
     * One buffer serves every read, instead of a new one per chunk; an
     * unfinished line is copied out before the next read overwrites it.
     */
    const buffer = Buffer.allocUnsafe(chunkBytes)

    try {
        let end = fstatSync(fd).size
        /*
         * Copies of what follows the earliest newline seen so far that are not
         * yet a whole line: the next (earlier) chunk completes them.
         */
        let carry: Buffer[] = []

        while (end > 0) {
            const start = Math.max(0, end - chunkBytes)
            const chunk = buffer.subarray(0, readSync(fd, buffer, 0, end - start, start))
            /*
             * Everything before the first newline may continue in an earlier
             * chunk, unless this chunk starts the file.
             */
            const cut = start > 0 ? chunk.indexOf('\n') : -1

            end = start

            if (start > 0 && cut === -1) {
                carry = [Buffer.from(chunk), ...carry]

                continue
            }

            const lines = chunk.subarray(cut + 1)
            /*
             * A wanted text sits inside one line: a whole one in this chunk,
             * or the line this chunk ends with, which the carry continues.
             */
            const inLines = keep.length === 0 || keep.some(text => lines.includes(text))
            const open =
                !inLines && carry.length > 0
                    ? Buffer.concat([lines.subarray(lines.lastIndexOf('\n') + 1), ...carry])
                    : undefined
            const wanted = inLines || (open !== undefined && keep.some(text => open.includes(text)))
            const block = wanted ? Buffer.concat([lines, ...carry]).toString('utf8') : ''

            carry = [Buffer.from(chunk.subarray(0, Math.max(cut, 0)))]

            if (!wanted) {
                continue
            }

            const records = block.split('\n')

            for (let index = records.length - 1; index >= 0; index--) {
                const line = records[index]

                if (line && (keep.length === 0 || keep.some(text => line.includes(text)))) {
                    yield parseLine(line)
                }
            }
        }
    } finally {
        closeSync(fd)
    }
}

/**
 * Search a JSONL log from its end for the newest record `pick` accepts.
 * @param path - the log file
 * @param pick - returns a value for a matching record, undefined otherwise
 * @param chunkBytes - read size per step
 * @returns pick's value for the newest matching record, or undefined
 */
export function findLast<T>(
    path: string,
    pick: (record: unknown) => T | undefined,
    chunkBytes = TAIL_CHUNK_BYTES,
): T | undefined {
    for (const record of recordsFromEnd(path, [], chunkBytes)) {
        const value = pick(record)

        if (value !== undefined) {
            return value
        }
    }

    return undefined
}

/**
 * Read a JSONL log's first record, such as a header naming where the session
 * started. Empty lines before it are passed over.
 * @param path - the log file
 * @param chunkBytes - how much of the file's start to read
 * @returns the parsed record, or undefined when the first non-empty line is not JSON
 */
export function firstRecord(path: string, chunkBytes = TAIL_CHUNK_BYTES): unknown {
    const fd = openSync(path, 'r')

    try {
        const buffer = Buffer.allocUnsafe(chunkBytes)
        const text = buffer.subarray(0, readSync(fd, buffer, 0, chunkBytes, 0)).toString('utf8')

        const start = text.search(/\S/)
        const end = text.indexOf('\n', start)

        return start === -1 ? undefined : parseLine(text.slice(start, end === -1 ? undefined : end))
    } finally {
        closeSync(fd)
    }
}
