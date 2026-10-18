import { chmod, mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { BIG_LOG_BYTES, COMMIT_MESSAGE, MODELS } from './constants'
import {
    AMEND,
    claude,
    codex,
    codexResume,
    codexThread,
    COMMIT,
    HELLO,
    pi,
    runPrompt,
} from './harnesses'
import { shellQuote, SkipError } from './process'

import type { Scenario, ScenarioWorkspace } from './types'

/** Every lab scenario, in the order `lab list` shows them. */
export const SCENARIOS: readonly Scenario[] = [
    {
        name: 'claude-code',
        description: 'Claude Code commits; the model and effort come from its session log',
        harnesses: ['claude-code'],
        expected: [`claude-code:${MODELS.claudeCode}@low`],
        run: async workspace => {
            await workspace.agent(
                claude(runPrompt(COMMIT), { model: MODELS.claudeCode, effort: 'low' }),
            )
        },
    },
    {
        name: 'claude-code-switch',
        description: 'A Claude Code session switches model and effort, then commits',
        harnesses: ['claude-code'],
        expected: [`claude-code:${MODELS.claudeCodeSwitch}@medium`],
        run: async workspace => {
            await workspace.agent(claude(HELLO, { model: MODELS.claudeCode, effort: 'low' }))
            await workspace.agent(
                claude(runPrompt(COMMIT), { model: MODELS.claudeCodeSwitch, effort: 'medium' }, [
                    '--continue',
                ]),
            )
        },
    },
    {
        name: 'claude-code-subagent',
        description:
            "A Claude Code subagent on another model commits; the subagent's model is marked",
        harnesses: ['claude-code'],
        expected: [new RegExp(`^claude-code:${MODELS.claudeCodeSwitch}(@\\w+)?$`)],
        run: async workspace => {
            const agents = {
                committer: {
                    description: 'Runs one shell command it is given',
                    prompt: 'Run the exact shell command you are given with the Bash tool, then reply done.',
                    model: 'sonnet',
                },
            }

            await workspace.agent(
                claude(
                    `Ask the committer agent to run this exact shell command, and do not run it yourself: ${COMMIT}`,
                    { model: MODELS.claudeCode, effort: 'low' },
                    ['--agents', JSON.stringify(agents)],
                ),
            )
        },
    },
    {
        name: 'codex',
        description: 'Codex commits; the model and effort come from its rollout',
        harnesses: ['codex'],
        expected: [`codex:${MODELS.codex}@low`],
        run: async workspace => {
            await workspace.agent(codex(runPrompt(COMMIT), { model: MODELS.codex, effort: 'low' }))
        },
    },
    {
        name: 'codex-switch',
        description: 'A Codex thread switches model and effort, then commits',
        harnesses: ['codex'],
        expected: [`codex:${MODELS.codexSwitch}@medium`],
        run: async workspace => {
            const first = await workspace.agent(
                codex(HELLO, { model: MODELS.codex, effort: 'low' }),
            )

            await workspace.agent(
                codexResume(codexThread(first), runPrompt(COMMIT), {
                    model: MODELS.codexSwitch,
                    effort: 'medium',
                }),
            )
        },
    },
    {
        name: 'codex-sandbox',
        description: "Codex commits inside its sandbox, which hides Codex's own process",
        harnesses: ['codex'],
        expected: [`codex:${MODELS.codex}@low`],
        run: async workspace => {
            const output = await workspace.agent(
                codex(runPrompt(COMMIT), { model: MODELS.codex, effort: 'low', sandbox: true }),
            )

            if (/bwrap|sandbox.*(denied|not permitted|failed)/i.test(output)) {
                throw new SkipError("Codex's sandbox can't start on this host")
            }
        },
    },
    {
        name: 'pi',
        description:
            'Pi commits; the model comes from its session file, the effort from its variable',
        harnesses: ['pi'],
        expected: [`pi:${MODELS.pi}@low`],
        run: async workspace => {
            await workspace.agent(
                pi(runPrompt(COMMIT), {
                    model: MODELS.pi,
                    effort: 'low',
                    sessions: join(workspace.root, 'pi-sessions'),
                }),
            )
        },
    },
    {
        name: 'pi-switch',
        description: 'A Pi session switches model and thinking level, then commits',
        harnesses: ['pi'],
        expected: [`pi:${MODELS.piSwitch}@high`],
        run: async workspace => {
            const sessions = join(workspace.root, 'pi-sessions')

            await workspace.agent(pi(HELLO, { model: MODELS.pi, effort: 'low', sessions }))
            await workspace.agent(
                pi(runPrompt(COMMIT), {
                    model: MODELS.piSwitch,
                    effort: 'high',
                    sessions,
                    continued: true,
                }),
            )
        },
    },
    {
        name: 'pi-no-session',
        description: 'Pi without a session file commits; the model comes from PI_MODEL',
        harnesses: ['pi'],
        expected: [`pi:${MODELS.pi}@medium`],
        run: async workspace => {
            await workspace.agent(
                pi(runPrompt(COMMIT), { model: MODELS.pi, effort: 'medium', sessions: null }),
            )
        },
    },
    {
        name: 'nested',
        description: 'Claude Code starts Pi, and Pi commits; the nearest agent is marked',
        harnesses: ['claude-code', 'pi'],
        expected: [`pi:${MODELS.pi}@low`],
        run: async workspace => {
            const script = join(workspace.root, 'nested.sh')
            const inner = pi(runPrompt(COMMIT), {
                model: MODELS.pi,
                effort: 'low',
                sessions: join(workspace.root, 'pi-sessions'),
            })

            await writeFile(script, `${inner.map(arg => shellQuote(arg)).join(' ')}\n`)
            await workspace.agent(
                claude(runPrompt(`sh ${shellQuote(script)}`), {
                    model: MODELS.claudeCode,
                    effort: 'low',
                }),
            )
        },
    },
    {
        name: 'amend',
        description: 'Claude Code commits and Pi amends; the commit carries both marks',
        harnesses: ['claude-code', 'pi'],
        expected: [`claude-code:${MODELS.claudeCode}@low`, `pi:${MODELS.pi}@low`],
        run: async workspace => {
            await workspace.agent(
                claude(runPrompt(COMMIT), { model: MODELS.claudeCode, effort: 'low' }),
            )
            await workspace.agent(
                pi(runPrompt(AMEND), {
                    model: MODELS.pi,
                    effort: 'low',
                    sessions: join(workspace.root, 'pi-sessions'),
                }),
            )
        },
    },
    {
        name: 'leaked-env',
        description:
            "A person commits from a terminal that inherited an agent's variables; no mark",
        harnesses: [],
        expected: [],
        run: async workspace => {
            await workspace.detached(['git', 'commit', '--allow-empty', '-m', COMMIT_MESSAGE], {
                CLAUDE_CODE_SESSION_ID: 'lab-leaked',
                AI_AGENT: 'claude-code',
            })
        },
    },
    {
        name: 'big-log',
        description: `A stand-in Claude Code with a ${BIG_LOG_BYTES / 1024 / 1024} MB session log commits within the hook budget`,
        harnesses: [],
        expected: ['claude-code:claude-opus-5-5@high'],
        run: async workspace => {
            const config = join(workspace.root, 'claude-config')

            await writeBigLog(join(config, 'projects', '-lab', 'lab-big.jsonl'))
            await workspace.detached(
                [
                    await standInClaude(workspace),
                    'git',
                    'commit',
                    '--allow-empty',
                    '-m',
                    COMMIT_MESSAGE,
                ],
                { CLAUDE_CODE_SESSION_ID: 'lab-big', CLAUDE_CONFIG_DIR: config },
            )
        },
    },
]

/**
 * Write a Claude Code session log of BIG_LOG_BYTES whose last record is a reply.
 * @param path - the log file
 */
async function writeBigLog(path: string): Promise<void> {
    const line = `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'x'.repeat(1000) } })}\n`
    const chunk = Buffer.from(line.repeat(Math.ceil((1024 * 1024) / line.length)))
    const reply = { type: 'assistant', effort: 'high', message: { model: 'claude-opus-5-5' } }

    await mkdir(join(path, '..'), { recursive: true })

    const file = await open(path, 'w')

    try {
        for (let written = 0; written < BIG_LOG_BYTES; written += chunk.length) {
            await file.write(chunk)
        }

        await file.write(`${JSON.stringify(reply)}\n`)
    } finally {
        await file.close()
    }
}

/**
 * A stand-in Claude Code: a Bun script named `claude` that runs the command it is given, so the process
 * walk finds `bun …/claude` above the commit as it does for a real Claude Code.
 * @param workspace - the scenario's workspace
 * @returns the script's path
 */
async function standInClaude(workspace: ScenarioWorkspace): Promise<string> {
    const script = join(workspace.root, 'bin', 'claude')

    await mkdir(join(script, '..'), { recursive: true })
    await writeFile(
        script,
        `#!${workspace.bun}
const child = Bun.spawnSync(process.argv.slice(2), { stdio: ['inherit', 'inherit', 'inherit'] })
process.exit(child.exitCode ?? 1)
`,
    )
    await chmod(script, 0o755)

    return script
}
