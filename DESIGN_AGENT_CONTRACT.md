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
7. Do not change `canvas.nodes[].x`, `canvas.nodes[].y`, or `canvas.edges` unless the user asked you to change the flow.
8. Do not delete or overwrite user-authored pages, docs, or assets without explicit instruction.
9. Keep the project-level `devicePreset` consistent. v1 assumes one device shell per project.
10. Use `docs/<page-id>.md` for page intent, states, and acceptance notes.

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

- `canvas.nodes[].x`
- `canvas.nodes[].y`
- `canvas.edges`
- `canvas.notes`

Those fields belong to ProtoDock and product-flow editing.

## Page Sizing

Design pages for the project `devicePreset`:

- `iphone-portrait`: mobile / mini-program screens.
- `iphone-landscape`: horizontal mobile flows.
- `ipad-portrait`: tablet portrait.
- `ipad-landscape`: tablet landscape.
- `web-landscape`: desktop web.
- `web-portrait`: tall web pages.

Use responsive CSS. ProtoDock renders pages as thumbnails inside device shells on the canvas.
