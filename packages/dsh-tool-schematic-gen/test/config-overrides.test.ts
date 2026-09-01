import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_LANGUAGE,
  DEFAULT_COPILOTKIT_URL,
  DEFAULT_EXPORT_ZIP_URL,
  resolveConfig,
} from '../src/config.js'

describe('resolveConfig override normalization', () => {
  it('trims non-empty string overrides', () => {
    expect(resolveConfig({
      HQ_EDA_COPILOTKIT_URL: '  https://stg.example/api/copilotkit  ',
      HQ_EDA_EXPORT_ZIP_URL: '\thttps://stg.example/export-zip\n',
      HQ_EDA_DEFAULT_LANGUAGE: '  English  ',
    })).toEqual({
      copilotkitUrl: 'https://stg.example/api/copilotkit',
      exportZipUrl: 'https://stg.example/export-zip',
      cookie: null,
      defaultLanguage: 'English',
    })
  })

  it('falls back when string overrides contain only whitespace', () => {
    expect(resolveConfig({
      HQ_EDA_COPILOTKIT_URL: '   ',
      HQ_EDA_EXPORT_ZIP_URL: '\t',
      HQ_EDA_DEFAULT_LANGUAGE: '\n',
    })).toEqual({
      copilotkitUrl: DEFAULT_COPILOTKIT_URL,
      exportZipUrl: DEFAULT_EXPORT_ZIP_URL,
      cookie: null,
      defaultLanguage: DEFAULT_AGENT_LANGUAGE,
    })
  })
})
