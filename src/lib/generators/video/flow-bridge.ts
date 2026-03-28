import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'
import { createFlowBridgeVideoTask } from '../flow-bridge-client'

export class FlowBridgeVideoGenerator extends BaseVideoGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params
    return await createFlowBridgeVideoTask({
      userId,
      providerId: this.providerId || 'flow-bridge',
      modelId: typeof options.modelId === 'string' ? options.modelId : undefined,
      imageUrl,
      prompt,
      projectId: typeof options.projectId === 'string' ? options.projectId : undefined,
      options,
    })
  }
}
