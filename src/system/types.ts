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
 * Environment variables, as process.env holds them.
 */
export type Env = Record<string, string | undefined>
