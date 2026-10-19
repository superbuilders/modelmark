import { Command, InvalidArgumentError, Option } from 'commander'

import { version } from '../../package.json'
import { doctorCommand } from '../commands/doctor/doctor'
import { hookCommand } from '../commands/hook/hook'
import { installCommand, uninstallCommand } from '../commands/install/install'
import { HEX_COLOR, SUMMARY_FORMATS } from '../commands/summary/constants'
import { summaryCommand } from '../commands/summary/summary'

import type { AgentColors } from '../commands/summary/types'

/**
 * Add one `--color agent=hex` to the colors given so far.
 * @param value - the option's value, such as `jojo=E73A2C`
 * @param previous - the colors from earlier `--color` options
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
 * Build the modelmark command line.
 * @returns the program, ready to parse
 */
export function buildProgram(): Command {
    const program = new Command()
        .name('modelmark')
        .version(version)
        .description('Mark each commit with the agent and model that made it')

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
        .action(doctorCommand)

    program
        .command('summary')
        .description('count the marks across a range of commits')
        .argument(
            '[range]',
            'a git revision range (default: this branch’s commits not on the default branch)',
        )
        .addOption(
            new Option('--format <format>', 'how to print the summary')
                .choices(SUMMARY_FORMATS)
                .default('text'),
        )
        .addOption(new Option('--json', 'shorthand for --format json').conflicts('format'))
        .addOption(
            new Option(
                '--color <agent=hex>',
                'a badge color for an agent modelmark doesn’t know, such as jojo=E73A2C (repeatable)',
            )
                .argParser(addColor)
                .default({}, 'none'),
        )
        .action(summaryCommand)

    program
        .command('hook', { hidden: true })
        .description(
            'prepare-commit-msg hook: add an Assisted-by trailer when an agent is committing',
        )
        .argument('<message-file>', 'the commit message file git passes')
        .argument('[source]', 'the message source git passes')
        .argument('[sha]', 'the commit git passes when amending (unused)')
        .action(hookCommand)

    return program
}
