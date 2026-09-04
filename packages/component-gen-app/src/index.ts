/**
 * `@huaqiu/component-gen-app` — public exports.
 *
 * The app is a portable React library: the DSH plugin imports these components
 * and wires `ComponentGenPorts`; the standalone build mounts `main.tsx`.
 */
export { ComponentGenApp, type ComponentGenAppProps } from './App.js'
export { SymbolGenPage, type SymbolGenPageProps } from './pages/SymbolGenPage.js'
export { FootprintGenPage, type FootprintGenPageProps } from './pages/FootprintGenPage.js'

export { GeometryEditor, type GeometryEditorProps } from './components/GeometryEditor.js'
export { PreviewStage, type PreviewStageProps } from './components/PreviewStage.js'
export { ResultStage, type ResultStageProps } from './components/ResultStage.js'
export { UploadInput, type UploadInputProps, fileToDataUrl } from './components/UploadInput.js'
export { HistoryPanel, type HistoryPanelProps } from './components/HistoryPanel.js'

export { createHttpPorts, defaultArtifactsBase, type HttpPortsOptions } from './api/component-gen-client.js'
export type {
  ComponentGenPorts,
  ComponentGenAuthPort,
  ComponentGenConfig,
  ComponentGenPage,
  HistoryEntry,
  HistoryPage,
  HistoryPatch,
  HistoryQuery,
  JobEvent,
  JobInput,
  JobKind,
  JobState,
  StartJobRequest,
} from './ports.js'

export { translateFor, translate, defaultT, type Translate } from './copy/index.js'
export { ZH, EN } from './copy/index.js'

export { injectAppStyles, removeAppStyles, APP_STYLE_ID } from './styles/inject.js'
