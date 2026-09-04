/**
 * `@huaqiu/component-gen-app` — the app shell.
 *
 * Renders one of the two generation pages (the host opens the page directly),
 * plus an optional history section. Completely DSH-agnostic — everything the
 * app needs comes through `ComponentGenPorts`.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { ComponentGenPage, ComponentGenPorts, ReopenRequest } from './ports.js'
import { translateFor, type Translate } from './copy/index.js'
import { SymbolGenPage } from './pages/SymbolGenPage.js'
import { FootprintGenPage } from './pages/FootprintGenPage.js'
import { HistoryPanel } from './components/HistoryPanel.js'

export interface ComponentGenAppProps {
  ports: ComponentGenPorts
  page: ComponentGenPage
  /** host UI language: 'zh' | 'en' (default zh). */
  lang?: string
  showHistory?: boolean
  onClose?: () => void
}

export function ComponentGenApp(props: ComponentGenAppProps): ReactElement {
  const { ports, page, lang, showHistory = true, onClose } = props
  const t: Translate = useMemo(() => translateFor(lang), [lang])
  const [historyOpen, setHistoryOpen] = useState(showHistory)
  const [reopenReq, setReopenReq] = useState<ReopenRequest | null>(null)
  // Only forward a reopen request whose kind matches the active page (history
  // is already filtered by activeKind, but the request must not leak across a
  // tab switch).
  const pageReopen = reopenReq && reopenReq.entry.kind === page ? reopenReq : null

  return (
    <div className="cga-app">
      <div className="cga-app__head">
        <span className="cga-app__head-title">
          {t('app.title')} — {page === 'symbol' ? t('app.symbolTitle') : t('app.footprintTitle')}
        </span>
        {onClose ? <button type="button" className="cga-app__head-close" onClick={onClose}>{t('app.close')}</button> : null}
      </div>

      {page === 'symbol'
        ? <SymbolGenPage ports={ports} t={t} reopen={pageReopen} />
        : <FootprintGenPage ports={ports} t={t} reopen={pageReopen} />}

      {historyOpen
        ? (
          <div className="cga-panel">
            <div className="cga-panel__body">
              <div className="cga-app__head">
                <span className="cga-app__head-title">{t('history.title')}</span>
              </div>
              <HistoryPanel
                ports={ports}
                t={t}
                activeKind={page}
                onReopen={(entry) => setReopenReq((prev) => ({ n: (prev?.n ?? 0) + 1, entry }))}
              />
            </div>
          </div>
        )
        : (
          <button type="button" className="cga-btn" onClick={() => setHistoryOpen(true)}>
            {t('history.title')}
          </button>
        )}
    </div>
  )
}
