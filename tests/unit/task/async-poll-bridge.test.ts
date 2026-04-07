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

  it('returns inputMediaIds from task payload result', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_abc',
            input_media_ids: ['m1', 'm2'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_input_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/img.png',
      imageUrl: 'https://cdn.example.com/img.png',
      inputMediaIds: ['m1', 'm2'],
    })
  })

  it('returns outputMediaId from flow_media_id in task payload result', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_abc',
            flow_media_id: 'out-123',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_flow_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/img.png',
      imageUrl: 'https://cdn.example.com/img.png',
      outputMediaId: 'out-123',
    })
  })

  it('extracts media ids from asset payload when not present in task payload', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: { asset_id: 'asset_abc' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
          input_media_ids: ['am1', 'am2'],
          flow_media_id: 'aout-456',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_asset_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/img.png',
      imageUrl: 'https://cdn.example.com/img.png',
      inputMediaIds: ['am1', 'am2'],
      outputMediaId: 'aout-456',
    })
  })

  it('returns both inputMediaIds and outputMediaId when both present', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_abc',
            input_media_ids: ['m1', 'm2'],
            flow_media_id: 'out-789',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/video.mp4',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:VIDEO:task_both_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/video.mp4',
      videoUrl: 'https://cdn.example.com/video.mp4',
      inputMediaIds: ['m1', 'm2'],
      outputMediaId: 'out-789',
    })
  })

  it('returns neither media field when payload has no media ids', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: { asset_id: 'asset_abc' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_no_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/img.png',
      imageUrl: 'https://cdn.example.com/img.png',
    })
    expect(result).not.toHaveProperty('inputMediaIds')
    expect(result).not.toHaveProperty('outputMediaId')
  })

  it('filters out non-string and empty values from input_media_ids', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_abc',
            // mix of valid, empty string, and non-string
            input_media_ids: ['valid-id', '', 42, null, '  ', 'another-id'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_filtered_media', 'user-1')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/img.png',
      imageUrl: 'https://cdn.example.com/img.png',
      inputMediaIds: ['valid-id', 'another-id'],
    })
  })

  it('omits inputMediaIds when all input_media_ids values are filtered out', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_abc',
            input_media_ids: ['', '   ', 0, null],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_all_filtered', 'user-1')
    expect(result).not.toHaveProperty('inputMediaIds')
  })
})
