/**
 * The folder a Codex shell call runs in, as its arguments name it
 * (`"workdir":"/repo"`, or `"working_directory"` on older shell calls).
 * Captures the folder.
 */
export const CODEX_WORKDIR = /\\?"(?:workdir|working_directory)\\?"\s*:\s*\\?"([^"\\]+)\\?"/g

/** A usage log reply's time: RFC 3339, with a zone (spec/usage-log/v1.md, section 4.3). */
export const USAGE_LOG_TIME =
    /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

/** A cache lifetime's label in a usage log: a whole number and a unit, such as `5m` or `1h`. */
export const CACHE_TTL = /^[1-9]\d*[smhd]$/
