// The Inbox (Approvals) companion root — the port of the desktop
// `pages/InboxPage.tsx`. A unified inbox: everything that wants a decision from the
// user, in one place — pending HITL approvals (approve/reject), per-user
// notifications (read + the workflow-resume ack gate), task completions the quest
// engine thinks are done (a yes/no check-off), and the softer proactive suggestions
// Shadow surfaces from screen activity.
//
// The desktop page composed four react-query-backed hooks (`useApprovals`,
// `useNotifications`, `useQuests`) + a `useQuery` over Shadow's proactive inbox, kept
// live by always-mounted SSE streams. Here the same four reads go over the
// `window.ryu` bridge (grants `approvals:crud` + `quests:crud`), each polling every
// 15s in the background plus a refetch after every mutation (the sandboxed frame
// holds no socket). The component tree below is a verbatim port; only the data layer
// (node/target/react-query → bridge) and the chat-open navigation (host verb)
// changed.

import {
	Cancel01Icon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	Notification01Icon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { useCallback, useState } from "react";
import { getProactiveInbox, openInChat, postFeedback } from "./bridge.ts";
import { useQuery } from "./query.ts";
import { useApprovals } from "./useApprovals.ts";
import { useNotifications } from "./useNotifications.ts";
import { useQuests } from "./useQuests.ts";
import type {
	AppNotification,
	ApprovalRequest,
	ApprovalStatus,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const REFETCH_MS = 30_000;
const PERCENT = 100;
const MS_PER_SECOND = 1000;

const KIND_LABEL: Record<ApprovalRequest["kind"], string> = {
	tool_call: "Action",
	workflow_gate: "Review step",
	scheduled_run: "Scheduled task",
	trigger_run: "Automatic task",
	skill_synthesis: "Learned skill",
	heal_fix: "Auto-fix",
};

// Friendly labels for the free-form suggestion category slugs Shadow emits.
const SUGGESTION_TYPE_LABEL: Record<string, string> = {
	action: "Action",
	reminder: "Reminder",
	follow_up: "Follow-up",
	note: "Note",
	summary: "Summary",
};

const WORD_SEPARATOR = /[_\s-]+/;

// Turn a machine slug (e.g. "follow_up") into friendly Title Case for display.
function suggestionTypeLabel(type: string): string {
	const known = SUGGESTION_TYPE_LABEL[type];
	if (known) {
		return known;
	}
	const words = type.split(WORD_SEPARATOR).filter(Boolean);
	if (words.length === 0) {
		return "Suggestion";
	}
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

const STATUS_VARIANT: Record<
	ApprovalStatus,
	"default" | "secondary" | "destructive" | "outline"
> = {
	pending: "default",
	approved: "secondary",
	rejected: "destructive",
	expired: "outline",
	cancelled: "outline",
};

function relativeTime(createdAtSeconds: number): string {
	const diffSec = Math.max(0, Math.round(Date.now() / 1000 - createdAtSeconds));
	if (diffSec < SECONDS_PER_MINUTE) {
		return "just now";
	}
	const minutes = Math.round(diffSec / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / MINUTES_PER_HOUR);
	if (hours < HOURS_PER_DAY) {
		return `${hours}h ago`;
	}
	return `${Math.round(hours / HOURS_PER_DAY)}d ago`;
}

// Quest suggestions carry an RFC3339 timestamp (suggested_at), not the epoch
// seconds Shadow uses, so parse to seconds before reusing relativeTime.
function relativeTimeIso(iso: string): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) {
		return "";
	}
	return relativeTime(ms / MS_PER_SECOND);
}

function prefillText(suggestion: ProactiveSuggestion): string {
	const body = suggestion.body?.trim() ?? "";
	return body.length > 0 ? body : suggestion.title;
}

export function App() {
	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

	const approvals = useApprovals();
	const pending = approvals.approvals.filter((a) => a.status === "pending");
	const history = approvals.approvals.filter((a) => a.status !== "pending");

	const notifications = useNotifications();
	const unreadNotifications = notifications.notifications.filter(
		(n) => !n.read_at
	).length;

	const quests = useQuests();
	// Only open quests the engine flagged as maybe-done (a pending check-off).
	const taskSuggestions = quests.quests.filter(
		(q) => q.status === "open" && q.suggestion
	);

	const { data, isLoading, refetch, isFetching } = useQuery({
		queryKey: ["proactive-inbox"],
		queryFn: () => getProactiveInbox(),
		refetchInterval: REFETCH_MS,
	});

	const handleOpen = useCallback((suggestion: ProactiveSuggestion) => {
		postFeedback({
			kind: "thumbs_up",
			suggestion_type: suggestion.suggestion_type,
		}).catch(() => undefined);
		openInChat(prefillText(suggestion)).catch(() => undefined);
	}, []);

	const handleDismiss = useCallback((suggestion: ProactiveSuggestion) => {
		postFeedback({
			kind: "dismiss",
			suggestion_type: suggestion.suggestion_type,
		}).catch(() => undefined);
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(suggestion.id);
			return next;
		});
	}, []);

	const handleRetryApprovals = useCallback(() => {
		approvals.refetch();
	}, [approvals]);

	const visible = (data ?? []).filter((s) => !dismissed.has(s.id));
	const approvalsFailed = !approvals.loading && approvals.error !== null;
	const hasApprovals =
		!approvals.loading && (pending.length > 0 || history.length > 0);
	const hasTasks = !quests.loading && taskSuggestions.length > 0;
	const hasSuggestions = !isLoading && visible.length > 0;
	const hasNotifications =
		!notifications.loading && notifications.notifications.length > 0;
	// A failed approvals load must not read as an empty inbox, so keep the empty
	// state suppressed while there is an unresolved error to surface.
	const allEmpty = !(
		approvals.loading ||
		quests.loading ||
		isLoading ||
		notifications.loading ||
		hasApprovals ||
		hasTasks ||
		hasSuggestions ||
		hasNotifications ||
		approvalsFailed
	);

	return (
		<div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
			<header className="flex items-center justify-between gap-3">
				<div>
					<h1 className="font-semibold text-xl">Inbox</h1>
					<p className="text-muted-foreground text-sm">
						Approvals, finished tasks, and suggestions from your activity.
					</p>
				</div>
				<Button
					disabled={isFetching}
					onClick={() => {
						void refetch();
					}}
					size="sm"
					variant="outline"
				>
					{isFetching ? "Refreshing…" : "Refresh"}
				</Button>
			</header>

			{allEmpty ? (
				<Empty className="py-10">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<HugeiconsIcon className="size-6" icon={Shield01Icon} />
						</EmptyMedia>
						<EmptyTitle>Inbox is empty</EmptyTitle>
						<EmptyDescription>
							Approvals, finished tasks, and proactive suggestions from Ryu will
							appear here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{/* Approvals section */}
			{approvals.loading || hasApprovals || approvalsFailed ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Approvals
						</h2>
						{pending.length > 0 ? (
							<Badge variant="default">{pending.length} pending</Badge>
						) : null}
					</div>

					{approvals.loading ? (
						<div className="flex justify-center py-4">
							<Spinner className="size-5" />
						</div>
					) : null}

					{approvalsFailed ? (
						<div className="rounded-lg bg-card p-4">
							<p className="font-medium text-sm">Couldn't load approvals</p>
							<p className="mt-1 text-muted-foreground text-sm">
								Something went wrong reaching your approvals. Check your
								connection and try again.
							</p>
							<Button
								className="mt-3"
								onClick={handleRetryApprovals}
								size="sm"
								variant="outline"
							>
								Retry
							</Button>
						</div>
					) : null}

					{pending.length > 0 ? (
						<div className="flex flex-col gap-2">
							{pending.map((a) => (
								<PendingRow approvals={approvals} key={a.id} request={a} />
							))}
						</div>
					) : null}

					{history.length > 0 ? (
						<div className="flex flex-col gap-2">
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								History · {history.length}
							</p>
							{history.map((a) => (
								<HistoryRow key={a.id} request={a} />
							))}
						</div>
					) : null}
				</section>
			) : null}

			{/* Notifications section (per-user pings + HITL notify gates) */}
			{notifications.loading || hasNotifications ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Notifications
						</h2>
						{unreadNotifications > 0 ? (
							<Badge variant="default">{unreadNotifications} unread</Badge>
						) : null}
					</div>

					{notifications.loading ? (
						<div className="flex justify-center py-4">
							<Spinner className="size-5" />
						</div>
					) : null}

					{hasNotifications ? (
						<div className="flex flex-col gap-2">
							{notifications.notifications.map((n) => (
								<NotificationRow
									key={n.id}
									notification={n}
									notifications={notifications}
								/>
							))}
						</div>
					) : null}
				</section>
			) : null}

			{/* Task completions section (quest suggestions awaiting a check-off) */}
			{hasTasks ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Tasks
						</h2>
						<Badge variant="default">{taskSuggestions.length} to review</Badge>
					</div>
					<div className="flex flex-col gap-2">
						{taskSuggestions.map((q) => (
							<TaskRow key={q.id} quest={q} quests={quests} />
						))}
					</div>
				</section>
			) : null}

			{/* Suggestions section */}
			{isLoading || hasSuggestions ? (
				<section className="flex flex-col gap-3">
					<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Suggestions
					</h2>

					{isLoading ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : null}

					{hasSuggestions ? (
						<ul className="flex flex-col gap-3">
							{visible.map((suggestion) => (
								<li className="rounded-xl bg-card p-4" key={suggestion.id}>
									<p className="font-medium text-sm">{suggestion.title}</p>
									{suggestion.body ? (
										<p className="mt-1 text-muted-foreground text-sm">
											{suggestion.body}
										</p>
									) : null}
									<div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
										<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
											{suggestionTypeLabel(suggestion.suggestion_type)}
										</span>
										<span>{relativeTime(suggestion.created_at)}</span>
										<span>
											{Math.round(suggestion.confidence * PERCENT)}% match
										</span>
									</div>
									<div className="mt-3 flex items-center justify-end gap-2">
										<Button
											onClick={() => handleDismiss(suggestion)}
											size="sm"
											variant="ghost"
										>
											Dismiss
										</Button>
										<Button onClick={() => handleOpen(suggestion)} size="sm">
											Open in chat
										</Button>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</section>
			) : null}
		</div>
	);
}

function PendingRow({
	request,
	approvals,
}: {
	request: ApprovalRequest;
	approvals: ReturnType<typeof useApprovals>;
}) {
	const busy = approvals.deciding === request.id;
	return (
		<div className="rounded-lg bg-card">
			<div className="flex items-start justify-between gap-3 p-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-sm">{request.title}</p>
						<Badge variant="outline">{KIND_LABEL[request.kind]}</Badge>
					</div>
					<p className="mt-1 text-muted-foreground text-xs">
						{request.summary}
					</p>
					{request.risk_tags.length > 0 ? (
						<div className="mt-1.5 flex flex-wrap gap-1">
							{request.risk_tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						disabled={busy}
						onClick={() => approvals.approve(request.id)}
						size="sm"
					>
						{busy ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} />
						)}
						Approve
					</Button>
					<Button
						disabled={busy}
						onClick={() => approvals.reject(request.id)}
						size="sm"
						variant="ghost"
					>
						<HugeiconsIcon className="size-4" icon={Cancel01Icon} />
						Reject
					</Button>
				</div>
			</div>
		</div>
	);
}

// A quest the engine thinks is done, awaiting the user's yes/no. "Mark done"
// accepts the suggestion (completes the quest); "Not yet" dismisses it (the
// engine snoozes so it doesn't immediately re-suggest). Both mutate through the
// shared useQuests hook, whose success refetches the quest list so the row
// disappears; the 15s poll keeps the list live regardless.
function TaskRow({
	quest,
	quests,
}: {
	quest: Quest;
	quests: ReturnType<typeof useQuests>;
}) {
	const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
	const suggestion = quest.suggestion;
	if (!suggestion) {
		return null;
	}

	const act = (kind: "accept" | "dismiss") => {
		setBusy(kind);
		const done =
			kind === "accept"
				? quests.acceptSuggestion(quest.id)
				: quests.dismissSuggestion(quest.id);
		done
			.catch(() => undefined)
			.finally(() => {
				setBusy(null);
			});
	};

	return (
		<div className="rounded-lg bg-card">
			<div className="flex items-start justify-between gap-3 p-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-sm">{quest.title}</p>
						<Badge variant="outline">Task</Badge>
					</div>
					<p className="mt-1 text-muted-foreground text-xs">
						{suggestion.reason}
					</p>
					<div className="mt-1.5 flex items-center gap-2 text-muted-foreground text-xs">
						<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
							{suggestion.confidence}% sure
						</span>
						<span>{relativeTimeIso(suggestion.suggested_at)}</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						disabled={busy !== null}
						onClick={() => act("accept")}
						size="sm"
					>
						{busy === "accept" ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} />
						)}
						Mark done
					</Button>
					<Button
						disabled={busy !== null}
						onClick={() => act("dismiss")}
						size="sm"
						variant="ghost"
					>
						{busy === "dismiss" ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={Cancel01Icon} />
						)}
						Not yet
					</Button>
				</div>
			</div>
		</div>
	);
}

const NOTIFICATION_LEVEL_VARIANT: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	error: "destructive",
	warning: "secondary",
	info: "outline",
	success: "outline",
};

