# ProtoDock

ProtoDock 是一个本地静态原型工作台。它不负责替设计 Agent 生成页面，而是读取项目目录里的静态页面入口，把它们放进统一设备壳中预览，并维护页面节点、流程连线、文档和画布位置。

## 核心机制

- ProtoDock 自身是纯静态前端，可以通过 `http://localhost` 打开。
- 每个原型项目必须包含 `protodock.project.json`。
- 新建项目会生成 `README.md`，但项目 ID 仍以 `protodock.project.json` 的 `project.id` 为唯一来源。
- 页面源码由设计 Agent 维护，入口通常是 `pages/<page-id>/index.html`。
- ProtoDock 通过 manifest 中的 `page.entry` 读取页面，并在画布节点中用 iframe 预览。
- iframe 会按设备真实尺寸渲染，例如 iPhone 14 Pro 是 `390 x 830`，再整体缩放成画布缩略图。
- 手机和平板设备壳使用 vendored `picturepan2/devices.css`，避免依赖外部 CDN。
- 安全区由 `project.safeAreaEnabled`、`project.safeAreaTop` 和 `project.safeAreaBottom` 控制，单位是 px。
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

## Agent 写入边界

原型页面是可生成资产，画布排布是用户劳动成果。Agent 或导出脚本必须先保护画布，再更新页面。

- `pages/**`、`docs/**`、`assets/**` 可以由 Agent 生成或更新。
- `protodock.project.json` 中的 `project` 和 `pages` 可以由 Agent 按需更新。
- `canvas.nodes`、`canvas.edges`、`canvas.notes` 默认视为用户在 ProtoDock 中编辑过的布局数据，Agent 不得整体重写。
- Agent 如需新增页面节点，只能按 `id` 或 `pageId` 增量追加缺失节点，并必须保留已有节点的 `x`、`y`、`fromSide`、`toSide`、锚点、说明文本以及未知字段。
- 只有用户明确说“重排画布”“重建 flow”或“覆盖 canvas”时，Agent 才能重写 `canvas`。
- 导出脚本默认必须 preserve canvas；只有显式参数如 `--reset-canvas` 才允许重排或替换整个 `canvas` 对象。

## Manifest 备份规则

Agent 或脚本修改 `protodock.project.json` 前，必须先复制一份备份到当前原型项目目录：

```text
protodock/backups/protodock.project.<YYYYMMDD-HHMMSS>.json
```

如果备份失败，必须停止写入。备份成功后，更新 manifest 时只能按字段 merge，禁止把 `protodock.project.json` 当成可整体重生成的产物。

## Manifest 最小示例

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "project-pictale",
    "name": "PicTale 微信小程序",
    "description": "家长端移动原型",
    "devicePreset": "iphone-portrait",
    "safeAreaEnabled": true,
    "safeAreaTop": 59,
    "safeAreaBottom": 34
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

选中页面后，右侧标题区的“复制页面 PNG”按钮会把当前页面首屏和设备壳合成为 PNG 写入剪贴板。浏览器不支持图片剪贴板写入时，会自动下载 PNG。

## 使用文档

顶部“使用文档”入口指向 `/docs`。文档源码使用 Mintlify 官方模板结构维护在 `docs-site/`，不是手写静态页面。

本地构建文档：

```bash
./scripts/build-docs.sh
```

脚本会运行 `mint validate` 和 `mint export`，并把导出包解压到 `docs-dist/`。`docs-dist/` 是生成产物，不进入 git；当目录存在时，内置 Python 服务会把 `/docs`、Mintlify 页面路由和 `_next` 资源指向这份导出结果。

## 分享预览服务

如果需要让同事通过 URL 只读预览项目，可以启动内置 Python 服务：

```bash
PROTODOCK_PORT=6080 python3 server.py
```

然后打开：

```text
http://<server-ip>:6080/index.html
```

右上角“分享”按钮会上传项目包到后端。打开本地项目目录后，ProtoDock 会优先在浏览器内自动打包当前项目，不需要手动压缩；如果没有本地目录权限，也可以手动选择 `.zip` 项目包。压缩包根目录可以直接包含 `protodock.project.json`，也可以外层包一层项目文件夹；服务端只解压 `protodock.project.json`、`pages/**`、`docs/**` 和 `assets/**`。

