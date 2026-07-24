import { afterEach, describe, expect, it } from "bun:test";
import {
	ackNotification,
	acceptSuggestion,
	approveApproval,
	dismissSuggestion,
	getProactiveInbox,
	listApprovals,
	listNotifications,
	listQuests,
	markNotificationRead,
	openInChat,
	postFeedback,
	rejectApproval,
	subscribeLiveTheme,
} from "./bridge.ts";

// bridge.ts reads the host-installed `window.ryu` bridge and `document`. Neither
// exists under bun, so each test installs a fake on `globalThis` and tears it down
// after, keeping the "bridge absent" cases honest (no leftover global).

type Call = { method: string; args: unknown[] };

function fakeBridge(overrides: Record<string, unknown> = {}) {
	const calls: Call[] = [];
	const record =
		(method: string, ret: unknown) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			return ret;
		};
	const bridge = {
		context: null,
		approvals: {
			list: record("approvals.list", Promise.resolve([{ id: "a1" }])),
			approve: record("approvals.approve", Promise.resolve({ id: "a1" })),
			reject: record("approvals.reject", Promise.resolve({ id: "a1" })),
		},
		notifications: {
			list: record("notifications.list", Promise.resolve([{ id: "n1" }])),
			markRead: record("notifications.markRead", Promise.resolve(undefined)),
			ack: record("notifications.ack", Promise.resolve(true)),
		},
		suggestions: {
			list: record("suggestions.list", Promise.resolve([{ id: "s1" }])),
			feedback: record("suggestions.feedback", Promise.resolve(true)),
		},
		quests: {
			list: record("quests.list", Promise.resolve([{ id: "q1" }])),
			acceptSuggestion: record(
				"quests.acceptSuggestion",
				Promise.resolve({ id: "q1" })
			),
			dismissSuggestion: record(
				"quests.dismissSuggestion",
				Promise.resolve({ id: "q1" })
			),
		},
		shell: {
			openTab: record("shell.openTab", Promise.resolve(undefined)),
		},
		...overrides,
	};
	(globalThis as { window?: unknown }).window = { ryu: bridge };
	return { bridge, calls };
}

afterEach(() => {
	(globalThis as { window?: unknown }).window = undefined;
	(globalThis as { document?: unknown }).document = undefined;
});

describe("bridge guard", () => {
	it("throws the grant-hint error when window.ryu is absent", () => {
		(globalThis as { window?: unknown }).window = {};
		expect(() => listApprovals()).toThrow(
			"The inbox capability is not available for this app (grant approvals:crud)."
		);
	});

	it("throws when there is no window at all (SSR / bun default)", () => {
		(globalThis as { window?: unknown }).window = undefined;
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
			{ method: "approvals.approve", args: [{ id: "req-7", note: "looks good" }] },
		]);
		expect(result).toEqual({ id: "a1" });
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
		expect(list).toEqual([{ id: "a1" }]);
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
		expect(inbox).toEqual([{ id: "s1" }]);
	});

	it("postFeedback forwards the feedback request unchanged", async () => {
		const { calls } = fakeBridge();
		const req = { kind: "thumbs_down" as const, suggestion_type: "reminder" };
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
		expect(typeof dispose).toBe("function");
		expect(() => dispose()).not.toThrow();
	});

	it("returns a no-op disposer when there is no bridge at all", () => {
		(globalThis as { window?: unknown }).window = undefined;
		const dispose = subscribeLiveTheme();
		expect(typeof dispose).toBe("function");
		expect(() => dispose()).not.toThrow();
	});

	it("applies only `--`-prefixed string tokens as inline custom properties, skipping the rest", () => {
		const applied: Array<[string, string]> = [];
		(globalThis as { document?: unknown }).document = {
			documentElement: {
				style: {
					setProperty: (name: string, value: string) => {
						applied.push([name, value]);
					},
				},
			},
		};
		let disposed = false;
		fakeBridge({
			shell: {
				openTab: () => Promise.resolve(undefined),
				subscribeTheme: (opts: {
					onChange: (tokens: Record<string, unknown>) => void;
				}) => {
					// Fire immediately with a mix of valid and invalid tokens.
					opts.onChange({
						"--border": "#3f3f46",
						"--popover": "#18181b",
						// biome-ignore lint/style/useNamingConvention: intentionally non-`--` key to prove it's skipped.
						background: "should-be-ignored",
						"--numeric": 42 as unknown as string,
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
