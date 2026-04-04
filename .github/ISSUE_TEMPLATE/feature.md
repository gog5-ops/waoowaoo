---
name: Feature Spec (Claude → Codex)
about: Claude 创建的功能规格说明，由 Codex 执行实现
title: '[feat] '
labels: feature
assignees: ''
---

## 背景

<!-- 为什么要做这个，解决什么问题，当前行为是什么 -->

## 任务描述

<!-- 具体要实现什么，用清晰的语言描述预期行为 -->

## 验收标准（Acceptance Criteria）

<!-- TDD：Codex 先写这些测试（让它们失败），再实现代码让测试通过 -->

- [ ] <!-- 功能 A：[具体可观测的行为] -->
- [ ] <!-- 功能 B：[具体可观测的行为] -->
- [ ] 相关测试通过：`npm run test:xxx`
- [ ] `npm run typecheck` 无新错误
- [ ] `npm run lint:all` 无新警告

## 需要覆盖的测试

```
- unit:        tests/unit/xxx.test.ts        — 测试 [具体逻辑]
- integration: tests/integration/xxx.test.ts — 测试 [具体场景]
```

## 技术上下文

<!-- 帮助 Codex 快速定位，减少探索时间 -->

- 主要涉及文件：`src/xxx/`, `lib/xxx/`
- 参考现有实现：`src/xxx/example.ts`
- 依赖 / 约束：<!-- 不能改 X，需要兼容 Y，用已有的 Z 工具 -->

## 不在本次范围内

<!-- 明确排除项，防止过度实现 -->

-
