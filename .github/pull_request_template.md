## 关联 Issue

Closes #

## 变更说明

<!-- 简要描述做了什么 -->

## Layer 1+2 测试（提 PR 前本地必须全通过）

- [ ] 新增测试文件：`tests/xxx.test.ts`
- [ ] 本地运行通过：`npm run verify:push` / `pytest tests/unit/`
- [ ] CI 全绿（lint + typecheck + tests）
- [ ] 测试描述与 Issue 验收标准一一对应

## Layer 3 Smoke Test（PR 后部署 VM）

- [ ] `vm_manager.ps1 -Action Deploy<Project>` 服务正常启动
- [ ] `vm_manager.ps1 -Action SmokeTest<ActionName>` 通过
- [ ] 结果已贴到 PR comment

## 验收标准确认（对照 Issue）

<!-- 逐条勾选 Issue 中的验收标准 -->

- [ ]
- [ ]

## 范围确认

- [ ] 只改了 Issue 范围内的内容
- [ ] 没有引入新的外部依赖（如有，请说明原因）
