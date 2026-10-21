/**
 * Where the hook finds modelmark: on PATH, or in the repository's
 * `node_modules` when the repository lists it as a dependency.
 */
export type HookStyle = 'path' | 'dependency'

/**
 * A repository's prepare-commit-msg hook file.
 */
export interface HookFile {
    /** Where it is, or would be. */
    path: string
    /** The repository's root folder. */
    root: string
    /** Whether the repository uses Husky, so the hook is committed and shared. */
    husky: boolean
    /** Its contents, or null when there is no hook yet. */
    text: string | null
}
