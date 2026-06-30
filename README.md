# ProtoDock

ProtoDock 是一个本地静态原型工作台。它不负责替设计 Agent 生成页面，而是读取项目目录里的静态页面入口，把它们放进统一设备壳中预览，并维护页面节点、流程连线、文档和画布位置。

## 核心机制

- ProtoDock 自身是纯静态前端，可以通过 `http://localhost` 打开。
- 每个原型项目必须包含 `protodock.project.json`。
- 页面源码由设计 Agent 维护，入口通常是 `pages/<page-id>/index.html`。
- ProtoDock 通过 manifest 中的 `page.entry` 读取页面，并在画布节点中用 iframe 预览。
- 画布节点、连线、文本说明和项目设备壳由 `protodock.project.json` 持久化。
- 右侧 Markdown 文档可以绑定到 `docs/<page-id>.md`。

## 推荐目录

```text
prototype-project/
├── protodock.project.json
├── pages/
│   ├── home/
│   │   └── index.html
│   ├── clips/
│   │   └── index.html
│   └── report/
│       └── index.html
├── docs/
│   ├── home.md
│   ├── clips.md
│   └── report.md
├── assets/
└── exports/
```

## Manifest 最小示例

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "project-pictale",
    "name": "PicTale 微信小程序",
    "description": "家长端移动原型",
    "devicePreset": "iphone-portrait"
  },
  "pages": {
    "home": {
      "title": "首页",
      "kind": "微信小程序",
      "sourceDir": "pages/home",
      "entry": "pages/home/index.html",
      "doc": "docs/home.md"
    }
  },
  "canvas": {
    "nodes": [
      { "id": "node-home", "pageId": "home", "x": 120, "y": 128 }
    ],
    "edges": [],
    "notes": []
  }
}
```

## 本地使用

在 ProtoDock 仓库根目录启动任意静态服务器：

```bash
python3 -m http.server 4175
```

然后打开：

```text
http://localhost:4175/index.html
```

打开本地项目时，建议使用 Chrome 或 Edge。ProtoDock 使用 File System Access API 读取和保存 `protodock.project.json` 与 `docs/*.md`。

## 冲突处理

保存前如果磁盘上的 `protodock.project.json` 已经被其他工具或 Agent 修改，ProtoDock 会弹窗提示：

- `读取本地变更`：放弃当前内存状态，重新读取磁盘文件。
- `覆盖本地文件`：用当前 ProtoDock 状态写回磁盘。
- `取消`：不保存，继续保留当前界面状态。

## 设计 Agent

设计 Agent 不需要理解 ProtoDock 的内部画布实现，只需要遵守 [DESIGN_AGENT_CONTRACT.md](./DESIGN_AGENT_CONTRACT.md)。