自动打包只读取当前项目目录中的 `pages/**`、`docs/**` 和 `assets/**`，并把当前内存里的 manifest 状态写入包内的 `protodock.project.json`。如果右侧文档有未保存修改，也会进入分享包，但不会因此写回本地磁盘。

分享弹窗支持两种模式：

- `新建`：生成新的 `/s/<share-id>` 只读预览链接。
- `更新`：从已有公开预览列表中选择一个项目，用新上传的 zip 替换对应 `shares/<share-id>/` 内容，原分享链接保持不变。

分享链接中的项目会从 `shares/<share-id>/` 读取，不会写回上传者本地文件，也不会允许浏览者编辑 canvas、docs 或页面信息。

首页的“打开公开预览”会读取 `GET /api/shares`，列出当前服务上已经上传过的分享项目。列表显示项目名称和分享地址，点击后进入对应 `/s/<share-id>` 只读预览。

进入 `/s/<share-id>` 后，右上角按钮会从“分享”切换为“下载”，下载该只读项目对应的 zip 包。

默认使用 `6080` 是为了避开 Chrome 会拦截的保留端口，例如 `6000` 和 `6666`。

如果服务通过 FRP 或反向代理暴露，分享列表和上传结果会按当前访问地址生成链接。也就是说，从哪个域名或端口打开 ProtoDock，公开预览列表里就显示对应入口的 `/s/<share-id>`。

## GitHub 推送

内置 Python 服务也可以把当前本地项目推送到公司内部固定私有 GitHub 仓库。这个能力复用浏览器端自动打包：只读取 `protodock.project.json`、`pages/**`、`docs/**` 和 `assets/**`，不会把服务端密钥写入项目包。

服务端启动前配置固定仓库：

```bash
export PROTODOCK_GITHUB_REPO=git@github.com:company/protodock-prototypes.git
export PROTODOCK_GITHUB_AUTHOR_NAME=ProtoDock
export PROTODOCK_GITHUB_AUTHOR_EMAIL=protodock@example.com
PROTODOCK_PORT=6080 python3 server.py
```

第一次打开右上角“GitHub”弹窗时，服务端会在 `.secrets/github-deploy-key` 自动生成 deploy key。把弹窗中的公钥复制到固定私有仓库的 `Settings -> Deploy keys`，并勾选写权限。私钥只保存在服务端 `.secrets/`，该目录必须留在 `.gitignore` 中。

推送时用户填写：

- `产品名`：例如 `pictale`
- `版本号`：例如 `v1` 或 `report-h5`
- `Commit message`：本次提交说明

后端会组合分支名为 `产品名/版本号`，例如 `pictale/v1`。每次推送都会覆盖该分支中的受控内容，再执行 commit 和 `git push --force-with-lease`。产品名和版本号只允许英文、数字、点、中横线和下划线，避免生成非法 Git 分支名。

## 冲突处理

打开本地项目后，ProtoDock 会轻量监测 `protodock.project.json` 是否被其他工具或 Agent 修改。检测只读取项目清单文件，不递归扫描 `pages/**`、`docs/**` 或 `assets/**`。当窗口重新获得焦点时会检查一次；如果当前画布有未保存改动，会额外低频检查。

如果编辑过程中检测到本地清单有更新，ProtoDock 会弹窗提示：

- `读取本地变更`：放弃当前内存状态，重新读取磁盘文件。
- `继续编辑` / `稍后处理`：保留当前界面状态，不重复提示同一次外部变更；后续保存时仍会再次确认冲突。

保存前如果磁盘上的 `protodock.project.json` 已经被其他工具或 Agent 修改，ProtoDock 也会弹窗提示：

- `读取本地变更`：放弃当前内存状态，重新读取磁盘文件。
- `覆盖本地文件`：用当前 ProtoDock 状态写回磁盘。
- `取消`：不保存，继续保留当前界面状态。

## 设计 Agent

设计 Agent 不需要理解 ProtoDock 的内部画布实现，只需要遵守 [DESIGN_AGENT_CONTRACT.md](./DESIGN_AGENT_CONTRACT.md)。
