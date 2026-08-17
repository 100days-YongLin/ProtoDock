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
- `canvas.nodes`、`canvas.edges`、`canvas.notes`、`canvas.groups` 默认视为用户在 ProtoDock 中编辑过的布局数据，Agent 不得整体重写。
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

`canvas.groups` 是可选字段，用于把一组页面节点组织成业务模块。旧项目不包含该字段时仍按原页面列表打开；新建组后 ProtoDock 会写入组 ID、组名、主入口、成员节点和左侧列表折叠状态。

```json
"groups": [
  {
    "id": "group-life-record",
    "title": "生活记录详情",
    "rootNodeId": "node-life-daily",
    "nodeIds": ["node-life-daily", "node-meal-detail", "node-nap-detail"],
    "collapsed": false
  }
]
```

左侧“原型页面”按组显示树形层级，支持按页面名、`pageId`、入口路径和组名搜索，也可以单独收起列表分组。列表搜索与收起只影响左侧导航，Canvas 始终展示全部页面节点、页面组、连线和备注。点击左侧页面即可定位对应节点；应用局部布局前会先备份 manifest，并且只更新当前组节点坐标。

旧项目不强制升级。需要分组时，使用 `protodock-canvas` Skill 先生成分组提案，确认后只新增 `canvas.groups`，不得同时重排或改写现有页面、节点、连线与备注。具体步骤和可直接使用的提示词见使用文档的“用 Skill 升级旧版原型”。

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

顶部“播放原型”打开的右侧预览与公开 Share 页面都运行真实 iframe。页面自身的点击、输入、滚动、弹窗和 JavaScript 状态会原样执行；跨 manifest 页面必须显式使用 `data-protodock-page="<pageId>"`、`href="protodock:<pageId>"` 或 `protodock:navigate` 消息。旧静态页面仍有兼容恢复能力，但它不代表新交付通过验收；最终 ZIP 必须扫描控件和脚本，阻止根路径 `/pages/...`、目标未注册、目标节点不唯一或仅靠 `window.location` 跳转的页面。

二级页面的返回键使用 `data-protodock-back`，ProtoDock 会回到用户实际访问的上一页并恢复 query/hash；可用 `data-protodock-back="home"` 指定没有访问历史时的兜底页。这个属性只表达语义，不会代替页面实现点击逻辑。独立静态页面必须自带桥接脚本：优先调用 `window.ProtoDockPreview.back(fallbackPageId)`，不可用时向父窗口发送 `{ type: 'protodock:back', fallbackPageId }`。可从 Skill 的 `templates/protodock-back-bridge.js` 复制标准实现到项目 `assets/`。只声明属性、依赖宿主自动拦截，或使用 iframe 的 `history.back()` 都会被上传校验器拦截。

公开分享上传和 GitHub 推送共用后端 ZIP 解压校验，提交包每次都会自动检查入口、文档、Canvas、跨页目标和返回协议；任一错误都会在写入分享目录或推送仓库前阻止操作。`scripts/protodock-validate` 用于 Agent 在交付前对同一份最终 ZIP 提前执行相同门禁。

`docs/<page-id>.md` 是给产品、设计、研发和 Agent 对齐的产品文档，不是源码导出说明。新建页面会生成“页面定位、使用场景、前置条件、页面内容、交互规则、业务规则、状态与异常、数据影响、产品验收、非本期范围”模板；验收场景统一写成“前提 / 操作 / 预期”。源码目录和入口在页面信息二级视图查看，不应占用 PRD 主体。

校验器会把产品文档缺章节、验收字段不完整、残留“请填写”和技术实现章节报告为警告。旧项目默认仍可上传；使用 `--warnings-as-errors` 时，文档质量警告会和 Canvas 视觉警告一起阻止发布。

画布右下角的缩略图会显示全部页面节点、页面组、流程连线和文本备注，蓝色边框表示当前视口。点击或拖动缩略图可以快速移动到其他区域；右上角“适配全部”按钮会把所有画布内容放进当前视口。手动缩放范围为 `10%-300%`。

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

