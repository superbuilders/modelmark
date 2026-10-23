import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { absolutePaths } from '../system/repos'
import { markCounted, usesSinceLastCommit } from './checkpoints'

import type { UseSource } from './types'

/*
 * Which commits pay for which replies, when one session works across several
 * repositories. Each scenario is a session's replies and commits, played
 * through each harness's own log format and the usage log. Reply n writes 2^n output tokens, so
 * the set of replies a commit counted reads back from its outputs.
 */

/**
 * The folders a scenario works in:
 * A and B, two repositories;
 * W, a worktree checked out inside A;
 * N, a folder in no repository;
 * L, a symlink to B.
 * B sits in the home folder, so `~/b` names it too.
 */
type Folder = 'A' | 'B' | 'W' | 'N' | 'L'

/**
 * One tool call: a shell command (run from another folder when `from` names
 * one), or an edit of a file. `{A}` and the other folder names stand for
 * their paths.
 */
type Call = { shell: string; from?: Folder } | { edit: string }

/**
 * One reply: the folder the agent was in, and the tools it called.
 */
interface Reply {
    /** The agent's working folder. */
    in: Folder
    /** Its tool calls. */
    calls?: Call[]
}

/**
 * A commit in one of the repositories, and the replies it should pay for.
 */
interface Commit {
    /** The repository. */
    commit: Exclude<Folder, 'N' | 'L'>
    /** The replies it counts, by their place in the session. */
    counts: number[]
}

/**
 * One session's story.
 */
interface Scenario {
    /** What it shows. */
    name: string
    /** The replies and commits, in order. */
    steps: (Reply | Commit)[]
}

const SCENARIOS: Scenario[] = [
    {
        name: 'a session in one repository pays for all its replies',
        steps: [
            { in: 'A' },
            { in: 'A', calls: [{ shell: 'bun test' }] },
            { commit: 'A', counts: [0, 1] },
        ],
    },
    {
        name: 'a session that moves to another repository pays there only for the work after the move',
        steps: [
            { in: 'A', calls: [{ shell: 'bun test' }] },
            { in: 'A' },
            { in: 'B', calls: [{ shell: 'git status' }] },
            { in: 'B' },
            { commit: 'B', counts: [2, 3] },
            { commit: 'A', counts: [0, 1] },
        ],
    },
    {
        name: 'a one-off `cd` into another repository pays there for just those replies',
        steps: [
            { in: 'A', calls: [{ edit: '{A}/src/x.ts' }] },
            { in: 'A', calls: [{ shell: 'cd {B} && bun install' }] },
            { in: 'A' },
            { in: 'A', calls: [{ shell: 'cd {B} && git commit -m bump' }] },
            { commit: 'B', counts: [1, 3] },
            { commit: 'A', counts: [0, 2] },
        ],
    },
    {
        name: "a command run from another repository's folder pays there",
        steps: [
            { in: 'A', calls: [{ shell: 'git commit -m bump', from: 'B' }] },
            { commit: 'A', counts: [] },
            { commit: 'B', counts: [0] },
        ],
    },
    {
        name: 'editing another repository by its path, or from the home folder, pays there',
        steps: [
            { in: 'A', calls: [{ edit: '{B}/package.json' }] },
            { in: 'A', calls: [{ shell: 'git -C ~/b add package.json' }] },
            { in: 'A', calls: [{ shell: 'bun test' }] },
            { commit: 'B', counts: [0, 1] },
        ],
    },
    {
        name: 'a session that never worked in a repository pays nothing there',
        steps: [
            { in: 'A', calls: [{ shell: 'bun test' }] },
            { in: 'A' },
            { commit: 'B', counts: [] },
            { commit: 'A', counts: [0, 1] },
        ],
    },
    {
        name: 'a worktree inside a repository is its own repository',
        steps: [
            { in: 'W', calls: [{ edit: '{W}/src/x.ts' }] },
            { in: 'W' },
            { commit: 'A', counts: [] },
            { commit: 'W', counts: [0, 1] },
        ],
    },
    {
        name: 'commits back and forth each count only their own new replies',
        steps: [
            { in: 'A' },
            { commit: 'A', counts: [0] },
            { in: 'B' },
            { commit: 'B', counts: [1] },
            { in: 'A' },
            { in: 'B' },
            { commit: 'A', counts: [2] },
            { commit: 'B', counts: [3] },
            { commit: 'B', counts: [] },
        ],
    },
    {
        name: 'a folder reached through a symlink is the repository it points to',
        steps: [
            { in: 'L', calls: [{ shell: 'bun test' }] },
            { commit: 'B', counts: [0] },
        ],
    },
    {
        name: 'paths outside every repository leave the reply to its working folder',
        steps: [
            { in: 'A', calls: [{ shell: 'cat /etc/hosts {N}/notes.md' }] },
            { commit: 'A', counts: [0] },
        ],
    },
    {
        name: 'a reply that works in two repositories at once is paid for in both',
        steps: [
            { in: 'A', calls: [{ shell: 'cp {A}/x {B}/x' }] },
            { commit: 'A', counts: [0] },
            { commit: 'B', counts: [0] },
        ],
    },
    {
        name: 'a session working from outside every repository pays only where it names one',
        steps: [
            { in: 'N' },
            { in: 'N', calls: [{ shell: 'cd {A} && git commit -m x' }] },
            { commit: 'A', counts: [1] },
        ],
    },
]

