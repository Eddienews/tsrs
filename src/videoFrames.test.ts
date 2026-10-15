import { describe, expect, it } from 'vitest'
import { clock, frameTimes, MAX_FRAMES } from './videoFrames'

describe('video frames', () => {
  it('spreads the frames over the video, one every couple of seconds, up to a limit', () => {
    expect(frameTimes(4)).toEqual([1, 3])
    expect(frameTimes(1)).toEqual([0.5])
    expect(frameTimes(600)).toHaveLength(MAX_FRAMES)
    expect(frameTimes(600)[0]).toBe(18.8)
    expect(frameTimes(Infinity)).toEqual([0])
    expect(frameTimes(0)).toEqual([0])
  })

  it('writes lengths as minutes and seconds', () => {
    expect(clock(4)).toBe('0:04')
    expect(clock(125.4)).toBe('2:05')
  })
})
