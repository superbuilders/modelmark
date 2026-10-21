import { readState, writeState } from '../system/state'
import { sessionName } from './logs'
import { COST_LINE } from './patterns'
import { readSessionUse } from './usage'

import type { Env } from '../system/types'
import type { AgentId, ModelPrice, PriceList, SessionUse, TokenUse } from './types'

/**
 * A model's id in the price list. A gateway names a model with its own prefix
 * (`anthropic-primary/claude-opus-5-5`), so only the part after the last `/`
 * counts.
 * @param model - the model as a log or a mark names it
 * @returns the id, such as `claude-opus-5-5`
 */
export function modelId(model: string): string {
    return model.slice(model.lastIndexOf('/') + 1)
}

/**
 * A model's prices.
 * @param model - the model as a log names it
 * @param prices - the price list
 * @returns its prices, or undefined when the list doesn't have it
 */
export function priceOf(model: string, prices: PriceList): ModelPrice | undefined {
    const id = modelId(model)

    return Object.hasOwn(prices, id) ? prices[id] : undefined
}

/**
 * What one reply cost. A tier's prices apply to the whole reply once its input
 * passes the tier's size, not only to the tokens past it.
 * @param use - the reply's tokens
 * @param price - its model's prices
 * @returns US dollars
 */
function replyCost(use: TokenUse, price: ModelPrice): number {
    const context = use.input + use.cacheRead + use.cacheWrite
    const rates = (price.tiers ?? []).reduce<ModelPrice>(
        (chosen, tier) => (context > tier.above ? tier : chosen),
        price,
    )

    return (
        (use.input * rates.input +
            use.cacheRead * (rates.cacheRead ?? rates.input) +
            use.cacheWrite * (rates.cacheWrite ?? rates.input) +
            use.output * rates.output) /
        1_000_000
    )
}

/**
 * What a set of replies cost at list prices.
 * @param uses - the replies
 * @param prices - the price list
 * @returns US dollars, or null when any reply's model has no price (a partial sum would read as the whole)
 */
export function usesCost(uses: TokenUse[], prices: PriceList): number | null {
    let total = 0

    for (const use of uses) {
        const price = priceOf(use.model, prices)

        if (!price) {
            return null
        }

        total += replyCost(use, price)
    }

    return total
}

/**
 * The name the point a session was counted up to is kept under.
 * @param agent - which agent
 * @param session - its session
 * @returns the state file's name
 */
function checkpointName(agent: AgentId, session: string): string {
    return `checkpoints/${agent}-${encodeURIComponent(session)}`
}

/**
 * The replies an agent's session made since its last commit: since the point
 * the last commit's cost was counted up to, or since the session started.
 * @param agent - which agent
 * @param env - the environment
 * @returns the replies, or undefined when the session's logs can't be read
 */
export function usesSinceLastCommit(agent: AgentId, env: Env): SessionUse | undefined {
    const session = sessionName(agent, env)

    if (!session) {
        return undefined
    }

    const saved = Number(readState(checkpointName(agent, session), env))

    const use = readSessionUse(agent, env, saved > 0 ? saved : undefined)

    return use && { session, ...use }
}

/**
 * Mark a session's replies as counted, so the next commit starts after them.
 * @param agent - which agent
 * @param use - the replies just counted
 * @param env - the environment
 */
export function markCounted(agent: AgentId, use: SessionUse, env: Env): void {
    if (use.through !== undefined) {
        writeState(checkpointName(agent, use.session), String(use.through), env)
    }
}

/**
 * The sum of every cost line in a commit message.
 * @param message - the message
 * @returns US dollars, or undefined when it has no cost line
 */
export function messageCost(message: string): number | undefined {
    const costs = Array.from(message.matchAll(COST_LINE), ([, value]) => Number(value))

    return costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) : undefined
}

/**
 * A cost as the trailer writes it: dollars and cents, or four places under a
 * cent so a cheap commit's cost still adds up in a summary.
 * @param usd - US dollars
 * @returns `$1.84`, or `$0.0031`
 */
export function costValue(usd: number): string {
    return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`
}
