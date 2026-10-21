/**
 * The folder a Codex shell call runs in, as its arguments name it
 * (`"workdir":"/repo"`, or `"working_directory"` on older shell calls).
 * Captures the folder.
 */
export const CODEX_WORKDIR = /\\?"(?:workdir|working_directory)\\?"\s*:\s*\\?"([^"\\]+)\\?"/g
