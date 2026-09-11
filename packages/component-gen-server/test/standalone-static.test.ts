import { get } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStandaloneServer, type StandaloneServer } from '../src/standalone.js'

let app: StandaloneServer | undefined
let tempDir: string | undefined

afterEach(async () => {
  await app?.close()
  app = undefined

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('standalone static files', () => {
  it('rejects traversal into a sibling directory with the same path prefix', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'component-gen-standalone-'))
    const appDist = join(tempDir, 'app')
    const sibling = join(tempDir, 'app-outside')
    await mkdir(appDist)
    await mkdir(sibling)
    await writeFile(join(appDist, 'index.html'), '<main>app</main>')
    await writeFile(join(sibling, 'secret.txt'), 'sensitive data')

    app = await createStandaloneServer({
      port: 0,
      appDist,
      historyDir: join(tempDir, 'history'),
      artifactsDir: join(tempDir, 'artifacts'),
    })

    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('standalone server did not bind to a TCP port')
    }

    const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
      const request = get(
        {
          host: '127.0.0.1',
          port: address.port,
          path: '/../app-outside/secret.txt',
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body })
          })
        },
      )
      request.on('error', reject)
    })

    expect(response).toEqual({
      statusCode: 403,
      body: 'forbidden',
    })
  })
})