/**
 * The folders on disk, in a fresh scratch folder.
 */
interface World {
    /** Each folder's path. */
    folders: Record<Folder, string>
    /** The scratch folder. */
    root: string
}

/**
 * Make the scenario's folders.
 * @returns their paths
 */
function makeWorld(): World {
    const root = mkdtempSync(join(tmpdir(), 'modelmark-repos-'))
    const folders: Record<Folder, string> = {
        A: join(root, 'a'),
        B: join(root, 'home', 'b'),
        W: join(root, 'a', 'worktrees', 'w'),
        N: join(root, 'plain'),
        L: join(root, 'link-to-b'),
    }

    mkdirSync(join(folders.A, '.git'), { recursive: true })
    mkdirSync(join(folders.B, '.git'), { recursive: true })
    mkdirSync(folders.W, { recursive: true })
    writeFileSync(join(folders.W, '.git'), `gitdir: ${folders.A}/.git/worktrees/w\n`)
    mkdirSync(folders.N, { recursive: true })
    symlinkSync(folders.B, folders.L)

    return { folders, root }
}

/**
 * When reply n was written.
 * @param n - its place in the session
 * @returns its time, as ISO text
 */
function replyTime(n: number): string {
    return new Date(Date.UTC(2026, 9, 20, 10, n)).toISOString()
}

/**
 * A call's text with the folder names replaced by their paths.
 * @param text - the call's text
 * @param world - the folders
 * @returns the text
 */
function placed(text: string, world: World): string {
    return text.replaceAll(/\{([ABWNL])\}/g, (_, name: Folder) => world.folders[name])
}

/**
 * A shell command as a harness with no per-command folder runs it: after a
 * `cd` when it runs from another folder.
 * @param call - the call
 * @param call.shell - the command
 * @param call.from - the folder it runs from, if not the agent's own
 * @param world - the folders
 * @returns the command
 */
function command({ shell, from }: { shell: string; from?: Folder }, world: World): string {
    return placed(from ? `cd {${from}} && ${shell}` : shell, world)
}

/**
 * Each source's log for a session's replies so far, and the variables that
 * point the hook at it.
 */
