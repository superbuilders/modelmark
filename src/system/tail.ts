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
 * Search a JSONL log from its end for the newest record `pick` accepts.
 *
 * Session logs are append-only and can reach hundreds of megabytes, while the
 * answer is almost always in the last few records. Reading backwards one chunk
 * at a time makes the usual case a single small read; the whole file is read
 * only when no record matches.
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

            const lines = Buffer.concat([chunk, ...carry])
                .subarray(cut + 1)
                .toString('utf8')
                .split('\n')

            for (let index = lines.length - 1; index >= 0; index--) {
                const line = lines[index]

                if (line) {
                    const value = pick(parseLine(line))

                    if (value !== undefined) {
                        return value
                    }
                }
            }

            carry = [chunk.subarray(0, Math.max(cut, 0))]
        }

        return undefined
    } finally {
        closeSync(fd)
    }
}
