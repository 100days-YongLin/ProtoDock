---
name: protodock-canvas
description: "Use when creating, updating, organizing, packaging, or troubleshooting a ProtoDock prototype project, including project-directory cleanup, manifest pages, docs, assets, canvas state, legacy Canvas Groups migration, ZIP uploads, and Agent collaboration."
---

# ProtoDock Canvas

## Overview

ProtoDock is a visualization and orchestration workbench. It does not generate product pages itself. A design or coding Agent owns the static page artifacts, while ProtoDock reads the project manifest, previews those pages, and preserves product-manager-authored canvas state.

Use this skill when an Agent needs to create or update a ProtoDock prototype, add pages, maintain page documents, package a project for upload, or diagnose missing previews.

## Required Project Structure

Every prototype project must contain:

```text
protodock.project.json
pages/<page-id>/index.html
docs/<page-id>.md
assets/                         # optional
```

Before editing, read:

- the project `README.md` when present;
- `DESIGN_AGENT_CONTRACT.md` when present;
- `protodock.project.schema.json` when present;
- the current `protodock.project.json`;
- only the relevant files under `pages/`, `docs/`, and `assets/`.

## Agent Workflow

1. Inspect the current files and Git state before editing.
2. Confirm the affected page IDs and preserve unrelated project files.
3. Before modifying `protodock.project.json`, create `protodock/backups/protodock.project.<YYYYMMDD-HHMMSS>.json`. Stop if the backup fails.
4. Update pages and documents as durable source files, not browser-only state.
5. Merge manifest changes by field and page ID. Never regenerate the entire manifest when a scoped merge is sufficient.
6. Preserve all existing canvas layout data unless the user explicitly requests a reset or re-layout.
7. Before packaging, build a route table from every Canvas edge and every visible cross-page control. Each route must name its source page, control label, exact target `pageId`, and target entry. Add the explicit target to the page source now; do not leave it for upload-time inference.
8. Before packaging, open every modified page and its modal, drawer, expandable, empty, error, and success states at the manifest viewport. Complete the User-Facing UI Copy Purity audit and remove internal explanations or identifiers from rendered UI.
9. When delivering a ZIP, validate the final ZIP after packaging, not only the source directory.
10. Run `scripts/protodock-validate <project-root>` before packaging, then run the same command on the final ZIP. A non-zero exit code blocks delivery; do not hand the ZIP to the user or ask them to discover the error during upload.
11. After completing a batch of project edits, append one versionless `pendingChanges` item with an ISO 8601 timestamp and a concise description. Prefer the sections `用户体验`, `产品调整`, and `前后端逻辑`, and include only sections relevant to the change. This is an Agent writing convention, not a save, validation, or publishing gate. Do not invent a release version during normal editing. ProtoDock publishing merges all pending items into one `changelog` release entry using the version entered in the publish dialog, then clears `pendingChanges`.

## Local Project Root Contract

The editable project root is the only directory a user should open in ProtoDock and the only source directory an Agent should hand back for continued editing.

1. The directory opened by `打开本地项目` must directly contain `protodock.project.json`, `pages/`, `docs/`, and `assets/` when assets exist.
2. Every manifest `pages.*.entry` and `pages.*.doc` path must resolve relative to that same directory. A directory with a manifest but missing those declared files is invalid.
3. Keep the complete editable project at its stable source path. Do not create or recommend a partial `dist/`, `build/`, `release/`, `完整交付`, or `ProtoDock上传包` directory as the local project.
4. Do not generate `dist/` or a second nested ProtoDock project inside the editable project root. Release ZIPs are temporary publishing artifacts and must be created outside the project root or in an operating-system temporary directory.
5. Do not copy `protodock.project.json` into an outer delivery directory unless that directory also contains every declared page and document and is intentionally becoming the new complete editable project.
6. In the final response, label the exact path as `ProtoDock 本地打开目录` and point it to the editable project root. Label ZIPs separately as `发布 ZIP`; never describe a ZIP extraction parent or full delivery wrapper as a directory to open.
7. Before handing off a local directory, validate the directory itself and open one representative page from it. Before publishing, separately validate the final ZIP.

Required handoff wording:

```text
ProtoDock 本地打开目录：/absolute/path/to/complete-project
发布 ZIP：/outside/project/campus-prototype-v1.1-protodock-upload.zip
```

## Project Directory Standard

Keep one canonical copy of each artifact and separate published files, editable working files, and local scratch data:

```text
project-root/
├── protodock.project.json       # required, manifest and changelog authority
├── README.md                    # project-specific commands and source/output mapping
├── CHANGELOG.md                 # optional human-readable mirror
├── .gitignore
├── pages/                       # required published static entries
├── docs/                        # required published page PRDs
├── assets/                      # optional published shared assets
├── source/                      # optional editable source; may instead use one native root such as miniprogram/
├── scripts/                     # repeatable build, migration, and validation commands
├── tests/                       # automated tests
├── references/                  # active product/design references used for future edits
├── qa/                          # current acceptance evidence and reports
├── protodock/backups/           # local manifest safety backups
└── temps/                       # local-only legacy, experiments, and disposable artifacts
```

