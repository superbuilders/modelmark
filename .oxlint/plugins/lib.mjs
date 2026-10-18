/**
 * The whitespace indent of the line a node starts on, or null when code
 * precedes it on that line (a trailing comment, a second statement).
 *
 * @param {string} text - The whole source text.
 * @param {number} start - Source offset of the node.
 * @returns {string | null} The indent string, or null.
 */
export function ownLineIndent(text, start) {
    let index = start

    while (index > 0 && text[index - 1] !== '\n') {
        index -= 1
    }

    const prefix = text.slice(index, start)

    return /^[ \t]*$/.test(prefix) ? prefix : null
}
