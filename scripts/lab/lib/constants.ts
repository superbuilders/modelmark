/** Where the lab works on every host; each run gets its own folder under runs/. */
export const LAB_ROOT = '/tmp/modelmark-lab'

/** The variable naming the Mac's SSH host, for `--host mac`. */
export const MAC_HOST_VARIABLE = 'MODELMARK_LAB_MAC_HOST'

/** The longest one hook run may take, Bun's startup included. */
export const HOOK_BUDGET_MS = 500

/** Size of the fake session log the big-log scenario reads from its end. */
export const BIG_LOG_BYTES = 300 * 1024 * 1024

/** How long one agent command may run before the scenario fails. */
export const AGENT_TIMEOUT_MS = 240_000

/** How many scenarios run at once on one host. */
export const CONCURRENCY = 4

/** The message every lab commit uses. */
export const COMMIT_MESSAGE = 'lab commit'

/** The variable naming Pi's provider for the lab's runs; unset, Pi uses its default. */
export const PI_PROVIDER_VARIABLE = 'MODELMARK_LAB_PI_PROVIDER'

/** The cheapest models that still run one shell command reliably, and a second of each for switches. */
export const MODELS = {
    claudeCode: 'claude-haiku-5-5',
    claudeCodeSwitch: 'claude-sonnet-5-5',
    codex: 'gpt-5.6-luna',
    codexSwitch: 'gpt-5.6-terra',
    pi: 'kimi-k3',
    piSwitch: 'gpt-5.6-luna',
} as const

/** Variables agents set for their commands; the lab removes them so only a scenario's own count. */
export const AGENT_MARKERS: readonly string[] = [
    'AI_AGENT',
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_SESSION_ID',
    'CODEX_SANDBOX',
    'CODEX_SANDBOX_NETWORK_DISABLED',
    'CODEX_THREAD_ID',
    'PI_MODEL',
    'PI_PROVIDER',
    'PI_REASONING_LEVEL',
    'PI_SESSION_FILE',
    'PI_SESSION_ID',
]

/** The README, relative to the repository. */
export const README_FILE = 'README.md'

/** The README lines the lab's tested-versions table sits between. */
export const README_MARKERS = {
    start: '<!-- lab:tested -->',
    end: '<!-- /lab:tested -->',
} as const

/** Shown in the tested-versions table for a harness with no pass on that platform. */
export const NOT_TESTED = 'not tested'

/** Probe reports cut each process's command line to this many characters. */
export const PROBE_ARGS_LIMIT = 160

/** Probe reports list at most this many recently written files. */
export const PROBE_FILE_LIMIT = 40

/** How many of a log's last records a probe describes. */
export const PROBE_RECORD_COUNT = 5

/** How deep under the home folder a probe looks for recently written files. */
export const PROBE_DEPTH = 6

/** Folders a probe never looks inside: caches and package stores, not logs. */
export const PROBE_SKIPPED_FOLDERS: readonly string[] = [
    '.bun',
    '.cache',
    '.cargo',
    '.git',
    '.npm',
    '.rustup',
    'Caches',
    'Containers',
    'go',
    'node_modules',
]

/** A probe report's file name in its scratch folder. */
export const PROBE_REPORT = 'probe-report.json'