上传前也可以在本地运行同一套校验器。交付时必须传入最终 ZIP，不能只检查打包前目录：

```bash
./scripts/protodock-validate /path/to/project-v1.1-protodock-upload.zip
```

校验器会检查 ZIP 根目录、manifest 文件路径、Canvas 节点/连线/分组、节点重叠和跨页导航，并输出跨页路由表。发现缺失文件、重复节点、悬空连线、旧 `data-page`、`window.location`、根路径 `/pages/...` 或无效目标时返回非零退出码。`--json` 可供 Agent 和 CI 读取，`--warnings-as-errors` 可让连线交叉、穿过节点及间距不足也阻止发布。分享上传和 GitHub 导入会在服务端再次执行同一套核心校验。

建议分别命名为 `<project>-<version>-protodock-upload.zip` 和 `<project>-<version>-full-release.zip`，不要向用户推荐后者用于 ProtoDock 上传。

自动打包只读取当前项目目录中的 `pages/**`、`docs/**` 和 `assets/**`，并把当前内存里的 manifest 状态写入包内的 `protodock.project.json`。如果右侧文档有未保存修改，也会进入分享包，但不会因此写回本地磁盘。

打开项目后，顶部的“完整产品文档”会在新标签页生成项目级 PRD 阅读视图。它按 `canvas.groups` 汇总业务模块；旧项目没有分组时自动按画布页面顺序展示。每个页面包含带设备框的完整长截图和对应 `docs/<page-id>.md` 正文，长截图会自动展开页面及内层滚动区域直至内容底部；支持目录定位、点击后滚动查看原尺寸大图，以及打印或导出 PDF。首次打开会并行生成截图并复用相同图片、字体和样式资源；截图完成后写入浏览器持久缓存，再次打开时直接读取。页面目录、公共素材、设备规格、安全区或截图模式变化后，对应缓存会自动失效。单页截图失败不会阻断其他 PRD 内容。

完整产品文档是运行时汇总视图，不会生成或覆盖新的总 Markdown 文件，也不会把截图写回项目目录。页面级 `docs/*.md` 仍然是产品文档的唯一来源；本地编辑器中尚未保存的文档内容也会进入本次阅读视图。

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

如果主访问入口适合预览但上传链路较慢，可以单独配置高速上传入口：

```bash
export PROTODOCK_UPLOAD_ORIGIN=http://100.113.173.18:6080
```

浏览器仍从当前访问地址生成分享链接，但 ZIP 会优先发送到高速入口；高速入口不可达时自动回退当前地址。高速入口只填写 origin，不要包含 `/api/shares` 路径。

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

设计 Agent 不需要理解 ProtoDock 的内部画布实现，只需要遵守 [DESIGN_AGENT_CONTRACT.md](./DESIGN_AGENT_CONTRACT.md)。每个 manifest page 必须恰好对应一个 canvas node；上传会阻止缺失/重复节点、悬空/重复连线和节点重叠，并对连线交叉、穿过无关节点及间距不足给出警告。普通 build/export 和上传不会自动重排画布。

## 安装 ProtoDock Skill

可分发 Skill 位于 `skills/protodock-canvas/SKILL.md`。在仓库根目录执行：

```bash
# 同时安装到 Codex 和 Claude Code 的用户级 Skill 目录
./scripts/install-protodock-skill.sh both

# 安装到指定项目，让规则只在该项目生效
./scripts/install-protodock-skill.sh both project /path/to/prototype-project
```

更新已安装的旧版 Skill 时，拉取最新版仓库后重新执行同一条安装命令即可；脚本会先备份旧规则，并同步安装校验器和 `templates/protodock-back-bridge.js`。更新 Skill 本身不会修改任何旧原型文件，旧页面的返回桥接仍需由 Agent 显式升级。

Codex 使用 `~/.agents/skills` 或项目内 `.agents/skills`；Claude Code 使用 `~/.claude/skills` 或项目内 `.claude/skills`。完整说明见使用文档的“Skill 安装与文件契约”。
