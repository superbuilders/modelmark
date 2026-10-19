/** Starts each commit in `git log` output (ASCII record separator). */
export const COMMIT_SEPARATOR = '\u001E'

/** Separates one commit's trailer values (ASCII unit separator). */
export const VALUE_SEPARATOR = '\u001F'

/** Local branches tried, in order, when the repository has no `origin/HEAD`. */
export const DEFAULT_BRANCHES = ['main', 'master'] as const

/** What a count line says for commits with no mark. */
export const NO_MARK = 'no mark'

/** What the Markdown table and the badges call commits with no mark. */
export const NO_MARK_ROW = 'No mark'

/** The ways `summary` can print. */
export const SUMMARY_FORMATS = ['text', 'json', 'table', 'badges'] as const

/** Where badges are drawn. */
export const SHIELDS_URL = 'https://img.shields.io/badge/'

/** The badge style: square corners, so a badge's pieces join into one. */
export const BADGE_STYLE = 'flat-square'

/** The dark grey of a badge's name and commit count. */
export const BADGE_DARK = '30363D'

/** The model and effort colors of a harness modelmark doesn't know. */
export const UNKNOWN_HARNESS_COLORS = { color: '6E7781', effortColor: '4F565D' } as const

/** The lighter grey of the count on the badge for commits with no mark. */
export const NO_MARK_COUNT_COLOR = '57606A'
