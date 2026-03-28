# WaooWaoo -> Independent Bridge -> Flow

## 异步任务 API + 轮询状态完整方案

## 1. 目标

把当前链路收口成：

- `waoowaoo -> 独立 bridge 服务 -> Flow`

而不是：

- `waoowaoo -> flow2api -> 本地 remote browser bridge -> Flow`

Bridge 升级成正式的媒体网关，统一负责：

- Flow 项目上下文
- 本地 Chrome / 插件 / token
- project-bound reCAPTCHA
- 请求排队和并发控制
- 资源落 GCS
- 任务状态跟踪
- 对 `waoowaoo` 暴露稳定的异步任务 API

同时，在 `waoowaoo` 里它不应只是“一个外部 URL”，而应作为一个正式 provider 存在。

建议 provider 名：

- `flow-bridge`

## 2. 为什么要做成异步任务 API

Flow 这类调用天然有这些特征：

- 依赖浏览器和登录态
- reCAPTCHA token 需要实时获取
- 图片 / 视频生成耗时长
- 生成后还要下载并上传存储
- 同一个项目下需要排队或限流

所以不适合默认做成“一个 HTTP 请求一直挂到生成完成”。

推荐默认模式：

- 创建任务立即返回 `task_id`
- 后台 worker 真正执行
- `waoowaoo` 轮询任务状态

同步等待模式可以作为可选增强，不作为默认接口设计。

---

## 3. 职责边界

### `waoowaoo` 负责

- 项目/用户/任务业务语义
- 前端交互
- 提交媒体生成任务
- 轮询 bridge 任务结果
- 将最终资产写入自己的业务表

### 独立 bridge 负责

- 媒体任务编排
- Chrome / 扩展 / Flow token 管理
- Flow 页面上下文管理
- project 级并发与队列
- 调 Flow 并拿到最终资源
- 资源下载并上传到 GCS
- 任务状态记录

### Flow 负责

- 实际生成图片/视频
- 返回最终媒体 URL / 媒体元数据

---

## 4. 架构分层

建议把独立 bridge 分成 4 层：

### 4.1 API 层

对外暴露这些接口：

- 图片
- 视频
- 任务
- 存储

### 4.2 Task 层

负责：

- 创建任务
- 状态推进
- 入队 / 出队
- 异常重试

### 4.3 Flow Runtime 层

负责：

- 检查本地 bridge 运行时
- 触发插件同步 ST
- 获取 project-bound token
- 调 Flow

### 4.4 Storage 层

负责：

- 下载 Flow 生成结果
- 上传到 GCS
- 写 manifest

### 4.5 `waoowaoo` Provider 适配层

在 `waoowaoo` 内建议新增：

- `flow-bridge` provider

让它和这些 provider 并列：

- `openai-compatible`
- `google`
- `fal`
- `vidu`
- `minimax`

建议新增的适配实现：

- `FlowBridgeImageGenerator`
- `FlowBridgeVideoGenerator`

它们的职责是：

- 调独立 bridge 的异步任务 API
- 把 bridge 的响应包装成 `GenerateResult`
- 返回标准化的：
  - `success`
  - `async`
  - `externalId`

这样 `waoowaoo` 现有 worker / poll / task 体系可以继续复用。

---

## 5. API 设计

## 5.1 图片 API

### `POST /v1/images/generate`

用途：

- 文生图

请求体：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "model": "gemini-3.1-flash-image-square",
  "prompt": "生成一张极简风格的蓝色圆形图标，白色背景。",
  "count": 1,
  "storage": {
    "gcs": true
  },
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-image"
  }
}
```

返回：

```json
{
  "success": true,
  "task_id": "bridge_img_01H...",
  "status": "queued"
}
```

### `POST /v1/images/edit`

用途：

- 图生图
- 参考图增强
- 多图参考图生成

请求体：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "model": "gemini-3.1-flash-image-square",
  "prompt": "保留大树主体和整体构图，加入一只猫。",
  "reference_images": [
    { "url": "https://example.com/tree.png" }
  ],
  "storage": {
    "gcs": true
  },
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-variant"
  }
}
```

返回：

```json
{
  "success": true,
  "task_id": "bridge_img_edit_01H...",
  "status": "queued"
}
```

---

## 5.2 视频 API

### `POST /v1/videos/generate`

用途：

- 文生视频