// One inbox notification. Clicking an unread row marks it read (the "open"
// action). A HITL notify gate (ack_required && !acked) also shows an Ack button
// that resumes the suspended workflow run once the gate policy is met; both
// mutate through the shared useNotifications hook, whose success refetches the
// notifications list so the row updates. The 15s poll keeps the list live.
function NotificationRow({
	notification,
	notifications,
}: {
	notification: AppNotification;
	notifications: ReturnType<typeof useNotifications>;
}) {
	const unread = !notification.read_at;
	const showAck = notification.ack_required && !notification.acked;
	const acking = notifications.acking === notification.id;
	const levelVariant =
		NOTIFICATION_LEVEL_VARIANT[notification.level] ?? "outline";

	const handleOpen = () => {
		if (unread) {
			notifications.markRead(notification.id).catch(() => undefined);
		}
	};

	return (
		<div className={`rounded-lg bg-card ${unread ? "" : "opacity-70"}`}>
			<div className="flex items-start justify-between gap-3 p-3">
				<button
					className="min-w-0 flex-1 text-left"
					onClick={handleOpen}
					type="button"
				>
					<div className="flex items-center gap-2">
						{unread ? (
							<span
								aria-label="Unread"
								className="size-1.5 shrink-0 rounded-full bg-primary"
							/>
						) : null}
						<p className="truncate font-medium text-sm">{notification.title}</p>
						<Badge variant={levelVariant}>{notification.level}</Badge>
					</div>
					{notification.body ? (
						<p className="mt-1 text-muted-foreground text-xs">
							{notification.body}
						</p>
					) : null}
					<div className="mt-1.5 flex items-center gap-2 text-muted-foreground text-xs">
						<span>{relativeTimeIso(notification.created_at)}</span>
						{notification.acked ? <span>Acknowledged</span> : null}
					</div>
				</button>
				{showAck ? (
					<Button
						className="shrink-0"
						disabled={acking}
						onClick={() => {
							notifications.ack(notification.id).catch(() => undefined);
						}}
						size="sm"
					>
						{acking ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={Notification01Icon} />
						)}
						Ack
					</Button>
				) : null}
			</div>
		</div>
	);
}

function HistoryRow({ request }: { request: ApprovalRequest }) {
	const icon =
		request.status === "approved" ? CheckmarkCircle02Icon : Cancel01Icon;
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg bg-card/50 p-3">
			<div className="flex min-w-0 items-center gap-2">
				<HugeiconsIcon
					className="size-4 shrink-0 text-muted-foreground"
					icon={request.status === "expired" ? Clock01Icon : icon}
				/>
				<div className="min-w-0">
					<p className="truncate text-muted-foreground text-sm">
						{request.title}
					</p>
					{request.note ? (
						<p className="truncate text-muted-foreground text-xs">
							{request.note}
						</p>
					) : null}
					{request.error ? (
						<p className="truncate text-destructive text-xs">
							Failed: {request.error}
						</p>
					) : null}
				</div>
			</div>
			<Badge variant={STATUS_VARIANT[request.status]}>{request.status}</Badge>
		</div>
	);
}
