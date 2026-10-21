import type { HookStyle } from '../../setup/types'
import type { CheckLevel } from './types'

/** The symbol each check level prints with. */
export const LEVEL_SYMBOLS: Record<CheckLevel, string> = {
    ok: '✔',
    warn: '!',
    fail: '✖',
    info: '–',
}

/** Where each hook style runs modelmark from, as the report says it. */
export const RUNS_FROM: Readonly<Record<HookStyle, string>> = {
    path: 'from PATH',
    dependency: 'from node_modules',
}
