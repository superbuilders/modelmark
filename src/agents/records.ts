/**
 * Read a nested field of a parsed log record without trusting its shape.
 * @param record - a parsed JSON value
 * @param keys - the path of object keys to follow
 * @returns the value there, or undefined when any step is missing or not an object
 */
function valueAt(record: unknown, ...keys: string[]): unknown {
    let value = record

    for (const key of keys) {
        if (typeof value !== 'object' || value === null) {
            return undefined
        }

        value = (value as Record<string, unknown>)[key]
    }

    return value
}

/**
 * Read a nested string field of a parsed log record.
 * @param record - a parsed JSON value
 * @param keys - the path of object keys to follow
 * @returns the string there, or undefined when it is missing, empty or not a string
 */
export function stringAt(record: unknown, ...keys: string[]): string | undefined {
    const value = valueAt(record, ...keys)

    return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Read a nested count from a parsed log record.
 * @param record - a parsed JSON value
 * @param keys - the path of object keys to follow
 * @returns the number there, or 0 when it is missing or not a finite number
 */
export function countAt(record: unknown, ...keys: string[]): number {
    const value = valueAt(record, ...keys)

    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * When a log record was written, from its top-level ISO `timestamp`.
 * @param record - a parsed JSON value
 * @returns milliseconds since the epoch, or undefined when it has no readable time
 */
export function recordTime(record: unknown): number | undefined {
    const time = Date.parse(stringAt(record, 'timestamp') ?? '')

    return Number.isNaN(time) ? undefined : time
}
