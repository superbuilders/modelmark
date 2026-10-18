import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { readProcessTable } from '../../../src/system/processes'
import { findLast } from '../../../src/system/tail'
import {
    AGENT_TIMEOUT_MS,
    LAB_ROOT,
    PROBE_ARGS_LIMIT,
    PROBE_DEPTH,
    PROBE_FILE_LIMIT,
    PROBE_RECORD_COUNT,
    PROBE_REPORT,
    PROBE_SKIPPED_FOLDERS,
} from './constants'
import { runPrompt } from './harnesses'
import { shellQuote, spawn, tail } from './process'

import type { Dirent } from 'node:fs'

/**
 * What the probe command sees from inside the agent.
 */
interface ProbeReport {
    /** The processes from the probe command up to the top, nearest first. */
    chain: { pid: number; args: string }[]
    /** Every environment variable name the agent's command had. */
    env: string[]
}

/**
 * A file the agent wrote during the probe.
 */
interface WrittenFile {
    /** The file. */
    path: string
    /** Its size in bytes. */
    bytes: number
    /** The shape of its last records, for JSON lines files. */
    records: string[]
}

/**
 * Everything a probe found.
 */
export interface ProbeResult extends ProbeReport {
    /** Variable names the agent added: in its command's environment, not the lab's. */
    added: string[]
    /** Files under the home folder written during the run that hold its prompt (the agent's own records), newest first. */
    files: WrittenFile[]
    /** How many other files other programs wrote meanwhile. */
    others: number
}

/** Placed in a probe's agent command where the prompt goes; without it the prompt goes last. */
const PROMPT_SLOT = '{prompt}'

/** Arguments after one of these flags, or in `NAME=value` form with such a name, are hidden. */
const SECRET_NAME = /key|token|secret|passw|auth|credential|cookie/i

/** Keys whose short values a probe shows, because they name the model or effort: model, modelId, thinkingLevel, reasoning_effort. */
const SHOWN_VALUE = /(model|modelid|effort|level)$/i

/** Files larger than this are not searched for the probe's prompt. */
const SEARCH_LIMIT_BYTES = 64 * 1024 * 1024

/**
 * Hide secret-looking values in a command line, then cut it to length.
 * @param args - the command line
 * @returns it, safe to print
 */
export function redact(args: string): string {
    const words = args.split(' ')
    const safe = words.map((word, index) => {
        const [name, value] = word.split('=', 2)

        if (value !== undefined && SECRET_NAME.test(name ?? '')) {
            return `${name}=…`
        }

        const previous = index > 0 ? (words[index - 1] ?? '') : ''

        return previous.startsWith('-') && SECRET_NAME.test(previous) ? '…' : word
    })

    return safe.join(' ').slice(0, PROBE_ARGS_LIMIT)
}

/**
 * Write what this process sees: its process chain and its variables' names, never their values.
 * Runs inside the agent being probed.
 * @param path - where to write the report
 */
export async function writeProbeReport(path: string): Promise<void> {
    const table = await readProcessTable()
    const chain: ProbeReport['chain'] = []

    for (let pid = process.pid; pid > 1 && chain.length < 64; ) {
        const info = table?.get(pid)

        if (!info) {
            break
        }

        chain.push({ pid, args: redact(info.args) })
        pid = info.ppid
    }

    const report: ProbeReport = { chain, env: Object.keys(process.env).toSorted() }

    await writeFile(path, JSON.stringify(report, null, 2))
}

/**
 * The key paths of a parsed record, with values shown only for model and effort keys.
 * @param value - the record or a value inside it
 * @param prefix - the path so far
 * @param paths - where to collect the paths
 * @returns the paths
 */
export function keyPaths(value: unknown, prefix = '', paths: string[] = []): string[] {
    if (Array.isArray(value)) {
        return keyPaths(value[0], `${prefix}[]`, paths)
    }

    if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
            keyPaths(inner, prefix ? `${prefix}.${key}` : key, paths)
        }

        return paths
    }

    const key = prefix.slice(prefix.lastIndexOf('.') + 1)
    const shown =
        typeof value === 'string' && value.length <= 60 && (key === 'type' || SHOWN_VALUE.test(key))

    paths.push(shown ? `${prefix}=${value}` : prefix)

    return paths
}

/**
 * The shape of a JSON lines file's last few records.
 * @param path - the file
 * @returns one line per record, oldest first: its key paths
 */
function lastRecords(path: string): string[] {
    const records: string[] = []

    findLast(path, record => {
        if (record !== undefined) {
            records.push(keyPaths(record).slice(0, 40).join(', '))
        }

        return records.length === PROBE_RECORD_COUNT ? true : undefined
    })

    return records.toReversed()
}

