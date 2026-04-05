import { prisma } from '@/lib/prisma'

export interface FlowMediaHistoryEntry {
  flowProjectId: string
  mediaType: 'IMAGE' | 'VIDEO'
  flowMediaId: string
  sourceTaskId?: string
  prompt?: string
  model?: string
}

/**
 * Save one or more flow media IDs to history.
 * Skips entries where the same (flowProjectId, flowMediaId) already exists.
 */
export async function saveFlowMediaHistory(
  entries: FlowMediaHistoryEntry[],
): Promise<number> {
  if (entries.length === 0) return 0

  let inserted = 0
  for (const entry of entries) {
    const existing = await prisma.flowMediaHistory.findFirst({
      where: {
        flowProjectId: entry.flowProjectId,
        flowMediaId: entry.flowMediaId,
      },
      select: { id: true },
    })
    if (!existing) {
      await prisma.flowMediaHistory.create({
        data: {
          flowProjectId: entry.flowProjectId,
          mediaType: entry.mediaType,
          flowMediaId: entry.flowMediaId,
          sourceTaskId: entry.sourceTaskId ?? null,
          prompt: entry.prompt ?? null,
          model: entry.model ?? null,
        },
      })
      inserted++
    }
  }
  return inserted
}

/**
 * Query flow media history for a project, optionally filtering by media type.
 * Returns newest-first with cursor-based pagination.
 */
export async function queryFlowMediaHistory(params: {
  flowProjectId: string
  mediaType?: 'IMAGE' | 'VIDEO'
  limit?: number
  cursor?: string
}): Promise<{
  items: {
    id: string
    flowMediaId: string
    mediaType: string
    sourceTaskId: string | null
    prompt: string | null
    model: string | null
    createdAt: Date
  }[]
  nextCursor?: string
}> {
  const take = Math.min(params.limit ?? 50, 200)

  const items = await prisma.flowMediaHistory.findMany({
    where: {
      flowProjectId: params.flowProjectId,
      ...(params.mediaType ? { mediaType: params.mediaType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      flowMediaId: true,
      mediaType: true,
      sourceTaskId: true,
      prompt: true,
      model: true,
      createdAt: true,
    },
  })

  const hasMore = items.length > take
  if (hasMore) items.pop()
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined

  return { items, nextCursor }
}
