import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock prisma
const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    flowMediaHistory: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

import { saveFlowMediaHistory, queryFlowMediaHistory } from '@/lib/flow-media-history'

describe('saveFlowMediaHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 for empty entries', async () => {
    const result = await saveFlowMediaHistory([])
    expect(result).toBe(0)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('inserts new entries that do not exist', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'new-id' })

    const result = await saveFlowMediaHistory([
      {
        flowProjectId: 'proj-1',
        mediaType: 'IMAGE',
        flowMediaId: 'media-abc',
        sourceTaskId: 'task-1',
        prompt: 'a cat',
        model: 'gemini-flash',
      },
    ])

    expect(result).toBe(1)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { flowProjectId: 'proj-1', flowMediaId: 'media-abc' },
      select: { id: true },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        flowProjectId: 'proj-1',
        mediaType: 'IMAGE',
        flowMediaId: 'media-abc',
        sourceTaskId: 'task-1',
        prompt: 'a cat',
        model: 'gemini-flash',
      },
    })
  })

  it('skips entries that already exist', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-id' })

    const result = await saveFlowMediaHistory([
      {
        flowProjectId: 'proj-1',
        mediaType: 'VIDEO',
        flowMediaId: 'media-xyz',
      },
    ])

    expect(result).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('handles mixed new and existing entries', async () => {
    mockFindFirst
      .mockResolvedValueOnce(null)        // first entry: new
      .mockResolvedValueOnce({ id: 'x' }) // second entry: exists
      .mockResolvedValueOnce(null)         // third entry: new
    mockCreate.mockResolvedValue({ id: 'new' })

    const result = await saveFlowMediaHistory([
      { flowProjectId: 'p', mediaType: 'IMAGE', flowMediaId: 'a' },
      { flowProjectId: 'p', mediaType: 'IMAGE', flowMediaId: 'b' },
      { flowProjectId: 'p', mediaType: 'IMAGE', flowMediaId: 'c' },
    ])

    expect(result).toBe(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('sets optional fields to null when not provided', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'id' })

    await saveFlowMediaHistory([
      { flowProjectId: 'p', mediaType: 'VIDEO', flowMediaId: 'm' },
    ])

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        flowProjectId: 'p',
        mediaType: 'VIDEO',
        flowMediaId: 'm',
        sourceTaskId: null,
        prompt: null,
        model: null,
      },
    })
  })
})

describe('queryFlowMediaHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with default limit and no cursor', async () => {
    const now = new Date()
    mockFindMany.mockResolvedValue([
      { id: '1', flowMediaId: 'm1', mediaType: 'IMAGE', sourceTaskId: null, prompt: null, model: null, createdAt: now },
    ])

    const result = await queryFlowMediaHistory({ flowProjectId: 'proj-1' })

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBeUndefined()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flowProjectId: 'proj-1' },
        orderBy: { createdAt: 'desc' },
        take: 51, // default 50 + 1
      }),
    )
  })

  it('filters by mediaType when provided', async () => {
    mockFindMany.mockResolvedValue([])

    await queryFlowMediaHistory({ flowProjectId: 'proj-1', mediaType: 'VIDEO' })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flowProjectId: 'proj-1', mediaType: 'VIDEO' },
      }),
    )
  })

  it('returns nextCursor when there are more items', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      id: `id-${i}`,
      flowMediaId: `m-${i}`,
      mediaType: 'IMAGE',
      sourceTaskId: null,
      prompt: null,
      model: null,
      createdAt: new Date(),
    }))
    mockFindMany.mockResolvedValue(items)

    const result = await queryFlowMediaHistory({ flowProjectId: 'p', limit: 3 })

    expect(result.items).toHaveLength(3)
    expect(result.nextCursor).toBe('id-2')
  })

  it('caps limit at 200', async () => {
    mockFindMany.mockResolvedValue([])

    await queryFlowMediaHistory({ flowProjectId: 'p', limit: 500 })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 201 }), // 200 + 1
    )
  })
})
