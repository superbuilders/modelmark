/** Starts each commit in `git log` output (ASCII record separator). */
export const COMMIT_SEPARATOR = '\u001E'

/** Separates one commit's trailer values (ASCII unit separator). */
export const VALUE_SEPARATOR = '\u001F'

/** Local branches tried, in order, when the repository has no `origin/HEAD`. */
export const DEFAULT_BRANCHES = ['main', 'master'] as const

/** What a count line says for commits with no mark. */
export const NO_MARK = 'no mark'

/** What the Markdown table's harness column says for commits with no mark. */
export const NO_MARK_ROW = 'No mark'