/**
 * Files under a folder written since a time, skipping caches and package stores.
 * @param folder - where to look
 * @param since - epoch milliseconds
 * @param depth - how many folder levels to go down
 * @param skip - a folder to leave out (the probe's own)
 * @returns the files and their sizes
 */
async function writtenSince(
    folder: string,
    since: number,
    depth: number,
    skip: string,
): Promise<{ path: string; bytes: number; mtime: number }[]> {
    let entries: Dirent[]

    try {
        entries = await readdir(folder, { withFileTypes: true })
    } catch {
        return []
    }

    const found = await Promise.all(
        entries.map(async entry => {
            const path = join(folder, entry.name)

            if (entry.isDirectory()) {
                return depth > 0 && path !== skip && !PROBE_SKIPPED_FOLDERS.includes(entry.name)
                    ? writtenSince(path, since, depth - 1, skip)
                    : []
            }

            if (!entry.isFile()) {
                return []
            }

            const info = await stat(path).catch(() => null)

            return info && info.mtimeMs >= since
                ? [{ path, bytes: info.size, mtime: info.mtimeMs }]
                : []
        }),
    )

    return found.flat()
}

/**
 * Whether a file holds the probe's prompt, which marks it as the agent's own record of the run.
 * @param path - the file
 * @param bytes - its size
 * @param marker - text unique to this probe (its folder's name, which the prompt contains)
 * @returns true when the file contains the marker
 */
async function holdsPrompt(path: string, bytes: number, marker: string): Promise<boolean> {
    if (bytes > SEARCH_LIMIT_BYTES) {
        return false
    }

    try {
        const text = await readFile(path, 'utf8')

        return text.includes(marker)
    } catch {
        return false
    }
}

/**
 * Run an agent once, have it run the probe command, and gather what it shows
 * about the agent: its process chain, the variables it adds and the files it writes.
 * @param argv - the agent's command; `{prompt}` marks where the prompt goes, else it goes last
 * @param checkout - this repository
 * @returns what the probe found
 */
export async function probe(argv: string[], checkout: string): Promise<ProbeResult> {
    const root = join(LAB_ROOT, 'probes', `${Date.now()}-${process.pid}`)
    const report = join(root, PROBE_REPORT)
    const command = [
        process.execPath,
        join(checkout, 'scripts/lab/index.ts'),
        'probe-report',
        report,
    ]
        .map(arg => shellQuote(arg))
        .join(' ')
    const prompt = runPrompt(command)
    const agent = argv.includes(PROMPT_SLOT)
        ? argv.map(arg => (arg === PROMPT_SLOT ? prompt : arg))
        : [...argv, prompt]
    const since = Date.now() - 1000

    await mkdir(root, { recursive: true, mode: 0o700 })
    await spawn(['git', 'init', '-q'], { cwd: root })

    const result = await spawn(agent, { cwd: root, timeoutMs: AGENT_TIMEOUT_MS })
    let seen: ProbeReport

    try {
        seen = JSON.parse(await readFile(report, 'utf8')) as ProbeReport
    } catch {
        throw new Error(
            `The agent never ran the probe command (exit ${result.exitCode}): ${tail(result.stdout + result.stderr)}`,
        )
    }

    const written = await writtenSince(homedir(), since, PROBE_DEPTH, root)
    const theirs = await Promise.all(
        written.map(file => holdsPrompt(file.path, file.bytes, basename(root))),
    )
    const agentFiles = written
        .filter((_, index) => theirs[index])
        .toSorted((a, b) => b.mtime - a.mtime)
        .slice(0, PROBE_FILE_LIMIT)
    const files = agentFiles.map(file => ({
        path: file.path,
        bytes: file.bytes,
        records: file.path.endsWith('.jsonl') ? lastRecords(file.path) : [],
    }))

    return {
        ...seen,
        added: seen.env.filter(name => !(name in process.env)),
        files,
        others: written.length - theirs.filter(Boolean).length,
    }
}

/**
 * A probe's findings as text.
 * @param result - what the probe found
 * @returns the report
 */
export function probeText(result: ProbeResult): string {
    const lines = ['Process chain, from the probe command up:']

    lines.push(...result.chain.map(({ pid, args }) => `  ${pid}  ${args}`))
    lines.push('', 'Variables the agent added (names only):')
    lines.push(...(result.added.length ? result.added.map(name => `  ${name}`) : ['  none']))
    lines.push(
        '',
        "The agent's own files: written during the run and holding its prompt, newest first:",
    )

    for (const file of result.files) {
        lines.push(`  ${file.path} (${file.bytes} bytes)`)
        lines.push(...file.records.map(record => `    ${record}`))
    }

    if (result.files.length === 0) {
        lines.push('  none')
    }

    lines.push(
        '',
        `Other programs wrote ${result.others} more files meanwhile; those are left out.`,
    )

    return lines.join('\n')
}
