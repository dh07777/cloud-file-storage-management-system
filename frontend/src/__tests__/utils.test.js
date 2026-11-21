import { describe, expect, it } from 'vitest'
import { actionLabel, cn, formatBytes, formatDuration, timeAgo } from '../utils'

describe('utils', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
    expect(formatBytes(null)).toBe('-')
  })
  it('formats durations', () => { expect(formatDuration(125)).toBe('2:05'); expect(formatDuration(NaN)).toBe('-') })
  it('computes relative time', () => { expect(timeAgo(new Date(Date.now() - 3 * 3600 * 1000).toISOString())).toBe('3h ago') })
  it('labels actions with a fallback', () => { expect(actionLabel('file.upload')).toBe('uploaded'); expect(actionLabel('x.y')).toBe('x y') })
  it('joins class names', () => { expect(cn('a', false, 'b', null)).toBe('a b') })
})
