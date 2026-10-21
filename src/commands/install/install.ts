import { existsSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

import { HOOK_LINES, LOCAL_BIN } from '../../system/constants'
import { findHookFile, hookStyle, wantedStyle } from '../../system/hooks'

import type { HookFile, HookStyle } from '../../system/types'
import type { InstallResult } from './types'

/**
 * The hook's path as the person sees it from where they are.
 * @param hook - the hook file
 * @returns the path relative to this process's folder
 */
function shown(hook: HookFile): string {
    return relative(process.cwd(), hook.path)
}

/** Every line modelmark writes, to recognize one whatever its style. */
const OUR_LINES = new Set(Object.values(HOOK_LINES))

/**
 * Write a hook file and make it executable.
 * @param hook - the hook file
 * @param text - its new contents
 */
async function writeHook(hook: HookFile, text: string): Promise<void> {
    await mkdir(dirname(hook.path), { recursive: true })
    await writeFile(hook.path, text)
    await chmod(hook.path, 0o755)
}

/**
 * Add modelmark's hook to this repository, or switch its line when the
 * repository has since added or dropped modelmark as a dependency.
 *
 * An existing hook that doesn't run modelmark is left alone: a script can end
 * in `exec`, and a line appended after it would never run.
 * @returns what happened
 */
export async function install(): Promise<InstallResult> {
    const hook = await findHookFile()
    const style = await wantedStyle(hook.root)
    const current = hookStyle(hook)
    const line = HOOK_LINES[style]

    if (current === style) {
        return { hook, style, outcome: 'unchanged' }
    }

    if (current) {
        const text = (hook.text ?? '')
            .split('\n')
            .map(existing => (OUR_LINES.has(existing) ? line : existing))
            .join('\n')

        await writeHook(hook, text)

        return { hook: { ...hook, text }, style, outcome: 'switched' }
    }

    if (hook.text !== null) {
        throw new Error(`${shown(hook)} already exists. Add this line to it:\n  ${line}`)
    }

    const text = `#!/bin/sh\n${line}\n`

    await writeHook(hook, text)

    return { hook: { ...hook, text }, style, outcome: 'installed' }
}

/**
 * Take modelmark's line out of this repository's hook, and delete the hook if
 * nothing else is left in it.
 * @returns the hook file as it was, or null when it didn't run modelmark
 */
export async function uninstall(): Promise<HookFile | null> {
    const hook = await findHookFile()

    if (hook.text === null) {
        return null
    }

    const rest = hook.text
        .split('\n')
        .filter(line => !OUR_LINES.has(line))
        .join('\n')

    if (rest === hook.text) {
        return null
    }

    if (rest.replace('#!/bin/sh', '').trim() === '') {
        await rm(hook.path)
    } else {
        await writeFile(hook.path, rest)
    }

    return hook
}

/**
 * Why the hook can't reach modelmark yet, if it can't.
 * @param hook - the hook file
 * @param style - where the hook finds modelmark
 * @returns the warning, or null when modelmark is in place
 */
function reachWarning(hook: HookFile, style: HookStyle): string | null {
    if (style === 'dependency') {
        return existsSync(join(hook.root, LOCAL_BIN))
            ? null
            : 'modelmark isn’t in node_modules yet, so the hook does nothing until bun install runs'
    }

    return Bun.which('modelmark')
        ? null
        : 'modelmark isn’t on PATH yet, so the hook does nothing; run bun link in the modelmark checkout'
}

/** What `install` says for each outcome, before the hook's path. */
const OUTCOME_TEXT: Readonly<Record<InstallResult['outcome'], string>> = {
    installed: 'Installed the hook in',
    switched: 'Switched the hook to the new modelmark line in',
    unchanged: 'Already installed in',
}

/** What `install` says about the one thing modelmark does on the network. */
const PRICES_NOTICE =
    'Commits get an estimated cost, priced from a list modelmark downloads from models.dev at most once an hour in the background; set MODELMARK_OFFLINE=1 to turn the download off'

/**
 * `modelmark install`: add the hook, say where it went, and, the first time,
 * that modelmark downloads prices.
 */
export async function installCommand(): Promise<void> {
    const { hook, style, outcome } = await install()

    console.log(`${OUTCOME_TEXT[outcome]} ${shown(hook)}`)

    if (outcome === 'installed' && hook.husky) {
        console.log('This repository uses Husky, so commit that file to mark everyone’s commits')
    }

    const warning = reachWarning(hook, style)

    if (warning) {
        console.log(warning)
    }

    /*
     * Like Next.js's telemetry notice, said once rather than on every run.
     */
    if (outcome !== 'unchanged') {
        console.log(PRICES_NOTICE)
    }
}

/**
 * `modelmark uninstall`: remove the hook and say what changed.
 */
export async function uninstallCommand(): Promise<void> {
    const hook = await uninstall()

    console.log(
        hook ? `Removed modelmark from ${shown(hook)}` : 'modelmark’s hook isn’t installed here',
    )
}
