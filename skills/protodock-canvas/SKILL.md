---
name: protodock-canvas
description: "Use when creating, updating, packaging, or troubleshooting a ProtoDock prototype project, including manifest pages, docs, assets, canvas state, ZIP uploads, and Agent collaboration."
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
7. Validate every declared page entry and document against the final project artifact.
8. When delivering a ZIP, validate the final ZIP after packaging, not only the source directory.

## Manifest Contract

- `project.id` is the only source of truth for project identity.
- Every `pages.<pageId>` record must declare a browser-readable static `entry` under `pages/`.
- Every page must declare a `doc` under `docs/`.
- Page resources must be self-contained or use project-relative assets.
- Do not use localhost URLs, local absolute paths, dev-server-only routes, or unavailable external runtime dependencies.
- React, Vue, Svelte, and other framework pages must be built into static artifacts before delivery.

## Canvas Rules

ProtoDock canvas layout is user-owned state.

- Never regenerate, normalize, replace, or reorder `canvas.nodes`, `canvas.edges`, or `canvas.notes` unless the user explicitly asks for canvas reset or re-layout.
- Preserve node coordinates, edge sides, anchors, notes, and unknown fields.
- When adding a page, append only the missing node or edge by `pageId` or node `id`.
- Coordinates may be negative. Do not add positive-only clamps.
- Export scripts must preserve canvas by default. Only an explicit option such as `--reset-canvas` may replace it.

## ProtoDock Upload Package Rules

Treat the final upload ZIP as a release artifact with a strict root contract.

1. The ZIP root must directly contain `protodock.project.json`, `pages/`, `docs/`, and `assets/` when assets exist.
2. Never wrap those files in a project-name, version, delivery, or `ProtoDock上传包` directory.
3. Generate the ProtoDock upload package separately from the full delivery package.
4. Use explicit names such as `campus-prototype-v1.1-protodock-upload.zip` and `campus-prototype-v1.1-full-release.zip`.
5. Never recommend the full delivery package for ProtoDock upload.

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

After packaging, extract the final ZIP into a new temporary directory and validate it against the manifest inside that extracted directory:

- `protodock.project.json` is directly at the extracted root;
- every `pages.*.entry` file exists;
- every `pages.*.doc` file exists;
- all manifest paths are relative to the extracted root;
- entries contain no localhost URL, local absolute path, or unavailable external dependency;
- the validated entry and document counts match the manifest page count.

Do not mark delivery complete until the extracted final upload ZIP passes. Source-directory-only validation does not count.

## Troubleshooting

For these symptoms, inspect the archive root and manifest paths before debugging individual pages:

- `document missing`;
- `NotFoundError`;
- `failed to check external manifest changes`;
- every page failing to preview at the same time.

Browser-extension errors, such as `Immersive Translate dynamic-i18n version mismatch`, are not ProtoDock page errors and must be diagnosed separately.

When maintaining the ProtoDock workbench itself, follow its repository `AGENTS.md` and run the project checks in addition to the prototype-package validation above.
