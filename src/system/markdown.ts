/**
 * One Markdown table row, its cells padded to their column's width.
 * @param cells - the row's cells; a short row gets empty ones
 * @param widths - each column's width
 * @returns the row
 */
function tableRow(cells: string[], widths: number[]): string {
    return `| ${widths.map((width, column) => (cells[column] ?? '').padEnd(width)).join(' | ')} |`
}

/**
 * A Markdown table laid out as the formatter lays it out, so it reads in plain text too.
 * @param header - the header row
 * @param body - the body rows
 * @returns the table, one line per row
 */
export function markdownTable(header: string[], body: string[][]): string {
    const rows = [header, ...body]
    const widths = header.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0)))

    return [
        tableRow(header, widths),
        tableRow(
            widths.map(width => '-'.repeat(width)),
            widths,
        ),
        ...body.map(row => tableRow(row, widths)),
    ].join('\n')
}