Native tool configuration such as `package.json`, lockfiles, `project.config.json`, `vite.config.*`, `.agents/`, or `.claude/` may remain at the root when its tool requires that location. Do not keep loose screenshots, dated backups, ZIPs, design experiments, or duplicate source trees at the root.

Directory rules:

1. `pages`, `docs`, `assets`, and `protodock.project.json` are the only ProtoDock publishing inputs. Working directories remain in Git when they are needed to continue editing but are not copied into the published project.
2. Use either `source/` or one ecosystem-native source root such as `src/`, `app/`, or `miniprogram/`. Never keep equivalent editable implementations in multiple roots without a documented generator relationship.
3. Put active visual references under `references/`; keep only current, reproducible acceptance evidence under `qa/`. Historical QA runs and superseded references belong in `temps/`.
4. Put timestamped manifest backups only under `protodock/backups/`; do not leave `.bak`, `.backup`, or dated manifest copies at the root.
5. `temps/` must be ignored by Git and excluded from build, validation, ZIP, public share, and GitHub delivery. No manifest path, HTML/CSS/JS import, package script, or tool configuration may reference it.
6. Add at least `protodock.local.json`, `temps/`, `protodock/backups/`, `.DS_Store`, `node_modules/`, caches, and logs to `.gitignore` when applicable.
7. Do not create `dist/`, `build/`, `exports/`, `release/`, or nested full-delivery trees inside the project. Publishing uses temporary storage outside the root.

### Legacy directory cleanup

When asked to organize an existing project, do not move files immediately:

1. Inventory root files and directory sizes, inspect Git status, and read manifest paths, package scripts, build configuration, HTML/CSS/JS references, and project documentation.
2. Produce a dry-run classification: `keep`, `move to standard directory`, `move to temps`, and `needs owner decision`. Explain every root-level move.
3. Treat a file as active when it is referenced by the manifest, source, build scripts, tests, configuration, README workflow, or current QA process. Never classify it as unused only because ProtoDock does not publish it.
4. After approval, preserve relative paths when moving disposable material into `temps/<YYYYMMDD>-cleanup/<original-path>` so recovery is straightforward.
5. Do not move tracked obsolete files into ignored `temps/` as a substitute for Git deletion. Confirm they are obsolete, then remove them in a normal reviewable commit; Git history is the archive.
6. Re-run the project build, directory validation, representative browser interactions, and final ZIP validation after cleanup. Compare manifest page/node/edge/group counts before and after.

## Git Delivery Contract

ProtoDock may use two directories with different ownership:

- The editable project source directory is where an Agent updates `pages`, `docs`, `assets`, and the manifest.
- The server-managed Git delivery workspace is a persistent clone used only by ProtoDock publishing. Never ask users or Agents to edit it manually, copy ad hoc files into it, or treat it as a second source of truth.

For new Git-backed deliveries:

1. One product has one long-lived branch named `project/<product>`.
2. Each accepted release creates an immutable tag named `release/<product>/<version>`.
3. A feature branch, when needed for collaboration, is short-lived and named `feat/<product>-<feature>`; merge it into the product branch and delete it after acceptance.
4. A version must not be represented by a new permanent orphan branch. Do not use `product/version` branches for new deliveries.
5. Never force-push the product branch and never move, delete, or overwrite a published release tag.
6. Re-publishing the same version is allowed only when its files resolve to the same commit. Changed content requires a new version and a new changelog item.
7. Before delivery, review the file-level Git diff produced from the final validated artifact. A release commit must contain the prototype, affected PRD files, and changelog entry together.
8. Old version branches remain readable for compatibility. Migrating their history is an explicit later task; normal page edits or publishing must not rewrite them.

### Function-scoped PRD updates

Treat a feature change as a coherent documentation unit, even though the durable PRD source remains the page Markdown files.

1. Identify the owning Canvas group or business module and list every affected page before editing.
2. Update all affected `docs/<page-id>.md` files for the feature flow, including entry, result, failure, empty, permission, and return behavior where applicable.
3. Keep unaffected page documents unchanged so Git diff expresses the real feature boundary.
4. Ensure cross-page rules agree across the involved documents; do not describe a multi-page feature in only its entry page.
5. Append one `pendingChanges` item that summarizes the feature with user-view bullets first and product-view bullets second. Several completed feature batches may accumulate before release.
6. Deliver the feature only when the final Git diff contains the required page artifacts, PRD changes, and pending change description together. A formal release must additionally contain the single merged `changelog` entry produced from the publish version.

## Manifest Contract

