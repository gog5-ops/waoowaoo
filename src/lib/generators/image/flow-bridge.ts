import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { createFlowBridgeImageTask } from '../flow-bridge-client'

export class FlowBridgeImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    return await createFlowBridgeImageTask({
      userId,
      providerId: this.providerId || 'flow-bridge',
      modelId: this.modelId || (typeof options.modelId === 'string' ? options.modelId : undefined),
      prompt,
      projectId: typeof options.projectId === 'string' ? options.projectId : undefined,
      referenceImages,
      options,
    })
  }
}
