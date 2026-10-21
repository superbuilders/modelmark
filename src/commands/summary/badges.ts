import { harnessName } from '../../agents/names'
import { parseMark } from '../../trailers/mark'
import {
    BADGE_COST_COLOR,
    BADGE_DARK,
    BADGE_STYLE,
    EFFORT_SHADE,
    HARNESS_BADGES,
    NO_MARK_COUNT_COLOR,
    NO_MARK_ROW,
    SHIELDS_URL,
    UNKNOWN_HARNESS_COLORS,
} from './constants'
import { commitsText, costText } from './words'

import type { AgentId } from '../../agents/types'
import type {
    AgentColors,
    AgentLogos,
    AgentStyles,
    HarnessBadge,
    MarkCount,
    Summary,
} from './types'

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
 * A darker shade of a color, for the effort piece beside a model piece.
 * @param color - hex without the `#`
 * @returns the shade, hex without the `#`
 */
function shade(color: string): string {
    const value = Number.parseInt(color, 16)
    const channels = [16, 8, 0].map(shift => Math.round(((value >> shift) & 0xff) * EFFORT_SHADE))

    return channels
        .map(channel => channel.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
}

/**
 * The model and effort colors for an agent: its own when modelmark knows it,
 * the one it was given otherwise, else grey.
 * @param agent - the agent from a mark
 * @param colors - colors given for agents modelmark doesn't know
 * @returns the colors
 */
function agentColors(agent: string, colors: AgentColors): Omit<HarnessBadge, 'logo'> {
    if (Object.hasOwn(HARNESS_BADGES, agent)) {
        return HARNESS_BADGES[agent as AgentId]
    }

    const given = colors[agent]

    return given ? { color: given, effortColor: shade(given) } : UNKNOWN_HARNESS_COLORS
}

/**
 * The logo for an agent: its own when modelmark knows it, the one it was
 * given otherwise, else none.
 * @param agent - the agent from a mark
 * @param logos - logos given for agents modelmark doesn't know
 * @returns the logo, or undefined for none
 */
function agentLogo(agent: string, logos: AgentLogos): HarnessBadge['logo'] | undefined {
    if (Object.hasOwn(HARNESS_BADGES, agent)) {
        return HARNESS_BADGES[agent as AgentId].logo
    }

    const given = logos[agent]

    return given ? { svg: given } : undefined
}

/**
 * One mark's badge: the harness, the model, the effort, the commit count and
 * (when known) the estimated cost, as pieces with nothing between them so
 * they read as one.
 * @param count - the mark, its commit count and its cost
 * @param count.mark - the trailer value
 * @param count.commits - how many commits carry it
 * @param count.cost - their estimated cost, when known
 * @param styles - colors and logos given for agents modelmark doesn't know
 * @returns the HTML
 */
function markBadge({ mark, commits, cost }: MarkCount, styles: AgentStyles): string {
    const { agent, model, effort } = parseMark(mark)
    const { color, effortColor } = agentColors(agent, styles.color)

    return [
        piece(harnessName(agent), BADGE_DARK, agentLogo(agent, styles.logo)),
        piece(model, color),
        effort ? piece(effort, effortColor) : '',
        piece(commitsText(commits), BADGE_DARK),
        cost === undefined ? '' : piece(costText(cost), BADGE_COST_COLOR),
    ].join('')
}

/**
 * The summary as shields.io badges for a pull request: one badge per mark,
 * then one for commits with no mark, a line each. Commits with no mark at all
 * get no badges, since they say nothing about who made them.
 * @param summary - its counts
 * @param styles - colors and logos given for agents modelmark doesn't know
 * @returns the HTML, for Markdown, or empty when no commit has a mark
 */
export function summaryBadges(
    summary: Summary,
    styles: AgentStyles = { color: {}, logo: {} },
): string {
    if (summary.marks.length === 0) {
        return ''
    }

    const badges = summary.marks.map(count => markBadge(count, styles))

    if (summary.unmarked > 0) {
        badges.push(
            piece(NO_MARK_ROW, BADGE_DARK) +
                piece(commitsText(summary.unmarked), NO_MARK_COUNT_COLOR),
        )
    }

    return badges.join('<br>\n')
}
