import type { AgentId, Detection, Platform, TestedRecord } from '../../agents/types'
import type { HookFile, HookStyle } from '../../setup/types'

/**
 * How one doctor check came out: `fail` makes `doctor` exit 1.
 */
export type CheckLevel = 'ok' | 'warn' | 'fail' | 'info'

/**
 * One line of the doctor's report.
 */
export interface Check {
    /** How it came out. */
    level: CheckLevel
    /** What was found, in a sentence. */
    text: string
    /** What to do about it, when there is something to do. */
    fix?: string
}

/**
 * Everything the doctor looks at, gathered before any check runs.
 */
export interface DoctorFacts {
    /** Whether a `modelmark` command is on PATH, which a `path` hook needs. */
    onPath: boolean
    /** This repository's hook file, or null outside a repository. */
    hook: HookFile | null
    /** The hook style this repository should use, or null outside a repository. */
    wanted: HookStyle | null
    /** Whether the repository's `node_modules` has modelmark, which a `dependency` hook needs. */
    localBin: boolean
    /** The agent running the doctor, or null when none is. */
    detection: Detection | null
    /** This machine's platform. */
    platform: Platform
    /** Each harness's installed version; a missing harness is null. */
    versions: Record<AgentId, string | null>
    /** The lab's record of tested versions. */
    tested: TestedRecord
}