- `project.id` is the only source of truth for project identity.
- Every `pages.<pageId>` record must declare a browser-readable static `entry` under `pages/`.
- Every page must declare a `doc` under `docs/`.
- Page resources must be self-contained or use project-relative assets.
- Final static resource references must use plain project-relative paths. Do not append cache-busting query strings or fragments such as `admin.js?v=1.1.2`, `app.css?build=7`, or `icon.svg#preview`; ProtoDock's File System Access mode resolves real files, not URL variants.
- Do not use localhost URLs, local absolute paths, dev-server-only routes, or unavailable external runtime dependencies.
- React, Vue, Svelte, and other framework pages must be built into static artifacts before delivery.
- Top-level `pendingChanges` stores unreleased edit batches. Each item requires `changedAt` and `description` and must not contain a version.
- Top-level `changelog` is append-only formal release history. Each entry requires `version`, `changedAt`, and `description`; its final version must exactly match the ProtoDock publish version. Only publishing may turn accumulated pending changes into a release entry.
- Keep local integration secrets, including Feishu custom-bot Webhooks, only in optional `protodock.local.json`. Ensure it is ignored by Git and excluded from upload ZIPs, public shares, downloads, pages, docs, assets, and the manifest.
- “Static artifact” means deployable HTML/CSS/JS, not static DOM only. Preserve the source prototype’s click, input, scroll, modal, and state behavior; do not use server-rendered markup as the final entry when it strips event handlers.

## Changelog Writing Contract

Product-document changelog text is release communication, not an engineering diary.

1. Prefer this section order when the available changes support it: `用户体验：`, `产品调整：`, then `前后端逻辑：`. Put plain `- <change>` bullets under each included heading; do not repeat the heading name on every bullet.
2. Use `用户体验` for what a real role can now see, understand, complete, avoid, or recover from. Name the role when useful, such as parent, teacher, or administrator. Omit the section when the change has no user-visible effect.
3. Use `产品调整` for changed feature scope, workflow, state, permission, pricing, or business rules as product decisions. Omit the section when no product rule changed.
4. `前后端逻辑` is optional. Include it only when this release changes interaction state, validation, navigation, API behavior, data persistence, permission enforcement, synchronization, idempotency, or failure recovery. Describe observable contracts, not implementation files or code structure.
5. Keep one outcome or rule per bullet. Aim for 25-50 Chinese characters. A normal release often contains 4-7 bullets total, but this is a readability target rather than a validation limit. Each included section normally contains 1-3 bullets.
6. When several pending edit batches accumulate, synthesize them into a fresh release summary. Merge duplicate or closely related items and never concatenate every pending sentence into the final changelog.
7. Do not write a prose paragraph. Do not start with vague text such as “完成优化”“相关调整” or “若干问题修复”. State the actual outcome.
8. Do not put commit hashes, file paths, component names, build commands, validation counts, deployment status, page/node/edge counts, Canvas layout, viewport size, or other implementation evidence in the product changelog. Those belong in Git, QA evidence, or the engineering handoff.
9. Preserve older prose-form and `- 用户：` / `- 产品：` entries for compatibility. User-authored freeform text and partial sections must remain publishable; formatting issues may produce suggestions but must never block save, validation, packaging, or release. Never rewrite historical releases merely to change formatting.

### Release-summary synthesis

Before writing the final release description, perform this reduction pass:

1. Collect all candidate changes from Git diff, affected PRDs, and accumulated `pendingChanges`.
2. Classify each candidate as `user experience`, `product adjustment`, `frontend/backend contract`, or `engineering/QA evidence`.
3. Drop engineering and QA evidence from the product changelog. Do not mention project workspaces, PRD/resource completeness, generated design counts, page/node/group/edge counts, Canvas coordinates, viewport sizes, UAT pixel alignment, test totals, commits, branches, packaging, deployment, or “state unchanged”.
4. Merge candidates that describe the same capability. Summarize by business ability such as daily report, weekly report, role permissions, content configuration, or account switching, not by individual page or edit batch.
5. Keep only changes that materially affect what a role can do or how the product behaves. Baseline preservation, visual alignment, internal refactoring, and unchanged behavior are not release highlights unless they resolve a named user problem.
6. Write `用户体验` bullets with the real role and result, for example “学校管理员可按园所查看日报配置”, not “V1.1 保持 27 个页面”.
7. Write `产品调整` bullets as decisions and rules, for example “日报与周报统一使用分步配置和保存状态”, not “新增 9 个页面和 7 条连线”.
8. Write `前后端逻辑` bullets only for behavioral contracts, for example “保存成功后刷新周报状态，失败时保留已填写内容”, not “重构保存组件并新增接口”. Omit the section when no such contract changed.
9. Read the result as a product manager. If two bullets can be merged without losing a distinct product decision, merge them. If a bullet only proves that engineering work happened, delete it.

Bad release summary:

```text
用户体验：
- 36 个页面按新手任务重组
- Canvas 按 8 个业务分组清晰排列
产品调整：
- 新增 9 个页面、3 个分组和 7 条连线
前后端逻辑：
- 完成 1440×900 全量回归
```

Good release summary:

```text
用户体验：
- 管理员可在单页完成日报和周报配置，低频信息按需展开
- 学校管理员与教师登录后仅看到匹配的数据和管理能力
产品调整：
- 日报与周报统一使用分步配置、预览和保存状态
- 补充学校管理员与教师首页、导航范围和数据权限
前后端逻辑：
- 账号切换后跨页保持当前身份，权限异常时返回匹配入口
```

