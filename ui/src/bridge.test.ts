import { afterEach, describe, expect, it } from "bun:test";
import {
	acceptSuggestion,
	ackNotification,
	appIconTiles,
	approveApproval,
	archiveNotification,
	dismissSuggestion,
	getProactiveInbox,
	listApprovals,
	listNotifications,
	listQuests,
	markNotificationRead,
	openInChat,
	postFeedback,
	rejectApproval,
	sendNotification,
	subscribeLiveTheme,
	unarchiveNotification,
} from "./bridge.ts";
import {
	approvalSchema,
	notificationSchema,
	proactiveSchema,
	questSchema,
} from "./schemas.ts";

// bridge.ts reads the host-installed `window.ryu` bridge and `document`. Neither
// exists under bun, so each test installs a fake on `globalThis` and tears it down
// after, keeping the "bridge absent" cases honest (no leftover global).

import type {
	RyuApprovals,
	RyuNotifications,
	RyuQuests,
	RyuShell,
	RyuSuggestions,
} from "./ryu.d.ts";
import type {
	AppNotification,
	ApprovalRequest,
	FeedbackRequest,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

type FixtureMethods = {
	[Key in keyof RyuApprovals as `approvals.${Key}`]: RyuApprovals[Key];
} & {
	[Key in keyof RyuNotifications as `notifications.${Key}`]: RyuNotifications[Key];
} & {
	[Key in keyof RyuQuests as `quests.${Key}`]: RyuQuests[Key];
} & {
	[Key in keyof RyuSuggestions as `suggestions.${Key}`]: RyuSuggestions[Key];
} & { "shell.openTab": RyuShell["openTab"] };
interface Call {
	args: Parameters<FixtureMethods[keyof FixtureMethods]>;
	method: keyof FixtureMethods;
}
interface ThemeFixtureOptions {
	onChange(tokens: Record<string, string | number>): void;
}
interface FixtureShell {
	openTab: RyuShell["openTab"];
	subscribeTheme?(opts: ThemeFixtureOptions): { dispose(): void };
}
interface FixtureOverrides {
	shell?: FixtureShell;
}
const approval: ApprovalRequest = {
	id: "a1",
	created_at: "",
	kind: "tool_call",
	risk_tags: [],
	status: "pending",
	summary: "Approval",
	title: "Approval",
};
const notification: AppNotification = {
	id: "n1",
	ack_required: false,
	acked: false,
	created_at: "",
	level: "info",
	title: "Notification",
	user_id: "user-1",
};
const quest: Quest = {
	id: "q1",
	completion_condition: "",
	created_at: "",
	status: "open",
	title: "Quest",
	updated_at: "",
};
const suggestion: ProactiveSuggestion = {
	id: "s1",
	body: null,
	confidence: 1,
	created_at: 0,
	disposition: "inbox_only",
	metadata: {},
	suggestion_type: "reminder",
	title: "Reminder",
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(
	globalThis,
	"document"
);
function installWindow(value?: {
	ryu?: ReturnType<typeof fakeBridge>["bridge"];
}) {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value,
	});
}
function fakeBridge(overrides: FixtureOverrides = {}) {
	const calls: Call[] = [];
	const record =
		<Method extends keyof FixtureMethods>(
			method: Method,
			ret: ReturnType<FixtureMethods[Method]>
		) =>
		(...args: Parameters<FixtureMethods[Method]>) => {
			calls.push({ method, args });
			return ret;
		};
	const bridge = {
		context: null,
		approvals: {
			list: record("approvals.list", Promise.resolve([approval])),
			approve: record("approvals.approve", Promise.resolve(approval)),
			reject: record("approvals.reject", Promise.resolve(approval)),
		},
		notifications: {
			list: record("notifications.list", Promise.resolve([notification])),
			send: record(
				"notifications.send",
				Promise.resolve({ notification_id: "n2", target_user_id: "user-2" })
			),
			markRead: record("notifications.markRead", Promise.resolve(undefined)),
			ack: record("notifications.ack", Promise.resolve(true)),
			archive: record("notifications.archive", Promise.resolve(undefined)),
			unarchive: record("notifications.unarchive", Promise.resolve(undefined)),
			appIcons: record(
				"notifications.appIcons",
				Promise.resolve({
					"@ryu/monitors": {
						glyph: "data:",
						background: null,
						name: "Monitors",
					},
				})
			),
		},
		suggestions: {
			list: record("suggestions.list", Promise.resolve([suggestion])),
			feedback: record("suggestions.feedback", Promise.resolve(true)),
		},
		quests: {
			list: record("quests.list", Promise.resolve([quest])),
			acceptSuggestion: record(
				"quests.acceptSuggestion",
				Promise.resolve(quest)
			),
			dismissSuggestion: record(
				"quests.dismissSuggestion",
				Promise.resolve(quest)
			),
		},
		shell: overrides.shell ?? {
			openTab: record("shell.openTab", Promise.resolve(undefined)),
		},
	};
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: { ryu: bridge },
	});
	return { bridge, calls };
}
afterEach(() => {
	if (originalWindow) {
		Object.defineProperty(globalThis, "window", originalWindow);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}
	if (originalDocument) {
		Object.defineProperty(globalThis, "document", originalDocument);
	} else {
		Reflect.deleteProperty(globalThis, "document");
	}
});

