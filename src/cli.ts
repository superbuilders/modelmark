#!/usr/bin/env bun
import { buildProgram } from './program/program'

try {
    await buildProgram().parseAsync()
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
