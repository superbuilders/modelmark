import { firstRecord, recordsFromEnd } from '../system/tail'
import { USAGE_LOG, USAGE_LOG_VERSION } from './constants'
import { CACHE_TTL, USAGE_LOG_TIME } from './patterns'
import { stringAt, valueAt } from './records'

import type { Env } from '../system/types'
import type { LoggedReply } from './types'

/**
 * Whether a value is a token count: a whole number, not negative.
 * @param value - a member's value
 * @returns true for a count
 */
function isCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0
}

/**
 * Whether a value is an absolute path, as the usage log means it: a string starting with `/`.
 * @param value - a member's value
 * @returns true for an absolute path
 */
function isAbsolutePath(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('/')
}

/**
 * Whether a value is a well-formed split of cache writes by lifetime: each
 * label a lifetime, each value a count, together adding up to the writes.
 * @param value - the `cacheWriteByTtl` member
 * @param cacheWrite - the reply's `cacheWrite`
 * @returns true for a split a reader keeps
 */
function isCacheSplit(value: unknown, cacheWrite: number): value is Record<string, number> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }

    let sum = 0

    for (const [ttl, tokens] of Object.entries(value)) {
        if (!CACHE_TTL.test(ttl) || !isCount(tokens)) {
            return false
        }

        sum += tokens
    }

    return sum === cacheWrite
}

/**
 * A reply line, read as section 6.2 says: anything malformed reads as no
 * reply, so a reader skips it. The log counts every input token; modelmark's
 * buckets don't overlap, so its fresh input is what the cache didn't cover.
 * @param record - a parsed line
 * @returns the reply, or undefined to skip the line
 */
function replyOf(record: unknown): LoggedReply | undefined {
    const at = valueAt(record, 'at')
    const model = stringAt(record, 'model')
    const [input, cacheRead, cacheWrite, output] = [
        'input',
        'cacheRead',
        'cacheWrite',
        'output',
    ].map(key => valueAt(record, key))
    const cwd = valueAt(record, 'cwd')
    const paths = valueAt(record, 'paths') ?? []
    const split = valueAt(record, 'cacheWriteByTtl')
    const time = typeof at === 'string' && USAGE_LOG_TIME.test(at) ? Date.parse(at) : Number.NaN

    if (
        Number.isNaN(time) ||
        model === undefined ||
        !isCount(input) ||
        !isCount(cacheRead) ||
        !isCount(cacheWrite) ||
        !isCount(output) ||
        cacheRead + cacheWrite > input ||
        !isAbsolutePath(cwd) ||
        !Array.isArray(paths) ||
        !paths.every(isAbsolutePath) ||
        (split !== undefined && !isCacheSplit(split, cacheWrite))
    ) {
        return undefined
    }

    return {
        use: {
            model,
            input: input - cacheRead - cacheWrite,
            cacheRead,
            cacheWrite,
            ...(split === undefined ? {} : { cacheWriteByTtl: split }),
            output,
        },
        time,
        cwd,
        paths,
    }
}

/**
 * The usage log the running command's conversation writes, when the
 * environment names one and its header is version 1's (section 6.1).
 * A log that can't be opened is no log: the commit just gets no cost.
 * @param env - the environment
 * @returns the log's path and its session, or undefined when there is no log to read
 */
export function usageLog(env: Env): { path: string; session: string } | undefined {
    const path = env[USAGE_LOG]
    let header: unknown

    if (!isAbsolutePath(path)) {
        return undefined
    }

    try {
        header = firstRecord(path)
    } catch {
        return undefined
    }

    const session = stringAt(header, 'session')

    return valueAt(header, 'modelmark') === 'usage' &&
        valueAt(header, 'version') === USAGE_LOG_VERSION &&
        session !== undefined
        ? { path, session }
        : undefined
}

/**
 * A usage log's replies, newest first. Lines that aren't replies, the header
 * among them, are skipped.
 * @param path - the log
 * @yields each reply
 */
export function* usageLogReplies(path: string): Generator<LoggedReply> {
    for (const record of recordsFromEnd(path)) {
        const reply = replyOf(record)

        if (reply) {
            yield reply
        }
    }
}
