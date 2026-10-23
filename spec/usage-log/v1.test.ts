import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, test } from 'vitest'

import schema from './v1.schema.json'

/**
 * A reply line's token members, as v1.md section 4.3 defines them.
 */
interface ReplyTokens {
    /** Every input token. */
    input: number
    /** The part of input read from a cache. */
    cacheRead: number
    /** The part of input written to a cache. */
    cacheWrite: number
    /** cacheWrite split by lifetime. */
    cacheWriteByTtl?: Record<string, number>
    /** Every output token. */
    output: number
}

/**
 * What a conforming reader gets from one file.
 */
interface Case {
    /** The file, under `conformance/`. */
    file: string
    /** Whether every line follows the spec. */
    conforms: boolean
    /** Whether a reader reads the file at all. */
    accepted: boolean
    /** The header's session, for an accepted file. */
    session?: string
    /** How many reply lines a reader keeps. */
    replies?: number
    /** Those replies' totals. */
    tokens?: Omit<ReplyTokens, 'cacheWriteByTtl'> & {
        fresh: number
        cacheWriteByTtl: Record<string, number>
    }
}

/**
 * A provider's usage beside the reply line a writer makes from it.
 */
interface ProviderCase {
    /** Which API the usage came from: a key of `CONVERSIONS`. */
    api: string
    /** The API's `usage` (or `usageMetadata`) object, as it returns it. */
    usage: Record<string, unknown>
    /** The reply line's token members. */
    line: ReplyTokens
}

const CONFORMANCE = join(import.meta.dirname, 'conformance')
const ajv = new Ajv2020({ allErrors: true })

ajv.addSchema(schema)

const isHeader = ajv.compile({ $ref: `${schema.$id}#/$defs/header` })
const isReplyShape = ajv.compile<ReplyTokens>({ $ref: `${schema.$id}#/$defs/reply` })

/**
 * Whether a value is a reply line: the schema's shape, and the two sums of v1.md section 6.2.
 * @param value - a parsed line
 * @returns true for a reply a reader keeps
 */
function isReply(value: unknown): value is ReplyTokens {
    if (!isReplyShape(value)) {
        return false
    }

    const ttlSum = Object.values(value.cacheWriteByTtl ?? {}).reduce((sum, n) => sum + n, 0)

    return (
        value.cacheRead + value.cacheWrite <= value.input &&
        (value.cacheWriteByTtl === undefined || ttlSum === value.cacheWrite)
    )
}

/**
 * Parse one line, as a reader does: anything that isn't JSON reads as nothing.
 * @param line - the line, without its line ending
 * @returns the parsed value, or undefined
 */
function parsed(line: string): unknown {
    try {
        return JSON.parse(line)
    } catch {
        return undefined
    }
}

/**
 * Read a usage log the way v1.md's section 6 says.
 * @param text - the file's content
 * @returns whether every line conforms, and the header and kept replies of an accepted file
 */
function readLog(text: string): { conforms: boolean; header: unknown; replies: ReplyTokens[] } {
    const [first, ...rest] = text
        .split('\n')
        .map(line => line.replace(/\r$/, ''))
        .filter(line => line !== '')
        .map(parsed)
    const header = isHeader(first) ? first : undefined
    const replies = header ? rest.filter(isReply) : []

    return { conforms: header !== undefined && replies.length === rest.length, header, replies }
}

/**
 * Add up replies' tokens, with the fresh input section 5.1 derives.
 * @param replies - the kept replies
 * @returns their totals, lifetimes summed per label
 */
function totals(replies: ReplyTokens[]): Case['tokens'] {
    const sum = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
    const cacheWriteByTtl: Record<string, number> = {}

    for (const reply of replies) {
        sum.input += reply.input
        sum.cacheRead += reply.cacheRead
        sum.cacheWrite += reply.cacheWrite
        sum.output += reply.output

        for (const [ttl, n] of Object.entries(reply.cacheWriteByTtl ?? {})) {
            cacheWriteByTtl[ttl] = (cacheWriteByTtl[ttl] ?? 0) + n
        }
    }

    return { ...sum, fresh: sum.input - sum.cacheRead - sum.cacheWrite, cacheWriteByTtl }
}

/**
 * A number at a path in an API's usage object, 0 when absent.
 * @param usage - the usage object
 * @param path - the keys to follow
 * @returns the count
 */
