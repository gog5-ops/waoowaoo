import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from './base'

function normalizeBaseUrl(baseUrl?: string): string {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : ''
  if (!normalized) {
    throw new Error('PROVIDER_BASE_URL_MISSING: flow-bridge')
  }
  return normalized
}

async function postBridgeTask<TBody extends Record<string, unknown>>(params: {
  userId: string
  providerId: string
  path: string
  body: TBody
  externalType: 'IMAGE' | 'VIDEO'
}): Promise<GenerateResult> {
  const config = await getProviderConfig(params.userId, params.providerId)
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const response = await fetch(`${baseUrl}${params.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(params.body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string' ? payload.detail : '')
      || `FLOW_BRIDGE_REQUEST_FAILED: ${response.status}`
    throw new Error(message)
  }

  const taskId = payload && typeof payload === 'object' && 'task_id' in payload && typeof payload.task_id === 'string'
    ? payload.task_id
    : ''
  if (!taskId) {
    throw new Error('FLOW_BRIDGE_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `BRIDGE:${params.externalType}:${taskId}`,
  }
}

export async function createFlowBridgeImageTask(params: {
  userId: string
  providerId: string
  modelId?: string
  prompt: string
  projectId?: string
  referenceImages?: string[]
  referenceMediaIds?: string[]
  options?: Record<string, unknown>
}): Promise<GenerateResult> {
  const model = typeof params.modelId === 'string' && params.modelId.trim()
    ? params.modelId.trim()
    : 'gemini-3.1-flash-image-square'
  const projectId = typeof params.projectId === 'string' && params.projectId.trim()
    ? params.projectId.trim()
    : 'default'
  const metadata = {
    source: 'waoowaoo',
    provider: params.providerId,
  }


  // Media reuse: if we have flow media IDs, pass them directly without re-uploading
  if (Array.isArray(params.referenceMediaIds) && params.referenceMediaIds.length > 0 && (!Array.isArray(params.referenceImages) || params.referenceImages.length === 0)) {
    return await postBridgeTask({
      userId: params.userId,
      providerId: params.providerId,
      path: '/v1/images/edit',
      externalType: 'IMAGE',
      body: {
        project_id: projectId,
        model,
        prompt: params.prompt,
        reference_media_ids: params.referenceMediaIds,
        storage: { gcs: true },
        metadata,
      },
    })
  }

  if (Array.isArray(params.referenceImages) && params.referenceImages.length > 0) {
    return await postBridgeTask({
      userId: params.userId,
      providerId: params.providerId,
      path: '/v1/images/edit',
      externalType: 'IMAGE',
      body: {
        project_id: projectId,
        model,
        prompt: params.prompt,
        reference_images: params.referenceImages.map((url) => ({ url })),
        ...(Array.isArray(params.referenceMediaIds) && params.referenceMediaIds.length > 0 ? { reference_media_ids: params.referenceMediaIds } : {}),
        storage: { gcs: true },
        metadata,
      },
    })
  }

  return await postBridgeTask({
    userId: params.userId,
    providerId: params.providerId,
    path: '/v1/images/generate',
    externalType: 'IMAGE',
    body: {
      project_id: projectId,
      model,
      prompt: params.prompt,
      count: 1,
      storage: { gcs: true },
      metadata,
    },
  })
}

export async function createFlowBridgeVideoTask(params: {
  userId: string
  providerId: string
  modelId?: string
  imageUrl?: string
  prompt: string
  projectId?: string
  options?: Record<string, unknown>
}): Promise<GenerateResult> {
  const model = typeof params.modelId === 'string' && params.modelId.trim()
    ? params.modelId.trim()
    : 'veo_3_1_r2v_fast'
  const projectId = typeof params.projectId === 'string' && params.projectId.trim()
    ? params.projectId.trim()
    : 'default'
  const lastFrameImageUrl = typeof params.options?.lastFrameImageUrl === 'string'
    ? params.options.lastFrameImageUrl
    : undefined
  const metadata = {
    source: 'waoowaoo',
    provider: params.providerId,
    generationOptions: params.options || {},
  }

  if (params.imageUrl && lastFrameImageUrl) {
    return await postBridgeTask({
      userId: params.userId,
      providerId: params.providerId,
      path: '/v1/videos/first-last',
      externalType: 'VIDEO',
      body: {
        project_id: projectId,
        model,
        prompt: params.prompt,
        start_image: { url: params.imageUrl },
        end_image: { url: lastFrameImageUrl },
        storage: { gcs: true },
        metadata,
      },
    })
  }

  if (params.imageUrl) {
    return await postBridgeTask({
      userId: params.userId,
      providerId: params.providerId,
      path: '/v1/videos/reference',
      externalType: 'VIDEO',
      body: {
        project_id: projectId,
        model,
        prompt: params.prompt,
        reference_images: [{ url: params.imageUrl }],
        storage: { gcs: true },
        metadata,
      },
    })
  }

  return await postBridgeTask({
    userId: params.userId,
    providerId: params.providerId,
    path: '/v1/videos/generate',
    externalType: 'VIDEO',
    body: {
      project_id: projectId,
      model,
      prompt: params.prompt,
      storage: { gcs: true },
      metadata,
    },
  })
}
