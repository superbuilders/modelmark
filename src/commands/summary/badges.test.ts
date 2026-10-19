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
