import { describe, expect, it, vi } from 'vitest'
import { createPartSearch } from '../src/service.js'

/** A typed fetch stub returning a Huaqiu-style success envelope. */
function stubFetch(envelope: Record<string, unknown>) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(envelope), { status: 200 }),
  )
  return { fn, calls: () => fn.mock.calls as Array<[RequestInfo | URL, RequestInit?]> }
}

describe('createPartSearch service adapter', () => {
  it('returns a service exposing the four normalized operations', () => {
    const service = createPartSearch({ fetch: stubFetch({ code: 200000 }).fn })
    expect(typeof service.searchParts).toBe('function')
    expect(typeof service.getPart).toBe('function')
    expect(typeof service.getEdaModels).toBe('function')
    expect(typeof service.getSupplyChain).toBe('function')
  })

  it('searchParts normalizes a queryPage envelope into the domain model', async () => {
    const { fn, calls } = stubFetch({
      code: 200000,
      pageNum: 1,
      pageSize: 10,
      pages: 1,
      total: 1,
      result: [
        {
          mpn: 'STM32F103C8T6',
          manufacturer: 'STMicroelectronics',
          manufacturer_id: '7189',
          package: 'LQFP-48',
          Description: 'MCU 32-bit ARM Cortex-M3',
        },
      ],
    })
    const service = createPartSearch({ fetch: fn })
    const page = await service.searchParts({ query: 'STM32F103', requireEdaModel: true })

    expect(page).toEqual({
      page: 1,
      pageSize: 10,
      pages: 1,
      total: 1,
      items: [
        expect.objectContaining({
          mpn: 'STM32F103C8T6',
          manufacturer: { id: '7189', name: 'STMicroelectronics' },
          package: 'LQFP-48',
          description: 'MCU 32-bit ARM Cortex-M3',
          // EDA-model filter defaults to true: the search API guarantees the
          // returned parts have symbol/footprint availability.
          hasSymbol: true,
          hasFootprint: true,
          has3dModel: false,
          hasSimulationModel: false,
        }),
      ],
    })

    // The adapter must talk to the Huaqiu endpoint with the query + flag.
    const [url, init] = calls()[0]!
    expect(String(url)).toContain('/api/chiplet/products/kicad/queryPage')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ desc: 'STM32F103', haveEdaModel: 1 })
  })

  it('propagates typed library errors (non-200000 business code)', async () => {
    const { fn } = stubFetch({ code: 404, message: 'not found' })
    const service = createPartSearch({ fetch: fn })
    await expect(service.getPart({ manufacturerId: '7189', mpn: 'NOPE' })).rejects.toMatchObject({
      name: 'PartSearchApiError',
      code: 404,
    })
  })
})
