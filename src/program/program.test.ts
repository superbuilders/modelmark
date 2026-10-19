import { expect, test, vi } from 'vitest'

import { buildProgram } from './program'

test('the summary command is wired to its handler', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--json'], { from: 'user' })

    expect(log).toHaveBeenCalledWith(
        JSON.stringify({ range: 'HEAD..HEAD', total: 0, unmarked: 0, marks: [] }),
    )
})

test('summary prints the format asked for, and refuses --json with --format', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--format', 'table'], {
        from: 'user',
    })

    expect(String(log.mock.calls.at(-1)?.[0])).toContain('| Harness | Model | Effort | Commits |')

    await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--format', 'badges'], {
        from: 'user',
    })

    expect(log).toHaveBeenLastCalledWith('')

    const program = buildProgram().exitOverride()

    program.commands.forEach(command =>
        command.exitOverride().configureOutput({ writeErr: () => {} }),
    )

    await expect(
        program.parseAsync(['summary', 'HEAD..HEAD', '--json', '--format', 'table'], {
            from: 'user',
        }),
    ).rejects.toThrow(/cannot be used with option '--format/)
})

test('summary takes --color for an agent it does not know, and refuses a bad one', async () => {
    const program = buildProgram().exitOverride()

    program.commands.forEach(command =>
        command.exitOverride().configureOutput({ writeErr: () => {} }),
    )

    const summary = program.commands.find(command => command.name() === 'summary')

    summary?.action(() => {})
    await program.parseAsync(['summary', '--color', 'jojo=#e73a2c', '--color', 'bot=112233'], {
        from: 'user',
    })

    expect(summary?.opts().color).toEqual({ jojo: 'E73A2C', bot: '112233' })

    await expect(
        program.parseAsync(['summary', '--color', 'jojo=red'], { from: 'user' }),
    ).rejects.toThrow(/expected <agent>=<hex color>/)
})
