import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { addTokens } from '../trailers/tokens'
import { usageLog, usageLogReplies } from './usage-log'

/*
 * The spec's conformance cases, read by the real reader: the files a reader
 * must accept or reject, and the tokens it must get from each.
 */

/** The spec's conformance folder. */
const CONFORMANCE = join(import.meta.dirname, '..', '..', 'spec', 'usage-log', 'conformance')

/**
 * One conformance case, as `cases.json` gives it.
 */
interface Case {
    /** The file, under the conformance folder. */
    file: string
    /** Whether a reader reads the file at all. */
    accepted: boolean
    /** The header's session, for an accepted file. */
    session?: string
    /** How many replies a reader keeps. */
    replies?: number
    /** Their totals, input counting every input token. */
    tokens?: {
        input: number
        cacheRead: number
        cacheWrite: number
        output: number
        fresh: number
        cacheWriteByTtl: Record<string, number>
    }
}

const { cases } = JSON.parse(readFileSync(join(CONFORMANCE, 'cases.json'), 'utf8')) as {
    cases: Case[]
}

describe('the spec conformance cases', () => {
    test.each(cases)('$file', ({ file, accepted, session, replies, tokens }) => {
        const path = join(CONFORMANCE, file)
        const log = usageLog({ MODELMARK_USAGE: path })

        expect(log).toEqual(accepted ? { path, session } : undefined)

        if (!log) {
            return
        }

        const uses = [...usageLogReplies(log.path)].map(reply => reply.use)
        const sum = addTokens(uses)
        const cacheWriteByTtl: Record<string, number> = {}

        for (const use of uses) {
            for (const [ttl, n] of Object.entries(use.cacheWriteByTtl ?? {})) {
                cacheWriteByTtl[ttl] = (cacheWriteByTtl[ttl] ?? 0) + n
            }
        }

        expect(uses).toHaveLength(replies ?? -1)
        expect({
            ...sum,
            input: sum.input + sum.cacheRead + sum.cacheWrite,
            fresh: sum.input,
            cacheWriteByTtl,
        }).toEqual(tokens)
    })
})

describe('finding the log', () => {
    test('no variable, a relative path, or a missing file is no log', () => {
        expect(usageLog({})).toBeUndefined()
        expect(
            usageLog({ MODELMARK_USAGE: 'spec/usage-log/conformance/accepted/minimal.jsonl' }),
        ).toBeUndefined()
        expect(usageLog({ MODELMARK_USAGE: join(CONFORMANCE, 'missing.jsonl') })).toBeUndefined()
    })

    test('only a regular file is read, since a pipe would hold up the commit', () => {
        expect(usageLog({ MODELMARK_USAGE: '/dev/zero' })).toBeUndefined()
    })
})
