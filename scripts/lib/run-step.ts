/**
 * Async step runner with spinner UI, ported from the arcade's scripts/lib: named async functions
 * run together with spinner feedback (`runSteps`).
 */

import { bold } from 'colorette'

import { formatDuration, Spinner } from './spinner'

/**
 * Indent every line of a string with a prefix.
 *
 * @param str - text to indent
 * @param prefix - prefix for each line
 * @returns indented string
 */
function indentLines(str: string, prefix: string): string {
    return str
        .split('\n')
        .map(line => `${prefix}${line}`)
        .join('\n')
}

/**
 * Configuration for spinner output behavior.
 */
export interface RunStepOptions {
    /** Indentation level for spinner output lines. */
    indent?: number
    /** Suppress spinner display; still execute the action and return its result. */
    silent?: boolean
}

/**
 * Configuration for a single step in a batch.
 */
interface StepConfig<T> {
    /** Display label for the step. */
    text: string
    /** Async function to execute for this step. */
    action: () => Promise<T>
    /** Optional override label on success; if a function, receives the resolved value. */
    successText?: ((result: T) => string) | string
}

/**
 * Outcome of a step in a batch run.
 */
interface StepResult<T> {
    /** Whether the step completed without throwing. */
    success: boolean
    /** The resolved value from the step; present only if `success` is true. */
    result?: T
    /** The thrown error from the step; present only if `success` is false. */
    error?: unknown
}

/**
 * Run multiple named steps in parallel with spinner feedback.
 *
 * @param steps - keyed step configs (all run concurrently)
 * @param options - spinner options
 * @returns keyed results with success/error state
 */
export async function runSteps<T extends Record<string, unknown>>(
    steps: {
        [K in keyof T]: StepConfig<T[K]>
    },
    options?: RunStepOptions,
): Promise<{ [K in keyof T]: StepResult<T[K]> }> {
    const keys = Object.keys(steps) as (keyof T)[]
    const results = {} as { [K in keyof T]: StepResult<T[K]> }
    const taskTexts = keys.map(key => steps[key].text)
    const spinner = new Spinner(keys as string[], taskTexts, options)

    spinner.start()

    const promises = keys.map(async key => {
        const step = steps[key]

        spinner.updateTask(key as string, 'running')

        const startTime = performance.now()

        try {
            const result = await step.action()
            const duration = performance.now() - startTime
            let finalText: string

            if (typeof step.successText === 'function') {
                finalText = step.successText(result)
            } else {
                finalText = step.successText ?? step.text
            }

            finalText = `${bold(finalText)} ${formatDuration(duration)}`
            spinner.updateTask(key as string, 'success', finalText)
            results[key] = { success: true, result }
        } catch (error) {
            spinner.updateTask(key as string, 'error')
            results[key] = { success: false, error }
        }
    })

    await Promise.all(promises)
    spinner.stop()

    const failedSteps = keys.filter(key => !results[key].success)

    if (failedSteps.length > 0) {
        console.error('')
        console.error('The following steps failed:')

        for (const key of failedSteps) {
            const error = results[key].error

            console.error('')
            console.error(`  ${String(key)}:`)

            if (
                error &&
                typeof error === 'object' &&
                'exitCode' in error &&
                typeof error.exitCode === 'number'
            ) {
                console.error(`    Exit Code: ${error.exitCode}`)

                const stdout = (error as { stdout?: Buffer }).stdout?.toString().trim()
                const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim()

                if (stdout) {
                    console.error(`    Stdout:\n${indentLines(stdout, '      ')}`)
                }

                if (stderr) {
                    console.error(`    Stderr:\n${indentLines(stderr, '      ')}`)
                }
            } else {
                console.error(
                    `    Error: ${error instanceof Error ? error.message : String(error)}`,
                )
            }
        }

        throw new Error(`${failedSteps.length} step(s) failed: ${failedSteps.join(', ')}`)
    }

    return results
}