function count(usage: Record<string, unknown>, ...path: string[]): number {
    let value: unknown = usage

    for (const key of path) {
        value = (value as Record<string, unknown> | undefined)?.[key]
    }

    return typeof value === 'number' ? value : 0
}

/**
 * A reply's cache writes by lifetime, when the provider breaks them down.
 * @param details - the provider's breakdown object, if it sent one
 * @param keys - its count's key for each lifetime label
 * @returns `cacheWriteByTtl`, or nothing when there is no breakdown
 */
function ttlSplit(
    details: unknown,
    keys: Record<string, string>,
): Pick<ReplyTokens, 'cacheWriteByTtl'> {
    if (typeof details !== 'object' || details === null) {
        return {}
    }

    return {
        cacheWriteByTtl: Object.fromEntries(
            Object.entries(keys).map(([ttl, key]) => [
                ttl,
                count(details as Record<string, unknown>, key),
            ]),
        ),
    }
}

/** Appendix A's conversions, by the API a provider case names. */
const CONVERSIONS: Record<string, (usage: Record<string, unknown>) => ReplyTokens> = {
    'anthropic-messages': usage => ({
        input:
            count(usage, 'input_tokens') +
            count(usage, 'cache_read_input_tokens') +
            count(usage, 'cache_creation_input_tokens'),
        cacheRead: count(usage, 'cache_read_input_tokens'),
        cacheWrite: count(usage, 'cache_creation_input_tokens'),
        ...ttlSplit(usage.cache_creation, {
            '5m': 'ephemeral_5m_input_tokens',
            '1h': 'ephemeral_1h_input_tokens',
        }),
        output: count(usage, 'output_tokens'),
    }),
    'openai-responses': usage => ({
        input: count(usage, 'input_tokens'),
        cacheRead: count(usage, 'input_tokens_details', 'cached_tokens'),
        cacheWrite: count(usage, 'input_tokens_details', 'cache_write_tokens'),
        ...ttlSplit(
            (usage.input_tokens_details as Record<string, unknown> | undefined)
                ?.cache_write_tokens_details,
            { '30m': 'ttl_30m_tokens', '12h': 'ttl_12h_tokens' },
        ),
        output: count(usage, 'output_tokens'),
    }),
    'openai-chat-completions': usage => ({
        input: count(usage, 'prompt_tokens'),
        cacheRead: count(usage, 'prompt_tokens_details', 'cached_tokens'),
        cacheWrite: 0,
        output: count(usage, 'completion_tokens'),
    }),
    'google-gemini': usage => ({
        input: count(usage, 'promptTokenCount') + count(usage, 'toolUsePromptTokenCount'),
        cacheRead: count(usage, 'cachedContentTokenCount'),
        cacheWrite: 0,
        output: count(usage, 'candidatesTokenCount') + count(usage, 'thoughtsTokenCount'),
    }),
}

const { cases } = JSON.parse(readFileSync(join(CONFORMANCE, 'cases.json'), 'utf8')) as {
    cases: Case[]
}
const providerFiles = readdirSync(join(CONFORMANCE, 'providers'))

describe('usage log v1: reading', () => {
    test.each(cases)('$file', ({ file, conforms, accepted, session, replies, tokens }) => {
        const read = readLog(readFileSync(join(CONFORMANCE, file), 'utf8'))

        expect(read.conforms).toBe(conforms)
        expect(read.header !== undefined).toBe(accepted)

        if (accepted) {
            expect(read.header).toMatchObject({ session })
            expect(read.replies).toHaveLength(replies ?? -1)
            expect(totals(read.replies)).toEqual(tokens)
        }
    })

    test('the header and a reply are told apart by their members alone', () => {
        expect(ajv.validate(schema.$id, { modelmark: 'usage', version: 1, session: 's' })).toBe(
            true,
        )
        expect(isReplyShape({ modelmark: 'usage', version: 1, session: 's' })).toBe(false)
    })
})

describe('usage log v1: converting provider usage (appendix A)', () => {
    test.each(providerFiles)('%s', file => {
        const { api, usage, line } = JSON.parse(
            readFileSync(join(CONFORMANCE, 'providers', file), 'utf8'),
        ) as ProviderCase

        expect(api in CONVERSIONS, `appendix A has no conversion for ${api}`).toBe(true)
        expect(CONVERSIONS[api](usage)).toEqual(line)
        expect(isReply({ at: '2026-10-23T17:00:00Z', model: 'm', cwd: '/w', ...line })).toBe(true)
    })
})
