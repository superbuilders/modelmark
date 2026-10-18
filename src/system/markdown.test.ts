import { expect, test } from 'vitest'

import { markdownTable } from './markdown'

test('pads every column to its widest cell', () => {
    expect(markdownTable(['A', 'Long header'], [['wide cell', 'x'], ['y']])).toBe(
        [
            '| A         | Long header |',
            '| --------- | ----------- |',
            '| wide cell | x           |',
            '| y         |             |',
        ].join('\n'),
    )
})