## Icon Asset Quality Contract

Iconography is part of the prototype deliverable and must not be replaced with convenient text glyphs.

1. Every UI element whose visual meaning is an icon must use a mature SVG icon from the project's existing design system or an established library such as Lucide, Material Symbols SVG, or Heroicons.
2. Do not use emoji, Unicode symbols, punctuation, letters, icon-font characters, or CSS-drawn approximations as substitutes for UI icons. Forbidden examples include `←`, `→`, `×`, `+`, `⋯`, `⚙`, `⌕`, `✓`, `★`, emoji, or a letter such as `i` when they visually represent back, next, close, add, more, settings, search, success, favorite, or info controls.
3. Textual operators or punctuation used as actual content are not icons. The rule applies when a character is styled, positioned, labelled, or clicked as a graphical control or status mark.
4. Prefer the icon set already used by the product. When none exists, choose one established SVG library and use it consistently across the project; do not mix unrelated stroke styles within one flow.
5. Use the library's original SVG path data. Do not redraw familiar icons by hand, approximate them with CSS borders, or invent a new symbol when a standard icon exists. Custom SVG is reserved for brand marks, product-specific objects, and domain concepts that established libraries do not provide.
6. Bundle SVG files inside the project, normally under `assets/icons/`, or inline trusted library SVG markup. Do not depend on emoji rendering, operating-system fonts, remote icon CDNs, or unavailable icon packages at runtime. All file references must satisfy the local static resource gate.
7. Icon-only controls require an accessible name through `aria-label` or equivalent. Decorative SVGs use `aria-hidden="true"`; `<img>` icons inside already-labelled controls use empty `alt` text.
8. Before delivery, visually inspect every new or modified page at the manifest viewport. Replace character-based pseudo-icons, verify missing SVGs do not leave blank controls, and confirm icon size, stroke weight, alignment, active state, and disabled state are consistent.

Acceptable:

```html
<button type="button" aria-label="返回" data-protodock-back="home">
  <img src="../../assets/icons/arrow-left.svg" alt="">
</button>
```

Rejected:

```html
<button type="button" aria-label="返回">←</button>
<button type="button" aria-label="设置">⚙</button>
```

## User-Facing UI Copy Purity Contract

The prototype must read like the real product for its intended role. It must not expose the Agent's reasoning or the system's implementation model.

1. Before adding visible copy, state the intended role and the task being completed. Keep only labels, required instructions, immediate consequences, actionable feedback, and product content that role needs.
2. Do not render implementation explanations, architecture boundaries, system or model policies, prompt-engineering notes, rule inheritance, data provenance, state-machine descriptions, acceptance annotations, fallback strategy, QA commentary, or design rationale.
3. Do not show internal identifiers, prompt keys, schema names, build markers, source names, or version suffixes in labels or helper text. Examples that block delivery include `system-boundary-v7`, `class-dragon2-v4`, internal `pageId` values, and labels such as `三级继承` used to explain implementation.
4. Put internal detail in `docs/<page-id>.md`, code comments, configuration metadata, `data-*` attributes, or developer-only diagnostics. Hiding it visually while leaving it accessible as ordinary product copy is not a fix.
5. When a real user must configure an AI-assisted behavior, translate the control into domain language. Prefer `回复要求`, `班级回复风格`, `适用场景`, and `恢复默认设置`; do not expose raw system prompts or policy hierarchy unless the product owner explicitly confirms that the target role manages them.
6. Helper copy should normally be one short, actionable sentence. Do not add prose panels that explain why the system behaves a certain way when the user cannot act on that explanation.
7. Audit rendered text after implementation, not only source strings. Open every modified modal, drawer, empty state, error state, success state, and expandable area at the manifest viewport. Read the interface from the intended role's perspective.
8. Any visible string that requires knowledge of ProtoDock, Agent instructions, source code, prompts, schemas, internal inheritance, or internal versioning is a delivery-blocking issue. Remove or rewrite it before screenshots, ZIP validation, or handoff.

Examples:

| Rejected visible copy | Preferred user-facing copy |
| --- | --- |
| `系统事实边界（只读 · system-boundary-v7）` | `回复要求` and, when needed, `由平台统一设置，当前不可编辑` |
| `班级初始提示词（class-dragon2-v4）` | `班级回复风格` |
| `三级继承 / 系统边界始终生效` | Omit it, or use `当前使用平台统一规则` only when that fact affects the user's decision |

This rule applies to rendered product UI. Precise technical terminology remains appropriate in PRD, source code, and developer-only diagnostics. If the product itself targets developers, retain only terms that are part of their confirmed product task; internal build and prompt IDs still require explicit product justification.

## Product Documentation Contract

Treat every `docs/<page-id>.md` as a product alignment artifact for product, design, engineering, and Agents. It must explain user intent, deterministic behavior, business rules, states, and observable acceptance results. It is not an export report or source-code inventory.

Every new or modified page document must contain these sections:

```text
页面定位
使用场景
前置条件
页面内容
交互规则
业务规则
状态与异常
数据影响
产品验收
非本期范围
```

