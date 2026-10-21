import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { gray, green, red, yellow } from 'colorette'

import { PLATFORM_NAMES } from '../../../src/agents/constants'
import { currentPlatform } from '../../../src/agents/versions'
import { CONCURRENCY, LAB_ROOT } from './constants'
import { readVersions } from './harnesses'
import { SkipError, spawn } from './process'
import { verdict } from './verdict'
import { Workspace } from './workspace'

import type { AgentId, Platform } from '../../../src/agents/types'
import type { HostResult, Scenario, ScenarioResult } from './types'

/**
 * Print one scenario's outcome to stderr as it finishes.
 * @param platform - where it ran
 * @param result - the outcome
 */
export function reportScenario(platform: Platform, result: ScenarioResult): void {
    const where = gray(PLATFORM_NAMES[platform])
    const timing = result.hookMs?.length ? `, hook ${Math.max(...result.hookMs)} ms` : ''

    if (result.status === 'passed') {
        console.error(`${green('passed')}  ${where} ${result.name} (${result.seconds} s${timing})`)
    } else if (result.status === 'skipped') {
        console.error(`${yellow('skipped')} ${where} ${result.name}: ${result.reason}`)
    } else {
        console.error(`${red('failed')}  ${where} ${result.name}: ${result.reason}`)
    }
}

/**
 * Whole seconds since a moment.
 * @param started - a `performance.now()` reading
 * @returns the seconds, rounded
 */
function secondsSince(started: number): number {
    return Math.round((performance.now() - started) / 1000)
}

/**
 * Run one scenario in its own scratch folder and judge it.
 * @param scenario - the scenario
 * @param root - the scenario's scratch folder
 * @param checkout - this repository
 * @param versions - the installed harnesses
 * @returns the outcome
 */
async function runScenario(
    scenario: Scenario,
    root: string,
    checkout: string,
    versions: Partial<Record<AgentId, string>>,
): Promise<ScenarioResult> {
    const started = performance.now()
    const base = { name: scenario.name, harnesses: scenario.harnesses }
    const missing = scenario.harnesses.filter(agent => !versions[agent])

    if (missing.length > 0) {
        return {
            ...base,
            status: 'skipped',
            reason: `${missing.join(', ')} not installed`,
            seconds: 0,
        }
    }

    const workspace = await Workspace.create(root, checkout)

    try {
        await scenario.run(workspace)
    } catch (error) {
        const status = error instanceof SkipError ? 'skipped' : 'failed'

        return { ...base, status, reason: String(error), seconds: secondsSince(started) }
    }

    const [trailers, hookMs, hookErrors] = await Promise.all([
        workspace.trailers(),
        workspace.hookTimes(),
        workspace.hookErrors(),
    ])
    const reason = verdict({
        expected: scenario.expected,
        trailers: trailers?.marks ?? null,
        costed: scenario.expected.length > 0 && scenario.priced !== false,
        costs: trailers?.costs ?? [],
        hookMs,
        hookErrors,
    })

    return {
        ...base,
        status: reason ? 'failed' : 'passed',
        ...(reason ? { reason } : {}),
        trailers: trailers?.marks ?? [],
        costs: trailers?.costs ?? [],
        hookMs,
        seconds: secondsSince(started),
    }
}

/**
 * Run scenarios on this machine, a few at a time.
 * @param scenarios - the scenarios
 * @param checkout - this repository
 * @param keep - keep every scenario's scratch folder, not only the failed ones
 * @returns the results, in the scenarios' order
 */
export async function runLocal(
    scenarios: readonly Scenario[],
    checkout: string,
    keep: boolean,
): Promise<HostResult> {
    const platform = currentPlatform()
    const needed = [...new Set(scenarios.flatMap(scenario => scenario.harnesses))]
    const versions = await readVersions(argv => spawn(argv), needed)
    const run = join(LAB_ROOT, 'runs', `${Date.now()}-${process.pid}`)
    const results: ScenarioResult[] = Array.from({ length: scenarios.length })

    await mkdir(run, { recursive: true, mode: 0o700 })

    const queue = scenarios.entries()

    /**
     * Take the next scenario from the shared queue until none are left.
     */
    async function work(): Promise<void> {
        for (const [index, scenario] of queue) {
            const root = join(run, scenario.name)
            const result = await runScenario(scenario, root, checkout, versions)

            if (!keep && result.status !== 'failed') {
                await rm(root, { recursive: true, force: true })
            }

            results[index] = result
            reportScenario(platform, result)
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => work()))

    if (keep || results.some(result => result.status === 'failed')) {
        console.error(gray(`Scratch folders kept in ${run}`))
    } else {
        await rm(run, { recursive: true, force: true })
    }

    return { platform, versions, scenarios: results }
}
