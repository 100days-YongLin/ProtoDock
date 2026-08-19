# 产品名称

## 产品与端列表

- 端名称：本端角色与职责。

## 文档入口

- 产品级规则：`shared-docs/*.md`。
- 端页面 PRD：`prototypes/<endpoint>/docs/*.md`。

## 源码、构建与验证

- 写明每个端的源码目录、构建命令、输出映射和验证命令。
- 工作区校验：`scripts/protodock-validate <workspace-root>`。

## Git 与交付

- 工作区根目录是唯一 Git 根，子端不建立嵌套仓库。
- 跨端功能在同一 diff 中提交共享契约、受影响端 PRD、原型和变更记录。
