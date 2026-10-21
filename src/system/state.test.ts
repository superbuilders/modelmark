import { homedir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { cachePath, readState } from './state'

test('falls back to the home folder without the XDG variables', () => {
    expect(cachePath('prices.json', {})).toBe(join(homedir(), '.cache', 'modelmark', 'prices.json'))
    expect(readState('checkpoints/no-such-session', {})).toBeUndefined()
})
