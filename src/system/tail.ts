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
): Generator<unknown> {
    const fd = openSync(path, 'r')

    try {
        let end = fstatSync(fd).size
        /*
         * Chunks after the earliest newline seen so far that are not yet a whole
         * line: the next (earlier) chunk completes them. They hold no newline,
         * so only each new chunk is searched, and they are joined once.
         */
        let carry: Buffer[] = []

        while (end > 0) {
            const start = Math.max(0, end - chunkBytes)
            const chunk = Buffer.alloc(end - start)

            readSync(fd, chunk, 0, chunk.length, start)

            /*
             * Everything before the first newline may continue in an earlier
             * chunk, unless this chunk starts the file.
             */
            const cut = start > 0 ? chunk.indexOf('\n') : -1

            end = start

            if (start > 0 && cut === -1) {
                carry = [chunk, ...carry]

                continue
            }

            const block = Buffer.concat([chunk, ...carry]).subarray(cut + 1)

            carry = [chunk.subarray(0, Math.max(cut, 0))]

            /*
             * A block without any wanted text holds no wanted line, so it
             * needn't be decoded.
             */
            if (keep.length > 0 && !keep.some(text => block.includes(text))) {
                continue
            }

            const lines = block.toString('utf8').split('\n')

            for (let index = lines.length - 1; index >= 0; index--) {
                const line = lines[index]

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
