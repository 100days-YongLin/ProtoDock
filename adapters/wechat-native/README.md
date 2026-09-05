# ProtoDock 微信原生适配器

将微信原生小程序的 WXML、WXSS 和 TypeScript 编译为 ProtoDock 可读取的静态 Web 页面。编译基于微信团队开源的 `glass-easel`，不会修改或向业务源码仓库提交内容。

## 使用方式

```bash
cd adapters/wechat-native
npm ci
node build.mjs \
  --source /absolute/path/to/miniprogram \
  --output /absolute/path/to/prototype/pages \
  --config /absolute/path/to/prototype/protodock.wechat.json
```

`--source` 必须直接包含 `app.json`。输出目录会包含一份共享运行时、每个小程序页面的 HTML 入口以及 `_wechat-adapter-report.json`。

适配器只会把源码复制到操作系统临时目录后编译，不会改动、提交或推送业务仓库。建议把来源仓库固定到明确 commit 后再生成，报告会记录该 commit。

## 配置

```json
{
  "pageIdPrefix": "parent",
  "pages": {
    "pages/home/index": "home",
    "pages/moments/list/index": "moments"
  },
  "fixtures": "fixtures/wechat.json",
  "previewDate": "2026-09-04T10:00:00+08:00",
  "storage": {
    "token": "preview-token"
  },
  "query": {
    "pages/home/index": {
      "childId": "1001"
    }
  },
  "fallbackPages": {
    "pages/moments/detail/index": "moments"
  }
}
```

`fixtures` 可以直接写对象，也可以指向相对于配置文件的 JSON。请求键使用 `METHOD /path`；`*` 是兜底响应。适配器不会请求生产接口，未配置的请求会进入页面原有失败逻辑并在控制台给出明确提示。

页面按“今天”请求 fixture 或展示相对日期时，配置带明确时区的 ISO 8601 `previewDate`。它会在业务 bundle 执行前固定无参数 `Date()`、`new Date()` 和 `Date.now()`；显式日期参数、`Date.parse` 与 `Date.UTC` 保持原生行为。未配置时使用浏览器真实时间。

将报告中的 `pages[].entry` 登记到 `protodock.project.json`。正式验收至少实际操作一个输入或状态变化、一个前进路由、一个返回路径，并分别在本地 Player 与公开 Share 中检查资源和控制台。

## 边界

- 页面、组件、数据绑定、`setData`、常用表单控件和路由可复用。
- WXSS 的 `page` 选择器会映射到每个预览 iframe 内的真实页面根，页面背景、尺寸和 CSS 自定义属性可继续由组件继承，且不会跨页面串样式。
- WXSS 中的微信原生标签选择器会精确映射到浏览器里的 `wx-*` 标签，后代、子级和相邻选择器可保持原有语义；类名、属性选择器和自定义组件不会被改写。
- 手机预览 iframe 默认隐藏页面与内部滚动容器的浏览器滚动条，但继续支持触控、滚轮和脚本滚动；该样式不会影响 ProtoDock 外壳或 Web 端原型。
- `scroll-view` 作为 flex item 时会收缩到父容器宽度；固定宽横向内容保留在内部滚动层中，不会撑宽外层页面或被裁掉。
- TabBar 只出现在 `tabBar.list[].pagePath` 声明的页面。`navigationStyle` 非 `custom` 的页面会根据 app `window` 与页面 JSON 的合并配置显示轻量原生导航栏；非 TabBar 页面提供返回按钮。
- 扫码、上传、订阅消息和媒体预览使用浏览器 Mock。
- `canvas`、视频、文件系统和外部小程序只提供展示级兼容，不等同于真机能力。
- `_wechat-adapter-report.json` 中出现不支持的微信 API、原生标签或 WXS 时，构建会以非零状态退出；必须先补适配或保留已有可操作原型，不能静默交付。
- 生成页面仍需写入 `protodock.project.json` 并按常规 ProtoDock 路由、返回和 ZIP 门禁验收。
