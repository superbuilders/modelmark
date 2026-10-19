import { HARNESS_BADGES, HARNESS_NAMES } from '../../agents/constants'
import { parseMark } from '../../agents/mark'
import {
    BADGE_DARK,
    BADGE_STYLE,
    NO_MARK_COUNT_COLOR,
    NO_MARK_ROW,
    SHIELDS_URL,
    UNKNOWN_HARNESS_COLORS,
} from './constants'
import { commitsText } from './words'

import type { AgentId, HarnessBadge } from '../../agents/types'
import type { Summary } from './types'

/**
 * Text as a shields.io badge path segment, where `-` and `_` are separators.
 * @param text - the badge's text
 * @returns the escaped segment
 */
function shieldsText(text: string): string {
    return encodeURIComponent(text.replaceAll('-', '--').replaceAll('_', '__').replaceAll(' ', '_'))
}

/**
 * The logo as shields.io's `logo` parameter takes it.
 * @param logo - a Simple Icons name, or SVG markup
 * @returns the parameter's value
 */
function logoParameter(logo: HarnessBadge['logo']): string {
    return 'simpleIcon' in logo
        ? logo.simpleIcon
        : `data:image/svg+xml;base64,${Buffer.from(logo.svg).toString('base64')}`
}

/**
 * One piece of a badge: an image with the text as its alt text, so it still
 * reads where images don't load.
 * @param text - the piece's text
 * @param color - its background, as hex without the `#`
 * @param logo - a logo to show before the text
 * @returns the HTML image
 */
function piece(text: string, color: string, logo?: HarnessBadge['logo']): string {
    const url = new URL(`${SHIELDS_URL}${shieldsText(text)}-${color}`)

    url.searchParams.set('style', BADGE_STYLE)

    if (logo) {
        url.searchParams.set('logo', logoParameter(logo))
        url.searchParams.set('logoColor', 'white')
    }

    return `<img alt="${text}" src="${url.href}">`
}

/**
 * One mark's badge: the harness, the model, the effort and the commit count,
 * as pieces with nothing between them so they read as one.
 * @param mark - the trailer value
 * @param commits - how many commits carry it
 * @returns the HTML
 */
function markBadge(mark: string, commits: number): string {
    const { agent, model, effort } = parseMark(mark)
    const known = Object.hasOwn(HARNESS_BADGES, agent) ? (agent as AgentId) : null
    const { color, effortColor } = known ? HARNESS_BADGES[known] : UNKNOWN_HARNESS_COLORS
    const name = known ? HARNESS_NAMES[known] : agent

    return [
        piece(name, BADGE_DARK, known ? HARNESS_BADGES[known].logo : undefined),
        piece(model, color),
        effort ? piece(effort, effortColor) : '',
        piece(commitsText(commits), BADGE_DARK),
    ].join('')
}

/**
 * The summary as shields.io badges for a pull request: one badge per mark,
 * then one for commits with no mark, a line each.
 * @param summary - its counts
 * @returns the HTML, for Markdown
 */
export function summaryBadges(summary: Summary): string {
    const badges = summary.marks.map(({ mark, commits }) => markBadge(mark, commits))

    if (summary.unmarked > 0) {
        badges.push(
            piece(NO_MARK_ROW, BADGE_DARK) +
                piece(commitsText(summary.unmarked), NO_MARK_COUNT_COLOR),
        )
    }

    return badges.join('<br>\n')
}
