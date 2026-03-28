import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'flow-bridge',
  apiKey: 'bridge-key',
  baseUrl: 'http://bridge.test',
})))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(async () => []),
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll BRIDGE task status mapping', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'flow-bridge',
      apiKey: 'bridge-key',
      baseUrl: 'http://bridge.test',
    })
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  it('maps queued/running to pending', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'queued' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running' }),
      })

    const queued = await pollAsyncTask('BRIDGE:IMAGE:task_queued', 'user-1')
    const running = await pollAsyncTask('BRIDGE:VIDEO:task_running', 'user-1')

    expect(queued).toEqual({ status: 'pending' })
    expect(running).toEqual({ status: 'pending' })
  })

  it('maps completed task to asset lookup result', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: { asset_id: 'asset_123' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/image.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_done', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/image.png',
      imageUrl: 'https://cdn.example.com/image.png',
    })
  })

  it('maps failed task to failed result', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'failed',
        error: { message: 'bridge task failed' },
      }),
    })

    const result = await pollAsyncTask('BRIDGE:VIDEO:task_fail', 'user-1')
    expect(result).toEqual({
      status: 'failed',
      error: 'bridge task failed',
    })
  })
})
