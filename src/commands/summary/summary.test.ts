import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { git } from '../../system/command'
import { defaultRange, summarize, summaryCommand, summaryTable } from './summary'

/**
 * Make a repository with a `base` commit, then one empty commit per message.
 * @param messages - the full message of each commit after `base`
 * @returns the repository's path
 */
async function repoWith(messages: string[]): Promise<string> {
    const repo = mkdtempSync(join(tmpdir(), 'modelmark-summary-'))

    await git(['init', '-q', '-b', 'main'], repo)

    for (const message of ['base', ...messages]) {
        await git(
            [
                '-c',
                'user.name=t',
                '-c',
                'user.email=t@t',
                'commit',
                '-q',
                '--allow-empty',
                '-m',
                message,
            ],
            repo,
        )

        if (message === 'base') {
            await git(['tag', 'base'], repo)
        }
    }

    return repo
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('summarize', () => {
    test('counts commits per mark across a range, with unmarked commits apart', async () => {
        const repo = await repoWith([
            'one\n\nAssisted-by: claude-code:claude-opus-5-5',
            'two\n\nAssisted-by: claude-code:claude-opus-5-5',
            'three\n\nAssisted-by: codex:gpt-5.6-terra',
            'four\n\nAssisted-by: claude-code:claude-opus-5-5\nAssisted-by: codex:gpt-5.6-terra',
            'by hand',
        ])

        expect(await summarize('base..HEAD', repo)).toEqual({
            total: 5,
            unmarked: 1,
            marks: [
                { mark: 'claude-code:claude-opus-5-5', commits: 3 },
                { mark: 'codex:gpt-5.6-terra', commits: 2 },
            ],
        })
    })

    test('counts each mark in a squashed body, once per commit', async () => {
        const repo = await repoWith([
            [
                'Squash (#1)',
                '* first',
                'Assisted-by: claude-code:claude-opus-5-5@medium',
                '* second',
                'Assisted-by: claude-code:claude-opus-5-5@medium',
                '* third',
                'assisted-by: pi:kimi-k3',
                '* by hand',
            ].join('\n\n'),
        ])

        expect(await summarize('base..HEAD', repo)).toEqual({
            total: 1,
            unmarked: 0,
            marks: [
                { mark: 'claude-code:claude-opus-5-5@medium', commits: 1 },
                { mark: 'pi:kimi-k3', commits: 1 },
            ],
        })
    })

    test("adds up each mark's costs, splitting a commit's cost between its marks", async () => {
        const repo = await repoWith([
            'one\n\nAssisted-by: pi:kimi-k3\nAssisted-cost: $1.00',
            'two\n\nAssisted-by: pi:kimi-k3\nAssisted-by: codex:gpt-5.6-terra\nAssisted-cost: $3.00',
            'three\n\nAssisted-by: codex:gpt-5.6-terra',
        ])

        const { marks } = await summarize('base..HEAD', repo)

        expect(marks).toEqual([
            { mark: 'codex:gpt-5.6-terra', commits: 2, cost: 1.5 },
            { mark: 'pi:kimi-k3', commits: 2, cost: 2.5 },
        ])
    })

    test("adds up each mark's tokens, splitting a commit's tokens between its marks", async () => {
        const repo = await repoWith([
            'one\n\nAssisted-by: pi:kimi-k3\nAssisted-tokens: 10 input, 0 cache-write, 4 output, 100 cache-read',
            'two\n\nAssisted-by: pi:kimi-k3\nAssisted-by: codex:gpt-5.6-terra\nAssisted-tokens: 20 input, 6 cache-write, 2 output, 50 cache-read',
            'three\n\nAssisted-by: codex:gpt-5.6-terra',
        ])

        const { marks } = await summarize('base..HEAD', repo)

        expect(marks).toEqual([
            {
                mark: 'codex:gpt-5.6-terra',
                commits: 2,
                tokens: { input: 10, cacheWrite: 3, output: 1, cacheRead: 25 },
            },
            {
                mark: 'pi:kimi-k3',
                commits: 2,
                tokens: { input: 20, cacheWrite: 3, output: 5, cacheRead: 125 },
            },
        ])
    })

    test('marks with the same count sort by name', async () => {
        const repo = await repoWith([
            'a\n\nAssisted-by: pi:kimi-k3',
            'b\n\nAssisted-by: codex:gpt-5.6-terra',
        ])

        const { marks } = await summarize('base..HEAD', repo)

        expect(marks.map(({ mark }) => mark)).toEqual(['codex:gpt-5.6-terra', 'pi:kimi-k3'])
    })
})

describe('defaultRange', () => {
    test("covers this branch's commits not on a local main", async () => {
        const repo = await repoWith([])

        await git(['switch', '-q', '-c', 'feature'], repo)

        expect(await defaultRange(repo)).toBe('main..HEAD')
    })

    test('prefers what origin/HEAD points at', async () => {
        const repo = await repoWith([])

        await git(['update-ref', 'refs/remotes/origin/trunk', 'HEAD'], repo)
        await git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], repo)
        await git(['switch', '-q', '-c', 'feature'], repo)

        expect(await defaultRange(repo)).toBe('origin/trunk..HEAD')
    })

    test('falls back to master', async () => {
        const repo = await repoWith([])

        await git(['branch', '-m', 'main', 'master'], repo)
        await git(['switch', '-q', '-c', 'feature'], repo)

        expect(await defaultRange(repo)).toBe('master..HEAD')
    })

    test('asks for a range on the default branch itself', async () => {
        const repo = await repoWith([])

        await expect(defaultRange(repo)).rejects.toThrow('This is the default branch (main)')
    })

    test('asks for a range when there is no default branch', async () => {
        const repo = await repoWith([])

        await git(['branch', '-m', 'main', 'feature'], repo)

        await expect(defaultRange(repo)).rejects.toThrow('No default branch found')
    })
})

