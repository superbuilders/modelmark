import { expect, test } from 'vitest'

import { costTrailer, costValue } from './cost'

test('costValue writes dollars and cents, and four places under a cent', () => {
    expect(costValue(1.844)).toBe('$1.84')
    expect(costValue(0.00314)).toBe('$0.0031')
})

test('costTrailer writes the whole line', () => {
    expect(costTrailer(1.844)).toBe('Assisted-cost: $1.84')
})
