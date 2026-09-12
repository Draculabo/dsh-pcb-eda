import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLogDir } from '../src/paths.js'

describe('getLogDir', () => {
  const baseDir = join(tmpdir(), 'dsh-plugin-log-paths')

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
