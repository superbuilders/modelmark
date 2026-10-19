import { Command, Option } from 'commander'

import { version } from '../../package.json'
import { doctorCommand } from '../commands/doctor/doctor'
import { hookCommand } from '../commands/hook/hook'
import { installCommand, uninstallCommand } from '../commands/install/install'
import { SUMMARY_FORMATS } from '../commands/summary/constants'
import { summaryCommand } from '../commands/summary/summary'

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
