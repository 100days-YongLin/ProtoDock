---
name: protodock-canvas
description: "Use when creating, updating, packaging, or troubleshooting a ProtoDock prototype project, including manifest pages, docs, assets, canvas state, legacy Canvas Groups migration, ZIP uploads, and Agent collaboration."
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
- Group tabs are preview navigation only. They do not replace the group’s internal tree or business edges.

### Legacy group migration

Treat adding groups to an older prototype as an explicit, scoped canvas migration. It is optional and must never happen during a normal page build, export, upload, or content update.

1. Read `protodock.project.json`, all page documents, page titles, and existing key edges. Do not infer business ownership from file names alone.
2. Validate the existing project before migration: every page has exactly one node, all edge endpoints exist, and there are no duplicate nodes, dangling edges, or missing entry/doc files.
3. Create the required timestamped manifest backup before writing. Stop if validation or backup fails.
4. Produce a grouping proposal containing each group title, root page/node, member page/node IDs, pages left ungrouped, and any uncertain assignments.
5. If group ownership or the main entry is genuinely ambiguous, ask the user to confirm the proposal before writing. Never guess; uncertain pages remain ungrouped.
6. Add only `canvas.groups`. Preserve `project`, `pages`, `canvas.nodes`, node coordinates, `canvas.edges`, anchors, `canvas.notes`, ordering, and unknown fields byte-for-byte where practical.
7. Give every group a unique ID and readable title. Its root must be an existing member node, a node may belong to at most one group, and migrated groups default to `collapsed: true` unless the user specifies otherwise.
8. Re-open and validate the written manifest and final ZIP. Compare page, node, edge, and note counts and identities before and after migration; only `canvas.groups` may be newly introduced.

Do not combine group migration with re-layout. A later group-local layout remains a separate preview-and-confirm operation.

### Geometry and connections

- Keep nodes at the same level aligned in one direction with consistent spacing. Recommended origin spacing is `480-600px` horizontally and `600-700px` vertically.
- State pages stay close to their owning entry and must not cross unrelated module regions. Negative coordinates are valid.
- Use the nearest directionally sensible anchors: vertical flow prefers `bottom -> top`; same-level flow prefers `right -> left`.
- Non-shared-endpoint edge crossings should be zero. Edges must not pass through unrelated nodes or preview areas. Reduce non-core paths or split a crowded flow when a node has too many edges.

### State protection and layout tools

- Normal build and export commands must not modify `canvas.nodes`, `canvas.edges`, or `canvas.notes`.
- Only an explicit `--relayout`, `--reset-canvas`, or direct user request may update canvas layout. Back up the manifest first and modify only `canvas`; preserve `pages`, `project.id`, and unknown fields.
- Layout automation must provide a preview before writing. Never silently re-layout during upload.
- Group layout may update only member node coordinates after preview and confirmation; it must not move nodes in other groups.

### Upload gate

Validate the final extracted ZIP and require: `pageCount === uniqueNodeCount`, zero duplicate or missing nodes, zero dangling or duplicate edges, zero node overlaps, valid edge endpoints, valid group IDs/members/root nodes, and all declared entry/doc files present.

Block upload for integrity failures. Report edge crossings, edges through unrelated nodes, and insufficient spacing as explicit layout warnings. “Every page previews” is not sufficient unless the canvas is also complete and readable.

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
- every page has exactly one node, all edge endpoints exist, and no nodes overlap;
- edge crossings, paths through unrelated nodes, and tight spacing are surfaced as layout warnings.

Do not mark delivery complete until the extracted final upload ZIP passes. Source-directory-only validation does not count.

## Troubleshooting

For these symptoms, inspect the archive root and manifest paths before debugging individual pages:

- `document missing`;
- `NotFoundError`;
- `failed to check external manifest changes`;
- every page failing to preview at the same time.

Browser-extension errors, such as `Immersive Translate dynamic-i18n version mismatch`, are not ProtoDock page errors and must be diagnosed separately.

When maintaining the ProtoDock workbench itself, follow its repository `AGENTS.md` and run the project checks in addition to the prototype-package validation above.
