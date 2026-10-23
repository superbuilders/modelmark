import { createHash } from 'node:crypto'

import { runCommand } from '../system/command'
import { readState, writeState } from '../system/state'
import { sessionName } from './logs'
import { readSessionUse } from './usage'

import type { Env } from '../system/types'
import type { Checkpoint, CommitAttempt, SessionUse, UseSource } from './types'

/**
 * The name a session's checkpoint in one repository is kept under. A session
 * that commits in several repositories keeps one count in each, so a commit
 * in one never skips work done for another.
 * @param source - where the session's replies are read from
 * @param session - its session
 * @param root - the repository's working folder
 * @returns the state file's name
 */
function checkpointName(source: UseSource, session: string, root: string): string {
    return `${sessionCheckpointName(source, session)}-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`
}

/**
 * The name an older modelmark kept a session's one checkpoint under, for
 * every repository at once.
 * @param source - where the session's replies are read from
 * @param session - its session
 * @returns the state file's name
 */
function sessionCheckpointName(source: UseSource, session: string): string {
    return `checkpoints/${source}-${encodeURIComponent(session)}`
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
 * @param source - where the session's replies are read from
 * @param session - its session
 * @param root - the repository's working folder
 * @param env - the environment
 * @returns the time (ms since the epoch), or undefined to count the whole session
 */
async function countedThrough(
    source: UseSource,
    session: string,
    root: string,
    env: Env,
): Promise<number | undefined> {
    const name = checkpointName(source, session, root)
    const checkpoint = readCheckpoint(name, env)
    const { through, pending } =
        checkpoint.through === undefined && !checkpoint.pending
            ? readCheckpoint(sessionCheckpointName(source, session), env)
            : checkpoint

    if (!pending) {
        return through
    }

    const settled = (await committed(pending.attempt)) ? pending.through : through

    writeState(name, JSON.stringify({ through: settled }), env)

    return settled
}

/**
 * The replies a session made in a repository since its last commit
 * there: since the point that commit's cost was counted up to, or since the
 * session started.
 * @param source - where the session's replies are read from
 * @param env - the environment
 * @param root - the repository's working folder
 * @returns the replies, or undefined when the session's logs can't be read
 */
export async function usesSinceLastCommit(
    source: UseSource,
    env: Env,
    root: string,
): Promise<SessionUse | undefined> {
    const session = sessionName(source, env)

    if (!session) {
        return undefined
    }

    const use = readSessionUse(source, env, await countedThrough(source, session, root, env), root)

    return use && { session, root, ...use }
}

/**
 * The commit a hook run is pricing, as its repository stands before it is
 * made. Git runs the hook at the top of the working folder.
 * @param mark - the mark the commit carries
 * @param cwd - the folder the hook runs in
 * @returns the attempt, or undefined outside a repository's working folder
 */
export async function commitAttempt(
    mark: string,
    cwd = process.cwd(),
): Promise<CommitAttempt | undefined> {
    /*
     * A repository with no commits has no HEAD: git prints the two folders,
     * then exits with an error.
     */
    const result = await runCommand(
        ['git', 'rev-parse', '--absolute-git-dir', '--show-toplevel', '--verify', '-q', 'HEAD'],
        { cwd },
    )
    const [gitDir, root, head = ''] = result.stdout.split('\n')

    return gitDir && root ? { gitDir, root, head, mark } : undefined
}

/**
 * Mark a session's replies as counted, so the next commit in the repository
 * starts after them once that commit is made.
 * @param source - where the session's replies are read from
 * @param use - the replies just counted
 * @param attempt - the commit they were charged to
 * @param env - the environment
 */
export function markCounted(
    source: UseSource,
    use: SessionUse,
    attempt: CommitAttempt,
    env: Env,
): void {
    if (use.through === undefined) {
        return
    }

    const name = checkpointName(source, use.session, use.root)
    const checkpoint: Checkpoint = {
        through: readCheckpoint(name, env).through,
        pending: { through: use.through, attempt },
    }

    writeState(name, JSON.stringify(checkpoint), env)
}
