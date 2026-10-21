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

/** The commit trailer modelmark writes, following the Linux kernel's convention. */
export const TRAILER_KEY = 'Assisted-by'

/** Written in place of the model when the agent's log could not be read. */
export const UNKNOWN_MODEL = 'unknown'

/** Separates the agent from the model in a mark: `codex:gpt-5.6-terra`. */
export const AGENT_SEPARATOR = ':'

/** Separates the model from its effort in a mark: `codex:gpt-5.6-terra@high`. */
export const EFFORT_SEPARATOR = '@'

/** What an unreadable log gives. */
export const NO_MODEL_USE: Readonly<ModelUse> = { model: null, effort: null }

/** The extension every agent's session log uses. */
export const JSONL = '.jsonl'

/** The tool Claude Code runs shell commands with, `git commit` among them. */
export const CLAUDE_SHELL_TOOL = 'Bash'

/** Claude Code's placeholder model on records it writes itself, not the model's replies. */
export const CLAUDE_SYNTHETIC_MODEL = '<synthetic>'

/** The commit trailer holding the estimated cost of the replies behind a commit. */
export const COST_TRAILER_KEY = 'Assisted-cost'

/** The price list modelmark ships, relative to modelmark's own folder; the fresher copy in the user's cache folder has the same name. */
export const PRICES_FILE = 'prices.json'

/** Where models.dev publishes its catalog. */
export const CATALOG_URL = 'https://models.dev/api.json'

/**
 * The providers whose own prices are kept, in the order a model id two of them
 * share is taken from. Resellers and gateways are left out: their prices carry
 * their markup, and a gateway's model id ends in the first-party id anyway.
 */
export const FIRST_PARTY_PROVIDERS = [
    'anthropic',
    'openai',
    'google',
    'xai',
    'deepseek',
    'moonshotai',
    'mistral',
    'alibaba',
    'zai',
    'minimax',
    'meta',
] as const

/** Set to anything to turn off price downloads; prices already downloaded still apply. */
export const OFFLINE_VARIABLE = 'MODELMARK_OFFLINE'

/**
 * The variables CI services set; a refresh there is skipped, since the
 * machine and its cache are thrown away after the job. The check is
 * sindresorhus/is-in-ci's, which update-notifier uses: set, and not `0` or
 * `false`.
 */
export const CI_VARIABLES: readonly string[] = ['CI', 'CONTINUOUS_INTEGRATION']

/** How old the last price refresh may be before a commit starts another. */
export const PRICE_REFRESH_MS = 3_600_000

/** The longest a price refresh waits for models.dev. */
export const PRICE_FETCH_TIMEOUT_MS = 20_000

/** Where the time of the last price refresh is kept, under the state folder. */
export const PRICE_REFRESH_STATE = 'prices-refreshed'

/** Text every Claude Code and Pi record with a reply's token counts holds, so other lines needn't be parsed. */
export const USAGE_KEYS: readonly string[] = ['"usage"']

/** Text the Codex records the cost needs hold: a turn's model, and a reply's token counts. */
export const CODEX_KEYS: readonly string[] = ['"turn_context"', '"token_usage_record"']
