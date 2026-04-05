import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'flow-bridge',
  apiKey: 'bridge-key',
  baseUrl: 'http://bridge.test',
})))

const saveFlowMediaHistoryMock = vi.hoisted(() => vi.fn(async () => 0))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(async () => []),
}))

vi.mock('@/lib/flow-media-history', () => ({
  saveFlowMediaHistory: saveFlowMediaHistoryMock,
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll BRIDGE input_media_ids history saving', () => {
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

  it('saves input_media_ids to history on completed task', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          project_id: 'proj-abc',
          model: 'gemini-flash',
          prompt: 'a dog',
          result: {
            asset_id: 'asset_1',
            input_media_ids: ['media-111', 'media-222'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_with_media', 'user-1')

    expect(result.status).toBe('completed')
    expect(saveFlowMediaHistoryMock).toHaveBeenCalledOnce()
    expect(saveFlowMediaHistoryMock).toHaveBeenCalledWith([
      {
        flowProjectId: 'proj-abc',
        mediaType: 'IMAGE',
        flowMediaId: 'media-111',
        sourceTaskId: 'task_with_media',
        model: 'gemini-flash',
        prompt: 'a dog',
      },
      {
        flowProjectId: 'proj-abc',
        mediaType: 'IMAGE',
        flowMediaId: 'media-222',
        sourceTaskId: 'task_with_media',
        model: 'gemini-flash',
        prompt: 'a dog',
      },
    ])
  })

  it('sets mediaType to VIDEO for video tasks', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          project_id: 'proj-vid',
          result: {
            asset_id: 'asset_2',
            input_media_ids: ['media-v1'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/vid.mp4',
        }),
      })

    await pollAsyncTask('BRIDGE:VIDEO:task_video', 'user-1')

    expect(saveFlowMediaHistoryMock).toHaveBeenCalledWith([
      expect.objectContaining({
        mediaType: 'VIDEO',
        flowMediaId: 'media-v1',
      }),
    ])
  })

  it('skips history save when input_media_ids is empty', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          project_id: 'proj-1',
          result: {
            asset_id: 'asset_3',
            input_media_ids: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    await pollAsyncTask('BRIDGE:IMAGE:task_empty', 'user-1')

    expect(saveFlowMediaHistoryMock).not.toHaveBeenCalled()
  })

  it('skips history save when project_id is missing', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            asset_id: 'asset_4',
            input_media_ids: ['media-x'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    await pollAsyncTask('BRIDGE:IMAGE:task_no_proj', 'user-1')

    expect(saveFlowMediaHistoryMock).not.toHaveBeenCalled()
  })

  it('does not fail the poll if history save throws', async () => {
    saveFlowMediaHistoryMock.mockRejectedValueOnce(new Error('DB error'))

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          project_id: 'proj-err',
          result: {
            asset_id: 'asset_5',
            input_media_ids: ['media-err'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    const result = await pollAsyncTask('BRIDGE:IMAGE:task_db_error', 'user-1')

    // Should still complete successfully despite history save failure
    expect(result.status).toBe('completed')
    expect(result.imageUrl).toBe('https://cdn.example.com/img.png')
  })

  it('filters out non-string values from input_media_ids', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          project_id: 'proj-filter',
          result: {
            asset_id: 'asset_6',
            input_media_ids: ['valid-id', 42, null, 'another-id'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          public_url: 'https://cdn.example.com/img.png',
        }),
      })

    await pollAsyncTask('BRIDGE:IMAGE:task_filter', 'user-1')

    expect(saveFlowMediaHistoryMock).toHaveBeenCalledWith([
      expect.objectContaining({ flowMediaId: 'valid-id' }),
      expect.objectContaining({ flowMediaId: 'another-id' }),
    ])
  })
})
