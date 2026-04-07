import { beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMock = vi.hoisted(() => vi.fn())
const findFirstMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
const updateManyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    flowMediaHistory: {
      findMany: findManyMock,
      findFirst: findFirstMock,
      create: createMock,
      updateMany: updateManyMock,
    },
  },
}))

import {
  FLOW_MEDIA_RESOURCE_TYPE,
  FLOW_MEDIA_ROLE,
  getPreferredFlowMediaId,
  recordFlowMediaHistory,
} from '@/lib/flow-media-history'

const BASE_PARAMS = {
  resourceType: FLOW_MEDIA_RESOURCE_TYPE.CHARACTER_APPEARANCE,
  resourceId: 'resource-1',
  projectId: 'project-1',
}

describe('getPreferredFlowMediaId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findManyMock.mockResolvedValue([])
    findFirstMock.mockResolvedValue(null)
    createMock.mockResolvedValue({})
    updateManyMock.mockResolvedValue({})
  })

  it('returns undefined when projectId is empty string', async () => {
    const result = await getPreferredFlowMediaId({ ...BASE_PARAMS, projectId: '' })
    expect(result).toBeUndefined()
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('returns undefined when projectId is whitespace', async () => {
    const result = await getPreferredFlowMediaId({ ...BASE_PARAMS, projectId: '   ' })
    expect(result).toBeUndefined()
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('returns undefined when projectId is missing (undefined)', async () => {
    const result = await getPreferredFlowMediaId({
      resourceType: BASE_PARAMS.resourceType,
      resourceId: BASE_PARAMS.resourceId,
    })
    expect(result).toBeUndefined()
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('returns undefined when no rows exist', async () => {
    findManyMock.mockResolvedValue([])
    const result = await getPreferredFlowMediaId(BASE_PARAMS)
    expect(result).toBeUndefined()
  })

  it('returns OUTPUT_RESULT flowMediaId when both input and output exist and are isCurrent', async () => {
    findManyMock.mockResolvedValue([
      {
        id: '1',
        resourceType: BASE_PARAMS.resourceType,
        resourceId: BASE_PARAMS.resourceId,
        projectId: BASE_PARAMS.projectId,
        flowMediaId: 'output-media-id',
        role: FLOW_MEDIA_ROLE.OUTPUT_RESULT,
        parentFlowMediaId: 'input-media-id',
        sourceImageUrl: null,
        isCurrent: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        resourceType: BASE_PARAMS.resourceType,
        resourceId: BASE_PARAMS.resourceId,
        projectId: BASE_PARAMS.projectId,
        flowMediaId: 'input-media-id',
        role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
        parentFlowMediaId: null,
        sourceImageUrl: null,
        isCurrent: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await getPreferredFlowMediaId(BASE_PARAMS)
    expect(result).toBe('output-media-id')
  })

  it('returns INPUT_REFERENCE flowMediaId when only input rows exist (fallback)', async () => {
    findManyMock.mockResolvedValue([
      {
        id: '2',
        resourceType: BASE_PARAMS.resourceType,
        resourceId: BASE_PARAMS.resourceId,
        projectId: BASE_PARAMS.projectId,
        flowMediaId: 'input-media-id',
        role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
        parentFlowMediaId: null,
        sourceImageUrl: null,
        isCurrent: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await getPreferredFlowMediaId(BASE_PARAMS)
    expect(result).toBe('input-media-id')
  })

  it('passes correct where clause to findMany', async () => {
    findManyMock.mockResolvedValue([])
    await getPreferredFlowMediaId(BASE_PARAMS)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resourceType: BASE_PARAMS.resourceType,
          resourceId: BASE_PARAMS.resourceId,
          projectId: BASE_PARAMS.projectId,
          isCurrent: true,
        }),
      }),
    )
  })
})

describe('recordFlowMediaHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findManyMock.mockResolvedValue([])
    findFirstMock.mockResolvedValue(null)
    createMock.mockResolvedValue({})
    updateManyMock.mockResolvedValue({})
  })

  it('does nothing when projectId is empty string', async () => {
    await recordFlowMediaHistory({ ...BASE_PARAMS, projectId: '' })
    expect(findFirstMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it('does nothing when projectId is whitespace', async () => {
    await recordFlowMediaHistory({ ...BASE_PARAMS, projectId: '   ' })
    expect(findFirstMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it('does nothing when projectId is missing (undefined)', async () => {
    await recordFlowMediaHistory({
      resourceType: BASE_PARAMS.resourceType,
      resourceId: BASE_PARAMS.resourceId,
    })
    expect(findFirstMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it('creates a new INPUT_REFERENCE row for each inputFlowMediaId when not already existing', async () => {
    findFirstMock.mockResolvedValue(null) // no existing row
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1', 'input-2'],
    })

    // create should be called for each input
    const createCalls = createMock.mock.calls
    const inputCreateCalls = createCalls.filter(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.INPUT_REFERENCE,
    )
    expect(inputCreateCalls).toHaveLength(2)
    expect(inputCreateCalls[0][0].data.flowMediaId).toBe('input-1')
    expect(inputCreateCalls[0][0].data.role).toBe(FLOW_MEDIA_ROLE.INPUT_REFERENCE)
    expect(inputCreateCalls[1][0].data.flowMediaId).toBe('input-2')
  })

  it('does NOT create INPUT_REFERENCE row when row already exists', async () => {
    findFirstMock.mockResolvedValue({
      id: 'existing',
      flowMediaId: 'input-1',
      role: FLOW_MEDIA_ROLE.INPUT_REFERENCE,
      isCurrent: true,
    })
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1'],
    })

    const createCalls = createMock.mock.calls.filter(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.INPUT_REFERENCE,
    )
    expect(createCalls).toHaveLength(0)
  })

  it('creates a new OUTPUT_RESULT row for outputFlowMediaId when not already existing', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1'],
      outputFlowMediaId: 'output-1',
    })

    const outputCreateCalls = createMock.mock.calls.filter(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(outputCreateCalls).toHaveLength(1)
    expect(outputCreateCalls[0][0].data.flowMediaId).toBe('output-1')
    expect(outputCreateCalls[0][0].data.role).toBe(FLOW_MEDIA_ROLE.OUTPUT_RESULT)
  })

  it('calls updateMany to mark flowMediaId as isCurrent=true and others as isCurrent=false for INPUT_REFERENCE', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1'],
    })

    // updateMany should be called twice: first to set all isCurrent=false, then specific one to true
    const updateManyCalls = updateManyMock.mock.calls
    // First call: set all INPUT_REFERENCE to isCurrent=false
    const falseCall = updateManyCalls.find(
      (call) =>
        call[0]?.data?.isCurrent === false &&
        call[0]?.where?.role === FLOW_MEDIA_ROLE.INPUT_REFERENCE &&
        !call[0]?.where?.flowMediaId,
    )
    expect(falseCall).toBeDefined()
    // Second call: set specific flowMediaId to isCurrent=true
    const trueCall = updateManyCalls.find(
      (call) =>
        call[0]?.data?.isCurrent === true &&
        call[0]?.where?.flowMediaId === 'input-1' &&
        call[0]?.where?.role === FLOW_MEDIA_ROLE.INPUT_REFERENCE,
    )
    expect(trueCall).toBeDefined()
  })

  it('calls updateMany to mark OUTPUT_RESULT flowMediaId as isCurrent and others as false', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      outputFlowMediaId: 'output-1',
    })

    const updateManyCalls = updateManyMock.mock.calls
    const falseCall = updateManyCalls.find(
      (call) =>
        call[0]?.data?.isCurrent === false &&
        call[0]?.where?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT &&
        !call[0]?.where?.flowMediaId,
    )
    expect(falseCall).toBeDefined()

    const trueCall = updateManyCalls.find(
      (call) =>
        call[0]?.data?.isCurrent === true &&
        call[0]?.where?.flowMediaId === 'output-1' &&
        call[0]?.where?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(trueCall).toBeDefined()
  })

  it('uses explicit parentFlowMediaId when provided', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1'],
      outputFlowMediaId: 'output-1',
      parentFlowMediaId: 'explicit-parent',
    })

    const outputCreateCall = createMock.mock.calls.find(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(outputCreateCall).toBeDefined()
    expect(outputCreateCall![0].data.parentFlowMediaId).toBe('explicit-parent')
  })

  it('falls back to inputFlowMediaIds[0] as parentFlowMediaId when parentFlowMediaId not provided', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1', 'input-2'],
      outputFlowMediaId: 'output-1',
    })

    const outputCreateCall = createMock.mock.calls.find(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(outputCreateCall).toBeDefined()
    expect(outputCreateCall![0].data.parentFlowMediaId).toBe('input-1')
  })

  it('sets parentFlowMediaId to null when no parent and no input ids provided', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      outputFlowMediaId: 'output-1',
    })

    const outputCreateCall = createMock.mock.calls.find(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(outputCreateCall).toBeDefined()
    expect(outputCreateCall![0].data.parentFlowMediaId).toBeNull()
  })

  it('does not create OUTPUT_RESULT row when outputFlowMediaId is not provided', async () => {
    findFirstMock.mockResolvedValue(null)
    await recordFlowMediaHistory({
      ...BASE_PARAMS,
      inputFlowMediaIds: ['input-1'],
    })

    const outputCreateCalls = createMock.mock.calls.filter(
      (call) => call[0]?.data?.role === FLOW_MEDIA_ROLE.OUTPUT_RESULT,
    )
    expect(outputCreateCalls).toHaveLength(0)
  })
})
