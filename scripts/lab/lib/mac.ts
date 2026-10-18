import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { gray } from 'colorette'

import { LAB_ROOT, MAC_HOST_VARIABLE, PI_PROVIDER_VARIABLE } from './constants'
import { readVersions } from './harnesses'
import { shellQuote, spawn, tail } from './process'

import type { AgentId } from '../../../src/agents/types'
import type { CommandResult } from '../../../src/system/types'
import type { HostResult } from './types'

/** Where the checkout is copied on the Mac. */
const MAC_CHECKOUT = `${LAB_ROOT}/checkout`

/** Where the pinned Bun is installed on the Mac; the owner's own Bun is never used. */
const MAC_TOOLCHAIN = `${LAB_ROOT}/toolchain`

/**
 * The Mac's SSH host, from the environment (a git-ignored `.env` works).
 * @returns the host
 */
function macHost(): string {
    const host = process.env[MAC_HOST_VARIABLE]

    if (!host) {
        throw new Error(`Set ${MAC_HOST_VARIABLE} to the Mac's SSH host (in .env, for example)`)
    }

    return host
}

/**
 * Run a script on the Mac.
 * @param script - a POSIX shell script
 * @returns its output and exit code
 */
function ssh(script: string): Promise<CommandResult> {
    return spawn(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', macHost(), script])
}

/**
 * Wrap a command in the Mac owner's login shell, which puts the harnesses on
 * PATH and uses their own logins; the lab never sends credentials.
 * @param command - the command
 * @returns the script
 */
function loginShell(command: string): string {
    return `zsh -lic ${shellQuote(command)}`
}

/**
 * Run a script on the Mac, failing the lab when it fails.
 * @param step - what the script does, for the error
 * @param script - the script
 * @returns its output
 */
async function sshOrFail(step: string, script: string): Promise<string> {
    const result = await ssh(script)

    if (result.exitCode !== 0) {
        throw new Error(`Mac ${step} failed: ${tail(result.stderr || result.stdout)}`)
    }

    return result.stdout
}

/**
 * A script that installs the pinned Bun once, checked against the release's checksums.
 * @param version - the exact Bun version
 * @returns the script
 */
function toolchainScript(version: string): string {
    const directory = `${MAC_TOOLCHAIN}/bun-${version}`
    const release = `https://github.com/oven-sh/bun/releases/download/bun-v${version}`

    return `set -eu
[ -x ${directory}/bun ] && exit 0
case $(uname -m) in arm64) asset=bun-darwin-aarch64 ;; *) asset=bun-darwin-x64 ;; esac
umask 077
mkdir -p ${MAC_TOOLCHAIN}
stage=$(mktemp -d ${MAC_TOOLCHAIN}/stage.XXXXXX)
trap 'rm -rf "$stage"' 0
curl -fsSL -o "$stage/$asset.zip" ${release}/$asset.zip
curl -fsSL -o "$stage/SHASUMS256.txt" ${release}/SHASUMS256.txt
expected=$(grep " $asset.zip$" "$stage/SHASUMS256.txt" | cut -d' ' -f1)
actual=$(shasum -a 256 "$stage/$asset.zip" | cut -d' ' -f1)
[ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo "bun ${version} checksum mismatch" >&2; exit 1; }
unzip -q "$stage/$asset.zip" -d "$stage"
mkdir "$stage/out"
mv "$stage/$asset/bun" "$stage/out/bun"
mv "$stage/out" ${directory}`
}

/**
 * Copy this checkout to the Mac and install its toolchain and dependencies.
 * @param checkout - this repository
 * @returns the Mac's Bun binary
 */
async function prepare(checkout: string): Promise<string> {
    const manifest = JSON.parse(await readFile(join(checkout, 'package.json'), 'utf8')) as {
        packageManager: string
    }
    const version = manifest.packageManager.replace(/^bun@/, '')
    const bun = `${MAC_TOOLCHAIN}/bun-${version}/bun`

    console.error(gray('Mac: copying the checkout'))
    await sshOrFail('setup', `umask 077; mkdir -p ${MAC_CHECKOUT} ${LAB_ROOT}/runs`)

    const sync = await spawn([
        'rsync',
        '-az',
        '--delete',
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=tmp',
        '--exclude=coverage',
        '--filter=:- .gitignore',
        `${checkout}/`,
        `${macHost()}:${MAC_CHECKOUT}/`,
    ])

    if (sync.exitCode !== 0) {
        throw new Error(`Mac copy failed: ${tail(sync.stderr)}`)
    }

    console.error(gray(`Mac: installing Bun ${version} and dependencies`))
    await sshOrFail('toolchain', toolchainScript(version))
    await sshOrFail(
        'dependencies',
        `cd ${MAC_CHECKOUT} && ${bun} install --frozen-lockfile --ignore-scripts >/dev/null`,
    )

    return bun
}

/**
 * Run scenarios on the Mac with the same lab, and bring the results back.
 * @param names - the scenarios' names
 * @param checkout - this repository
 * @param keep - keep every scratch folder on the Mac, not only failed ones
 * @returns the Mac's results
 */
export async function runOnMac(
    names: string[],
    checkout: string,
    keep: boolean,
): Promise<HostResult> {
    const bun = await prepare(checkout)

    console.error(gray(`Mac: running ${names.length} scenarios`))

    const provider = process.env[PI_PROVIDER_VARIABLE]
    const env = provider ? `${PI_PROVIDER_VARIABLE}=${shellQuote(provider)} ` : ''
    const command = `cd ${MAC_CHECKOUT} && ${env}${bun} scripts/lab/index.ts run ${names.join(' ')} --host local --json --no-record${keep ? ' --keep' : ''}`
    const result = await ssh(loginShell(command))
    const json = result.stdout.split('\n').findLast(line => line.startsWith('{'))

    if (!json || result.exitCode > 1) {
        throw new Error(`Mac run failed: ${tail(result.stderr || result.stdout)}`)
    }

    const [host] = (JSON.parse(json) as { hosts: HostResult[] }).hosts

    if (!host) {
        throw new Error('Mac run returned no results')
    }

    return host
}

/**
 * The harness versions installed on the Mac.
 * @returns the versions; a missing harness has no entry
 */
export function macVersions(): Promise<Partial<Record<AgentId, string>>> {
    return readVersions(argv => ssh(loginShell(argv.map(arg => shellQuote(arg)).join(' '))))
}
