/**
 * A count of commits, in words.
 * @param count - how many
 * @returns `1 commit` or `N commits`
 */
export function commitsText(count: number): string {
    return count === 1 ? '1 commit' : `${count} commits`
}
