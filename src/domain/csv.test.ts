import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with newlines', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\n1,2\n3,4')
  })
  it('quotes fields containing comma, quote, or newline and doubles interior quotes', () => {
    const csv = toCsv(['name', 'note'], [['Rope, cable', 'he said "hi"'], ['plain', 'line1\nline2']])
    expect(csv).toBe('name,note\n"Rope, cable","he said ""hi"""\nplain,"line1\nline2"')
  })
  it('emits an empty string cell as empty, not quoted', () => {
    expect(toCsv(['a', 'b'], [['', 'x']])).toBe('a,b\n,x')
  })
})