const HARNESSES: Record<UseSource, (replies: Reply[], world: World) => Record<string, string>> = {
    'claude-code': (replies, world) => {
        const config = join(world.root, 'claude')
        const log = join(config, 'projects', '-a', 's1.jsonl')
        /*
         * Claude Code writes one record per content block, each with the reply's usage.
         */
        const records = replies.flatMap((reply, n) => {
            const blocks = [
                { type: 'thinking', thinking: '' },
                ...(reply.calls ?? []).map(call =>
                    'shell' in call
                        ? {
                              type: 'tool_use',
                              name: 'Bash',
                              input: { command: command(call, world) },
                          }
                        : {
                              type: 'tool_use',
                              name: 'Edit',
                              input: { file_path: placed(call.edit, world), old_string: 'a' },
                          },
                ),
            ]

            return blocks.map(block => ({
                type: 'assistant',
                timestamp: replyTime(n),
                cwd: world.folders[reply.in],
                requestId: `req${n}`,
                message: {
                    id: `msg${n}`,
                    model: 'claude-opus-5-5',
                    content: [block],
                    usage: { output_tokens: 2 ** n },
                },
            }))
        })

        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, records.map(record => `${JSON.stringify(record)}\n`).join(''))

        return { CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CONFIG_DIR: config }
    },
    codex: (replies, world) => {
        const home = join(world.root, 'codex')
        const log = join(
            home,
            'sessions',
            '2026',
            '10',
            '20',
            'rollout-2026-10-20T10-00-00-t1.jsonl',
        )
        /*
         * Each reply in its own turn; a shell call names its folder, and the
         * token record follows the reply's calls.
         */
        const records = replies.flatMap((reply, n) => {
            const cwd = world.folders[reply.in]
            const calls = (reply.calls ?? []).map(call => ({
                timestamp: replyTime(n),
                type: 'response_item',
                payload:
                    'shell' in call
                        ? {
                              type: 'custom_tool_call',
                              name: 'exec',
                              input: `const r = await tools.exec_command(${JSON.stringify({ cmd: placed(call.shell, world), workdir: call.from ? world.folders[call.from] : cwd })})`,
                          }
                        : {
                              type: 'custom_tool_call',
                              name: 'apply_patch',
                              input: `*** Begin Patch\n*** Update File: ${placed(call.edit, world)}\n*** End Patch`,
                          },
            }))

            return [
                {
                    timestamp: replyTime(n),
                    type: 'turn_context',
                    payload: { cwd, model: 'gpt-5.6-terra' },
                },
                ...calls,
                {
                    timestamp: replyTime(n),
                    type: 'token_usage_record',
                    payload: { usage: { output_tokens: 2 ** n } },
                },
            ]
        })

        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, records.map(record => `${JSON.stringify(record)}\n`).join(''))

        return { CODEX_THREAD_ID: 't1', CODEX_HOME: home }
    },
    pi: (replies, world) => {
        const log = join(world.root, 'pi', 'session.jsonl')
        const records = [
            { type: 'session', cwd: world.folders[replies[0]?.in ?? 'A'] },
            ...replies.map((reply, n) => ({
                type: 'message',
                timestamp: replyTime(n),
                message: {
                    role: 'assistant',
                    model: 'kimi-k3',
                    content: (reply.calls ?? []).map(call =>
                        'shell' in call
                            ? {
                                  type: 'toolCall',
                                  name: 'bash',
                                  arguments: { command: command(call, world) },
                              }
                            : {
                                  type: 'toolCall',
                                  name: 'edit',
                                  arguments: { path: placed(call.edit, world) },
                              },
                    ),
                    usage: { output: 2 ** n },
                },
            })),
        ]

        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, records.map(record => `${JSON.stringify(record)}\n`).join(''))

        return { PI_SESSION_FILE: log }
    },
    'usage-log': (replies, world) => {
        const log = join(world.root, 'usage', 'jojo.jsonl')
        /*
         * The writer names each reply's paths itself: those its calls name,
         * and the folder a shell call ran from. Its session id is too long
         * for a file name and isn't valid text, which a writer is free to
         * choose and the checkpoint must still be saved under.
         */
        const records = [
            { modelmark: 'usage', version: 1, session: `c1${'x'.repeat(300)}\uD800` },
            ...replies.map((reply, n) => ({
                at: replyTime(n),
                model: 'claude-opus-5-5',
                input: 0,
                cacheRead: 0,
                cacheWrite: 0,
                output: 2 ** n,
                cwd: world.folders[reply.in],
                paths: (reply.calls ?? []).flatMap(call => [
                    ...absolutePaths(
                        placed('shell' in call ? call.shell : call.edit, world),
                        join(world.root, 'home'),
                    ),
                    ...('from' in call && call.from ? [world.folders[call.from]] : []),
                ]),
            })),
        ]

        mkdirSync(join(log, '..'), { recursive: true })
        writeFileSync(log, records.map(record => `${JSON.stringify(record)}\n`).join(''))

        return { MODELMARK_USAGE: log }
    },
}

/**
 * Whether the agent's own folder changes during a scenario, which Pi's log
 * @param scenario - the scenario
 * @param scenario.steps - its replies and commits
 * @param scenario - the scenario
 * @returns true when its replies are made in more than one folder
 */
function moves({ steps }: Scenario): boolean {
    return new Set(steps.flatMap(step => ('in' in step ? [step.in] : []))).size > 1
}

describe.each(Object.keys(HARNESSES) as UseSource[])('%s', source => {
    test.each(SCENARIOS.filter(scenario => source !== 'pi' || !moves(scenario)))(
        '$name',
        async ({ steps }) => {
            const world = makeWorld()
            const state = {
                XDG_STATE_HOME: join(world.root, 'state'),
                HOME: join(world.root, 'home'),
            }
            const replies: Reply[] = []

            for (const step of steps) {
                if (!('commit' in step)) {
                    replies.push(step)

                    continue
                }

                const env = { ...state, ...HARNESSES[source](replies, world) }
                const use = await usesSinceLastCommit(source, env, world.folders[step.commit])
                const counted = use?.uses.map(({ output }) => Math.log2(output)).toSorted()

                expect(counted, `the commit in ${step.commit}`).toEqual(step.counts)

                /*
                 * A commit in a repository that is gone counts as made, so
                 * the next commit settles this one without a real git.
                 */
                if (use) {
                    markCounted(
                        source,
                        use,
                        { gitDir: join(world.root, 'gone'), root: use.root, head: '', mark: '' },
                        env,
                    )
                }
            }
        },
    )
})
