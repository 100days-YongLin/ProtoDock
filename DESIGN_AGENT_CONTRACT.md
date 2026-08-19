# Design Agent Contract

This contract tells design agents how to create prototype pages that ProtoDock can preview.

## Required Output

Every prototype project must include:

```text
protodock.project.json
pages/<page-id>/index.html
docs/<page-id>.md
```

Design agents may use React, Vue, Svelte, plain HTML, or any other frontend stack while designing. The delivered output for ProtoDock must be a static preview entry that the browser can load.

## Hard Rules

1. Each page registered in `protodock.project.json` must have a unique `pageId`.
2. Each registered page must provide `entry`, usually `pages/<page-id>/index.html`.
3. The page entry must be a static browser-readable artifact.
4. Build output should be self-contained or use simple relative assets that live inside the project directory.
5. If using React/Vue/Vite, compile the design before handing it to ProtoDock.
6. Prefer single-page static bundles for v1. Avoid runtime dev servers, API calls, or assets outside the project directory.
7. Treat `protodock.project.json > project.id` as the only source of truth for project identity.
8. Treat `canvas.nodes`, `canvas.edges`, `canvas.notes`, and optional `canvas.groups` as user-owned ProtoDock layout state. Never regenerate, normalize, replace, or reorder them unless the user explicitly asks for canvas reset or re-layout.
9. When adding a page to an existing manifest, merge by `pageId` or node `id`: append only missing nodes or edges, and preserve existing coordinates, anchor sides, notes, and unknown fields.
10. Before writing `protodock.project.json`, create a timestamped backup at `protodock/backups/protodock.project.<YYYYMMDD-HHMMSS>.json`. If backup fails, stop.
11. Do not delete or overwrite user-authored pages, docs, or assets without explicit instruction.
12. Keep the project-level `devicePreset` consistent. v1 assumes one device shell per project.
13. Use `docs/<page-id>.md` for page intent, states, and acceptance notes.
14. A ProtoDock upload ZIP must place `protodock.project.json`, `pages/`, `docs/`, and optional `assets/` directly at the archive root. Never add an outer delivery, project-name, or version directory.
15. Generate the ProtoDock upload ZIP separately from the full release package. Never recommend the full release package for ProtoDock upload.
16. Re-extract and validate the final ZIP, not only the source directory. Every `pages.*.entry` and `pages.*.doc` must exist relative to the extracted ZIP root before delivery is complete.
17. Every manifest page must have exactly one canvas node. Missing nodes, duplicate node IDs or page nodes, dangling or duplicate edges, unknown page references, and overlapping nodes are delivery-blocking errors.
18. Group nodes by top-level business module. Keep module entries, states, and result/detail pages together; never dump new pages at the bottom or assign random coordinates.
19. Do not draw global Tab or sidebar navigation across modules. Keep only key task-flow actions on canvas and put secondary paths in page documentation.
20. Prefer `bottom -> top` anchors for vertical flows and `right -> left` for same-level flows. Avoid edge crossings and edges that pass through unrelated nodes.
21. Normal build/export must preserve canvas. Only explicit `--relayout`, `--reset-canvas`, or a direct user request may change it, after a manifest backup and preview.
22. A static build must remain executable. Do not replace an interactive React/Vue/Svelte page with server-rendered DOM that has lost event handlers.
23. Every cross-page control must declare its exact manifest target with `data-protodock-page="<pageId>"`, `href="protodock:<pageId>"`, `window.ProtoDockPreview.navigate(pageId)`, or the documented `protodock:navigate` postMessage protocol. Script-only navigation and legacy `data-page` do not pass new-delivery validation.
24. Smoke-test representative clicks, inputs, scrolling, local state changes, and one cross-page transition in both the right-side player and the public Share preview.
25. Validate navigation against the extracted final ZIP: scan controls and scripts, reject root-absolute `/pages/...`, localhost, local absolute paths, undeclared targets, ambiguous targets, and targets without exactly one canvas node.
26. If a query parameter represents a state already registered as a manifest page, link directly to that state `pageId` instead of routing through a generic page plus query parameters.
27. Run `scripts/protodock-validate <final-upload.zip>` after packaging. A non-zero exit code blocks delivery; source-directory checks and prose reviews do not satisfy this gate.
28. Back controls must use `data-protodock-back[="<fallbackPageId>"]` and ship an executable click bridge that prefers `ProtoDockPreview.back()` and falls back to the `protodock:back` message. The attribute alone is not an implementation. Do not use iframe `history.back()` or rely on host auto-interception; click-test history return and direct-entry fallback in both player and Share.
29. Every new or modified `docs/<page-id>.md` must follow the Product Documentation Contract below. Acceptance scenarios use the Chinese labels `前提 / 操作 / 预期`; source paths and implementation details belong in manifest metadata, not the PRD body.
30. Every completed batch of Agent edits must append one item to top-level `pendingChanges` with ISO 8601 `changedAt` and a concise `description`; it must not invent or reuse a release version. Prefer relevant sections from `用户体验：`, `产品调整：`, and `前后端逻辑：`, with short `- <change>` bullets below each. The third section is for observable interaction, API, data, permission, or synchronization contracts, not an engineering diary. This structure is an Agent writing convention and must not block user-authored freeform descriptions. ProtoDock publishing merges all pending items into one append-only `changelog` entry whose version is exactly the publish version, then clears `pendingChanges`. Never rewrite, reorder, or delete earlier release history.
31. Local integration secrets such as a Feishu custom-bot Webhook belong only in optional `protodock.local.json`. Add that file to `.gitignore`; never copy it into `protodock.project.json`, pages, docs, assets, upload ZIPs, public shares, downloads, or GitHub branches.
32. Scope PRD changes by feature: identify the owning Canvas group and every affected page, update the related page artifacts and documents together, and leave unrelated docs untouched so Git Diff reflects the true feature boundary.
33. New Git-backed deliveries use one long-lived `project/<product>` branch and immutable `release/<product>/<version>` tags. Do not create one permanent orphan branch per version, force-push a product branch, or move a published release tag.
34. The editable project directory is the source of truth. A ProtoDock server Git delivery workspace is generated and managed by publishing only; Agents must not edit it directly or use it as a second project source.
35. The editable project root is the only directory to recommend for `打开本地项目`. It must directly contain the manifest and every declared `pages.*.entry` and `pages.*.doc`; do not recommend `dist`, build output, a full-delivery wrapper, or a ZIP extraction parent.
36. Do not create `dist/` or a nested ProtoDock delivery copy inside the editable project. Generate temporary release ZIPs outside the project root, and keep continued editing, PRD updates, changelog history, and Git diffs in the complete source root.
37. Final handoff must state the absolute `ProtoDock 本地打开目录` separately from any `发布 ZIP`. Validate and open the directory itself before delivery, then validate the final ZIP as an independent release artifact.
38. Keep the project root clean. Formal ProtoDock inputs are `protodock.project.json`, `pages/`, `docs/`, and optional `assets/`; editable source, scripts, tests, active references, and current QA evidence use dedicated directories rather than loose root files.
39. Local-only legacy files, experiments, old ZIPs, superseded screenshots, and historical QA artifacts belong under ignored `temps/`. Nothing active or referenced may depend on `temps/`, and it must never enter publishing or Git delivery.
40. Before reorganizing a legacy project, inventory references and Git state and present a dry-run classification. Do not move files merely because they are outside the ProtoDock publishing set; framework source and build inputs may still be required.
41. Do not leave root-level manifest backups or duplicate source trees. Store safety backups under ignored `protodock/backups/`, retain one canonical editable source root, and document its mapping to `pages/` in README and build scripts.
42. Final local static resources must use plain project-relative paths. Do not append `?v=`, other query strings, or `#hash` fragments to `script[src]`, stylesheet links, image/media resources, iframe resources, `srcset`, CSS `url()`, or CSS `@import`; use content-hashed filenames when cache invalidation is required.
43. Validate the editable directory and the re-extracted final ZIP with the same static-resource scan. Then open the directory in ProtoDock and exercise representative JavaScript, CSS, image, navigation-bridge, and back-bridge resources before checking the public Share surface.
44. ProtoDock may strip query/hash suffixes while reading legacy local projects. That behavior is compatibility recovery only and cannot be cited as delivery compliance.
45. Resolve HTML resources relative to their page entry and CSS resources relative to the stylesheet that declares them. Root-absolute `/assets/...` paths and guessed source-directory traversal are forbidden.
46. Do not generate project-local image/media URLs at runtime through `.src = "./..."`, generated `<img src>`, inline `background-image`, `document.currentScript.src`, or `import.meta.url`. Declare finite prototype assets in original HTML/CSS, switch them with CSS classes, or embed data/blob URLs so local Player and public Share use the same resource identity.
47. ProtoDock may rewrite dynamically inserted local media in legacy previews. New and modified pages must still pass the static runtime-path gate; runtime recovery is not delivery evidence.
48. Every icon-like UI control or status mark must use a mature SVG from the existing design system or an established library such as Lucide, Material Symbols SVG, or Heroicons. Do not substitute emoji, Unicode glyphs, punctuation, letters, icon-font characters, or CSS approximations such as `←`, `×`, `+`, `⋯`, `⚙`, `✓`, or emoji. Bundle SVGs under project assets, keep one consistent icon family, add accessible names to icon-only controls, and reserve custom SVG drawing for brand or domain-specific concepts that have no standard icon.
49. Every visible string must belong to the intended user's task. Do not render implementation explanations, internal prompt or policy names, inheritance models, architecture boundaries, acceptance annotations, debug metadata, internal identifiers, or version suffixes such as `system-boundary-v7` and `class-dragon2-v4`. Move those details to PRD, code comments, configuration metadata, or developer diagnostics. A modified page or dialog with unexplained internal language visible at its manifest viewport fails delivery.
50. The copy audit covers runtime-rendered content and assistive text, not only static HTML: dialogs, drawers, menus, tooltips, placeholders, toasts, tables, loading, empty, error, success, disabled, permission, and expanded states, plus `aria-label`, `title`, and image alternative text. `TODO`, `TBD`, mock/placeholder labels, demo annotations, source or API errors, and unfinished product decisions block handoff.
51. Keep review and implementation annotations outside the product viewport. Put them in Canvas notes, page PRD, QA evidence, or an explicitly developer-only diagnostic surface that is excluded from the release. Do not add explanatory cards, badges, legends, or help text solely to make the prototype understandable to reviewers.

