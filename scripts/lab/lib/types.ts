import type { AgentId, Platform, TestedVersion } from '../../../src/agents/types'
import type { Env } from '../../../src/system/types'

/**
 * How one scenario ended: `skipped` when a host lacks what it needs, such as the harness.
 */
export type ScenarioStatus = 'passed' | 'failed' | 'skipped'

/**
 * Which hosts a run covers.
 */
export type HostChoice = 'local' | 'mac' | 'both'

/**
 * Something one scenario expects in its commit's trailers: an exact value or a pattern.
 */
export type ExpectedMark = string | RegExp

/**
 * One end-to-end situation the lab reproduces in a scratch repository.
 */
export interface Scenario {
    /** The name `lab run` selects it by. */
    name: string
    /** What it proves, in one line. */
    description: string
    /** The harnesses it runs; it is skipped on a host missing any of them. */
    harnesses: AgentId[]
    /** The trailers the newest commit must carry, in order. */
    expected: ExpectedMark[]
    /** False when the commit must carry no cost line: there is no log to price, or nothing the agent did names this repository. */
    priced?: false
    /** Makes the commit (or commits) in the workspace. */
    run: (workspace: ScenarioWorkspace) => Promise<void>
}

/**
 * What a scenario can do inside its scratch folder.
 */
export interface ScenarioWorkspace {
    /** The scenario's scratch folder, outside the repository. */
    root: string
    /** The scratch repository, with the modelmark hook installed. */
    repo: string
    /** A second repository, without the hook, for agents that start elsewhere. */
    elsewhere: string
    /** The Bun binary running the lab. */
    bun: string

    /**
     * Run an agent's command and keep its output for failure reports.
     * @param argv - the command
     * @param cwd - the folder it starts in (default: the repository)
     * @returns its output
     */
    agent: (argv: string[], cwd?: string) => Promise<string>

    /**
     * Run a command with no agent above it in the process tree.
     * @param argv - the command
     * @param env - variables added to the lab's environment (agent markers removed)
     */
    detached: (argv: string[], env: Env) => Promise<void>
}

/**
 * The trailers on a lab commit.
 */
export interface CommitTrailers {
    /** Its Assisted-by values, in order. */
    marks: string[]
    /** Its Assisted-cost values, in order. */
    costs: string[]
    /** Its Assisted-tokens values, in order. */
    tokens: string[]
}

/**
 * The outcome of one scenario on one host.
 */
export interface ScenarioResult {
    /** The scenario's name. */
    name: string
    /** The harnesses it ran, so a pass can be credited to their versions. */
    harnesses: AgentId[]
    /** How it ended. */
    status: ScenarioStatus
    /** Why it failed or was skipped. */
    reason?: string
    /** The newest commit's Assisted-by values. */
    trailers?: string[]
    /** The newest commit's Assisted-cost values. */
    costs?: string[]
    /** The newest commit's Assisted-tokens values. */
    tokens?: string[]
    /** How long each hook run took, in milliseconds. */
    hookMs?: number[]
    /** Wall time of the whole scenario. */
    seconds: number
}

/**
 * The outcome of a run on one host.
 */
export interface HostResult {
    /** The host's operating system. */
    platform: Platform
    /** The harness versions installed there; a missing harness has no entry. */
    versions: Partial<Record<AgentId, string>>
    /** One result per selected scenario. */
    scenarios: ScenarioResult[]
}

/**
 * How an installed harness compares with the record of passing versions.
 */
export interface VersionStatus {
    /** The platform checked. */
    platform: Platform
    /** The harness. */
    agent: AgentId
    /** The installed version, or null when the harness is missing. */
    installed: string | null
    /** The newest version that passed there, if any. */
    passed: TestedVersion | null
}

/**
 * Options `lab run` takes.
 */
export interface RunOptions {
    /** Run every scenario. */
    all?: boolean
    /** Which hosts. */
    host: HostChoice
    /** Keep each scenario's scratch folder. */
    keep?: boolean
    /** Print the results as JSON on stdout. */
    json?: boolean
    /** Leave the record of passing versions and the README alone (the Mac's copy). */
    record: boolean
}
