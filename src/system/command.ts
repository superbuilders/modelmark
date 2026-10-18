import type { CommandOptions, CommandResult } from './types'

/**
 * Run a command to completion with its output captured and never echoed.
 * @param argv - executable and literal arguments
 * @param options - folder, environment and time limit
 * @returns captured output and exit code; a missing executable reads as exit 127
 */
export async function runCommand(
    argv: string[],
    options: CommandOptions = {},
): Promise<CommandResult> {
    try {
        const child = Bun.spawn(argv, {
            cwd: options.cwd ?? process.cwd(),
            env: options.env,
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: options.timeoutMs,
        })
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ])

        return { exitCode, stdout, stderr }
    } catch (error) {
        return { exitCode: 127, stdout: '', stderr: String(error) }
    }
}

/**
 * Run git and return its stdout, failing on a nonzero exit.
 * @param args - git arguments
 * @param cwd - working directory (default: this process's)
 * @returns git's stdout
 */
export async function git(args: string[], cwd?: string): Promise<string> {
    const result = await runCommand(['git', ...args], { cwd })

    if (result.exitCode !== 0) {
        throw new Error(`git ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
    }

    return result.stdout
}
