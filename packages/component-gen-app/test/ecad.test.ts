// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { sizeCanvasFor } from '../src/utils/ecad.js'

const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')

afterEach(() => {
  if (originalDevicePixelRatio) {
    Object.defineProperty(window, 'devicePixelRatio', originalDevicePixelRatio)
  }
})

describe('sizeCanvasFor', () => {
  it('falls back to a safe scale for invalid device pixel ratios', () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: Number.POSITIVE_INFINITY,
    })

    const canvas = document.createElement('canvas')
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 240 },
      clientHeight: { configurable: true, value: 160 },
    })

    sizeCanvasFor(canvas)

    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 240, height: 160 })
  })
})
