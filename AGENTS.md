# AGENTS.md

你正在维护 ProtoDock，一个通用本地原型工作台。

## 工作原则

- ProtoDock 是展示和编排工具，不是页面源码生成器。
- 页面源码归设计 Agent 维护；ProtoDock 只读取 manifest 中声明的静态入口。
- 不要把页面数据硬编码进 `app.js`。
- `protodock.project.json` 是项目清单和 flow 的持久化入口。
- 修改 UI 前先阅读 `README.md`、`DESIGN_AGENT_CONTRACT.md` 和 `protodock.project.schema.json`。
- 保持项目纯静态，除非用户明确要求引入后端或构建链。

## 代码结构

- `index.html`：工具外壳、工具栏、画布、右侧文档面板和弹窗。
- `styles.css`：Apple 风格工具 UI、设备壳、画布节点、连线和 inspector。
- `app.js`：manifest 读取、iframe 预览、本地保存、画布交互和运行时 API。
- `examples/`：示例 ProtoDock 项目。
- `protodock.project.schema.json`：manifest 的机器校验契约。

## 编辑约束

- 优先保持现有前端质感，不要重做视觉体系。
- 单文件超过 2000 行时要拆分模块。
- 不要覆盖示例页面之外的用户项目源码。
- 保存逻辑必须保留本地文件冲突提示。
- 新增 manifest 字段时同步更新 schema、README 和设计 Agent 契约。

## 验证

至少运行：

```bash
node --check app.js
python3 -m http.server 4175
```

浏览器打开 `http://localhost:4175/index.html` 后确认示例项目能加载，节点中能看到真实 iframe 页面预览。