Write acceptance scenarios with Chinese labels rather than English Given/When/Then:

```md
### 验收场景 1：主流程

- 前提：用户、账户、数据和业务所处状态。
- 操作：用户执行的明确操作。
- 预期：可观察、可判断的页面、状态、数据或提示结果。
```

- Start with the user problem and outcome, not a list of visible controls.
- State entry, action, feedback, destination, return behavior, data changes, and failure handling without ambiguity.
- Cover loading, empty, success, failure, permission, duplicate-action, and recovery states when relevant.
- Keep source paths, component names, `initialScreen`, framework details, static-export checks, and device-shell stability out of the PRD body. ProtoDock already exposes source metadata in the page-information view.
- Do not invent unknown permissions, account rules, prices, limits, synchronization scope, or exception behavior. Ask the product owner before completing the document or implementation.
- Product-document validation warnings include missing sections, missing `前提 / 操作 / 预期`, unfinished `请填写` placeholders, and technical-only headings. Existing projects remain compatible by default; use `--warnings-as-errors` when documentation compliance is a release gate.
- ProtoDock's `完整产品文档` view assembles page documents by Canvas group. Web presets use the executable page entry in an interactive iframe for online reading, while cached screenshots are reserved for print/PDF; mobile and tablet presets retain the device-framed screenshot layout. It is a review surface, not a second source file. Keep each `docs/<page-id>.md` complete and independently understandable; do not create a manually duplicated aggregate PRD that can drift from the page documents.

## Interactive Preview Contract

ProtoDock runs page entries in iframes in the right-side player and the public Share preview. A page’s own JavaScript must remain executable in both surfaces.

- Internal interactions stay inside the page and need no ProtoDock-specific code.
- Every control that moves to another manifest page must declare the exact target with `data-protodock-page="<pageId>"` or an anchor such as `href="protodock:<pageId>"`. This is required, not optional, for new or modified pages.
- A runtime may call `window.ProtoDockPreview?.navigate(pageId)` after load, or use `window.parent.postMessage({ type: 'protodock:navigate', pageId }, '*')`.
- A control that means “return to the previously visited page” must use `data-protodock-back`. It may set a fallback page ID, for example `data-protodock-back="home"`, for direct-entry cases with no visit history.
- `data-protodock-back` is declarative metadata, not an executable implementation. Every independent static page containing it must also ship a click bridge. The bridge must first call `window.ProtoDockPreview.back(fallbackPageId)` when available and otherwise send `window.parent.postMessage({ type: 'protodock:back', fallbackPageId }, '*')`. Depending only on ProtoDock host interception is forbidden for new or modified pages.
- Copy the installed `templates/protodock-back-bridge.js` into the project, normally as `assets/protodock-back-bridge.js`, and include it from every page that has a back control. A page at `pages/<page-id>/index.html` can use `<script src="../../assets/protodock-back-bridge.js"></script>`.
- Do not use `history.back()`, `history.go(-1)`, an empty icon button, or a fixed parent route as a substitute for visit-history back behavior. ProtoDock page transitions happen in the host player, not the iframe's browser history.
- Keep canvas edge labels aligned with visible control labels. Legacy static pages receive a navigation fallback only when one outgoing edge label matches one control exactly after normalization; never rely on fuzzy or positional guessing.
- Before delivery, smoke-test a key click, input or scroll interaction and one cross-page transition in both the canvas player and `/s/<share-id>`.

### Cross-page navigation gate

Treat navigation validation as a release-blocking check on the extracted final ZIP.

1. Build an index of every manifest `pageId`, `pages.*.entry`, and canvas node before scanning HTML.
2. Scan every page entry for cross-page controls, including anchors, `data-page`, `data-url`, `data-action` handlers, `window.location`, `location.href`, `location.assign`, and router calls.
3. Every cross-page control must carry an explicit ProtoDock target. Script-only navigation, legacy `data-page`, root-absolute `/pages/...` navigation, or reliance on edge-label fallback does not pass delivery validation for a new or modified page.
4. Every declared target must resolve to exactly one existing manifest page whose entry and document exist and whose canvas node is unique.
5. When a query parameter selects a business state that already has its own manifest page, target that state page directly. For example, a milk-history control should target its declared milk-history `pageId`, not a generic `record` page plus `?type=milk`.
6. Reject navigation targets containing `localhost`, `file://`, local absolute paths, undeclared entry paths, or paths that escape the ZIP root.
7. Produce a route table with source page, visible control, declared target page, and target entry. Ambiguous or unresolved rows are errors, not warnings.
8. Smoke-test at least one transition for every navigation mechanism used by the project in both the right-side player and public Share preview. Confirm the expected page content, not only the absence of a 404.
9. Scan controls labeled or identified as back/return. Every such control must declare `data-protodock-back` or use the back API/message.
10. For every page containing `data-protodock-back`, statically require executable click binding, selection or reading of the back attribute, a `ProtoDockPreview.back()` call, and a `protodock:back` postMessage fallback. The attribute alone is a release-blocking error. A recognized shared runtime script is valid only when its final ZIP file is present and contains all four capabilities.
11. Actually click a back control in the player and public Share preview. Test both history behavior (`source page -> second-level page -> back` returns to the real source with query/hash restored) and fallback behavior (direct entry to the second-level page returns to its declared fallback). DOM inspection or calling the back function directly is not an acceptance test.

