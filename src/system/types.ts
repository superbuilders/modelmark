/**
 * One row of the process table.
 */
export interface ProcessInfo {
    /** The parent's process id; 0 or 1 at the top of the tree. */
    ppid: number
    /** The full command line, executable first. */
    args: string
}

/**
 * The process table by process id.
 */
export type ProcessTable = Map<number, ProcessInfo>

/**
 * How to run one command.
 */
export interface CommandOptions {
    /** The folder it runs in (default: this process's). */
    cwd?: string
    /** Its whole environment (default: this process's). */
    env?: Record<string, string | undefined>
    /** Kill it after this many milliseconds. */
    timeoutMs?: number
}

/**
 * A finished subprocess.
 */
export interface CommandResult {
    /** Everything the command wrote to stdout. */
    stdout: string
    /** Everything the command wrote to stderr. */
    stderr: string
    /** The command's exit status; nonzero means it failed. */
    exitCode: number
}

/**
 * Where the hook finds modelmark: on PATH, or in the repository's
 * `node_modules` when the repository lists it as a dependency.
 */
export type HookStyle = 'path' | 'dependency'

/**
 * A repository's prepare-commit-msg hook file.
 */
export interface HookFile {
    /** Where it is, or would be. */
    path: string
    /** The repository's root folder. */
    root: string
    /** Whether the repository uses Husky, so the hook is committed and shared. */
    husky: boolean
    /** Its contents, or null when there is no hook yet. */
    text: string | null
}

/**
 * Environment variables, as process.env holds them.
 */
export type Env = Record<string, string | undefined>
