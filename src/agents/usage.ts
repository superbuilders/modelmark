import { statSync } from 'node:fs'
import { homedir } from 'node:os'

import { absolutePaths, repositoryFinder } from '../system/repos'
import { firstRecord, recordsFromEnd } from '../system/tail'
import { CLAUDE_SYNTHETIC_MODEL, CODEX_KEYS, CODEX_TOOL_CALLS, USAGE_KEYS } from './constants'
import { claudeCodeLogs, codexLog } from './logs'
import { CODEX_WORKDIR } from './patterns'
import { countAt, recordTime, stringAt, valueAt } from './records'

import type { TokenUse } from '../pricing/types'
import type { Env } from '../system/types'
import type { AgentId, LoggedUse, ReplyPlace } from './types'

/**
 * Whether a record was written at or before a point in time, so it and every
 * record before it were already counted.
 * @param time - when the record was written, if its log says
 * @param since - the point (ms since the epoch), or undefined to count everything
 * @returns true when the record is not after the point
 */
function notAfter(time: number | undefined, since: number | undefined): boolean {
    return since !== undefined && time !== undefined && time <= since
}

/**
 * Whether a record is known to come after a point in time. A record with no
 * time can't be placed, so once a commit has been counted it is left out
 * rather than charged again.
 * @param time - when the record was written, if its log says
 * @param since - the point (ms since the epoch), or undefined to count everything
 * @returns true when the record counts
 */
