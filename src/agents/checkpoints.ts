import { dirname } from 'node:path'

import { runCommand } from '../system/command'
import { readState, writeState } from '../system/state'
import { sessionName } from './logs'
import { readSessionUse } from './usage'

import type { Env } from '../system/types'
import type { AgentId, Checkpoint, CommitAttempt, SessionUse } from './types'

/**
 * The name a session's checkpoint is kept under.
 * @param agent - which agent
 * @param session - its session
 * @returns the state file's name
 */
function checkpointName(agent: AgentId, session: string): string {
    return `checkpoints/${agent}-${encodeURIComponent(session)}`
}

/**
 * Read a session's checkpoint. An older modelmark kept only the time, as a
 * bare number, which reads as a checkpoint with nothing pending.
 * @param name - the state file's name
 * @param env - the environment
 * @returns the checkpoint, empty when there is none
 */
function readCheckpoint(name: string, env: Env): Checkpoint {
    try {
        const saved: unknown = JSON.parse(readState(name, env) ?? '{}')

        return typeof saved === 'number' ? { through: saved } : (saved as Checkpoint)
    } catch {
        return {}
    }
}

/**
 * Whether the commit a hook run priced was made. Git can still drop a commit
 * after the hook (a commit-msg hook rejects it, or the editor is closed
 * empty), and then its replies belong to the next try. A repository that is
 * gone counts as made, so its replies are never charged twice.
 * @param attempt - the commit as the hook saw it
 * @returns true when the repository's newest commit is it
 */
async function committed(attempt: CommitAttempt): Promise<boolean> {
    const newest = await runCommand([
        'git',
        `--git-dir=${attempt.gitDir}`,
        'log',
        '-1',
        '--format=%H%n%B',
    ])

    if (newest.exitCode !== 0) {
        return true
    }

    const [sha, ...lines] = newest.stdout.split('\n')

    return sha !== attempt.head && lines.includes(attempt.mark)
}

/**
 * The point a session was counted up to: the last commit's, once that commit
 * is known to be made.
 * @param name - the state file's name
 * @param env - the environment
 * @returns the time (ms since the epoch), or undefined to count the whole session
 */
async function countedThrough(name: string, env: Env): Promise<number | undefined> {
    const { through, pending } = readCheckpoint(name, env)

    if (!pending) {
        return through
    }

    const settled = (await committed(pending.attempt)) ? pending.through : through

    writeState(name, JSON.stringify({ through: settled }), env)

    return settled
}

/**
 * The replies an agent's session made since its last commit: since the point
 * the last commit's cost was counted up to, or since the session started.
 * @param agent - which agent
 * @param env - the environment
 * @returns the replies, or undefined when the session's logs can't be read
 */
export async function usesSinceLastCommit(
    agent: AgentId,
    env: Env,
): Promise<SessionUse | undefined> {
    const session = sessionName(agent, env)

    if (!session) {
        return undefined
    }

    const use = readSessionUse(
        agent,
        env,
        await countedThrough(checkpointName(agent, session), env),
    )

    return use && { session, ...use }
}

/**
 * The commit a hook run is pricing, as its repository stands before it is made.
 * @param messageFile - the message file git passes, inside the repository's git folder
 * @param mark - the mark the commit carries
 * @returns the attempt, or undefined outside a repository
 */
export async function commitAttempt(
    messageFile: string,
    mark: string,
): Promise<CommitAttempt | undefined> {
    const gitDir = await runCommand(['git', 'rev-parse', '--absolute-git-dir'], {
        cwd: dirname(messageFile),
    })

    if (gitDir.exitCode !== 0) {
        return undefined
    }

    const dir = gitDir.stdout.trim()
    const head = await runCommand([
        'git',
        `--git-dir=${dir}`,
        'rev-parse',
        '-q',
        '--verify',
        'HEAD',
    ])

    return { gitDir: dir, head: head.stdout.trim(), mark }
}

/**
 * Mark a session's replies as counted, so the next commit starts after them.
 * With an attempt, they count only once that commit is made.
 * @param agent - which agent
 * @param use - the replies just counted
 * @param attempt - the commit they were charged to, or undefined to count them now
 * @param env - the environment
 */
export function markCounted(
    agent: AgentId,
    use: SessionUse,
    attempt: CommitAttempt | undefined,
    env: Env,
): void {
    if (use.through === undefined) {
        return
    }

    const name = checkpointName(agent, use.session)
    const checkpoint: Checkpoint = attempt
        ? { through: readCheckpoint(name, env).through, pending: { through: use.through, attempt } }
        : { through: use.through }

    writeState(name, JSON.stringify(checkpoint), env)
}
