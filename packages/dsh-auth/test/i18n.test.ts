import { describe, expect, it } from 'vitest'
import { translate } from '../src/client/i18n.js'

describe('translate', () => {
  it('interpolates only own parameters', () => {
    const params = Object.create({ tool: 'inherited-tool' }) as Record<string, unknown>
    params.nickname = 'Alice'

    expect({
      tool: translate('en', 'card.tool', params),
      nickname: translate('en', 'card.nicknameSep', params),
    }).toEqual({
      tool: 'Tool: {tool}',
      nickname: ': Alice',
    })
  })
})
