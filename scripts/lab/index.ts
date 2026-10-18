import { Command, Option } from 'commander'

import { runCommand } from './commands/run'
import { statusCommand } from './commands/status'
import { probe, probeText, writeProbeReport } from './lib/probe'
import { CHECKOUT } from './lib/process'
import { SCENARIOS } from './lib/scenarios'

/**
 * The --host option; each command needs its own copy.
 * @returns the option
 */
function hostOption(): Option {
    return new Option('--host <host>', 'where to run')
        .choices(['local', 'mac', 'both'])
        .default('local')
}

const program = new Command()
    .name('lab')
    .description('Check modelmark against the real harnesses, on this machine and the Mac')

program
    .command('list')
    .description('List the scenarios')
    .option('--json', 'print JSON')
    .action(({ json }: { json?: boolean }) => {
        if (json) {
            console.log(
                JSON.stringify(
                    SCENARIOS.map(({ name, description, harnesses }) => ({
                        name,
                        description,
                        harnesses,
                    })),
                ),
            )

            return
        }

        console.log(
            SCENARIOS.map(scenario => `${scenario.name.padEnd(22)}${scenario.description}`).join(
                '\n',
            ),
        )
    })

program
    .command('run')
    .description('Run scenarios and record the harness versions that pass')
    .argument('[scenarios...]', 'scenario names (see list)')
    .option('--all', 'run every scenario')
    .addOption(hostOption())
    .option('--keep', 'keep every scratch folder, not only failed ones')
    .option('--json', 'print the results as JSON on stdout')
    .option('--no-record', 'leave the record of passing versions and the README alone')
    .action(runCommand)

program
    .command('status')
    .description('Compare installed harness versions with the ones that last passed')
    .addOption(hostOption())
    .option('--json', 'print JSON')
    .action(statusCommand)

program
    .command('probe')
    .description('Run a new harness once and show how modelmark could recognize it')
    .argument('<command...>', 'the agent command, after --; {prompt} marks where the prompt goes')
    .option('--json', 'print JSON')
    .action(async (argv: string[], { json }: { json?: boolean }) => {
        const result = await probe(argv, CHECKOUT)

        console.log(json ? JSON.stringify(result) : probeText(result))
    })

program.command('probe-report', { hidden: true }).argument('<path>').action(writeProbeReport)

await program.parseAsync().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
})
