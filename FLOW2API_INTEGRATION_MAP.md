# WaooWaoo API Call Map And Flow2API Mapping

## 目标

这份文档把 `waoowaoo` 里所有“会实际调用外部模型/API”的链路整理出来，并标注：

- 调用入口在哪
- 中间经过哪些抽象层
- 最终调用哪类 provider / gateway
- 如果切到 `flow2api`，应该对应哪个接口
- 当前还缺什么

这份文档只聚焦：

- LLM 文本调用
- 图片生成
- 视频生成
- 语音生成
- provider 配置 / gateway 路由

不展开普通 CRUD、项目数据查询、存储签名之类的内部接口。

---

## 总览

`waoowaoo` 当前外部模型调用可以分成 4 层：

1. 业务 API 路由层
2. 任务 / worker 处理层
3. 统一生成入口层
4. provider / gateway 层

对于要接 `flow2api` 的部分，真正关键的是：

- 图片：`generateImage(...)`
- 视频：`generateVideo(...)`
- LLM：`executeAiTextStep(...)` / `executeAiVisionStep(...)`
- openai-compatible gateway：`src/lib/model-gateway/openai-compat/*`

---

## 一、Provider 配置与路由

### 1. provider 配置来源

文件：

- [api-config.ts](/d:/aitools/waoowaoo/src/lib/api-config.ts)

职责：

- 读取用户配置的 `customProviders`
- 读取用户配置的 `customModels`
- 解析 `provider::modelId`
- 返回 `apiKey`
- 返回 `baseUrl`
- 规范化 openai-compatible 的 `baseUrl`

关键点：

- `openai-compatible` provider 会自动把 `baseUrl` 规整到 `/v1`
- 所以 `flow2api` 作为 provider 时，完全符合这套结构

对接 `flow2api` 时对应：

- `providerId`: 建议新建一个自定义 provider，例如 `openai-compatible:flow2api`
- `baseUrl`: `http://34.69.179.192:38000`
- `apiKey`: `flow2api` 外部 API key

---

### 2. gateway 路由判定

文件：

- [router.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/router.ts)

职责：

- 判定 provider 是走 `official` 还是 `openai-compat`

关键点：

- `openai-compatible` 一定走 `openai-compat`

对接 `flow2api` 时对应：

- `flow2api` 应该被视为 `openai-compatible`
- 所以最终会走 `src/lib/model-gateway/openai-compat/*`

---

## 二、统一生成入口

### 1. 图片统一入口

文件：

- [generator-api.ts](/d:/aitools/waoowaoo/src/lib/generator-api.ts)

函数：

- `generateImage(...)`

职责：

- 解析模型选择
- 读取 provider 配置
- 决定走 `official` 还是 `openai-compat`
- 调度到图片 generator 或 openai-compatible gateway

当前支持参数：

- `prompt`
- `referenceImages`
- `aspectRatio`
- `resolution`
- `outputFormat`
- `size`

对接 `flow2api` 时对应：

- 文生图：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages = [{ role: "user", content: prompt }]`
- 图生图：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages[0].content = [text + image_url]`

当前缺口：

- `generateImage(...)` 这一层目前没有显式把 `projectId` 透传成 `flow2api` 顶层 `project_id`

---

### 2. 视频统一入口

文件：

- [generator-api.ts](/d:/aitools/waoowaoo/src/lib/generator-api.ts)

函数：

- `generateVideo(...)`

职责：

- 解析视频模型
- 读取 provider 配置
- 走 `official` 或 `openai-compat`

当前支持参数：

- `imageUrl`
- `prompt`
- `duration`
- `fps`
- `resolution`
- `aspectRatio`
- `generateAudio`
- `lastFrameImageUrl`
- `generationMode`

注意：

- `generator-api.ts` 表面上已经接受了 `lastFrameImageUrl`
- 但是否真正被 `openai-compatible` 这条路径使用，要看更下层

对接 `flow2api` 时对应：

