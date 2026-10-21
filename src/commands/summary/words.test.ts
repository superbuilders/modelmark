import { expect, test } from 'vitest'

import { tokenCountText } from './words'

test('tokenCountText keeps one decimal under ten of a unit', () => {
    expect([950, 4240, 61_800, 156_000, 3_120_000, 2_400_000_000].map(tokenCountText)).toEqual([
        '950',
        '4.2k',
        '62k',
        '156k',
        '3.1M',
        '2.4B',
    ])
})