## Icon Asset Quality

- Prefer the product's existing SVG icon set. If none exists, select one established library and use it consistently throughout the affected flow.
- Use original library SVG path data rather than redrawing familiar actions by hand or approximating them with CSS.
- Store file-based icons under `assets/icons/` or another documented project asset directory. Remote icon CDNs, operating-system emoji, and runtime-only icon packages are not valid delivery dependencies.
- Character content is allowed when it is genuinely text or punctuation. It is rejected when styled or clicked as the graphical representation of an action, navigation item, status, or decoration.
- Icon-only buttons need `aria-label`; decorative SVGs use `aria-hidden="true"`, and image icons inside labelled controls use `alt=""`.
- Visually inspect all new or modified pages at the manifest viewport before delivery. Missing SVGs, mixed icon styles, blank controls, pseudo-icons, inconsistent stroke weight, and misaligned active or disabled states block handoff.

## User-Facing UI Copy Quality

Prototype UI is a simulation of the product seen by its real user, not a diagram of how the product is implemented.

Use three separate information layers:

1. **Product UI:** labels, values, actions, business content, required instructions, and feedback the intended role needs to decide, act, or recover.
2. **User help:** short, optional guidance about an immediate task or consequence. It must not explain implementation.
3. **Internal context:** rationale, rules, prompts, architecture, identifiers, data lineage, acceptance notes, and diagnostics. Store this in Canvas notes, PRD, QA evidence, configuration, or source code, never in ordinary product UI.

