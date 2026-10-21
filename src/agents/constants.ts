import type { AgentId, ModelUse, Platform } from './types'

/** The executable that starts each harness: what the process walk looks for, and what asks its version. */
export const HARNESS_COMMANDS: Readonly<Record<AgentId, string>> = {
    'claude-code': 'claude',
    codex: 'codex',
    pi: 'pi',
}

/** Harness names as people write them. */
export const HARNESS_NAMES: Readonly<Record<AgentId, string>> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    pi: 'Pi',
}

/** Platform names as people write them. */
export const PLATFORM_NAMES: Readonly<Record<Platform, string>> = {
    linux: 'Linux',
    macos: 'macOS',
}

/** The lab's record of harness versions that passed, relative to modelmark's own folder. */
export const TESTED_VERSIONS_FILE = 'tested-versions.json'

/** Runtimes that launch an agent as a script (`node /path/to/codex`); the script names the agent. */
export const SCRIPT_RUNTIMES: readonly string[] = ['node', 'nodejs', 'bun']

/** A process tree deeper than this is treated as a loop. */
export const MAX_TREE_DEPTH = 64

/** The variable an agent modelmark doesn't know sets to name itself, holding a mark such as `jojo:gpt-6.1-sol@high`. */
export const DECLARED_MARK = 'MODELMARK'

/** What an unreadable log gives. */
export const NO_MODEL_USE: Readonly<ModelUse> = { model: null, effort: null }

/** The extension every agent's session log uses. */
export const JSONL = '.jsonl'

/** The tool Claude Code runs shell commands with, `git commit` among them. */
export const CLAUDE_SHELL_TOOL = 'Bash'

/** Claude Code's placeholder model on records it writes itself, not the model's replies. */
export const CLAUDE_SYNTHETIC_MODEL = '<synthetic>'

/** Text every Claude Code and Pi record with a reply's token counts holds, so other lines needn't be parsed. */
export const USAGE_KEYS: readonly string[] = ['"usage"']

/** Text the Codex records the cost needs hold: a turn's model, and a reply's token counts. */
export const CODEX_KEYS: readonly string[] = ['"turn_context"', '"token_usage_record"']
