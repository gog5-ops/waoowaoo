import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'flow-bridge',
  apiKey: 'test-key',
  baseUrl: 'http://bridge.test',
})))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { createFlowBridgeImageTask } from '@/lib/generators/flow-bridge-client'

const BASE_PARAMS = {
  userId: 'user-1',
  providerId: 'flow-bridge',
  prompt: 'a beautiful scene',
}

function makeOkFetch(taskId = 'task123') {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ task_id: taskId }),
  }))
}

describe('createFlowBridgeImageTask – media reuse routing', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'flow-bridge',
      apiKey: 'test-key',
      baseUrl: 'http://bridge.test',
    })
    fetchSpy = makeOkFetch()
    vi.stubGlobal('fetch', fetchSpy)
  })

  // -----------------------------------------------------------------------
  // Case 1: only referenceMediaIds, no referenceImages → /v1/images/edit
  // -----------------------------------------------------------------------
  it('only referenceMediaIds → POST /v1/images/edit with reference_media_ids, no reference_images', async () => {
    await createFlowBridgeImageTask({
      ...BASE_PARAMS,
      referenceMediaIds: ['media-1', 'media-2'],
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://bridge.test/v1/images/edit')

    const body = JSON.parse(init.body as string)
    expect(body.reference_media_ids).toEqual(['media-1', 'media-2'])
    expect(body).not.toHaveProperty('reference_images')
  })

  // -----------------------------------------------------------------------
  // Case 2: both referenceImages AND referenceMediaIds → /v1/images/edit
  // -----------------------------------------------------------------------
  it('both referenceImages and referenceMediaIds → POST /v1/images/edit with both fields', async () => {
    await createFlowBridgeImageTask({
      ...BASE_PARAMS,
      referenceImages: ['https://example.com/img.jpg'],
      referenceMediaIds: ['media-1'],
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://bridge.test/v1/images/edit')

    const body = JSON.parse(init.body as string)
    expect(body.reference_images).toEqual([{ url: 'https://example.com/img.jpg' }])
    expect(body.reference_media_ids).toEqual(['media-1'])
  })

  // -----------------------------------------------------------------------
  // Case 3: only referenceImages, no media ids → /v1/images/edit
  // -----------------------------------------------------------------------
  it('only referenceImages → POST /v1/images/edit with reference_images, no reference_media_ids', async () => {
    await createFlowBridgeImageTask({
      ...BASE_PARAMS,
      referenceImages: ['https://example.com/img.jpg'],
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://bridge.test/v1/images/edit')

    const body = JSON.parse(init.body as string)
    expect(body.reference_images).toEqual([{ url: 'https://example.com/img.jpg' }])
    expect(body).not.toHaveProperty('reference_media_ids')
  })

  // -----------------------------------------------------------------------
  // Case 4: neither images nor media ids → /v1/images/generate
  // -----------------------------------------------------------------------
  it('neither images nor media ids → POST /v1/images/generate with no reference fields', async () => {
    await createFlowBridgeImageTask({ ...BASE_PARAMS })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://bridge.test/v1/images/generate')

    const body = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty('reference_images')
    expect(body).not.toHaveProperty('reference_media_ids')
  })

  // -----------------------------------------------------------------------
  // Case 5: response missing task_id → throws FLOW_BRIDGE_TASK_ID_MISSING
  // -----------------------------------------------------------------------
  it('response missing task_id → throws FLOW_BRIDGE_TASK_ID_MISSING', async () => {
    fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ not_a_task_id: 'whatever' }),
    }))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(createFlowBridgeImageTask({ ...BASE_PARAMS }))
      .rejects.toThrow('FLOW_BRIDGE_TASK_ID_MISSING')
  })

  // -----------------------------------------------------------------------
  // Case 6: non-OK response with detail → throws with that detail message
  // -----------------------------------------------------------------------
  it('non-OK response with detail → throws with detail message', async () => {
    fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Invalid model specified' }),
    }))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(createFlowBridgeImageTask({ ...BASE_PARAMS }))
      .rejects.toThrow('Invalid model specified')
  })

  // -----------------------------------------------------------------------
  // Case 7: returned GenerateResult shape
  // -----------------------------------------------------------------------
  it('returns GenerateResult with async=true, correct externalId and requestId', async () => {
    const result = await createFlowBridgeImageTask({ ...BASE_PARAMS })

    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task123',
      externalId: 'BRIDGE:IMAGE:task123',
    })
  })
})
