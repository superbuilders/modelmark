/**
 * A count of commits, in words.
 * @param count - how many
 * @returns `1 commit` or `N commits`
 */
export function commitsText(count: number): string {
    return count === 1 ? '1 commit' : `${count} commits`
}

/**
 * An estimated cost, in words.
 * @param usd - US dollars
 * @returns `~$1.84`
 */
export function costText(usd: number): string {
    return `~$${usd.toFixed(2)}`
}