function isNew(time: number | undefined, since: number | undefined): boolean {
    return since === undefined || (time !== undefined && time > since)
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
 * Whether a reply worked in a repository, for a commit there to pay for it.
 * The paths its tool calls name decide when any of them is in a repository;
 * otherwise its working folder does. A reply that only ran `bun test` in its
 * folder belongs to that folder's repository, and one that ran
 * `cd /other/repo && git commit` belongs to the other one.
 * @param root - the committing repository's working folder
 * @returns a test for each reply
 */
function workedIn(root: string): (place: ReplyPlace) => boolean {
    const repositoryOf = repositoryFinder()
    const target = repositoryOf(root)

    return ({ cwd, paths }) => {
        const named = new Set(paths.map(path => repositoryOf(path)))

        named.delete(undefined)

        if (named.size > 0) {
            return named.has(target)
        }

        return cwd !== undefined && repositoryOf(cwd) === target
    }
}

/**
 * The absolute paths a reply's tool calls name.
 * @param content - the reply's content blocks
 * @param type - the block type a tool call has
 * @param field - the block field holding the call's arguments
 * @param env - the environment, for the home folder
 * @returns the paths
 */
function toolPaths(content: unknown, type: string, field: string, env: Env): string[] {
    return Array.isArray(content)
        ? content
              .filter(block => stringAt(block, 'type') === type)
              .flatMap(block =>
                  absolutePaths(
                      JSON.stringify(valueAt(block, field) ?? null),
                      env.HOME ?? homedir(),
                  ),
              )
        : []
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
 * @param counts - whether a reply counts, from where it worked
 * @returns the replies and the newest one's time, or undefined when there is no session
 */
function claudeCodeUse(
    env: Env,
    since: number | undefined,
    counts: (place: ReplyPlace) => boolean,
): LoggedUse | undefined {
    const logs = claudeCodeLogs(env)

    if (!logs) {
        return undefined
    }

    /*
     * A reply's records share its usage but each holds one content block, so
     * the paths its tool calls name are gathered from all of them.
     */
    const replies = new Map<string, { use: TokenUse; time: number | undefined } & ReplyPlace>()

    for (const log of [logs.main, ...logs.subagents]) {
        /*
         * A long session leaves hundreds of subagent logs; one not written
         * since the point holds nothing new.
         */
        if (since !== undefined && statSync(log).mtimeMs <= since) {
            continue
        }

        for (const record of recordsFromEnd(log, USAGE_KEYS)) {
            const time = recordTime(record)

            if (notAfter(time, since)) {
                break
            }

            if (!isNew(time, since)) {
                continue
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
            const key = id
                ? `${id}:${stringAt(record, 'requestId') ?? ''}`
                : `${log}#${replies.size}`
            const paths = toolPaths(valueAt(record, 'message', 'content'), 'tool_use', 'input', env)
            const reply = replies.get(key)

            if (reply) {
                reply.paths.push(...paths)

                continue
            }

            const usage = valueAt(record, 'message', 'usage')

            replies.set(key, {
                use: {
                    model,
                    input: countAt(usage, 'input_tokens'),
                    cacheRead: countAt(usage, 'cache_read_input_tokens'),
                    cacheWrite: countAt(usage, 'cache_creation_input_tokens'),
                    output: countAt(usage, 'output_tokens'),
                },
                time,
                cwd: stringAt(record, 'cwd'),
                paths,
            })
        }
    }

    const uses: TokenUse[] = []
    let through: number | undefined

    for (const reply of replies.values()) {
        if (counts(reply)) {
            uses.push(reply.use)
            through = later(through, reply.time)
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
 * @param counts - whether a reply counts, from where it worked
 * @returns the replies and the newest one's time, or undefined when there is no thread
 */
function codexUse(
    env: Env,
    since: number | undefined,
    counts: (place: ReplyPlace) => boolean,
): LoggedUse | undefined {
    const log = codexLog(env)

    if (!log) {
        return undefined
    }

    /*
     * Read back to the turn in force at the point, then walk forward.
     */
    const records: unknown[] = []

    for (const record of recordsFromEnd(log, [...CODEX_KEYS, ...CODEX_TOOL_CALLS])) {
        const type = stringAt(record, 'type')

        if (type === 'turn_context') {
            records.push(record)

            if (notAfter(recordTime(record), since)) {
                break
            }
        } else if (
            isNew(recordTime(record), since) &&
            (type === 'token_usage_record' ||
                (type === 'response_item' &&
                    CODEX_TOOL_CALLS.includes(`"${stringAt(record, 'payload', 'type') ?? ''}"`)))
        ) {
            records.push(record)
        }
    }

    const uses: TokenUse[] = []
    let model: string | undefined
    let cwd: string | undefined
    let paths: string[] = []
    let workdir: string | undefined
    let through: number | undefined

    /*
     * A reply's tool calls come just before its token record.
     */
    for (const record of records.toReversed()) {
        const type = stringAt(record, 'type')

        if (type === 'turn_context') {
            model = stringAt(record, 'payload', 'model')
            cwd = stringAt(record, 'payload', 'cwd')

            continue
        }

        if (type === 'response_item') {
            const call =
                stringAt(record, 'payload', 'arguments') ??
                stringAt(record, 'payload', 'input') ??
                JSON.stringify(valueAt(record, 'payload', 'action') ?? null)

            /*
             * A shell call names the folder it runs in, which is where the
             * reply worked, not a path it worked on.
             */
            for (const [, folder] of call.matchAll(CODEX_WORKDIR)) {
                workdir = folder
            }

            paths.push(...absolutePaths(call.replaceAll(CODEX_WORKDIR, ''), env.HOME ?? homedir()))

            continue
        }

        const place = { cwd: workdir ?? cwd, paths }

        paths = []
        workdir = undefined

        if (!counts(place)) {
            continue
        }

        const usage = valueAt(record, 'payload', 'usage')
        const cacheRead = countAt(usage, 'cached_input_tokens')
        const cacheWrite = countAt(usage, 'cache_write_input_tokens')

        uses.push({
            model: model ?? null,
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
 * @param counts - whether a reply counts, from where it worked
 * @returns the replies and the newest one's time, or undefined when there is no session file
 */
function piUse(
    env: Env,
    since: number | undefined,
    counts: (place: ReplyPlace) => boolean,
): LoggedUse | undefined {
    const log = env.PI_SESSION_FILE

    if (!log) {
        return undefined
    }

    /*
     * Pi notes only where the session started, in its first record.
     */
    const cwd = stringAt(firstRecord(log), 'cwd')
    const uses: TokenUse[] = []
    let through: number | undefined

    for (const record of recordsFromEnd(log, USAGE_KEYS)) {
        const time = recordTime(record)

        if (notAfter(time, since)) {
            break
        }

        if (!isNew(time, since)) {
            continue
        }

        const model = stringAt(record, 'message', 'model')

        if (
            stringAt(record, 'type') !== 'message' ||
            stringAt(record, 'message', 'role') !== 'assistant' ||
            !model ||
            !counts({
                cwd,
                paths: toolPaths(
                    valueAt(record, 'message', 'content'),
                    'toolCall',
                    'arguments',
                    env,
                ),
            })
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
        through = later(through, time)
    }

    return { uses, through }
}

/** Each agent's reader. */
const READERS: Readonly<
    Record<
        AgentId,
        (
            env: Env,
            since: number | undefined,
            counts: (place: ReplyPlace) => boolean,
        ) => LoggedUse | undefined
    >
> = { 'claude-code': claudeCodeUse, codex: codexUse, pi: piUse }

/**
 * The tokens an agent's session used after a point in time in one
 * repository, read from the agent's own logs.
 * @param agent - which agent
 * @param env - the environment
 * @param since - count only replies after this (ms since the epoch), or the whole session when undefined
 * @param root - count only replies that worked in this repository
 * @returns the session's replies, or undefined when its logs can't be found or read
 */
export function readSessionUse(
    agent: AgentId,
    env: Env,
    since: number | undefined,
    root: string,
): LoggedUse | undefined {
    try {
        return READERS[agent](env, since, workedIn(root))
    } catch {
        return undefined
    }
}
