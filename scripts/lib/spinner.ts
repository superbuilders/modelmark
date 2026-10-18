/**
 * Multi-task terminal spinner with braille animation, ported from the arcade's scripts/lib.
 */

import { stderr } from 'node:process'

import { blue, dim, green, red } from 'colorette'

import { cursor, isProgressInteractive } from './ansi'

const SPINNER_FRAMES = [
    0x28_0b, 0x28_19, 0x28_39, 0x28_38, 0x28_3c, 0x28_34, 0x28_26, 0x28_27, 0x28_07, 0x28_0f,
].map(code => String.fromCodePoint(code))
const CHECK_MARK = String.fromCodePoint(0x27_14) // ✔
const CROSS_MARK = String.fromCodePoint(0x27_16) // ✖
const SPINNER_INTERVAL = 80

/**
 * Where a task is in its life.
 */
type TaskStatus = 'pending' | 'running' | 'success' | 'error'

/**
 * State of a single task tracked by the spinner.
 */
interface TaskState {
    /** Display label for the task — set from the constructor's `texts` array. */
    text: string
    /** Lifecycle state of the task, updated via `updateTask()`. */
    status: TaskStatus
    /** Optional override text for a finished task; takes precedence over `text` when set. */
    finalText?: string
}

/**
 * Animated multi-task spinner for interactive terminals.
 * Falls back to plain-text logging in non-interactive environments.
 */
export class Spinner {
    private readonly tasks = new Map<string, TaskState>()
    private frameIndex = 0
    private intervalId: NodeJS.Timeout | null = null
    private previousLineCount = 0

    /**
     * @param names - each task's name, which is also its label
     */
    constructor(names: string[]) {
        for (const name of names) {
            this.tasks.set(name, { text: name, status: 'pending' })
        }
    }

    /**
     * Begin rendering the spinner animation.
     */
    start() {
        if (isProgressInteractive) {
            stderr.write(cursor.hide)

            this.render()
            this.intervalId = setInterval(() => {
                this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length
                this.render()
            }, SPINNER_INTERVAL)
        }
    }

    /**
     * Update the status of a task.
     *
     * @param taskId - task identifier
     * @param status - new status
     * @param finalText - override display text for terminal states
     */
    updateTask(taskId: string, status: Exclude<TaskStatus, 'pending'>, finalText?: string) {
        const task = this.tasks.get(taskId)

        if (task) {
            task.status = status

            if (finalText) {
                task.finalText = finalText
            }

            if (!isProgressInteractive) {
                this.renderNonInteractive(task)
            }
        }
    }

    /**
     * Stop the spinner and finalize output.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }

        if (isProgressInteractive) {
            this.render()
            stderr.write(cursor.show)
        }
    }

    /**
     * Print a task's new status as its own line in non-interactive mode (CI,
     * piped output), where nothing is redrawn.
     *
     * @param task - current task state
     */
    private renderNonInteractive(task: TaskState) {
        let line = ''

        switch (task.status) {
            case 'running': {
                line = `[RUNNING] ${task.text}`
                break
            }

            case 'success': {
                line = `[SUCCESS] ${task.finalText || task.text}`
                break
            }

            case 'error': {
                line = `[ERROR] Failed: ${task.text}`
                break
            }
        }

        console.error(line)
    }

    /**
     * Redraw all task lines in-place using ANSI cursor movement.
     */
    private render() {
        if (this.previousLineCount > 0) {
            stderr.write(cursor.up(this.previousLineCount))
        }

        const spinner = SPINNER_FRAMES[this.frameIndex]

        const visibleTasks = [...this.tasks.values()].filter(task => task.status !== 'pending')

        for (const task of visibleTasks) {
            stderr.write(`\r${cursor.clearLine}`)

            let line = ''

            switch (task.status) {
                case 'running': {
                    line = `${blue(spinner)} ${task.text}`
                    break
                }

                case 'success': {
                    line = `${green(CHECK_MARK)} ${task.finalText || task.text}`
                    break
                }

                case 'error': {
                    line = `${red(CROSS_MARK)} Failed: ${task.text}`
                    break
                }
            }

            console.error(line)
        }

        this.previousLineCount = visibleTasks.length
    }
}

/**
 * Format an elapsed duration as the dim bracketed suffix of a spinner task
 * line (e.g. `[1.24s]`).
 *
 * @param ms - elapsed time in milliseconds
 * @returns the styled duration string
 */
export function formatDuration(ms: number): string {
    const duration = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`

    return dim(`[${duration}]`)
}
