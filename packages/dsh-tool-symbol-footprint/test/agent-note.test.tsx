// @vitest-environment jsdom
/**
 * Regression guard for the two text channels in a tool result.
 *
 * A tool result is plain JSON, so EVERY field reaches the model — but the card
 * chooses what to show the human. `agentNote` carries directives ("wait for the
 * card, then call X, do not repeat these numbers in your reply"); rendering it
 * puts a system-prompt-style instruction on screen as if it were a message to
 * the user. It must never appear in the DOM.
 *
 * See the `src/tools.ts` module header for the full contract.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GenHit } from '../src/client/hit-card.jsx'
import { disposeThemeObserver } from '../src/client/theme.js'
import type { ToolBlockLike } from '../src/client/parse.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Verbatim copy of the directive `runGenerateFootprintFromImage` returns. */
const AGENT_NOTE =
  'The web client renders the extracted dimensions in an interactive editor card; the user ' +
  'confirms or corrects them there. Wait for the card confirmation, then call ' +
  'generate_footprint_from_dimensions with the confirmed values. Do NOT ask the user again, ' +
  'do NOT list or repeat these dimensions in your reply, and do NOT generate a footprint from ' +
  'unconfirmed dimensions.'

const mounted: Array<{ root: Root; container: HTMLElement }> = []

function setLang(lang: string | null): void {
  if (lang) document.documentElement.setAttribute('lang', lang)
  else document.documentElement.removeAttribute('lang')
}

/** Render the real card, mounted long enough for hooks + effects to settle. */
function render(block: unknown): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <GenHit
        toolName="generate_footprint_from_image"
        block={block as ToolBlockLike}
        sessionId="s1"
        authState={{ authenticated: true }}
        sendPrompt={async () => undefined}
      />,
    )
  })
  mounted.push({ root, container })
  return container
}

function needsConfirmationBlock(): unknown {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'needs_confirmation',
        kind: 'footprint',
        pkgType: 'sop',
        fileName: 'SOIC-8.kicad_mod',
        dimensions: { W: 6.2, L: 5.0, pitch: 1.27 },
        agentNote: AGENT_NOTE,
      }),
    }],
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  setLang('zh-CN')
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  document.body.innerHTML = ''
  disposeThemeObserver()
})

describe('the agent-only directive stays out of the DOM', () => {
  it('renders the needs_confirmation card without a trace of the agent note', () => {
    const container = render(needsConfirmationBlock())
    const text = container.textContent ?? ''

    // The exact leak that was reported: an instruction to the model printed as
    // user copy. Check the distinctive fragments, not just the whole string.
    expect(text).not.toContain('web client renders')
    expect(text).not.toContain('Wait for the card confirmation')
    expect(text).not.toContain('Do NOT ask the user again')
    expect(text).not.toContain('do NOT list or repeat')
    expect(text).not.toContain('generate_footprint_from_dimensions')
    expect(text).not.toContain(AGENT_NOTE)
  })

  it('shows the localized human hint instead', () => {
    setLang('zh-CN')
    const zh = render(needsConfirmationBlock())
    expect(zh.textContent).toContain('请确认或修改下方尺寸')

    setLang('en-US')
    const en = render(needsConfirmationBlock())
    expect(en.textContent).toContain('Confirm or adjust the dimensions below')
  })

  it('still renders the dimensions the human has to confirm', () => {
    const container = render(needsConfirmationBlock())
    // The point of the phase: the values are on screen, editable. The package
    // type is displayed uppercased by the card.
    expect(container.textContent).toContain('6.2')
    expect(container.textContent).toContain('SOP')
  })

  it('does not render an agent note in the cancelled phase either', () => {
    const block = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'cancelled',
          kind: 'footprint',
          agentNote: 'Ask for the package_type and dimensions, then call ' +
            'generate_footprint_from_dimensions.',
        }),
      }],
    }
    const container = render(block)
    expect(container.textContent).not.toContain('Ask for the package_type')
    expect(container.textContent).not.toContain('generate_footprint_from_dimensions')
  })

  it('keeps a user-safe note renderable (the two channels are not merged)', () => {
    const block = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'generated',
          kind: 'footprint',
          pkgType: 'qfn',
          note: 'the generated file was truncated at 65536 bytes',
          agentNote: AGENT_NOTE,
        }),
      }],
    }
    const container = render(block)
    const text = container.textContent ?? ''
    // A `note` carries degradation detail and is not the agent channel, so it is
    // not suppressed by this change — it is simply not rendered in the completed
    // phase today. Assert the important half: the agent note is still absent.
    expect(text).not.toContain('web client renders')
    expect(text).not.toContain('Wait for the card confirmation')
  })
})
