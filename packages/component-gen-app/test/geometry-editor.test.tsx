// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GeometryEditor } from '../src/components/GeometryEditor.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = undefined
  }
  document.body.innerHTML = ''
})

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

it('keeps the width field synchronized with geometry dragging', async () => {
  const onConfirm = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(
      <GeometryEditor
        dimensions={{ W: 10, H: 5 }}
        t={(key) => key}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
  })

  const svg = container.querySelector<SVGSVGElement>('.hq-genhit__geom')!
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 360,
      height: 230,
      right: 360,
      bottom: 230,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  })

  const widthHandle = container.querySelector<SVGElement>('.hq-genhit__handle')!
  const widthInput = container.querySelector<HTMLInputElement>('input[data-field="W"]')!
  expect(widthInput.value).toBe('10')

  await act(async () => {
    widthHandle.dispatchEvent(pointerEvent('pointerdown', 326, 115))
  })
  await act(async () => {
    svg.dispatchEvent(pointerEvent('pointermove', 355.2, 115))
  })

  expect(widthInput.value).toBe('11')

  const confirm = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes('editor.confirmLabel'))!
  await act(async () => {
    confirm.click()
  })

  expect(onConfirm).toHaveBeenCalledWith(
    { W: 11, H: 5 },
    { W: true },
  )
})
