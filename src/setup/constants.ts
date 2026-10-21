import type { HookStyle } from './types'

/** The git hook modelmark runs from. */
export const HOOK_NAME = 'prepare-commit-msg'

/** The package name a repository lists modelmark under. */
export const PACKAGE_NAME = 'modelmark'

/** Where a repository that lists modelmark as a dependency has its command; git runs hooks from the repository's root. */
export const LOCAL_BIN = 'node_modules/.bin/modelmark'

/**
 * The line modelmark's hook runs, by where it finds modelmark. Each skips
 * quietly where modelmark isn't installed, and ignores a modelmark that can't
 * start (no Bun on a git app's PATH), so a shared hook (Husky's) never fails
 * anyone's commits.
 */
export const HOOK_LINES: Readonly<Record<HookStyle, string>> = {
    path: 'if command -v modelmark >/dev/null 2>&1; then modelmark hook "$@" || true; fi',
    dependency: `if [ -x ${LOCAL_BIN} ]; then ${LOCAL_BIN} hook "$@" || true; fi`,
}

/** Set to skip modelmark for a commit (`MODELMARK_DISABLE=1 git commit`), as `HUSKY=0` skips Husky. */
export const DISABLE_VARIABLE = 'MODELMARK_DISABLE'

/** Values of `MODELMARK_DISABLE` that leave modelmark on. */
export const ENABLED_VALUES: readonly string[] = ['', '0', 'false']
