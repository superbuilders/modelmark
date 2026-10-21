import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { commitAttempt, markCounted, usesSinceLastCommit } from '../../agents/checkpoints'
import { detect } from '../../agents/detect'
import { usesCost } from '../../pricing/cost'
import { claimPriceRefresh, loadPriceList } from '../../pricing/prices'
import { hookDisabled } from '../../setup/hooks'
import { costTrailer } from '../../trailers/cost'
import { markTrailer } from '../../trailers/mark'
import { messageCost, writeTrailer } from '../../trailers/message'
import { SKIPPED_SOURCES } from './constants'

import type { Detection, FoundAgent, ModelUse } from '../../agents/types'
import type { PriceList } from '../../pricing/types'
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

    await writeTrailer(messageFile, trailer, 'addIfDifferent')

    return trailer
}

/**
 * Start a price refresh in the background when one is due, and note that it
 * started, so the next commits don't start another. The commit doesn't wait.
 * @param env - the environment
 */
function refreshPricesIfDue(env: Env = process.env): void {
    if (!claimPriceRefresh(env)) {
        return
    }

    /*
     * update-notifier's recipe: detached, output ignored, unreferenced, so the
     * hook exits without waiting. A child that can't start emits `error`,
     * which would otherwise crash the hook after the commit was marked.
     */
    spawn(
        process.execPath,
        [fileURLToPath(new URL('../../cli.ts', import.meta.url)), 'refresh-prices'],
        { detached: true, stdio: 'ignore', env },
    )
        .on('error', () => undefined)
        .unref()
}

/**
 * Add the estimated cost of the agent's replies in this repository since its
 * last commit here to a commit message file. An amend adds the new replies to the cost already
 * there. The replies count as used even when their models have no price, so
 * no later commit counts them again. Then the prices are refreshed in the
 * background when they are due.
 * @param messageFile - the message file git passes to prepare-commit-msg
 * @param detection - the agent making the commit, and its model
 * @param env - the environment (default: this process's)
 * @param prices - the price list (default: the shipped one, updated from the cache, read only when there are replies to price)
 * @param refresh - starts a price refresh if one is due
 * @returns the trailer written, or null when the commit gets none
 */
export async function costMessage(
    messageFile: string,
    detection: FoundAgent & ModelUse,
    env: Env = process.env,
    prices?: PriceList,
    refresh: () => void = () => refreshPricesIfDue(env),
): Promise<string | null> {
    const { agent } = detection
    const attempt = await commitAttempt(markTrailer(detection))
    const use = attempt && (await usesSinceLastCommit(agent, env, attempt.root))

    if (!attempt || !use) {
        return null
    }

    const usd = use.uses.length > 0 ? usesCost(use.uses, prices ?? loadPriceList(env)) : 0
    let trailer: string | null = null

    /*
     * An amend with no new replies keeps the cost it has.
     */
    if (use.uses.length > 0 && usd !== null) {
        const total = (messageCost(readFileSync(messageFile, 'utf8')) ?? 0) + usd

        trailer = costTrailer(total)

        await writeTrailer(messageFile, trailer, 'replace')
    }

    markCounted(agent, use, attempt, env)
    refresh()

    return trailer
}

/**
 * The prepare-commit-msg hook: the mark, then the cost. A merge, or a commit
 * made with `MODELMARK_DISABLE` set, is skipped before anything is looked up,
 * so its replies count toward the next commit. The hook never fails the
 * commit: a problem prints a warning and the commit goes ahead without what
 * failed.
 * @param messageFile - the message file git passes
 * @param source - the message's source git passes, such as `merge`
 * @param env - the environment
 */
export async function hookCommand(
    messageFile: string,
    source?: string,
    env = process.env,
): Promise<void> {
    if ((source && SKIPPED_SOURCES.includes(source)) || hookDisabled(env)) {
        return
    }

    let detection: Detection | null

    try {
        detection = await detect(env)
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
        await costMessage(messageFile, detection, env)
    } catch (error) {
        console.error(`modelmark: commit left without a cost (${String(error)})`)
    }
}
