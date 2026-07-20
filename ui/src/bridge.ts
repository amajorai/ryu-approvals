// The client layer the ported page's data hooks call. It mirrors the desktop
// clients the Inbox page composed — `lib/api/approvals.ts` (list/approve/reject),
// `lib/api/notifications.ts` (list/read/ack), `lib/api/quests.ts` (list + suggestion
// accept/dismiss), and `lib/api/shadow.ts` (getProactiveInbox/postFeedback) — with
// the SAME function names + return types, but every call goes over the `window.ryu`
// bridge instead of a direct `fetch`. There is no `target` (the host holds the node
// token; the sandboxed frame never sees it). Return shapes match the desktop clients
// verbatim because the host closures reuse those very clients.

import type { RyuBridge } from "./ryu.d.ts";
import type {
	ApprovalRequest,
	AppNotification,
	FeedbackRequest,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The inbox capability is not available for this app (grant approvals:crud)."
		);
	}
	return b;
}

// --- Approvals ---

/** GET /api/approvals — the pending + decided approval queue. */
export function listApprovals(): Promise<ApprovalRequest[]> {
	return ryu().approvals.list() as Promise<ApprovalRequest[]>;
}

/** POST /api/approvals/:id/approve — approve a pending request. */
export function approveApproval(
	id: string,
	note?: string
): Promise<ApprovalRequest> {
	return ryu().approvals.approve({ id, note }) as Promise<ApprovalRequest>;
}

/** POST /api/approvals/:id/reject — reject a pending request. */
export function rejectApproval(
	id: string,
	note?: string
): Promise<ApprovalRequest> {
	return ryu().approvals.reject({ id, note }) as Promise<ApprovalRequest>;
}

// --- Notifications ---

/** GET /api/notifications — the signed-in user's inbox rows (host resolves the id). */
export function listNotifications(): Promise<AppNotification[]> {
	return ryu().notifications.list() as Promise<AppNotification[]>;
}

/** POST /api/notifications/:id/read — mark a notification read (idempotent). */
export function markNotificationRead(id: string): Promise<void> {
	return ryu().notifications.markRead({ id });
}

/** POST /api/notifications/:id/ack — acknowledge a HITL notify gate; resolves to
 *  whether the ack resumed the suspended workflow run. */
export function ackNotification(id: string): Promise<boolean> {
	return ryu().notifications.ack({ id }) as Promise<boolean>;
}

// --- Quests (task check-off subset) ---

/** GET /api/quests — the quest list. */
export function listQuests(): Promise<Quest[]> {
	return ryu().quests.list() as Promise<Quest[]>;
}

/** POST /api/quests/:id/suggestion/accept — accept a detection suggestion. */
export function acceptSuggestion(id: string): Promise<Quest> {
	return ryu().quests.acceptSuggestion({ id }) as Promise<Quest>;
}

/** POST /api/quests/:id/suggestion/dismiss — reject a detection suggestion. */
export function dismissSuggestion(id: string): Promise<Quest> {
	return ryu().quests.dismissSuggestion({ id }) as Promise<Quest>;
}

// --- Shadow proactive suggestions ---

/** GET /proactive (Shadow) — the proactive suggestion inbox (drops filtered). */
export function getProactiveInbox(): Promise<ProactiveSuggestion[]> {
	return ryu().suggestions.list() as Promise<ProactiveSuggestion[]>;
}

/** POST /api/feedback (Shadow) — thumbs/dismiss feedback for a suggestion type. */
export function postFeedback(req: FeedbackRequest): Promise<boolean> {
	return ryu().suggestions.feedback(req) as Promise<boolean>;
}

/** Open the shell chat tab prefilled with a suggestion body through the GENERIC,
 *  route-allowlisted `shell.openTab` primitive (was the bespoke
 *  `suggestions.openInChat` verb; docs/renderer-host-slice-1.md). Behavior-identical:
 *  the host opens a NEW `/chat` tab seeded with this prompt (`forceNew` + `initialPrompt`
 *  preserved), the same call the old host verb made. */
export function openInChat(prompt: string): Promise<void> {
	return ryu().shell.openTab({
		path: "/chat",
		forceNew: true,
		initialPrompt: prompt,
		title: "Chat",
	});
}

/** Subscribe to the host's LIVE theme tokens and apply them as inline custom
 *  properties on `<html>` (inline style beats both the app's own `:root{}` defaults
 *  and the host's mount-time `html:root{}` injection), so the companion re-themes
 *  when the user toggles light/dark WITHOUT a remount. This is a NET-NEW shell
 *  privilege a decoupled companion had no path to before slice 1 (theme was a
 *  mount-time snapshot only). Returns a disposer. No-op if `shell` is unavailable. */
export function subscribeLiveTheme(): () => void {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	if (!bridge?.shell?.subscribeTheme) {
		return () => undefined;
	}
	const sub = bridge.shell.subscribeTheme({
		onChange: (tokens) => {
			const root = document.documentElement;
			for (const [name, value] of Object.entries(tokens)) {
				if (name.startsWith("--") && typeof value === "string") {
					root.style.setProperty(name, value);
				}
			}
		},
	});
	return () => sub.dispose();
}
