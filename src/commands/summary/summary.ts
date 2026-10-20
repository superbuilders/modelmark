import { harnessName, parseMark } from '../../agents/mark'
import { git, runCommand } from '../../system/command'
import { markdownTable } from '../../system/markdown'
import { summaryBadges } from './badges'
import { COMMIT_SEPARATOR, DEFAULT_BRANCHES, NO_MARK, NO_MARK_ROW } from './constants'
import { MARK_LINE } from './patterns'
import { commitsText } from './words'

import type { AgentStyles, Summary, SummaryFormat } from './types'

/**
 * Count the marks across a range of commits, skipping merges. A squashed
 * commit counts once for each mark its body holds.
 * @param range - a git revision range, such as `main..HEAD`
 * @param cwd - the repository (default: this process's folder)
 * @returns the counts
 */
export async function summarize(range: string, cwd?: string): Promise<Summary> {
    const output = await git(['log', '--no-merges', `--format=${COMMIT_SEPARATOR}%B`, range], cwd)
    const commits = output.split(COMMIT_SEPARATOR).slice(1)
    const counts = new Map<string, number>()
    let unmarked = 0

    for (const commit of commits) {
        const marks = new Set(Array.from(commit.matchAll(MARK_LINE), ([, mark]) => mark.trim()))

        if (marks.size === 0) {
            unmarked++
        }

        for (const mark of marks) {
            counts.set(mark, (counts.get(mark) ?? 0) + 1)
        }
    }

    const marks = [...counts]
        .map(([mark, count]) => ({ mark, commits: count }))
        .toSorted((a, b) => b.commits - a.commits || a.mark.localeCompare(b.mark))

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
 * The summary as plain text: a header, then one line per mark.
 * @param range - the range covered
 * @param summary - its counts
 * @returns the text
 */
function summaryText(range: string, summary: Summary): string {
    const counts = summary.marks.map(({ mark, commits }) => ({ label: mark, commits }))

    if (summary.unmarked > 0) {
        counts.push({ label: NO_MARK, commits: summary.unmarked })
    }

    const width = String(summary.total).length
    const lines = counts.map(
        ({ label, commits }) => `  ${String(commits).padStart(width)}  ${label}`,
    )

    return [`${range}: ${commitsText(summary.total)}`, ...lines].join('\n')
}

/**
 * The summary as a Markdown table for a pull request body or comment, with
 * the harness, model and effort apart. It names no range, because the pull
 * request already says which commits it holds.
 * @param summary - its counts
 * @returns the Markdown
 */
export function summaryTable(summary: Summary): string {
    const rows = summary.marks.map(({ mark, commits }) => {
        const { agent, model, effort } = parseMark(mark)

        return [harnessName(agent), model, effort ?? '', String(commits)]
    })

    if (summary.unmarked > 0) {
        rows.push([NO_MARK_ROW, '', '', String(summary.unmarked)])
    }

    return markdownTable(['Harness', 'Model', 'Effort', 'Commits'], rows)
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

        case 'table': {
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
 * @param options.color - badge colors for agents modelmark doesn't know
 * @param options.logo - badge logos for agents modelmark doesn't know
 */
export async function summaryCommand(
    range: string | undefined,
    {
        format = 'text',
        json = false,
        color = {},
        logo = {},
    }: { format?: SummaryFormat; json?: boolean } & Partial<AgentStyles>,
): Promise<void> {
    const covered = range ?? (await defaultRange())

    console.log(
        formatSummary(json ? 'json' : format, covered, await summarize(covered), {
            color,
            logo,
        }),
    )
}
