import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { filesEndingWith, findFileNewestFirst } from '../system/files'
import { JSONL } from './constants'
import { usageLog } from './usage-log'

import type { Env } from '../system/types'
import type { UseSource } from './types'

/**
 * This Claude Code session's logs.
 *
 * The main log is `<config>/projects/<folder>/<session id>.jsonl`. A subagent
 * writes its own log in `<session id>/subagents/` beside it.
 * @param env - the environment
 * @returns the main log and the subagents' logs, or undefined when there is no session
 */
export function claudeCodeLogs(env: Env): { main: string; subagents: string[] } | undefined {
    const id = env.CLAUDE_CODE_SESSION_ID

    if (!id) {
        return undefined
    }

    const projects = join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
    const main = findFileNewestFirst(projects, name => name === `${id}${JSONL}`, 1)

    return main
        ? {
              main,
              subagents: filesEndingWith(join(main.slice(0, -JSONL.length), 'subagents'), JSONL),
          }
        : undefined
}

/**
 * This Codex thread's log: `<home>/sessions/<yyyy>/<mm>/<dd>/rollout-<time>-<thread id>.jsonl`.
 * @param env - the environment
 * @returns the log, or undefined when there is no thread
 */
export function codexLog(env: Env): string | undefined {
    const id = env.CODEX_THREAD_ID

    if (!id) {
        return undefined
    }

    const sessions = join(env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions')

    return findFileNewestFirst(sessions, name => name.endsWith(`-${id}${JSONL}`), 3)
}

/**
 * The session a source's logs belong to, as a name that stays the same across
 * its commits.
 * @param source - where the session's replies are read from
 * @param env - the environment
 * @returns the session's name, or undefined when there is no session to read
 */
export function sessionName(source: UseSource, env: Env): string | undefined {
    if (source === 'usage-log') {
        return usageLog(env)?.session
    }

    if (source === 'claude-code') {
        return env.CLAUDE_CODE_SESSION_ID
    }

    if (source === 'codex') {
        return env.CODEX_THREAD_ID
    }

    return env.PI_SESSION_FILE ? basename(env.PI_SESSION_FILE, JSONL) : undefined
}