describe("bridge guard", () => {
	it("throws the grant-hint error when window.ryu is absent", () => {
		installWindow({});
		expect(() => listApprovals()).toThrow(
			"The inbox capability is not available for this app (grant approvals:crud)."
		);
	});

	it("throws when there is no window at all (SSR / bun default)", () => {
		installWindow();
		expect(() => listNotifications()).toThrow(
			/inbox capability is not available/
		);
	});
});

describe("approvals delegation", () => {
	it("forwards approve id+note as a single args object and returns the bridge value", async () => {
		const { calls } = fakeBridge();
		const result = await approveApproval("req-7", "looks good");
		expect(calls).toEqual([
			{
				method: "approvals.approve",
				args: [{ id: "req-7", note: "looks good" }],
			},
		]);
		expect(result).toBe(approval);
	});

	it("omits an undefined note but still wraps id in the args object", async () => {
		const { calls } = fakeBridge();
		await rejectApproval("req-9");
		expect(calls).toEqual([
			{ method: "approvals.reject", args: [{ id: "req-9", note: undefined }] },
		]);
	});

	it("list takes no args and returns the queue verbatim", async () => {
		const { calls } = fakeBridge();
		const list = await listApprovals();
		expect(calls).toEqual([{ method: "approvals.list", args: [] }]);
		expect(list).toEqual([approval]);
	});
});

describe("notifications delegation", () => {
	it("markRead forwards the id and resolves void", async () => {
		const { calls } = fakeBridge();
		await markNotificationRead("note-1");
		expect(calls).toEqual([
			{ method: "notifications.markRead", args: [{ id: "note-1" }] },
		]);
	});

	it("ack forwards the id and surfaces the boolean resume result", async () => {
		const { calls } = fakeBridge();
		const resumed = await ackNotification("note-2");
		expect(calls[0]).toEqual({
			method: "notifications.ack",
			args: [{ id: "note-2" }],
		});
		expect(resumed).toBe(true);
	});

	it("list passes an optional archived flag through to the host", async () => {
		const { calls } = fakeBridge();
		await listNotifications({ archived: true });
		expect(calls[0]).toEqual({
			method: "notifications.list",
			args: [{ archived: true }],
		});
		// The default live view passes nothing (host default).
		const live = fakeBridge();
		await listNotifications();
		expect(live.calls[0]).toEqual({
			method: "notifications.list",
			args: [undefined],
		});
	});

	it("archive and unarchive each forward the id", async () => {
		const { calls } = fakeBridge();
		await archiveNotification("note-3");
		await unarchiveNotification("note-3");
		expect(calls).toEqual([
			{ method: "notifications.archive", args: [{ id: "note-3" }] },
			{ method: "notifications.unarchive", args: [{ id: "note-3" }] },
		]);
	});

	it("appIcons forwards the requested app ids and returns the tile map", async () => {
		const { calls } = fakeBridge();
		const tiles = await appIconTiles(["@ryu/monitors"]);
		expect(calls[0]).toEqual({
			method: "notifications.appIcons",
			args: [{ appIds: ["@ryu/monitors"] }],
		});
		expect(tiles["@ryu/monitors"]?.name).toBe("Monitors");
	});

	it("send forwards a bounded targeted Inbox notification", async () => {
		const { calls } = fakeBridge();
		const result = await sendNotification({
			body: "Please review the latest message.",
			target_user_id: "user-2",
			title: "You were mentioned by Ada",
		});
		expect(calls.at(-1)).toEqual({
			method: "notifications.send",
			args: [
				{
					body: "Please review the latest message.",
					target_user_id: "user-2",
					title: "You were mentioned by Ada",
				},
			],
		});
		expect(result).toEqual({
			notification_id: "n2",
			target_user_id: "user-2",
		});
	});
});

describe("quests delegation", () => {
	it("accept and dismiss each wrap the quest id in an args object", async () => {
		const { calls } = fakeBridge();
		await acceptSuggestion("quest-a");
		await dismissSuggestion("quest-b");
		await listQuests();
		expect(calls).toEqual([
			{ method: "quests.acceptSuggestion", args: [{ id: "quest-a" }] },
			{ method: "quests.dismissSuggestion", args: [{ id: "quest-b" }] },
			{ method: "quests.list", args: [] },
		]);
	});
});

