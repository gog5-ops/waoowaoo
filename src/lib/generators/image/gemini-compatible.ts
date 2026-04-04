import { getProviderConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { setProxy } from '../../../../lib/prompts/proxy'

type GeminiCompatibleContentPart =
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType?: string; fileUri?: string } }
  | { text: string }

type GeminiCompatibleOptions = {
  aspectRatio?: string
  resolution?: string
  provider?: string
  modelId?: string
  modelKey?: string
  projectId?: string
}

type GeminiCompatibleResponsePart = {
  inlineData?: { mimeType?: string; data?: string }
  fileData?: { mimeType?: string; fileUri?: string }
}

type GeminiCompatibleGeneratedAssets = {
  edit_id?: string
  edit_url?: string
  edit_id_capture_failed?: boolean
}

type GeminiCompatiblePerformance = {
  project_id?: string
  edit_id?: string
  edit_url?: string
  edit_id_capture_failed?: boolean
}

type GeminiCompatibleResponse = {
  candidates?: Array<{
    finishReason?: string
    content?: {
      parts?: GeminiCompatibleResponsePart[]
    }
  }>
  error?: {
    message?: string
  }
  performance?: GeminiCompatiblePerformance
  generatedAssets?: GeminiCompatibleGeneratedAssets
  editId?: string
  editUrl?: string
  editIdCaptureFailed?: boolean
}

function toAbsoluteUrlIfNeeded(value: string): string {
  if (!value.startsWith('/')) return value
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${baseUrl}${value}`
}

function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (!value.startsWith('data:') || markerIndex === -1) return null
  const mimeType = value.slice(5, markerIndex)
  const base64 = value.slice(markerIndex + marker.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

async function toInlineData(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  const parsedDataUrl = parseDataUrl(imageSource)
  if (parsedDataUrl) {
    return { mimeType: parsedDataUrl.mimeType, data: parsedDataUrl.base64 }
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://') || imageSource.startsWith('/')) {
    const cachedDataUrl = await getImageBase64Cached(toAbsoluteUrlIfNeeded(imageSource))
    const parsedCachedDataUrl = parseDataUrl(cachedDataUrl)
    if (!parsedCachedDataUrl) return null
    return { mimeType: parsedCachedDataUrl.mimeType, data: parsedCachedDataUrl.base64 }
  }

  return { mimeType: 'image/png', data: imageSource }
}

function assertAllowedOptions(options: Record<string, unknown>) {
  const allowedKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
    'projectId',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedKeys.has(key)) {
      throw new Error(`GEMINI_COMPATIBLE_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function resolveErrorMessage(status: number, payload: GeminiCompatibleResponse | null, fallbackText: string): string {
  const payloadMessage = payload?.error?.message?.trim()
  if (payloadMessage) return payloadMessage
  const normalizedText = fallbackText.trim()
  if (normalizedText) return normalizedText
  return `Gemini compatible request failed with status ${status}`
}

export class GeminiCompatibleImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    assertAllowedOptions(options)

    const providerId = this.providerId || 'gemini-compatible'
    const providerConfig = await getProviderConfig(userId, providerId)
    if (!providerConfig.baseUrl) {
      throw new Error(`PROVIDER_BASE_URL_MISSING: ${providerId}`)
    }
    await setProxy()

    const normalizedOptions = options as GeminiCompatibleOptions
    const parts: GeminiCompatibleContentPart[] = []

    for (const referenceImage of referenceImages.slice(0, 14)) {
      const inlineData = await toInlineData(referenceImage)
      if (!inlineData) {
        throw new Error('GEMINI_COMPATIBLE_REFERENCE_INVALID: failed to parse reference image')
      }
      parts.push({ inlineData })
    }
    parts.push({ text: prompt })

    const model = this.modelId || normalizedOptions.modelId || 'gemini-2.5-flash-image-preview'
    const requestPayload: Record<string, unknown> = {
      model,
      contents: [{ parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
        ...(normalizedOptions.aspectRatio || normalizedOptions.resolution
          ? {
            imageConfig: {
              ...(normalizedOptions.aspectRatio ? { aspectRatio: normalizedOptions.aspectRatio } : {}),
              ...(normalizedOptions.resolution ? { imageSize: normalizedOptions.resolution } : {}),
            },
          }
          : {}),
      },
      ...(normalizedOptions.projectId ? { projectId: normalizedOptions.projectId, project_id: normalizedOptions.projectId } : {}),
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerConfig.apiKey ? { 'x-goog-api-key': providerConfig.apiKey } : {}),
      },
      body: JSON.stringify(requestPayload),
    })

    const responseText = await response.text()
    let responseJson: GeminiCompatibleResponse | null = null
    if (responseText) {
      try {
        responseJson = JSON.parse(responseText) as GeminiCompatibleResponse
      } catch {
        responseJson = null
      }
    }

    if (!response.ok) {
      throw new Error(resolveErrorMessage(response.status, responseJson, responseText))
    }

    const candidate = responseJson?.candidates?.[0]
    const responseParts = candidate?.content?.parts || []
    const flowProjectId = responseJson?.performance?.project_id?.trim() || undefined
    const editId = responseJson?.editId?.trim() || responseJson?.performance?.edit_id?.trim() || responseJson?.generatedAssets?.edit_id?.trim() || undefined
    const editUrl = responseJson?.editUrl?.trim() || responseJson?.performance?.edit_url?.trim() || responseJson?.generatedAssets?.edit_url?.trim() || undefined
    const editIdCaptureFailed = Boolean(responseJson?.editIdCaptureFailed || responseJson?.performance?.edit_id_capture_failed || responseJson?.generatedAssets?.edit_id_capture_failed)
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png'
        const imageBase64 = part.inlineData.data
        return {
          success: true,
          imageBase64,
          imageUrl: `data:${mimeType};base64,${imageBase64}`,
          flowProjectId,
          editId,
          editUrl,
          editIdCaptureFailed,
        }
      }
      if (part.fileData?.fileUri) {
        const imageUrl = part.fileData.fileUri.trim()
        if (!imageUrl) continue
        const base64DataUrl = await normalizeToBase64ForGeneration(imageUrl)
        const parsed = parseDataUrl(base64DataUrl)
        if (parsed) {
          return {
            success: true,
            imageBase64: parsed.base64,
            imageUrl: base64DataUrl,
            flowProjectId,
            editId,
            editUrl,
            editIdCaptureFailed,
          }
        }
        return {
          success: true,
          imageUrl,
          flowProjectId,
          editId,
          editUrl,
          editIdCaptureFailed,
        }
      }
    }

    const finishReason = candidate?.finishReason
    if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
      throw new Error('内容因安全策略被过滤')
    }

    throw new Error('GEMINI_COMPATIBLE_IMAGE_EMPTY_RESPONSE: no image data returned')
  }
}
