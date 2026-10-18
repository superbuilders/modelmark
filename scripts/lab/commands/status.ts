import { currentPlatform } from '../../../src/agents/versions'
import { readVersions } from '../lib/harnesses'
import { macVersions } from '../lib/mac'
import { readPassed, statusLine, versionStatuses } from '../lib/passed'
import { CHECKOUT, spawn } from '../lib/process'

import type { HostChoice, VersionStatus } from '../lib/types'

/**
 * Options `lab status` takes.
 */
interface StatusOptions {
    /** Which hosts. */
    host: HostChoice
    /** Print JSON on stdout. */
    json?: boolean
}

/**
 * Compare each host's installed harnesses with the versions that last passed.
 * Exits 1 when an installed harness has not passed at its current version.
 * @param options - the command's options
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
    const record = await readPassed(CHECKOUT)
    const [local, mac] = await Promise.all([
        options.host === 'mac' ? null : readVersions(argv => spawn(argv)),
        options.host === 'local' ? null : macVersions(),
    ])
    const statuses: VersionStatus[] = [
        ...(local ? versionStatuses(record, currentPlatform(), local) : []),
        ...(mac ? versionStatuses(record, 'macos', mac) : []),
    ]

    if (options.json) {
        console.log(JSON.stringify(statuses))
    } else {
        console.log(statuses.map(status => statusLine(status)).join('\n'))
    }

    process.exitCode = statuses.some(
        status => status.installed && status.passed?.version !== status.installed,
    )
        ? 1
        : 0
}
