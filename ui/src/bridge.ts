// The client layer the ported page's data hooks call. It mirrors the desktop
// clients the Inbox page composed — `lib/api/approvals.ts` (list/approve/reject),
// `lib/api/notifications.ts` (list/read/ack), `lib/api/quests.ts` (list + suggestion
// accept/dismiss), and `lib/api/shadow.ts` (getProactiveInbox/postFeedback) — with
// the SAME function names + return types, but every call goes over the `window.ryu`
// bridge instead of a direct `fetch`. There is no `target` (the host holds the node
// token; the sandboxed frame never sees it). Return shapes match the desktop clients
// verbatim because the host closures reuse those very clients.

import type { RyuBridge } from "./ryu.d.ts";
import {
	appIconTilesSchema,
	approvalListSchema,
	approvalSchema,
	feedbackSchema,
	notificationAckSchema,
	notificationListSchema,
	notificationSendSchema,
	proactiveListSchema,
	questListSchema,
	questSchema,
} from "./schemas.ts";
import type {
	AppNotification,
	ApprovalRequest,
	FeedbackRequest,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

function ryu(): RyuBridge {
	const b = globalThis.window?.ryu;
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
	return ryu()
		.approvals.list()
		.then((reply) => approvalListSchema.parse(reply));
}

/** POST /api/approvals/:id/approve — approve a pending request. */
export function approveApproval(
	id: string,
	note?: string
): Promise<ApprovalRequest> {
	return ryu()
		.approvals.approve({ id, note })
		.then((reply) => approvalSchema.parse(reply));
}

/** POST /api/approvals/:id/reject — reject a pending request. */
export function rejectApproval(
	id: string,
	note?: string
): Promise<ApprovalRequest> {
	return ryu()
		.approvals.reject({ id, note })
		.then((reply) => approvalSchema.parse(reply));
}

// --- Notifications ---

/** GET /api/notifications — the signed-in user's inbox rows (host resolves the id).
 *  `archived: true` returns the archive instead of the live inbox. */
export function listNotifications(args?: {
	archived?: boolean;
}): Promise<AppNotification[]> {
	return ryu()
		.notifications.list(args)
		.then((reply) => notificationListSchema.parse(reply));
}

/** Deliver one notification to a verified organization/team member. */
export function sendNotification(input: {
	body?: string;
	target_user_id: string;
	title: string;
}): Promise<{ notification_id: string; target_user_id: string }> {
	return ryu()
		.notifications.send(input)
		.then((reply) => {
			notificationSendSchema.parse(reply);
			return reply;
		});
}

/** POST /api/notifications/:id/read — mark a notification read (idempotent). */
export function markNotificationRead(id: string): Promise<void> {
	return ryu().notifications.markRead({ id });
}

/** POST /api/notifications/:id/ack — acknowledge a HITL notify gate; resolves to
 *  whether the ack resumed the suspended workflow run. */
export function ackNotification(id: string): Promise<boolean> {
	return ryu()
		.notifications.ack({ id })
		.then((reply) => notificationAckSchema.parse(reply));
}

/** POST /api/notifications/:id/archive — move a row to the archive (also marks it
 *  read). Idempotent. */
export function archiveNotification(id: string): Promise<void> {
	return ryu().notifications.archive({ id });
}

/** POST /api/notifications/:id/unarchive — restore a row to the live inbox. */
export function unarchiveNotification(id: string): Promise<void> {
	return ryu().notifications.unarchive({ id });
}

/** Resolve per-app icon tiles (`{ name, glyph, background }`) for the notification
 *  feed's distinct senders — inlined by the host so the frame can render the real
 *  icon despite its `img-src data: blob:` CSP. */
export function appIconTiles(
	appIds: string[]
): Promise<
	Record<string, { name: string; glyph: string; background: string | null }>
> {
	return ryu()
		.notifications.appIcons({ appIds })
		.then((reply) => appIconTilesSchema.parse(reply));
}

// --- Quests (task check-off subset) ---

/** GET /api/quests — the quest list. */
export function listQuests(): Promise<Quest[]> {
	return ryu()
		.quests.list()
		.then((reply) => questListSchema.parse(reply));
}

/** POST /api/quests/:id/suggestion/accept — accept a detection suggestion. */
export function acceptSuggestion(id: string): Promise<Quest> {
	return ryu()
		.quests.acceptSuggestion({ id })
		.then((reply) => questSchema.parse(reply));
}

/** POST /api/quests/:id/suggestion/dismiss — reject a detection suggestion. */
export function dismissSuggestion(id: string): Promise<Quest> {
	return ryu()
		.quests.dismissSuggestion({ id })
		.then((reply) => questSchema.parse(reply));
}

// --- Shadow proactive suggestions ---

/** GET /proactive (Shadow) — the proactive suggestion inbox (drops filtered). */
export function getProactiveInbox(): Promise<ProactiveSuggestion[]> {
	return ryu()
		.suggestions.list()
		.then((reply) => proactiveListSchema.parse(reply));
}

/** POST /api/feedback (Shadow) — thumbs/dismiss feedback for a suggestion type. */
export function postFeedback(req: FeedbackRequest): Promise<boolean> {
	return ryu()
		.suggestions.feedback(req)
		.then((reply) => feedbackSchema.parse(reply));
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

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";
