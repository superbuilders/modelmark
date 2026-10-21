import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

    for (const format of ['markdown', 'table']) {
        await buildProgram().parseAsync(['summary', 'HEAD..HEAD', '--format', format], {
            from: 'user',
        })

        expect(String(log.mock.calls.at(-1)?.[0])).toContain(
            '| Harness | Model | Effort | Commits |',
        )
    }

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
    await expect(
        program.parseAsync(['summary', 'HEAD..HEAD', '--format', 'html'], { from: 'user' }),
    ).rejects.toThrow(/Allowed choices are text, json, markdown, badges/)
})

test('summary reads its range only as revisions', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(
        buildProgram().parseAsync(['summary', 'README.md'], { from: 'user' }),
    ).rejects.toThrow(/bad revision 'README.md'/)
    await expect(
        buildProgram().parseAsync(['summary', '--', '--max-count=1'], { from: 'user' }),
    ).rejects.toThrow(/bad revision '--max-count=1'/)
})

test('summary takes --badge-color for an agent it does not know, and refuses a bad one', async () => {
    const program = buildProgram().exitOverride()

    program.commands.forEach(command =>
        command.exitOverride().configureOutput({ writeErr: () => {} }),
    )

    const summary = program.commands.find(command => command.name() === 'summary')

    summary?.action(() => {})
    await program.parseAsync(
        ['summary', '--badge-color', 'jojo=#e73a2c', '--badge-color', 'bot=112233'],
        {
            from: 'user',
        },
    )

    expect(summary?.opts().badgeColor).toEqual({ jojo: 'E73A2C', bot: '112233' })

    await expect(
        program.parseAsync(['summary', '--badge-color', 'jojo=red'], { from: 'user' }),
    ).rejects.toThrow(/expected <agent>=<hex color>/)
    await expect(
        program.parseAsync(['summary', '--badge-color', 'jojo'], { from: 'user' }),
    ).rejects.toThrow(/expected <agent>=<hex color>/)
})

test('summary reads --badge-logo from an SVG file, and refuses a file that is not one', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'modelmark-logo-'))
    const logo = join(folder, 'jojo.svg')
    const text = join(folder, 'notes.txt')

    writeFileSync(logo, '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
    writeFileSync(text, 'hello')

    const program = buildProgram().exitOverride()

    program.commands.forEach(command =>
        command.exitOverride().configureOutput({ writeErr: () => {} }),
    )

    const summary = program.commands.find(command => command.name() === 'summary')

    summary?.action(() => {})
    await program.parseAsync(['summary', '--badge-logo', `jojo=${logo}`], { from: 'user' })

    expect(summary?.opts().badgeLogo).toEqual({ jojo: '<svg xmlns="http://www.w3.org/2000/svg"/>' })

    await expect(
        program.parseAsync(['summary', '--badge-logo', `jojo=${text}`], { from: 'user' }),
    ).rejects.toThrow(/expected <agent>=<svg file>/)
    await expect(
        program.parseAsync(['summary', '--badge-logo', logo], { from: 'user' }),
    ).rejects.toThrow(/expected <agent>=<svg file>/)
    await expect(
        program.parseAsync(['summary', '--badge-logo', `jojo=${folder}/missing.svg`], {
            from: 'user',
        }),
    ).rejects.toThrow(/can't read/)
})
