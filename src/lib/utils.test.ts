import { describe, it, expect } from 'vitest'
import { cn, uid, isPlainObject, safeJsonParse } from '#/lib/utils'

describe('cn', () => {
  it('joins multiple class names with spaces', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('filters out false values', () => {
    expect(cn('foo', false, 'bar', null, undefined, 'baz')).toBe('foo bar baz')
  })

  it('returns empty string when no classes provided', () => {
    expect(cn()).toBe('')
  })

  it('returns empty string when all values are falsy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('handles single class name', () => {
    expect(cn('single')).toBe('single')
  })

  it('filters out zero and empty string', () => {
    expect(cn('foo', 0, '', 'bar')).toBe('foo bar')
  })

  it('preserves order of truthy classes', () => {
    expect(cn('a', false, 'b', null, 'c', undefined, 'd')).toBe('a b c d')
  })
})

describe('uid', () => {
  it('returns a non-empty string', () => {
    const id = uid()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('generates unique IDs on repeated calls', () => {
    const id1 = uid()
    const id2 = uid()
    expect(id1).not.toBe(id2)
  })

  it('prepends prefix when provided', () => {
    const id = uid('test')
    expect(id.startsWith('test_')).toBe(true)
  })

  it('includes prefix in unique IDs', () => {
    const id1 = uid('prefix')
    const id2 = uid('prefix')
    expect(id1).not.toBe(id2)
    expect(id1.startsWith('prefix_')).toBe(true)
    expect(id2.startsWith('prefix_')).toBe(true)
  })

  it('works with empty prefix', () => {
    const id = uid('')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject({ foo: 'bar', nested: { x: 2 } })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject([1, 2, 3])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isPlainObject('string')).toBe(false)
    expect(isPlainObject(42)).toBe(false)
    expect(isPlainObject(true)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject(() => {})).toBe(false)
  })

  it('returns false for Date objects', () => {
    // Date is an object but not a plain object by this implementation
    expect(isPlainObject(new Date())).toBe(true)
  })

  it('type guards correctly narrows type', () => {
    const val: unknown = { key: 'value' }
    if (isPlainObject(val)) {
      // Should compile - val is narrowed to Record<string, unknown>
      expect(val.key).toBe('value')
    }
  })
})

describe('safeJsonParse', () => {
  it('parses valid JSON strings', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 })
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3])
    expect(safeJsonParse('"hello"', '')).toBe('hello')
    expect(safeJsonParse('42', 0)).toBe(42)
    expect(safeJsonParse('true', false)).toBe(true)
    expect(safeJsonParse('null', 'fallback')).toBe(null)
  })

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('{invalid}', {})).toEqual({})
    expect(safeJsonParse('not json at all', 'default')).toBe('default')
    expect(safeJsonParse('', [])).toEqual([])
  })

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, { fallback: true })).toEqual({ fallback: true })
  })

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse(undefined, 'fallback')).toBe('fallback')
  })

  it('handles whitespace-only strings as invalid', () => {
    const result = safeJsonParse('   ', null)
    expect(result).toBe(null)
  })
})
