import { readFileSync } from 'node:fs'

import { Command, InvalidArgumentError, Option } from 'commander'

import { version } from '../../package.json'
import { doctorCommand } from '../commands/doctor/doctor'
import { hookCommand } from '../commands/hook/hook'
import { installCommand, uninstallCommand } from '../commands/install/install'
import { PRICE_FORMATS } from '../commands/prices/constants'
import { pricesCommand, refreshPricesCommand } from '../commands/prices/prices'
import { HEX_COLOR, SUMMARY_FORMATS } from '../commands/summary/constants'
import { summaryCommand } from '../commands/summary/summary'
import { DOCTOR_HELP, PRICES_HELP, PROGRAM_HELP, SUMMARY_HELP } from './constants'

import type { PricesOptions } from '../commands/prices/types'
import type { AgentColors, AgentLogos } from '../commands/summary/types'

/**
 * Add one `--badge-color agent=hex` to the colors given so far.
 * @param value - the option's value, such as `jojo=E73A2C`
 * @param previous - the colors from earlier `--badge-color` options
 * @returns the colors with this one added
 */
function addColor(value: string, previous: AgentColors): AgentColors {
    const [agent = '', hex = ''] = value.split('=')
    const color = hex.replace(/^#/, '')

    if (!agent || !HEX_COLOR.test(color)) {
        throw new InvalidArgumentError('expected <agent>=<hex color>, such as jojo=E73A2C')
    }

    return { ...previous, [agent]: color.toUpperCase() }
}

/**
 * Add one `--badge-logo agent=file` to the logos given so far, reading the file.
 * @param value - the option's value, such as `jojo=jojo.svg`
 * @param previous - the logos from earlier `--badge-logo` options
 * @returns the logos with this one added
 */
function addLogo(value: string, previous: AgentLogos): AgentLogos {
    const split = value.indexOf('=')
    const agent = value.slice(0, split)
    const file = value.slice(split + 1)
    let svg = ''

    try {
        svg = split > 0 ? readFileSync(file, 'utf8').trim() : ''
    } catch {
        throw new InvalidArgumentError(`can't read ${file}`)
    }

    if (!svg.startsWith('<svg')) {
        throw new InvalidArgumentError('expected <agent>=<svg file>, such as jojo=jojo.svg')
    }

    return { ...previous, [agent]: svg }
}

/**
 * A `--format` option that also takes `table`, the old name for `markdown`.
 * @param description - what the option says in help
 * @param formats - the formats it takes
 * @returns the option
 */
function formatOption(description: string, formats: readonly string[]): Option {
    return new Option('--format <format>', description)
        .choices(formats)
        .argParser(value => {
            const format = value === 'table' ? 'markdown' : value

            if (!formats.includes(format)) {
                throw new InvalidArgumentError(`Allowed choices are ${formats.join(', ')}.`)
            }

            return format
        })
        .default('text')
}

/**
 * Build the modelmark command line.
 * @returns the program, ready to parse
 */
export function buildProgram(): Command {
    const program = new Command()
        .name('modelmark')
        .version(version)
        .description('Mark each commit with the agent and model that made it, and what it cost')
        .addHelpText('after', PROGRAM_HELP)

    program
        .command('install')
        .description('add the commit hook to this repository')
        .action(installCommand)

    program
        .command('uninstall')
        .description('remove the commit hook from this repository')
        .action(uninstallCommand)

    program
        .command('doctor')
        .description('check the setup here and show the mark a commit would get')
        .option('--json', 'print the facts and checks as JSON')
        .addHelpText('after', DOCTOR_HELP)
        .action(doctorCommand)

    program
        .command('summary')
        .description('count the marks across a range of commits')
        .argument(
            '[range]',
            'a git revision range (default: this branch’s commits not on the default branch)',
        )
        .addOption(formatOption('how to print the summary', SUMMARY_FORMATS))
        .addOption(new Option('--json', 'shorthand for --format json').conflicts('format'))
        .addOption(
            new Option(
                '--badge-color <agent=hex>',
                'with --format badges: a color for an agent modelmark doesn’t know, such as jojo=E73A2C (repeatable)',
            )
                .argParser(addColor)
                .default({}, 'none'),
        )
        .addOption(
            new Option(
                '--badge-logo <agent=file>',
                'with --format badges: a white SVG logo for an agent modelmark doesn’t know, such as jojo=jojo.svg (repeatable)',
            )
                .argParser(addLogo)
                .default({}, 'none'),
        )
        .addHelpText('after', SUMMARY_HELP)
        .action(summaryCommand)

    program
        .command('prices')
        .description('show the prices commits are costed with')
        .argument(
            '[filter]',
            'part of a model id, such as opus (default: the models this repository’s commits are marked with)',
        )
        .addOption(new Option('--all', 'show every model'))
        .addOption(formatOption('how to print the prices', PRICE_FORMATS))
        .addOption(new Option('--json', 'shorthand for --format json').conflicts('format'))
        .addHelpText('after', PRICES_HELP)
        .action((filter: string | undefined, options: PricesOptions) =>
            pricesCommand(filter, options),
        )

    program
        .command('hook', { hidden: true })
        .description(
            'prepare-commit-msg hook: add an Assisted-by trailer when an agent is committing',
        )
        .argument('<message-file>', 'the commit message file git passes')
        .argument('[source]', 'the message source git passes')
        .argument('[sha]', 'the commit git passes when amending (unused)')
        .action((messageFile: string, source?: string) => hookCommand(messageFile, source))

    program
        .command('refresh-prices', { hidden: true })
        .description(
            'fetch the latest prices into the cache folder (the hook runs this in the background)',
        )
        .action(() => refreshPricesCommand())

    return program
}
