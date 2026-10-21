import { newestFirst } from '../system/files'
import { findLast } from '../system/tail'
import { CLAUDE_SHELL_TOOL, CLAUDE_SYNTHETIC_MODEL, NO_MODEL_USE } from './constants'
import { claudeCodeLogs, codexLog } from './logs'
import { stringAt } from './records'

import type { Env } from '../system/types'
import type { AgentId, ModelUse } from './types'

/**
 * Pair a model read from a log record with that record's effort.
 * @param model - the model id the record names, if any
 * @param effort - the effort the record names, if any
 * @returns both, or undefined when the record names no model (so the search goes on)
 */
function modelUse(model: string | undefined, effort: string | undefined): ModelUse | undefined {
    return model ? { model, effort: effort ?? null } : undefined
}

/**
 * The latest reply in a Claude Code log.
 * @param log - the log file
 * @returns the reply record, or undefined when the log has none
 */
function latestClaudeReply(log: string): unknown {
    return findLast(log, record => {
        const model = stringAt(record, 'message', 'model')

        return stringAt(record, 'type') === 'assistant' && model && model !== CLAUDE_SYNTHETIC_MODEL
            ? record
            : undefined
    })
}

/**
 * Whether a Claude Code reply asked to run a shell command.
 * @param reply - a reply record
 * @returns true when one of its parts calls the shell tool
 */
function asksForShell(reply: unknown): boolean {
    const content = (reply as { message?: { content?: unknown } }).message?.content

    return (
        Array.isArray(content) &&
        content.some(
            part =>
                stringAt(part, 'type') === 'tool_use' &&
                stringAt(part, 'name') === CLAUDE_SHELL_TOOL,
        )
    )
}

/**
 * The model and effort behind the reply that ran the commit in this Claude
 * Code session.
 *
 * A subagent's replies go to its own log. A subagent can run in the
 * background while the main conversation keeps replying, so the newest log
 * isn't always the one committing: the conversation that ran the commit is
 * the newest whose latest reply asked for the shell. Without one, the newest
 * reply wins. Each reply record names its model and, beside it, the effort.
 * @param env - the environment
 * @returns the model and effort, or undefined
 */
function claudeCode(env: Env): ModelUse | undefined {
    const logs = claudeCodeLogs(env)

    if (!logs) {
        return undefined
    }

    let newest: unknown

    for (const log of newestFirst([logs.main, ...logs.subagents])) {
        const reply = latestClaudeReply(log)

        newest ??= reply

        if (reply !== undefined && asksForShell(reply)) {
            newest = reply

            break
        }
    }

    return modelUse(stringAt(newest, 'message', 'model'), stringAt(newest, 'effort'))
}

/**
 * The model and effort of the latest turn in this Codex thread. Codex writes
 * one `turn_context` record naming both at the start of each turn.
 * @param env - the environment
 * @returns the model and effort, or undefined
 */
function codex(env: Env): ModelUse | undefined {
    const log = codexLog(env)

    return log
        ? findLast(log, record =>
              stringAt(record, 'type') === 'turn_context'
                  ? modelUse(
                        stringAt(record, 'payload', 'model'),
                        stringAt(record, 'payload', 'effort'),
                    )
                  : undefined,
          )
        : undefined
}

/**
 * The model behind the latest reply in this Pi session, and its thinking level.
 *
 * Pi names its log in `PI_SESSION_FILE`. A run without a session file
 * (`--no-session`) still sets `PI_MODEL`, the model it started with. Pi sets
 * `PI_REASONING_LEVEL` on every command from its current thinking level.
 * @param env - the environment
 * @returns the model and effort
 */
function pi(env: Env): ModelUse {
    const log = env.PI_SESSION_FILE
    let model: string | undefined

    try {
        model = log
            ? findLast(log, record =>
                  stringAt(record, 'type') === 'message' &&
                  stringAt(record, 'message', 'role') === 'assistant'
                      ? stringAt(record, 'message', 'model')
                      : undefined,
              )
            : undefined
    } catch {
        model = undefined
    }

    return {
        model: model ?? (env.PI_MODEL || null),
        effort: env.PI_REASONING_LEVEL || null,
    }
}

/**
 * Read the model and effort behind an agent's latest reply from that agent's own records.
 * @param agent - which agent
 * @param env - the environment
 * @returns the model and effort, each null when the agent's records don't give it
 */
export function readModelUse(agent: AgentId, env: Env): ModelUse {
    try {
        if (agent === 'claude-code') {
            return claudeCode(env) ?? NO_MODEL_USE
        }

        if (agent === 'codex') {
            return codex(env) ?? NO_MODEL_USE
        }

        return pi(env)
    } catch {
        return NO_MODEL_USE
    }
}