Before packaging, resolve the specific error `仅依赖 Canvas 连线文案推断目标` at its reported HTML line:

```html
<!-- Canvas edge: state-schedule-empty-day -> schedule-history, label: 复用其他天 -->
<button data-protodock-page="schedule-history">复用其他天</button>
```

- Use the exact target page ID from `protodock.project.json`, not its title, entry path, node ID, or a guessed slug.
- Keep the page's executable click behavior; the attribute declares the host-level destination and does not replace the page's JavaScript.
- If the control only opens a modal, changes a filter, expands content, or updates local state, it is not cross-page navigation. Do not add a fake `data-protodock-page`; remove or rename the same-label Canvas edge instead.
- Re-run validation on the editable root immediately after the fix, then rebuild, re-extract, and validate the final ZIP. Upload is not the first validation step.

ProtoDock's runtime recovery for legacy pages is compatibility behavior only. It must not be used as evidence that a new delivery satisfies this gate.

### Local static resource gate

The same final artifact must run when opened as a local project and when served by public Share.

1. Scan every page entry for local `script[src]`, `link[href]`, image/source/media URLs, `srcset`, iframe resources, and stylesheet `url()`/`@import` references.
2. Local resource references must be project-relative and must resolve inside the final project root after URL decoding.
3. Do not use `?v=`, other query strings, or appended `#hash` fragments for cache invalidation in final build output. Use content-hashed filenames when cache invalidation is necessary.
4. Resolve HTML resource paths relative to the HTML entry and CSS `url()`/`@import` paths relative to the CSS file that declares them. Never use root-absolute `/assets/...` paths or guess `../` depth from a source/build directory.
5. Do not create project-local image/media URLs at runtime with `.src = "./..."`, generated `<img src>`, inline `background-image`, `document.currentScript.src`, or `import.meta.url`. Local previews execute rewritten scripts from blob URLs, so script-based URL bases differ from public Share. Put finite prototype assets in the original HTML/CSS, use CSS classes for dynamic states, or embed a data/blob URL.
6. Validate both the editable source directory and the re-extracted final ZIP with `scripts/protodock-validate`. Missing resources, query/hash suffixes, ambiguous runtime-generated paths, and script-URL bases are release-blocking.
7. Open the directory through ProtoDock's `打开本地项目` and confirm representative JavaScript, CSS, images, navigation bridge, and back bridge load without 404. Then repeat a representative interaction in public Share.

ProtoDock strips URL query/hash suffixes and observes dynamically inserted local media for legacy File System Access previews. This runtime tolerance does not make a new package compliant.

### Share resource failure diagnosis

Do not conflate package-path errors, browser-extension noise, and Share service availability failures.

1. Public Share reads published files from the ProtoDock server's local `shares/` directory. GitHub is used during publishing and version delivery; normal page and asset requests must not fetch Git objects or repository files on demand.
2. A stable `404` for one resource means the requested path or published file is missing. Inspect the exact request URL, final ZIP, manifest, HTML/CSS base path, and extracted server file.
3. Intermittent or burst-wide `503` responses, especially when the same URL later returns `200`, indicate that the proxy could not reach the Share service or the service exhausted connection capacity. Check the reverse-proxy response headers, server listener queue, process health, file-descriptor limits, concurrent PDF rendering, and service logs before changing project files.
4. Runtime-generated local asset paths remain a release-blocking portability error, but their presence alone does not prove the cause of a `503`. Missing or malformed paths normally produce deterministic `404` responses.
5. `establish connection. Receiving end does not exist.` is commonly emitted by a browser extension whose message receiver is absent. Treat it as unrelated unless its source URL belongs to ProtoDock or the prototype itself.
6. Reproduce failures with a cold public Share load, preserve failed request URLs and status codes, and compare a representative direct server request with the public proxy URL. Do not declare the package fixed merely because a later refresh returns `200`.
7. A Share deployment must provide sufficient request queue capacity, connection reuse, and browser caching for versioned assets. Large projects must not require viewers to choose between GitHub and the ProtoDock server at runtime.

## Canvas Rules

ProtoDock canvas layout is user-owned state.

- Never regenerate, normalize, replace, or reorder `canvas.nodes`, `canvas.edges`, or `canvas.notes` unless the user explicitly asks for canvas reset or re-layout.
- Preserve optional `canvas.groups`; groups are product-manager-owned business partitions, not page-generation output.
- Preserve node coordinates, edge sides, anchors, notes, and unknown fields.
- When adding a page, append only the missing node or edge by `pageId` or node `id`.
- Coordinates may be negative. Do not add positive-only clamps.
- Export scripts must preserve canvas by default. Only an explicit option such as `--reset-canvas` may replace it.

## Canvas Layout Quality Contract

