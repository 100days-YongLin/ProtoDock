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

打开项目后，可以点击顶部显示的当前项目名称进行重命名。点击“保存名称”会立即把名称写回 `protodock.project.json`，重新载入项目后仍会保留；公开预览等只读项目不允许重命名。

选中页面后，右侧标题区的“复制页面 PNG”按钮会把当前页面首屏写入剪贴板。复制按钮右侧可以切换“带设备框”和“无设备框”：带框模式会合成项目设备壳，无框模式按项目真实视口输出纯页面截图并保留安全区。浏览器不支持图片剪贴板写入时，会自动下载 PNG。

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

右上角“分享”按钮会上传项目包到后端。打开本地项目目录后，ProtoDock 会优先在浏览器内自动打包当前项目，不需要手动压缩；如果没有本地目录权限，也可以手动选择 `.zip` 项目包。ZIP 根目录必须直接包含 `protodock.project.json`、`pages/`、`docs/` 和可选的 `assets/`，禁止额外套项目名、版本号或交付目录。ProtoDock 专用上传包必须与完整交付包分开生成。

服务端会在导入前按 manifest 一次性校验所有 `pages.*.entry` 和 `pages.*.doc`。路径不是 ZIP 根目录相对路径、文件缺失，或清单被放在外层目录时，上传会直接失败并返回具体路径，不会等进入画布后再逐页报 `NotFoundError`。

建议分别命名为 `<project>-<version>-protodock-upload.zip` 和 `<project>-<version>-full-release.zip`，不要向用户推荐后者用于 ProtoDock 上传。

自动打包只读取当前项目目录中的 `pages/**`、`docs/**` 和 `assets/**`，并把当前内存里的 manifest 状态写入包内的 `protodock.project.json`。如果右侧文档有未保存修改，也会进入分享包，但不会因此写回本地磁盘。

分享弹窗支持两种模式：

- `新建`：生成新的 `/s/<share-id>` 公开预览链接。
- `更新`：从已有公开预览列表中选择一个项目，用新上传的 zip 替换对应 `shares/<share-id>/` 内容，原分享链接保持不变。

分享链接默认进入独立预览页，浏览者可以直接在手机上按页面顺序查看原型。项目内容从 `shares/<share-id>/` 读取，不会写回上传者本地文件。

如果需要查看画布节点、连线和右侧文档，可以打开 `/s/<share-id>/canvas`。这个入口仍然是只读画布，不允许浏览者编辑 canvas、docs 或页面信息。

首页的“打开项目”会提供三种来源：

- `打开本地项目`：选择包含 `protodock.project.json` 的本地目录，可编辑并保存。
- `打开公开预览`：读取 `GET /api/shares`，列出当前服务上已经上传过的分享项目，点击后进入对应 `/s/<share-id>` 公开预览。
- `从 GitHub 仓库打开`：填写 GitHub 仓库地址、分支和可选项目路径。服务端会下载指定分支中的 ProtoDock 项目，复制 `protodock.project.json`、`pages/**`、`docs/**` 和 `assets/**` 到 `shares/<share-id>/`，再生成 `/s/<share-id>` 公开预览。分支为必填；项目路径留空时默认读取仓库根目录。浏览器会记住上一次成功打开时使用的这三项。

进入 `/s/<share-id>` 后，顶部会提供“打开画布”和“下载项目包”两个操作；下载会拿到该只读项目对应的 zip 包。

默认使用 `6080` 是为了避开 Chrome 会拦截的保留端口，例如 `6000` 和 `6666`。

如果服务通过 FRP 或反向代理暴露，分享列表和上传结果会按当前访问地址生成链接。也就是说，从哪个域名或端口打开 ProtoDock，公开预览列表里就显示对应入口的 `/s/<share-id>`。

## GitHub 推送

内置 Python 服务也可以把当前本地项目推送到公司内部固定私有 GitHub 仓库。这个能力复用浏览器端自动打包：只读取 `protodock.project.json`、`pages/**`、`docs/**` 和 `assets/**`，不会把服务端密钥写入项目包。

