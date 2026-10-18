import { currentPlatform } from '../../../src/agents/versions'
import { reportScenario, runLocal } from '../lib/local'
import { runOnMac } from '../lib/mac'
import { recordPasses } from '../lib/passed'
import { CHECKOUT } from '../lib/process'
import { SCENARIOS } from '../lib/scenarios'

import type { HostResult, RunOptions, Scenario } from '../lib/types'

/**
 * The scenarios a run selects.
 * @param names - names given on the command line
 * @param all - whether `--all` was given
 * @returns the scenarios, in catalog order
 */
function select(names: string[], all: boolean | undefined): Scenario[] {
    if (all) {
        return [...SCENARIOS]
    }

    if (names.length === 0) {
        throw new Error('Name one or more scenarios, or pass --all (see `lab list`)')
    }

    const unknown = names.filter(name => !SCENARIOS.some(scenario => scenario.name === name))

    if (unknown.length > 0) {
        throw new Error(`Unknown scenario: ${unknown.join(', ')} (see \`lab list\`)`)
    }

    return SCENARIOS.filter(scenario => names.includes(scenario.name))
}

/**
 * Run the Mac's share and show its results as they come back.
 * @param scenarios - the scenarios
 * @param keep - keep every scratch folder on the Mac
 * @returns the Mac's results
 */
async function onMac(scenarios: Scenario[], keep: boolean): Promise<HostResult> {
    const result = await runOnMac(
        scenarios.map(scenario => scenario.name),
        CHECKOUT,
        keep,
    )

    for (const scenario of result.scenarios) {
        reportScenario(result.platform, scenario)
    }

    return result
}

/**
 * Run scenarios on the chosen hosts, then credit the harness versions that passed.
 * Exits 1 when a scenario failed; a lab that can't start throws, and the entrypoint exits 2.
 * @param names - scenario names
 * @param options - the command's options
 */
export async function runCommand(names: string[], options: RunOptions): Promise<void> {
    const scenarios = select(names, options.all)
    const hosts: Promise<HostResult>[] = []

    if (options.host !== 'local' && currentPlatform() === 'macos') {
        throw new Error('This is the Mac already; use --host local')
    }

    if (options.host !== 'mac') {
        hosts.push(runLocal(scenarios, CHECKOUT, Boolean(options.keep)))
    }

    if (options.host !== 'local') {
        hosts.push(onMac(scenarios, Boolean(options.keep)))
    }

    const results = await Promise.all(hosts)

    if (options.record) {
        await recordPasses(CHECKOUT, results)
    }

    if (options.json) {
        console.log(JSON.stringify({ hosts: results }))
    }

    const failed = results.flatMap(result =>
        result.scenarios.filter(scenario => scenario.status === 'failed'),
    )

    process.exitCode = failed.length > 0 ? 1 : 0
}
