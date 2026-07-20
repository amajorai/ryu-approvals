// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect.
//
// The Inbox is a UNIFIED surface, so it needs three grants: `approvals:crud` (the
// approvals + notifications + Shadow-suggestion families), `quests:crud` (the quest
// task check-off — reusing the existing `quests.*` verbs the Quests app already
// ships), and `shell:integrate` (the generic shell-primitive lane — opening a chat
// tab and subscribing to the live host theme). Core / Shadow own the
// `/api/approvals/*`, `/api/notifications/*`, `/api/quests/*`, and Shadow `/proactive`
// + `/api/feedback` surfaces behind the data grants.
//
// Method return shapes mirror the desktop clients the host reuses verbatim (the host
// closures call `listApprovals`/`listNotifications`/`getProactiveInbox`/… and forward
// the parsed snake_case shapes), so `bridge.ts` re-declares the concrete types and
// casts these `unknown`s.
//
// MIGRATION (docs/renderer-host-slice-1.md): the "open in chat" action previously used
// a BESPOKE `suggestions.openInChat` host verb. It now goes through the generic,
// route-allowlisted `shell.openTab` — the same shell privilege a compiled-in panel gets
// from `useTabsContext().openTab`, now reachable from a decoupled companion.

/** Approvals + notifications + Shadow-suggestion families (grant `approvals:crud`). */
export interface RyuApprovals {
	/** GET /api/approvals — the pending + decided approval queue. */
	list(): Promise<unknown>;
	/** POST /api/approvals/:id/approve — approve a pending request. */
	approve(args: { id: string; note?: string }): Promise<unknown>;
	/** POST /api/approvals/:id/reject — reject a pending request. */
	reject(args: { id: string; note?: string }): Promise<unknown>;
}

export interface RyuNotifications {
	/** GET /api/notifications — the signed-in user's inbox rows (host resolves the
	 *  user id; the sandboxed frame has no session). */
	list(): Promise<unknown>;
	/** POST /api/notifications/:id/read — mark a notification read (idempotent). */
	markRead(args: { id: string }): Promise<void>;
	/** POST /api/notifications/:id/ack — acknowledge a HITL notify gate; resolves to
	 *  whether the ack resumed the suspended workflow run. */
	ack(args: { id: string }): Promise<unknown>;
}

export interface RyuSuggestions {
	/** GET /proactive (Shadow) — the proactive suggestion inbox (drops filtered). */
	list(): Promise<unknown>;
	/** POST /api/feedback (Shadow) — thumbs/dismiss feedback for a suggestion type. */
	feedback(args: {
		kind: "thumbs_up" | "thumbs_down" | "dismiss";
		suggestion_type: string;
	}): Promise<unknown>;
}

/** Quest task check-off (grant `quests:crud`) — reuses the existing Quests verbs. */
export interface RyuQuests {
	/** GET /api/quests — the quest list (filtered to open + pending-suggestion here). */
	list(): Promise<unknown>;
	/** POST /api/quests/:id/suggestion/accept — accept a detection suggestion. */
	acceptSuggestion(args: { id: string }): Promise<unknown>;
	/** POST /api/quests/:id/suggestion/dismiss — reject a detection suggestion. */
	dismissSuggestion(args: { id: string }): Promise<unknown>;
}

/** A disposable handle a streaming shell subscription returns. `dispose()` releases
 *  the subscription early; it is also torn down automatically on frame unmount. */
export interface RyuShellSubscription {
	dispose(): void;
}

/** The generic shell-primitive lane (grant `shell:integrate`). Only the subset this
 *  app uses is declared; the full surface is in `docs/renderer-host-slice-1.md`. */
export interface RyuShell {
	/** Open a shell tab at an ALLOWLISTED route, forwarding `openTab` options. The
	 *  host rejects any non-allowlisted destination (anti-phishing). */
	openTab(args: {
		path: string;
		title?: string;
		conversationId?: string;
		forceNew?: boolean;
		initialPrompt?: string;
	}): Promise<void>;
	/** Subscribe to the host's LIVE resolved theme tokens: `onChange` fires with the
	 *  current token map now and on every host theme change. */
	subscribeTheme(opts: {
		onChange: (tokens: Record<string, string>) => void;
	}): RyuShellSubscription;
}

export interface RyuBridge {
	context: { spaceId?: string; docId?: string } | null;
	approvals: RyuApprovals;
	notifications: RyuNotifications;
	suggestions: RyuSuggestions;
	quests: RyuQuests;
	shell: RyuShell;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
