import type { TokenUse } from '../pricing/types'

/**
 * A coding agent modelmark recognizes, named as it appears in the trailer.
 */
export type AgentId = 'claude-code' | 'codex' | 'pi'

/**
 * How the agent was found: walking up the process tree, (when the walk could
 * not see far enough) the markers the agent leaves in the environment, or the
 * mark an agent modelmark doesn't know declares for itself.
 */
export type DetectionSource = 'process-tree' | 'environment' | 'declared'

/**
 * The agent running this command.
 */
export interface FoundAgent {
    /** Which agent. */
    agent: AgentId
    /** How it was found. */
    via: Exclude<DetectionSource, 'declared'>
}

/**
 * The model behind an agent's latest reply, and how hard it was asked to think.
 */
export interface ModelUse {
    /** The model id as the agent's log records it, or null when the log could not be read. */
    model: string | null
    /** The reasoning effort (such as `high`) as the agent records it, or null when it records none. */
    effort: string | null
}

/**
 * An agent modelmark doesn't know, named by the mark it declares.
 */
export interface DeclaredAgent {
    /** The agent, a plain string because modelmark doesn't know it. */
    agent: string
    /** How it was found. */
    via: Extract<DetectionSource, 'declared'>
}

/**
 * The agent running this command and the model behind its latest reply.
 */
export type Detection = (FoundAgent | DeclaredAgent) & ModelUse

/**
 * An operating system modelmark runs on, named as the tested-versions record names it.
 */
export type Platform = 'linux' | 'macos'

/**
 * A harness version that passed every lab scenario run against it.
 */
export interface TestedVersion {
    /** The version, as the harness reports it. */
    version: string
    /** The day it passed, `yyyy-mm-dd`. */
    date: string
}

/**
 * The newest tested version of each harness on each platform.
 */
export type TestedRecord = Partial<Record<Platform, Partial<Record<AgentId, TestedVersion>>>>

/**
 * The replies an agent's logs hold after a point in time.
 */
export interface LoggedUse {
    /** Each reply's tokens. */
    uses: TokenUse[]
    /** When the newest of them was written (ms since the epoch), or undefined when there are none. */
    through: number | undefined
}

/**
 * The replies a session made after a point in time.
 */
export interface SessionUse extends LoggedUse {
    /** The session, named the same across its commits. */
    session: string
}

/**
 * A commit a hook run priced, as its repository stood before git made it.
 */
export interface CommitAttempt {
    /** The repository's git folder, absolute. */
    gitDir: string
    /** The commit HEAD named then, or empty in a repository with no commits. */
    head: string
    /** The mark line the commit carries, to know it again. */
    mark: string
}

/**
 * How far a session's replies have been counted.
 */
export interface Checkpoint {
    /** The newest reply counted by a commit that was made (ms since the epoch), or undefined for none. */
    through?: number
    /** The newest reply the latest commit counted, until that commit is known to be made. */
    pending?: { through: number; attempt: CommitAttempt }
}
