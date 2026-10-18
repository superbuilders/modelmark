import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { HARNESS_NAMES, PLATFORM_NAMES, TESTED_VERSIONS_FILE } from '../../../src/agents/constants'
import { markdownTable } from '../../../src/system/markdown'
import { NOT_TESTED, README_FILE, README_MARKERS } from './constants'

import type { AgentId, Platform, TestedRecord } from '../../../src/agents/types'
import type { HostResult, VersionStatus } from './types'

/**
 * Credit each harness's installed version when every scenario that ran it passed.
 * A failure leaves the harness's earlier record alone: that version still passed.
 * @param record - the record so far
 * @param result - one host's run
 * @param date - today, `yyyy-mm-dd`
 * @returns the updated record
 */
export function creditPasses(record: TestedRecord, result: HostResult, date: string): TestedRecord {
    const platform = { ...record[result.platform] }

    for (const [agent, version] of Object.entries(result.versions) as [AgentId, string][]) {
        const ran = result.scenarios.filter(
            scenario => scenario.harnesses.includes(agent) && scenario.status !== 'skipped',
        )

        if (ran.length > 0 && ran.every(scenario => scenario.status === 'passed')) {
            platform[agent] = { version, date }
        }
    }

    return { ...record, [result.platform]: platform }
}

/**
 * The README's tested-versions table.
 * @param record - the record of passing versions
 * @returns the table, without its markers
 */
export function testedTable(record: TestedRecord): string {
    const platforms = Object.keys(PLATFORM_NAMES) as Platform[]
    const agents = Object.keys(HARNESS_NAMES) as AgentId[]

    return markdownTable(
        ['Harness', ...platforms.map(platform => PLATFORM_NAMES[platform])],
        agents.map(agent => [
            HARNESS_NAMES[agent],
            ...platforms.map(platform => record[platform]?.[agent]?.version ?? NOT_TESTED),
        ]),
    )
}

/**
 * Put the tested-versions table between the README's markers.
 * @param readme - the README
 * @param record - the record of passing versions
 * @returns the README with the table in place
 */
export function withTestedTable(readme: string, record: TestedRecord): string {
    const start = readme.indexOf(README_MARKERS.start)
    const end = readme.indexOf(README_MARKERS.end)

    if (start === -1 || end < start) {
        throw new Error(
            `${README_FILE} has no ${README_MARKERS.start} … ${README_MARKERS.end} block`,
        )
    }

    return `${readme.slice(0, start + README_MARKERS.start.length)}\n\n${testedTable(record)}\n\n${readme.slice(end)}`
}

/**
 * Read the record of passing versions.
 * @param checkout - this repository
 * @returns the record
 */
export async function readPassed(checkout: string): Promise<TestedRecord> {
    return JSON.parse(await readFile(join(checkout, TESTED_VERSIONS_FILE), 'utf8')) as TestedRecord
}

/**
 * Credit each host's passes, then rewrite the record and the README's table from it.
 * @param checkout - this repository
 * @param results - each host's run
 */
export async function recordPasses(checkout: string, results: HostResult[]): Promise<void> {
    const date = new Date().toISOString().slice(0, 10)
    const record = results.reduce(
        (sofar, result) => creditPasses(sofar, result, date),
        await readPassed(checkout),
    )
    const readme = join(checkout, README_FILE)

    await writeFile(join(checkout, TESTED_VERSIONS_FILE), `${JSON.stringify(record, null, 4)}\n`)
    await writeFile(readme, withTestedTable(await readFile(readme, 'utf8'), record))
}

/**
 * Compare a host's installed harnesses with the record.
 * @param record - the record of passing versions
 * @param platform - the host's platform
 * @param installed - the installed versions
 * @returns one status per harness
 */
export function versionStatuses(
    record: TestedRecord,
    platform: Platform,
    installed: Partial<Record<AgentId, string>>,
): VersionStatus[] {
    return (Object.keys(HARNESS_NAMES) as AgentId[]).map(agent => ({
        platform,
        agent,
        installed: installed[agent] ?? null,
        passed: record[platform]?.[agent] ?? null,
    }))
}

/**
 * One line of `lab status`.
 * @param status - a harness on a platform
 * @returns the line
 */
export function statusLine(status: VersionStatus): string {
    const where = `${HARNESS_NAMES[status.agent]} on ${PLATFORM_NAMES[status.platform]}`

    if (!status.installed) {
        return `${where}: not installed`
    }

    if (status.passed?.version === status.installed) {
        return `${where} ${status.installed}: passed on ${status.passed.date}`
    }

    const last = status.passed ? ` (last passed: ${status.passed.version})` : ''

    return `${where} ${status.installed}: not tested yet${last}`
}
