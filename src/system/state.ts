import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
 * Where a file modelmark can rebuild lives: `$XDG_CACHE_HOME/modelmark/<name>`,
 * else `~/.cache/modelmark/<name>`.
 * @param name - its path under the cache folder
 * @param env - the environment
 * @returns the file's path
 */
export function cachePath(name: string, env: Env): string {
    return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), STATE_FOLDER, name)
}

/**
 * Write a file whole, so a reader at the same moment sees the old content or
 * the new, never half of it.
 * @param path - the file
 * @param value - its content
 */
export function writeWhole(path: string, value: string): void {
    const draft = `${path}.${process.pid}`

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(draft, value)
    renameSync(draft, path)
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
