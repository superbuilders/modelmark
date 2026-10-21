import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { STATE_FOLDER } from './constants'

import type { Env } from './types'

/**
 * Where modelmark keeps what it remembers between runs: `$XDG_STATE_HOME/modelmark`,
 * else `~/.local/state/modelmark`.
 * @param env - the environment
 * @returns the folder
 */
function stateDir(env: Env): string {
    return join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), STATE_FOLDER)
}

/**
 * Read a remembered value.
 * @param name - its path under the state folder
 * @param env - the environment
 * @returns the value, or undefined when nothing is remembered
 */
export function readState(name: string, env: Env): string | undefined {
    try {
        return readFileSync(join(stateDir(env), name), 'utf8')
    } catch {
        return undefined
    }
}

/**
 * Remember a value, replacing what was there.
 * @param name - its path under the state folder
 * @param value - the value
 * @param env - the environment
 */
export function writeState(name: string, value: string, env: Env): void {
    const path = join(stateDir(env), name)

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, value)
}