Treat a readable canvas as part of delivery quality, not as optional decoration.

### Integrity

- Every manifest page must map to exactly one canvas node. The page count must equal the count of unique node `pageId` values.
- Reject missing page nodes, duplicate node IDs, duplicate page nodes, duplicate edges, dangling edges, nodes that reference unknown pages, and overlapping nodes.
- Every edge `from` and `to` must reference an existing node.

### Business grouping

- Divide the canvas by top-level business module. Keep each module entry, page states, and detail or result pages in the same local region.
- Prefer `module entry -> page state -> result/detail`. Never dump new pages at the bottom of the canvas or assign random coordinates.
- Do not draw global Tab or sidebar navigation across modules. Draw only key task-flow actions. When several actions reach the same target, keep the primary path on canvas and document secondary paths in the page Markdown.
- When `canvas.groups` exists, each group must have a unique `id`, readable `title`, a `rootNodeId` contained in `nodeIds`, and one or more existing node IDs. A node may belong to at most one group.
- Old manifests without `canvas.groups` are valid and must not be migrated unless the user creates groups.
- Page navigation belongs in the left page tree. Do not add group tabs or other duplicate navigation overlays on top of the Canvas.

### Legacy group migration

Treat adding groups to an older prototype as an explicit, scoped canvas migration. It is optional and must never happen during a normal page build, export, upload, or content update.

1. Read `protodock.project.json`, all page documents, page titles, and existing key edges. Do not infer business ownership from file names alone.
2. Validate the existing project before migration: every page has exactly one node, all edge endpoints exist, and there are no duplicate nodes, dangling edges, or missing entry/doc files.
3. Create the required timestamped manifest backup before writing. Stop if validation or backup fails.
4. Produce a grouping proposal containing each group title, root page/node, member page/node IDs, pages left ungrouped, and any uncertain assignments.
5. If group ownership or the main entry is genuinely ambiguous, ask the user to confirm the proposal before writing. Never guess; uncertain pages remain ungrouped.
6. Add only `canvas.groups`. Preserve `project`, `pages`, `canvas.nodes`, node coordinates, `canvas.edges`, anchors, `canvas.notes`, ordering, and unknown fields byte-for-byte where practical.
7. Give every group a unique ID and readable title. Its root must be an existing member node, a node may belong to at most one group, and migrated groups default to `collapsed: true` unless the user specifies otherwise.
8. Treat `group.collapsed` as a left-sidebar navigation preference only. It must never hide, merge, redirect, or remove Canvas nodes, edges, notes, or group bounds; the Canvas always renders page-level detail.
9. Re-open and validate the written manifest and final ZIP. Compare page, node, edge, and note counts and identities before and after migration; only `canvas.groups` may be newly introduced.

Do not combine group migration with re-layout. A later group-local layout remains a separate preview-and-confirm operation.

### Geometry and connections

- Keep the main task flow top-to-bottom and nodes at the same level left-to-right. Compute spacing from rendered node dimensions; use approximately `120px` horizontal clear space and `150px` vertical clear space instead of fixed origin-to-origin distances.
- State pages stay close to their owning entry and must not cross unrelated module regions. Negative coordinates are valid.
- Keep modal, drawer, confirmation, success, failure, and other secondary states adjacent to the page that opens them. Do not give a small overlay its own distant column.
- Split disconnected subflows into weakly connected components and pack them below the primary component. Never collect every unreachable node into one extremely wide final row.
- Derive each group frame from its member nodes plus fixed padding. A single outlier must not create a mostly empty group frame; move the outlier back into the local flow or leave an explicit validation warning.
- Use the nearest directionally sensible anchors: vertical flow prefers `bottom -> top`; same-level flow prefers `right -> left`.
- Non-shared-endpoint edge crossings should be zero. Edges must not pass through unrelated nodes or preview areas. Reduce non-core paths or split a crowded flow when a node has too many edges.

### Deterministic re-layout procedure

Use this procedure only after the user explicitly requests layout work:

1. Back up the manifest and record the pre-layout node, edge, group, and note identities.
2. Choose either one group or the whole canvas as the scope. Never mix a group migration with a re-layout.
3. For each group, start from `rootNodeId`, form weakly connected components, assign outgoing task steps to successive vertical layers, and keep reverse-only or cyclic members in the nearest reachable layer.
4. Order each layer with repeated predecessor/successor barycenter sweeps so important edges cross as little as possible. Stable manifest order is the tie-breaker.
5. Center sibling rows, pack disconnected components below the primary flow, then compute the minimum group rectangle from node bounds plus fixed padding.
6. For a whole-canvas layout, treat every completed group as one rectangle and use row/shelf packing in manifest group order. Put ungrouped nodes in a final compact region rather than scattering them around the canvas.
7. Preview before writing and report changed node count, group count, ungrouped count, disconnected component count, crossings, long edges, outliers, group overlaps, and compactness.
8. After confirmation, update only `canvas.nodes[].x/y`. Preserve node order, edges, anchors, groups, notes, pages, project identity, and unknown fields. Do not move notes automatically because the manifest does not declare note ownership.

