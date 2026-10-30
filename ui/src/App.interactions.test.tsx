import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { redactConnectSuggestionNotifications } from "@ryu/app-host/notification-privacy";
import type { Root } from "react-dom/client";
import { listApprovals } from "./bridge.ts";
import type { RyuBridge } from "./ryu.d.ts";
import type {
	AppNotification,
	ApprovalRequest,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

if (!GlobalRegistrator.isRegistered) {
	GlobalRegistrator.register();
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("./App.tsx");

const INITIAL_APPROVALS: [ApprovalRequest, ApprovalRequest] = [
	{
		created_at: "2026-09-28T10:00:00.000Z",
		id: "approval-approve",
		kind: "tool_call",
		risk_tags: ["writes-files"],
		status: "pending",
		summary: "The agent wants to update the release notes.",
		title: "Update release notes",
	},
	{
		created_at: "2026-09-28T10:01:00.000Z",
		id: "approval-reject",
		kind: "workflow_gate",
		risk_tags: ["external-send"],
		status: "pending",
		summary: "A campaign wants to send its reviewed draft.",
		title: "Send customer update",
	},
];

const INITIAL_NOTIFICATION: AppNotification = {
	ack_required: true,
	acked: false,
	body: "The workflow is waiting for your confirmation.",
	created_at: "2026-09-28T10:02:00.000Z",
	id: "notification-1",
	level: "warning",
	title: "Deployment is paused",
	user_id: "local-user",
};

const INITIAL_QUEST: Quest = {
	completion_condition: "",
	created_at: "2026-09-28T10:03:00.000Z",
	id: "quest-1",
	status: "open",
	suggestion: {
		confidence: 91,
		reason: "The release note was saved.",
		suggested_at: "2026-09-28T10:03:00.000Z",
	},
	title: "Review the release note",
	updated_at: "2026-09-28T10:03:00.000Z",
};
const SECOND_QUEST: Quest = {
	...INITIAL_QUEST,
	id: "quest-2",
	title: "Review the migration plan",
};

const INITIAL_SUGGESTION: ProactiveSuggestion = {
	body: "The same source has failed twice today.",
	confidence: 0.88,
	created_at: Date.now() / 1000,
	disposition: "inbox_only",
	id: "suggestion-1",
	metadata: {},
	suggestion_type: "follow_up",
	title: "Check the feed source",
};

interface MountedApp {
	container: HTMLDivElement;
	root: Root;
}

const mountedApps: MountedApp[] = [];

function installBridge(
	options: {
		failFirstApprovalList?: boolean;
		icons?: Record<
			string,
			{ background: string | null; glyph: string; name: string }
		>;
		notifications?: AppNotification[];
	} = {}
) {
	let approvals = INITIAL_APPROVALS.map((approval) => ({ ...approval }));
	let notifications = (options.notifications ?? [INITIAL_NOTIFICATION]).map(
		(notification) => ({ ...notification })
	);
	let quests = [{ ...INITIAL_QUEST }, { ...SECOND_QUEST }];
	let suggestions = [{ ...INITIAL_SUGGESTION }];
	let failApprovalList = options.failFirstApprovalList ?? false;
	const appIconRequests: string[][] = [];
	const queryCalls = {
		approvalLists: 0,
		appIconRequests,
		notificationLists: 0,
		questLists: 0,
		suggestionLists: 0,
	};
	const decisions: { id: string; note: string | undefined; status: string }[] =
		[];
	const notificationCalls: { id: string; action: string }[] = [];
	const questCalls: { id: string; action: string }[] = [];
	const feedbackCalls: { kind: string; suggestion_type: string }[] = [];
	const openedTabs: unknown[] = [];

	window.ryu = {
		approvals: {
			approve: async ({ id, note }) => {
				approvals = approvals.map((approval) =>
					approval.id === id
						? {
								...approval,
								decided_at: "2026-09-28T10:10:00.000Z",
								note,
								status: "approved",
							}
						: approval
				);
				decisions.push({ id, note, status: "approved" });
				const result = approvals.find((approval) => approval.id === id);
				if (!result) {
					throw new Error(`Missing fixture approval ${id}`);
				}
				return result;
			},
			list: async () => {
				queryCalls.approvalLists += 1;
				if (failApprovalList) {
					failApprovalList = false;
					throw new Error("The local approvals fixture failed once.");
				}
				return approvals;
			},
			reject: async ({ id, note }) => {
				approvals = approvals.map((approval) =>
					approval.id === id
						? {
								...approval,
								decided_at: "2026-09-28T10:11:00.000Z",
								note,
								status: "rejected",
							}
						: approval
				);
				decisions.push({ id, note, status: "rejected" });
				const result = approvals.find((approval) => approval.id === id);
				if (!result) {
					throw new Error(`Missing fixture approval ${id}`);
				}
				return result;
			},
		},
		context: null,
		notifications: {
			ack: async ({ id }) => {
				notificationCalls.push({ action: "ack", id });
				notifications = notifications.map((notification) =>
					notification.id === id
						? { ...notification, acked: true }
						: notification
				);
				return true;
			},
			appIcons: async ({ appIds }) => {
				queryCalls.appIconRequests.push(appIds);
				return Object.fromEntries(
					appIds.flatMap((id) =>
						options.icons?.[id] ? [[id, options.icons[id]]] : []
					)
				);
			},
			archive: async ({ id }) => {
				notificationCalls.push({ action: "archive", id });
				notifications = notifications.map((notification) =>
					notification.id === id
						? { ...notification, archived_at: "2026-09-28T10:12:00.000Z" }
						: notification
				);
			},
			list: async () => {
				queryCalls.notificationLists += 1;
				return notifications;
			},
			markRead: async ({ id }) => {
				notificationCalls.push({ action: "read", id });
				notifications = notifications.map((notification) =>
					notification.id === id
						? { ...notification, read_at: "2026-09-28T10:12:00.000Z" }
						: notification
				);
			},
			send: async () => ({
				notification_id: "sent-1",
				target_user_id: "local-user",
			}),
			unarchive: async ({ id }) => {
				notificationCalls.push({ action: "unarchive", id });
				notifications = notifications.map((notification) =>
					notification.id === id
						? { ...notification, archived_at: null }
						: notification
				);
			},
		},
		quests: {
			acceptSuggestion: async ({ id }) => {
				questCalls.push({ action: "accept", id });
				quests = quests.map((quest) =>
					quest.id === id ? { ...quest, status: "done" } : quest
				);
				const result = quests.find((quest) => quest.id === id);
				if (!result) {
					throw new Error(`Missing fixture quest ${id}`);
				}
				return result;
			},
			dismissSuggestion: async ({ id }) => {
				questCalls.push({ action: "dismiss", id });
				quests = quests.map((quest) =>
					quest.id === id ? { ...quest, suggestion: null } : quest
				);
				const result = quests.find((quest) => quest.id === id);
				if (!result) {
					throw new Error(`Missing fixture quest ${id}`);
				}
				return result;
			},
			list: async () => {
				queryCalls.questLists += 1;
				return quests;
			},
		},
		shell: {
			openTab: async (input) => {
				openedTabs.push(input);
			},
			subscribeTheme: () => ({ dispose: () => undefined }),
		},
		suggestions: {
			feedback: async ({ kind, suggestion_type }) => {
				feedbackCalls.push({ kind, suggestion_type });
				if (kind === "dismiss") {
					suggestions = [];
				}
				return true;
			},
			list: async () => {
				queryCalls.suggestionLists += 1;
				return suggestions;
			},
		},
	} satisfies RyuBridge;
	return {
		decisions,
		feedbackCalls,
		notificationCalls,
		openedTabs,
		queryCalls,
		questCalls,
	};
}

function installStreamingPrivacyBridge(initialValue: boolean) {
	let streamingActive = initialValue;
	const listeners = new Set<() => void>();
	Reflect.set(window, "__ryuStreamingPrivacy", {
		getSnapshot: () => streamingActive,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	});
	return {
		set(value: boolean) {
			if (streamingActive === value) {
				return;
			}
			streamingActive = value;
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mountApp(): Promise<HTMLDivElement> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mountedApps.push({ container, root });
	await act(async () => {
		root.render(<App />);
		await tick();
		await tick();
	});
	return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) =>
		candidate.textContent?.includes(text)
	);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Could not find button containing: ${text}`);
	}
	return button;
}

async function clickButton(
	container: HTMLElement,
	text: string
): Promise<void> {
	await act(async () => {
		findButton(container, text).click();
		await tick();
		await tick();
	});
}

async function clickButtonByLabel(
	container: HTMLElement,
	label: string
): Promise<void> {
	await act(async () => {
		const button = container.querySelector<HTMLButtonElement>(
			`button[aria-label="${label}"]`
		);
		if (!button) {
			throw new Error(`Could not find button with label: ${label}`);
		}
		button.click();
		await tick();
		await tick();
	});
}

afterEach(async () => {
	for (const { container, root } of mountedApps.splice(0)) {
		await act(async () => root.unmount());
		container.remove();
	}
	Reflect.set(window, "ryu", undefined);
	Reflect.set(window, "__ryuStreamingPrivacy", undefined);
});

describe("Inbox rendered decision workflows", () => {
	test("acknowledged decision survives a refused refresh and Retry reads the durable outcome", async () => {
		const bridge = installBridge();
		const capability = window.ryu?.approvals;
		if (!capability) {
			throw new Error("Approvals fixture missing");
		}
		const originalApprove = capability.approve;
		const originalList = capability.list;
		let refuseRefresh = false;
		let effectiveTransitions = 0;
		const attempts: string[] = [];
		capability.approve = async (input) => {
			attempts.push(input.id);
			const current = await listApprovals();
			const record = current.find((item) => item.id === input.id);
			if (!record) {
				throw new Error("Unknown approval");
			}
			// Mirror the server's pending-only transition: a repeat decision cannot
			// mutate an already acknowledged durable record.
			if (record.status !== "pending") {
				throw new Error("Approval already decided");
			}
			const result = await originalApprove(input);
			effectiveTransitions += 1;
			refuseRefresh = true;
			return result;
		};
		capability.list = async () => {
			if (refuseRefresh) {
				refuseRefresh = false;
				throw new Error("Acknowledgement refresh unavailable");
			}
			return originalList();
		};
		const container = await mountApp();
		await clickButton(container, "Approve");
		expect(container.textContent).toContain("Couldn't load approvals");
		expect(effectiveTransitions).toBe(1);
		expect(attempts).toEqual([INITIAL_APPROVALS[0].id]);
		await clickButton(container, "Retry");
		expect(container.textContent).not.toContain("Couldn't load approvals");
		expect(container.textContent).toContain(INITIAL_APPROVALS[1].title);
		const records = await listApprovals();
		expect(
			records.find((record) => record.id === INITIAL_APPROVALS[0].id)?.status
		).toBe("approved");
		expect(
			records.find((record) => record.id === INITIAL_APPROVALS[1].id)
		).toEqual(INITIAL_APPROVALS[1]);
		expect(bridge.decisions).toEqual([
			{ id: INITIAL_APPROVALS[0].id, note: undefined, status: "approved" },
		]);
		expect(effectiveTransitions).toBe(1);
		expect(attempts).toEqual([INITIAL_APPROVALS[0].id]);
	});

	test("a refused decision retains the pending record and explicit retry acknowledges it", async () => {
		const bridge = installBridge();
		const capability = window.ryu?.approvals;
		if (!capability) {
			throw new Error("Approvals fixture missing");
		}
		const original = capability.approve;
		const attempts: unknown[] = [];
		capability.approve = async (input) => {
			attempts.push(input);
			if (attempts.length === 1) {
				throw new Error("Decision refused by fixture");
			}
			return original(input);
		};
		const container = await mountApp();
		await clickButton(container, "Approve");
		expect(bridge.decisions).toEqual([]);
		expect(container.textContent).toContain(INITIAL_APPROVALS[0].title);
		expect(findButton(container, "Approve").disabled).toBe(false);
		await clickButton(container, "Approve");
		expect(attempts).toEqual([
			{ id: INITIAL_APPROVALS[0].id, note: undefined },
			{ id: INITIAL_APPROVALS[0].id, note: undefined },
		]);
		expect(bridge.decisions).toEqual([
			{ id: INITIAL_APPROVALS[0].id, note: undefined, status: "approved" },
		]);
		const records = await listApprovals();
		expect(
			records?.find((record) => record.id === INITIAL_APPROVALS[1].id)
		).toEqual(INITIAL_APPROVALS[1]);
		expect(
			records?.find((record) => record.id === INITIAL_APPROVALS[0].id)?.status
		).toBe("approved");
	});

	test("two pending rows remain guarded until each own acknowledgement", async () => {
		const bridge = installBridge();
		const capability = window.ryu?.approvals;
		if (!capability) {
			throw new Error("Approvals fixture missing");
		}
		const original = capability.approve;
		const releases = new Map<string, () => void>();
		const attempts: string[] = [];
		capability.approve = async (input) => {
			attempts.push(input.id);
			await new Promise<void>((resolve) => releases.set(input.id, resolve));
			return original(input);
		};
		const container = await mountApp();
		const buttons = [
			...container.querySelectorAll<HTMLButtonElement>("button"),
		].filter((button) => button.textContent?.trim() === "Approve");
		expect(buttons).toHaveLength(2);
		const [firstButton, secondButton] = buttons;
		if (!(firstButton && secondButton)) {
			throw new Error("Both approval row controls are required");
		}
		await act(async () => {
			firstButton.click();
			await tick();
		});
		await act(async () => {
			secondButton.click();
			await tick();
		});
		expect(buttons.every((button) => button.disabled)).toBe(true);
		await act(async () => {
			firstButton.click();
			secondButton.click();
			await tick();
		});
		expect(attempts).toEqual(INITIAL_APPROVALS.map((record) => record.id));
		expect(bridge.decisions).toEqual([]);
		await act(async () => {
			releases.get(INITIAL_APPROVALS[1].id)?.();
			await tick();
			await tick();
		});
		expect(findButton(container, "Approve").disabled).toBe(true);
		await act(async () => {
			releases.get(INITIAL_APPROVALS[0].id)?.();
			await tick();
			await tick();
		});
		expect(bridge.decisions.map((decision) => decision.id)).toEqual([
			INITIAL_APPROVALS[1].id,
			INITIAL_APPROVALS[0].id,
		]);
		expect(
			(await listApprovals()).every((record) => record.status === "approved")
		).toBe(true);
	});

	test("canonical Island Connect rows render generic cached fields only while Streaming", async () => {
		const connectRow = {
			ack_required: false,
			acked: false,
			body: "Private calendar event: customer acquisition review",
			created_at: "2026-09-28T10:02:00.000Z",
			id: "ntf_connect_fixture",
			level: "info",
			node_id: "private-node",
			read_at: null,
			source_app_id: "@ryu/island",
			title: "Sensitive connected-app event",
			user_id: "local-user",
			workflow_run_id: "private-run",
		} satisfies AppNotification;
		const ordinaryRow = {
			...INITIAL_NOTIFICATION,
			ack_required: false,
			body: "Ordinary workflow result remains visible.",
			id: "ntf_workflow_fixture",
		} satisfies AppNotification;
		const bridge = installBridge({
			icons: {
				"@ryu/island": {
					background: null,
					glyph: "data:image/svg+xml,%3Csvg/%3E",
					name: "Island",
				},
			},
			notifications: [connectRow, ordinaryRow],
		});
		const privacy = installStreamingPrivacyBridge(false);
		const container = await mountApp();

		expect(container.textContent).toContain(connectRow.title);
		expect(container.textContent).toContain(connectRow.body);
		expect(container.textContent).toContain("Island");
		expect(bridge.queryCalls.appIconRequests).toContainEqual(["@ryu/island"]);

		await act(async () => {
			privacy.set(true);
			await tick();
			await tick();
		});
		const [redacted] = redactConnectSuggestionNotifications([connectRow], true);
		expect(redacted).toMatchObject({
			node_id: null,
			workflow_run_id: null,
		});
		expect(container.textContent).toContain("Private connected-app activity");
		expect(container.textContent).toContain(
			"A connected-app event was hidden during Streaming. Review it in the source app when you’re ready."
		);
		expect(container.textContent).not.toContain(
			"Sensitive connected-app event"
		);
		expect(container.textContent).not.toContain("customer acquisition review");
		expect(container.textContent).toContain(ordinaryRow.title);
		expect(container.textContent).toContain(ordinaryRow.body);
		// The fixed producer attribution is intentionally retained; it does not
		// reveal a variable connected-app ID or the event contents.
		expect(container.textContent).toContain("Island");
		expect(container.querySelector('[aria-label="Island"]')).not.toBeNull();
		expect(connectRow.title).toBe("Sensitive connected-app event");
		expect(connectRow.body).toContain("customer acquisition review");

		await act(async () => {
			privacy.set(false);
			await tick();
		});
		expect(container.textContent).toContain(connectRow.title);
		expect(container.textContent).toContain(connectRow.body);
		expect(container.textContent).toContain("Island");
	});

	test("records approval decisions, marks and acknowledges notifications, and handles suggestions", async () => {
		const bridge = installBridge();
		const container = await mountApp();
		await clickButton(container, "Refresh");
		expect(bridge.queryCalls.approvalLists).toBeGreaterThanOrEqual(2);
		expect(bridge.queryCalls.notificationLists).toBeGreaterThanOrEqual(2);
		expect(bridge.queryCalls.questLists).toBeGreaterThanOrEqual(2);
		expect(bridge.queryCalls.suggestionLists).toBeGreaterThanOrEqual(2);
		expect(container.textContent).toContain("Update release notes");
		expect(container.textContent).toContain("Deployment is paused");
		expect(container.textContent).toContain("Review the release note");
		expect(container.textContent).toContain("Check the feed source");

		await clickButton(container, "Approve");
		await clickButton(container, "Reject");
		expect(bridge.decisions).toEqual([
			{ id: "approval-approve", note: undefined, status: "approved" },
			{ id: "approval-reject", note: undefined, status: "rejected" },
		]);
		expect(container.textContent).toContain("History · 2");
		expect(container.textContent).toContain("approved");
		expect(container.textContent).toContain("rejected");

		await clickButton(container, "Mark done");
		expect(container.textContent).not.toContain("Review the release note");
		await clickButton(container, "Not yet");
		expect(container.textContent).not.toContain("Review the migration plan");
		expect(bridge.questCalls).toEqual([
			{ action: "accept", id: "quest-1" },
			{ action: "dismiss", id: "quest-2" },
		]);

		await clickButton(container, "Unread");
		expect(container.textContent).toContain("Deployment is paused");

		await clickButton(container, "Deployment is paused");
		expect(container.textContent).toContain("You’re all caught up.");
		await clickButton(container, "All");
		await clickButton(container, "Ack");
		expect(bridge.notificationCalls).toEqual([
			{ action: "read", id: "notification-1" },
			{ action: "ack", id: "notification-1" },
		]);
		expect(container.textContent).toContain("Acknowledged");
		expect(
			[...container.querySelectorAll("button")].some(
				(button) => button.textContent?.trim() === "Ack"
			)
		).toBe(false);
		await clickButtonByLabel(container, "Archive");
		await clickButton(container, "Archived");
		expect(container.textContent).toContain("Deployment is paused");
		await act(async () => {
			const restore = container.querySelector<HTMLButtonElement>(
				'button[aria-label="Restore to inbox"]'
			);
			if (!restore) {
				throw new Error("Could not find the Restore to inbox control.");
			}
			restore.click();
			await tick();
			await tick();
		});
		expect(container.textContent).not.toContain("Deployment is paused");
		expect(bridge.notificationCalls).toEqual([
			{ action: "read", id: "notification-1" },
			{ action: "ack", id: "notification-1" },
			{ action: "archive", id: "notification-1" },
			{ action: "unarchive", id: "notification-1" },
		]);

		await clickButton(container, "Open in chat");
		expect(bridge.feedbackCalls).toContainEqual({
			kind: "thumbs_up",
			suggestion_type: "follow_up",
		});
		expect(bridge.openedTabs).toEqual([
			{
				forceNew: true,
				initialPrompt: "The same source has failed twice today.",
				path: "/chat",
				title: "Chat",
			},
		]);
		await clickButton(container, "Dismiss");
		expect(container.textContent).not.toContain("Check the feed source");
		expect(bridge.feedbackCalls).toContainEqual({
			kind: "dismiss",
			suggestion_type: "follow_up",
		});
	});

	test("Retry clears a transient approvals list error after the local bridge recovers", async () => {
		const bridge = installBridge({ failFirstApprovalList: true });
		const container = await mountApp();
		expect(container.textContent).toContain("Couldn't load approvals");
		await clickButton(container, "Retry");
		expect(bridge.queryCalls.approvalLists).toBe(2);
		expect(container.textContent).not.toContain("Couldn't load approvals");
	});
});
