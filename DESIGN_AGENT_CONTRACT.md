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

## Manifest Responsibilities

Design agents may update:

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
- Nodes must not overlap. Recommended origin spacing is `480-600px` horizontally and `600-700px` vertically.
- Non-shared-endpoint edge crossings should be zero. Unavoidable crossings, tight spacing, and paths through unrelated nodes must produce explicit warnings.
- A layout tool may modify only `canvas`; it must preserve `pages`, `project.id`, and unknown fields.
- Upload must never trigger an automatic re-layout.

## Canvas Groups

`canvas.groups` is optional so manifests created before grouping support remain valid. Each group represents one business module and contains:

- a unique `id` and readable `title`;
- one `rootNodeId` that is also present in `nodeIds`;
- one or more unique node IDs;
- an optional persisted `collapsed` state.

A node may belong to at most one group. Group members and the root must reference existing canvas nodes. Agents must preserve existing groups by default and must not infer or rebuild group membership during a normal page export.

Group-level layout is explicit and local: preview it first, back up the manifest, then update only member node coordinates after user confirmation. Focusing a group and switching its page tabs are viewing operations; they do not replace the group’s internal tree or business edges.

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
