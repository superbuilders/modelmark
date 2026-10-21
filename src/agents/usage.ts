import { statSync } from 'node:fs'

import { recordsFromEnd } from '../system/tail'
import { UNKNOWN_MODEL } from '../trailers/constants'
import { CLAUDE_SYNTHETIC_MODEL, CODEX_KEYS, USAGE_KEYS } from './constants'
import { claudeCodeLogs, codexLog } from './logs'
import { countAt, recordTime, stringAt, valueAt } from './records'

import type { TokenUse } from '../pricing/types'
import type { Env } from '../system/types'
import type { AgentId, LoggedUse } from './types'

/**
 * Whether a record was written at or before a point in time, so it and every
 * record before it were already counted.
 * @param record - a parsed log record
 * @param since - the point (ms since the epoch), or undefined to count everything
 * @returns true when the record is not after the point
 */
function notAfter(record: unknown, since: number | undefined): boolean {
    const time = recordTime(record)

    return since !== undefined && time !== undefined && time <= since
}

/**
 * The newer of two times, either of which may be missing.
 * @param a - a time
 * @param b - another
 * @returns the later one
 */
function later(a: number | undefined, b: number | undefined): number | undefined {
    if (a === undefined || b === undefined) {
        return a ?? b
    }

    return Math.max(a, b)
}

/**
 * The replies in this Claude Code session after a point, from the main log and
 * every subagent's.
 *
 * Claude Code can write one reply on several records, each with the same
 * usage, so a reply counts once per message id and request id. A reply's
 * `input_tokens` already leaves out the cached tokens.
 * @param env - the environment
 * @param since - count only replies after this (ms since the epoch), or everything when undefined
 * @returns the replies and the newest one's time, or undefined when there is no session
 */
function claudeCodeUse(env: Env, since: number | undefined): LoggedUse | undefined {
    const logs = claudeCodeLogs(env)

    if (!logs) {
        return undefined
    }

    const seen = new Set<string>()
    const uses: TokenUse[] = []
    let through: number | undefined

    for (const log of [logs.main, ...logs.subagents]) {
        /*
         * A long session leaves hundreds of subagent logs; one not written
         * since the point holds nothing new.
         */
        if (since !== undefined && statSync(log).mtimeMs <= since) {
            continue
        }

        for (const record of recordsFromEnd(log, USAGE_KEYS)) {
            if (notAfter(record, since)) {
                break
            }

            const model = stringAt(record, 'message', 'model')

            if (
                stringAt(record, 'type') !== 'assistant' ||
                !model ||
                model === CLAUDE_SYNTHETIC_MODEL
            ) {
                continue
            }

            const id = stringAt(record, 'message', 'id')
            const key = id && `${id}:${stringAt(record, 'requestId') ?? ''}`

            if (key && seen.has(key)) {
                continue
            }

            if (key) {
                seen.add(key)
            }

            const usage = valueAt(record, 'message', 'usage')

            uses.push({
                model,
                input: countAt(usage, 'input_tokens'),
                cacheRead: countAt(usage, 'cache_read_input_tokens'),
                cacheWrite: countAt(usage, 'cache_creation_input_tokens'),
                output: countAt(usage, 'output_tokens'),
            })
            through = later(through, recordTime(record))
        }
    }

    return { uses, through }
}

/**
 * The replies in this Codex thread after a point.
 *
 * Codex writes a `token_usage_record` right after each reply, before running
 * the tool the reply asked for, so the commit's own reply is already there.
 * The model is the latest `turn_context` before it. Codex's `input_tokens`
 * includes cache reads and writes, and its output includes thinking.
 * @param env - the environment
 * @param since - count only replies after this (ms since the epoch), or everything when undefined
 * @returns the replies and the newest one's time, or undefined when there is no thread
 */
function codexUse(env: Env, since: number | undefined): LoggedUse | undefined {
    const log = codexLog(env)

    if (!log) {
        return undefined
    }

    /*
     * Read back to the turn in force at the point, then walk forward.
     */
    const records: unknown[] = []

    for (const record of recordsFromEnd(log, CODEX_KEYS)) {
        const type = stringAt(record, 'type')

        if (type === 'token_usage_record' && !notAfter(record, since)) {
            records.push(record)
        } else if (type === 'turn_context') {
            records.push(record)

            if (notAfter(record, since)) {
                break
            }
        }
    }

    const uses: TokenUse[] = []
    let model: string | undefined
    let through: number | undefined

    for (const record of records.toReversed()) {
        if (stringAt(record, 'type') === 'turn_context') {
            model = stringAt(record, 'payload', 'model')

            continue
        }

        const usage = valueAt(record, 'payload', 'usage')
        const cacheRead = countAt(usage, 'cached_input_tokens')
        const cacheWrite = countAt(usage, 'cache_write_input_tokens')

        uses.push({
            model: model ?? UNKNOWN_MODEL,
            input: Math.max(0, countAt(usage, 'input_tokens') - cacheRead - cacheWrite),
            cacheRead,
            cacheWrite,
            output: countAt(usage, 'output_tokens'),
        })
        through = later(through, recordTime(record))
    }

    return { uses, through }
}

/**
 * The replies in this Pi session after a point. Pi records each reply's usage
 * already split: `input` leaves out the cache, and `output` includes thinking.
 * @param env - the environment
 * @param since - count only replies after this (ms since the epoch), or everything when undefined
 * @returns the replies and the newest one's time, or undefined when there is no session file
 */
function piUse(env: Env, since: number | undefined): LoggedUse | undefined {
    const log = env.PI_SESSION_FILE

    if (!log) {
        return undefined
    }

    const uses: TokenUse[] = []
    let through: number | undefined

    for (const record of recordsFromEnd(log, USAGE_KEYS)) {
        if (notAfter(record, since)) {
            break
        }

        const model = stringAt(record, 'message', 'model')

        if (
            stringAt(record, 'type') !== 'message' ||
            stringAt(record, 'message', 'role') !== 'assistant' ||
            !model
        ) {
            continue
        }

        const usage = valueAt(record, 'message', 'usage')

        uses.push({
            model,
            input: countAt(usage, 'input'),
            cacheRead: countAt(usage, 'cacheRead'),
            cacheWrite: countAt(usage, 'cacheWrite'),
            output: countAt(usage, 'output'),
        })
        through = later(through, recordTime(record))
    }

    return { uses, through }
}

/** Each agent's reader. */
const READERS: Readonly<
    Record<AgentId, (env: Env, since: number | undefined) => LoggedUse | undefined>
> = { 'claude-code': claudeCodeUse, codex: codexUse, pi: piUse }

/**
 * The tokens an agent's session used after a point in time, read from the
 * agent's own logs.
 * @param agent - which agent
 * @param env - the environment
 * @param since - count only replies after this (ms since the epoch), or the whole session when undefined
 * @returns the session's replies, or undefined when its logs can't be found or read
 */
export function readSessionUse(
    agent: AgentId,
    env: Env,
    since: number | undefined,
): LoggedUse | undefined {
    try {
        return READERS[agent](env, since)
    } catch {
        return undefined
    }
}
