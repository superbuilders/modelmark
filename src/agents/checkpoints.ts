import { createHash } from 'node:crypto'
import { dirname } from 'node:path'

import { runCommand } from '../system/command'
import { readState, writeState } from '../system/state'
import { sessionName } from './logs'
import { readSessionUse } from './usage'

import type { Env } from '../system/types'
import type { AgentId, Checkpoint, CommitAttempt, SessionUse } from './types'

/**
 * The name a session's checkpoint in one repository is kept under. A session
 * that commits in several repositories keeps one count in each, so a commit
 * in one never skips work done for another.
 * @param agent - which agent
 * @param session - its session
 * @param root - the repository's working folder, or undefined for the whole session
 * @returns the state file's name
 */
function checkpointName(agent: AgentId, session: string, root: string | undefined): string {
    const name = `checkpoints/${agent}-${encodeURIComponent(session)}`

    return root === undefined
        ? name
        : `${name}-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`
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
 * The point a session was counted up to in a repository: the last commit's
 * there, once that commit is known to be made. A session whose count an older
 * modelmark kept for the whole session starts from that count.
 * @param agent - which agent
 * @param session - its session
 * @param root - the repository's working folder, or undefined for the whole session
 * @param env - the environment
 * @returns the time (ms since the epoch), or undefined to count the whole session
 */
async function countedThrough(
    agent: AgentId,
    session: string,
    root: string | undefined,
    env: Env,
): Promise<number | undefined> {
    const name = checkpointName(agent, session, root)
    const checkpoint = readCheckpoint(name, env)
    const { through, pending } =
        checkpoint.through === undefined && !checkpoint.pending
            ? readCheckpoint(checkpointName(agent, session, undefined), env)
            : checkpoint

    if (!pending) {
        return through
    }

    const settled = (await committed(pending.attempt)) ? pending.through : through

    writeState(name, JSON.stringify({ through: settled }), env)

    return settled
}

/**
 * The replies an agent's session made in a repository since its last commit
 * there: since the point that commit's cost was counted up to, or since the
 * session started.
 * @param agent - which agent
 * @param env - the environment
 * @param root - the repository's working folder, or undefined to count the whole session
 * @returns the replies, or undefined when the session's logs can't be read
 */
export async function usesSinceLastCommit(
    agent: AgentId,
    env: Env,
    root: string | undefined,
): Promise<SessionUse | undefined> {
    const session = sessionName(agent, env)

    if (!session) {
        return undefined
    }

    const use = readSessionUse(agent, env, await countedThrough(agent, session, root, env), root)

    return use && { session, root, ...use }
}

/**
 * The commit a hook run is pricing, as its repository stands before it is made.
 * @param messageFile - the message file git passes, inside the repository's git folder
 * @param mark - the mark the commit carries
 * @returns the attempt, or undefined outside a repository's working folder
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

    /*
     * Git runs the hook at the top of the working folder.
     */
    const root = await runCommand(['git', 'rev-parse', '--show-toplevel'], { cwd: process.cwd() })

    return root.exitCode === 0
        ? { gitDir: dir, head: head.stdout.trim(), mark, root: root.stdout.trim() }
        : undefined
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

    const name = checkpointName(agent, use.session, use.root)
    const checkpoint: Checkpoint = attempt
        ? { through: readCheckpoint(name, env).through, pending: { through: use.through, attempt } }
        : { through: use.through }

    writeState(name, JSON.stringify(checkpoint), env)
}
