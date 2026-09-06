/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepToolCardVisible } from '../src/index.js'

describe('keepToolCardVisible in the browser', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('reveals only matching cards while leaving skipped and unrelated seats collapsed', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    document.body.innerHTML = `
      <section id="preview" data-turn-process-hidden hidden>
        <div class="hq-genhit"></div>
      </section>
      <section id="login" data-turn-process-hidden hidden>
        <div class="hq-genhit"><div class="hq-genhit__login"></div></div>
      </section>
      <section id="other" data-turn-process-hidden hidden>
        <div class="another-tool"></div>
      </section>
    `

    const dispose = keepToolCardVisible('.hq-genhit', {
      skipWhenContains: '.hq-genhit__login',
    })

    expect({
      previewHidden: document.querySelector('#preview')?.hasAttribute('hidden'),
      loginHidden: document.querySelector('#login')?.hasAttribute('hidden'),
      otherHidden: document.querySelector('#other')?.hasAttribute('hidden'),
    }).toEqual({
      previewHidden: false,
      loginHidden: true,
      otherHidden: true,
    })

    dispose()
  })
})
