import { fileURLToPath } from 'node:url'

import { runCommand } from '../../../src/system/command'
import { AGENT_MARKERS } from './constants'

import type { Env } from '../../../src/agents/types'
import type { CommandOptions, CommandResult } from '../../../src/system/types'

/**
 * Raised when a scenario can't run on this host, such as a missing harness.
 */
export class SkipError extends Error {
    override name = 'SkipError'
}

/**
 * The lab's environment without the markers agents set, plus a scenario's own variables.
 * @param extra - variables to add
 * @returns the environment
 */
export function labEnv(extra: Env = {}): Env {
    const env: Env = { ...process.env }

    for (const name of AGENT_MARKERS) {
        delete env[name]
    }

    return { ...env, ...extra }
}

/**
 * Run a command to completion in the lab's environment unless given another.
 * @param argv - the command
 * @param options - folder, environment and time limit
 * @returns its output and exit code (127 when it could not start)
 */
export function spawn(argv: string[], options: CommandOptions = {}): Promise<CommandResult> {
    return runCommand(argv, { ...options, env: options.env ?? labEnv() })
}

/**
 * Quote one literal argument for a POSIX shell.
 * @param value - the argument
 * @returns it as one shell word
 */
export function shellQuote(value: string): string {
    return `'${value.replaceAll("'", String.raw`'\''`)}'`
}

/**
 * The last lines of some output, for a failure report.
 * @param text - the output
 * @param lines - how many lines to keep
 * @returns those lines, trimmed
 */
export function tail(text: string, lines = 6): string {
    return text.trim().split('\n').slice(-lines).join('\n')
}

/** This repository: the lab lives in its scripts/lab/lib. */
export const CHECKOUT = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
