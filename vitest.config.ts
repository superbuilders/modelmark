import { defineConfig } from 'vitest/config'

import { fullGatesAllowed, testRefusal, unscopedTestRun } from './scripts/lib/run-context.ts'

/**
 * Guard only the CLI; editor API callers have their own file-selection contract.
 */
function guardTestRun() {
    const [, bin, ...args] = process.argv

    if (!bin?.includes('vitest') || fullGatesAllowed(process.env)) {
        return
    }

    const reason = unscopedTestRun(args)

    if (reason !== null) {
        console.error(testRefusal(reason))
        process.exit(1)
    }
}

guardTestRun()

export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        exclude: ['**/node_modules/**'],
        silent: 'passed-only',
        /** Istanbul, not v8: tests run under Bun, which has no V8 coverage profiler. */
        coverage: {
            provider: 'istanbul',
            include: ['src/**/*.ts'],
            /** The entrypoint only parses argv; src/program/program.ts holds the wiring and is tested. */
            exclude: ['src/cli.ts', '**/*.test.ts'],
            thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
        },
    },
})
