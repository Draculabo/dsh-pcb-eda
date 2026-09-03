/**
 * `@huaqiu/dsh-tool-uncollapse` — keep a plugin's tool-call preview card
 * visible in DSH's compact transcript, without patching DSH.
 *
 * DSH collapses `tool-call` nodes behind a "N tool calls" disclosure by setting
 * `hidden="until-found"` on the chat-node wrapper once the turn closes (see
 * `ui-chat`'s `ChatNodeSeat` + `useSearchableHidden`). That hides the entire
 * card (preview included). A plugin cannot prevent it from inside the card and
 * must not patch DSH, so we undo it from the plugin's client half: for every
 * collapsed seat that wraps the plugin's card, remove the `hidden` attribute.
 * A rAF-coalesced MutationObserver reasserts this whenever DSH's virtualized
 * renderer re-adds it.
 *
 * Scoped to the plugin's cards only — other tools keep collapsing. Returns a
 * disposer (or a no-op when there is no DOM, e.g. SSR/tests).
 *
 * @param cardRootSelector - CSS selector matching the plugin card's root
 *   element, e.g. `.hq-genhit` (symbol/footprint) or `.hq-sch` (schematic).
 * @returns cleanup function; safe to call repeatedly.
 */
export function keepToolCardVisible(cardRootSelector: string): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const root = document.documentElement
  const revealSeat = (seat: HTMLElement): void => {
    if (seat.querySelector(cardRootSelector)) seat.removeAttribute('hidden')
  }
  let scheduled = false
  const sweep = (): void => {
    scheduled = false
    for (const seat of root.querySelectorAll<HTMLElement>('[data-turn-process-hidden]')) {
      revealSeat(seat)
    }
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(sweep)
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-turn-process-hidden'],
  })
  sweep()
  return () => {
    observer.disconnect()
    scheduled = false
  }
}