服务端启动前配置固定仓库。默认认证方式是 Deploy Key：

```bash
export PROTODOCK_GITHUB_REPO=git@github.com:company/protodock-prototypes.git
export PROTODOCK_GITHUB_AUTHOR_NAME=ProtoDock
export PROTODOCK_GITHUB_AUTHOR_EMAIL=protodock@example.com
PROTODOCK_PORT=6080 python3 server.py
```

第一次打开右上角“GitHub”弹窗时，服务端会在 `.secrets/github-deploy-key` 自动生成 deploy key。把弹窗中的公钥复制到固定私有仓库的 `Settings -> Deploy keys`，并勾选写权限。私钥只保存在服务端 `.secrets/`，该目录必须留在 `.gitignore` 中。

如果组织策略禁用了 Deploy Keys，推荐改用 GitHub App installation token。先在 GitHub 组织里创建 GitHub App，授予目标仓库 `Contents: Read and write` 权限并安装到固定仓库，然后把 GitHub App 下载的 `.pem` 私钥放到服务端 `.secrets/` 目录。启动服务时配置：

```bash
export PROTODOCK_GITHUB_AUTH=app
export PROTODOCK_GITHUB_REPO=https://github.com/company/protodock-prototypes.git
export PROTODOCK_GITHUB_APP_ID=<github-app-id>
export PROTODOCK_GITHUB_INSTALLATION_ID=<installation-id>
export PROTODOCK_GITHUB_APP_KEY_PATH=/path/to/protodock-share/.secrets/protodock-push.private-key.pem
export PROTODOCK_GITHUB_AUTHOR_NAME=ProtoDock
export PROTODOCK_GITHUB_AUTHOR_EMAIL=protodock@example.com
PROTODOCK_PORT=6080 python3 server.py
```

GitHub App 模式下，前端不会展示或复制私钥；服务端只在推送时临时换取 installation token，并通过 git 的凭据回调使用这个 token。`.pem`、`.secrets/` 和 `.github-work/` 都不应进入 git。

如果服务所在机器需要让 GitHub 出站单独走转发，可以配置：

```bash
export PROTODOCK_GITHUB_PROXY=http://127.0.0.1:7890
```

这个代理只会用于 GitHub App API、从 GitHub 打开项目、推送到 GitHub 这些出站操作；不会影响用户访问 ProtoDock 后端、公开预览链接或静态资源。当前实现面向 HTTPS GitHub 仓库和 GitHub App 模式；如果使用 Deploy Key 的 SSH 推送，仍需要在 SSH 层单独配置代理。

推送时用户填写：

- `产品名`：例如 `pictale`
- `版本号`：例如 `v1` 或 `report-h5`
- `Commit message`：本次提交说明

后端会组合分支名为 `产品名/版本号`，例如 `pictale/v1`。每次推送都会覆盖该分支中的受控内容，再执行 commit 和 `git push --force-with-lease`。产品名和版本号只允许英文、数字、点、中横线和下划线，避免生成非法 Git 分支名。

推送成功后，浏览器会按 `project.id` 记住该项目使用的产品名和版本号；下次打开 GitHub 弹窗时自动恢复。Commit message 不会复用，避免误用上一次提交说明。

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

## 安装 ProtoDock Skill

可分发 Skill 位于 `skills/protodock-canvas/SKILL.md`。在仓库根目录执行：

```bash
# 同时安装到 Codex 和 Claude Code 的用户级 Skill 目录
./scripts/install-protodock-skill.sh both

# 安装到指定项目，让规则只在该项目生效
./scripts/install-protodock-skill.sh both project /path/to/prototype-project
```

Codex 使用 `~/.agents/skills` 或项目内 `.agents/skills`；Claude Code 使用 `~/.claude/skills` 或项目内 `.claude/skills`。完整说明见使用文档的“Skill 安装与文件契约”。