Apply these rules:

- Name the intended role and task before writing a screen. Do not mix terminology, permissions, or explanations from product managers, developers, operators, and end users on one surface unless the confirmed product supports those roles there.
- Visible or assistive copy may exist only when it helps the role identify content, provide required input, choose an action, understand its immediate consequence, or recover from a result.
- Do not expose implementation rationale, system architecture, prompt engineering, model policy, data provenance, rule inheritance, state-machine notes, QA instructions, acceptance commentary, fallback design, developer terminology, or source/API errors merely to explain the prototype.
- Never append internal keys, build markers, prompt IDs, schema names, page IDs, source names, or version suffixes to labels, placeholders, tooltips, badges, table cells, helper text, `aria-label`, `title`, or alternative text.
- Do not show `TODO`, `TBD`, `待确认`, `待补充`, `示例文案`, `模拟数据`, `Mock`, `占位`, `静态状态`, or reviewer instructions in a release prototype. Use plausible role-appropriate content and put unresolved decisions in PRD.
- Helper text should normally be one short, actionable sentence. If removing a paragraph does not prevent the user from deciding, acting, or recovering, move it to PRD.
- Use one stable name for each role, object, status, and action across the page and flow. Avoid unexplained acronyms, mixed product/developer terminology, or different labels for the same destination.
- Button copy should state the action and, when ambiguity exists, its object. Field labels must remain visible; placeholders show format or examples and must not carry the only instruction. Destructive confirmations state the affected object and irreversible consequence.
- Use realistic synthetic content for prototype records, but never expose real credentials, webhook secrets, access tokens, private local paths, or unnecessary personal data. Do not label synthetic content as `测试数据` or `Mock` in the product UI.
- Loading copy describes what the user is waiting for; empty copy states what is absent and the available next action; errors state what failed in user language and how to recover; success copy confirms the completed result. Never expose routes, status codes, stack traces, storage keys, service names, or retry internals.
- If a technical capability is genuinely configured by the intended role, translate it into that role's domain language and expose only the decision and consequence they need. When the intended role is unclear, ask the product owner before adding the field.
- Review every modified page and every opened modal, drawer, menu, tooltip, expandable section, loading, empty, error, success, disabled, and permission state at the manifest viewport. Runtime JavaScript strings and accessibility text are part of the same gate.

