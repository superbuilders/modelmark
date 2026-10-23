import { describe, expect, test } from 'vitest'

import { git, runCommand } from './command'
import { parseProcessTable, readProcessTable } from './processes'

describe('runCommand', () => {
    test('a missing executable reads as exit 127 instead of throwing', async () => {
        const result = await runCommand(['/no/such/executable'])

        expect(result.exitCode).toBe(127)
        expect(result.stderr).not.toBe('')
    })
})

describe('git', () => {
    test('a failing git command throws, naming the subcommand', async () => {
        await expect(git(['no-such-subcommand'])).rejects.toThrow(/git no-such-subcommand failed/)
    })
})

describe('readProcessTable', () => {
    test('lists this test process under its parent', async () => {
        const table = await readProcessTable()

        expect(table?.get(process.pid)?.ppid).toBe(process.ppid)
    })

    test('a failing or empty listing reads as null', async () => {
        expect(await readProcessTable(['false'])).toBeNull()
        expect(await readProcessTable(undefined, ['false'])).toBeNull()
        expect(await readProcessTable(['true'], ['true'])).toBeNull()
    })
})

describe('parseProcessTable', () => {
    test("keeps a name's spaces, and gives a process missing from the command lines its name", () => {
        const table = parseProcessTable(
            ' 40  30 /Users/u/Library/Application Support/Claude/claude\n 50  40 git',
            ' 40 /Users/u/Library/Application Support/Claude/claude --verbose',
        )

        expect(table.get(40)).toEqual({
            ppid: 30,
            name: '/Users/u/Library/Application Support/Claude/claude',
            args: '/Users/u/Library/Application Support/Claude/claude --verbose',
        })
        expect(table.get(50)).toEqual({ ppid: 40, name: 'git', args: 'git' })
    })
})
