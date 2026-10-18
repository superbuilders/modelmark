import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runCommand } from '../system/command'
import { HARNESS_COMMANDS, TESTED_VERSIONS_FILE } from './constants'

import type { CommandResult } from '../system/types'
import type { AgentId, Platform, TestedRecord, TestedVersion } from './types'

/**
 * The version number in a harness's `--version` output.
 * @param output - the output, such as `2.1.302 (Claude Code)` or `codex-cli 0.154.0`
 * @returns the version, or null when there is none
 */
export function parseVersion(output: string): string | null {
    return /\d+\.\d+\.\d+/.exec(output)?.[0] ?? null
}

/**
 * The installed version of a harness.
 * @param agent - the harness
 * @param run - runs the version command (default: on this machine)
 * @returns its version, or null when it is missing
 */
export async function installedVersion(
    agent: AgentId,
    run: (argv: string[]) => Promise<CommandResult> = runCommand,
): Promise<string | null> {
    const result = await run([HARNESS_COMMANDS[agent], '--version'])

    return result.exitCode === 0 ? parseVersion(result.stdout) : null
}

/**
 * This machine's platform.
 * @returns `macos` on a Mac, otherwise `linux`
 */
export function currentPlatform(): Platform {
    return process.platform === 'darwin' ? 'macos' : 'linux'
}

/**
 * Read the lab's record of tested versions, which ships beside modelmark's source.
 * @param path - the record (default: the one in modelmark's own folder)
 * @returns the record, or an empty one when it can't be read
 */
export function readTestedRecord(
    path = fileURLToPath(new URL(`../../${TESTED_VERSIONS_FILE}`, import.meta.url)),
): TestedRecord {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as TestedRecord
    } catch {
        return {}
    }
}

/**
 * The newest version of a harness that passed the lab on a platform.
 * @param record - the tested-versions record
 * @param agent - the harness
 * @param platform - the platform
 * @returns that version, or null when none has
 */
export function testedVersion(
    record: TestedRecord,
    agent: AgentId,
    platform: Platform,
): TestedVersion | null {
    return record[platform]?.[agent] ?? null
}
