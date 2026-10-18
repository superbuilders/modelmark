import { expect, test } from 'vitest'
import { parseCLI } from 'vitest/node'

import { fullGatesAllowed, unscopedTestRun } from './run-context'

/**
 * Run the guard on arguments as vitest.config.ts does, with Vitest's own parser.
 * @param args - vitest's arguments
 * @returns the refusal reason, or null
 */
function guard(args: string[]): string | null {
    return unscopedTestRun(args, parseCLI(['vitest', ...args]).filter)
}

test('full gates require a hook or CI, and local tests require a real path', () => {
    expect(fullGatesAllowed({})).toBe(false)
    expect(fullGatesAllowed({ CI: 'false' })).toBe(false)
    expect(fullGatesAllowed({ MODELMARK_HOOK: 'pre-commit' })).toBe(true)
    expect(fullGatesAllowed({ CI: 'true' })).toBe(true)
    expect(fullGatesAllowed({ CI: '1' })).toBe(false)
    expect(guard(['run'])).not.toBeNull()
    expect(guard(['run', '--root', '.'])).not.toBeNull()
    expect(guard(['run', '--project', 'scripts'])).not.toBeNull()
    expect(guard(['run', '--exclude', 'scripts'])).not.toBeNull()
    expect(guard(['run', '--retry', '1', 'src'])).toBeNull()
    expect(guard(['related', 'scripts/lib/run-context.ts'])).not.toBeNull()
    expect(guard(['run', 'scripts/lib/run-context.test.ts'])).toBeNull()
    expect(guard(['run', 'scripts/lib/run-context.test.ts:1'])).toBeNull()
    expect(guard(['list', '--filesOnly'])).toBeNull()
})
