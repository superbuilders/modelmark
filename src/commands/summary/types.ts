import type { TokenCounts } from '../../trailers/types'
import type { SUMMARY_FORMATS } from './constants'

/**
 * How a harness's badge looks: its colors, and its logo, either from the
 * Simple Icons set shields.io draws from or as SVG markup.
 */
export interface HarnessBadge {
    /** The model piece's color, as hex without the `#`. */
    color: string
    /** The effort piece's color: a darker shade of `color`. */
    effortColor: string
    /** The logo beside the harness's name. */
    logo: { simpleIcon: string } | { svg: string }
}

/**
 * A way `summary` can print.
 */
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number]

/**
 * Badge colors for agents modelmark doesn't know, by agent, as hex without the `#`.
 */
export type AgentColors = Readonly<Record<string, string>>

/**
 * Badge logos for agents modelmark doesn't know, by agent, as SVG markup drawn white.
 */
export type AgentLogos = Readonly<Record<string, string>>

/**
 * How the badges of agents modelmark doesn't know look, as `summary`'s options give them.
 */
export interface AgentStyles {
    /** Their colors. */
    color: AgentColors
    /** Their logos. */
    logo: AgentLogos
}

/**
 * How many commits in a range carry one trailer value.
 */
export interface MarkCount {
    /** The trailer value, `<agent>:<model>`. */
    mark: string
    /** Commits carrying it. */
    commits: number

    /**
     * The estimated cost of those commits in US dollars, from their cost
     * lines; a commit with several marks splits its cost evenly between them.
     * Absent when none of them has a cost line.
     */
    cost?: number

    /**
     * The tokens those commits used, from their tokens lines, split between
     * a commit's marks like its cost and rounded to whole tokens. Absent when
     * none of them has a tokens line.
     */
    tokens?: TokenCounts
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
