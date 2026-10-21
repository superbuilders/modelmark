import type { HookFile, HookStyle } from '../../setup/types'

/**
 * What `install` did.
 */
export interface InstallResult {
    /** The hook file, as it now is. */
    hook: HookFile
    /** Where its line finds modelmark. */
    style: HookStyle
    /** Whether it wrote a new hook, switched an existing line, or found it in place. */
    outcome: 'installed' | 'switched' | 'unchanged'
}
