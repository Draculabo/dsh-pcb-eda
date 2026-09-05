import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AddressInfo } from 'node:net'
import { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler } from '../src/routes.js'
import { HuaqiuArtifactService } from '../src/service.js'

describe('artifact content disposition', () => {
  let root: string
  let server: http.Server
  let base: string
  let service: HuaqiuArtifactService

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifacts-header-test-'))
    service = new HuaqiuArtifactService({ baseDir: root })
    server = http.createServer(createArtifactsHandler(service))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('percent-encodes RFC 5987 filename delimiters', async () => {
    const artifact = await service.create({
      type: 'zip',
      filename: "Bob's (final)*.zip",
      content: 'zip',
    })

    const response = await fetch(`${base}${ARTIFACTS_ROUTE_PREFIX}/${artifact.id}/content`)

    expect({
      status: response.status,
      disposition: response.headers.get('content-disposition'),
      body: await response.text(),
    }).toEqual({
      status: 200,
      disposition: "inline; filename*=UTF-8''Bob%27s%20%28final%29%2A.zip",
      body: 'zip',
    })
  })
})