- 文生视频：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages = [{ role: "user", content: prompt }]`
- 单参考图视频：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages = [text + image_url]`
- 首尾帧视频：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages = [text + image_url + image_url]`
- 多图参考视频：
  - `POST /v1/chat/completions`
  - 顶层 `project_id`
  - `messages = [text + 多个 image_url]`

当前缺口：

- `waoowaoo` 的 openai-compatible video 抽象目前还是“单 `imageUrl` 为中心”
- 首尾帧、多图参考图在更上层语义存在，但还没稳定落到 openai-compatible request 结构

---

## 三、OpenAI-Compatible Gateway

### 1. 图片 gateway

文件：

- [openai-compat image.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/openai-compat/image.ts)

函数：

- `generateImageViaOpenAICompat(...)`

现状：

- 无参考图时走 `client.images.generate(...)`
- 有参考图时走 `client.images.edit(...)`

这条链路更适合接：

- OpenAI 原生图片接口
- 或兼容同协议的图片接口

但是 `flow2api` 当前更合适的是：

- `POST /v1/chat/completions`
- 不是 `images.generate / images.edit`

所以如果 `waoowaoo` 要直接接 `flow2api`，这里需要做一层区分：

- 对普通 openai-compatible 图片服务，继续走 `images.generate/edit`
- 对 `flow2api` provider，改走 `chat.completions`

结论：

- 这里不能“零改动直接接 `flow2api`”
- 需要针对 `flow2api` provider 做特判，或者引入模板路由

---

### 2. 视频 gateway

文件：

- [openai-compat video.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/openai-compat/video.ts)

函数：

- `generateVideoViaOpenAICompat(...)`

现状：

- 只接受一个 `imageUrl`
- 调 `client.videos.create(...)`

这条链路适合：

- 单图参考视频
- 文生视频（如果对应兼容服务支持）

但对 `flow2api` 来说，问题是：

- `flow2api` 当前统一媒体入口更适合 `chat.completions`
- 且要支持：
  - 0 张图
  - 1 张图
  - 2 张图
  - 多张图

结论：

- `generateVideoViaOpenAICompat(...)` 直接接 `flow2api` 也不够
- 需要为 `flow2api` 额外处理多图输入和顶层 `project_id`

---

### 3. common 配置层

文件：

- [openai-compat common.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/openai-compat/common.ts)

职责：

- 根据 `providerId` 读取 `baseUrl/apiKey`
- 创建 OpenAI SDK client
- 处理参考图转 upload file

结论：

- 这一层本身没问题
- `flow2api` 可直接作为一个 `openai-compatible` provider 挂进去

---

## 四、Worker / 任务执行层

### 1. 图片 / 视频统一任务执行

文件：

- [workers utils.ts](/d:/aitools/waoowaoo/src/lib/workers/utils.ts)

关键函数：

- `resolveImageSourceFromGeneration(...)`
- `resolveVideoSourceFromGeneration(...)`

职责：

- 调 `generateImage(...)` / `generateVideo(...)`
- 统一处理同步返回和异步轮询
- 统一写日志 / 进度 / 外部任务恢复

这两处是 `waoowaoo` 真正发起媒体生成的核心聚合点。

对接 `flow2api` 时最重要的机会点：

- 在这里把 `job.data.projectId`
  透传到更底层 `generateImage/generateVideo`
- 不需要每个业务 handler 单独改一遍

---

### 2. 典型图片任务

文件：

- [panel-image-task-handler.ts](/d:/aitools/waoowaoo/src/lib/workers/handlers/panel-image-task-handler.ts)
- [panel-variant-task-handler.ts](/d:/aitools/waoowaoo/src/lib/workers/handlers/panel-variant-task-handler.ts)
- [reference-to-character.ts](/d:/aitools/waoowaoo/src/lib/workers/handlers/reference-to-character.ts)

现状：

- 都会走 `resolveImageSourceFromGeneration(...)`
- 所以最终都会汇到 `generateImage(...)`

结论：

- 一旦 `generateImage(...)` 对接好 `flow2api`
- 这些图片业务链路基本都会跟着吃到

---

### 3. 视频任务

文件：

- 视频生成最终会汇到 [workers utils.ts](/d:/aitools/waoowaoo/src/lib/workers/utils.ts) 的 `resolveVideoSourceFromGeneration(...)`
- 前端入口与任务参数主要集中在：
  - [generate-video route](/d:/aitools/waoowaoo/src/app/api/novel-promotion/[projectId]/generate-video/route.ts)
  - [useStoryboards.ts](/d:/aitools/waoowaoo/src/lib/query/hooks/useStoryboards.ts)

现状：

- 上层业务已经有：
  - `videoModel`
  - `generationOptions`
  - `firstLastFrame`
- 但下层 openai-compatible video 还没完整支持多图输入

结论：

- 视频接 `flow2api` 时不能只改一个文件
- 需要从 route / params / gateway 三层一起看

---

## 五、LLM 调用链

### 1. AI Runtime

文件：

- [ai-runtime types.ts](/d:/aitools/waoowaoo/src/lib/ai-runtime/types.ts)
- [ai-runtime client.ts](/d:/aitools/waoowaoo/src/lib/ai-runtime/client.ts)

关键函数：

- `executeAiTextStep(...)`
- `executeAiVisionStep(...)`

现状：

- 这里已经有 `projectId?: string`
- 并且 runtime 会把 `projectId` 作为 options 传下去

结论：

- `waoowaoo` 的 LLM runtime 已经有项目上下文传递意识
- 这一层将来如果要让 LLM 也走 `flow2api`，比图片/视频更顺

对应 `flow2api` 接口：

- 文本 LLM：
  - `POST /v1/chat/completions`
- 视觉 LLM：
  - `POST /v1/chat/completions`
  - `messages[0].content = [text + image_url...]`

---

## 六、哪些调用可以直接映射到 Flow2API

### A. 现在最容易接的

1. 文生图

- `waoowaoo` 入口：图片相关任务 -> `resolveImageSourceFromGeneration` -> `generateImage`
- `flow2api` 接口：
  - `POST /v1/chat/completions`
- 需要：
  - `model`
  - `messages`
  - `project_id`

2. 图生图

- `waoowaoo` 入口：图片修改 / 参考图图片任务
- `flow2api` 接口：
  - `POST /v1/chat/completions`
- 需要：
  - `model`
  - `messages = [text + image_url]`
  - `project_id`

3. 文生视频

- `waoowaoo` 入口：视频任务 -> `resolveVideoSourceFromGeneration` -> `generateVideo`
- `flow2api` 接口：
  - `POST /v1/chat/completions`
- 需要：
  - `model`
  - `messages`
  - `project_id`

4. 单图参考视频

- `waoowaoo` 当前 video gateway 已支持一个 `imageUrl`
- `flow2api` 接口：
  - `POST /v1/chat/completions`
- 需要：
  - `model`
  - `messages = [text + image_url]`
  - `project_id`

---

### B. 现在还不够的

1. 首尾帧视频

当前上层业务已经有：

- `firstLastFrame`

但当前视频 gateway 仍然是：

- 单 `imageUrl`

要接 `flow2api` 需要：

- 视频 request 类型支持 `imageUrls[]`
- 至少允许 `2` 张图

2. 多图参考视频

同理，需要：

- `imageUrls[]`
- 而不是单 `imageUrl`

---

## 七、Flow2API 对接建议

### 建议模式

不要让 `waoowaoo` 去调用本地 bridge API。  
正确对接层是：

- `waoowaoo` -> `flow2api /v1/chat/completions`
- `flow2api` 再去调本地 remote browser bridge

也就是：

- `waoowaoo` 只认识 `flow2api` 业务接口
- 不认识底层本地 bridge / plugin sync / token cache

---

### 最小改造顺序

#### 第 1 批

先打通：

- 文生图
- 图生图
- 文生视频

需要改的核心点：

1. 图片 gateway 对 `flow2api provider` 改走 `chat.completions`
2. 视频 gateway 对 `flow2api provider` 改走 `chat.completions`
3. 把 `waoowaoo projectId` 透传成 `flow2api project_id`

#### 第 2 批

再扩：

- 单图参考视频
- 首尾帧视频
- 多图参考视频

需要改的核心点：

1. `VideoGenerateParams` 从单 `imageUrl` 扩成支持 `imageUrls[]`
2. `OpenAICompatVideoRequest` 同样扩成多图
3. route / worker / gateway 统一识别：
   - `0` 图
   - `1` 图
   - `2` 图
   - `N` 图

---

## 八、建议直接改的文件清单

### `waoowaoo` 内部建议优先改

1. [generator-api.ts](/d:/aitools/waoowaoo/src/lib/generator-api.ts)

- 为 `flow2api` provider 单独分支
- 把 `projectId` 继续往下传

2. [openai-compat image.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/openai-compat/image.ts)

- 为 `flow2api` 增加 `chat.completions` 路径
- 顶层 body 增加 `project_id`

3. [openai-compat video.ts](/d:/aitools/waoowaoo/src/lib/model-gateway/openai-compat/video.ts)

- 为 `flow2api` 增加 `chat.completions` 路径
- 顶层 body 增加 `project_id`
- 后续支持 `imageUrls[]`

4. [base.ts](/d:/aitools/waoowaoo/src/lib/generators/base.ts)

- 扩展 `VideoGenerateParams`
- 增加多图视频输入能力

5. [workers utils.ts](/d:/aitools/waoowaoo/src/lib/workers/utils.ts)

- 统一把 `job.data.projectId` 传给图片/视频生成层
- 不要在更上层重复做同样的透传

6. [useStoryboards.ts](/d:/aitools/waoowaoo/src/lib/query/hooks/useStoryboards.ts)

- 确认前端的 `firstLastFrame` / 视频参数能完整落到后端任务 payload

---

## 九、Flow2API 接口对照表

### 文生图

- `waoowaoo` 业务语义：image generate
- `flow2api`：
  - `POST /v1/chat/completions`

### 图生图

- `waoowaoo` 业务语义：image edit / modify / reference image generate
- `flow2api`：
  - `POST /v1/chat/completions`

### 文生视频

- `waoowaoo` 业务语义：video generate without image
- `flow2api`：
  - `POST /v1/chat/completions`

### 单图参考视频

- `waoowaoo` 业务语义：video generate with one reference image
- `flow2api`：
  - `POST /v1/chat/completions`

### 首尾帧视频

- `waoowaoo` 业务语义：firstLastFrame
- `flow2api`：
  - `POST /v1/chat/completions`
- 但 `waoowaoo` 需要先支持 2 张图输入

### 多图参考视频

- `waoowaoo` 业务语义：multi reference video
- `flow2api`：
  - `POST /v1/chat/completions`
- 但 `waoowaoo` 需要先支持 `imageUrls[]`

---

## 十、当前一句话结论

`waoowaoo` 现在**最适合先接 `flow2api` 的是：**

- 文生图
- 图生图
- 文生视频

`waoowaoo` 现在**还不够、需要补抽象的，是：**

- 单图参考视频到多图统一
- 首尾帧视频
- 多图参考视频
- `projectId -> project_id` 稳定透传
