import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStandaloneServer } from '../src/standalone.js'

describe('createStandaloneServer', () => {
  it('rejects when the requested port is already in use', async () => {
    const occupied = createServer()
    occupied.listen(0, '127.0.0.1')
    await once(occupied, 'listening')

    const address = occupied.address()
    if (!address || typeof address === 'string') {
      throw new Error('expected TCP server address')
    }

    const dir = mkdtempSync(join(tmpdir(), 'hq-cgs-listen-'))
    try {
      await expect(createStandaloneServer({
        port: address.port,
        host: '127.0.0.1',
        appDist: dir,
        historyDir: join(dir, 'history'),
        artifactsDir: join(dir, 'artifacts'),
      })).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      occupied.close()
      await once(occupied, 'close')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
