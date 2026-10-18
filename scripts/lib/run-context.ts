import { existsSync } from 'node:fs'

import { LIST_SUBCOMMAND, RELATED_SUBCOMMAND } from './vitest-options.ts'

/**
 * Whether the full quality gates may run in this environment.
 *
 * @param env - environment record, normally process.env
 * @returns true inside a git hook or CI
 */
export function fullGatesAllowed(env: Record<string, string | undefined>): boolean {
    return Boolean(env.MODELMARK_HOOK) || env.CI === 'true'
}

/**
 * Why a vitest invocation is refused outside the hooks, or null when it may
 * run: it names test files or directories (optionally with `--project`), or
 * it only lists files. A filter counts as named only if it exists on disk
 * (minus vitest's `:<line>` suffix). `related` names source files, not tests,
 * and one widely imported module selects most of the suite, so it is refused.
 *
 * @param args - vitest's arguments, after the `vitest` binary
 * @param filters - the test filters Vitest's own parser found in them (`parseCLI`)
 * @returns the refusal reason, or null when the run is scoped
 */
export function unscopedTestRun(
    args: readonly string[],
    filters: readonly string[],
): string | null {
    if (args[0] === LIST_SUBCOMMAND) {
        return null
    }

    if (args[0] === RELATED_SUBCOMMAND) {
        return '`vitest related` runs every test that imports the named source files, which can be most of the suite'
    }

    if (filters.some(filter => existsSync(filter.replace(/:\d+$/, '')))) {
        return null
    }

    return 'no test files or directories were named'
}

/**
 * Guidance for an unscoped test invocation outside hooks and CI.
 *
 * @param reason - the rule the invocation broke
 * @returns the refusal message
 */
export function testRefusal(reason: string): string {
    return `Tests not run: ${reason}.

Unscoped tests run only inside the git hooks and CI. CI runs the full suite
on every pull request; while working, name the tests for the code you changed:
  bun run test <files>
  bun run test scripts/lib/run-context.test.ts
  bunx vitest list --filesOnly

A --project or -t filter without paths still loads the whole suite.`
}

/**
 * Guidance for a full check invocation outside hooks and CI.
 *
 * @returns the refusal message
 */
export function checkRefusal(): string {
    return `Checks not run: \`bun run check\` runs only inside the git hooks and CI.

The commit hook lints and formats staged files; the push hook runs typecheck,
type-aware lint and knip. Running the gate first duplicates that work.
While working, run:
  bun run typecheck
  bun run test <files>

Commit and push when ready; the hooks run the rest and CI runs the full suite.`
}