describe('summaryCommand', () => {
    test('prints the range, then one line per mark, then the unmarked commits', async () => {
        const repo = await repoWith([
            'one\n\nAssisted-by: pi:kimi-k3',
            ...Array.from({ length: 9 }, (_, n) => `by hand ${n}`),
        ])
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        await summaryCommand('base..HEAD', {})

        expect(log.mock.calls).toEqual([
            [['base..HEAD: 10 commits', '   1  pi:kimi-k3', '   9  no mark'].join('\n')],
        ])
    })

    test("prints a mark's cost beside its count", async () => {
        const repo = await repoWith(['one\n\nAssisted-by: pi:kimi-k3\nAssisted-cost: $1.50'])
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        await summaryCommand('base..HEAD', {})

        expect(log).toHaveBeenCalledWith('base..HEAD: 1 commit\n  1  pi:kimi-k3  ~$1.50')
    })

    test("prints a mark's tokens after its cost, with cache reads apart", async () => {
        const repo = await repoWith([
            'one\n\nAssisted-by: pi:kimi-k3\nAssisted-cost: $1.50\nAssisted-tokens: 18400 input, 96000 cache-write, 41300 output, 3120000 cache-read',
        ])
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        await summaryCommand('base..HEAD', {})

        expect(log).toHaveBeenCalledWith(
            'base..HEAD: 1 commit\n  1  pi:kimi-k3  ~$1.50  156k tokens, 3.1M cached',
        )
    })

    test("defaults to this branch's commits, and prints JSON with the range", async () => {
        const repo = await repoWith([])
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        await git(['switch', '-q', '-c', 'feature'], repo)
        await git(
            [
                '-c',
                'user.name=t',
                '-c',
                'user.email=t@t',
                'commit',
                '-q',
                '--allow-empty',
                '-m',
                'one\n\nAssisted-by: pi:kimi-k3',
            ],
            repo,
        )
        vi.spyOn(process, 'cwd').mockReturnValue(repo)
        await summaryCommand(undefined, {})
        await summaryCommand(undefined, { json: true })

        expect(log.mock.calls).toEqual([
            ['main..HEAD: 1 commit\n  1  pi:kimi-k3'],
            [
                JSON.stringify({
                    range: 'main..HEAD',
                    total: 1,
                    unmarked: 0,
                    marks: [{ mark: 'pi:kimi-k3', commits: 1 }],
                }),
            ],
        ])
    })
})

describe('summaryTable', () => {
    test('adds a cost column when any mark has a cost', () => {
        const markdown = summaryTable({
            total: 2,
            unmarked: 1,
            marks: [{ mark: 'pi:kimi-k3', commits: 1, cost: 0.5 }],
        })

        expect(markdown.split('\n')[2]).toBe('| Pi      | kimi-k3 |        | 1       | ~$0.50 |')
    })

    test('leaves the cost blank for a mark without one', () => {
        const markdown = summaryTable({
            total: 2,
            unmarked: 0,
            marks: [
                { mark: 'pi:kimi-k3', commits: 1, cost: 0.5 },
                { mark: 'pi:glm-6', commits: 1 },
            ],
        })

        expect(markdown.split('\n')[3]).toMatch(/\| glm-6 +\| +\| 1 +\| +\|$/)
    })

    test('adds token columns when any mark has tokens, blank for one without', () => {
        const markdown = summaryTable({
            total: 3,
            unmarked: 1,
            marks: [
                {
                    mark: 'pi:kimi-k3',
                    commits: 1,
                    tokens: { input: 900, cacheWrite: 0, output: 50, cacheRead: 4200 },
                },
                { mark: 'pi:glm-6', commits: 1 },
            ],
        }).split('\n')

        expect(markdown[0]).toMatch(/\| Commits \| Tokens +\| Cached +\|$/)
        expect(markdown[2]).toMatch(/\| 1 +\| 950 tokens \| 4\.2k cached \|$/)
        expect(markdown[3]).toMatch(/\| glm-6 +\| +\| 1 +\| +\| +\|$/)
        expect(markdown[4]).toMatch(/^\| No mark .*\| 1 +\| +\| +\|$/)
    })

    test('splits each mark into harness, model and effort, with unmarked commits last', () => {
        const markdown = summaryTable({
            total: 5,
            unmarked: 1,
            marks: [
                { mark: 'claude-code:claude-opus-5-5@high', commits: 3 },
                { mark: 'other-tool:some-model', commits: 1 },
            ],
        })

        expect(markdown).toBe(
            [
                '| Harness     | Model           | Effort | Commits |',
                '| ----------- | --------------- | ------ | ------- |',
                '| Claude Code | claude-opus-5-5 | high   | 3       |',
                '| other-tool  | some-model      |        | 1       |',
                '| No mark     |                 |        | 1       |',
            ].join('\n'),
        )
    })
})
