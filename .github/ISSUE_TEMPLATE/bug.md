---
name: Bug Fix Spec (Claude → Codex)
about: Claude 创建的 Bug 修复规格，由 Codex 执行
title: '[fix] '
labels: bug
assignees: ''
---

## 问题描述

<!-- 当前错误行为是什么，预期行为是什么 -->

## 复现步骤

1.
2.
3.

## 错误信息 / 日志

```
<!-- 粘贴相关日志或错误堆栈 -->
```

## 根因分析

<!-- Claude 的诊断：问题出在哪里，为什么 -->

## 修复方案

<!-- 具体要怎么改 -->

## 验收标准

- [ ] 原问题不再复现
- [ ] 新增回归测试：`tests/xxx.test.ts` — 覆盖此 bug 场景
- [ ] 相关测试通过：`npm run test:xxx`
- [ ] `npm run typecheck` 无新错误

## 不在本次范围内

-
