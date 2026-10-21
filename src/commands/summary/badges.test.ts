import { describe, expect, test } from 'vitest'

import { summaryBadges } from './badges'

/**
 * Each badge's pieces as their alt text, a line per badge.
 * @param html - the badges
 * @returns the alt texts
 */
function altTexts(html: string): string[][] {
    return html
        .split('<br>\n')
        .map(line => [...line.matchAll(/alt="([^"]*)"/g)].map(([, alt]) => alt ?? ''))
}

describe('summaryBadges', () => {
    test('draws a badge per mark, then one for commits with no mark', () => {
        const html = summaryBadges({
            total: 6,
            unmarked: 1,
            marks: [
                { mark: 'claude-code:claude-opus-5-5@high', commits: 3 },
                { mark: 'other-tool:some-model', commits: 1 },
                { mark: 'pi:kimi-k3', commits: 1 },
            ],
        })

        expect(altTexts(html)).toEqual([
            ['Claude Code', 'claude-opus-5-5', 'high', '3 commits'],
            ['other-tool', 'some-model', '1 commit'],
            ['Pi', 'kimi-k3', '1 commit'],
            ['No mark', '1 commit'],
        ])
    })

    test('draws nothing when no commit has a mark', () => {
        expect(summaryBadges({ total: 2, unmarked: 2, marks: [] })).toBe('')
    })

    test('draws an agent it was given a color and a logo for, with a darker effort', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
        const html = summaryBadges(
            { total: 2, unmarked: 0, marks: [{ mark: 'jojo:claude-opus-5-5@medium', commits: 2 }] },
            { color: { jojo: 'E73A2C' }, logo: { jojo: svg } },
        )
        const urls = [...html.matchAll(/src="([^"]*)"/g)].map(([, src]) => new URL(src ?? ''))
        const paths = urls.map(url => url.pathname)

        expect(paths).toEqual([
            '/badge/jojo-30363D',
            '/badge/claude--opus--5--5-E73A2C',
            '/badge/medium-AD2C21',
            '/badge/2_commits-30363D',
        ])
        expect(urls[0]?.searchParams.get('logo')).toBe(
            `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        )
    })

    test('ends a badge with its cost when its commits have one', () => {
        const html = summaryBadges({
            total: 1,
            unmarked: 0,
            marks: [{ mark: 'pi:kimi-k3', commits: 1, cost: 4.2 }],
        })
        const paths = [...html.matchAll(/src="([^"]*)"/g)].map(
            ([, src]) => new URL(src ?? '').pathname,
        )

        expect(paths.at(-1)).toBe('/badge/~%244.20-57606A')
    })

    test('shows its tokens before its cost, with what was read from cache on hover', () => {
        const html = summaryBadges({
            total: 1,
            unmarked: 0,
            marks: [
                {
                    mark: 'pi:kimi-k3',
                    commits: 1,
                    cost: 4.2,
                    tokens: {
                        input: 18_400,
                        cacheWrite: 96_000,
                        output: 41_300,
                        cacheRead: 3_120_000,
                    },
                },
            ],
        })

        expect(altTexts(html)[0]?.slice(-2)).toEqual(['156k tokens', '~$4.20'])
        expect(html).toContain('title="156k new tokens, plus 3.1M read from cache"')
    })

    test("escapes shields.io's separators and gives each harness its logo", () => {
        const html = summaryBadges({
            total: 2,
            unmarked: 0,
            marks: [
                { mark: 'claude-code:claude-opus-5-5', commits: 1 },
                { mark: 'codex:gpt-5.6-terra', commits: 1 },
            ],
        })
        const urls = [...html.matchAll(/src="([^"]*)"/g)].map(([, src]) => new URL(src ?? ''))

        expect(urls[0]?.pathname).toBe('/badge/Claude_Code-30363D')
        expect(urls[0]?.searchParams.get('logo')).toBe('claude')
        expect(urls[1]?.pathname).toBe('/badge/claude--opus--5--5-D97757')
        expect(urls[3]?.searchParams.get('logo')).toMatch(/^data:image\/svg\+xml;base64,/)
        expect(urls[4]?.pathname).toBe('/badge/gpt--5.6--terra-10A37F')
    })
})
