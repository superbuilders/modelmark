import type { AgentId, HarnessBadge, ModelUse, Platform } from './types'

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

/** OpenAI's mark, which Simple Icons dropped; drawn white for a dark badge. */
const OPENAI_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>'

/** Pi has no logo, so its badge shows a white π. */
const PI_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="12" y="19" text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="bold" fill="white">π</text></svg>'

/** Each harness's badge: its brand color, and its logo. */
export const HARNESS_BADGES: Readonly<Record<AgentId, HarnessBadge>> = {
    'claude-code': { color: 'D97757', effortColor: 'B34A28', logo: { simpleIcon: 'claude' } },
    codex: { color: '10A37F', effortColor: '0C755B', logo: { svg: OPENAI_LOGO } },
    pi: { color: '6E40C9', effortColor: '4E2A95', logo: { svg: PI_LOGO } },
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

/** Claude Code's placeholder model on records it writes itself, not the model's replies. */
export const CLAUDE_SYNTHETIC_MODEL = '<synthetic>'
