import { detect, markTrailer } from '../../agents/mark'
import { git } from '../../system/command'
import { SKIPPED_SOURCES } from './constants'

import type { Detection } from '../../agents/types'

/**
 * Append the agent's trailer to a commit message file.
 *
 * An amend that another agent (or model) continues gets a second trailer;
 * repeating the same one adds nothing.
 * @param messageFile - the message file git passes to prepare-commit-msg
 * @param source - the message's source git passes, such as `merge`
 * @param detection - the agent and model, or null for a person's own commit
 * @returns the trailer added, or null when the commit gets none
 */
export async function markMessage(
    messageFile: string,
    source: string | undefined,
    detection: Detection | null,
): Promise<string | null> {
    if (!detection || (source && SKIPPED_SOURCES.includes(source))) {
        return null
    }

    const trailer = markTrailer(detection)

    await git([
        'interpret-trailers',
        '--in-place',
        '--if-exists',
        'addIfDifferent',
        '--trailer',
        trailer,
        messageFile,
    ])

    return trailer
}

/**
 * The prepare-commit-msg hook. It never fails the commit: a problem prints a
 * warning and the commit goes ahead unmarked.
 * @param messageFile - the message file git passes
 * @param source - the message's source git passes
 */
export async function hookCommand(messageFile: string, source?: string): Promise<void> {
    try {
        await markMessage(messageFile, source, await detect())
    } catch (error) {
        console.error(`modelmark: commit left unmarked (${String(error)})`)
    }
}
