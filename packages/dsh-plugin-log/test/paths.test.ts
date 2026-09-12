import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { getLogDir } from '../src/paths.js'

describe('getLogDir', () => {
  const baseDir = resolve('/tmp', 'dsh-plugin-log-paths')

  it('resolves a component inside the log base', () => {
    expect(getLogDir('dsh-plugins', baseDir)).toBe(join(baseDir, 'dsh-plugins'))
  })

  it('rejects component paths that escape the log base', () => {
    expect(() => getLogDir('../outside', baseDir)).toThrow('Invalid log component path')
    expect(() => getLogDir(resolve(baseDir, '..', 'outside'), baseDir)).toThrow(
      'Invalid log component path',
    )
  })
})