请求体：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "model": "veo_3_1_t2v_fast_landscape",
  "prompt": "一棵巨大的大树在风中轻轻摇曳，电影感镜头。",
  "storage": {
    "gcs": true
  },
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-video"
  }
}
```

### `POST /v1/videos/reference`

用途：

- 单图参考视频
- 多图参考视频

请求体：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "model": "veo_3_1_r2v_fast",
  "prompt": "基于参考图生成一段电影感树景视频。",
  "reference_images": [
    { "url": "https://example.com/tree.png" }
  ],
  "storage": {
    "gcs": true
  },
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-video-reference"
  }
}
```

### `POST /v1/videos/first-last`

用途：

- 首尾帧视频

请求体：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "model": "veo_3_1_i2v_s_fast_fl",
  "prompt": "使用两张参考图作为首尾帧，生成自然过渡视频。",
  "start_image": {
    "url": "https://example.com/start.png"
  },
  "end_image": {
    "url": "https://example.com/end.png"
  },
  "storage": {
    "gcs": true
  },
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-video-firstlast"
  }
}
```

---

## 5.3 任务 API

### `GET /v1/tasks/{task_id}`

返回任务状态：

```json
{
  "task_id": "bridge_img_01H...",
  "type": "image_generate",
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "status": "running",
  "progress": 62,
  "error": null,
  "result": null
}
```

完成后：

```json
{
  "task_id": "bridge_img_01H...",
  "type": "image_generate",
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "status": "completed",
  "progress": 100,
  "error": null,
  "result": {
    "asset_id": "img_asset_01H..."
  }
}
```

### `GET /v1/tasks`

支持筛选：

- `project_id`
- `status`
- `type`
- `limit`

### `POST /v1/tasks/{task_id}/cancel`

取消尚未完成任务。

### `GET /v1/projects/{project_id}/queue`

查看项目级排队状态：

```json
{
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "running": 2,
  "queued": 5,
  "max_workers": 4
}
```

---

## 5.4 存储 API

### `GET /v1/assets/{asset_id}`

查询统一资产详情：

```json
{
  "asset_id": "img_asset_01H...",
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "type": "image",
  "status": "completed",
  "media_id": "51c0629f-9427-4c16-804d-b52e07cb0f8a",
  "source_url": "https://storage.googleapis.com/...",
  "gcs_uri": "gs://bucket/projects/c6d7.../images/img_asset_01H....png",
  "public_url": "https://...",
  "created_at": "2026-03-26T12:00:00Z"
}
```

### `GET /v1/assets/{asset_id}/manifest`

查询 manifest：

```json
{
  "asset_id": "img_asset_01H...",
  "project_id": "c6d7cff5-2977-4825-acbe-e978e4addc65",
  "type": "image",
  "model": "gemini-3.1-flash-image-square",
  "prompt": "保留大树主体和整体构图，加入一只猫。",
  "media_id": "51c0629f-9427-4c16-804d-b52e07cb0f8a",
  "task_id": "bridge_img_edit_01H...",
  "source_url": "https://storage.googleapis.com/...",
  "gcs_uri": "gs://bucket/projects/c6d7.../images/img_asset_01H....png",
  "metadata": {
    "source": "waoowaoo",
    "business_type": "panel-variant"
  }
}
```

### `GET /v1/projects/{project_id}/assets`

列出项目下资产。

---

## 6. 任务状态机

建议统一状态：

- `queued`
- `preflight`
- `syncing_session_token`
- `acquiring_captcha_token`
- `submitting_to_flow`
- `waiting_flow_result`
- `downloading`
- `uploading`
- `completed`
- `failed`
- `cancelled`

建议错误分类：

- `FAILED_LOCAL_BRIDGE`
- `FAILED_EXTENSION_SYNC`
- `FAILED_CAPTCHA_TOKEN`
- `FAILED_FLOW_REQUEST`
- `FAILED_FLOW_RESULT`
- `FAILED_DOWNLOAD`
- `FAILED_GCS_UPLOAD`
- `FAILED_TIMEOUT`

---

## 7. 并发与队列策略

### 总原则

- 同一 `project_id` 下排队控制
- 不同 `project_id` 可以并发
- request token 需要和具体请求绑定，不能只按 `project_id + action`

### 建议实现

- 每个任务生成独立 `request_id`
- captcha token 回推时带 `request_id`
- worker tab 池最多保留 `4` 个
- 超出的请求自动排队

### 为什么

因为当前已经验证过：

- 同一 `project_id`
- 同一 `action`
- 并发请求如果只用共享 pending/cache key

就会互相覆盖，导致：

- `Failed to obtain reCAPTCHA token`

所以独立 bridge 必须把：

- `task_id`
- `request_id`

都作为一等公民。

---

## 8. 存储设计

## 8.1 GCS 目录

建议：

```text
gs://<bucket>/projects/<project_id>/images/<asset_id>.png
gs://<bucket>/projects/<project_id>/videos/<asset_id>.mp4
gs://<bucket>/projects/<project_id>/manifests/<asset_id>.json
```

## 8.2 Manifest 内容

建议至少包括：

- `asset_id`
- `task_id`
- `project_id`
- `type`
- `model`
- `prompt`
- `source_url`
- `gcs_uri`
- `media_id`
- `created_at`
- `metadata`

## 8.3 后续备份

后续可加：

- 定时将 GCS 备份到另一个 GCS bucket
- 或定时同步到 Google Drive

但这不是主任务链的一部分，应做后台定时任务。

---

## 9. `waoowaoo` 的接入方式

## 9.0 Provider 形态

最终建议不是让 `waoowaoo` 在业务代码里直接拼 bridge URL，而是：

- 在配置中心中新增 provider：`flow-bridge`
- 在 generator 工厂中新增：
  - 图片生成器 `FlowBridgeImageGenerator`
  - 视频生成器 `FlowBridgeVideoGenerator`
- 在轮询层新增：
  - `BRIDGE:IMAGE:<task_id>`
  - `BRIDGE:VIDEO:<task_id>`

也就是说：

- provider 名：`flow-bridge`
- 轮询协议前缀：`BRIDGE`

这样职责最清晰：

- provider 用于“创建任务”
- async poll 用于“轮询任务”

## 9.1 图片

`waoowaoo` 图片任务提交：

- 文生图 -> `flow-bridge image generator` -> `POST /v1/images/generate`
- 图生图 -> `flow-bridge image generator` -> `POST /v1/images/edit`

返回：

- `task_id`

然后 worker 轮询：

- `GET /v1/tasks/{task_id}`

完成后拿到：

- `asset_id`

再取：

- `GET /v1/assets/{asset_id}`

拿到最终：

- `gcs_uri`
- `public_url`
- `media_id`

最后落回 `waoowaoo` 自己的业务表。

## 9.2 视频

`waoowaoo` 视频任务提交：

- 文生视频 -> `flow-bridge video generator` -> `POST /v1/videos/generate`
- 单图/多图参考视频 -> `flow-bridge video generator` -> `POST /v1/videos/reference`
- 首尾帧视频 -> `flow-bridge video generator` -> `POST /v1/videos/first-last`

同样：

- 先拿 `task_id`
- 轮询 `GET /v1/tasks/{task_id}`
- 完成后查资产详情

---

## 10. 与 `waoowaoo` 现有机制的兼容建议

`waoowaoo` 当前 worker 已经习惯：

- `GenerateResult`
- `async`
- `externalId`
- `pollAsyncTask(...)`

所以独立 bridge 最好兼容这套思路。

### 推荐方式

为 bridge 任务定义一种新的 `externalId`：

```text
BRIDGE:IMAGE:<task_id>
BRIDGE:VIDEO:<task_id>
```

这样 `waoowaoo` 后面只要在：

- `async-poll.ts`

增加一个新的 provider 分支：

- `BRIDGE`

就能复用现有的轮询框架，而不需要推翻整个 worker 机制。

这也正好对应 `flow-bridge provider` 的实现方式：

- 生成器负责把 bridge 的创建任务结果包装成 `GenerateResult`
- `async-poll.ts` 负责把 `BRIDGE:*` externalId 解析成轮询请求

所以 `flow-bridge` 会成为：

- 一个正式 provider
- 一个正式 async poll provider

### 对应关系

- `GenerateResult.async = true`
- `GenerateResult.externalId = BRIDGE:IMAGE:bridge_img_01H...`

然后 `pollAsyncTask(externalId, userId)` 就可以转成：

- 调 bridge 的 `GET /v1/tasks/{task_id}`

这样接入成本最低。

---

## 11. 数据表建议

建议独立 bridge 至少有这几张表：

### `bridge_tasks`

- `id`
- `type`
- `project_id`
- `status`
- `progress`
- `request_id`
- `action`
- `model`
- `prompt`
- `payload_json`
- `error_code`
- `error_message`
- `result_asset_id`
- `created_at`
- `updated_at`

### `bridge_assets`

- `id`
- `project_id`
- `type`
- `task_id`
- `media_id`
- `source_url`
- `gcs_uri`
- `public_url`
- `manifest_gcs_uri`
- `created_at`

### `bridge_project_queue`

- `project_id`
- `running_count`
- `queued_count`
- `updated_at`

### `bridge_runtime_events`

- `id`
- `task_id`
- `project_id`
- `event`
- `payload_json`
- `created_at`

---

## 12. 实施顺序

### 第 1 步

先实现：

- 图片文生图
- 图片图生图
- 文生视频

并全部走：

- 任务制
- 轮询状态
- GCS 落盘
- `flow-bridge` provider

### 第 2 步

再扩：

- 单图参考视频
- 首尾帧视频
- 多图参考视频

### 第 3 步

再补：

- 任务取消
- 批量任务
- GCS 备份任务

---

## 12.5 测试计划

目标：

- 先让 `flow-bridge` 作为独立 provider 的基础链路测试通过
- 再逐步把真实 Flow 执行器接入

### 第一阶段：接口骨架测试

验证：

- `POST /v1/images/generate`
- `POST /v1/images/edit`
- `POST /v1/videos/generate`
- `POST /v1/videos/reference`
- `POST /v1/videos/first-last`
- `GET /v1/tasks/{task_id}`
- `GET /v1/tasks`
- `POST /v1/tasks/{task_id}/cancel`
- `GET /v1/projects/{project_id}/queue`
- `GET /v1/assets/{asset_id}`
- `GET /v1/projects/{project_id}/assets`

通过标准：

- 所有接口至少能返回合法 JSON
- 创建任务后能拿到 `task_id`
- 查询任务时状态为 `queued`
- 取消任务后状态变成 `cancelled`

### 第二阶段：`waoowaoo` provider 级测试

验证：

- `flow-bridge` provider 能在 `factory.ts` 创建成功
- 图片 generator 返回：
  - `success: true`
  - `async: true`
  - `externalId = BRIDGE:IMAGE:<task_id>`
- 视频 generator 返回：
  - `success: true`
  - `async: true`
  - `externalId = BRIDGE:VIDEO:<task_id>`

通过标准：

- `waoowaoo` worker 不需要知道 bridge 内部实现
- 只依赖 `GenerateResult` 和 `externalId`
- 可通过脚本入口直接验证：
  - `node scripts/test-flow-bridge-provider.mjs <bridgeBaseUrl> <bridgeApiKey>`

### 第三阶段：`async-poll.ts` 集成测试

验证：

- `pollAsyncTask("BRIDGE:IMAGE:<task_id>")`
- `pollAsyncTask("BRIDGE:VIDEO:<task_id>")`

通过标准：

- 能正确识别 `BRIDGE` 前缀
- 能调用 bridge 的 `GET /v1/tasks/{task_id}`
- 完成态能正确返回：
  - `imageUrl`
  - 或 `videoUrl`

### 第四阶段：真实 Flow 执行器测试

按顺序测试：

1. 文生图
2. 图生图
3. 文生视频
4. 单图参考视频
5. 首尾帧视频

通过标准：

- 任务能从 `queued` 进入 `completed`
- 结果能上传到 GCS
- `waoowaoo` 最终能拿到可展示 URL

### 第五阶段：并发与队列测试

验证：

- 同项目排队
- 跨项目并发
- request worker tab 最多 4 个
- 超出自动排队

通过标准：

- 不再出现同 `project_id + action` 并发抢 token
- 不再出现无上限乱开 tab

---

## 13. 一句话结论

最适合 `waoowaoo` 的独立 bridge 形态是：

- **Bridge 做正式异步任务媒体网关**
- **`waoowaoo` 里把它作为正式 `flow-bridge` provider**
- **`waoowaoo` 只提交任务并轮询状态**
- **桥内处理 Chrome / token / Flow / GCS**

这样后续无论加：

- bucket
- 备份
- 首尾帧
- 多图参考
- project 级队列

都能继续沿着同一套架构长下去。
