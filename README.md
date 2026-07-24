# ryu-approvals

Approval inbox for Ryu — a human-in-the-loop queue where agent-proposed actions, edits, and fixes wait for your accept or reject before they take effect.

> **The public home of `ryu-approvals`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/approvals.ui.html`](./dist/approvals.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

# com.ryu.approvals — Inbox

The approval inbox: a **human-in-the-loop queue** where agent-proposed actions,
edits, and fixes (self-healing patches, learned skills, workflow steps) wait for
your accept or reject before they take effect. Also surfaces auto-detected quests
(todos) and node notifications.

## Parts

- **`ui/` — companion (companion-only app, no backend crate).** A sandboxed
  full-page Companion (Path B, `ui_format: "html"`), built to one self-contained
  `dist/index.html` via `vite-plugin-singlefile`. Its hooks (`useApprovals`,
  `useQuests`, `useNotifications`) drive Core's existing endpoints
  (`/api/approvals/*`, `/api/quests/*`) through the `window.ryu` bridge — no direct
  `fetch`, no node token in the sandbox.

There is no dedicated backend crate or sidecar: the HITL queue, quest detection, and
`ApprovalKind` handling (including the self-healing `HealFix` path) live in Core;
this app is only the surface.

## Manifest (`manifest.json`)

- **Capability grants:** `approvals:crud` and `quests:crud` — the two bridge
  capabilities the companion calls.
- **Runnable:** one `companion` (label **Inbox**, icon `shield-01`).

## Surfaces as

A companion route in the shell (label **Inbox**). It is the shared accept/reject
choke point that other apps (learning, healing, workflows) funnel proposals into.