describe("shadow suggestions delegation", () => {
	it("getProactiveInbox reads suggestions.list", async () => {
		const { calls } = fakeBridge();
		const inbox = await getProactiveInbox();
		expect(calls).toEqual([{ method: "suggestions.list", args: [] }]);
		expect(inbox).toEqual([suggestion]);
	});

	it("postFeedback forwards the feedback request unchanged", async () => {
		const { calls } = fakeBridge();
		const req: FeedbackRequest = {
			kind: "thumbs_down",
			suggestion_type: "reminder",
		};
		await postFeedback(req);
		expect(calls).toEqual([{ method: "suggestions.feedback", args: [req] }]);
	});
});

describe("openInChat", () => {
	it("opens a fresh /chat tab seeded with the prompt (forceNew + initialPrompt)", async () => {
		const { calls } = fakeBridge();
		await openInChat("summarize my day");
		expect(calls).toEqual([
			{
				method: "shell.openTab",
				args: [
					{
						path: "/chat",
						forceNew: true,
						initialPrompt: "summarize my day",
						title: "Chat",
					},
				],
			},
		]);
	});
});

describe("subscribeLiveTheme", () => {
	it("returns a no-op disposer (does not throw) when shell.subscribeTheme is missing", () => {
		fakeBridge(); // shell has openTab but no subscribeTheme
		const dispose = subscribeLiveTheme();
		expect(() => dispose()).not.toThrow();
	});

	it("returns a no-op disposer when there is no bridge at all", () => {
		installWindow();
		const dispose = subscribeLiveTheme();
		expect(() => dispose()).not.toThrow();
	});

	it("applies only `--`-prefixed string tokens as inline custom properties, skipping the rest", () => {
		const applied: [string, string][] = [];
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			writable: true,
			value: {
				documentElement: {
					style: {
						setProperty: (name: string, value: string) => {
							applied.push([name, value]);
						},
					},
				},
			},
		});
		let disposed = false;
		fakeBridge({
			shell: {
				openTab: () => Promise.resolve(undefined),
				subscribeTheme: (opts: ThemeFixtureOptions) => {
					// Fire immediately with a mix of valid and invalid tokens.
					opts.onChange({
						"--border": "#3f3f46",
						"--popover": "#18181b",
						background: "should-be-ignored",
						"--numeric": 42,
					});
					return {
						dispose: () => {
							disposed = true;
						},
					};
				},
			},
		});

		const dispose = subscribeLiveTheme();

		// Only the two `--`-prefixed STRING tokens are applied; the bare key and the
		// numeric value are filtered out.
		expect(applied).toEqual([
			["--border", "#3f3f46"],
			["--popover", "#18181b"],
		]);

		dispose();
		expect(disposed).toBe(true);
	});
});

describe("complete Inbox readback contracts", () => {
	it("preserves approval identity, optional fields and future action metadata", () => {
		const input: ApprovalRequest = {
			...approval,
			action: {
				type: "workflow_resume",
				run_id: "run-1",
				context: { approved: true },
			},
			note: null,
		};
		expect(approvalSchema.parse(input)).toBe(input);
		expect(
			approvalSchema.safeParse({ ...input, status: "unexpected" }).success
		).toBe(false);
		expect(approvalSchema.safeParse({ id: "a1" }).success).toBe(false);
	});
	it("preserves legitimate own metadata keys and rejects non-JSON values", () => {
		const input: ProactiveSuggestion = {
			...suggestion,
			metadata: { ["__proto__"]: { source: "Core" }, category: "reminder" },
		};
		const parsed = proactiveSchema.parse(input);
		expect(parsed).toBe(input);
		expect(Object.hasOwn(parsed.metadata, "__proto__")).toBe(true);
		expect(
			proactiveSchema.safeParse({
				...input,
				metadata: { ["__proto__"]: () => undefined },
			}).success
		).toBe(false);
	});
	it("rejects malformed notification booleans and incomplete quests", () => {
		expect(notificationSchema.parse(notification)).toBe(notification);
		expect(
			notificationSchema.safeParse({ ...notification, acked: "false" }).success
		).toBe(false);
		expect(questSchema.parse(quest)).toBe(quest);
		expect(questSchema.safeParse({ id: "q1", title: "Quest" }).success).toBe(
			false
		);
	});
});

it("retains pending and decided tool calls alongside other approval rows", async () => {
	const { bridge } = fakeBridge();
	const rows: ApprovalRequest[] = [
		approval,
		...(["pending", "rejected"] as const).map((status) => ({
			...approval,
			id: status,
			status,
			action: { type: "tool_call" as const, tool_id: "run", arguments: {} },
		})),
	];
	bridge.approvals.list = () => Promise.resolve(rows);
	expect(await listApprovals()).toEqual(rows);
});
