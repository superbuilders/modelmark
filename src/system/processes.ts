import { runCommand } from './command'
import { PS_ARGV } from './constants'

import type { ProcessTable } from './types'

/**
 * Parse `ps -o pid=,ppid=,args=` output.
 * @param output - one process per line: pid, parent pid, command line
 * @returns the table by process id
 */
export function parseProcessTable(output: string): ProcessTable {
    const table: ProcessTable = new Map()

    for (const line of output.split('\n')) {
        const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)

        if (match) {
            table.set(Number(match[1]), { ppid: Number(match[2]), args: match[3] ?? '' })
        }
    }

    return table
}

/**
 * Read the whole process table in one `ps` call.
 * @param argv - the listing command (default: ps)
 * @returns the table, or null when ps is missing or refused (some sandboxes block it)
 */
export async function readProcessTable(argv = PS_ARGV): Promise<ProcessTable | null> {
    const result = await runCommand(argv)

    if (result.exitCode !== 0) {
        return null
    }

    const table = parseProcessTable(result.stdout)

    return table.size > 0 ? table : null
}
