import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { COST_TRAILER_KEY, PRICE_REFRESH_STATE } from '../../agents/constants'
import {
    costValue,
    markCounted,
    messageCost,
    usesCost,
    usesSinceLastCommit,
} from '../../agents/cost'
import { detect, markTrailer } from '../../agents/mark'
import { loadPriceList, priceRefreshDue } from '../../agents/prices'
import { git } from '../../system/command'
import { writeState } from '../../system/state'
import { SKIPPED_SOURCES } from './constants'

import type { AgentId, Detection, PriceList } from '../../agents/types'
import type { Env } from '../../system/types'

/**
 * Append the agent's trailer to a commit message file.
 *
 * An amend that another agent (or model) continues gets a second trailer;
 * repeating the same one adds nothing.
 * @param messageFile - the message file git passes to prepare-commit-msg
 * @param detection - the agent and model, or null for a person's own commit
 * @returns the trailer added, or null when the commit gets none
 */
export async function markMessage(
    messageFile: string,
    detection: Detection | null,
): Promise<string | null> {
    if (!detection) {
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
 * Start a price refresh in the background when one is due, and note that it
 * started, so the next commits don't start another. The commit doesn't wait.
 * @param env - the environment
 */
function refreshPricesIfDue(env: Env = process.env): void {
    if (!priceRefreshDue(env)) {
        return
    }

    writeState(PRICE_REFRESH_STATE, String(Date.now()), env)
    spawn(
        process.execPath,
        [fileURLToPath(new URL('../../cli.ts', import.meta.url)), 'refresh-prices'],
        { detached: true, stdio: 'ignore', env },
    ).unref()
}

/**
 * Add the estimated cost of the agent's replies since its last commit to a
 * commit message file. An amend adds the new replies to the cost already
 * there. The replies count as used even when their models have no price, so
 * no later commit counts them again. Then the prices are refreshed in the
 * background when they are due.
 * @param messageFile - the message file git passes to prepare-commit-msg
 * @param agent - the agent making the commit
 * @param env - the environment (default: this process's)
 * @param prices - the price list (default: the shipped one, updated from the cache, read only when there are replies to price)
 * @param refresh - starts a price refresh if one is due
 * @returns the trailer written, or null when the commit gets none
 */
export async function costMessage(
    messageFile: string,
    agent: AgentId,
    env: Env = process.env,
    prices?: PriceList,
    refresh: () => void = () => refreshPricesIfDue(env),
): Promise<string | null> {
    const use = usesSinceLastCommit(agent, env)

    if (!use) {
        return null
    }

    const usd = use.uses.length > 0 ? usesCost(use.uses, prices ?? loadPriceList(env)) : 0
    let trailer: string | null = null

    /*
     * An amend with no new replies keeps the cost it has.
     */
    if (use.uses.length > 0 && usd !== null) {
        const total = (messageCost(readFileSync(messageFile, 'utf8')) ?? 0) + usd

        trailer = `${COST_TRAILER_KEY}: ${costValue(total)}`

        await git([
            'interpret-trailers',
            '--in-place',
            '--if-exists',
            'replace',
            '--trailer',
            trailer,
            messageFile,
        ])
    }

    markCounted(agent, use, env)
    refresh()

    return trailer
}

/**
 * The prepare-commit-msg hook: the mark, then the cost. A merge is skipped
 * before anything is looked up, and the hook never fails the commit: a
 * problem prints a warning and the commit goes ahead without what failed.
 * @param messageFile - the message file git passes
 * @param source - the message's source git passes, such as `merge`
 */
export async function hookCommand(messageFile: string, source?: string): Promise<void> {
    if (source && SKIPPED_SOURCES.includes(source)) {
        return
    }

    let detection: Detection | null

    try {
        detection = await detect()
        await markMessage(messageFile, detection)
    } catch (error) {
        console.error(`modelmark: commit left unmarked (${String(error)})`)

        return
    }

    /*
     * A declared mark comes from an agent modelmark can't read the logs of.
     */
    if (!detection || detection.via === 'declared') {
        return
    }

    try {
        await costMessage(messageFile, detection.agent as AgentId)
    } catch (error) {
        console.error(`modelmark: commit left without a cost (${String(error)})`)
    }
}