For every rendered string, ask:

1. Would the intended role naturally understand this term?
2. Does it help them decide, act, or recover now?
3. Is it product content rather than an explanation for reviewers?
4. Is it free of internal identifiers, versions, implementation, and unresolved decisions?
5. Would moving it to PRD leave the task fully usable? If yes, move it.

Any unresolved answer blocks handoff.

Rejected and preferred examples:

| Rejected visible copy | Preferred user-facing copy |
| --- | --- |
| `系统事实边界（只读 · system-boundary-v7）` | `回复要求` with a short note such as `由平台统一设置，当前不可编辑` |
| `班级初始提示词（class-dragon2-v4）` | `班级回复风格` |
| `三级继承 / 系统边界始终生效` | Omit it, or show `当前使用平台统一规则` only when the user needs that fact |
| `本页面用于演示班级配置流程` | Omit it; describe the flow in the page PRD |
| `模拟空状态 / 接口待接入` | `暂无班级` and a real next action such as `新建班级` |
| `保存失败：API 500 / class_policy 写入异常` | `保存失败，请重试` or a confirmed recovery action |

This contract applies to all product UI included in the release. It does not prohibit precise technical language inside PRD, source code, or developer diagnostics excluded from the product surface. If the confirmed product itself targets developers, retain only technical terms required for their product task; internal build IDs, prompt IDs, review annotations, and unresolved implementation notes still require explicit product justification.

## Product Documentation Contract

Page documents are product alignment artifacts for product, design, engineering, and Agents. They must explain user intent and deterministic behavior rather than repeat the visible UI or export metadata.

Required sections are: `页面定位`, `使用场景`, `前置条件`, `页面内容`, `交互规则`, `业务规则`, `状态与异常`, `数据影响`, `产品验收`, and `非本期范围`.

Write each acceptance scenario in this Chinese format:

```md
### 验收场景 1：主流程

- 前提：用户和系统已经处于什么状态。
- 操作：用户执行什么明确操作。
- 预期：系统产生什么可观察、可判断的结果。
```

Do not use vague results such as “works correctly” or “displays normally”. Do not put component names, `initialScreen`, React sources, static-export checks, device-shell stability, or source paths in the PRD body. If permissions, money, account state, synchronization scope, or exception behavior is unknown, ask the product owner instead of inventing a rule.

The validator reports missing sections, non-Chinese acceptance fields, unfinished placeholders, and technical-only headings as product-document warnings. Existing projects remain upload-compatible by default; release pipelines should use `--warnings-as-errors` when product-document compliance is mandatory.

## React / Vue Recommended Build

For framework pages, configure the final build so the page can be opened as a static file by ProtoDock. A good target is:

```text
pages/home/
├── index.html
└── assets/
    ├── index.css
    └── index.js
```

For maximum reliability in v1, prefer bundling each page with no dynamic chunk imports. Inline or local relative assets are best.

Use plain file paths in final HTML and CSS, for example `./admin.js` and `./assets/app.4f83c1.css`. Do not use `./admin.js?v=1.1.2`; browser query strings do not identify files in File System Access mode.

The build output must include the JavaScript required by the prototype. `renderToStaticMarkup`, copied `outerHTML`, screenshots, or HTML-only exports are insufficient when the source page contains interactions.

For transitions between registered ProtoDock pages, annotate the triggering control explicitly:

```html
<button data-protodock-page="reader-character">查看角色</button>
<a href="protodock:parent-center">家长中心</a>
```

Framework code can also call `window.ProtoDockPreview?.navigate(pageId)`. Cross-origin entries can send `window.parent.postMessage({ type: 'protodock:navigate', pageId }, '*')`; ProtoDock accepts the message only from the active preview iframe and only for an existing manifest page.

For visit-history return behavior, use `<button data-protodock-back="home">返回</button>`. ProtoDock returns to the actual previously visited page and restores its query/hash state; `home` is used only when no visit history exists. The page must bind the click itself: call `window.ProtoDockPreview.back(fallbackPageId)` when available, otherwise call `window.parent.postMessage({ type: 'protodock:back', fallbackPageId }, '*')`. The reusable implementation is distributed with the Skill at `templates/protodock-back-bridge.js`; copy it into project assets and reference it from each page that declares the attribute.