### State protection and layout tools

- Normal build and export commands must not modify `canvas.nodes`, `canvas.edges`, or `canvas.notes`.
- Only an explicit `--relayout`, `--reset-canvas`, or direct user request may update canvas layout. Back up the manifest first and modify only `canvas`; preserve `pages`, `project.id`, and unknown fields.
- Layout automation must provide a preview before writing. Never silently re-layout during upload.
- Group layout may update only member node coordinates after preview and confirmation; it must not move nodes in other groups.
- Whole-canvas smart layout may update all node coordinates only after explicit preview confirmation. It must retain group membership and leave notes unchanged.

### Upload gate

Validate the final extracted ZIP and require: `pageCount === uniqueNodeCount`, zero duplicate or missing nodes, zero dangling or duplicate edges, zero node overlaps, valid edge endpoints, valid group IDs/members/root nodes, and all declared entry/doc files present.

Block upload for integrity failures. Report edge crossings, edges through unrelated nodes, insufficient spacing, outlier nodes, excessive group gaps, overlapping group bounds, oversized sparse groups, long edges, orphaned notes, and low canvas compactness as explicit layout warnings. Review `outlierNodeCount`, `excessiveGapCount`, `longEdgeCount`, `groupOverlapCount`, `oversizedGroupCount`, `noteOrphanCount`, `groupCompactness`, `minimumGroupCompactness`, and `canvasCompactness`; “every page previews” is not sufficient unless the canvas is also complete and readable.

## ProtoDock Upload Package Rules

Treat the final upload ZIP as a release artifact with a strict root contract.

1. The ZIP root must directly contain `protodock.project.json`, `pages/`, `docs/`, and `assets/` when assets exist.
2. Never wrap those files in a project-name, version, delivery, or `ProtoDock上传包` directory.
3. Generate the ProtoDock upload package separately from any full delivery package, outside the editable project root. Do not create a project-local `dist/` tree.
4. Use explicit names such as `campus-prototype-v1.1-protodock-upload.zip` and `campus-prototype-v1.1-full-release.zip`.
5. Never recommend the full delivery package for ProtoDock upload or local project opening.

Correct archive root:

```text
protodock.project.json
pages/login/index.html
docs/login.md
```

Invalid archive root:

```text
项目交付包/ProtoDock上传包/protodock.project.json
```

## Final ZIP Validation

Run the executable installed with this Skill, passing the final upload ZIP rather than its source directory:

```bash
<protodock-canvas-skill-directory>/scripts/protodock-validate ./campus-prototype-v1.1-protodock-upload.zip
```

When working inside the ProtoDock repository, the equivalent command is:

```bash
./scripts/protodock-validate ./campus-prototype-v1.1-protodock-upload.zip
```

Use `--json` when another Agent or CI job needs machine-readable output. Use `--warnings-as-errors` for release pipelines that require layout warnings to block delivery. Exit code `0` is required before delivery or upload.

After packaging, extract the final ZIP into a new temporary directory and validate it against the manifest inside that extracted directory:

- `protodock.project.json` is directly at the extracted root;
- every `pages.*.entry` file exists;
- every `pages.*.doc` file exists;
- all manifest paths are relative to the extracted root;
- entries contain no localhost URL, local absolute path, or unavailable external dependency;
- the validated entry and document counts match the manifest page count.
- `pendingChanges` is empty in the final release ZIP;
- `changelog` contains exactly one new merged release item for this publish, and its final version exactly matches the version entered in ProtoDock, with a valid timestamp and non-empty description;
- every cross-page control has an explicit, valid manifest target and no unresolved script-only or root-absolute navigation remains;
- every visible back control uses the ProtoDock back protocol; no `history.back()`, `history.go(-1)`, or unbound back icon remains;
- every icon-like control or status mark uses a bundled mature SVG; no emoji, Unicode glyph, punctuation, letter, icon-font character, or CSS approximation is used as a pseudo-icon;
- every page has exactly one node, all edge endpoints exist, and no nodes overlap;
- edge crossings, paths through unrelated nodes, tight spacing, outliers, excessive gaps, sparse oversized groups, overlapping group bounds, long edges, orphaned notes, and low compactness are surfaced as layout warnings.

Do not mark delivery complete until the extracted final upload ZIP passes the executable validator. Source-directory-only validation or a manually written checklist does not count.

## Troubleshooting

For these symptoms, inspect the archive root and manifest paths before debugging individual pages:

- `document missing`;
- `NotFoundError`;
- `failed to check external manifest changes`;
- every page failing to preview at the same time.

When only a clicked control fails, inspect the requested URL and the control's explicit ProtoDock target. A request such as `/pages/record/index.html?type=milk` outside the project/share prefix usually means the page used script-only or root-absolute navigation and failed the cross-page navigation gate.

Browser-extension errors, such as `Immersive Translate dynamic-i18n version mismatch`, are not ProtoDock page errors and must be diagnosed separately.

When maintaining the ProtoDock workbench itself, follow its repository `AGENTS.md` and run the project checks in addition to the prototype-package validation above.
