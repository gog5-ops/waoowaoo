# waoowaoo 开发规范

waoowaoo 是一款 AI 影视 Studio，支持从小说文本自动生成分镜、角色、场景并制作成视频。

---

## 角色分工

| 角色 | 负责 |
|------|------|
| **用户（产品方向）** | 描述需求、最终决策 |
| **Claude（PM/架构）** | 拆解需求、写 Issue spec、review PR、评估完成度 |
| **Codex（开发执行）** | 实现功能、写代码、开 PR |

---

## 开发工作流

```
用户描述需求
    ↓
Claude 创建 GitHub Issue（含 spec + 验收标准 + 测试要求）
    ↓
Codex 从 dev 切 feat/xxx 分支
    ↓
Codex 先写测试（红）→ 实现功能（绿）→ 重构
    ↓
git push → GitHub → VM 自动同步测试
    ↓
Claude review PR（逐条对照验收标准）
    ↓
用户确认 → merge 到 dev
    ↓
（积累后）dev → PR → main → CI 构建镜像 → 自动部署 VM
```

---

## 本地开发原则

- **本地只保存代码，不运行任何服务或测试**
- 不需要在本地安装 MySQL / Redis / MinIO
- 不需要在本地跑 `docker-compose`
- Codex 在本地修改代码后直接 push，测试在 VM 上执行
- 可以在 push 前运行静态检查：`npm run typecheck` / `npm run lint`

---

## 分支规范

```
feat/* ──→ dev ──→ main
fix/*  ──→ dev ──→ main
```

| 分支 | 用途 |
|------|------|
| `main` | 生产稳定版，只从 dev 合并，CI 触发构建 + 部署 |
| `dev` | 开发集成分支，功能在此汇聚测试 |
| `feat/*` | 新功能（Codex 开发） |
| `fix/*` | Bug 修复 |
| `chore/*` | 依赖升级、配置调整 |

**禁止直接 push main / dev，必须通过 PR。**

---

## 测试策略

- **所有测试在 VM 上运行**，不在本地测试
- Codex 实现每个功能时，必须先写测试再写实现（TDD）
- push 后 VM 自动同步并跑测试
- CI 全绿才允许 merge 到 main

## 流程例外（可跳过完整流程）

- 简单 bug fix（改动 < 20 行）可跳过 brainstorming，直接实现
- 配置类修改、文档更新不需要 Plan

---

## VM 操作规范

- **不在 VM 上直接修改代码**，所有改动必须经过本地 → GitHub → VM 流程
- VM 上只做：查日志、运行迁移、修改 `.env`、紧急回滚
- 紧急回滚：`docker compose pull app (指定 tag) && docker compose up -d --no-deps app`

---

## GitHub Issue 模板

Claude 创建 Issue 时使用以下结构：

```markdown
## 背景
[为什么要做这个，解决什么问题]

## 任务描述
[具体要实现什么]

## 验收标准
- [ ] 功能 A 正常工作：[具体表现]
- [ ] 相关测试通过：`npm run test:xxx`
- [ ] 没有引入新的 TypeScript 错误

## 技术上下文
- 主要涉及文件：`src/xxx/`
- 参考现有实现：`src/xxx/example.ts`
- 约束：[不能改 X，需要兼容 Y]

## 不在本次范围内
- [明确排除项]
```

---

## PR Body 规范

创建 PR 时 body **必须** 包含以下字段：

```markdown
Closes #<本仓库 issue number>
parent: gog5-ops/opshub#<OpsHub issue number>
session_url: <当前 session URL，如 https://claude.ai/code/session_xxx>

## Summary
[改动摘要]

## Test plan
[测试方案]
```

- `Closes #N`：merge 后自动关闭本仓库 issue
- `parent:`：关联到 OpsHub 整体需求，用于自动状态同步
- `session_url:`：追溯开发过程（云端对话链接或本地 session 路径）

如果当前任务没有对应的 OpsHub issue，`parent:` 可以省略。

---

## PR Review 标准

PR 被认为"完成"需满足：

- CI 通过（lint + typecheck + tests 全绿）
- 逐条对照 Issue 验收标准
- 有新增测试文件（不只改实现）
- 只改了 Issue 范围内的内容
- 无明显安全问题
- PR body 包含 `Closes #N` 和 `parent:` 字段

---

## 关键文件位置

- Prisma schema：`prisma/schema.prisma`
- 环境变量模板：`.env.example`
- CI/CD：`.github/workflows/docker-publish.yml`
- 生成器：`src/lib/generators/`
- Flow bridge：`src/lib/generators/flow-bridge-client.ts`
