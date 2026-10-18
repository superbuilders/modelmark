import { expect, test, vi } from 'vitest'

import { buildProgram } from './program'

test('the summary command is wired to its handler', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--json'], { from: 'user' })

    expect(log).toHaveBeenCalledWith(
        JSON.stringify({ range: 'HEAD..HEAD', total: 0, unmarked: 0, marks: [] }),
    )
})

test('summary prints Markdown, and refuses --markdown with --json', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--markdown'], { from: 'user' })

    expect(String(log.mock.calls.at(-1)?.[0])).toContain('| Harness | Model | Effort | Commits |')

    const program = buildProgram().exitOverride()

    program.commands.forEach(command =>
        command.exitOverride().configureOutput({ writeErr: () => {} }),
    )

    await expect(
        program.parseAsync(['summary', 'HEAD..HEAD', '--json', '--markdown'], { from: 'user' }),
    ).rejects.toThrow(/cannot be used with option '--json'/)
})
