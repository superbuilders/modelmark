import { harnessName } from '../../agents/names'
import { git, runCommand } from '../../system/command'
import { markdownTable } from '../../system/markdown'
import { parseMark } from '../../trailers/mark'
import { marksIn, messageCost } from '../../trailers/message'
import { addTokens, messageTokens } from '../../trailers/tokens'
import { summaryBadges } from './badges'
import { COMMIT_SEPARATOR, DEFAULT_BRANCHES, NO_MARK, NO_MARK_ROW } from './constants'
import { cachedText, commitsText, costText, newTokensText } from './words'

import type {
    AgentColors,
    AgentLogos,
    AgentStyles,
    MarkCount,
    Summary,
    SummaryFormat,
} from './types'

/**
 * Count the marks across a range of commits, skipping merges, and add up
 * their costs and tokens. A squashed commit counts once for each mark its
 * body holds, and its cost and tokens are the sums of its lines. Git reads the range only as
 * revisions, so a typo is an error rather than an option or a file to filter by.
 * @param range - a git revision range, such as `main..HEAD`
 * @param cwd - the repository (default: this process's folder)
 * @returns the counts
 */
export async function summarize(range: string, cwd?: string): Promise<Summary> {
    const output = await git(
        ['log', '--no-merges', `--format=${COMMIT_SEPARATOR}%B`, '--end-of-options', range, '--'],
        cwd,
    )
    const commits = output.split(COMMIT_SEPARATOR).slice(1)
    const counts = new Map<string, MarkCount>()
    let unmarked = 0

    for (const commit of commits) {
        const marks = new Set(marksIn(commit))

        if (marks.size === 0) {
            unmarked++

            continue
        }

        const cost = messageCost(commit)
        const tokens = messageTokens(commit)
        const share = tokens && {
            input: Math.round(tokens.input / marks.size),
            cacheWrite: Math.round(tokens.cacheWrite / marks.size),
            output: Math.round(tokens.output / marks.size),
            cacheRead: Math.round(tokens.cacheRead / marks.size),
        }

        for (const mark of marks) {
            const count = counts.get(mark) ?? { mark, commits: 0 }

            count.commits++

            if (cost !== undefined) {
                count.cost = (count.cost ?? 0) + cost / marks.size
            }

            if (share) {
                count.tokens = addTokens([share], count.tokens)
            }

            counts.set(mark, count)
        }
    }

    const marks = [...counts.values()].toSorted(
        (a, b) => b.commits - a.commits || a.mark.localeCompare(b.mark),
    )

    return { total: commits.length, unmarked, marks }
}

/**
 * The repository's default branch: what `origin/HEAD` points at, else a local
 * `main` or `master`.
 * @param cwd - the repository (default: this process's folder)
 * @returns the branch, such as `origin/main` or `main`
 */
async function defaultBranch(cwd?: string): Promise<string> {
    const remote = await runCommand(
        ['git', 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
        { cwd },
    )

    if (remote.exitCode === 0) {
        return remote.stdout.trim()
    }

    for (const branch of DEFAULT_BRANCHES) {
        const local = await runCommand(
            ['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
            { cwd },
        )

        if (local.exitCode === 0) {
            return branch
        }
    }

    throw new Error(
        'No default branch found (no origin/HEAD, main or master); name a range, such as main..HEAD',
    )
}

/**
 * The range `summary` covers when none is named: this branch's commits that
 * aren't on the default branch.
 * @param cwd - the repository (default: this process's folder)
 * @returns the range, such as `origin/main..HEAD`
 */
export async function defaultRange(cwd?: string): Promise<string> {
    const [base, branch] = await Promise.all([
        defaultBranch(cwd),
        git(['branch', '--show-current'], cwd),
    ])
    const current = branch.trim()

    if (current && (base === current || base.endsWith(`/${current}`))) {
        throw new Error(
            `This is the default branch (${current}); name a range, such as ${base}~5..HEAD`,
        )
    }

    return `${base}..HEAD`
}

/**
 * The summary as plain text: a header, then one line per mark, with its cost
 * and tokens when known.
 * @param range - the range covered
 * @param summary - its counts
 * @returns the text
 */
function summaryText(range: string, summary: Summary): string {
    const counts: MarkCount[] =
        summary.unmarked > 0
            ? [...summary.marks, { mark: NO_MARK, commits: summary.unmarked }]
            : summary.marks

    const width = String(summary.total).length
    const lines = counts.map(({ mark, commits, cost, tokens }) =>
        [
            `  ${String(commits).padStart(width)}  ${mark}`,
            cost === undefined ? '' : costText(cost),
            tokens ? `${newTokensText(tokens)}, ${cachedText(tokens)}` : '',
        ]
            .filter(Boolean)
            .join('  '),
    )

    return [`${range}: ${commitsText(summary.total)}`, ...lines].join('\n')
}

/**
 * The summary as a Markdown table for a pull request body or comment, with
 * the harness, model and effort apart, and cost and token columns when any
 * mark has them. It names no range, because the pull request already says
 * which commits it holds.
 * @param summary - its counts
 * @returns the Markdown
 */
export function summaryTable(summary: Summary): string {
    const costs = summary.marks.some(({ cost }) => cost !== undefined)
    const tokens = summary.marks.some(count => count.tokens)
    const headers = [
        'Harness',
        'Model',
        'Effort',
        'Commits',
        ...(costs ? ['Cost'] : []),
        ...(tokens ? ['Tokens', 'Cached'] : []),
    ]
    const rows = summary.marks.map(count => {
        const { agent, model, effort } = parseMark(count.mark)

        return [
            harnessName(agent),
            model,
            effort ?? '',
            String(count.commits),
            ...(costs ? [count.cost === undefined ? '' : costText(count.cost)] : []),
            ...(count.tokens ? [newTokensText(count.tokens), cachedText(count.tokens)] : []),
        ]
    })

    if (summary.unmarked > 0) {
        rows.push([NO_MARK_ROW, '', '', String(summary.unmarked)])
    }

    return markdownTable(headers, rows)
}

/**
 * The summary in one of `summary`'s formats.
 * @param format - how to print it
 * @param range - the range covered
 * @param summary - its counts
 * @param styles - badge colors and logos for agents modelmark doesn't know
 * @returns the output
 */
function formatSummary(
    format: SummaryFormat,
    range: string,
    summary: Summary,
    styles: AgentStyles,
): string {
    switch (format) {
        case 'json': {
            return JSON.stringify({ range, ...summary })
        }

        case 'markdown': {
            return summaryTable(summary)
        }

        case 'badges': {
            return summaryBadges(summary, styles)
        }

        default: {
            return summaryText(range, summary)
        }
    }
}

/**
 * Print the marks across a range.
 * @param range - a git revision range (default: this branch's commits not on the default branch)
 * @param options - output options
 * @param options.format - how to print the summary
 * @param options.json - shorthand for `format: 'json'`
 * @param options.badgeColor - badge colors for agents modelmark doesn't know
 * @param options.badgeLogo - badge logos for agents modelmark doesn't know
 */
export async function summaryCommand(
    range: string | undefined,
    {
        format = 'text',
        json = false,
        badgeColor = {},
        badgeLogo = {},
    }: { format?: SummaryFormat; json?: boolean; badgeColor?: AgentColors; badgeLogo?: AgentLogos },
): Promise<void> {
    const covered = range ?? (await defaultRange())

    console.log(
        formatSummary(json ? 'json' : format, covered, await summarize(covered), {
            color: badgeColor,
            logo: badgeLogo,
        }),
    )
}