Before delivery, produce a route table containing source page, visible control, declared target `pageId`, and target entry. Every cross-page control in a new or modified page must appear exactly once. A route that works only because ProtoDock recovered a legacy `window.location` request is still a validation failure.

## Manifest Responsibilities

Design agents may update:

- `pendingChanges` by appending one versionless item for the completed edit batch
- `changelog` only when preparing a final release artifact, using the exact publish version and merged pending descriptions
- `pages.<pageId>.title`
- `pages.<pageId>.kind`
- `pages.<pageId>.tag`
- `pages.<pageId>.sourceDir`
- `pages.<pageId>.entry`
- `pages.<pageId>.doc`

Design agents should not update:

- `canvas.nodes`
- `canvas.nodes[].x`
- `canvas.nodes[].y`
- `canvas.edges`
- `canvas.edges[].fromSide`
- `canvas.edges[].toSide`
- `canvas.notes`
- `canvas.groups`

Those fields belong to ProtoDock and product-flow editing. The default behavior is preserve canvas. Use an explicit reset or re-layout option, such as `--reset-canvas`, only when the user asks for it.

## Canvas Layout Quality

Canvas quality is part of the prototype deliverable:

- `pageCount` must equal the number of unique node `pageId` values.
- Every edge endpoint must exist; duplicate or dangling edges are invalid.
- Nodes must not overlap. Calculate layout from rendered node dimensions and keep approximately `120px` horizontal and `150px` vertical clear space between neighboring nodes.
- Re-layout uses a stable layered graph procedure: root-first vertical levels, barycenter ordering within each level, disconnected-component packing, then whole-group rectangle packing. It must not place all unreachable nodes in one wide row.
- Group bounds are derived from member nodes plus fixed padding. Outliers, excessive empty group area, overlapping group bounds, long edges, orphaned notes, and low canvas compactness must produce explicit warnings.
- Non-shared-endpoint edge crossings should be zero. Unavoidable crossings, tight spacing, and paths through unrelated nodes must produce explicit warnings.
- A layout tool may modify only `canvas`; it must preserve `pages`, `project.id`, and unknown fields.
- Layout must be previewed before confirmation. Group-local layout changes only that group's node coordinates; whole-canvas smart layout may change all node coordinates but must preserve node order, edges, anchors, groups, notes, and unknown fields. Upload must never trigger an automatic re-layout.

## Canvas Groups

`canvas.groups` is optional so manifests created before grouping support remain valid. Each group represents one business module and contains:

- a unique `id` and readable `title`;
- one `rootNodeId` that is also present in `nodeIds`;
- one or more unique node IDs;
- an optional persisted `collapsed` state for the left page list only; it never changes Canvas node or edge visibility.

A node may belong to at most one group. Group members and the root must reference existing canvas nodes. Agents must preserve existing groups by default and must not infer or rebuild group membership during a normal page export.

Group-level layout is explicit and local: preview it first, back up the manifest, then update only member node coordinates after user confirmation. Searching, collapsing, and selecting pages belong in the left list; they do not replace or hide the group’s internal tree or business edges on Canvas.

Adding groups to a legacy manifest is an explicit migration, not a routine export step. The Agent must validate and back up the existing manifest, derive a reviewable grouping proposal from page docs and key edges, and ask for confirmation when ownership or the root is ambiguous. Applying the proposal may add only `canvas.groups`; it must preserve pages, nodes, coordinates, edges, anchors, notes, ordering, and unknown fields. Group migration and layout changes must be separate operations.

## Page Sizing

Design pages for the project `devicePreset`:

- `iphone-portrait`: mobile / mini-program screens, rendered as an iPhone 14 Pro shell at `390 x 830`.
- `iphone-landscape`: horizontal mobile flows.
- `ipad-portrait`: tablet portrait.
- `ipad-landscape`: tablet landscape.
- `web-landscape`: desktop web.
- `web-portrait`: tall web pages.

Use responsive CSS for the target device viewport. ProtoDock renders the page at the real preset size first, then scales that viewport down inside the canvas node. For example, `iphone-portrait` pages should look correct at `390 x 830`; do not design for the small thumbnail size shown on the canvas.

When `project.safeAreaEnabled` is `true`, ProtoDock reserves `project.safeAreaTop` px above the page and `project.safeAreaBottom` px below the page before rendering inside the device shell. If those fields are missing, ProtoDock fills them from the selected device preset. Design static pages to remain usable when the top notch/status area and bottom gesture area are reserved.
