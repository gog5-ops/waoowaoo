import { prisma } from '@/lib/prisma'

export const FLOW_MEDIA_ROLE = {
  INPUT_REFERENCE: 'INPUT_REFERENCE',
  OUTPUT_RESULT: 'OUTPUT_RESULT',
} as const

export type FlowMediaRole = (typeof FLOW_MEDIA_ROLE)[keyof typeof FLOW_MEDIA_ROLE]

export const FLOW_MEDIA_RESOURCE_TYPE = {
  CHARACTER_APPEARANCE: 'CHARACTER_APPEARANCE',
  LOCATION_IMAGE: 'LOCATION_IMAGE',
  NOVEL_PROMOTION_PANEL: 'NOVEL_PROMOTION_PANEL',
  GLOBAL_CHARACTER_APPEARANCE: 'GLOBAL_CHARACTER_APPEARANCE',
  GLOBAL_LOCATION_IMAGE: 'GLOBAL_LOCATION_IMAGE',
} as const

export type FlowMediaResourceType = (typeof FLOW_MEDIA_RESOURCE_TYPE)[keyof typeof FLOW_MEDIA_RESOURCE_TYPE]

type FlowMediaHistoryRow = {
  id: string
  resourceType: string
  resourceId: string
  projectId: string
  flowMediaId: string
  role: string
  parentFlowMediaId: string | null
  sourceImageUrl: string | null
  isCurrent: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

type FlowMediaHistoryModel = {
  findMany: (args: unknown) => Promise<unknown>
  findFirst: (args: unknown) => Promise<unknown>
  create: (args: unknown) => Promise<unknown>
  updateMany: (args: unknown) => Promise<unknown>
}

const flowMediaHistoryModel = (prisma as unknown as { flowMediaHistory: FlowMediaHistoryModel }).flowMediaHistory

function asRow(value: unknown): FlowMediaHistoryRow | null {
  if (!value || typeof value !== 'object') return null
  return value as FlowMediaHistoryRow
}

async function findHistoryEntry(params: {
  resourceType: FlowMediaResourceType
  resourceId: string
  projectId: string
  flowMediaId: string
  role: FlowMediaRole
}): Promise<FlowMediaHistoryRow | null> {
  if (!flowMediaHistoryModel) return null
  const row = await flowMediaHistoryModel.findFirst({
    where: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId: params.projectId,
      flowMediaId: params.flowMediaId,
      role: params.role,
    },
  })
  return asRow(row)
}

async function markCurrentByRole(params: {
  resourceType: FlowMediaResourceType
  resourceId: string
  projectId: string
  role: FlowMediaRole
  flowMediaId: string
}) {
  if (!flowMediaHistoryModel) return
  await flowMediaHistoryModel.updateMany({
    where: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId: params.projectId,
      role: params.role,
    },
    data: {
      isCurrent: false,
    },
  })
  await flowMediaHistoryModel.updateMany({
    where: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId: params.projectId,
      role: params.role,
      flowMediaId: params.flowMediaId,
    },
    data: {
      isCurrent: true,
    },
  })
}

export async function recordFlowMediaHistory(params: {
  resourceType: FlowMediaResourceType
  resourceId: string
  projectId?: string
  sourceImageUrl?: string | null
  inputFlowMediaIds?: string[]
  outputFlowMediaId?: string | null
  parentFlowMediaId?: string | null
}) {
  if (!flowMediaHistoryModel) return
  const projectId = typeof params.projectId === 'string' ? params.projectId.trim() : ''
  if (!projectId) return

  const inputIds = (params.inputFlowMediaIds || []).map((item) => item.trim()).filter(Boolean)
  for (const flowMediaId of inputIds) {
    const existing = await findHistoryEntry({
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId,
      flowMediaId,
      role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
    })
    if (!existing) {
      await flowMediaHistoryModel.create({
        data: {
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          projectId,
          flowMediaId,
          role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
          parentFlowMediaId: null,
          sourceImageUrl: params.sourceImageUrl || null,
          isCurrent: true,
        },
      })
    }
    await markCurrentByRole({
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId,
      role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
      flowMediaId,
    })
  }

  const outputFlowMediaId = typeof params.outputFlowMediaId === 'string' ? params.outputFlowMediaId.trim() : ''
  if (!outputFlowMediaId) return

  const existingOutput = await findHistoryEntry({
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    projectId,
    flowMediaId: outputFlowMediaId,
    role: FLOW_MEDIA_ROLE.OUTPUT_RESULT,
  })
  if (!existingOutput) {
    await flowMediaHistoryModel.create({
      data: {
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        projectId,
        flowMediaId: outputFlowMediaId,
        role: FLOW_MEDIA_ROLE.OUTPUT_RESULT,
        parentFlowMediaId: params.parentFlowMediaId || inputIds[0] || null,
        sourceImageUrl: params.sourceImageUrl || null,
        isCurrent: true,
      },
    })
  }
  await markCurrentByRole({
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    projectId,
    role: FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    flowMediaId: outputFlowMediaId,
  })
}

export async function getPreferredFlowMediaId(params: {
  resourceType: FlowMediaResourceType
  resourceId: string
  projectId?: string
}): Promise<string | undefined> {
  if (!flowMediaHistoryModel) return undefined
  const projectId = typeof params.projectId === 'string' ? params.projectId.trim() : ''
  if (!projectId) return undefined

  const rows = await flowMediaHistoryModel.findMany({
    where: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      projectId,
      isCurrent: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  }) as unknown[]

  const normalized = rows.map(asRow).filter((row): row is FlowMediaHistoryRow => !!row)
  const currentOutput = normalized.find((row) => row.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT)
  if (currentOutput?.flowMediaId) return currentOutput.flowMediaId
  const currentInput = normalized.find((row) => row.role === FLOW_MEDIA_ROLE.INPUT_REFERENCE)
  return currentInput?.flowMediaId || undefined
}
