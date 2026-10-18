/**
 * How many commits in a range carry one trailer value.
 */
export interface MarkCount {
    /** The trailer value, `<agent>:<model>`. */
    mark: string
    /** Commits carrying it. */
    commits: number
}

/**
 * The marks across a range of commits.
 */
export interface Summary {
    /** Non-merge commits in the range. */
    total: number
    /** Commits with no mark: made outside any agent, or before modelmark. */
    unmarked: number
    /** Each mark and its commit count, most commits first. */
    marks: MarkCount[]
}
