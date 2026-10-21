import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import { HARNESS_COMMANDS, HARNESS_NAMES, PLATFORM_NAMES } from '../../agents/constants'
import { detect } from '../../agents/detect'
import { harnessName } from '../../agents/names'
import {
    currentPlatform,
    installedVersion,
    readTestedRecord,
    testedVersion,
} from '../../agents/versions'
import { DISABLE_VARIABLE, LOCAL_BIN } from '../../setup/constants'
import { findHookFile, hookDisabled, hookStyle, wantedStyle } from '../../setup/hooks'
import { markTrailer } from '../../trailers/mark'
import { LEVEL_SYMBOLS, RUNS_FROM } from './constants'

import type { AgentId } from '../../agents/types'
import type { Check, DoctorFacts } from './types'

/** How each way of finding an agent reads in the report. */
const VIA_TEXT = {
    'process-tree': 'in the process tree',
    environment: 'from its environment variables (the process tree was cut short)',
    declared: 'from MODELMARK',
} as const

/**
 * Whether the hook can reach modelmark: in `node_modules` for a repository that
 * lists it as a dependency, otherwise on PATH.
 * @param facts - what the doctor found
 * @returns the check
 */
function reachCheck(facts: DoctorFacts): Check {
    const style = (facts.hook && hookStyle(facts.hook)) ?? facts.wanted

    if (style === 'dependency') {
        if (facts.localBin) {
            return { level: 'ok', text: 'modelmark is installed in node_modules' }
        }

        return {
            level: 'fail',
            text: 'modelmark isn’t in node_modules, so the hook does nothing',
            fix: 'run bun install',
        }
    }

    if (facts.onPath) {
        return { level: 'ok', text: 'modelmark is on PATH' }
    }

    return {
        level: 'fail',
        text: 'modelmark isn’t on PATH, so the hook does nothing',
        fix: 'run bun add -g modelmark, or add Bun’s bin folder to the PATH git uses',
    }
}

/**
 * Whether this repository's hook runs modelmark.
 * @param facts - what the doctor found
 * @returns the check
 */
function hookCheck(facts: DoctorFacts): Check {
    if (!facts.hook) {
        return {
            level: 'fail',
            text: 'Not in a git repository, so there is no hook to check',
            fix: 'run modelmark doctor inside the repository',
        }
    }

    const path = relative(process.cwd(), facts.hook.path)
    const style = hookStyle(facts.hook)

    const wanted = facts.wanted ?? 'path'

    if (style && style !== wanted) {
        return {
            level: 'warn',
            text: `The hook in ${path} runs modelmark ${RUNS_FROM[style]}, but this repository wants it ${RUNS_FROM[wanted]}`,
            fix: 'run modelmark install to switch it',
        }
    }

    if (style) {
        return { level: 'ok', text: `The hook is installed in ${path}` }
    }

    return {
        level: 'fail',
        text: 'The hook isn’t installed in this repository',
        fix: 'run modelmark install',
    }
}

/**
 * Which agent is running the doctor, and the mark a commit here would get.
 * @param facts - what the doctor found
 * @param ready - whether the hook is in place to add the mark
 * @returns the checks
 */
function agentChecks(facts: DoctorFacts, ready: boolean): Check[] {
    const { detection } = facts

    if (facts.disabled) {
        return [
            { level: 'warn', text: `${DISABLE_VARIABLE} is set, so a commit here gets no mark` },
        ]
    }

    if (!detection) {
        return [{ level: 'info', text: 'No agent is running this, so a commit here gets no mark' }]
    }

    const found: Check = {
        level: 'ok',
        text: `Found ${harnessName(detection.agent)} ${VIA_TEXT[detection.via]}`,
    }
    const gets = ready ? 'a commit here gets' : 'once the hook works, a commit here gets'

    if (detection.model === null) {
        return [
            found,
            {
                level: 'warn',
                text: `Its model couldn’t be read, so ${gets} ${markTrailer(detection)}`,
                fix: 'update modelmark, since this harness may have changed where it writes the model',
            },
        ]
    }

    return [found, { level: 'ok', text: `${capitalize(gets)} ${markTrailer(detection)}` }]
}

/**
 * A sentence's first letter in capitals.
 * @param text - the sentence
 * @returns it, capitalized
 */
function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Whether one installed harness's version passed the lab on this platform.
 * @param facts - what the doctor found
 * @param agent - the harness
 * @returns the check, or null when the harness isn't installed
 */
function versionCheck(facts: DoctorFacts, agent: AgentId): Check | null {
    const installed = facts.versions[agent]

    if (!installed) {
        return null
    }

    const name = `${HARNESS_NAMES[agent]} ${installed}`
    const platform = PLATFORM_NAMES[facts.platform]
    const tested = testedVersion(facts.tested, agent, facts.platform)

    if (tested?.version === installed) {
        return { level: 'ok', text: `${name} passed the lab on ${platform}` }
    }

    const newest = tested ? ` (the newest tested is ${tested.version})` : ''

    return {
        level: 'warn',
        text: `${name} hasn’t been tested on ${platform}${newest}, so its marks may be wrong`,
        fix: 'update modelmark, which lists the versions it was tested with',
    }
}

/**
 * Turn what the doctor found into its report.
 * @param facts - what the doctor found
 * @returns one check per line, in reading order
 */
export function doctorChecks(facts: DoctorFacts): Check[] {
    const agents = Object.keys(HARNESS_COMMANDS) as AgentId[]
    const versions = agents.map(agent => versionCheck(facts, agent)).filter(check => check !== null)

    const setup = [reachCheck(facts), hookCheck(facts)]
    const ready = setup.every(check => check.level !== 'fail')

    return [...setup, ...agentChecks(facts, ready), ...versions]
}

/**
 * Gather everything the doctor looks at, in parallel.
 * @returns the facts
 */
async function gatherFacts(): Promise<DoctorFacts> {
    const [hook, detection, claudeCode, codex, pi] = await Promise.all([
        findHookFile().catch(() => null),
        detect(),
        installedVersion('claude-code'),
        installedVersion('codex'),
        installedVersion('pi'),
    ])

    return {
        onPath: Bun.which('modelmark') !== null,
        hook,
        wanted: hook ? await wantedStyle(hook.root) : null,
        localBin: hook ? existsSync(join(hook.root, LOCAL_BIN)) : false,
        detection,
        disabled: hookDisabled(process.env),
        platform: currentPlatform(),
        versions: { 'claude-code': claudeCode, codex, pi },
        tested: readTestedRecord(),
    }
}

/**
 * `modelmark doctor`: check the setup here and show the mark a commit would get.
 * Exits 1 when a check fails.
 * @param options - output options
 * @param options.json - print the facts and checks as JSON
 */
export async function doctorCommand({ json = false }: { json?: boolean }): Promise<void> {
    const facts = await gatherFacts()
    const checks = doctorChecks(facts)

    if (json) {
        console.log(JSON.stringify({ ...facts, checks }))
    } else {
        for (const check of checks) {
            console.log(`${LEVEL_SYMBOLS[check.level]} ${check.text}`)

            if (check.fix) {
                console.log(`  fix: ${check.fix}`)
            }
        }
    }

    process.exitCode = checks.some(check => check.level === 'fail') ? 1 : 0
}
