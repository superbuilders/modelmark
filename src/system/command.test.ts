import { describe, expect, test } from 'vitest'

import { git, runCommand } from './command'
import { readProcessTable } from './processes'

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
        expect(await readProcessTable(['true'])).toBeNull()
    })
})
