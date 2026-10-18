import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { git } from '../../system/command'
import { defaultRange, summarize, summaryCommand, summaryMarkdown } from './summary'

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

describe('summaryMarkdown', () => {
    test('splits each mark into harness, model and effort, with unmarked commits last', () => {
        const markdown = summaryMarkdown('origin/main..HEAD', {
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
                '',
                '5 commits in `origin/main..HEAD`',
            ].join('\n'),
        )
    })
})
