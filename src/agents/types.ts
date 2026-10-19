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
 * Environment variables, as process.env holds them.
 */
export type Env = Record<string, string | undefined>

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
 * The agent running this command and the model behind its latest reply. The
 * agent is a plain string because one modelmark doesn't know can declare itself.
 */
export interface Detection extends ModelUse {
    /** The agent, such as `claude-code`. */
    agent: string
    /** How it was found. */
    via: DetectionSource
}

/**
 * A mark read back from a commit, split into its parts. The agent is a plain
 * string because a trailer may come from a tool modelmark doesn't know.
 */
export interface MarkParts {
    /** The agent, such as `claude-code`. */
    agent: string
    /** The model, or empty when the mark names none. */
    model: string
    /** The effort, or null when the mark has none. */
    effort: string | null
}

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
