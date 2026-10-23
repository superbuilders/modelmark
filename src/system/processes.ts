import { runCommand } from './command'
import { PS_ARGS_ARGV, PS_NAMES_ARGV } from './constants'

import type { ProcessTable } from './types'

/**
 * Join the two `ps` listings into one table.
 * @param names - `ps -o pid=,ppid=,comm=` output: pid, parent pid, name
 * @param commands - `ps -o pid=,args=` output: pid, command line
 * @returns the table by process id; a process missing from the second listing
 * (it started between the two) has its name as its command line
 */
export function parseProcessTable(names: string, commands: string): ProcessTable {
    const argsByPid = new Map<number, string>()

    for (const line of commands.split('\n')) {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line)

        if (match) {
            argsByPid.set(Number(match[1]), match[2] ?? '')
        }
    }

    const table: ProcessTable = new Map()

    for (const line of names.split('\n')) {
        const match = /^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/.exec(line)

        if (match) {
            const pid = Number(match[1])
            const name = match[3] ?? ''

            table.set(pid, { ppid: Number(match[2]), name, args: argsByPid.get(pid) ?? name })
        }
    }

    return table
}

/**
 * Read the whole process table: names and command lines, one `ps` call each, side by side.
 * @param namesArgv - the command listing names (default: ps)
 * @param argsArgv - the command listing command lines (default: ps)
 * @returns the table, or null when ps is missing or refused (some sandboxes block it)
 */
export async function readProcessTable(
    namesArgv = PS_NAMES_ARGV,
    argsArgv = PS_ARGS_ARGV,
): Promise<ProcessTable | null> {
    const [names, commands] = await Promise.all([runCommand(namesArgv), runCommand(argsArgv)])

    if (names.exitCode !== 0 || commands.exitCode !== 0) {
        return null
    }

    const table = parseProcessTable(names.stdout, commands.stdout)

    return table.size > 0 ? table : null
}
