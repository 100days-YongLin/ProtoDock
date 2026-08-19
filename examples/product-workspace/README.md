# 多端产品示例

## 产品与端列表

- 移动端：用户查看已发布内容。
- Web 管理端：管理员维护与发布内容。
- 共享服务：保存内容、权限和发布状态。

## 文档入口

- 产品级规则：`shared-docs/*.md`。
- 移动端页面 PRD：`prototypes/mobile/docs/*.md`。
- Web 管理端页面 PRD：`prototypes/admin/docs/*.md`。

## 源码、构建与验证

- 两个示例端均直接维护 `pages/` 静态产物，无额外构建步骤。
- 工作区校验：`scripts/protodock-validate examples/product-workspace`。
- 发布前仍须单独校验当前端最终 ZIP。

## Git 与交付

- 工作区根目录是唯一 Git 根，子端不建立嵌套仓库。
- 跨端功能在同一分支和提交中更新共享契约、受影响页面 PRD、原型和变更记录。
- ProtoDock 本地打开目录是本目录；不得打开 `dist`、ZIP 解压父目录或某个发布副本。
